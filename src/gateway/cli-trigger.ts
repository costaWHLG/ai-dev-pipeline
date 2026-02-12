/**
 * CLI 手动触发 — 用于本地调试或手动创建事件
 *
 * 使用方式：
 *   npx tsx src/gateway/cli-trigger.ts scaffold --name my-app --tech nextjs --platform github
 *   npx tsx src/gateway/cli-trigger.ts manual --project-id 123 --issue 1 --title "xxx"
 */

import { randomUUID } from "node:crypto";
import type {
  DevEvent,
  EventSource,
  ProjectInfo,
  ScaffoldPayload,
} from "../types/index.js";

/** 手动 issue 触发参数 */
export interface ManualEventOptions {
  source: EventSource;
  project: ProjectInfo;
  issueIid: number;
  title: string;
  description: string;
  labels?: string[];
}

/** scaffold 触发参数 */
export interface ScaffoldEventOptions {
  source: EventSource;
  project: ProjectInfo;
  scaffold: ScaffoldPayload;
  title?: string;
  description?: string;
}

/**
 * 创建手动 issue 事件
 */
export function createManualEvent(opts: ManualEventOptions): DevEvent {
  return {
    id: randomUUID(),
    source: opts.source,
    type: "manual",
    receivedAt: new Date().toISOString(),
    project: opts.project,
    payload: {
      issueIid: opts.issueIid,
      title: opts.title,
      description: opts.description,
      labels: opts.labels ?? [],
      author: "cli",
    },
  };
}

/**
 * 创建 scaffold 事件
 */
export function createScaffoldEvent(opts: ScaffoldEventOptions): DevEvent {
  return {
    id: randomUUID(),
    source: opts.source,
    type: "scaffold",
    receivedAt: new Date().toISOString(),
    project: opts.project,
    payload: {
      title: opts.title ?? `scaffold: ${opts.scaffold.techStack}`,
      description: opts.description ?? "",
      scaffold: opts.scaffold,
      author: "cli",
    },
  };
}

/**
 * CLI 入口 — 解析命令行参数并发送事件到本地服务
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    console.log(`
AI Dev Pipeline CLI

用法:
  npx tsx src/gateway/cli-trigger.ts <command> [options]

命令:
  scaffold    创建新项目脚手架
  manual      手动触发 Issue 实现

scaffold 选项:
  --name <name>           项目名称 (必填)
  --tech <stack>          技术栈: nextjs, fastapi, gin, spring-boot, custom (默认: custom)
  --platform <platform>   目标平台: gitlab, github (默认: github)
  --description <desc>    项目描述
  --create-repo           是否在远端创建仓库 (默认: false)

manual 选项:
  --source <source>       事件来源: gitlab, github (默认: github)
  --project-id <id>       项目 ID (必填)
  --clone-url <url>       克隆地址 (必填)
  --issue <iid>           Issue 编号 (必填)
  --title <title>         Issue 标题 (必填)
  --description <desc>    Issue 描述

示例:
  npx tsx src/gateway/cli-trigger.ts scaffold --name my-api --tech fastapi --platform github
  npx tsx src/gateway/cli-trigger.ts manual --project-id owner/repo --clone-url https://github.com/owner/repo.git --issue 1 --title "添加登录功能"
`);
    process.exit(0);
  }

  // 解析参数
  const getArg = (name: string): string | undefined => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : undefined;
  };
  const hasFlag = (name: string): boolean => args.includes(`--${name}`);

  let event: DevEvent;

  if (command === "scaffold") {
    const name = getArg("name");
    if (!name) {
      console.error("错误: --name 是必填参数");
      process.exit(1);
    }

    const tech = getArg("tech") ?? "custom";
    const platform = (getArg("platform") ?? "github") as EventSource;
    const description = getArg("description") ?? "";
    const createRepo = hasFlag("create-repo");

    event = createScaffoldEvent({
      source: platform,
      project: {
        id: "",
        name,
        cloneUrl: "",
        defaultBranch: "main",
      },
      scaffold: {
        techStack: tech,
        targetPlatform: platform,
        createRemoteRepo: createRepo,
        features: [],
      },
      title: `scaffold: ${name}`,
      description,
    });

    console.log(`创建 scaffold 事件: ${name} (${tech}) -> ${platform}`);
  } else if (command === "manual") {
    const source = (getArg("source") ?? "github") as EventSource;
    const projectId = getArg("project-id");
    const cloneUrl = getArg("clone-url");
    const issueIid = getArg("issue");
    const title = getArg("title");
    const description = getArg("description") ?? "";

    if (!projectId || !cloneUrl || !issueIid || !title) {
      console.error("错误: --project-id, --clone-url, --issue, --title 是必填参数");
      process.exit(1);
    }

    event = createManualEvent({
      source,
      project: {
        id: projectId,
        name: projectId.split("/").pop() ?? projectId,
        cloneUrl,
        defaultBranch: "main",
      },
      issueIid: parseInt(issueIid, 10),
      title,
      description,
      labels: ["auto-implement"],
    });

    console.log(`创建 manual 事件: Issue #${issueIid} - ${title}`);
  } else {
    console.error(`未知命令: ${command}`);
    process.exit(1);
  }

  // 发送到本地服务
  const port = process.env.PORT ?? "8080";
  const url = `http://localhost:${port}/webhook/${event.source}`;

  console.log(`发送事件到 ${url}...`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "issues",
        "X-Gitlab-Event": "Issue Hook",
      },
      body: JSON.stringify(event),
    });

    const result = await response.json();
    if (response.ok) {
      console.log("✅ 事件已发送:", result);
    } else {
      console.error("❌ 发送失败:", result);
      process.exit(1);
    }
  } catch (err) {
    console.error("❌ 连接失败，请确保服务正在运行:", err);
    process.exit(1);
  }
}

// 仅在直接运行时执行
if (process.argv[1]?.includes("cli-trigger")) {
  main();
}
