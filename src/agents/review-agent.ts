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

    // 确保结果符合 ReviewResult 结构
    const reviewResult = this.normalizeResult(result);

    // 写入产物目录
    const artifactDir = path.join(workspace, ".ai-pipeline", pipelineId);
    if (!fs.existsSync(artifactDir)) {
      fs.mkdirSync(artifactDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(artifactDir, "review.json"),
      JSON.stringify(reviewResult, null, 2),
      "utf-8",
    );

    return reviewResult;
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
