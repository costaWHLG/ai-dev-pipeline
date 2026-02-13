/**
 * 代码审查 Agent — 审查代码变更并给出结论
 *
 * 输入：diff + project context
 * 输出：review.json（status: APPROVE / NEEDS_WORK / BLOCK）
 */

import fs from "node:fs";
import path from "node:path";
import { BaseAgent } from "./base-agent.js";
import type { TaskType } from "../llm/providers.js";

/** 审查结论 */
export type ReviewStatus = "APPROVE" | "NEEDS_WORK" | "BLOCK";

/** 审查问题 */
export interface ReviewIssue {
  severity: "critical" | "major" | "minor";
  category: "security" | "logic" | "performance" | "style" | "test";
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
}

/** 审查结果 */
export interface ReviewResult {
  status: ReviewStatus;
  summary: string;
  issues: ReviewIssue[];
  positives: string[];
}

export class ReviewAgent extends BaseAgent {
  get taskType(): TaskType {
    return "review";
  }

  get systemPrompt(): string {
    return this.loadPromptTemplate("review.md");
  }

  protected buildUserMessage(input: Record<string, unknown>): string {
    const diff = (input.diff as string) ?? "";
    const projectContext = (input.projectContext as string) ?? "";

    const template = this.loadPromptTemplate("review.md");
    return this.renderTemplate(template, {
      diff,
      projectContext,
    });
  }

  async execute(
    input: Record<string, unknown>,
    workspace: string,
    pipelineId: string,
  ): Promise<ReviewResult> {
    // 如果没有提供 diff，尝试从 git 获取
    let diff = input.diff as string | undefined;
    if (!diff) {
      diff = await this.getGitDiff(workspace);
    }

    // 读取项目上下文
    const projectContext = (input.projectContext as string)
      ?? this.readProjectContext(workspace);

    const reviewInput: Record<string, unknown> = {
      diff,
      projectContext,
    };

    const result = await super.execute(reviewInput, workspace, pipelineId);
    const reviewResult = this.normalizeResult(result);

    // NEEDS_WORK → 自动修复一次 → 重新 review
    if (reviewResult.status === "NEEDS_WORK" && reviewResult.issues.length > 0) {
      const fixResult = await this.autoFix(reviewResult, workspace, pipelineId);
      if (fixResult) {
        return fixResult;
      }
    }

    // BLOCK → 抛出错误，触发通知人工
    if (reviewResult.status === "BLOCK") {
      this.writeReviewArtifact(reviewResult, workspace, pipelineId);
      const criticalIssues = reviewResult.issues
        .filter((i) => i.severity === "critical")
        .map((i) => `- [${i.file}${i.line ? `:${i.line}` : ""}] ${i.message}`)
        .join("\n");
      throw new Error(
        `代码审查发现严重问题 (BLOCK):\n${criticalIssues || reviewResult.summary}`,
      );
    }

    this.writeReviewArtifact(reviewResult, workspace, pipelineId);
    return reviewResult;
  }

  /** NEEDS_WORK 自动修复：让 implement agent 修复问题，然后重新 review（仅 1 次） */
  private async autoFix(
    reviewResult: ReviewResult,
    workspace: string,
    pipelineId: string,
  ): Promise<ReviewResult | null> {
    this.auditLogger.log({
      timestamp: new Date().toISOString(),
      pipelineId,
      stage: this.taskType,
      event: "llm_invoke",
      metadata: { action: "auto_fix", issueCount: reviewResult.issues.length },
    });

    // 构建修复指令
    const fixInstructions = reviewResult.issues
      .map((issue) => {
        const loc = issue.line ? `${issue.file}:${issue.line}` : issue.file;
        const sug = issue.suggestion ? `\n  建议: ${issue.suggestion}` : "";
        return `- [${issue.severity}] ${loc}: ${issue.message}${sug}`;
      })
      .join("\n");

    const fixInput: Record<string, unknown> = {
      diff: "(auto-fix mode)",
      projectContext: `请修复以下代码审查问题，直接修改文件:\n\n${fixInstructions}`,
    };

    try {
      // 用当前 agent 执行修复（复用 tool_use 能力）
      await super.execute(fixInput, workspace, pipelineId);

      // git commit 修复
      try {
        await this.executeTool("bash", { command: "git add -A" }, workspace);
        await this.executeTool(
          "bash",
          { command: `git commit -m "fix: auto-fix review issues for pipeline ${pipelineId}"` },
          workspace,
        );
      } catch {
        // 没有变更时忽略
      }

      // 重新 review
      const newDiff = await this.getGitDiff(workspace);
      const reReviewInput: Record<string, unknown> = {
        diff: newDiff,
        projectContext: this.readProjectContext(workspace),
      };

      const reResult = await super.execute(reReviewInput, workspace, pipelineId);
      const reReview = this.normalizeResult(reResult);

      this.auditLogger.log({
        timestamp: new Date().toISOString(),
        pipelineId,
        stage: this.taskType,
        event: "llm_result",
        metadata: { action: "re_review", status: reReview.status },
      });

      this.writeReviewArtifact(reReview, workspace, pipelineId);
      return reReview;
    } catch (err) {
      // 自动修复失败，返回原始 review 结果
      console.warn("Auto-fix failed:", err);
      this.writeReviewArtifact(reviewResult, workspace, pipelineId);
      return null;
    }
  }

  /** 写入 review.json 产物 */
  private writeReviewArtifact(
    reviewResult: ReviewResult,
    workspace: string,
    pipelineId: string,
  ): void {
    const artifactDir = path.join(workspace, ".ai-pipeline", pipelineId);
    if (!fs.existsSync(artifactDir)) {
      fs.mkdirSync(artifactDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(artifactDir, "review.json"),
      JSON.stringify(reviewResult, null, 2),
      "utf-8",
    );
  }

  /** 从 git 获取当前分支相对于 main 的 diff */
  private async getGitDiff(workspace: string): Promise<string> {
    try {
      const result = await this.executeTool("bash", { command: "git diff main...HEAD" }, workspace);
      return result;
    } catch {
      // 如果 main 不存在，尝试获取最近一次 commit 的 diff
      try {
        return await this.executeTool("bash", { command: "git diff HEAD~1" }, workspace);
      } catch {
        return "(unable to generate diff)";
      }
    }
  }

  /** 将模型输出标准化为 ReviewResult */
  private normalizeResult(raw: unknown): ReviewResult {
    if (typeof raw === "object" && raw !== null) {
      const obj = raw as Record<string, unknown>;
      return {
        status: this.parseStatus(obj.status),
        summary: (obj.summary as string) ?? "",
        issues: Array.isArray(obj.issues) ? obj.issues as ReviewIssue[] : [],
        positives: Array.isArray(obj.positives) ? obj.positives as string[] : [],
      };
    }
    // 无法解析时默认 NEEDS_WORK
    return {
      status: "NEEDS_WORK",
      summary: typeof raw === "string" ? raw : "Unable to parse review result",
      issues: [],
      positives: [],
    };
  }

  /** 解析审查状态 */
  private parseStatus(value: unknown): ReviewStatus {
    const str = String(value).toUpperCase();
    if (str === "APPROVE" || str === "NEEDS_WORK" || str === "BLOCK") {
      return str;
    }
    return "NEEDS_WORK";
  }

  /** 尝试读取项目上下文 */
  private readProjectContext(workspace: string): string {
    for (const name of ["CLAUDE.md", "README.md"]) {
      const filePath = path.join(workspace, name);
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, "utf-8");
      }
    }
    return "(no project context found)";
  }
}
