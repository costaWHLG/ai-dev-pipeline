/**
 * 提交合并 Agent — 推送代码并创建 MR/PR
 *
 * 输入：workspace + branch + event
 * 处理：git push + 创建 MR/PR + Issue 评论
 */

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createAdapter } from "../adapters/adapter-factory.js";
import type { AuditLogger } from "../audit/logger.js";
import type { LLMRouter } from "../llm/router.js";
import type { DevEvent } from "../types/index.js";

const execFileAsync = promisify(execFile);

export class CommitAgent {
  constructor(
    private auditLogger: AuditLogger,
    private llmRouter: LLMRouter,
  ) {}

  async execute(
    input: Record<string, unknown>,
    workspace: string,
    pipelineId: string,
  ): Promise<{ mrUrl?: string; success: boolean; skipped?: boolean; localOnly?: boolean }> {
    const event = input.event as DevEvent;
    const branch = input.branch as string;
    const artifactDir = path.join(workspace, ".ai-pipeline", pipelineId);
    const targetBranch = event.project.defaultBranch;

    // scaffold 场景：没有远端仓库时跳过 push
    const isScaffold = event.type === "scaffold";
    const hasRemote = !!event.project.cloneUrl;
    const createRemoteRepo = event.payload.scaffold?.createRemoteRepo;

    if (isScaffold && !hasRemote && !createRemoteRepo) {
      // 本地 scaffold，不需要 push
      this.auditLogger.log({
        timestamp: new Date().toISOString(),
        pipelineId,
        stage: "commit",
        event: "stage_complete",
        metadata: { skipped: false, localOnly: true, reason: "scaffold_no_remote" },
      });
      console.log(`Scaffold 完成，项目已生成在: ${workspace}`);
      return { success: true, localOnly: true };
    }

    // 检查是否有新 commit（相对于目标分支）
    const hasChanges = await this.hasNewCommits(workspace, targetBranch);
    if (!hasChanges) {
      this.auditLogger.log({
        timestamp: new Date().toISOString(),
        pipelineId,
        stage: "commit",
        event: "stage_complete",
        metadata: { skipped: true, reason: "no_changes" },
      });
      return { success: true, skipped: true };
    }

    // 读取各阶段产物用于 MR 描述
    const requirements = this.readJsonFile(path.join(artifactDir, "requirements.json"));
    const design = this.readJsonFile(path.join(artifactDir, "design.json"));
    const review = this.readJsonFile(path.join(artifactDir, "review.json"));

    // 推送分支
    try {
      await this.gitExec(workspace, ["push", "-u", "origin", branch]);
    } catch (err) {
      // 可能需要设置 upstream
      await this.gitExec(workspace, ["push", "--set-upstream", "origin", branch]);
    }

    this.auditLogger.log({
      timestamp: new Date().toISOString(),
      pipelineId,
      stage: "commit",
      event: "git_push",
      metadata: { branch },
    });

    // 创建 MR/PR
    const adapter = createAdapter(event.source);
    const projectId = event.project.id;
    const issueIid = event.payload.issueIid;

    const mrTitle = `feat: 自动实现 Issue #${issueIid} - ${event.payload.title}`;
    const mrBody = this.buildMRDescription(requirements, design, review, pipelineId);

    const mrResult = await adapter.createMergeRequest(projectId, {
      sourceBranch: branch,
      targetBranch: event.project.defaultBranch,
      title: mrTitle,
      description: mrBody,
      labels: ["auto-implemented"],
      removeSourceBranch: true,
    });

    this.auditLogger.log({
      timestamp: new Date().toISOString(),
      pipelineId,
      stage: "commit",
      event: "mr_created",
      metadata: { mrIid: mrResult.iid, mrUrl: mrResult.url },
    });

    // 在 Issue 上评论
    if (issueIid) {
      try {
        await adapter.addIssueComment(
          projectId,
          issueIid,
          `✅ 已自动实现，请查看 MR: ${mrResult.url}\n\n流水线 ID: \`${pipelineId}\``,
        );
      } catch (err) {
        // 评论失败不阻塞流程
        console.error("Failed to add issue comment:", err);
      }
    }

    return { mrUrl: mrResult.url, success: true };
  }

  private async gitExec(workspace: string, args: string[]): Promise<string> {
    const { stdout } = await execFileAsync("git", args, {
      cwd: workspace,
      timeout: 60_000,
    });
    return stdout;
  }

  private readJsonFile(filePath: string): Record<string, unknown> | null {
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      return null;
    }
  }

  /** 检查当前分支相对于目标分支是否有新 commit */
  private async hasNewCommits(workspace: string, targetBranch: string): Promise<boolean> {
    try {
      // 获取当前分支与目标分支的差异 commit 数量
      const result = await this.gitExec(workspace, [
        "rev-list",
        "--count",
        `origin/${targetBranch}..HEAD`,
      ]);
      const count = parseInt(result.trim(), 10);
      return count > 0;
    } catch {
      // 如果命令失败，假设有变更（让后续流程处理）
      return true;
    }
  }

  private buildMRDescription(
    requirements: Record<string, unknown> | null,
    design: Record<string, unknown> | null,
    review: Record<string, unknown> | null,
    pipelineId: string,
  ): string {
    const sections: string[] = [];

    sections.push(`## AI Dev Pipeline 自动生成\n\n流水线 ID: \`${pipelineId}\``);

    if (requirements) {
      sections.push(`### 需求分析\n\n${requirements.summary || "无"}`);
      if (Array.isArray(requirements.acceptanceCriteria) && requirements.acceptanceCriteria.length > 0) {
        sections.push(`**验收标准:**\n${requirements.acceptanceCriteria.map((c: string) => `- ${c}`).join("\n")}`);
      }
    }

    if (design) {
      sections.push(`### 设计方案\n\n${design.summary || design.approach || "见 design.json"}`);
    }

    if (review) {
      const status = review.status || "UNKNOWN";
      sections.push(`### AI 审查结果\n\n状态: **${status}**`);
      if (review.summary) {
        sections.push(`${review.summary}`);
      }
    }

    return sections.join("\n\n");
  }
}
