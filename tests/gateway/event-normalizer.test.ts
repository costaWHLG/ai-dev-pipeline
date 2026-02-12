/**
 * 事件归一化单元测试
 */

import { describe, expect, it } from "vitest";
import {
  normalizeGitLabEvent,
  normalizeGitHubEvent,
} from "../../src/gateway/event-normalizer.js";

// 加载 fixture
import gitlabIssueLabeled from "../fixtures/gitlab-issue-labeled.json";
import githubIssueLabeled from "../fixtures/github-issue-labeled.json";

// ==================== GitLab ====================

describe("normalizeGitLabEvent", () => {
  it("应将带 auto-implement 标签的 issue 事件归一化为 issue_labeled", () => {
    const event = normalizeGitLabEvent(gitlabIssueLabeled);
    expect(event).not.toBeNull();
    expect(event!.source).toBe("gitlab");
    expect(event!.type).toBe("issue_labeled");
    expect(event!.project.id).toBe("42"); // 数字转字符串
    expect(event!.project.name).toBe("group/my-project");
    expect(event!.payload.issueIid).toBe(7);
    expect(event!.payload.title).toBe("实现用户登录功能");
    expect(event!.payload.labels).toContain("auto-implement");
    expect(event!.payload.author).toBe("admin");
  });

  it("应忽略不含 auto-implement 标签的 issue 事件", () => {
    const payload = {
      ...gitlabIssueLabeled,
      labels: [{ id: 102, title: "feature", color: "#44AD8E" }],
    };
    expect(normalizeGitLabEvent(payload)).toBeNull();
  });

  it("应将 MR open 事件归一化为 mr_created", () => {
    const payload = {
      object_kind: "merge_request",
      user: { username: "dev1" },
      project: {
        id: 42,
        path_with_namespace: "group/my-project",
        git_http_url: "https://gitlab.example.com/group/my-project.git",
        default_branch: "main",
      },
      object_attributes: {
        iid: 3,
        title: "feat: 用户登录",
        description: "实现登录功能",
        action: "open",
      },
      labels: [],
    };
    const event = normalizeGitLabEvent(payload);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("mr_created");
    expect(event!.payload.mrIid).toBe(3);
  });

  it("应将 MR update 事件归一化为 mr_updated", () => {
    const payload = {
      object_kind: "merge_request",
      user: { username: "dev1" },
      project: {
        id: 42,
        path_with_namespace: "group/my-project",
        git_http_url: "https://gitlab.example.com/group/my-project.git",
        default_branch: "main",
      },
      object_attributes: {
        iid: 3,
        title: "feat: 用户登录",
        description: "实现登录功能",
        action: "update",
      },
      labels: [],
    };
    const event = normalizeGitLabEvent(payload);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("mr_updated");
  });

  it("应忽略 MR merge 事件", () => {
    const payload = {
      object_kind: "merge_request",
      user: { username: "dev1" },
      project: {
        id: 42,
        path_with_namespace: "group/my-project",
        git_http_url: "https://gitlab.example.com/group/my-project.git",
        default_branch: "main",
      },
      object_attributes: {
        iid: 3,
        title: "feat: 用户登录",
        description: "实现登录功能",
        action: "merge",
      },
      labels: [],
    };
    expect(normalizeGitLabEvent(payload)).toBeNull();
  });

  it("应将包含 @ai-bot 的 MR 评论归一化为 mr_comment", () => {
    const payload = {
      object_kind: "note",
      user: { username: "reviewer" },
      project: {
        id: 42,
        path_with_namespace: "group/my-project",
        git_http_url: "https://gitlab.example.com/group/my-project.git",
        default_branch: "main",
      },
      object_attributes: {
        noteable_type: "MergeRequest",
        note: "@ai-bot 请优化这段代码的性能",
      },
      merge_request: {
        iid: 3,
        title: "feat: 用户登录",
        description: "实现登录功能",
      },
    };
    const event = normalizeGitLabEvent(payload);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("mr_comment");
    expect(event!.payload.comment).toContain("@ai-bot");
    expect(event!.payload.author).toBe("reviewer");
  });

  it("应忽略不含 @ai-bot 的 MR 评论", () => {
    const payload = {
      object_kind: "note",
      user: { username: "reviewer" },
      project: {
        id: 42,
        path_with_namespace: "group/my-project",
        git_http_url: "https://gitlab.example.com/group/my-project.git",
        default_branch: "main",
      },
      object_attributes: {
        noteable_type: "MergeRequest",
        note: "LGTM，可以合并了",
      },
      merge_request: { iid: 3, title: "feat", description: "" },
    };
    expect(normalizeGitLabEvent(payload)).toBeNull();
  });

  it("应忽略 Issue 上的 note 事件", () => {
    const payload = {
      object_kind: "note",
      user: { username: "reviewer" },
      project: {
        id: 42,
        path_with_namespace: "group/my-project",
        git_http_url: "https://gitlab.example.com/group/my-project.git",
        default_branch: "main",
      },
      object_attributes: {
        noteable_type: "Issue",
        note: "@ai-bot 帮我看看",
      },
    };
    expect(normalizeGitLabEvent(payload)).toBeNull();
  });

  it("缺少 project 时应返回 null", () => {
    expect(normalizeGitLabEvent({ object_kind: "issue" })).toBeNull();
  });
});

// ==================== GitHub ====================

describe("normalizeGitHubEvent", () => {
  it("应将带 auto-implement 标签的 issues labeled 事件归一化为 issue_labeled", () => {
    const event = normalizeGitHubEvent("issues", githubIssueLabeled);
    expect(event).not.toBeNull();
    expect(event!.source).toBe("github");
    expect(event!.type).toBe("issue_labeled");
    expect(event!.project.id).toBe("octocat/my-project");
    expect(event!.payload.issueIid).toBe(15);
    expect(event!.payload.title).toBe("Add user authentication");
    expect(event!.payload.labels).toContain("auto-implement");
    expect(event!.payload.author).toBe("octocat");
  });

  it("应忽略非 labeled action 的 issues 事件", () => {
    const payload = { ...githubIssueLabeled, action: "opened" };
    expect(normalizeGitHubEvent("issues", payload)).toBeNull();
  });

  it("应忽略不含 auto-implement 标签的 issues 事件", () => {
    const payload = {
      ...githubIssueLabeled,
      issue: {
        ...githubIssueLabeled.issue,
        labels: [{ id: 202, name: "enhancement", color: "a2eeef" }],
      },
    };
    expect(normalizeGitHubEvent("issues", payload)).toBeNull();
  });

  it("应将 PR opened 事件归一化为 mr_created", () => {
    const payload = {
      action: "opened",
      pull_request: {
        number: 10,
        title: "feat: auth",
        body: "Add authentication",
        labels: [],
        user: { login: "octocat" },
      },
      repository: {
        full_name: "octocat/my-project",
        clone_url: "https://github.com/octocat/my-project.git",
        default_branch: "main",
      },
      sender: { login: "octocat" },
    };
    const event = normalizeGitHubEvent("pull_request", payload);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("mr_created");
    expect(event!.payload.mrIid).toBe(10);
  });

  it("应将 PR synchronize 事件归一化为 mr_updated", () => {
    const payload = {
      action: "synchronize",
      pull_request: {
        number: 10,
        title: "feat: auth",
        body: "Add authentication",
        labels: [],
        user: { login: "octocat" },
      },
      repository: {
        full_name: "octocat/my-project",
        clone_url: "https://github.com/octocat/my-project.git",
        default_branch: "main",
      },
    };
    const event = normalizeGitHubEvent("pull_request", payload);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("mr_updated");
  });

  it("应将 PR 评论中包含 @ai-bot 的 issue_comment 归一化为 mr_comment", () => {
    const payload = {
      action: "created",
      comment: {
        body: "@ai-bot please review this",
        user: { login: "reviewer" },
      },
      issue: {
        number: 10,
        title: "feat: auth",
        body: "Add authentication",
        pull_request: { url: "https://api.github.com/repos/octocat/my-project/pulls/10" },
      },
      repository: {
        full_name: "octocat/my-project",
        clone_url: "https://github.com/octocat/my-project.git",
        default_branch: "main",
      },
      sender: { login: "reviewer" },
    };
    const event = normalizeGitHubEvent("issue_comment", payload);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("mr_comment");
    expect(event!.payload.comment).toContain("@ai-bot");
    expect(event!.payload.author).toBe("reviewer");
  });

  it("应忽略非 PR 的 issue_comment 事件", () => {
    const payload = {
      action: "created",
      comment: { body: "@ai-bot help", user: { login: "user1" } },
      issue: {
        number: 5,
        title: "Bug report",
        body: "Something is broken",
        // 没有 pull_request 字段 → 普通 issue 评论
      },
      repository: {
        full_name: "octocat/my-project",
        clone_url: "https://github.com/octocat/my-project.git",
        default_branch: "main",
      },
    };
    expect(normalizeGitHubEvent("issue_comment", payload)).toBeNull();
  });

  it("应忽略不含 @ai-bot 的 PR 评论", () => {
    const payload = {
      action: "created",
      comment: { body: "LGTM", user: { login: "reviewer" } },
      issue: {
        number: 10,
        title: "feat: auth",
        body: "",
        pull_request: { url: "https://api.github.com/repos/o/r/pulls/10" },
      },
      repository: {
        full_name: "octocat/my-project",
        clone_url: "https://github.com/octocat/my-project.git",
        default_branch: "main",
      },
    };
    expect(normalizeGitHubEvent("issue_comment", payload)).toBeNull();
  });

  it("缺少 repository 时应返回 null", () => {
    expect(normalizeGitHubEvent("issues", { action: "labeled" })).toBeNull();
  });

  it("不支持的事件类型应返回 null", () => {
    const payload = {
      repository: {
        full_name: "octocat/my-project",
        clone_url: "https://github.com/octocat/my-project.git",
        default_branch: "main",
      },
    };
    expect(normalizeGitHubEvent("push", payload)).toBeNull();
  });
});
