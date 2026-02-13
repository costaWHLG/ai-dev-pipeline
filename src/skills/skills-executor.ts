/**
 * Skills 执行器 — 渲染模板 + 调用 LLM 执行 Skill
 */

import Anthropic from "@anthropic-ai/sdk";
import { LLMRouter } from "../llm/router.js";
import { AuditLogger } from "../audit/logger.js";
import type { SkillDefinition } from "./skills-loader.js";
import type { SkillsManager } from "./skills-manager.js";

export class SkillsExecutor {
  private manager: SkillsManager;
  private router: LLMRouter;
  private auditLogger: AuditLogger;

  constructor(manager: SkillsManager, router?: LLMRouter, auditLogger?: AuditLogger) {
    this.manager = manager;
    this.router = router ?? new LLMRouter();
    this.auditLogger = auditLogger ?? new AuditLogger();
  }

  /** 按名称执行 Skill */
  async execute(
    skillName: string,
    inputs: Record<string, string>,
    pipelineId?: string,
  ): Promise<string> {
    const skill = this.manager.find(skillName);
    if (!skill) throw new Error(`Skill not found: "${skillName}"`);
    return this.executeSkill(skill, inputs, pipelineId);
  }

  /** 直接执行 Skill 定义 */
  async executeSkill(
    skill: SkillDefinition,
    inputs: Record<string, string>,
    pipelineId?: string,
  ): Promise<string> {
    // 渲染模板
    let prompt = skill.template;
    for (const [key, value] of Object.entries(inputs)) {
      prompt = prompt.replaceAll(`{{${key}}}`, value);
    }

    const llmConfig = this.router.route("review");
    const pid = pipelineId ?? "skill-exec";

    this.auditLogger.log({
      timestamp: new Date().toISOString(),
      pipelineId: pid,
      stage: "skill",
      event: "llm_invoke",
      metadata: { skill: skill.name, model: llmConfig.model },
    });

    const client = new Anthropic({
      apiKey: llmConfig.apiKey,
      baseURL: llmConfig.baseUrl,
    });

    const startTime = Date.now();
    const response = await client.messages.create({
      model: llmConfig.model,
      max_tokens: 4096,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    this.auditLogger.log({
      timestamp: new Date().toISOString(),
      pipelineId: pid,
      stage: "skill",
      event: "llm_result",
      duration: Date.now() - startTime,
      metadata: {
        skill: skill.name,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    });

    return text;
  }
}
