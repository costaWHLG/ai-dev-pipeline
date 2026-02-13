# AI Dev Pipeline

[English](./README.md)

自动化软件开发编排服务，接收 GitLab/GitHub 事件，驱动 AI Agent 完成从需求分析到代码合并的全流程。

## 特性

- **多平台支持** — 统一的 Webhook 网关，支持 GitLab 和 GitHub
- **AI 驱动开发** — 基于 Anthropic Claude 的 tool_use 能力实现智能代码生成
- **全流程自动化** — 从 Issue 分析 → 设计 → 实现 → 测试 → 代码审查
- **灵活的 LLM 路由** — 多模型支持，带代理和降级机制
- **持久化任务队列** — SQLite 持久化队列，支持重试和状态恢复

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

```bash
cp .env.example .env
```

核心环境变量（完整列表见[环境变量](#环境变量)章节）：

| 变量 | 说明 | 必填 |
|------|------|------|
| `ANTHROPIC_API_KEY` | Anthropic API 密钥 | 是 |
| `GITHUB_TOKEN` | GitHub 访问令牌 | 使用 GitHub 时 |
| `GITHUB_WEBHOOK_SECRET` | GitHub Webhook 密钥 | 使用 GitHub 时 |
| `GITLAB_URL` | GitLab 实例地址 | 使用 GitLab 时 |
| `GITLAB_TOKEN` | GitLab 访问令牌 | 使用 GitLab 时 |
| `GITLAB_WEBHOOK_SECRET` | GitLab Webhook 密钥 | 使用 GitLab 时 |

### Webhook 设置

**GitLab**：项目 → 设置 → Webhooks → URL `http://your-server:8080/webhook/gitlab`，设置 Secret Token，勾选 Issues / 合并请求 / 评论事件。

**GitHub**：仓库 → Settings → Webhooks → URL `http://your-server:8080/webhook/github`，设置 Secret，勾选 Issues / Pull requests / Issue comments 事件。

### 启动服务

```bash
npm run dev        # 开发模式（热重载）
npm run start      # 生产模式
```

管理界面：`http://localhost:8080/dashboard/`

## 使用指南

### 流水线类型

| 类型 | 触发方式 | 阶段 |
|------|---------|------|
| 完整流水线 | Issue 添加 `auto-implement` 标签 | 需求分析 → 方案设计 → 编码实现 → 测试验证 → 代码审查 → 提交合并 |
| Review 流水线 | MR/PR 创建或更新 | 代码审查 |
| 评论修复流水线 | MR/PR 评论中 `@ai-bot` | 编码实现 → 测试验证 → 代码审查 → 提交合并 |
| 脚手架流水线 | CLI `scaffold` 命令 | 需求分析 → 方案设计 → 脚手架生成 → 测试验证 → 提交合并 |

### 触发方式

**1. Issue 标签** — 在 GitLab/GitHub Issue 上添加 `auto-implement` 标签，自动触发完整流水线。

**2. MR/PR 自动审查** — 创建或更新 MR/PR 时自动触发代码审查。

**3. MR/PR 评论指令** — 在 MR/PR 评论中 `@ai-bot` 并附上修改说明：

```
@ai-bot 请修复登录处理器中的空指针异常
```

**4. CLI 手动触发**

```bash
npx tsx src/gateway/cli-trigger.ts manual \
  --project-id owner/repo \
  --clone-url https://github.com/owner/repo.git \
  --issue 1 --title "添加登录功能"
```

**5. 脚手架 — 从零创建项目**

```bash
npx tsx src/gateway/cli-trigger.ts scaffold \
  --name my-app --tech fastapi --platform github
```

支持的技术栈：`nextjs` / `fastapi` / `gin` / `spring-boot` / `custom`

运行 `npx tsx src/gateway/cli-trigger.ts --help` 查看完整 CLI 参数。

### 恢复阻塞的流水线

- **PR 评论**：`/resume <pipelineId> [fromStage]`
- **REST API**：`POST /api/resume/:pipelineId`

### 监控

- **管理界面**：`http://localhost:8080/dashboard/`
- **API**：`GET /api/pipelines`、`GET /api/pipelines/:id`、`GET /api/pipelines/:id/logs`

## 高级配置

### LLM 路由

默认使用 Anthropic Claude（claude-sonnet-4-20250514）。可通过 API 或 `.ai-pipeline.json` 按任务类型覆盖：

```bash
# 通过 API 覆盖
curl -X PUT http://localhost:8080/api/llm/routes/implement \
  -H "Content-Type: application/json" \
  -d '{"provider":"anthropic","model":"claude-sonnet-4-20250514"}'
```

支持的 Provider：`anthropic`、`openai`、`internal`

### 通知

设置 `WECOM_WEBHOOK_URL` 启用企业微信群机器人失败通知。未设置则自动跳过。

### 项目级配置（.ai-pipeline.json）

放置在项目根目录，自定义项目行为：

```json
{
  "triggerLabel": "auto-implement",
  "branchPrefix": "feature/",
  "skipStages": [],
  "stages": {
    "编码实现": { "maxRetries": 5, "timeout": 900000 }
  }
}
```

完整配置字段见[项目配置字段](#项目配置字段)章节。

### Skills

Skills 是可复用的 Prompt 驱动能力。三个作用域：内置（`src/skills/`）、全局（`~/.ai-pipeline/skills/`）、项目级（`.ai-pipeline/skills/`）。同名时项目级覆盖全局。

### MCP 服务

全局配置：`~/.ai-pipeline/mcp-servers.json`；项目级配置：`.ai-pipeline.json` 的 `mcpServers` 字段（覆盖全局同名配置）。

## 参考

### 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `PORT` | 服务端口 | 否（默认: 8080）|
| `NODE_ENV` | 运行环境 | 否（默认: development）|
| `SQLITE_PATH` | SQLite 数据库路径 | 否（默认: ./data/pipeline.db）|
| `GITLAB_URL` | GitLab 实例地址 | 使用 GitLab 时 |
| `GITLAB_TOKEN` | GitLab 访问令牌 | 使用 GitLab 时 |
| `GITLAB_WEBHOOK_SECRET` | GitLab Webhook 密钥 | 使用 GitLab 时 |
| `GITHUB_TOKEN` | GitHub 访问令牌 | 使用 GitHub 时 |
| `GITHUB_WEBHOOK_SECRET` | GitHub Webhook 密钥 | 使用 GitHub 时 |
| `ANTHROPIC_API_KEY` | Anthropic API 密钥 | 是 |
| `OPENAI_API_KEY` | OpenAI API 密钥 | 否 |
| `LLM_PROXY_URL` | LLM API 代理地址 | 否 |
| `INTERNAL_LLM_URL` | 内部 LLM 端点 | 否 |
| `WORKSPACE_DIR` | 仓库工作目录 | 否（默认: ./data/workspaces）|
| `AUDIT_DIR` | 审计日志目录 | 否（默认: ./data/audit）|
| `GIT_AUTHOR_NAME` | Git 提交作者名 | 否 |
| `GIT_AUTHOR_EMAIL` | Git 提交作者邮箱 | 否 |
| `MCP_GLOBAL_CONFIG` | 全局 MCP 配置文件路径 | 否（默认: ~/.ai-pipeline/mcp-servers.json）|
| `SKILLS_GLOBAL_DIR` | 全局 Skills 目录 | 否（默认: ~/.ai-pipeline/skills）|
| `WECOM_WEBHOOK_URL` | 企业微信群机器人 Webhook URL | 否 |

### 项目配置字段

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
| `mcpServers` | object | 项目级 MCP 服务器定义 |

### API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/webhook/gitlab` | POST | GitLab Webhook 接收 |
| `/webhook/github` | POST | GitHub Webhook 接收 |
| `/api/trigger` | POST | CLI 触发（无签名验证） |
| `/api/resume/:pipelineId` | POST | 恢复被阻塞的流水线 |
| `/api/pipelines` | GET | 流水线列表（?status=&project_id=） |
| `/api/pipelines/:id` | GET | 流水线详情 |
| `/api/pipelines/:id/logs` | GET | 流水线审计日志 |
| `/api/llm/routes` | GET | LLM 路由配置 |
| `/api/llm/routes/:taskType` | PUT | 覆盖 LLM 路由 |
| `/api/llm/routes/:taskType` | DELETE | 清除 LLM 路由覆盖 |
| `/api/skills` | GET | Skills 列表 |
| `/api/mcp/servers` | GET | MCP Server 列表 |
| `/api/config` | GET | 运行配置（脱敏） |
| `/health` | GET | 健康检查 |
| `/dashboard/` | GET | Web 管理界面 |

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

## 开发

### 技术栈

| 类别 | 技术 |
|------|------|
| 语言 | TypeScript / Node.js |
| AI 引擎 | @anthropic-ai/sdk (Messages API + tool_use) |
| HTTP 框架 | Fastify |
| 任务队列 | p-queue + SQLite 持久化 |
| Git 客户端 | @gitbeaker/rest (GitLab), @octokit/rest (GitHub) |
| MCP 支持 | @modelcontextprotocol/sdk |

### 常用命令

```bash
npm run dev        # 开发模式（热重载）
npm run build      # TypeScript 编译
npm run start      # 生产模式
npm run test       # 运行测试
npm run lint       # 类型检查
```

### 项目结构

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
│   ├── mcp/            # MCP 集成
│   ├── notification/   # 通知渠道（企业微信等）
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

## 许可证

ISC
