/**
 * Pipeline 状态持久化 — SQLite
 */

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import type { PipelineInstance } from "../types/index.js";

export class StateStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath ?? config.sqlitePath;
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    this.db = new Database(resolvedPath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pipelines (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        status TEXT NOT NULL,
        project_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pipelines_status ON pipelines(status)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pipelines_project ON pipelines(project_id)
    `);
  }

  /** 保存流水线状态 */
  save(instance: PipelineInstance): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO pipelines (id, data, status, project_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      instance.id,
      JSON.stringify(instance),
      instance.status,
      instance.event.project.id,
      instance.createdAt,
      new Date().toISOString(),
    );
  }

  /** 获取流水线状态 */
  get(pipelineId: string): PipelineInstance | null {
    const row = this.db.prepare("SELECT data FROM pipelines WHERE id = ?").get(pipelineId) as
      | { data: string }
      | undefined;
    return row ? JSON.parse(row.data) : null;
  }

  /** 获取未完成的流水线（用于服务重启恢复） */
  getIncomplete(): PipelineInstance[] {
    const rows = this.db
      .prepare("SELECT data FROM pipelines WHERE status IN ('running', 'blocked') ORDER BY created_at ASC")
      .all() as { data: string }[];
    return rows.map((r) => JSON.parse(r.data));
  }

  /** 列出流水线（支持 status 和 project_id 过滤） */
  list(filters?: { status?: string; projectId?: string }): PipelineInstance[] {
    let sql = "SELECT data FROM pipelines WHERE 1=1";
    const params: string[] = [];
    if (filters?.status) {
      sql += " AND status = ?";
      params.push(filters.status);
    }
    if (filters?.projectId) {
      sql += " AND project_id = ?";
      params.push(filters.projectId);
    }
    sql += " ORDER BY created_at DESC";
    const rows = this.db.prepare(sql).all(...params) as { data: string }[];
    return rows.map((r) => JSON.parse(r.data));
  }

  /** 获取项目的所有流水线 */
  getByProject(projectId: string): PipelineInstance[] {
    const rows = this.db
      .prepare("SELECT data FROM pipelines WHERE project_id = ? ORDER BY created_at DESC")
      .all(projectId) as { data: string }[];
    return rows.map((r) => JSON.parse(r.data));
  }

  /** 关闭数据库连接 */
  close(): void {
    this.db.close();
  }
}
