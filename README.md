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
│   ├── detector/       # Tech stack detection
│   ├── gateway/        # Webhook gateway and event normalization
│   ├── llm/            # LLM routing, proxy, and providers
│   ├── pipeline/       # Pipeline engine (state, queue, retry, lock)
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
