/**
 * 编码实现 Agent — 根据任务描述和设计方案实现代码
 *
 * 输入：tasks.json + design.json + project context
 * 处理：逐任务实现，每个逻辑单元执行 git commit
 */

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { BaseAgent } from "./base-agent.js";
import { detectTechStack } from "../detector/tech-stack.js";
import { config } from "../config.js";
import type { TaskType } from "../llm/providers.js";

const execFileAsync = promisify(execFile);

export class ImplementAgent extends BaseAgent {
  get taskType(): TaskType {
    return "implement";
  }

  get systemPrompt(): string {
    return this.loadPromptTemplate("implement.md");
  }

  protected buildUserMessage(input: Record<string, unknown>): string {
    const task = typeof input.task === "string"
      ? input.task
      : JSON.stringify(input.task, null, 2);
    const design = typeof input.design === "string"
      ? input.design
      : JSON.stringify(input.design, null, 2);
    const projectContext = (input.projectContext as string) ?? "";
    const techStack = typeof input.techStack === "string"
      ? input.techStack
      : JSON.stringify(input.techStack, null, 2);

    const template = this.loadPromptTemplate("implement.md");
    return this.renderTemplate(template, {
      task,
      design,
      projectContext,
      techStack,
    });
  }

  async execute(
    input: Record<string, unknown>,
    workspace: string,
    pipelineId: string,
  ): Promise<unknown> {
    const artifactDir = path.join(workspace, ".ai-pipeline", pipelineId);
    const event = input.event as Record<string, any> | undefined;
    const branch = (input.branch as string) ?? "main";

    // 克隆仓库（如果 workspace 还没有 .git）
    await this.ensureRepo(workspace, event, branch);

    // 读取上一阶段产物
    let tasks: unknown = input.tasks;
    let design: unknown = input.design;

    if (!tasks) {
      const tasksPath = path.join(artifactDir, "tasks.json");
      if (fs.existsSync(tasksPath)) {
        tasks = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
      }
    }
    if (!design) {
      const designPath = path.join(artifactDir, "design.json");
      if (fs.existsSync(designPath)) {
        design = JSON.parse(fs.readFileSync(designPath, "utf-8"));
      }
    }

    // 检测技术栈
    const techStack = await detectTechStack(workspace);

    // 读取项目上下文
    const projectContext = input.projectContext
      ?? this.readProjectContext(workspace);

    const implInput: Record<string, unknown> = {
      task: tasks,
      design,
      projectContext,
      techStack,
    };

    const result = await super.execute(implInput, workspace, pipelineId);

    // 实现完成后执行最终 commit
    await this.gitCommitAll(workspace, `feat: implement tasks for pipeline ${pipelineId}`);

    return result;
  }

  /** 确保工作目录已初始化 git 仓库并切换到目标分支 */
  private async ensureRepo(
    workspace: string,
    event: Record<string, any> | undefined,
    branch: string,
  ): Promise<void> {
    const gitDir = path.join(workspace, ".git");
    const cloneUrl = event?.project?.cloneUrl;
    const defaultBranch = event?.project?.defaultBranch ?? "main";

    if (fs.existsSync(gitDir)) {
      // 已有仓库，fetch 最新代码并重置到默认分支
      await this.gitExec(workspace, ["fetch", "origin"]);
      await this.gitExec(workspace, ["checkout", defaultBranch]);
      await this.gitExec(workspace, ["reset", "--hard", `origin/${defaultBranch}`]);
      // 清理未跟踪文件（保留 .ai-pipeline 目录）
      await this.gitExec(workspace, ["clean", "-fd", "-e", ".ai-pipeline"]);
    } else if (cloneUrl) {
      // 首次克隆
      // 清空目录后再 clone（保留 .ai-pipeline）
      const entries = fs.readdirSync(workspace);
      for (const entry of entries) {
        if (entry === ".ai-pipeline") continue;
        fs.rmSync(path.join(workspace, entry), { recursive: true, force: true });
      }
      await this.gitExec(workspace, ["clone", cloneUrl, "."]);
    } else {
      // 本地初始化
      await this.gitExec(workspace, ["init"]);
      await this.gitExec(workspace, ["checkout", "-b", "main"]);
    }

    // 配置 git 用户信息
    await this.gitExec(workspace, ["config", "user.name", config.gitAuthorName]);
    await this.gitExec(workspace, ["config", "user.email", config.gitAuthorEmail]);

    // 创建并切换到工作分支
    if (branch !== defaultBranch) {
      // 先删除本地可能存在的旧分支
      try {
        await this.gitExec(workspace, ["branch", "-D", branch]);
      } catch {
        // 分支不存在，忽略
      }
      // 从默认分支创建新分支
      await this.gitExec(workspace, ["checkout", "-b", branch]);
    }
  }

  /** 执行 git 命令 */
  private async gitExec(workspace: string, args: string[]): Promise<string> {
    const { stdout } = await execFileAsync("git", args, {
      cwd: workspace,
      timeout: 60_000,
    });
    return stdout;
  }

  /** git add + commit */
  private async gitCommitAll(workspace: string, message: string): Promise<void> {
    await this.gitExec(workspace, ["add", "-A"]);
    try {
      await this.gitExec(workspace, ["commit", "-m", message]);
    } catch {
      // 没有变更时 commit 会失败，忽略
    }
  }

  /** 尝试读取项目上下文 */
  private readProjectContext(workspace: string): string {
    for (const name of ["CLAUDE.md", "README.md"]) {
      const filePath = path.join(workspace, name);
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, "utf-8");
      }
    }
    return "(no project context found)";
  }
}
