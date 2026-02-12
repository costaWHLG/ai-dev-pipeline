/**
 * 远端仓库创建器 — 在 GitLab/GitHub 上创建新仓库
 */

import { Gitlab } from "@gitbeaker/rest";
import { Octokit } from "@octokit/rest";
import { config } from "../config.js";

export interface CreateRepoOptions {
  name: string;
  description?: string;
  visibility?: "public" | "private" | "internal";
  namespaceId?: number; // GitLab 专用：组/用户 namespace ID
}

export interface CreateRepoResult {
  id: string;
  name: string;
  cloneUrl: string;
  webUrl: string;
  defaultBranch: string;
}

/**
 * 在 GitLab 上创建仓库
 */
export async function createGitLabRepo(options: CreateRepoOptions): Promise<CreateRepoResult> {
  const gitlab = new Gitlab({
    host: config.gitlab.url,
    token: config.gitlab.token,
  });

  const project = await gitlab.Projects.create({
    name: options.name,
    description: options.description,
    visibility: options.visibility ?? "private",
    namespaceId: options.namespaceId,
    initializeWithReadme: false,
  });

  return {
    id: String(project.id),
    name: project.name,
    cloneUrl: project.ssh_url_to_repo ?? project.http_url_to_repo,
    webUrl: project.web_url,
    defaultBranch: project.default_branch ?? "main",
  };
}

/**
 * 在 GitHub 上创建仓库
 */
export async function createGitHubRepo(options: CreateRepoOptions): Promise<CreateRepoResult> {
  const octokit = new Octokit({ auth: config.github.token });

  const { data: repo } = await octokit.repos.createForAuthenticatedUser({
    name: options.name,
    description: options.description,
    private: options.visibility !== "public",
    auto_init: false,
  });

  return {
    id: `${repo.owner.login}/${repo.name}`,
    name: repo.name,
    cloneUrl: repo.clone_url,
    webUrl: repo.html_url,
    defaultBranch: repo.default_branch ?? "main",
  };
}

/**
 * 根据平台创建仓库
 */
export async function createRepo(
  platform: "gitlab" | "github",
  options: CreateRepoOptions,
): Promise<CreateRepoResult> {
  switch (platform) {
    case "gitlab":
      return createGitLabRepo(options);
    case "github":
      return createGitHubRepo(options);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * 在 GitLab 上配置 Webhook
 */
export async function configureGitLabWebhook(
  projectId: string,
  webhookUrl: string,
  secret?: string,
): Promise<void> {
  const gitlab = new Gitlab({
    host: config.gitlab.url,
    token: config.gitlab.token,
  });

  await gitlab.ProjectHooks.add(projectId, webhookUrl, {
    pushEvents: true,
    issuesEvents: true,
    mergeRequestsEvents: true,
    noteEvents: true,
    token: secret,
  });
}

/**
 * 在 GitHub 上配置 Webhook
 */
export async function configureGitHubWebhook(
  owner: string,
  repo: string,
  webhookUrl: string,
  secret?: string,
): Promise<void> {
  const octokit = new Octokit({ auth: config.github.token });

  await octokit.repos.createWebhook({
    owner,
    repo,
    config: {
      url: webhookUrl,
      content_type: "json",
      secret,
    },
    events: ["issues", "pull_request", "issue_comment"],
    active: true,
  });
}
