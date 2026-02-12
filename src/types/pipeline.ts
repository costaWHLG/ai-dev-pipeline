/**
 * 流水线相关类型定义
 */

import type { DevEvent } from "./events.js";

/** 阶段状态 */
export type StageStatus = "pending" | "running" | "success" | "failed" | "blocked" | "skipped";

/** 失败处理策略 */
export type FailureAction = "retry" | "notify" | "abort";

/** 流水线阶段定义 */
export interface PipelineStage {
  name: string;
  agent: string;
  maxRetries: number;
  onFailure: FailureAction;
  timeout: number;
  parallel?: boolean;
}

/** 阶段执行结果 */
export interface StageResult {
  stage: string;
  status: StageStatus;
  startedAt: string;
  completedAt?: string;
  retries: number;
  artifacts: string[];
  error?: string;
}

/** 流水线实例状态 */
export type PipelineStatus = "running" | "success" | "failed" | "blocked";

/** 流水线实例 */
export interface PipelineInstance {
  id: string;
  event: DevEvent;
  status: PipelineStatus;
  workspace: string;
  branch: string;
  stages: StageResult[];
  createdAt: string;
  completedAt?: string;
}

/** 审计记录事件类型 */
export type AuditEvent =
  | "pipeline_start"
  | "pipeline_complete"
  | "pipeline_failed"
  | "stage_start"
  | "stage_complete"
  | "stage_failed"
  | "stage_retry"
  | "llm_invoke"
  | "llm_result"
  | "git_commit"
  | "git_push"
  | "mr_created"
  | "notify_human";

/** 审计记录 */
export interface AuditRecord {
  timestamp: string;
  pipelineId: string;
  stage?: string;
  event: AuditEvent;
  input?: string;
  output?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}
