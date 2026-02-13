# AI Dev Pipeline

[中文文档](./README_zh.md)

Automated software development orchestration service that receives GitLab/GitHub events and drives AI Agents to complete the entire process from requirement analysis to code merge.

## Features

- **Multi-Platform Support** — Unified webhook gateway for GitLab and GitHub
- **AI-Powered Development** — Leverages Anthropic Claude with tool_use for intelligent code generation
- **Full Pipeline Automation** — From issue analysis → design → implementation → testing → code review
- **Flexible LLM Routing** — Multi-model support with proxy and fallback mechanisms
- **Persistent Task Queue** — SQLite-backed queue with retry and state recovery
- **Tech Stack Detection** — Automatic project technology detection for context-aware generation
- **Audit Logging** — Complete traceability of all AI operations

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

## Tech Stack

| Category | Technology |
|----------|------------|
| Language | TypeScript / Node.js |
| AI Engine | @anthropic-ai/sdk (Messages API + tool_use) |
| HTTP Framework | Fastify |
| Task Queue | p-queue + SQLite persistence |
| Git Clients | @gitbeaker/rest (GitLab), @octokit/rest (GitHub) |
| MCP Support | @modelcontextprotocol/sdk |

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

Copy the example environment file and configure:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```bash
# Service Configuration
PORT=8080
NODE_ENV=development

# Data Storage
SQLITE_PATH=./data/pipeline.db

# GitLab Configuration
GITLAB_URL=https://gitlab.example.com/
GITLAB_TOKEN=your-gitlab-token
GITLAB_WEBHOOK_SECRET=your-webhook-secret

# GitHub Configuration
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
GITHUB_WEBHOOK_SECRET=your-webhook-secret

# LLM Configuration
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxxxxxx

# LLM Proxy (for internal network access)
LLM_PROXY_URL=http://proxy.example.com:8080
LLM_NO_PROXY=localhost,127.0.0.1

# Internal LLM (optional)
INTERNAL_LLM_URL=http://internal-llm:8000/v1
INTERNAL_LLM_API_KEY=
INTERNAL_LLM_MODEL=deepseek-coder-v2

# Workspace
WORKSPACE_DIR=./data/workspaces
AUDIT_DIR=./data/audit

# Git Identity for AI commits
GIT_AUTHOR_NAME=AI Dev Pipeline
GIT_AUTHOR_EMAIL=ai-bot@example.com
```

### Start the Service

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm run build
npm run start
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port | No (default: 8080) |
| `NODE_ENV` | Environment mode | No (default: development) |
| `SQLITE_PATH` | SQLite database path | No (default: ./data/pipeline.db) |
| `GITLAB_URL` | GitLab instance URL | Yes (if using GitLab) |
| `GITLAB_TOKEN` | GitLab access token | Yes (if using GitLab) |
| `GITLAB_WEBHOOK_SECRET` | GitLab webhook secret | Yes (if using GitLab) |
| `GITHUB_TOKEN` | GitHub access token | Yes (if using GitHub) |
| `GITHUB_WEBHOOK_SECRET` | GitHub webhook secret | Yes (if using GitHub) |
| `ANTHROPIC_API_KEY` | Anthropic API key | Yes |
| `OPENAI_API_KEY` | OpenAI API key | No |
| `LLM_PROXY_URL` | HTTP proxy for LLM APIs | No |
| `LLM_NO_PROXY` | Proxy bypass list | No |
| `INTERNAL_LLM_URL` | Internal LLM endpoint | No |
| `WORKSPACE_DIR` | Working directory for repos | No (default: ./data/workspaces) |
| `AUDIT_DIR` | Audit log directory | No (default: ./data/audit) |
| `GIT_AUTHOR_NAME` | Git commit author name | No |
| `GIT_AUTHOR_EMAIL` | Git commit author email | No |
| `MCP_GLOBAL_CONFIG` | Global MCP config file path | No (default: ~/.ai-pipeline/mcp-servers.json) |
| `SKILLS_GLOBAL_DIR` | Global skills directory | No (default: ~/.ai-pipeline/skills) |

## Webhook Configuration

### GitLab

1. Go to your project → Settings → Webhooks
2. Add webhook URL: `http://your-server:8080/webhook/gitlab`
3. Set Secret Token (same as `GITLAB_WEBHOOK_SECRET`)
4. Select triggers: Issues events, Merge request events, Comments

### GitHub

1. Go to your repository → Settings → Webhooks
2. Add webhook URL: `http://your-server:8080/webhook/github`
3. Set Secret (same as `GITHUB_WEBHOOK_SECRET`)
4. Select events: Issues, Pull requests, Issue comments

## Development Commands

```bash
npm run dev        # Start in development mode with hot reload
npm run build      # Compile TypeScript
npm run start      # Start in production mode
npm run test       # Run tests
npm run lint       # Type check
```

## Project Structure

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
│   ├── mcp/            # MCP (Model Context Protocol) integration
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

## Dashboard

The built-in web dashboard provides a visual overview of pipelines, LLM configuration, Skills, and MCP servers.

Access: `http://localhost:8080/dashboard/`

Features:
- Pipeline statistics and recent activity
- Pipeline detail view with stage timeline and audit logs
- LLM route configuration with live override support
- Skills listing (builtin / global / project)
- MCP server listing

## LLM Configuration

### Route Table

Each pipeline task type maps to a default LLM model. The routing table is defined in `src/llm/providers.ts`:

| Task Type | Default Model | Fallback Model |
|-----------|--------------|----------------|
| analyze | claude-opus-4-6 | deepseek-v3 |
| design | claude-opus-4-6 | deepseek-v3 |
| implement | claude-opus-4-6 | deepseek-coder-v2 |
| review | claude-opus-4-6 | deepseek-coder-v2 |
| fix | claude-opus-4-6 | deepseek-coder-v2 |

### Runtime Override

Override a route via API:

```bash
# Set override
curl -X PUT http://localhost:8080/api/llm/routes/analyze \
  -H 'Content-Type: application/json' \
  -d '{"provider":"openai","model":"gpt-4","temperature":0.3,"maxTokens":16384}'

# Clear override
curl -X DELETE http://localhost:8080/api/llm/routes/analyze
```

Or use the Dashboard LLM tab for a visual editor.

## Skills

Skills are reusable prompt templates (Markdown + YAML front matter) that agents can invoke during pipeline execution. The `SkillsExecutor` renders the template with input variables and calls the LLM to produce output.

### Directory Structure & Priority

Skills are loaded from three sources. When names collide, higher-priority sources win:

```
<project>/.ai-pipeline/skills/   # Project skills (highest priority)
~/.ai-pipeline/skills/           # User global skills
skills/                          # Built-in skills (lowest priority)
```

The global directory is configured via `SKILLS_GLOBAL_DIR` (default `~/.ai-pipeline/skills`).

### Skill File Format

Each skill is a `.md` file with YAML front matter:

```markdown
---
name: code-review
description: Perform a thorough code review
tags: [review, quality]
inputs:
  - name: code
    description: The source code to review
  - name: language
    description: Programming language
outputs:
  - name: feedback
    format: markdown
---

You are a senior code reviewer. Review the following {{language}} code for:
- Correctness and edge cases
- Security vulnerabilities
- Performance issues
- Code style and readability

```{{language}}
{{code}}
```
```

### Using Skills in Pipeline

Skills are automatically available to agents. You can also invoke them via the `SkillsExecutor`:

```typescript
import { SkillsManager } from "./skills/skills-manager.js";
import { SkillsExecutor } from "./skills/skills-executor.js";

const manager = new SkillsManager();
manager.load("/path/to/project");  // loads builtin + global + project skills

const executor = new SkillsExecutor(manager, llmRouter, auditLogger);
const result = await executor.execute("code-review", {
  code: "function add(a, b) { return a + b; }",
  language: "javascript",
});
```

### Querying Skills via API

```bash
# List all loaded skills
curl http://localhost:8080/api/skills

# Response example:
# [{"name":"code-review","description":"...","source":"builtin","tags":["review","quality"],"inputs":[...],"outputs":[...]}]
```

## MCP Configuration

MCP (Model Context Protocol) servers extend agent capabilities with external tools. When a pipeline runs, the `MCPManager` starts configured servers, discovers their tools, and registers them as Anthropic-compatible tools that agents can call via `tool_use`.

### How It Works

1. `MCPManager.startAll(projectDir)` loads config and starts all MCP servers
2. Each server's tools are discovered via `listTools()` and registered in `MCPRegistry`
3. Tools are exposed to agents as `mcp_<serverName>_<toolName>` in the Anthropic tool format
4. When an agent calls an MCP tool, `MCPManager.callTool()` routes the call to the correct server
5. On pipeline completion, `MCPManager.stopAll()` shuts down all servers

### Supported Transports

| Transport | Status | Config Key |
|-----------|--------|------------|
| stdio | Supported | `command` + `args` |
| SSE | Planned | `url` + `transport: "sse"` |

### Global Config

File: `~/.ai-pipeline/mcp-servers.json` (configurable via `MCP_GLOBAL_CONFIG`)

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-filesystem", "/path/to/allowed/dir"],
      "description": "File system read/write access"
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-github"],
      "env": { "GITHUB_TOKEN": "ghp_xxx" },
      "description": "GitHub API access"
    }
  }
}
```

### Project Config

MCP servers can also be defined in the project-level `.ai-pipeline.json` (see below). Project-level servers override global servers with the same name.

### Querying MCP via API

```bash
# List active MCP servers
curl http://localhost:8080/api/mcp/servers

# Response example:
# [{"name":"filesystem","transport":"stdio","description":"File system access","command":"npx"}]
```

## Project Configuration (.ai-pipeline.json)

Place a `.ai-pipeline.json` file in the project root to customize pipeline behavior per-project:

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
      "description": "Project database access"
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `triggerLabel` | string | Issue label that triggers the pipeline (default: `"auto-implement"`) |
| `branchPrefix` | string | Branch name prefix for generated branches (default: `"feature/"`) |
| `skipStages` | string[] | Stages to skip entirely |
| `stages.<name>.skip` | boolean | Skip a specific stage |
| `stages.<name>.maxRetries` | number | Override max retry count for a stage |
| `stages.<name>.timeout` | number | Override timeout (ms) for a stage |
| `llm.<taskType>.model` | string | Override LLM model for a task type |
| `llm.<taskType>.temperature` | number | Override temperature |
| `llm.<taskType>.maxTokens` | number | Override max tokens |
| `mcpServers` | object | Project-level MCP server definitions (overrides global) |

## API Endpoints

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
| `/status` | GET | Server status |
| `/dashboard/` | GET | Web Dashboard |

## License

ISC
