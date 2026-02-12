/**
 * 事件归一化 — 将 GitLab / GitHub 原始 webhook 载荷转换为统一 DevEvent
 */

import { randomUUID } from "node:crypto";
import type { DevEvent, EventSource, EventType } from "../types/index.js";

// ---------- GitLab 12.4 ----------

/** 判断 labels 数组中是否包含指定标签（GitLab 12.4 labels 格式: [{id, title, color}]） */
function gitlabHasLabel(labels: unknown[], target: string): boolean {
  return labels.some(
    (l: any) => (typeof l === "string" ? l : l?.title) === target,
  );
}

/**
 * 归一化 GitLab webhook 事件
 * 支持: Issue Events / Merge Request Events / Note Events
 */
export function normalizeGitLabEvent(
  payload: Record<string, any>,
): DevEvent | null {
  const kind: string | undefined = payload.object_kind;
  const project = payload.project;
  if (!project) return null;

  const base = {
    id: randomUUID(),
    source: "gitlab" as EventSource,
    receivedAt: new Date().toISOString(),
    project: {
      // IMPORTANT: GitLab project ID 是数字，统一转为字符串
      id: String(project.id),
      name: project.path_with_namespace ?? project.name ?? "",
      cloneUrl: project.git_http_url ?? project.http_url ?? "",
      defaultBranch: project.default_branch ?? "main",
    },
  };

  // --- Issue 事件：标签包含 auto-implement ---
  if (kind === "issue") {
    const issue = payload.object_attributes;
    if (!issue) return null;
    const labels: unknown[] = payload.labels ?? issue.labels ?? [];
    if (!gitlabHasLabel(labels, "auto-implement")) return null;

    return {
      ...base,
      type: "issue_labeled",
      payload: {
        issueIid: issue.iid,
        title: issue.title ?? "",
        description: issue.description ?? "",
        labels: labels.map((l: any) =>
          typeof l === "string" ? l : l?.title ?? "",
        ),
        author: payload.user?.username ?? issue.author_id?.toString() ?? "",
      },
    };
  }

  // --- Merge Request 事件 ---
  if (kind === "merge_request") {
    const mr = payload.object_attributes;
    if (!mr) return null;
    // GitLab 12.4: action 为 "open" / "update" / "merge"（非 "opened"）
    const action: string = mr.action ?? "";
    if (action !== "open" && action !== "update") return null;

    const type: EventType = action === "open" ? "mr_created" : "mr_updated";
    return {
      ...base,
      type,
      payload: {
        mrIid: mr.iid,
        title: mr.title ?? "",
        description: mr.description ?? "",
        labels: (payload.labels ?? []).map((l: any) =>
          typeof l === "string" ? l : l?.title ?? "",
        ),
        author: payload.user?.username ?? "",
      },
    };
  }

  // --- Note 事件（MR 评论中 @ai-bot） ---
  if (kind === "note") {
    const note = payload.object_attributes;
    if (!note) return null;
    // 仅处理 MR 上的评论
    if (note.noteable_type !== "MergeRequest") return null;
    const body: string = note.note ?? "";
    if (!body.includes("@ai-bot")) return null;

    const mr = payload.merge_request;
    return {
      ...base,
      type: "mr_comment",
      payload: {
        mrIid: mr?.iid,
        title: mr?.title ?? "",
        description: mr?.description ?? "",
        comment: body,
        author: payload.user?.username ?? "",
      },
    };
  }

  return null;
}

// ---------- GitHub ----------

/**
 * 归一化 GitHub webhook 事件
 * @param eventType X-GitHub-Event header 值
 */
export function normalizeGitHubEvent(
  eventType: string,
  payload: Record<string, any>,
): DevEvent | null {
  const repo = payload.repository;
  if (!repo) return null;

  const base = {
    id: randomUUID(),
    source: "github" as EventSource,
    receivedAt: new Date().toISOString(),
    project: {
      // projectId 格式: "owner/repo"
      id: repo.full_name ?? `${repo.owner?.login}/${repo.name}`,
      name: repo.full_name ?? repo.name ?? "",
      cloneUrl: repo.clone_url ?? "",
      defaultBranch: repo.default_branch ?? "main",
    },
  };

  // --- Issues 事件：labeled 且包含 auto-implement ---
  if (eventType === "issues") {
    const action: string = payload.action ?? "";
    if (action !== "labeled") return null;
    const issue = payload.issue;
    if (!issue) return null;
    const labels: string[] = (issue.labels ?? []).map(
      (l: any) => l.name ?? "",
    );
    if (!labels.includes("auto-implement")) return null;

    return {
      ...base,
      type: "issue_labeled",
      payload: {
        issueIid: issue.number,
        title: issue.title ?? "",
        description: issue.body ?? "",
        labels,
        author: issue.user?.login ?? payload.sender?.login ?? "",
      },
    };
  }

  // --- Pull Request 事件 ---
  if (eventType === "pull_request") {
    const action: string = payload.action ?? "";
    const pr = payload.pull_request;
    if (!pr) return null;

    let type: EventType;
    if (action === "opened") {
      type = "mr_created";
    } else if (action === "synchronize" || action === "edited") {
      type = "mr_updated";
    } else {
      return null;
    }

    return {
      ...base,
      type,
      payload: {
        mrIid: pr.number,
        title: pr.title ?? "",
        description: pr.body ?? "",
        labels: (pr.labels ?? []).map((l: any) => l.name ?? ""),
        author: pr.user?.login ?? payload.sender?.login ?? "",
      },
    };
  }

  // --- Issue Comment 事件（PR 评论中 @ai-bot） ---
  if (eventType === "issue_comment") {
    const comment = payload.comment;
    const issue = payload.issue;
    if (!comment || !issue) return null;
    // 仅处理 PR 上的评论（issue 带有 pull_request 字段）
    if (!issue.pull_request) return null;
    const body: string = comment.body ?? "";
    if (!body.includes("@ai-bot")) return null;

    return {
      ...base,
      type: "mr_comment",
      payload: {
        mrIid: issue.number,
        title: issue.title ?? "",
        description: issue.body ?? "",
        comment: body,
        author: comment.user?.login ?? payload.sender?.login ?? "",
      },
    };
  }

  return null;
}
