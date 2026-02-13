/**
 * GitHub Webhook 处理器
 * 解析 GitHub webhook 载荷，使用 HMAC SHA256 验证签名，返回 DevEvent 或 null
 * 同时支持检测评论中的 /resume 恢复指令
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { DevEvent } from "../types/index.js";
import { config } from "../config.js";
import { normalizeGitHubEvent } from "./event-normalizer.js";

/** 恢复指令解析结果 */
export interface ResumeCommand {
  pipelineId: string;
  fromStage?: string;
  additionalContext?: string;
}

/** GitHub webhook 处理结果 */
export interface GitHubWebhookResult {
  event: DevEvent | null;
  resumeCommand: ResumeCommand | null;
}

/**
 * 检测评论中是否包含恢复指令
 * 匹配格式: /resume <pipelineId> [fromStage]
 * 评论中 /resume 之后的非指令文本会作为 additionalContext 传递
 */
export function detectResumeCommand(commentBody: string): ResumeCommand | null {
  const match = commentBody.match(/\/resume\s+([a-f0-9-]+)(?:\s+(\w+))?/i);
  if (match) {
    // 提取指令行之后的剩余文本作为附加上下文
    const commandEnd = (match.index ?? 0) + match[0].length;
    const remaining = commentBody.slice(commandEnd).trim();
    return {
      pipelineId: match[1],
      fromStage: match[2],
      additionalContext: remaining || undefined,
    };
  }
  return null;
}

/**
 * 验证 GitHub webhook 签名（X-Hub-Signature-256 header）
 * 使用 HMAC SHA256 + timingSafeEqual 防止时序攻击
 */
function verifyGitHubSignature(request: FastifyRequest): boolean {
  const secret = config.github.webhookSecret;
  if (!secret) return true; // 未配置则跳过验证

  const signature = request.headers["x-hub-signature-256"] as string | undefined;
  if (!signature) return false;

  // rawBody 需要 Fastify rawBody 插件或自行保存
  const body =
    typeof request.body === "string"
      ? request.body
      : JSON.stringify(request.body);

  const expected =
    "sha256=" +
    createHmac("sha256", secret).update(body).digest("hex");

  // 长度不一致时 timingSafeEqual 会抛出，先做长度检查
  if (signature.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

/**
 * 处理 GitHub webhook 请求
 * @returns DevEvent 或 null（事件不需要处理时）
 * @throws 签名验证失败时抛出错误
 */
export function handleGitHubWebhook(request: FastifyRequest): GitHubWebhookResult {
  if (!verifyGitHubSignature(request)) {
    throw new Error("GitHub webhook 签名验证失败");
  }

  const eventType = request.headers["x-github-event"] as string | undefined;
  if (!eventType) {
    throw new Error("缺少 X-GitHub-Event header");
  }

  const payload = request.body as Record<string, any>;
  if (!payload || typeof payload !== "object") {
    throw new Error("无效的 webhook 载荷");
  }

  // 检测 issue_comment 事件中的恢复指令
  if (eventType === "issue_comment") {
    const commentBody: string = payload.comment?.body ?? "";
    const resumeCommand = detectResumeCommand(commentBody);
    if (resumeCommand) {
      return { event: null, resumeCommand };
    }
  }

  const event = normalizeGitHubEvent(eventType, payload);
  return { event, resumeCommand: null };
}
