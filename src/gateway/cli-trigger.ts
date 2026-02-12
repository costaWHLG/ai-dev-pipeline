/**
 * CLI 手动触发 — 用于本地调试或手动创建事件
 */

import { randomUUID } from "node:crypto";
import type {
  DevEvent,
  EventSource,
  ProjectInfo,
  ScaffoldPayload,
} from "../types/index.js";

/** 手动 issue 触发参数 */
export interface ManualEventOptions {
  source: EventSource;
  project: ProjectInfo;
  issueIid: number;
  title: string;
  description: string;
  labels?: string[];
}

/** scaffold 触发参数 */
export interface ScaffoldEventOptions {
  source: EventSource;
  project: ProjectInfo;
  scaffold: ScaffoldPayload;
  title?: string;
  description?: string;
}

/**
 * 创建手动 issue 事件
 */
export function createManualEvent(opts: ManualEventOptions): DevEvent {
  return {
    id: randomUUID(),
    source: opts.source,
    type: "manual",
    receivedAt: new Date().toISOString(),
    project: opts.project,
    payload: {
      issueIid: opts.issueIid,
      title: opts.title,
      description: opts.description,
      labels: opts.labels ?? [],
      author: "cli",
    },
  };
}

/**
 * 创建 scaffold 事件
 */
export function createScaffoldEvent(opts: ScaffoldEventOptions): DevEvent {
  return {
    id: randomUUID(),
    source: opts.source,
    type: "scaffold",
    receivedAt: new Date().toISOString(),
    project: opts.project,
    payload: {
      title: opts.title ?? `scaffold: ${opts.scaffold.techStack}`,
      description: opts.description ?? "",
      scaffold: opts.scaffold,
      author: "cli",
    },
  };
}
