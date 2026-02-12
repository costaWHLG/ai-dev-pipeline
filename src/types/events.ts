/**
 * 统一事件定义
 */

/** scaffold 专用字段 */
export interface ScaffoldPayload {
  techStack: string;
  template?: string;
  features?: string[];
  targetPlatform: "gitlab" | "github";
  createRemoteRepo?: boolean;
}

/** 事件载荷 */
export interface EventPayload {
  issueIid?: number;
  mrIid?: number;
  title: string;
  description: string;
  labels?: string[];
  comment?: string;
  author?: string;
  scaffold?: ScaffoldPayload;
}

/** 项目信息 */
export interface ProjectInfo {
  id: string;
  name: string;
  cloneUrl: string;
  defaultBranch: string;
}

/** 事件来源 */
export type EventSource = "gitlab" | "github";

/** 事件类型 */
export type EventType =
  | "issue_labeled"
  | "mr_created"
  | "mr_updated"
  | "mr_comment"
  | "manual"
  | "scaffold";

/** 统一事件 */
export interface DevEvent {
  id: string;
  source: EventSource;
  type: EventType;
  receivedAt: string;
  project: ProjectInfo;
  payload: EventPayload;
}
