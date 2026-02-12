/**
 * GitLab 适配器 — 基于 @gitbeaker/rest，兼容 GitLab 12.4 v4 API
 */

import { Gitlab } from "@gitbeaker/rest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../config.js";
import type { GitAdapter, MROptions, MRResult } from "./git-adapter.js";

const execFileAsync = promisify(execFile);

export class GitLabAdapter implements GitAdapter {
  private readonly api: InstanceType<typeof Gitlab>;
  private readonly gitlabUrl: string;

  constructor() {
    this.gitlabUrl = config.gitlab.url;
    this.api = new Gitlab({
      host: this.gitlabUrl,
      token: config.gitlab.token,
    });
  }

  async cloneRepo(cloneUrl: string, workspace: string, branch?: string): Promise<void> {
    const args = ["clone", "--depth", "1"];
    if (branch) {
      args.push("--branch", branch);
    }
    args.push(cloneUrl, workspace);
    await execFileAsync("git", args);
  }

  async createBranch(workspace: string, branchName: string): Promise<void> {
    await execFileAsync("git", ["checkout", "-b", branchName], { cwd: workspace });
  }

  async commitAll(workspace: string, message: string): Promise<string> {
    const gitEnv = {
      ...process.env,
      GIT_AUTHOR_NAME: config.gitAuthorName,
      GIT_AUTHOR_EMAIL: config.gitAuthorEmail,
      GIT_COMMITTER_NAME: config.gitAuthorName,
      GIT_COMMITTER_EMAIL: config.gitAuthorEmail,
    };
    await execFileAsync("git", ["add", "-A"], { cwd: workspace, env: gitEnv });
    await execFileAsync("git", ["commit", "-m", message], { cwd: workspace, env: gitEnv });
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: workspace });
    return stdout.trim();
  }

  async push(workspace: string, branchName: string): Promise<void> {
    await execFileAsync("git", ["push", "origin", branchName], { cwd: workspace });
  }

  async createMergeRequest(projectId: string, opts: MROptions): Promise<MRResult> {
    // GitLab 12.4 使用 WIP: 前缀代替 draft
    const mr = await this.api.MergeRequests.create(
      projectId,
      opts.sourceBranch,
      opts.targetBranch,
      `WIP: ${opts.title}`,
      {
        description: opts.description,
        labels: opts.labels?.join(","),
        removeSourceBranch: opts.removeSourceBranch ?? true,
      },
    );
    // 12.4 没有 reference 字段，手动拼接 MR URL
    const projectPath = (mr as Record<string, unknown>).web_url
      ? ""
      : projectId;
    const url =
      (mr as Record<string, unknown>).web_url as string ??
      `${this.gitlabUrl}/${projectPath}/-/merge_requests/${mr.iid}`;
    return { iid: mr.iid, url };
  }

  async updateMergeRequest(
    projectId: string,
    mrIid: number,
    opts: Partial<MROptions>,
  ): Promise<void> {
    const body: Record<string, unknown> = {};
    if (opts.title !== undefined) body.title = opts.title;
    if (opts.description !== undefined) body.description = opts.description;
    if (opts.labels !== undefined) body.labels = opts.labels.join(",");
    if (opts.targetBranch !== undefined) body.targetBranch = opts.targetBranch;
    await this.api.MergeRequests.edit(projectId, mrIid, body);
  }

  async addComment(projectId: string, mrIid: number, body: string): Promise<void> {
    await this.api.MergeRequestNotes.create(projectId, mrIid, body);
  }

  async addIssueComment(projectId: string, issueIid: number, body: string): Promise<void> {
    await this.api.IssueNotes.create(projectId, issueIid, body);
  }

  async getMRDiff(projectId: string, mrIid: number): Promise<string> {
    const changes = await this.api.MergeRequests.allDiffs(projectId, mrIid);
    return (changes as Array<Record<string, unknown>>)
      .map((d) => `--- a/${d.old_path}\n+++ b/${d.new_path}\n${d.diff}`)
      .join("\n");
  }

  async addIssueLabels(projectId: string, issueIid: number, labels: string[]): Promise<void> {
    const issue = await this.api.Issues.show(issueIid, { projectId });
    const existing = ((issue as Record<string, unknown>).labels ?? []) as string[];
    const merged = [...new Set([...existing, ...labels])];
    await this.api.Issues.edit(projectId, issueIid, { labels: merged.join(",") });
  }

  async getIssue(
    projectId: string,
    issueIid: number,
  ): Promise<{ title: string; description: string }> {
    const issue = await this.api.Issues.show(issueIid, { projectId });
    return {
      title: (issue as Record<string, unknown>).title as string,
      description: ((issue as Record<string, unknown>).description as string) ?? "",
    };
  }
}
