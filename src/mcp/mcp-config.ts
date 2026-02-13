/**
 * MCP 配置加载 — 从 .ai-pipeline.json 和全局配置读取 MCP Server 定义
 */

import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

/** MCP Server 配置（stdio 模式） */
export interface MCPServerStdioConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  description?: string;
  transport?: "stdio";
}

/** MCP Server 配置（SSE 模式） */
export interface MCPServerSSEConfig {
  url: string;
  transport: "sse";
  description?: string;
}

export type MCPServerConfig = MCPServerStdioConfig | MCPServerSSEConfig;

export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

/** 加载 MCP 配置，项目级覆盖全局 */
export function loadMCPConfig(projectDir?: string): MCPConfig {
  const merged: Record<string, MCPServerConfig> = {};

  // 1. 全局配置（优先级低）
  const globalPath = config.mcpGlobalConfig.replace(
    /^~/,
    process.env.HOME ?? process.env.USERPROFILE ?? "",
  );
  if (fs.existsSync(globalPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(globalPath, "utf-8"));
      if (raw.mcpServers) Object.assign(merged, raw.mcpServers);
    } catch (err) {
      console.warn(`Failed to load global MCP config: ${globalPath}`, err);
    }
  }

  // 2. 项目级配置（优先级高）
  if (projectDir) {
    const projectPath = path.join(projectDir, ".ai-pipeline.json");
    if (fs.existsSync(projectPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
        if (raw.mcpServers) Object.assign(merged, raw.mcpServers);
      } catch (err) {
        console.warn(`Failed to load project MCP config: ${projectPath}`, err);
      }
    }
  }

  return { mcpServers: merged };
}
