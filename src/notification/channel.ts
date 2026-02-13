/**
 * 通知渠道接口 — 定义通用通知消息结构与渠道抽象
 */

/** 通知消息 */
export interface NotificationMessage {
  pipelineId: string;
  projectName: string;
  stage: string;
  status: "failed" | "blocked";
  error: string;
  timestamp: string;
}

/** 通知渠道抽象 */
export interface NotificationChannel {
  readonly name: string;
  send(message: NotificationMessage): Promise<void>;
}
