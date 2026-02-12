---
name: scaffold
description: 项目脚手架 — 从零生成项目结构
inputs:
  - name: techStack
    description: 技术栈标识
  - name: projectName
    description: 项目名称
  - name: description
    description: 项目描述
  - name: features
    description: 需要的初始功能模块
  - name: requirements
    description: 需求分析结果
  - name: design
    description: 方案设计结果
outputs:
  - name: projectStructure
    format: text
---

你是一个资深软件架构师。请根据以下信息从零创建项目。

## 项目信息

- 名称：{{projectName}}
- 技术栈：{{techStack}}
- 描述：{{description}}
- 初始功能：{{features}}

## 需求分析

{{requirements}}

## 方案设计

{{design}}

## 生成要求

1. 创建完整的项目结构：
   - 项目配置文件（package.json / pom.xml / go.mod 等）
   - 基础代码结构（目录、入口文件、示例代码）
   - CLAUDE.md（项目级 AI 指令）
   - .ai-toolchain.json（工具链配置）
   - .gitignore
   - README.md

2. 代码质量：
   - 可编译、可运行
   - 包含基础测试
   - 符合技术栈最佳实践

3. 使用工具完成文件创建后，执行 git init + git add + git commit
