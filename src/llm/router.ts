/**
 * LLM 路由器 — 根据任务类型选择模型配置，注入 API Key 与代理
 */

import { config } from "../config.js";
import { DEFAULT_ROUTES, FALLBACK_ROUTES, type LLMConfig, type TaskType } from "./providers.js";

export class LLMRouter {
  /** 手动覆盖表，优先级最高 */
  private overrides = new Map<TaskType, LLMConfig>();

  /**
   * 根据任务类型返回完整的 LLMConfig（含 API Key 和代理配置）
   */
  route(task: TaskType): LLMConfig {
    const base = this.overrides.get(task)
      ?? DEFAULT_ROUTES.get(task);

    if (!base) {
      throw new Error(`No route configured for task type: ${task}`);
    }

    return this.injectSecrets({ ...base });
  }

  /**
   * 获取降级路由配置
   */
  fallback(task: TaskType): LLMConfig {
    const base = FALLBACK_ROUTES.get(task);
    if (!base) {
      throw new Error(`No fallback route configured for task type: ${task}`);
    }
    return this.injectSecrets({ ...base });
  }

  /**
   * 手动覆盖指定任务类型的路由
   */
  setOverride(task: TaskType, cfg: LLMConfig): void {
    this.overrides.set(task, cfg);
  }

  /**
   * 清除指定任务类型的覆盖
   */
  clearOverride(task: TaskType): void {
    this.overrides.delete(task);
  }

  /** 注入 API Key、baseUrl、代理等运行时配置 */
  private injectSecrets(cfg: LLMConfig): LLMConfig {
    switch (cfg.provider) {
      case "anthropic":
        cfg.apiKey = cfg.apiKey || config.llm.anthropicApiKey;
        break;
      case "openai":
        cfg.apiKey = cfg.apiKey || config.llm.openaiApiKey;
        break;
      case "internal":
        cfg.apiKey = cfg.apiKey || config.llm.internalApiKey;
        cfg.baseUrl = cfg.baseUrl || config.llm.internalUrl;
        break;
    }

    // 为非内部提供商注入代理配置
    if (cfg.provider !== "internal" && !cfg.proxy && config.llm.proxy) {
      cfg.proxy = { ...config.llm.proxy };
    }

    return cfg;
  }
}
