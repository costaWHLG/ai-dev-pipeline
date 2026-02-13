/**
 * Gateway HTTP 服务 — Fastify 实例，接收 webhook 并分发事件
 */

import Fastify from "fastify";
import type { DevEvent } from "../types/index.js";
import { config } from "../config.js";
import { handleGitLabWebhook } from "./gitlab-webhook.js";
import { handleGitHubWebhook } from "./github-webhook.js";

/** 事件处理回调 */
export type EventHandler = (event: DevEvent) => Promise<void>;

/** 恢复被阻塞流水线的回调 */
export type ResumeHandler = (pipelineId: string, fromStage?: string, additionalContext?: string) => Promise<void>;

/** 服务状态信息 */
interface ServerStatus {
  uptime: number;
  receivedEvents: number;
  lastEventAt: string | null;
}

/**
 * 创建 Fastify 服务实例
 * @param onEvent 事件回调，收到有效事件后调用
 * @param onResume 恢复回调，收到恢复指令后调用
 */
export async function createServer(onEvent: EventHandler, onResume?: ResumeHandler) {
  const app = Fastify({ logger: true });

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

  // ---------- 路由 ----------

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

      // 检测到恢复指令时，直接触发恢复流程
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
