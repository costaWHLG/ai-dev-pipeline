/**
 * Agent 基类 — 封装 Anthropic Messages API + tool_use 循环
 *
 * 内置工具：read_file, write_file, list_files, bash
 * 安全：文件操作限制在 workspace 内，bash 使用命令白名单
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AuditLogger } from "../audit/logger.js";
import { LLMRouter } from "../llm/router.js";
import { config } from "../config.js";
import type { TaskType, LLMConfig } from "../llm/providers.js";

const execFileAsync = promisify(execFile);

/** bash 命令白名单前缀 */
const BASH_ALLOWLIST = [
  "npm", "npx", "node", "git", "python", "pytest",
  "go", "mvn", "gradle", "tsc", "eslint", "ruff", "make",
  "pnpm", "yarn", "poetry", "uv", "pip",
];

/** 单次 agent 循环最大轮数，防止无限循环 */
const MAX_TURNS = 50;

/** 内置工具定义 */
const BUILT_IN_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "read_file",
    description: "读取指定文件内容。路径相对于工作目录。",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "文件路径（相对于工作目录）" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "写入内容到指定文件。路径相对于工作目录，目录不存在会自动创建。",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "文件路径（相对于工作目录）" },
        content: { type: "string", description: "文件内容" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_files",
    description: "列出指定目录下的文件和子目录。路径相对于工作目录。",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "目录路径（相对于工作目录，默认 '.'）" },
        recursive: { type: "boolean", description: "是否递归列出子目录（默认 false）" },
      },
      required: [],
    },
  },
  {
    name: "bash",
    description: "在工作目录中执行 shell 命令。仅允许白名单中的命令。",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "要执行的命令" },
      },
      required: ["command"],
    },
  },
];

export abstract class BaseAgent {
  protected auditLogger: AuditLogger;
  protected router: LLMRouter;

  abstract get taskType(): TaskType;
  abstract get systemPrompt(): string;

  constructor(auditLogger?: AuditLogger, router?: LLMRouter) {
    this.auditLogger = auditLogger ?? new AuditLogger();
    this.router = router ?? new LLMRouter();
  }

  /**
   * Agent 主循环：发送消息 → 处理 tool_use → 返回 tool_result → 继续
   * 直到 stop_reason === "end_turn" 或达到最大轮数
   * 外部 API 失败时自动 fallback 到内网模型
   */
  async execute(
    input: Record<string, unknown>,
    workspace: string,
    pipelineId: string,
  ): Promise<unknown> {
    try {
      return await this.runAgentLoop(
        this.router.route(this.taskType),
        input,
        workspace,
        pipelineId,
      );
    } catch (err) {
      // 外部 API 不可用时自动 fallback
      const errMsg = err instanceof Error ? err.message : String(err);
      const isApiError = /\b(5\d{2}|ECONNREFUSED|ETIMEDOUT|fetch failed|model_not_found)\b/i.test(errMsg);

      if (isApiError) {
        const fallbackConfig = this.router.fallback(this.taskType);
        console.warn(
          `Primary LLM failed (${errMsg}), falling back to ${fallbackConfig.provider}/${fallbackConfig.model}`,
        );
        this.auditLogger.log({
          timestamp: new Date().toISOString(),
          pipelineId,
          stage: this.taskType,
          event: "llm_invoke",
          metadata: { fallback: true, reason: errMsg, model: fallbackConfig.model },
        });
        return await this.runAgentLoop(fallbackConfig, input, workspace, pipelineId);
      }

      throw err;
    }
  }

  /** Agent 循环核心逻辑 */
  private async runAgentLoop(
    llmConfig: LLMConfig,
    input: Record<string, unknown>,
    workspace: string,
    pipelineId: string,
  ): Promise<unknown> {
    const client = this.createClient(llmConfig);

    const messages: Anthropic.Messages.MessageParam[] = [
      { role: "user", content: this.buildUserMessage(input) },
    ];

    let turns = 0;

    while (turns < MAX_TURNS) {
      turns++;

      const startTime = Date.now();
      this.auditLogger.log({
        timestamp: new Date().toISOString(),
        pipelineId,
        stage: this.taskType,
        event: "llm_invoke",
        metadata: { model: llmConfig.model, turn: turns },
      });

      const response = await client.messages.create({
        model: llmConfig.model,
        max_tokens: llmConfig.maxTokens ?? 8192,
        temperature: llmConfig.temperature ?? 0.3,
        system: this.systemPrompt,
        tools: BUILT_IN_TOOLS,
        messages,
      });

      this.auditLogger.log({
        timestamp: new Date().toISOString(),
        pipelineId,
        stage: this.taskType,
        event: "llm_result",
        duration: Date.now() - startTime,
        metadata: {
          stopReason: response.stop_reason,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      });

      // 将 assistant 回复追加到消息历史
      messages.push({ role: "assistant", content: response.content });

      // 如果模型结束对话，提取最终结果
      if (response.stop_reason === "end_turn") {
        return this.extractResult(response.content);
      }

      // 处理 tool_use 块
      if (response.stop_reason === "tool_use") {
        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type === "tool_use") {
            const toolInput = block.input as Record<string, any>;
            let result: string;
            let isError = false;

            try {
              result = await this.executeTool(block.name, toolInput, workspace);
            } catch (err) {
              result = err instanceof Error ? err.message : String(err);
              isError = true;
            }

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
              is_error: isError,
            });
          }
        }

        messages.push({ role: "user", content: toolResults });
      }
    }

    throw new Error(`Agent "${this.taskType}" exceeded max turns (${MAX_TURNS})`);
  }

  /** 创建 Anthropic 客户端 */
  protected createClient(llmConfig: LLMConfig): Anthropic {
    return new Anthropic({
      apiKey: llmConfig.apiKey,
      baseURL: llmConfig.baseUrl,
    });
  }

  /** 子类可覆盖：构建发送给模型的用户消息 */
  protected buildUserMessage(input: Record<string, unknown>): string {
    return JSON.stringify(input, null, 2);
  }

  /** 从模型最终回复中提取结果（文本或 JSON） */
  protected extractResult(content: Anthropic.Messages.ContentBlock[]): unknown {
    const textBlocks = content.filter(
      (b): b is Anthropic.Messages.TextBlock => b.type === "text",
    );
    const text = textBlocks.map((b) => b.text).join("\n");

    // 尝试提取 JSON（可能包裹在 ```json ... ``` 中）
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {
        // 解析失败则返回原始文本
      }
    }

    // 尝试直接解析整段文本为 JSON
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /** 工具执行分发，带 workspace 沙箱限制 */
  protected async executeTool(
    toolName: string,
    toolInput: Record<string, any>,
    workspace: string,
  ): Promise<string> {
    switch (toolName) {
      case "read_file":
        return this.toolReadFile(toolInput.path, workspace);
      case "write_file":
        return this.toolWriteFile(toolInput.path, toolInput.content, workspace);
      case "list_files":
        return this.toolListFiles(toolInput.path ?? ".", toolInput.recursive ?? false, workspace);
      case "bash":
        return this.toolBash(toolInput.command, workspace);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /** 解析并校验路径，确保在 workspace 内 */
  private resolveSafePath(relativePath: string, workspace: string): string {
    const resolved = path.resolve(workspace, relativePath);
    const normalizedWorkspace = path.resolve(workspace);
    if (!resolved.startsWith(normalizedWorkspace + path.sep) && resolved !== normalizedWorkspace) {
      throw new Error(`Path traversal denied: "${relativePath}" resolves outside workspace`);
    }
    return resolved;
  }

  /** read_file 工具实现 */
  private toolReadFile(filePath: string, workspace: string): string {
    const resolved = this.resolveSafePath(filePath, workspace);
    if (!fs.existsSync(resolved)) {
      throw new Error(`File not found: ${filePath}`);
    }
    return fs.readFileSync(resolved, "utf-8");
  }

  /** write_file 工具实现 */
  private toolWriteFile(filePath: string, content: string, workspace: string): string {
    const resolved = this.resolveSafePath(filePath, workspace);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolved, content, "utf-8");
    return `File written: ${filePath}`;
  }

  /** list_files 工具实现 */
  private toolListFiles(dirPath: string, recursive: boolean, workspace: string): string {
    const resolved = this.resolveSafePath(dirPath, workspace);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }
    const entries = fs.readdirSync(resolved, { withFileTypes: true, recursive });
    const lines = entries.map((e) => {
      const rel = path.relative(resolved, path.join(e.parentPath ?? resolved, e.name));
      return e.isDirectory() ? `${rel}/` : rel;
    });
    return lines.join("\n");
  }

  /** bash 工具实现（白名单校验） */
  private async toolBash(command: string, workspace: string): Promise<string> {
    const trimmed = command.trim();
    const firstToken = trimmed.split(/\s+/)[0];

    // 提取命令基础名（去掉路径前缀）
    const baseName = path.basename(firstToken);
    const allowed = BASH_ALLOWLIST.some((prefix) => baseName === prefix || baseName.startsWith(prefix + "."));
    if (!allowed) {
      throw new Error(
        `Command "${baseName}" is not in the allowlist. Allowed: ${BASH_ALLOWLIST.join(", ")}`,
      );
    }

    try {
      // Windows 下通过 cmd /c 执行，Unix 下通过 sh -c
      const shell = process.platform === "win32" ? "cmd" : "sh";
      const flag = process.platform === "win32" ? "/c" : "-c";
      const { stdout, stderr } = await execFileAsync(shell, [flag, trimmed], {
        cwd: workspace,
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      const output = stdout + (stderr ? `\n[stderr]\n${stderr}` : "");
      return output || "(no output)";
    } catch (err: any) {
      const msg = err.stderr || err.stdout || err.message || String(err);
      throw new Error(`Command failed: ${msg}`);
    }
  }

  /** 读取 prompts/ 目录下的模板文件 */
  protected loadPromptTemplate(templateName: string): string {
    const promptPath = path.resolve(
      path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")),
      "../../prompts",
      templateName,
    );
    return fs.readFileSync(promptPath, "utf-8");
  }

  /** 简单模板变量替换 {{key}} */
  protected renderTemplate(template: string, vars: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replaceAll(`{{${key}}}`, value);
    }
    return result;
  }
}
