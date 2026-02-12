/**
 * 审计日志模块 — 以 JSON Lines 格式记录流水线执行过程
 */

import fs from "node:fs";
import path from "node:path";

import { config } from "../config.js";
import type { AuditRecord } from "../types/index.js";

export class AuditLogger {
  private readonly auditDir: string;

  constructor(auditDir?: string) {
    this.auditDir = auditDir ?? config.auditDir;
    this.ensureDir();
  }

  /** 追加一条审计记录到对应流水线的日志文件 */
  log(record: AuditRecord): void {
    const filePath = this.filePath(record.pipelineId);
    const line = JSON.stringify(record) + "\n";
    fs.appendFileSync(filePath, line, "utf-8");
  }

  /** 读取指定流水线的全部审计记录 */
  getPipelineLog(pipelineId: string): AuditRecord[] {
    const filePath = this.filePath(pipelineId);
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const content = fs.readFileSync(filePath, "utf-8");
    return content
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as AuditRecord);
  }

  /** 获取日志文件路径 */
  private filePath(pipelineId: string): string {
    return path.join(this.auditDir, `${pipelineId}.jsonl`);
  }

  /** 确保审计目录存在 */
  private ensureDir(): void {
    if (!fs.existsSync(this.auditDir)) {
      fs.mkdirSync(this.auditDir, { recursive: true });
    }
  }
}
