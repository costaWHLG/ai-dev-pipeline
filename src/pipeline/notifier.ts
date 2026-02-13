/**
 * 失败通知 — 通过 GitAdapter 写评论通知人工，无 Issue 时回退到日志
 */

import pino from "pino";
import type { GitAdapter } from "../adapters/git-adapter.js";
import type { PipelineInstance } from "../types/index.js";

const logger = pino({ name: "notifier" });

export class Notifier {
  constructor(private getAdapter: (source: string) => GitAdapter) {}

  /** 通知人工介入 */
  async notifyHuman(instance: PipelineInstance, stageName: string, error: unknown): Promise<void> {
    const { event } = instance;
    const errorMsg = error instanceof Error ? error.message : String(error);

    const body = [
      `## AI Pipeline 需要人工介入`,
      ``,
      `**流水线 ID**: \`${instance.id}\``,
      `**失败阶段**: ${stageName}`,
      `**错误信息**: ${errorMsg}`,
      ``,
      `请检查后手动重试或修复。`,
    ].join("\n");

    const hasIssue = !!event.payload.issueIid;
    const hasMR = !!event.payload.mrIid;
    const hasProjectId = !!event.project.id;

    // 有 Issue 或 MR 时写评论
    if (hasProjectId && (hasIssue || hasMR)) {
      try {
        const adapter = this.getAdapter(event.source);
        if (hasIssue) {
          await adapter.addIssueComment(event.project.id, event.payload.issueIid!, body);
        }
        if (hasMR) {
          await adapter.addComment(event.project.id, event.payload.mrIid!, body);
        }
        return;
      } catch (notifyErr) {
        console.error("Failed to send notification:", notifyErr);
      }
    }

    // 回退：输出到日志（CLI 触发 / scaffold 场景）
    logger.warn({
      pipelineId: instance.id,
      stage: stageName,
      error: errorMsg,
      eventType: event.type,
    }, "Pipeline 需要人工介入（无 Issue/MR 可评论）");

    // 同时输出到 stdout，CLI 用户可以直接看到
    console.log("\n" + "=".repeat(60));
    console.log(body);
    console.log("=".repeat(60) + "\n");
  }
}
