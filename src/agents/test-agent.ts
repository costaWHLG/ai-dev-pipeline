/**
 * 测试验证 Agent — 运行 lint/test/build 并自动修复失败
 *
 * taskType: "fix"（使用快速迭代模型）
 * 流程：运行检查 → 失败时让 AI 修复 → 重试（最多 3 轮）
 */

import fs from "node:fs";
import path from "node:path";
import { BaseAgent } from "./base-agent.js";
import { detectTechStack } from "../detector/tech-stack.js";
import type { TaskType } from "../llm/providers.js";
import type { ToolChain } from "../types/toolchain.js";

/** 最大自动修复轮数 */
const MAX_FIX_ROUNDS = 3;

export class TestAgent extends BaseAgent {
  get taskType(): TaskType {
    return "fix";
  }

  get systemPrompt(): string {
    return this.loadPromptTemplate("test-fix.md");
  }

  protected buildUserMessage(input: Record<string, unknown>): string {
    const workspace = (input.workspace as string) ?? ".";
    const testCommand = (input.testCommand as string) ?? "";
    const lintCommand = (input.lintCommand as string) ?? "";
    const buildCommand = (input.buildCommand as string) ?? "";

    const template = this.loadPromptTemplate("test-fix.md");
    return this.renderTemplate(template, {
      workspace,
      testCommand,
      lintCommand,
      buildCommand,
    });
  }

  async execute(
    input: Record<string, unknown>,
    workspace: string,
    pipelineId: string,
  ): Promise<unknown> {
    // 检测技术栈以获取命令
    const toolchain = await detectTechStack(workspace);

    const testInput: Record<string, unknown> = {
      workspace,
      testCommand: input.testCommand ?? toolchain.test,
      lintCommand: input.lintCommand ?? toolchain.lint,
      buildCommand: input.buildCommand ?? toolchain.build,
    };

    // 委托给基类的 agent 循环
    const result = await super.execute(testInput, workspace, pipelineId);

    // 将测试输出写入 test-report.log
    const artifactDir = path.join(workspace, ".ai-pipeline", pipelineId);
    if (!fs.existsSync(artifactDir)) {
      fs.mkdirSync(artifactDir, { recursive: true });
    }
    const reportContent = typeof result === "string"
      ? result
      : JSON.stringify(result, null, 2);
    fs.writeFileSync(
      path.join(artifactDir, "test-report.log"),
      reportContent,
      "utf-8",
    );

    return result;
  }
}
