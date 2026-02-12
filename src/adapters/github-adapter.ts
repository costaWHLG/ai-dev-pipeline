/**
 * GitHub 适配器 — 基于 @octokit/rest
 */

import { Octokit } from "@octokit/rest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../config.js";
import type { GitAdapter, MROptions, MRResult } from "./git-adapter.js";

const execFileAsync = promisify(execFile);

export class GitHubAdapter implements GitAdapter {
  private readonly api: Octokit;

  constructor() {
    this.api = new Octokit({ auth: config.github.token });
  }

  /** 将 "owner/repo" 拆分为 owner 和 repo */
  private split(projectId: string): { owner: string; repo: string } {
    const [owner, repo] = projectId.split("/");
    return { owner, repo };
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
    const { owner, repo } = this.split(projectId);
    const { data } = await this.api.pulls.create({
      owner,
      repo,
      head: opts.sourceBranch,
      base: opts.targetBranch,
      title: opts.title,
      body: opts.description,
      draft: true,
    });
    if (opts.labels?.length) {
      await this.api.issues.addLabels({
        owner,
        repo,
        issue_number: data.number,
        labels: opts.labels,
      });
    }
    return { iid: data.number, url: data.html_url };
  }

  async updateMergeRequest(
    projectId: string,
    mrIid: number,
    opts: Partial<MROptions>,
  ): Promise<void> {
    const { owner, repo } = this.split(projectId);
    const body: Record<string, unknown> = {};
    if (opts.title !== undefined) body.title = opts.title;
    if (opts.description !== undefined) body.body = opts.description;
    if (opts.targetBranch !== undefined) body.base = opts.targetBranch;
    await this.api.pulls.update({
      owner,
      repo,
      pull_number: mrIid,
      ...body,
    });
    if (opts.labels?.length) {
      await this.api.issues.setLabels({
        owner,
        repo,
        issue_number: mrIid,
        labels: opts.labels,
      });
    }
  }

  async addComment(projectId: string, mrIid: number, body: string): Promise<void> {
    const { owner, repo } = this.split(projectId);
    await this.api.issues.createComment({
      owner,
      repo,
      issue_number: mrIid,
      body,
    });
  }

  async addIssueComment(projectId: string, issueIid: number, body: string): Promise<void> {
    // GitHub 的 PR 和 Issue 共用 issue_number
    const { owner, repo } = this.split(projectId);
    await this.api.issues.createComment({
      owner,
      repo,
      issue_number: issueIid,
      body,
    });
  }

  async getMRDiff(projectId: string, mrIid: number): Promise<string> {
    const { owner, repo } = this.split(projectId);
    const { data: files } = await this.api.pulls.listFiles({
      owner,
      repo,
      pull_number: mrIid,
      per_page: 300,
    });
    return files.map((f) => `--- a/${f.filename}\n+++ b/${f.filename}\n${f.patch ?? ""}`).join("\n");
  }

  async addIssueLabels(projectId: string, issueIid: number, labels: string[]): Promise<void> {
    const { owner, repo } = this.split(projectId);
    await this.api.issues.addLabels({
      owner,
      repo,
      issue_number: issueIid,
      labels,
    });
  }

  async getIssue(
    projectId: string,
    issueIid: number,
  ): Promise<{ title: string; description: string }> {
    const { owner, repo } = this.split(projectId);
    const { data } = await this.api.issues.get({
      owner,
      repo,
      issue_number: issueIid,
    });
    return { title: data.title, description: data.body ?? "" };
  }
}
