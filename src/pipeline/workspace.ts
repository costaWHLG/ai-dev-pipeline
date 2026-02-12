/**
 * 工作目录管理
 *
 * 按项目复用工作目录，避免重复克隆
 * 目录结构：workspaces/{projectId}/
 * 产物目录：workspaces/{projectId}/.ai-pipeline/{pipelineId}/
 */

import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

/** 将 projectId 转换为安全的目录名 */
function sanitizeProjectId(projectId: string): string {
  // 替换 / 和其他不安全字符为 -
  return projectId.replace(/[\/\\:*?"<>|]/g, "-");
}

/** 获取或创建项目工作目录 */
export function getOrCreateProjectWorkspace(projectId: string): string {
  const safeName = sanitizeProjectId(projectId);
  const dir = path.join(config.workspaceDir, safeName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 创建工作目录（兼容旧接口，但推荐使用 getOrCreateProjectWorkspace） */
export function createWorkspace(pipelineId: string): string {
  const dir = path.join(config.workspaceDir, pipelineId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 清理工作目录 */
export function cleanWorkspace(projectIdOrPipelineId: string): void {
  const safeName = sanitizeProjectId(projectIdOrPipelineId);
  const dir = path.join(config.workspaceDir, safeName);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** 获取工作目录路径 */
export function getWorkspacePath(projectIdOrPipelineId: string): string {
  const safeName = sanitizeProjectId(projectIdOrPipelineId);
  return path.join(config.workspaceDir, safeName);
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
