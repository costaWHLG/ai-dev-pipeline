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
│   ├── detector/       # 技术栈检测
│   ├── gateway/        # Webhook 网关和事件归一化
│   ├── llm/            # LLM 路由、代理、提供者
│   ├── pipeline/       # 流水线引擎（状态、队列、重试、锁）
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

## 许可证

ISC
