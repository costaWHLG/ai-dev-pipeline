/**
 * 方案设计 Agent — 根据需求文档设计技术方案并拆解任务
 *
 * 输入：requirements.json + project context + tech stack
 * 输出：design.json + tasks.json（写入 .ai-pipeline/{pipelineId}/）
 */

import fs from "node:fs";
import path from "node:path";
import { BaseAgent } from "./base-agent.js";
import { detectTechStack } from "../detector/tech-stack.js";
import type { TaskType } from "../llm/providers.js";

export class DesignAgent extends BaseAgent {
  get taskType(): TaskType {
    return "design";
  }

  get systemPrompt(): string {
    return this.loadPromptTemplate("design.md");
  }

  protected buildUserMessage(input: Record<string, unknown>): string {
    const requirements = typeof input.requirements === "string"
      ? input.requirements
      : JSON.stringify(input.requirements, null, 2);
    const projectContext = (input.projectContext as string) ?? "";
    const techStack = typeof input.techStack === "string"
      ? input.techStack
      : JSON.stringify(input.techStack, null, 2);

    const template = this.loadPromptTemplate("design.md");
    return this.renderTemplate(template, {
      requirements,
      projectContext,
      techStack,
    });
  }

  async execute(
    input: Record<string, unknown>,
    workspace: string,
    pipelineId: string,
  ): Promise<unknown> {
    const artifactDir = path.join(workspace, ".ai-pipeline", pipelineId);

    // 读取上一阶段产物 requirements.json
    let requirements: unknown = input.requirements;
    if (!requirements) {
      const reqPath = path.join(artifactDir, "requirements.json");
      if (fs.existsSync(reqPath)) {
        requirements = JSON.parse(fs.readFileSync(reqPath, "utf-8"));
      }
    }

    // 检测技术栈
    const techStack = await detectTechStack(workspace);

    // 读取项目上下文
    const projectContext = input.projectContext
      ?? this.readProjectContext(workspace);

    const designInput: Record<string, unknown> = {
      requirements,
      projectContext,
      techStack,
    };

    const result = await super.execute(designInput, workspace, pipelineId);

    // 将结果写入产物目录
    if (!fs.existsSync(artifactDir)) {
      fs.mkdirSync(artifactDir, { recursive: true });
    }

    // result 可能包含 design 和 tasks 两部分
    const resultObj = result as Record<string, unknown>;
    if (resultObj.design && resultObj.tasks) {
      fs.writeFileSync(
        path.join(artifactDir, "design.json"),
        JSON.stringify(resultObj.design, null, 2),
        "utf-8",
      );
      fs.writeFileSync(
        path.join(artifactDir, "tasks.json"),
        JSON.stringify(resultObj.tasks, null, 2),
        "utf-8",
      );
    } else {
      // 模型可能直接返回了合并结构，整体写入 design.json
      fs.writeFileSync(
        path.join(artifactDir, "design.json"),
        JSON.stringify(result, null, 2),
        "utf-8",
      );
    }

    return result;
  }

  /** 尝试读取项目上下文 */
  private readProjectContext(workspace: string): string {
    for (const name of ["CLAUDE.md", "README.md"]) {
      const filePath = path.join(workspace, name);
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, "utf-8");
      }
    }
    return "(no project context found)";
  }
}
