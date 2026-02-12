/**
 * 适配器工厂 — 根据来源创建对应的 Git 适配器实例
 */

import type { GitAdapter } from "./git-adapter.js";
import { GitHubAdapter } from "./github-adapter.js";
import { GitLabAdapter } from "./gitlab-adapter.js";

export function createAdapter(source: "gitlab" | "github"): GitAdapter {
  switch (source) {
    case "gitlab":
      return new GitLabAdapter();
    case "github":
      return new GitHubAdapter();
    default:
      throw new Error(`不支持的 Git 来源: ${source satisfies never}`);
  }
}
