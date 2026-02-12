# AI Dev Pipeline

## 项目概述
自动化软件开发编排服务，接收 GitLab/GitHub 事件，驱动 AI Agent 完成从需求分析到代码合并的全流程。

## 技术栈
- 语言：TypeScript / Node.js
- AI 引擎：@anthropic-ai/sdk (Messages API + tool_use)
- HTTP 框架：Fastify
- 任务队列：p-queue + SQLite 持久化
- Git 客户端：@gitbeaker/rest (GitLab), @octokit/rest (GitHub)

## 常用命令
```bash
npm run dev        # 开发模式启动
npm run build      # TypeScript 编译
npm run start      # 生产模式启动
npm run test       # 运行测试
npm run lint       # 类型检查
```

## 架构要点
- src/gateway/ — 统一事件网关（Webhook 接收 + 归一化）
- src/adapters/ — Git 适配器（GitLab/GitHub 统一接口）
- src/llm/ — LLM 路由（多模型 + 代理 + fallback）
- src/pipeline/ — 流水线引擎（状态机 + 重试 + 持久化）
- src/agents/ — AI Agent 层（Messages API + tool_use 循环）
- src/detector/ — 技术栈检测器
- src/audit/ — 审计日志

## 编码规范
- 中文注释和 commit message
- UTF-8 编码
- strict TypeScript
