/**
 * MCP 管理器 — 管理 MCP Server 进程的生命周期（启动/停止/工具调用）
 *
 * 使用 @modelcontextprotocol/sdk 的 Client 连接 MCP Server
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { MCPRegistry } from "./mcp-registry.js";
import { loadMCPConfig } from "./mcp-config.js";
import type { MCPServerConfig, MCPServerStdioConfig } from "./mcp-config.js";
import type { MCPToolDefinition } from "./mcp-registry.js";
import type Anthropic from "@anthropic-ai/sdk";

interface MCPConnection {
  client: Client;
  transport: StdioClientTransport;
  serverName: string;
}

export class MCPManager {
  private connections = new Map<string, MCPConnection>();
  private registry = new MCPRegistry();

  /** 启动项目配置的所有 MCP Server */
  async startAll(projectDir?: string): Promise<void> {
    const mcpConfig = loadMCPConfig(projectDir);
    for (const [name, serverConfig] of Object.entries(mcpConfig.mcpServers)) {
      try {
        await this.startServer(name, serverConfig);
      } catch (err) {
        console.warn(`Failed to start MCP server "${name}":`, err);
      }
    }
  }

  /** 启动单个 MCP Server */
  async startServer(name: string, serverConfig: MCPServerConfig): Promise<void> {
    if (this.connections.has(name)) {
      console.warn(`MCP server "${name}" already running`);
      return;
    }

    if (serverConfig.transport === "sse") {
      console.warn(`SSE transport not yet supported for "${name}", skipping`);
      return;
    }

    const stdioConfig = serverConfig as MCPServerStdioConfig;
    const transport = new StdioClientTransport({
      command: stdioConfig.command,
      args: stdioConfig.args ?? [],
      env: { ...process.env, ...(stdioConfig.env ?? {}) } as Record<string, string>,
    });

    const client = new Client({ name: `ai-pipeline-${name}`, version: "1.0.0" }, {
      capabilities: {},
    });

    await client.connect(transport);

    // 发现工具
    const toolsResult = await client.listTools();
    const tools: MCPToolDefinition[] = (toolsResult.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
      serverName: name,
    }));

    this.registry.registerTools(name, tools);
    this.connections.set(name, { client, transport, serverName: name });
  }

  /** 停止所有 MCP Server */
  async stopAll(): Promise<void> {
    for (const [name] of this.connections) {
      await this.stopServer(name);
    }
  }

  /** 停止单个 MCP Server */
  async stopServer(name: string): Promise<void> {
    const conn = this.connections.get(name);
    if (!conn) return;
    try {
      await conn.client.close();
    } catch {
      // 忽略关闭错误
    }
    this.registry.unregisterServer(name);
    this.connections.delete(name);
  }

  /** 调用 MCP 工具 */
  async callTool(qualifiedName: string, args: Record<string, unknown>): Promise<string> {
    const serverName = this.registry.getServerForTool(qualifiedName);
    if (!serverName) throw new Error(`MCP tool not found: ${qualifiedName}`);

    const conn = this.connections.get(serverName);
    if (!conn) throw new Error(`MCP server "${serverName}" not connected`);

    const originalName = this.registry.getOriginalToolName(qualifiedName);
    if (!originalName) throw new Error(`Cannot resolve original name for: ${qualifiedName}`);

    const result = await conn.client.callTool({ name: originalName, arguments: args });
    const textParts = (result.content as Array<{ type: string; text?: string }>)
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text!);
    return textParts.join("\n") || "(no output)";
  }

  /** 获取 Anthropic Tool 格式的工具列表 */
  getAnthropicTools(): Anthropic.Messages.Tool[] {
    return this.registry.getAnthropicTools();
  }

  /** 获取注册表 */
  getRegistry(): MCPRegistry {
    return this.registry;
  }

  /** 是否有活跃连接 */
  get hasConnections(): boolean {
    return this.connections.size > 0;
  }
}
