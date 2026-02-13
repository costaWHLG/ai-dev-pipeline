/**
 * .ai-pipeline.json 项目级配置类型定义
 *
 * 放在项目根目录，覆盖全局默认行为
 */

import fs from "node:fs";
import path from "node:path";

/** 阶段覆盖配置 */
export interface StageOverride {
  /** 跳过此阶段 */
  skip?: boolean;
  /** 覆盖最大重试次数 */
  maxRetries?: number;
  /** 覆盖超时时间（毫秒） */
  timeout?: number;
}

/** LLM 模型覆盖 */
export interface LLMOverride {
  /** 覆盖指定任务类型的模型 */
  model?: string;
  /** 覆盖温度参数 */
  temperature?: number;
  /** 覆盖最大 token 数 */
  maxTokens?: number;
}

/** MCP Server 配置 */
export interface MCPServerConfigDef {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  transport?: "stdio" | "sse";
  description?: string;
}

/** 项目级配置 */
export interface ProjectConfig {
  /** 阶段覆盖 */
  stages?: Record<string, StageOverride>;
  /** LLM 覆盖（按 TaskType） */
  llm?: Record<string, LLMOverride>;
  /** MCP Server 配置 */
  mcpServers?: Record<string, MCPServerConfigDef>;
  /** 自定义触发标签（默认 "auto-implement"） */
  triggerLabel?: string;
  /** 自定义分支前缀（默认 "feature/"） */
  branchPrefix?: string;
  /** 跳过的阶段列表 */
  skipStages?: string[];
}

/** 从项目工作目录加载 .ai-pipeline.json */
export function loadProjectConfig(workspace: string): ProjectConfig | null {
  const configPath = path.join(workspace, ".ai-pipeline.json");
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf-8")) as ProjectConfig;
  } catch {
    return null;
  }
}
