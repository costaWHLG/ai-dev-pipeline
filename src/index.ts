/**
 * 服务入口 — 启动 Fastify + 队列 Worker + 状态恢复 + 优雅关闭
 */

import { config } from "./config.js";
import { AuditLogger } from "./audit/logger.js";
import { createServer } from "./gateway/server.js";
import { TaskQueue } from "./pipeline/queue.js";
import { PipelineEngine } from "./pipeline/engine.js";
import { StateStore } from "./pipeline/state.js";
import { Notifier } from "./pipeline/notifier.js";
import { createAdapter } from "./adapters/adapter-factory.js";
import { LLMRouter } from "./llm/router.js";
import { AnalyzeAgent } from "./agents/analyze-agent.js";
import { DesignAgent } from "./agents/design-agent.js";
import { ImplementAgent } from "./agents/implement-agent.js";
import { TestAgent } from "./agents/test-agent.js";
import { ReviewAgent } from "./agents/review-agent.js";
import { CommitAgent } from "./agents/commit-agent.js";
import { ScaffoldAgent } from "./agents/scaffold-agent.js";
import type { DevEvent } from "./types/index.js";
import pino from "pino";

const logger = pino({ name: "ai-dev-pipeline" });

async function main() {
  logger.info("Starting AI Dev Pipeline...");

  // 初始化核心组件
  const stateStore = new StateStore();
  const auditLogger = new AuditLogger();
  const llmRouter = new LLMRouter();

  const notifier = new Notifier((source) => createAdapter(source as "gitlab" | "github"));

  // 初始化 Agent 实例
  const agents: Record<string, { execute: (input: Record<string, unknown>, workspace: string, pipelineId: string) => Promise<unknown> }> = {
    analyze: new AnalyzeAgent(auditLogger, llmRouter),
    design: new DesignAgent(auditLogger, llmRouter),
    implement: new ImplementAgent(auditLogger, llmRouter),
    test: new TestAgent(auditLogger, llmRouter),
    review: new ReviewAgent(auditLogger, llmRouter),
    commit: new CommitAgent(auditLogger, llmRouter),
    scaffold: new ScaffoldAgent(auditLogger, llmRouter),
  };

  // Agent 执行分发
  const agentExecutor = async (
    agentType: string,
    input: Record<string, unknown>,
    workspace: string,
    pipelineId: string,
  ) => {
    const agent = agents[agentType];
    if (!agent) {
      // commit 阶段等暂未实现的 agent，跳过
      logger.warn(`Agent "${agentType}" not implemented, skipping`);
      return {};
    }
    return agent.execute(input, workspace, pipelineId);
  };

  // 初始化流水线引擎
  const engine = new PipelineEngine({
    stateStore,
    auditLogger,
    notifier,
    agentExecutor,
  });

  // 初始化任务队列
  const queue = new TaskQueue(5);
  queue.onEvent(async (event: DevEvent) => {
    const instance = engine.create(event);
    logger.info({ pipelineId: instance.id, eventType: event.type }, "Pipeline created");
    try {
      const result = await engine.run(instance);
      logger.info({ pipelineId: result.id, status: result.status }, "Pipeline completed");
    } catch (err) {
      logger.error({ pipelineId: instance.id, err }, "Pipeline failed unexpectedly");
    }
  });

  // 恢复未完成的流水线
  const incomplete = stateStore.getIncomplete();
  if (incomplete.length > 0) {
    logger.info(`Recovering ${incomplete.length} incomplete pipeline(s)...`);
    for (const instance of incomplete) {
      logger.info({ pipelineId: instance.id }, "Resuming pipeline");
      engine.run(instance).catch((err) => {
        logger.error({ pipelineId: instance.id, err }, "Failed to resume pipeline");
      });
    }
  }

  // 启动 HTTP 服务
  const server = await createServer(
    async (event) => {
      await queue.enqueue(event);
    },
    async (pipelineId, fromStage, additionalContext) => {
      logger.info({ pipelineId, fromStage, additionalContext }, "Resume requested");
      // 确定恢复起始阶段：优先使用指定阶段，否则从最后失败的阶段恢复
      let stage = fromStage;
      if (!stage) {
        const status = engine.getStatus(pipelineId);
        if (!status) throw new Error(`Pipeline ${pipelineId} not found`);
        const failedStage = [...status.stages].reverse().find((s) => s.status === "failed");
        if (failedStage) {
          stage = failedStage.stage;
        } else {
          throw new Error(`Pipeline ${pipelineId} has no failed stage to resume from`);
        }
      }
      await engine.retry(pipelineId, stage);
    },
  );

  await server.listen({ port: config.port, host: "0.0.0.0" });
  logger.info(`Server listening on port ${config.port}`);

  // 优雅关闭
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    queue.pause();
    await server.close();
    await queue.drain();
    stateStore.close();
    logger.info("Shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.fatal(err, "Failed to start");
  process.exit(1);
});
