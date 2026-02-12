/**
 * GitLab 12.4 Webhook 处理器
 * 解析 GitLab webhook 载荷，可选验证 X-Gitlab-Token，返回 DevEvent 或 null
 */

import type { FastifyRequest } from "fastify";
import type { DevEvent } from "../types/index.js";
import { config } from "../config.js";
import { normalizeGitLabEvent } from "./event-normalizer.js";

/**
 * 验证 GitLab webhook token（X-Gitlab-Token header）
 * GitLab 12.4 使用简单 token 比对，非 HMAC 签名
 */
function verifyGitLabToken(request: FastifyRequest): boolean {
  const secret = config.gitlab.webhookSecret;
  if (!secret) return true; // 未配置则跳过验证

  const token = request.headers["x-gitlab-token"];
  return token === secret;
}

/**
 * 处理 GitLab webhook 请求
 * @returns DevEvent 或 null（事件不需要处理时）
 * @throws 签名验证失败时抛出错误
 */
export function handleGitLabWebhook(request: FastifyRequest): DevEvent | null {
  if (!verifyGitLabToken(request)) {
    throw new Error("GitLab webhook token 验证失败");
  }

  const payload = request.body as Record<string, any>;
  if (!payload || typeof payload !== "object") {
    throw new Error("无效的 webhook 载荷");
  }

  return normalizeGitLabEvent(payload);
}
