/**
 * 失败通知 — 通过 GitAdapter 写评论通知人工
 */

import type { GitAdapter } from "../adapters/git-adapter.js";
import type { PipelineInstance } from "../types/index.js";

export class Notifier {
  constructor(private getAdapter: (source: string) => GitAdapter) {}

  /** 通知人工介入 */
  async notifyHuman(instance: PipelineInstance, stageName: string, error: unknown): Promise<void> {
    const { event } = instance;
    const adapter = this.getAdapter(event.source);
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

    try {
      if (event.payload.issueIid) {
        await adapter.addIssueComment(event.project.id, event.payload.issueIid, body);
      }
      if (event.payload.mrIid) {
        await adapter.addComment(event.project.id, event.payload.mrIid, body);
      }
    } catch (notifyErr) {
      // 通知失败不应阻塞流水线
      console.error("Failed to send notification:", notifyErr);
    }
  }
}
