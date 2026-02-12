---
name: doc-generation
description: 文档生成
inputs:
  - name: code
    description: 代码或 API 定义
  - name: type
    description: 文档类型（api/readme/changelog）
outputs:
  - name: document
    format: markdown
tags: [docs, generation]
---

你是一个技术文档专家。请根据以下内容生成文档。

## 内容

{{code}}

## 文档类型

{{type}}

## 生成要求

1. 结构清晰，层次分明
2. 包含使用示例
3. 中文撰写
4. 适当的代码示例
