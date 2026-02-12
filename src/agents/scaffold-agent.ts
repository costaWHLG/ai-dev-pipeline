/**
 * 脚手架 Agent — 从零生成项目结构
 *
 * 输入：techStack + description + requirements + design
 * 处理：生成完整项目代码、配置文件、README 等
 * 可选：创建远端仓库并 push
 */

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { BaseAgent } from "./base-agent.js";
import { config } from "../config.js";
import { createRepo, configureGitHubWebhook, configureGitLabWebhook } from "../scaffold/repo-creator.js";
import type { TaskType } from "../llm/providers.js";
import type { ScaffoldPayload, DevEvent } from "../types/index.js";

const execFileAsync = promisify(execFile);

export class ScaffoldAgent extends BaseAgent {
  get taskType(): TaskType {
    return "implement"; // 使用 implement 模型，编码能力强
  }

  get systemPrompt(): string {
    return this.loadPromptTemplate("scaffold.md");
  }

  protected buildUserMessage(input: Record<string, unknown>): string {
    const scaffold = input.scaffold as ScaffoldPayload;
    const requirements = typeof input.requirements === "string"
      ? input.requirements
      : JSON.stringify(input.requirements, null, 2);
    const design = typeof input.design === "string"
      ? input.design
      : JSON.stringify(input.design, null, 2);

    const template = this.loadPromptTemplate("scaffold.md");
    return this.renderTemplate(template, {
      techStack: scaffold?.techStack ?? "custom",
      projectName: input.projectName as string ?? "new-project",
      description: input.description as string ?? "",
      features: JSON.stringify(scaffold?.features ?? []),
      requirements,
      design,
    });
  }

  async execute(
    input: Record<string, unknown>,
    workspace: string,
    pipelineId: string,
  ): Promise<{ repoUrl?: string; cloneUrl?: string; localPath: string }> {
    const artifactDir = path.join(workspace, ".ai-pipeline", pipelineId);
    const event = input.event as DevEvent | undefined;
    const scaffold = event?.payload?.scaffold as ScaffoldPayload | undefined;
    const projectName = event?.project?.name ?? scaffold?.techStack ?? "new-project";

    // 读取上一阶段产物
    let requirements: unknown = input.requirements;
    let design: unknown = input.design;

    if (!requirements) {
      const reqPath = path.join(artifactDir, "requirements.json");
      if (fs.existsSync(reqPath)) {
        requirements = JSON.parse(fs.readFileSync(reqPath, "utf-8"));
      }
    }
    if (!design) {
      const designPath = path.join(artifactDir, "design.json");
      if (fs.existsSync(designPath)) {
        design = JSON.parse(fs.readFileSync(designPath, "utf-8"));
      }
    }

    // 确保工作目录干净
    await this.prepareWorkspace(workspace);

    // 构建输入
    const scaffoldInput: Record<string, unknown> = {
      scaffold,
      projectName,
      description: event?.payload?.description ?? "",
      requirements,
      design,
    };

    // 调用 AI 生成项目
    const result = await super.execute(scaffoldInput, workspace, pipelineId);

    // 初始化 git 并提交
    await this.initGitRepo(workspace, scaffold?.techStack ?? "project");

    // 生成 .ai-toolchain.json
    await this.generateToolchainConfig(workspace, scaffold?.techStack);

    // 如果需要创建远端仓库
    let repoUrl: string | undefined;
    let cloneUrl: string | undefined;

    if (scaffold?.createRemoteRepo) {
      const platform = scaffold.targetPlatform;
      console.log(`正在 ${platform} 上创建仓库: ${projectName}...`);

      try {
        const repoResult = await createRepo(platform, {
          name: projectName,
          description: event?.payload?.description as string,
          visibility: "private",
        });

        repoUrl = repoResult.webUrl;
        cloneUrl = repoResult.cloneUrl;

        // 添加 remote 并 push
        await this.gitExec(workspace, ["remote", "add", "origin", cloneUrl]);
        await this.gitExec(workspace, ["branch", "-M", "main"]);
        await this.gitExec(workspace, ["push", "-u", "origin", "main"]);

        console.log(`仓库已创建: ${repoUrl}`);

        // 配置 webhook（可选）
        try {
          const webhookUrl = `http://${config.port}/webhook/${platform}`;
          if (platform === "github") {
            const [owner, repo] = repoResult.id.split("/");
            await configureGitHubWebhook(owner, repo, webhookUrl, config.github.webhookSecret);
          } else {
            await configureGitLabWebhook(repoResult.id, webhookUrl, config.gitlab.webhookSecret);
          }
          console.log("Webhook 已配置");
        } catch (webhookErr) {
          console.warn("Webhook 配置失败（可手动配置）:", webhookErr);
        }

        // 更新 event 中的 project 信息，供后续阶段使用
        if (event?.project) {
          event.project.id = repoResult.id;
          event.project.cloneUrl = cloneUrl;
        }
      } catch (err) {
        console.error("创建远端仓库失败:", err);
        // 不阻塞流程，本地项目已生成
      }
    }

    return { repoUrl, cloneUrl, localPath: workspace };
  }

  /** 准备工作目录 */
  private async prepareWorkspace(workspace: string): Promise<void> {
    // 保留 .ai-pipeline 目录，清理其他内容
    const entries = fs.readdirSync(workspace);
    for (const entry of entries) {
      if (entry === ".ai-pipeline") continue;
      fs.rmSync(path.join(workspace, entry), { recursive: true, force: true });
    }
  }

  /** 初始化 git 仓库并提交 */
  private async initGitRepo(workspace: string, projectType: string): Promise<void> {
    const gitDir = path.join(workspace, ".git");

    if (!fs.existsSync(gitDir)) {
      await this.gitExec(workspace, ["init"]);
    }

    // 配置 git 用户信息
    await this.gitExec(workspace, ["config", "user.name", config.gitAuthorName]);
    await this.gitExec(workspace, ["config", "user.email", config.gitAuthorEmail]);

    // 添加所有文件并提交
    await this.gitExec(workspace, ["add", "-A"]);
    try {
      await this.gitExec(workspace, ["commit", "-m", `feat: scaffold ${projectType} project`]);
    } catch {
      // 没有变更时忽略
    }
  }

  /** 生成 .ai-toolchain.json */
  private async generateToolchainConfig(workspace: string, techStack?: string): Promise<void> {
    const toolchainPath = path.join(workspace, ".ai-toolchain.json");
    if (fs.existsSync(toolchainPath)) return; // 已存在则跳过

    const toolchain = this.getDefaultToolchain(techStack);
    fs.writeFileSync(toolchainPath, JSON.stringify(toolchain, null, 2));
  }

  /** 根据技术栈获取默认工具链配置 */
  private getDefaultToolchain(techStack?: string): Record<string, string> {
    switch (techStack) {
      case "nextjs":
      case "react":
      case "vue":
      case "nodejs":
        return {
          language: "nodejs",
          packageManager: "npm",
          test: "npm run test -- --run",
          lint: "npm run lint",
          build: "npm run build",
          typeCheck: "npx tsc --noEmit",
        };
      case "fastapi":
      case "django":
      case "flask":
      case "python":
        return {
          language: "python",
          packageManager: "uv",
          test: "pytest",
          lint: "ruff check .",
          build: "echo 'no build step'",
        };
      case "spring-boot":
      case "java":
        return {
          language: "java",
          packageManager: "maven",
          test: "mvn test",
          lint: "mvn checkstyle:check",
          build: "mvn package -DskipTests",
        };
      case "gin":
      case "go":
        return {
          language: "go",
          packageManager: "go",
          test: "go test ./...",
          lint: "golangci-lint run",
          build: "go build ./...",
        };
      default:
        return {
          language: "unknown",
          packageManager: "unknown",
          test: "echo 'no test configured'",
          lint: "echo 'no lint configured'",
          build: "echo 'no build configured'",
        };
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
}
