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

/** 服务状态信息 */
interface ServerStatus {
  uptime: number;
  receivedEvents: number;
  lastEventAt: string | null;
}

/**
 * 创建 Fastify 服务实例
 * @param onEvent 事件回调，收到有效事件后调用
 */
export async function createServer(onEvent: EventHandler) {
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
      const event = handleGitHubWebhook(request);
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
