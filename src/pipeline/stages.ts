/**
 * 默认流水线阶段定义
 */

import type { PipelineStage } from "../types/index.js";

/** 完整流水线（Issue → 全自动实现） */
export const DEFAULT_STAGES: PipelineStage[] = [
  { name: "需求分析", agent: "analyze", maxRetries: 2, onFailure: "notify", timeout: 120_000 },
  { name: "方案设计", agent: "design", maxRetries: 2, onFailure: "notify", timeout: 180_000 },
  { name: "编码实现", agent: "implement", maxRetries: 3, onFailure: "retry", timeout: 600_000, parallel: true },
  { name: "测试验证", agent: "test", maxRetries: 3, onFailure: "retry", timeout: 300_000 },
  { name: "代码审查", agent: "review", maxRetries: 1, onFailure: "notify", timeout: 180_000 },
  { name: "提交合并", agent: "commit", maxRetries: 1, onFailure: "abort", timeout: 60_000 },
];

/** 仅 Review 流水线（MR/PR 创建触发） */
export const REVIEW_ONLY_STAGES: PipelineStage[] = [
  { name: "代码审查", agent: "review", maxRetries: 1, onFailure: "notify", timeout: 180_000 },
];

/** MR 评论指令流水线 */
export const COMMENT_FIX_STAGES: PipelineStage[] = [
  { name: "编码实现", agent: "implement", maxRetries: 3, onFailure: "retry", timeout: 600_000 },
  { name: "测试验证", agent: "test", maxRetries: 3, onFailure: "retry", timeout: 300_000 },
  { name: "代码审查", agent: "review", maxRetries: 1, onFailure: "notify", timeout: 180_000 },
  { name: "提交合并", agent: "commit", maxRetries: 1, onFailure: "abort", timeout: 60_000 },
];

/** 脚手架流水线 */
export const SCAFFOLD_STAGES: PipelineStage[] = [
  { name: "需求分析", agent: "analyze", maxRetries: 2, onFailure: "notify", timeout: 120_000 },
  { name: "方案设计", agent: "design", maxRetries: 2, onFailure: "notify", timeout: 180_000 },
  { name: "脚手架生成", agent: "scaffold", maxRetries: 2, onFailure: "notify", timeout: 600_000 },
  { name: "测试验证", agent: "test", maxRetries: 3, onFailure: "retry", timeout: 300_000 },
  { name: "提交合并", agent: "commit", maxRetries: 1, onFailure: "abort", timeout: 60_000 },
];

/** 根据事件类型选择流水线阶段 */
export function getStagesForEvent(eventType: string): PipelineStage[] {
  switch (eventType) {
    case "issue_labeled":
    case "manual":
      return DEFAULT_STAGES;
    case "mr_created":
    case "mr_updated":
      return REVIEW_ONLY_STAGES;
    case "mr_comment":
      return COMMENT_FIX_STAGES;
    case "scaffold":
      return SCAFFOLD_STAGES;
    default:
      return DEFAULT_STAGES;
  }
}
