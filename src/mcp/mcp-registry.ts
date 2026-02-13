/**
 * MCP 工具注册表 — 管理已发现的 MCP 工具，转换为 Anthropic Tool 格式
 */

import type Anthropic from "@anthropic-ai/sdk";

/** MCP 工具定义（从 MCP Server 发现） */
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverName: string;
}

export class MCPRegistry {
  private tools = new Map<string, MCPToolDefinition>();

  /** 注册从 MCP Server 发现的工具 */
  registerTools(serverName: string, tools: MCPToolDefinition[]): void {
    for (const tool of tools) {
      const qualifiedName = `mcp_${serverName}_${tool.name}`;
      this.tools.set(qualifiedName, { ...tool, name: qualifiedName, serverName });
    }
  }

  /** 移除某个 Server 的所有工具 */
  unregisterServer(serverName: string): void {
    for (const [name, tool] of this.tools) {
      if (tool.serverName === serverName) {
        this.tools.delete(name);
      }
    }
  }

  /** 转换为 Anthropic Tool 格式 */
  getAnthropicTools(): Anthropic.Messages.Tool[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: `[MCP:${tool.serverName}] ${tool.description}`,
      input_schema: { type: "object" as const, ...tool.inputSchema },
    }));
  }

  /** 判断工具名是否属于 MCP */
  isMCPTool(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  /** 获取工具所属的 Server 名 */
  getServerForTool(toolName: string): string | undefined {
    return this.tools.get(toolName)?.serverName;
  }

  /** 获取原始工具名（去掉 mcp_ 前缀） */
  getOriginalToolName(qualifiedName: string): string | undefined {
    const tool = this.tools.get(qualifiedName);
    if (!tool) return undefined;
    const prefix = `mcp_${tool.serverName}_`;
    return qualifiedName.startsWith(prefix) ? qualifiedName.slice(prefix.length) : qualifiedName;
  }

  /** 列出所有已注册工具 */
  list(): MCPToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /** 清空所有工具 */
  clear(): void {
    this.tools.clear();
  }
}
