/**
 * 流水线引擎 — 核心状态机
 */

import { randomUUID } from "node:crypto";
import type { AuditRecord, DevEvent, PipelineInstance, PipelineStage, StageResult } from "../types/index.js";
import { AuditLogger } from "../audit/logger.js";
import { projectLock } from "./lock.js";
import { Notifier } from "./notifier.js";
import { getRetryDelay, sleep } from "./retry.js";
import { getStagesForEvent } from "./stages.js";
import { StateStore } from "./state.js";
import { createWorkspace, createArtifactDir } from "./workspace.js";

/** Agent 执行函数签名 */
export type AgentExecutor = (
  agentType: string,
  input: Record<string, unknown>,
  workspace: string,
  pipelineId: string,
) => Promise<unknown>;

export interface EngineOptions {
  stateStore: StateStore;
  auditLogger: AuditLogger;
  notifier: Notifier;
  agentExecutor: AgentExecutor;
}

export class PipelineEngine {
  private stateStore: StateStore;
  private auditLogger: AuditLogger;
  private notifier: Notifier;
  private agentExecutor: AgentExecutor;

  constructor(options: EngineOptions) {
    this.stateStore = options.stateStore;
    this.auditLogger = options.auditLogger;
    this.notifier = options.notifier;
    this.agentExecutor = options.agentExecutor;
  }

  /** 创建流水线实例 */
  create(event: DevEvent): PipelineInstance {
    const id = randomUUID();
    const workspace = createWorkspace(id);
    createArtifactDir(workspace, id);

    const branchName = event.type === "scaffold"
      ? "main"
      : event.payload.mrIid
        ? `fix/mr-${event.payload.mrIid}`
        : `feature/issue-${event.payload.issueIid ?? id.slice(0, 8)}`;

    const instance: PipelineInstance = {
      id,
      event,
      status: "running",
      workspace,
      branch: branchName,
      stages: [],
      createdAt: new Date().toISOString(),
    };

    this.stateStore.save(instance);
    this.auditLogger.log({
      timestamp: new Date().toISOString(),
      pipelineId: id,
      event: "pipeline_start",
      metadata: { source: event.source, type: event.type, projectId: event.project.id },
    });

    return instance;
  }

  /** 执行流水线 */
  async run(instance: PipelineInstance): Promise<PipelineInstance> {
    const stages = getStagesForEvent(instance.event.type);

    await projectLock.acquire(instance.event.project.id);

    try {
      for (const stageDef of stages) {
        const result = await this.executeStageWithRetry(instance, stageDef);
        instance.stages.push(result);
        this.stateStore.save(instance);

        if (result.status === "failed") {
          if (stageDef.onFailure === "notify") {
            instance.status = "blocked";
            this.stateStore.save(instance);
            this.auditLogger.log({
              timestamp: new Date().toISOString(),
              pipelineId: instance.id,
              event: "pipeline_failed",
              stage: stageDef.name,
              metadata: { reason: "blocked_after_retries" },
            });
            return instance;
          } else if (stageDef.onFailure === "abort") {
            instance.status = "failed";
            this.stateStore.save(instance);
            this.auditLogger.log({
              timestamp: new Date().toISOString(),
              pipelineId: instance.id,
              event: "pipeline_failed",
              stage: stageDef.name,
              metadata: { reason: "aborted" },
            });
            return instance;
          }
        }
      }

      instance.status = "success";
      instance.completedAt = new Date().toISOString();
      this.stateStore.save(instance);
      this.auditLogger.log({
        timestamp: new Date().toISOString(),
        pipelineId: instance.id,
        event: "pipeline_complete",
      });

      return instance;
    } finally {
      projectLock.release(instance.event.project.id);
    }
  }

  /** 从指定阶段重试 */
  async retry(instanceId: string, fromStage: string): Promise<PipelineInstance> {
    const instance = this.stateStore.get(instanceId);
    if (!instance) throw new Error(`Pipeline ${instanceId} not found`);

    // 移除 fromStage 及之后的结果
    const stageIdx = instance.stages.findIndex((s) => s.stage === fromStage);
    if (stageIdx >= 0) {
      instance.stages = instance.stages.slice(0, stageIdx);
    }
    instance.status = "running";
    this.stateStore.save(instance);

    return this.run(instance);
  }

  /** 获取流水线状态 */
  getStatus(instanceId: string): PipelineInstance | null {
    return this.stateStore.get(instanceId);
  }

  /** 执行单个阶段（含重试） */
  private async executeStageWithRetry(
    instance: PipelineInstance,
    stageDef: PipelineStage,
  ): Promise<StageResult> {
    let retries = 0;
    let lastError: string | undefined;

    while (retries <= stageDef.maxRetries) {
      const startedAt = new Date().toISOString();

      this.auditLogger.log({
        timestamp: startedAt,
        pipelineId: instance.id,
        stage: stageDef.name,
        event: retries === 0 ? "stage_start" : "stage_retry",
        metadata: { retries },
      });

      try {
        // 执行 Agent，带超时
        const result = await Promise.race([
          this.agentExecutor(stageDef.agent, this.buildAgentInput(instance, stageDef), instance.workspace, instance.id),
          this.timeout(stageDef.timeout, stageDef.name),
        ]);

        this.auditLogger.log({
          timestamp: new Date().toISOString(),
          pipelineId: instance.id,
          stage: stageDef.name,
          event: "stage_complete",
          duration: Date.now() - new Date(startedAt).getTime(),
        });

        return {
          stage: stageDef.name,
          status: "success",
          startedAt,
          completedAt: new Date().toISOString(),
          retries,
          artifacts: [],
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        retries++;

        this.auditLogger.log({
          timestamp: new Date().toISOString(),
          pipelineId: instance.id,
          stage: stageDef.name,
          event: "stage_failed",
          metadata: { error: lastError, retries },
        });

        if (retries <= stageDef.maxRetries) {
          const delay = getRetryDelay(retries - 1);
          await sleep(delay);
        }
      }
    }

    // 所有重试用尽
    await this.notifier.notifyHuman(instance, stageDef.name, lastError);

    return {
      stage: stageDef.name,
      status: "failed",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      retries: retries - 1,
      artifacts: [],
      error: lastError,
    };
  }

  /** 构建 Agent 输入 */
  private buildAgentInput(instance: PipelineInstance, stageDef: PipelineStage): Record<string, unknown> {
    return {
      event: instance.event,
      workspace: instance.workspace,
      branch: instance.branch,
      pipelineId: instance.id,
      previousStages: instance.stages,
      stageConfig: stageDef,
    };
  }

  /** 超时 Promise */
  private timeout(ms: number, stageName: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Stage "${stageName}" timed out after ${ms}ms`)), ms);
    });
  }
}
