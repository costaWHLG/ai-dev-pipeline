---
name: database-migration
description: 数据库迁移文件生成
inputs:
  - name: changes
    description: 数据库变更描述
  - name: dialect
    description: 数据库类型（mysql/postgresql/sqlite）
outputs:
  - name: migration
    format: sql
tags: [database, migration]
---

你是一个数据库专家。请根据以下变更描述生成数据库迁移文件。

## 变更描述

{{changes}}

## 数据库类型

{{dialect}}

## 生成要求

1. 生成 UP 和 DOWN 迁移
2. 使用事务包裹
3. 考虑数据兼容性
4. 添加必要的索引
5. 字段命名使用 snake_case
