/**
 * Git 适配器接口定义 — GitLab / GitHub 统一抽象
 */

export interface MROptions {
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
  labels?: string[];
  removeSourceBranch?: boolean;
}

export interface MRResult {
  iid: number;
  url: string;
}

export interface GitAdapter {
  cloneRepo(cloneUrl: string, workspace: string, branch?: string): Promise<void>;
  createBranch(workspace: string, branchName: string): Promise<void>;
  commitAll(workspace: string, message: string): Promise<string>;
  push(workspace: string, branchName: string): Promise<void>;
  createMergeRequest(projectId: string, opts: MROptions): Promise<MRResult>;
  updateMergeRequest(projectId: string, mrIid: number, opts: Partial<MROptions>): Promise<void>;
  addComment(projectId: string, mrIid: number, body: string): Promise<void>;
  addIssueComment(projectId: string, issueIid: number, body: string): Promise<void>;
  getMRDiff(projectId: string, mrIid: number): Promise<string>;
  addIssueLabels(projectId: string, issueIid: number, labels: string[]): Promise<void>;
  getIssue(projectId: string, issueIid: number): Promise<{ title: string; description: string }>;
}
