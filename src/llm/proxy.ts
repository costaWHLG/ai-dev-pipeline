/**
 * HTTP 代理配置 — 为外部 LLM 请求提供代理支持
 */

import { ProxyAgent, type Dispatcher } from "undici";
import type { LLMConfig } from "./providers.js";

/**
 * 根据 LLMConfig 返回代理 Dispatcher
 * - internal 提供商跳过代理（内网直连）
 * - 优先使用 config.proxy，其次读取 LLM_PROXY_URL / HTTPS_PROXY 环境变量
 * - 命中 noProxy 列表时返回 undefined
 */
export function getProxyDispatcher(cfg: LLMConfig): Dispatcher | undefined {
  // 内部模型不走代理
  if (cfg.provider === "internal") {
    return undefined;
  }

  const proxyUrl = cfg.proxy?.url
    || process.env.LLM_PROXY_URL
    || process.env.HTTPS_PROXY
    || process.env.HTTP_PROXY;

  if (!proxyUrl) {
    return undefined;
  }

  // 检查 noProxy 列表：如果目标地址匹配则跳过代理
  if (cfg.baseUrl) {
    const noProxyList = cfg.proxy?.noProxy ?? parseNoProxy();
    if (isNoProxy(cfg.baseUrl, noProxyList)) {
      return undefined;
    }
  }

  return new ProxyAgent(proxyUrl);
}

/** 从环境变量解析 noProxy 列表 */
function parseNoProxy(): string[] {
  const raw = process.env.LLM_NO_PROXY || process.env.NO_PROXY || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 判断目标 URL 是否在 noProxy 列表中 */
function isNoProxy(targetUrl: string, noProxyList: string[]): boolean {
  if (noProxyList.length === 0) return false;

  let hostname: string;
  try {
    hostname = new URL(targetUrl).hostname;
  } catch {
    return false;
  }

  return noProxyList.some((entry) => {
    // 支持 ".example.com" 后缀匹配和精确匹配
    if (entry.startsWith(".")) {
      return hostname.endsWith(entry) || hostname === entry.slice(1);
    }
    return hostname === entry;
  });
}
