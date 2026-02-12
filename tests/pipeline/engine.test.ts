/**
 * 流水线引擎测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { PipelineEngine } from "../../src/pipeline/engine.js";
import { StateStore } from "../../src/pipeline/state.js";
import { AuditLogger } from "../../src/audit/logger.js";
import { Notifier } from "../../src/pipeline/notifier.js";
import type { DevEvent } from "../../src/types/index.js";

function createTestEvent(overrides?: Partial<DevEvent>): DevEvent {
  return {
    id: "test-event-1",
    source: "gitlab",
    type: "issue_labeled",
    receivedAt: new Date().toISOString(),
    project: {
      id: "123",
      name: "test-project",
      cloneUrl: "git@example.com:test/project.git",
      defaultBranch: "main",
    },
    payload: {
      issueIid: 42,
      title: "测试 Issue",
      description: "测试描述",
      labels: ["auto-implement"],
    },
    ...overrides,
  };
}

describe("PipelineEngine", () => {
  let tmpDir: string;
  let stateStore: StateStore;
  let auditLogger: AuditLogger;
  let notifier: Notifier;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-test-"));
    const dbPath = path.join(tmpDir, "test.db");
    const auditDir = path.join(tmpDir, "audit");
    const workspaceDir = path.join(tmpDir, "workspaces");
    fs.mkdirSync(workspaceDir, { recursive: true });

    // 临时覆盖 config
    process.env.WORKSPACE_DIR = workspaceDir;
    process.env.AUDIT_DIR = auditDir;

    stateStore = new StateStore(dbPath);
    auditLogger = new AuditLogger(auditDir);
    notifier = new Notifier(() => ({
      cloneRepo: async () => {},
      createBranch: async () => {},
      commitAll: async () => "abc123",
      push: async () => {},
      createMergeRequest: async () => ({ iid: 1, url: "http://example.com/mr/1" }),
      updateMergeRequest: async () => {},
      addComment: async () => {},
      addIssueComment: async () => {},
      getMRDiff: async () => "diff",
      addIssueLabels: async () => {},
      getIssue: async () => ({ title: "test", description: "test" }),
    }));
  });

  afterEach(() => {
    stateStore.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("应该创建流水线实例", () => {
    const engine = new PipelineEngine({
      stateStore,
      auditLogger,
      notifier,
      agentExecutor: async () => ({}),
    });

    const event = createTestEvent();
    const instance = engine.create(event);

    expect(instance.id).toBeTruthy();
    expect(instance.status).toBe("running");
    expect(instance.event).toEqual(event);
    expect(instance.branch).toContain("feature/issue-42");
  });

  it("应该成功执行所有阶段", async () => {
    const executedStages: string[] = [];
    const engine = new PipelineEngine({
      stateStore,
      auditLogger,
      notifier,
      agentExecutor: async (agentType) => {
        executedStages.push(agentType);
        return {};
      },
    });

    const event = createTestEvent();
    const instance = engine.create(event);
    const result = await engine.run(instance);

    expect(result.status).toBe("success");
    expect(result.completedAt).toBeTruthy();
    expect(executedStages).toContain("analyze");
    expect(executedStages).toContain("design");
    expect(executedStages).toContain("implement");
  });

  it("应该在阶段失败后重试", async () => {
    let callCount = 0;
    const engine = new PipelineEngine({
      stateStore,
      auditLogger,
      notifier,
      agentExecutor: async (agentType) => {
        if (agentType === "analyze") {
          callCount++;
          if (callCount <= 1) throw new Error("模拟失败");
        }
        return {};
      },
    });

    const event = createTestEvent();
    const instance = engine.create(event);
    const result = await engine.run(instance);

    expect(result.status).toBe("success");
    expect(callCount).toBe(2); // 第一次失败 + 第一次重试成功
  });

  it("应该在超过最大重试次数后标记为 blocked", async () => {
    const engine = new PipelineEngine({
      stateStore,
      auditLogger,
      notifier,
      agentExecutor: async (agentType) => {
        if (agentType === "analyze") throw new Error("持续失败");
        return {};
      },
    });

    const event = createTestEvent();
    const instance = engine.create(event);
    const result = await engine.run(instance);

    // analyze 阶段 onFailure 是 "notify"，所以应该是 blocked
    expect(result.status).toBe("blocked");
  });

  it("应该持久化并恢复状态", () => {
    const engine = new PipelineEngine({
      stateStore,
      auditLogger,
      notifier,
      agentExecutor: async () => ({}),
    });

    const event = createTestEvent();
    const instance = engine.create(event);

    const restored = engine.getStatus(instance.id);
    expect(restored).toBeTruthy();
    expect(restored!.id).toBe(instance.id);
  });
});
