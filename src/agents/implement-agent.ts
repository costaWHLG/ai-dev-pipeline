/**
 * 编码实现 Agent — 根据任务描述和设计方案实现代码
 *
 * 输入：tasks.json + design.json + project context
 * 处理：按依赖拓扑排序并行执行子任务，每个逻辑单元执行 git commit
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

/** tasks.json 中单个任务的结构 */
interface TaskItem {
  id: string;
  title: string;
  description: string;
  dependsOn: string[];
}

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

    // 判断是否为带依赖关系的任务列表，走并行执行路径
    const taskItems = this.extractTaskItems(tasks);
    if (taskItems) {
      console.log(`检测到 ${taskItems.length} 个子任务，启用依赖拓扑并行执行`);
      return await this.executeTasksWithDependencies(
        taskItems,
        workspace,
        pipelineId,
        design,
        projectContext as string,
        techStack,
      );
    }

    // 回退到单次 agent 执行路径
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

  /**
   * 从 tasks 输入中提取 TaskItem 数组
   * 支持 { tasks: [...] } 或直接 [...] 两种格式
   * 如果不是带 dependsOn 的任务列表，返回 null
   */
  private extractTaskItems(tasks: unknown): TaskItem[] | null {
    let arr: unknown[] | null = null;

    if (Array.isArray(tasks)) {
      arr = tasks;
    } else if (
      tasks &&
      typeof tasks === "object" &&
      Array.isArray((tasks as Record<string, unknown>).tasks)
    ) {
      arr = (tasks as Record<string, unknown>).tasks as unknown[];
    }

    if (!arr || arr.length === 0) return null;

    // 校验每个元素是否具备 TaskItem 结构
    const valid = arr.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof (item as any).id === "string" &&
        typeof (item as any).title === "string" &&
        Array.isArray((item as any).dependsOn),
    );

    return valid ? (arr as TaskItem[]) : null;
  }

  /**
   * 按依赖拓扑排序将任务分成多个"波次"
   * 同一波次内的任务互不依赖，可以并行执行
   */
  private buildDependencyWaves(tasks: TaskItem[]): TaskItem[][] {
    const taskMap = new Map<string, TaskItem>();
    for (const t of tasks) {
      taskMap.set(t.id, t);
    }

    const completed = new Set<string>();
    const remaining = new Map<string, TaskItem>(taskMap);
    const waves: TaskItem[][] = [];

    while (remaining.size > 0) {
      // 找出所有依赖已完成的任务
      const wave: TaskItem[] = [];
      for (const [id, task] of remaining) {
        const depsResolved = task.dependsOn.every((dep) => completed.has(dep));
        if (depsResolved) {
          wave.push(task);
        }
      }

      if (wave.length === 0) {
        // 存在循环依赖，将剩余任务强制放入最后一波
        console.warn(
          `检测到循环依赖或无法解析的依赖，强制执行剩余 ${remaining.size} 个任务`,
        );
        waves.push([...remaining.values()]);
        break;
      }

      // 标记本波次任务为已完成
      for (const task of wave) {
        completed.add(task.id);
        remaining.delete(task.id);
      }
      waves.push(wave);
    }

    return waves;
  }

  /**
   * 按依赖拓扑排序并行执行子任务
   * 每个波次内的任务通过 Promise.all 并行执行
   * 每个任务完成后独立 git commit
   */
  private async executeTasksWithDependencies(
    tasks: TaskItem[],
    workspace: string,
    pipelineId: string,
    design: unknown,
    projectContext: string,
    techStack: unknown,
  ): Promise<{ results: { taskId: string; title: string; result: unknown }[] }> {
    const waves = this.buildDependencyWaves(tasks);
    const allResults: { taskId: string; title: string; result: unknown }[] = [];

    console.log(
      `任务拓扑排序完成：共 ${waves.length} 个波次，` +
      `分布 [${waves.map((w) => w.length).join(", ")}]`,
    );

    for (let waveIdx = 0; waveIdx < waves.length; waveIdx++) {
      const wave = waves[waveIdx];
      console.log(
        `开始执行波次 ${waveIdx + 1}/${waves.length}，` +
        `包含 ${wave.length} 个任务: [${wave.map((t) => t.id).join(", ")}]`,
      );

      const wavePromises = wave.map(async (task) => {
        const taskInput: Record<string, unknown> = {
          task: {
            id: task.id,
            title: task.title,
            description: task.description,
          },
          design,
          projectContext,
          techStack,
        };

        console.log(`任务 ${task.id} 开始执行: ${task.title}`);
        const startTime = Date.now();

        try {
          const result = await super.execute(taskInput, workspace, pipelineId);
          const duration = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`任务 ${task.id} 完成 (${duration}s): ${task.title}`);

          // 每个任务完成后独立 commit
          await this.gitCommitAll(
            workspace,
            `feat(${task.id}): ${task.title}`,
          );

          return { taskId: task.id, title: task.title, result };
        } catch (err) {
          const duration = ((Date.now() - startTime) / 1000).toFixed(1);
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`任务 ${task.id} 失败 (${duration}s): ${errMsg}`);
          return { taskId: task.id, title: task.title, result: { error: errMsg } };
        }
      });

      const waveResults = await Promise.all(wavePromises);
      allResults.push(...waveResults);
    }

    // 最终汇总 commit
    await this.gitCommitAll(
      workspace,
      `feat: complete all ${tasks.length} tasks for pipeline ${pipelineId}`,
    );

    return { results: allResults };
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

