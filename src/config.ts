/**
 * 配置模块 — 从环境变量读取所有配置项
 */

import "dotenv/config";
import path from "node:path";

export interface ProxyConfig {
  url: string;
  noProxy: string[];
}

export interface GitLabConfig {
  url: string;
  token: string;
  webhookSecret: string;
}

export interface GitHubConfig {
  token: string;
  webhookSecret: string;
}

export interface LLMProviderConfig {
  anthropicApiKey: string;
  openaiApiKey: string;
  internalUrl: string;
  internalApiKey: string;
  internalModel: string;
  proxy?: ProxyConfig;
}

export interface Config {
  port: number;
  nodeEnv: string;
  sqlitePath: string;
  gitlab: GitLabConfig;
  github: GitHubConfig;
  llm: LLMProviderConfig;
  workspaceDir: string;
  auditDir: string;
  gitAuthorName: string;
  gitAuthorEmail: string;
  mcpGlobalConfig: string;
  skillsGlobalDir: string;
  wecomWebhookUrl: string;
}

function env(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

function buildProxyConfig(): ProxyConfig | undefined {
  const url = env("LLM_PROXY_URL") || env("HTTPS_PROXY") || env("HTTP_PROXY");
  if (!url) return undefined;
  const noProxy = env("LLM_NO_PROXY", env("NO_PROXY"))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { url, noProxy };
}

export function loadConfig(): Config {
  return {
    port: parseInt(env("PORT", "8080"), 10),
    nodeEnv: env("NODE_ENV", "development"),
    sqlitePath: env("SQLITE_PATH", "./data/pipeline.db"),
    gitlab: {
      url: env("GITLAB_URL"),
      token: env("GITLAB_TOKEN"),
      webhookSecret: env("GITLAB_WEBHOOK_SECRET"),
    },
    github: {
      token: env("GITHUB_TOKEN"),
      webhookSecret: env("GITHUB_WEBHOOK_SECRET"),
    },
    llm: {
      anthropicApiKey: env("ANTHROPIC_API_KEY"),
      openaiApiKey: env("OPENAI_API_KEY"),
      internalUrl: env("INTERNAL_LLM_URL"),
      internalApiKey: env("INTERNAL_LLM_API_KEY"),
      internalModel: env("INTERNAL_LLM_MODEL", "deepseek-coder-v2"),
      proxy: buildProxyConfig(),
    },
    workspaceDir: path.resolve(env("WORKSPACE_DIR", "./data/workspaces")),
    auditDir: path.resolve(env("AUDIT_DIR", "./data/audit")),
    gitAuthorName: env("GIT_AUTHOR_NAME", "AI Dev Pipeline"),
    gitAuthorEmail: env("GIT_AUTHOR_EMAIL", "ai-bot@company.com"),
    mcpGlobalConfig: env("MCP_GLOBAL_CONFIG", "~/.ai-pipeline/mcp-servers.json"),
    skillsGlobalDir: env("SKILLS_GLOBAL_DIR", "~/.ai-pipeline/skills"),
    wecomWebhookUrl: env("WECOM_WEBHOOK_URL"),
  };
}

/** 全局配置单例 */
export const config = loadConfig();
