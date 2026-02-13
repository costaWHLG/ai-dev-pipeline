# AI Dev Pipeline

[中文文档](./README_zh.md)

Automated software development orchestration service that receives GitLab/GitHub events and drives AI Agents to complete the entire process from requirement analysis to code merge.

## Features

- **Multi-Platform Support** — Unified webhook gateway for GitLab and GitHub
- **AI-Powered Development** — Leverages Anthropic Claude with tool_use for intelligent code generation
- **Full Pipeline Automation** — From issue analysis → design → implementation → testing → code review
- **Flexible LLM Routing** — Multi-model support with proxy and fallback mechanisms
- **Persistent Task Queue** — SQLite-backed queue with retry and state recovery

## Quick Start

### Prerequisites

- Node.js >= 18
- npm >= 9

### Installation

```bash
git clone <repository-url>
cd ai-dev-pipeline
npm install
```

### Configuration

```bash
cp .env.example .env
```

Key environment variables (see [full list](#environment-variables) below):

| Variable | Description | Required |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | Anthropic API key | Yes |
| `GITHUB_TOKEN` | GitHub access token | If using GitHub |
| `GITHUB_WEBHOOK_SECRET` | GitHub webhook secret | If using GitHub |
| `GITLAB_URL` | GitLab instance URL | If using GitLab |
| `GITLAB_TOKEN` | GitLab access token | If using GitLab |
| `GITLAB_WEBHOOK_SECRET` | GitLab webhook secret | If using GitLab |

### Webhook Setup

**GitLab**: Project → Settings → Webhooks → URL `http://your-server:8080/webhook/gitlab`, set Secret Token, select Issues / Merge requests / Comments events.

**GitHub**: Repository → Settings → Webhooks → URL `http://your-server:8080/webhook/github`, set Secret, select Issues / Pull requests / Issue comments events.

### Start the Service

```bash
npm run dev        # Development mode (hot reload)
npm run start      # Production mode
```

Dashboard: `http://localhost:8080/dashboard/`

## Usage Guide

### Pipeline Types

| Type | Trigger | Stages |
|------|---------|--------|
| Full | Issue labeled `auto-implement` | Requirement Analysis → Design → Implementation → Testing → Code Review → Commit & Merge |
| Review | MR/PR created or updated | Code Review |
| Comment Fix | `@ai-bot` in MR/PR comment | Implementation → Testing → Code Review → Commit & Merge |
| Scaffold | CLI `scaffold` command | Requirement Analysis → Design → Scaffold Generation → Testing → Commit & Merge |

### Trigger Methods

**1. Issue Label** — Add `auto-implement` label to a GitLab/GitHub Issue to trigger the full pipeline.

**2. MR/PR Auto Review** — Creating or updating an MR/PR automatically triggers code review.

**3. MR/PR Comment** — Mention `@ai-bot` with instructions in an MR/PR comment:

```
@ai-bot Please fix the null pointer exception in the login handler
```

**4. CLI Manual Trigger**

```bash
npx tsx src/gateway/cli-trigger.ts manual \
  --project-id owner/repo \
  --clone-url https://github.com/owner/repo.git \
  --issue 1 --title "Add login feature"
```

**5. Scaffold — New Project from Scratch**

```bash
npx tsx src/gateway/cli-trigger.ts scaffold \
  --name my-app --tech fastapi --platform github
```

Supported tech stacks: `nextjs` / `fastapi` / `gin` / `spring-boot` / `custom`

Run `npx tsx src/gateway/cli-trigger.ts --help` for all CLI options.

### Resume a Blocked Pipeline

- **PR comment**: `/resume <pipelineId> [fromStage]`
- **REST API**: `POST /api/resume/:pipelineId`

### Monitor

- **Dashboard**: `http://localhost:8080/dashboard/`
- **API**: `GET /api/pipelines`, `GET /api/pipelines/:id`, `GET /api/pipelines/:id/logs`

## Advanced Configuration

### LLM Routing

Default routing uses Anthropic Claude (claude-sonnet-4-20250514). Override per task type via API or `.ai-pipeline.json`:

```bash
# Override via API
curl -X PUT http://localhost:8080/api/llm/routes/implement \
  -H "Content-Type: application/json" \
  -d '{"provider":"anthropic","model":"claude-sonnet-4-20250514"}'
```

Supported providers: `anthropic`, `openai`, `internal`

### Notification

Set `WECOM_WEBHOOK_URL` to enable WeCom bot failure notifications. Unset = silently skipped.

### Project-Level Config (.ai-pipeline.json)

Place in the project root to customize per-project behavior:

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

See [full config fields](#project-config-fields) in the reference section.

### Skills

Skills are reusable prompt-driven capabilities. Three scopes: builtin (`src/skills/`), global (`~/.ai-pipeline/skills/`), project (`.ai-pipeline/skills/`). Project-level skills override global ones with the same name.

### MCP Servers

Configure in `~/.ai-pipeline/mcp-servers.json` (global) or `.ai-pipeline.json` `mcpServers` field (project-level, overrides global).

## Reference

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port | No (default: 8080) |
| `NODE_ENV` | Environment mode | No (default: development) |
| `SQLITE_PATH` | SQLite database path | No (default: ./data/pipeline.db) |
| `GITLAB_URL` | GitLab instance URL | If using GitLab |
| `GITLAB_TOKEN` | GitLab access token | If using GitLab |
| `GITLAB_WEBHOOK_SECRET` | GitLab webhook secret | If using GitLab |
| `GITHUB_TOKEN` | GitHub access token | If using GitHub |
| `GITHUB_WEBHOOK_SECRET` | GitHub webhook secret | If using GitHub |
| `ANTHROPIC_API_KEY` | Anthropic API key | Yes |
| `OPENAI_API_KEY` | OpenAI API key | No |
| `LLM_PROXY_URL` | HTTP proxy for LLM APIs | No |
| `INTERNAL_LLM_URL` | Internal LLM endpoint | No |
| `WORKSPACE_DIR` | Working directory for repos | No (default: ./data/workspaces) |
| `AUDIT_DIR` | Audit log directory | No (default: ./data/audit) |
| `GIT_AUTHOR_NAME` | Git commit author name | No |
| `GIT_AUTHOR_EMAIL` | Git commit author email | No |
| `MCP_GLOBAL_CONFIG` | Global MCP config file path | No (default: ~/.ai-pipeline/mcp-servers.json) |
| `SKILLS_GLOBAL_DIR` | Global skills directory | No (default: ~/.ai-pipeline/skills) |
| `WECOM_WEBHOOK_URL` | WeCom bot webhook URL | No |

### Project Config Fields

| Field | Type | Description |
|-------|------|-------------|
| `triggerLabel` | string | Issue label that triggers the pipeline (default: `"auto-implement"`) |
| `branchPrefix` | string | Branch name prefix (default: `"feature/"`) |
| `skipStages` | string[] | Stages to skip entirely |
| `stages.<name>.skip` | boolean | Skip a specific stage |
| `stages.<name>.maxRetries` | number | Override max retry count |
| `stages.<name>.timeout` | number | Override timeout (ms) |
| `llm.<taskType>.model` | string | Override LLM model for a task type |
| `llm.<taskType>.temperature` | number | Override temperature |
| `llm.<taskType>.maxTokens` | number | Override max tokens |
| `mcpServers` | object | Project-level MCP server definitions |

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook/gitlab` | POST | GitLab webhook receiver |
| `/webhook/github` | POST | GitHub webhook receiver |
| `/api/trigger` | POST | CLI trigger (no signature) |
| `/api/resume/:pipelineId` | POST | Resume blocked pipeline |
| `/api/pipelines` | GET | Pipeline list (?status=&project_id=) |
| `/api/pipelines/:id` | GET | Pipeline detail |
| `/api/pipelines/:id/logs` | GET | Pipeline audit logs |
| `/api/llm/routes` | GET | LLM route configuration |
| `/api/llm/routes/:taskType` | PUT | Override LLM route |
| `/api/llm/routes/:taskType` | DELETE | Clear LLM route override |
| `/api/skills` | GET | Skills list |
| `/api/mcp/servers` | GET | MCP server list |
| `/api/config` | GET | Runtime config (sanitized) |
| `/health` | GET | Health check |
| `/dashboard/` | GET | Web Dashboard |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Dev Pipeline                          │
├─────────────────────────────────────────────────────────────────┤
│  Gateway Layer                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   GitLab    │  │   GitHub    │  │    Event Normalizer     │ │
│  │   Webhook   │  │   Webhook   │  │  (Unified Event Model)  │ │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘ │
│         └────────────────┴─────────────────────►│              │
├─────────────────────────────────────────────────┼──────────────┤
│  Pipeline Engine                                ▼              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  State Machine  │  Task Queue  │  Retry Logic  │  Lock     ││
│  └─────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│  Agent Layer (Messages API + tool_use)                         │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────┐ ┌──────────┐ │
│  │ Analyze  │ │  Design  │ │ Implement │ │ Test │ │  Review  │ │
│  │  Agent   │ │  Agent   │ │   Agent   │ │Agent │ │  Agent   │ │
│  └──────────┘ └──────────┘ └───────────┘ └──────┘ └──────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  LLM Router                          Git Adapters              │
│  ┌────────────────────────────┐     ┌────────────────────────┐ │
│  │ Anthropic │ OpenAI │ Local │     │  GitLab  │   GitHub    │ │
│  │  (proxy)  │(proxy) │  LLM  │     │ @gitbeaker│  @octokit  │ │
│  └────────────────────────────┘     └────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Development

### Tech Stack

| Category | Technology |
|----------|------------|
| Language | TypeScript / Node.js |
| AI Engine | @anthropic-ai/sdk (Messages API + tool_use) |
| HTTP Framework | Fastify |
| Task Queue | p-queue + SQLite persistence |
| Git Clients | @gitbeaker/rest (GitLab), @octokit/rest (GitHub) |
| MCP Support | @modelcontextprotocol/sdk |

### Commands

```bash
npm run dev        # Development mode (hot reload)
npm run build      # Compile TypeScript
npm run start      # Production mode
npm run test       # Run tests
npm run lint       # Type check
```

### Project Structure

```
ai-dev-pipeline/
├── src/
│   ├── adapters/       # Git platform adapters (GitLab/GitHub)
│   ├── agents/         # AI agents (analyze, design, implement, test, review)
│   ├── audit/          # Audit logging
│   ├── dashboard/      # Web Dashboard (HTML + CSS + JS)
│   ├── detector/       # Tech stack detection
│   ├── gateway/        # Webhook gateway and event normalization
│   ├── llm/            # LLM routing, proxy, and providers
│   ├── mcp/            # MCP integration
│   ├── notification/   # Notification channels (WeCom, etc.)
│   ├── pipeline/       # Pipeline engine (state, queue, retry, lock)
│   ├── skills/         # Skills management and execution
│   ├── types/          # TypeScript type definitions
│   ├── config.ts       # Configuration loader
│   └── index.ts        # Application entry point
├── tests/              # Test files
├── prompts/            # Prompt templates
├── skills/             # Skill definitions
├── deploy/             # Deployment configurations
├── .env.example        # Environment variable template
├── Dockerfile          # Container image definition
└── package.json        # Project dependencies
```

## License

ISC
