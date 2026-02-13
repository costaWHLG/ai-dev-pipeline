/**
 * 需求分析 Agent — 从 Issue 描述中提取结构化需求
 *
 * 输入：issue title + description + project context
 * 输出：requirements.json（写入 .ai-pipeline/{pipelineId}/）
 */

import fs from "node:fs";
import path from "node:path";
import { BaseAgent } from "./base-agent.js";
import type { TaskType } from "../llm/providers.js";

export class AnalyzeAgent extends BaseAgent {
  get taskType(): TaskType {
    return "analyze";
  }

  get systemPrompt(): string {
    const template = this.loadPromptTemplate("analyze.md");
    return template;
  }

  protected buildUserMessage(input: Record<string, unknown>): string {
    const title = (input.title as string) ?? "";
    const description = (input.description as string) ?? "";
    const projectContext = (input.projectContext as string) ?? "";

    const template = this.loadPromptTemplate("analyze.md");
    return this.renderTemplate(template, {
      title,
      description,
      projectContext,
    });
  }

  async execute(
    input: Record<string, unknown>,
    workspace: string,
    pipelineId: string,
  ): Promise<unknown> {
    // 从事件中提取分析所需字段
    const event = input.event as Record<string, any> | undefined;
    const payload = event?.payload ?? input;

    const analyzeInput: Record<string, unknown> = {
      title: payload.title ?? input.title ?? "",
      description: payload.description ?? input.description ?? "",
      projectContext: input.projectContext ?? await this.readProjectContext(workspace),
    };

    const result = await super.execute(analyzeInput, workspace, pipelineId) as Record<string, unknown>;

    // 将结果写入产物目录
    const artifactDir = path.join(workspace, ".ai-pipeline", pipelineId);
    if (!fs.existsSync(artifactDir)) {
      fs.mkdirSync(artifactDir, { recursive: true });
    }
    const outputPath = path.join(artifactDir, "requirements.json");
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");

    // confidence 低于阈值时抛出错误，触发人工澄清
    const confidence = typeof result?.confidence === "number" ? result.confidence : 1;
    const questions = Array.isArray(result?.clarificationQuestions) ? result.clarificationQuestions : [];

    if (confidence < 0.7 && questions.length > 0) {
      const questionList = questions.map((q: string, i: number) => `${i + 1}. ${q}`).join("\n");
      throw new Error(
        `需求置信度不足 (${confidence})，需要澄清以下问题:\n${questionList}`
      );
    }

    return result;
  }

  /** 尝试读取项目上下文（CLAUDE.md 或 README.md） */
  private async readProjectContext(workspace: string): Promise<string> {
    for (const name of ["CLAUDE.md", "README.md"]) {
      const filePath = path.join(workspace, name);
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, "utf-8");
      }
    }
    return "(no project context found)";
  }
}
