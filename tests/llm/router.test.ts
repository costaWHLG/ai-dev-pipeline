/**
 * LLM 路由器单元测试
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { LLMRouter } from "../../src/llm/router.js";
import { DEFAULT_ROUTES, FALLBACK_ROUTES, type TaskType } from "../../src/llm/providers.js";
import { getProxyDispatcher } from "../../src/llm/proxy.js";
import type { LLMConfig } from "../../src/llm/providers.js";

// Mock config 模块，避免依赖真实环境变量
vi.mock("../../src/config.js", () => ({
  config: {
    llm: {
      anthropicApiKey: "test-anthropic-key",
      openaiApiKey: "test-openai-key",
      internalApiKey: "test-internal-key",
      internalUrl: "http://internal.local:8000",
      internalModel: "deepseek-coder-v2",
      proxy: {
        url: "http://proxy.local:7890",
        noProxy: ["internal.local", ".corp.net"],
      },
    },
  },
}));

describe("LLMRouter", () => {
  let router: LLMRouter;

  beforeEach(() => {
    router = new LLMRouter();
  });

  describe("route() — 默认路由", () => {
    const taskModels: [TaskType, string][] = [
      ["analyze", "claude-opus-4-6"],
      ["design", "claude-opus-4-6"],
      ["implement", "claude-opus-4-6"],
      ["review", "claude-opus-4-6"],
      ["fix", "claude-opus-4-6"],
    ];

    it.each(taskModels)(
      "任务 %s 应路由到模型 %s",
      (task, expectedModel) => {
        const cfg = router.route(task);
        expect(cfg.model).toBe(expectedModel);
      },
    );

    it("analyze/design 使用 anthropic 提供商", () => {
      expect(router.route("analyze").provider).toBe("anthropic");
      expect(router.route("design").provider).toBe("anthropic");
    });

    it("implement/review/fix 使用 anthropic 提供商", () => {
      expect(router.route("implement").provider).toBe("anthropic");
      expect(router.route("review").provider).toBe("anthropic");
      expect(router.route("fix").provider).toBe("anthropic");
    });

    it("应注入 anthropic API Key", () => {
      const cfg = router.route("analyze");
      expect(cfg.apiKey).toBe("test-anthropic-key");
    });

    it("应注入代理配置", () => {
      const cfg = router.route("analyze");
      expect(cfg.proxy).toBeDefined();
      expect(cfg.proxy!.url).toBe("http://proxy.local:7890");
    });
  });

  describe("fallback() — 降级路由", () => {
    it("analyze/design 降级到 deepseek-v3", () => {
      expect(router.fallback("analyze").model).toBe("deepseek-v3");
      expect(router.fallback("design").model).toBe("deepseek-v3");
    });

    it("implement/review/fix 降级到 deepseek-coder-v2", () => {
      expect(router.fallback("implement").model).toBe("deepseek-coder-v2");
      expect(router.fallback("review").model).toBe("deepseek-coder-v2");
      expect(router.fallback("fix").model).toBe("deepseek-coder-v2");
    });

    it("降级路由使用 internal 提供商", () => {
      const cfg = router.fallback("analyze");
      expect(cfg.provider).toBe("internal");
      expect(cfg.apiKey).toBe("test-internal-key");
      expect(cfg.baseUrl).toBe("http://internal.local:8000");
    });

    it("internal 提供商不注入代理", () => {
      const cfg = router.fallback("analyze");
      expect(cfg.proxy).toBeUndefined();
    });
  });

  describe("setOverride() — 手动覆盖", () => {
    it("覆盖后应返回自定义配置", () => {
      const custom: LLMConfig = {
        provider: "openai",
        model: "gpt-4o",
        maxTokens: 4096,
        temperature: 0.5,
      };
      router.setOverride("implement", custom);

      const cfg = router.route("implement");
      expect(cfg.model).toBe("gpt-4o");
      expect(cfg.provider).toBe("openai");
      expect(cfg.apiKey).toBe("test-openai-key");
    });

    it("覆盖不影响其他任务类型", () => {
      router.setOverride("implement", {
        provider: "openai",
        model: "gpt-4o",
      });

      expect(router.route("analyze").model).toBe("claude-opus-4-6");
      expect(router.route("review").model).toBe("claude-opus-4-6");
    });

    it("clearOverride 后恢复默认路由", () => {
      router.setOverride("fix", {
        provider: "openai",
        model: "gpt-4o",
      });
      expect(router.route("fix").model).toBe("gpt-4o");

      router.clearOverride("fix");
      expect(router.route("fix").model).toBe("claude-opus-4-6");
    });
  });
});

describe("getProxyDispatcher", () => {
  it("internal 提供商返回 undefined", () => {
    const result = getProxyDispatcher({
      provider: "internal",
      model: "deepseek-v3",
      proxy: { url: "http://proxy.local:7890" },
    });
    expect(result).toBeUndefined();
  });

  it("无代理配置时返回 undefined", () => {
    // 清除环境变量
    const saved = { ...process.env };
    delete process.env.LLM_PROXY_URL;
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;

    const result = getProxyDispatcher({
      provider: "anthropic",
      model: "claude-opus-4-6",
    });
    expect(result).toBeUndefined();

    // 恢复环境变量
    Object.assign(process.env, saved);
  });

  it("有代理配置时返回 ProxyAgent 实例", () => {
    const result = getProxyDispatcher({
      provider: "anthropic",
      model: "claude-opus-4-6",
      proxy: { url: "http://proxy.local:7890" },
    });
    expect(result).toBeDefined();
  });

  it("baseUrl 命中 noProxy 时返回 undefined", () => {
    const result = getProxyDispatcher({
      provider: "anthropic",
      model: "claude-opus-4-6",
      baseUrl: "http://api.corp.net/v1",
      proxy: {
        url: "http://proxy.local:7890",
        noProxy: [".corp.net"],
      },
    });
    expect(result).toBeUndefined();
  });
});
