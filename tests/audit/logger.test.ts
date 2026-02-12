import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { AuditLogger } from "../../src/audit/logger.js";
import type { AuditRecord } from "../../src/types/index.js";

describe("AuditLogger", () => {
  let tmpDir: string;
  let logger: AuditLogger;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-test-"));
    logger = new AuditLogger(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeRecord(overrides: Partial<AuditRecord> = {}): AuditRecord {
    return {
      timestamp: new Date().toISOString(),
      pipelineId: "pipe-001",
      event: "pipeline_start",
      ...overrides,
    };
  }

  it("应自动创建审计目录", () => {
    const nestedDir = path.join(tmpDir, "a", "b", "c");
    new AuditLogger(nestedDir);
    expect(fs.existsSync(nestedDir)).toBe(true);
  });

  it("应写入并读取单条记录", () => {
    const record = makeRecord();
    logger.log(record);

    const records = logger.getPipelineLog("pipe-001");
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(record);
  });

  it("应按顺序追加多条记录", () => {
    const r1 = makeRecord({ event: "pipeline_start" });
    const r2 = makeRecord({ event: "stage_start", stage: "design" });
    const r3 = makeRecord({ event: "stage_complete", stage: "design", duration: 1200 });

    logger.log(r1);
    logger.log(r2);
    logger.log(r3);

    const records = logger.getPipelineLog("pipe-001");
    expect(records).toHaveLength(3);
    expect(records[0].event).toBe("pipeline_start");
    expect(records[1].event).toBe("stage_start");
    expect(records[2].event).toBe("stage_complete");
    expect(records[2].duration).toBe(1200);
  });

  it("不同流水线应写入不同文件", () => {
    const r1 = makeRecord({ pipelineId: "pipe-A" });
    const r2 = makeRecord({ pipelineId: "pipe-B" });

    logger.log(r1);
    logger.log(r2);

    expect(logger.getPipelineLog("pipe-A")).toHaveLength(1);
    expect(logger.getPipelineLog("pipe-B")).toHaveLength(1);
  });

  it("不存在的流水线应返回空数组", () => {
    expect(logger.getPipelineLog("nonexistent")).toEqual([]);
  });

  it("应正确序列化 metadata 字段", () => {
    const record = makeRecord({
      event: "llm_invoke",
      metadata: { model: "claude-opus-4-6", tokens: 1500, tags: ["code", "review"] },
    });
    logger.log(record);

    const [restored] = logger.getPipelineLog("pipe-001");
    expect(restored.metadata).toEqual({
      model: "claude-opus-4-6",
      tokens: 1500,
      tags: ["code", "review"],
    });
  });

  it("写入的文件应为合法的 JSON Lines 格式", () => {
    logger.log(makeRecord({ event: "pipeline_start" }));
    logger.log(makeRecord({ event: "pipeline_complete" }));

    const filePath = path.join(tmpDir, "pipe-001.jsonl");
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim() !== "");

    expect(lines).toHaveLength(2);
    // 每行都应是合法 JSON
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});
