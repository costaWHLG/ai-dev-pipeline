/**
 * 企业微信 Webhook 机器人通知渠道
 *
 * 使用 undici fetch 发送 markdown 格式消息到企业微信群机器人。
 * 发送失败仅 warn 日志，不阻塞主流程。
 */

import { fetch } from "undici";
import pino from "pino";
import type { NotificationChannel, NotificationMessage } from "./channel.js";

const logger = pino({ name: "wecom-channel" });

export class WeComChannel implements NotificationChannel {
  readonly name = "wecom";

  constructor(private webhookUrl: string) {}

  async send(message: NotificationMessage): Promise<void> {
    const markdown = [
      `## AI Pipeline 需要人工介入`,
      `> **项目**: ${message.projectName}`,
      `> **流水线 ID**: ${message.pipelineId}`,
      `> **失败阶段**: ${message.stage}`,
      `> **状态**: ${message.status}`,
      `> **错误信息**: ${message.error}`,
      `> **时间**: ${message.timestamp}`,
      ``,
      `请及时检查并处理。`,
    ].join("\n");

    try {
      const resp = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          msgtype: "markdown",
          markdown: { content: markdown },
        }),
      });

      if (!resp.ok) {
        const body = await resp.text();
        logger.warn({ status: resp.status, body }, "企业微信 Webhook 响应异常");
      }
    } catch (err) {
      logger.warn({ err }, "企业微信 Webhook 发送失败");
    }
  }
}
