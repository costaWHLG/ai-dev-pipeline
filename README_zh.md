# AI Dev Pipeline

[English](./README.md)

自动化软件开发编排服务，接收 GitLab/GitHub 事件，驱动 AI Agent 完成从需求分析到代码合并的全流程。

## 特性

- **多平台支持** — 统一的 Webhook 网关，支持 GitLab 和 GitHub
- **AI 驱动开发** — 基于 Anthropic Claude 的 tool_use 能力实现智能代码生成
- **全流程自动化** — 从 Issue 分析 → 设计 → 实现 → 测试 → 代码审查
- **灵活的 LLM 路由** — 多模型支持，带代理和降级机制
- **持久化任务队列** — SQLite 持久化队列，支持重试和状态恢复
- **技术栈检测** — 自动检测项目技术栈，实现上下文感知的代码生成
- **审计日志** — 完整记录所有 AI 操作，可追溯

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Dev Pipeline                          │
├─────────────────────────────────────────────────────────────────┤
│  网关层                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   GitLab    │  │   GitHub    │  │      事件归一化器        │ │
│  │   Webhook   │  │   Webhook   │  │   (统一事件模型)         │ │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘ │
│         └────────────────┴─────────────────────►│              │
├─────────────────────────────────────────────────┼──────────────┤
│  流水线引擎                                       ▼              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │   状态机    │   任务队列   │   重试逻辑   │   分布式锁      ││
│  └─────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│  Agent 层 (Messages API + tool_use)                            │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────┐ ┌──────────┐ │
│  │  分析    │ │   设计   │ │   实现    │ │ 测试 │ │   审查   │ │
│  │  Agent   │ │  Agent   │ │   Agent   │ │Agent │ │  Agent   │ │
│  └──────────┘ └──────────┘ └───────────┘ └──────┘ └──────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  LLM 路由                            Git 适配器                 │
│  ┌────────────────────────────┐     ┌────────────────────────┐ │
│  │ Anthropic │ OpenAI │ 内部  │     │  GitLab  │   GitHub    │ │
│  │  (代理)   │ (代理) │  LLM  │     │ @gitbeaker│  @octokit  │ │
│  └────────────────────────────┘     └────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## 技术栈

| 类别 | 技术 |
|------|------|
| 语言 | TypeScript / Node.js |
| AI 引擎 | @anthropic-ai/sdk (Messages API + tool_use) |
| HTTP 框架 | Fastify |
| 任务队列 | p-queue + SQLite 持久化 |
| Git 客户端 | @gitbeaker/rest (GitLab), @octokit/rest (GitHub) |
| MCP 支持 | @modelcontextprotocol/sdk |

## 快速开始

### 前置条件

- Node.js >= 18
- npm >= 9

### 安装

```bash
git clone <repository-url>
cd ai-dev-pipeline
npm install
```

### 配置

复制示例环境变量文件并配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```bash
# 服务配置
PORT=8080
NODE_ENV=development

# 数据存储
SQLITE_PATH=./data/pipeline.db

# GitLab 配置
GITLAB_URL=https://gitlab.example.com/
GITLAB_TOKEN=your-gitlab-token
GITLAB_WEBHOOK_SECRET=your-webhook-secret

# GitHub 配置
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
GITHUB_WEBHOOK_SECRET=your-webhook-secret

# LLM 配置
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxxxxxx

# LLM 代理（内网访问外部 API）
LLM_PROXY_URL=http://proxy.example.com:8080
LLM_NO_PROXY=localhost,127.0.0.1

# 内部 LLM（可选）
INTERNAL_LLM_URL=http://internal-llm:8000/v1
INTERNAL_LLM_API_KEY=
INTERNAL_LLM_MODEL=deepseek-coder-v2

# 工作目录
WORKSPACE_DIR=./data/workspaces
AUDIT_DIR=./data/audit

# Git 身份（AI 提交用）
GIT_AUTHOR_NAME=AI Dev Pipeline
GIT_AUTHOR_EMAIL=ai-bot@example.com
```

### 启动服务

```bash
# 开发模式（热重载）
npm run dev

# 生产模式
npm run build
npm run start
```

## 环境变量说明

| 变量 | 说明 | 必填 |
|------|------|------|
| `PORT` | 服务端口 | 否（默认: 8080）|
| `NODE_ENV` | 运行环境 | 否（默认: development）|
| `SQLITE_PATH` | SQLite 数据库路径 | 否（默认: ./data/pipeline.db）|
| `GITLAB_URL` | GitLab 实例地址 | 是（使用 GitLab 时）|
| `GITLAB_TOKEN` | GitLab 访问令牌 | 是（使用 GitLab 时）|
| `GITLAB_WEBHOOK_SECRET` | GitLab Webhook 密钥 | 是（使用 GitLab 时）|
| `GITHUB_TOKEN` | GitHub 访问令牌 | 是（使用 GitHub 时）|
| `GITHUB_WEBHOOK_SECRET` | GitHub Webhook 密钥 | 是（使用 GitHub 时）|
| `ANTHROPIC_API_KEY` | Anthropic API 密钥 | 是 |
| `OPENAI_API_KEY` | OpenAI API 密钥 | 否 |
| `LLM_PROXY_URL` | LLM API 代理地址 | 否 |
| `LLM_NO_PROXY` | 代理绕过列表 | 否 |
| `INTERNAL_LLM_URL` | 内部 LLM 端点 | 否 |
| `WORKSPACE_DIR` | 仓库工作目录 | 否（默认: ./data/workspaces）|
| `AUDIT_DIR` | 审计日志目录 | 否（默认: ./data/audit）|
| `GIT_AUTHOR_NAME` | Git 提交作者名 | 否 |
| `GIT_AUTHOR_EMAIL` | Git 提交作者邮箱 | 否 |
| `MCP_GLOBAL_CONFIG` | 全局 MCP 配置文件路径 | 否（默认: ~/.ai-pipeline/mcp-servers.json）|
| `SKILLS_GLOBAL_DIR` | 全局 Skills 目录 | 否（默认: ~/.ai-pipeline/skills）|

## Webhook 配置

### GitLab

1. 进入项目 → 设置 → Webhooks
2. 添加 Webhook URL: `http://your-server:8080/webhook/gitlab`
3. 设置 Secret Token（与 `GITLAB_WEBHOOK_SECRET` 一致）
4. 选择触发事件：Issues 事件、合并请求事件、评论

### GitHub

1. 进入仓库 → Settings → Webhooks
2. 添加 Webhook URL: `http://your-server:8080/webhook/github`
3. 设置 Secret（与 `GITHUB_WEBHOOK_SECRET` 一致）
4. 选择事件：Issues、Pull requests、Issue comments

## 开发命令

```bash
npm run dev        # 开发模式启动（热重载）
npm run build      # TypeScript 编译
npm run start      # 生产模式启动
npm run test       # 运行测试
npm run lint       # 类型检查
```

## 项目结构

```
ai-dev-pipeline/
├── src/
│   ├── adapters/       # Git 平台适配器（GitLab/GitHub）
│   ├── agents/         # AI Agent（分析、设计、实现、测试、审查）
│   ├── audit/          # 审计日志
│   ├── dashboard/      # Web 管理界面（HTML + CSS + JS）
│   ├── detector/       # 技术栈检测
│   ├── gateway/        # Webhook 网关和事件归一化
│   ├── llm/            # LLM 路由、代理、提供者
│   ├── mcp/            # MCP（模型上下文协议）集成
│   ├── pipeline/       # 流水线引擎（状态、队列、重试、锁）
│   ├── skills/         # Skills 管理与执行
│   ├── types/          # TypeScript 类型定义
│   ├── config.ts       # 配置加载器
│   └── index.ts        # 应用入口
├── tests/              # 测试文件
├── prompts/            # Prompt 模板
├── skills/             # Skill 定义
├── deploy/             # 部署配置
├── .env.example        # 环境变量模板
├── Dockerfile          # 容器镜像定义
└── package.json        # 项目依赖
```

## 管理界面（Dashboard）

内置 Web 管理界面，可视化展示流水线状态、LLM 配置、Skills 和 MCP 服务。

访问地址：`http://localhost:8080/dashboard/`

功能：
- 流水线统计与最近活动
- 流水线详情（阶段时间线、审计日志）
- LLM 路由配置查看与实时覆盖
- Skills 列表（内置 / 全局 / 项目级）
- MCP Server 列表

## LLM 配置

### 路由表

每种流水线任务类型映射到一个默认 LLM 模型，路由表定义在 `src/llm/providers.ts`：

| 任务类型 | 默认模型 | 温度 | 最大 Token | 降级模型 |
|---------|---------|------|-----------|---------|
| analyze | claude-opus-4-6 (anthropic) | 0.3 | 16384 | deepseek-v3 (internal) |
| design | claude-opus-4-6 (anthropic) | 0.4 | 16384 | deepseek-v3 (internal) |
| implement | claude-opus-4-6 (anthropic) | 0.2 | 8192 | deepseek-coder-v2 (internal) |
| review | claude-opus-4-6 (anthropic) | 0.2 | 8192 | deepseek-coder-v2 (internal) |
| fix | claude-opus-4-6 (anthropic) | 0.2 | 8192 | deepseek-coder-v2 (internal) |

当主路由调用失败时，自动降级到内部模型。

### 运行时覆盖

通过 API 覆盖路由配置：

```bash
# 设置覆盖
curl -X PUT http://localhost:8080/api/llm/routes/analyze \
  -H 'Content-Type: application/json' \
  -d '{"provider":"openai","model":"gpt-4","temperature":0.3,"maxTokens":16384}'

# 清除覆盖
curl -X DELETE http://localhost:8080/api/llm/routes/analyze
```

也可以在 Dashboard 的 LLM 配置页面进行可视化编辑。

## Skills

Skills 是可复用的 Prompt 模板（Markdown + YAML Front Matter），Agent 在流水线执行过程中可以调用。`SkillsExecutor` 负责渲染模板变量并调用 LLM 生成结果。

### 目录结构与优先级

Skills 从三个来源加载，同名时高优先级覆盖低优先级：

```
<项目>/.ai-pipeline/skills/      # 项目级（最高优先级）
~/.ai-pipeline/skills/           # 用户全局
skills/                          # 内置（最低优先级）
```

全局目录通过环境变量 `SKILLS_GLOBAL_DIR` 配置（默认 `~/.ai-pipeline/skills`）。

### Skill 文件格式

每个 Skill 是一个 `.md` 文件，包含 YAML Front Matter：

```markdown
---
name: code-review
description: 执行代码审查
tags: [review, quality]
inputs:
  - name: code
    description: 待审查的源代码
  - name: language
    description: 编程语言
outputs:
  - name: feedback
    format: markdown
---

你是一位资深代码审查员。请审查以下 {{language}} 代码：
- 正确性与边界条件
- 安全漏洞
- 性能问题
- 代码风格与可读性

```{{language}}
{{code}}
```
```

### 在流水线中使用 Skills

Skills 自动对 Agent 可用。也可以通过 `SkillsExecutor` 编程调用：

```typescript
import { SkillsManager } from "./skills/skills-manager.js";
import { SkillsExecutor } from "./skills/skills-executor.js";

const manager = new SkillsManager();
manager.load("/path/to/project");  // 加载内置 + 全局 + 项目级 skills

const executor = new SkillsExecutor(manager, llmRouter, auditLogger);
const result = await executor.execute("code-review", {
  code: "function add(a, b) { return a + b; }",
  language: "javascript",
});
```

### 通过 API 查询 Skills

```bash
curl http://localhost:8080/api/skills
# 返回示例：
# [{"name":"code-review","description":"...","source":"builtin","tags":["review","quality"],"inputs":[...],"outputs":[...]}]
```

## MCP 配置

MCP（Model Context Protocol）服务器为 Agent 提供外部工具扩展能力。流水线运行时，`MCPManager` 启动配置的 MCP 服务器，发现其工具，并注册为 Anthropic 兼容的 tool_use 工具供 Agent 调用。

### 工作原理

1. `MCPManager.startAll(projectDir)` 加载配置并启动所有 MCP 服务器
2. 通过 `listTools()` 发现每个服务器的工具，注册到 `MCPRegistry`
3. 工具以 `mcp_<服务器名>_<工具名>` 格式暴露给 Agent（Anthropic Tool 格式）
4. Agent 调用 MCP 工具时，`MCPManager.callTool()` 路由到对应服务器
5. 流水线完成后，`MCPManager.stopAll()` 关闭所有服务器

### 支持的传输方式

| 传输方式 | 状态 | 配置字段 |
|---------|------|---------|
| stdio | 已支持 | `command` + `args` |
| SSE | 计划中 | `url` + `transport: "sse"` |

### 全局配置

文件：`~/.ai-pipeline/mcp-servers.json`（通过 `MCP_GLOBAL_CONFIG` 环境变量配置）

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-filesystem", "/path/to/allowed/dir"],
      "description": "文件系统读写访问"
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-github"],
      "env": { "GITHUB_TOKEN": "ghp_xxx" },
      "description": "GitHub API 访问"
    }
  }
}
```

### 项目级配置

MCP 服务器也可以在项目级 `.ai-pipeline.json` 中定义（见下文）。项目级配置覆盖同名的全局配置。

### 通过 API 查询 MCP

```bash
curl http://localhost:8080/api/mcp/servers
# 返回示例：
# [{"name":"filesystem","transport":"stdio","description":"文件系统读写访问","command":"npx"}]
```

## 项目级配置（.ai-pipeline.json）

在项目根目录放置 `.ai-pipeline.json` 文件，可按项目自定义流水线行为：

```json
{
  "triggerLabel": "auto-implement",
  "branchPrefix": "feature/",
  "skipStages": ["test"],
  "stages": {
    "implement": { "maxRetries": 5, "timeout": 300000 },
    "review": { "skip": true }
  },
  "llm": {
    "implement": { "model": "claude-opus-4-6", "temperature": 0.1, "maxTokens": 16384 },
    "review": { "model": "deepseek-coder-v2" }
  },
  "mcpServers": {
    "database": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-sqlite", "./data.db"],
      "description": "项目数据库访问"
    }
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `triggerLabel` | string | 触发流水线的 Issue 标签（默认 `"auto-implement"`） |
| `branchPrefix` | string | 生成分支的名称前缀（默认 `"feature/"`） |
| `skipStages` | string[] | 要跳过的阶段列表 |
| `stages.<名称>.skip` | boolean | 跳过指定阶段 |
| `stages.<名称>.maxRetries` | number | 覆盖阶段最大重试次数 |
| `stages.<名称>.timeout` | number | 覆盖阶段超时时间（毫秒） |
| `llm.<任务类型>.model` | string | 覆盖指定任务类型的 LLM 模型 |
| `llm.<任务类型>.temperature` | number | 覆盖温度参数 |
| `llm.<任务类型>.maxTokens` | number | 覆盖最大 Token 数 |
| `mcpServers` | object | 项目级 MCP 服务器定义（覆盖全局同名配置） |

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/webhook/gitlab` | POST | GitLab Webhook 接收 |
| `/webhook/github` | POST | GitHub Webhook 接收 |
| `/api/trigger` | POST | CLI 触发（无签名验证） |
| `/api/resume/:pipelineId` | POST | 恢复被阻塞的流水线 |
| `/api/pipelines` | GET | 流水线列表（支持 ?status=&project_id= 过滤） |
| `/api/pipelines/:id` | GET | 流水线详情 |
| `/api/pipelines/:id/logs` | GET | 流水线审计日志 |
| `/api/llm/routes` | GET | LLM 路由配置 |
| `/api/llm/routes/:taskType` | PUT | 覆盖 LLM 路由 |
| `/api/llm/routes/:taskType` | DELETE | 清除 LLM 路由覆盖 |
| `/api/skills` | GET | Skills 列表 |
| `/api/mcp/servers` | GET | MCP Server 列表 |
| `/api/config` | GET | 运行配置（脱敏） |
| `/health` | GET | 健康检查 |
| `/status` | GET | 服务状态 |
| `/dashboard/` | GET | Web 管理界面 |

## 许可证

ISC
