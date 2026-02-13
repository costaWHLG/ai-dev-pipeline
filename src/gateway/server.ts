/**
 * Gateway HTTP 服务 — Fastify 实例，接收 webhook 并分发事件 + Dashboard API
 */

import path from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import type { DevEvent } from "../types/index.js";
import { config } from "../config.js";
import { handleGitLabWebhook } from "./gitlab-webhook.js";
import { handleGitHubWebhook } from "./github-webhook.js";
import { DEFAULT_ROUTES, FALLBACK_ROUTES, type TaskType, type LLMConfig } from "../llm/providers.js";
import { loadMCPConfig } from "../mcp/mcp-config.js";
import type { StateStore } from "../pipeline/state.js";
import type { AuditLogger } from "../audit/logger.js";
import type { LLMRouter } from "../llm/router.js";
import type { SkillsManager } from "../skills/skills-manager.js";

/** 事件处理回调 */
export type EventHandler = (event: DevEvent) => Promise<void>;

/** 恢复被阻塞流水线的回调 */
export type ResumeHandler = (pipelineId: string, fromStage?: string, additionalContext?: string) => Promise<void>;

/** 服务依赖 */
export interface ServerDeps {
  onEvent: EventHandler;
  onResume?: ResumeHandler;
  stateStore: StateStore;
  auditLogger: AuditLogger;
  llmRouter: LLMRouter;
  skillsManager: SkillsManager;
}

/** 服务状态信息 */
interface ServerStatus {
  uptime: number;
  receivedEvents: number;
  lastEventAt: string | null;
}

/**
 * 创建 Fastify 服务实例
 */
export async function createServer(deps: ServerDeps) {
  const { onEvent, onResume, stateStore, auditLogger, llmRouter, skillsManager } = deps;
  const app = Fastify({ logger: true });

  // 静态文件服务 — Dashboard
  const dashboardDir = path.resolve(
    path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")),
    "../dashboard",
  );
  await app.register(fastifyStatic, {
    root: dashboardDir,
    prefix: "/dashboard/",
  });

  // 内部统计
  const status: ServerStatus = {
    uptime: Date.now(),
    receivedEvents: 0,
    lastEventAt: null,
  };

  /** 分发事件的公共逻辑 */
  async function dispatchEvent(event: DevEvent | null): Promise<DevEvent | null> {
    if (!event) return null;
    status.receivedEvents++;
    status.lastEventAt = new Date().toISOString();
    await onEvent(event);
    return event;
  }

  // ========== Webhook 路由 ==========

  /** GitLab webhook 入口 */
  app.post("/webhook/gitlab", async (request, reply) => {
    try {
      const event = handleGitLabWebhook(request);
      const dispatched = await dispatchEvent(event);
      if (dispatched) {
        return reply.code(200).send({ ok: true, eventId: dispatched.id });
      }
      return reply.code(200).send({ ok: true, ignored: true });
    } catch (err: any) {
      request.log.error(err, "GitLab webhook 处理失败");
      return reply.code(err.message.includes("验证失败") ? 401 : 400).send({
        ok: false,
        error: err.message,
      });
    }
  });

  /** GitHub webhook 入口 */
  app.post("/webhook/github", async (request, reply) => {
    try {
      const { event, resumeCommand } = handleGitHubWebhook(request);

      if (resumeCommand) {
        if (onResume) {
          await onResume(resumeCommand.pipelineId, resumeCommand.fromStage, resumeCommand.additionalContext);
          return reply.code(200).send({ ok: true, resumed: true, pipelineId: resumeCommand.pipelineId });
        }
        return reply.code(501).send({ ok: false, error: "Resume not configured" });
      }

      const dispatched = await dispatchEvent(event);
      if (dispatched) {
        return reply.code(200).send({ ok: true, eventId: dispatched.id });
      }
      return reply.code(200).send({ ok: true, ignored: true });
    } catch (err: any) {
      request.log.error(err, "GitHub webhook 处理失败");
      const code = err.message.includes("验证失败") ? 401 : 400;
      return reply.code(code).send({ ok: false, error: err.message });
    }
  });

  /** CLI 触发入口（无签名验证） */
  app.post("/api/trigger", async (request, reply) => {
    try {
      const event = request.body as DevEvent;
      if (!event || !event.id || !event.type) {
        return reply.code(400).send({ ok: false, error: "无效的事件格式" });
      }
      const dispatched = await dispatchEvent(event);
      return reply.code(200).send({ ok: true, eventId: dispatched?.id });
    } catch (err: any) {
      request.log.error(err, "CLI 触发处理失败");
      return reply.code(500).send({ ok: false, error: err.message });
    }
  });

  /** 恢复被阻塞的流水线 */
  app.post("/api/resume/:pipelineId", async (request, reply) => {
    try {
      const { pipelineId } = request.params as { pipelineId: string };
      const body = request.body as { fromStage?: string; additionalContext?: string } | undefined;
      if (onResume) {
        await onResume(pipelineId, body?.fromStage, body?.additionalContext);
        return reply.code(200).send({ ok: true, pipelineId });
      }
      return reply.code(501).send({ ok: false, error: "Resume not configured" });
    } catch (err: any) {
      request.log.error(err, "流水线恢复处理失败");
      return reply.code(500).send({ ok: false, error: err.message });
    }
  });

  // ========== Dashboard API ==========

  /** 流水线列表 */
  app.get("/api/pipelines", async (request, reply) => {
    const query = request.query as { status?: string; project_id?: string };
    const pipelines = stateStore.list({
      status: query.status,
      projectId: query.project_id,
    });
    return reply.send(pipelines);
  });

  /** 流水线详情 */
  app.get("/api/pipelines/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const pipeline = stateStore.get(id);
    if (!pipeline) {
      return reply.code(404).send({ ok: false, error: "Pipeline not found" });
    }
    return reply.send(pipeline);
  });

  /** 流水线审计日志 */
  app.get("/api/pipelines/:id/logs", async (request, reply) => {
    const { id } = request.params as { id: string };
    const logs = auditLogger.getPipelineLog(id);
    return reply.send(logs);
  });

  /** LLM 路由配置 */
  app.get("/api/llm/routes", async (_request, reply) => {
    const routes: Record<string, { default: LLMConfig; fallback: LLMConfig }> = {};
    for (const [task, cfg] of DEFAULT_ROUTES) {
      routes[task] = {
        default: sanitizeLLMConfig(cfg),
        fallback: sanitizeLLMConfig(FALLBACK_ROUTES.get(task)!),
      };
    }
    return reply.send(routes);
  });

  /** 覆盖 LLM 路由 */
  app.put("/api/llm/routes/:taskType", async (request, reply) => {
    const { taskType } = request.params as { taskType: string };
    const validTasks: TaskType[] = ["analyze", "design", "implement", "review", "fix"];
    if (!validTasks.includes(taskType as TaskType)) {
      return reply.code(400).send({ ok: false, error: `Invalid task type: ${taskType}` });
    }
    const body = request.body as Partial<LLMConfig>;
    if (!body.model || !body.provider) {
      return reply.code(400).send({ ok: false, error: "model and provider are required" });
    }
    llmRouter.setOverride(taskType as TaskType, body as LLMConfig);
    return reply.send({ ok: true, taskType, config: sanitizeLLMConfig(body as LLMConfig) });
  });

  /** 清除 LLM 路由覆盖 */
  app.delete("/api/llm/routes/:taskType", async (request, reply) => {
    const { taskType } = request.params as { taskType: string };
    llmRouter.clearOverride(taskType as TaskType);
    return reply.send({ ok: true, taskType });
  });

  /** Skills 列表 */
  app.get("/api/skills", async (_request, reply) => {
    const skills = skillsManager.list().map((s) => ({
      name: s.name,
      description: s.description,
      source: s.source,
      tags: s.tags,
      inputs: s.inputs,
      outputs: s.outputs,
    }));
    return reply.send(skills);
  });

  /** MCP Server 列表 */
  app.get("/api/mcp/servers", async (_request, reply) => {
    const mcpConfig = loadMCPConfig();
    const servers = Object.entries(mcpConfig.mcpServers).map(([name, cfg]) => ({
      name,
      transport: "transport" in cfg ? cfg.transport ?? "stdio" : "stdio",
      description: cfg.description ?? "",
      command: "command" in cfg ? cfg.command : undefined,
      url: "url" in cfg ? cfg.url : undefined,
    }));
    return reply.send(servers);
  });

  /** 当前运行配置（脱敏） */
  app.get("/api/config", async (_request, reply) => {
    return reply.send({
      port: config.port,
      nodeEnv: config.nodeEnv,
      sqlitePath: config.sqlitePath,
      workspaceDir: config.workspaceDir,
      auditDir: config.auditDir,
      gitAuthorName: config.gitAuthorName,
      gitAuthorEmail: config.gitAuthorEmail,
      gitlab: { url: config.gitlab.url, hasToken: !!config.gitlab.token },
      github: { hasToken: !!config.github.token },
      llm: {
        hasAnthropicKey: !!config.llm.anthropicApiKey,
        hasOpenaiKey: !!config.llm.openaiApiKey,
        internalUrl: config.llm.internalUrl,
        internalModel: config.llm.internalModel,
        hasProxy: !!config.llm.proxy,
      },
      wecom: { enabled: !!config.wecomWebhookUrl },
    });
  });

  // ========== 基础路由 ==========

  /** 健康检查 */
  app.get("/health", async (_request, reply) => {
    return reply.code(200).send({ status: "ok" });
  });

  /** 服务状态 */
  app.get("/status", async (_request, reply) => {
    return reply.code(200).send({
      uptime: Math.floor((Date.now() - status.uptime) / 1000),
      receivedEvents: status.receivedEvents,
      lastEventAt: status.lastEventAt,
    });
  });

  return app;
}

/** 脱敏 LLM 配置（移除 apiKey） */
function sanitizeLLMConfig(cfg: LLMConfig): Omit<LLMConfig, "apiKey"> & { apiKey?: string } {
  const { apiKey, ...rest } = cfg;
  return rest;
}
