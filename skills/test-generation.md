---
name: test-generation
description: 测试用例生成
inputs:
  - name: code
    description: 待测试的代码
  - name: language
    description: 编程语言
  - name: framework
    description: 测试框架
outputs:
  - name: tests
    format: code
tags: [test, generation]
---

你是一个测试工程师。请为以下 {{language}} 代码生成测试用例。

## 代码

{{code}}

## 测试框架

{{framework}}

## 生成要求

1. 覆盖正常路径和异常路径
2. 边界条件测试
3. 空值/null 处理
4. 错误场景
5. 使用 mock 隔离外部依赖
6. 测试命名清晰，描述预期行为
