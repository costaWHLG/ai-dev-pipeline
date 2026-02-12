/**
 * 工作目录管理
 */

import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

/** 创建工作目录 */
export function createWorkspace(pipelineId: string): string {
  const dir = path.join(config.workspaceDir, pipelineId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 清理工作目录 */
export function cleanWorkspace(pipelineId: string): void {
  const dir = path.join(config.workspaceDir, pipelineId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** 获取工作目录路径 */
export function getWorkspacePath(pipelineId: string): string {
  return path.join(config.workspaceDir, pipelineId);
}

/** 创建流水线产物目录 */
export function createArtifactDir(workspace: string, pipelineId: string): string {
  const dir = path.join(workspace, ".ai-pipeline", pipelineId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 清理过期工作目录（保留最近 N 天） */
export function cleanExpiredWorkspaces(retainDays: number = 7): void {
  const baseDir = config.workspaceDir;
  if (!fs.existsSync(baseDir)) return;

  const cutoff = Date.now() - retainDays * 24 * 60 * 60 * 1000;
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(baseDir, entry.name);
    const stat = fs.statSync(dirPath);
    if (stat.mtimeMs < cutoff) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  }
}
