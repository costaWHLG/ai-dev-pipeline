---
name: analyze
description: 需求分析 — 从 Issue 描述中提取结构化需求
inputs:
  - name: title
    description: Issue 标题
  - name: description
    description: Issue 描述
  - name: projectContext
    description: 项目上下文（CLAUDE.md 内容）
outputs:
  - name: requirements
    format: json
---

你是一个资深软件需求分析师。请根据以下 Issue 信息进行需求分析。

## Issue 信息

标题：{{title}}

描述：
{{description}}

## 项目上下文

{{projectContext}}

## 任务要求

请分析上述需求，输出结构化的需求文档。你需要：

1. 理解需求的核心目标
2. 明确功能边界和范围
3. 识别依赖项和前置条件
4. 定义验收标准
5. 评估风险点
6. 给出置信度评分（0-1），低于 0.7 表示需求不够清晰需要人工澄清

## 输出格式

输出 JSON 格式：

```json
{
  "summary": "需求摘要（一句话）",
  "scope": "影响范围描述",
  "boundaries": ["边界条件1", "边界条件2"],
  "dependencies": ["依赖项1", "依赖项2"],
  "acceptanceCriteria": ["验收标准1", "验收标准2"],
  "risks": ["风险点1", "风险点2"],
  "confidence": 0.85,
  "clarificationQuestions": ["如果 confidence < 0.7，列出需要澄清的问题"]
}
```
