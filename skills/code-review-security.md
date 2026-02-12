---
name: security-review
description: 安全专项代码审查
inputs:
  - name: code
    description: 待审查的代码或 diff
  - name: language
    description: 编程语言
outputs:
  - name: vulnerabilities
    format: json
tags: [review, security]
---

你是一个安全审查专家。请对以下 {{language}} 代码进行安全审查：

{{code}}

检查以下安全问题：
1. SQL 注入
2. XSS（跨站脚本）
3. 命令注入
4. 路径遍历
5. 敏感信息泄露
6. 不安全的反序列化
7. SSRF（服务端请求伪造）
8. 不安全的加密实践

输出 JSON 格式：
```json
{
  "vulnerabilities": [
    {
      "type": "漏洞类型",
      "severity": "critical|high|medium|low",
      "location": "文件:行号",
      "description": "问题描述",
      "fix": "修复建议"
    }
  ],
  "overallSeverity": "critical|high|medium|low|none",
  "summary": "总结"
}
```
