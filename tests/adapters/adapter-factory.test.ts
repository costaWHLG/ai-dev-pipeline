/**
 * 适配器工厂单元测试
 */

import { describe, expect, it, vi } from "vitest";

// mock 掉实际的 API 客户端，避免测试时需要真实配置
vi.mock("@gitbeaker/rest", () => ({
  Gitlab: class MockGitlab {},
}));
vi.mock("@octokit/rest", () => ({
  Octokit: class MockOctokit {},
}));

import { createAdapter } from "../../src/adapters/adapter-factory.js";
import { GitHubAdapter } from "../../src/adapters/github-adapter.js";
import { GitLabAdapter } from "../../src/adapters/gitlab-adapter.js";

describe("createAdapter", () => {
  it("应返回 GitLabAdapter 实例", () => {
    const adapter = createAdapter("gitlab");
    expect(adapter).toBeInstanceOf(GitLabAdapter);
  });

  it("应返回 GitHubAdapter 实例", () => {
    const adapter = createAdapter("github");
    expect(adapter).toBeInstanceOf(GitHubAdapter);
  });

  it("不支持的来源应抛出错误", () => {
    // @ts-expect-error 测试非法参数
    expect(() => createAdapter("bitbucket")).toThrow("不支持的 Git 来源");
  });
});
