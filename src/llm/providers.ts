/**
 * LLM 模型配置表 — 定义任务类型到模型的默认路由与降级路由
 */

/** 流水线任务类型 */
export type TaskType = "analyze" | "design" | "implement" | "review" | "fix";

/** LLM 调用配置 */
export interface LLMConfig {
  provider: "anthropic" | "openai" | "internal";
  model: string;
  baseUrl?: string;
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
  proxy?: {
    url: string;
    noProxy?: string[];
  };
}

/** 默认路由：按任务类型分配模型 */
export const DEFAULT_ROUTES: ReadonlyMap<TaskType, LLMConfig> = new Map<TaskType, LLMConfig>([
  [
    "analyze",
    {
      provider: "anthropic",
      model: "claude-opus-4-6",
      maxTokens: 16384,
      temperature: 0.3,
    },
  ],
  [
    "design",
    {
      provider: "anthropic",
      model: "claude-opus-4-6",
      maxTokens: 16384,
      temperature: 0.4,
    },
  ],
  [
    "implement",
    {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      maxTokens: 8192,
      temperature: 0.2,
    },
  ],
  [
    "review",
    {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      maxTokens: 8192,
      temperature: 0.2,
    },
  ],
  [
    "fix",
    {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      maxTokens: 8192,
      temperature: 0.2,
    },
  ],
]);

/** 降级路由：当主路由不可用时使用内部模型 */
export const FALLBACK_ROUTES: ReadonlyMap<TaskType, LLMConfig> = new Map<TaskType, LLMConfig>([
  [
    "analyze",
    {
      provider: "internal",
      model: "deepseek-v3",
      maxTokens: 16384,
      temperature: 0.3,
    },
  ],
  [
    "design",
    {
      provider: "internal",
      model: "deepseek-v3",
      maxTokens: 16384,
      temperature: 0.4,
    },
  ],
  [
    "implement",
    {
      provider: "internal",
      model: "deepseek-coder-v2",
      maxTokens: 8192,
      temperature: 0.2,
    },
  ],
  [
    "review",
    {
      provider: "internal",
      model: "deepseek-coder-v2",
      maxTokens: 8192,
      temperature: 0.2,
    },
  ],
  [
    "fix",
    {
      provider: "internal",
      model: "deepseek-coder-v2",
      maxTokens: 8192,
      temperature: 0.2,
    },
  ],
]);
