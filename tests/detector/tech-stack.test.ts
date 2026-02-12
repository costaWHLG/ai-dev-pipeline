/**
 * 技术栈检测器测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { detectTechStack } from "../../src/detector/tech-stack.js";

let tmpDir: string;

/** 在临时目录下创建 fixture 工作区 */
async function makeFixture(name: string, files: Record<string, string>): Promise<string> {
  const dir = path.join(tmpDir, name);
  await fs.mkdir(dir, { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    const filePath = path.join(dir, file);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
  }
  return dir;
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tech-stack-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// --- .ai-toolchain.json 覆盖 ---

describe("手动覆盖 (.ai-toolchain.json)", () => {
  it("存在合法 JSON 时直接返回覆盖配置", async () => {
    const override = {
      language: "rust",
      packageManager: "cargo",
      test: "cargo test",
      lint: "cargo clippy",
      build: "cargo build --release",
    };
    const ws = await makeFixture("override", {
      ".ai-toolchain.json": JSON.stringify(override),
      "package.json": '{}', // 即使有 package.json 也应被覆盖
    });
    const result = await detectTechStack(ws);
    expect(result).toEqual(override);
  });

  it("JSON 格式错误时回退到正常检测", async () => {
    const ws = await makeFixture("override-bad", {
      ".ai-toolchain.json": "not valid json {{{",
      "package.json": JSON.stringify({ name: "test" }),
    });
    const result = await detectTechStack(ws);
    expect(result.language).toBe("nodejs");
  });
});

// --- Node.js ---

describe("Node.js 检测", () => {
  it("package.json + package-lock.json → npm", async () => {
    const ws = await makeFixture("node-npm", {
      "package.json": JSON.stringify({
        name: "test",
        dependencies: { express: "^4.0.0" },
      }),
      "package-lock.json": "{}",
    });
    const result = await detectTechStack(ws);
    expect(result.language).toBe("nodejs");
    expect(result.packageManager).toBe("npm");
    expect(result.test).toBe("npm run test");
    expect(result.framework).toBe("express");
  });

  it("package.json + yarn.lock → yarn", async () => {
    const ws = await makeFixture("node-yarn", {
      "package.json": JSON.stringify({ name: "test" }),
      "yarn.lock": "",
    });
    const result = await detectTechStack(ws);
    expect(result.packageManager).toBe("yarn");
    expect(result.test).toBe("yarn test");
  });

  it("package.json + pnpm-lock.yaml → pnpm", async () => {
    const ws = await makeFixture("node-pnpm", {
      "package.json": JSON.stringify({ name: "test" }),
      "pnpm-lock.yaml": "",
    });
    const result = await detectTechStack(ws);
    expect(result.packageManager).toBe("pnpm");
    expect(result.test).toBe("pnpm test");
  });

  it("检测 TypeScript 项目设置 typeCheck", async () => {
    const ws = await makeFixture("node-ts", {
      "package.json": JSON.stringify({ name: "test" }),
      "tsconfig.json": "{}",
    });
    const result = await detectTechStack(ws);
    expect(result.typeCheck).toBe("tsc --noEmit");
  });

  it("检测 Next.js 框架", async () => {
    const ws = await makeFixture("node-next", {
      "package.json": JSON.stringify({
        name: "test",
        dependencies: { next: "^14.0.0", react: "^18.0.0" },
      }),
    });
    const result = await detectTechStack(ws);
    expect(result.framework).toBe("next");
  });
});

// --- Java ---

describe("Java 检测", () => {
  it("pom.xml → maven", async () => {
    const ws = await makeFixture("java-maven", {
      "pom.xml": "<project><dependencies></dependencies></project>",
    });
    const result = await detectTechStack(ws);
    expect(result.language).toBe("java");
    expect(result.packageManager).toBe("maven");
    expect(result.test).toBe("mvn test");
    expect(result.build).toBe("mvn package -DskipTests");
  });

  it("pom.xml 含 spring-boot → framework=spring", async () => {
    const ws = await makeFixture("java-spring", {
      "pom.xml": "<project><parent><artifactId>spring-boot-starter-parent</artifactId></parent></project>",
    });
    const result = await detectTechStack(ws);
    expect(result.framework).toBe("spring");
  });

  it("build.gradle → gradle", async () => {
    const ws = await makeFixture("java-gradle", {
      "build.gradle": "plugins { id 'java' }",
    });
    const result = await detectTechStack(ws);
    expect(result.language).toBe("java");
    expect(result.packageManager).toBe("gradle");
    expect(result.test).toBe("gradle test");
  });
});

// --- Go ---

describe("Go 检测", () => {
  it("go.mod → go", async () => {
    const ws = await makeFixture("go-basic", {
      "go.mod": "module example.com/myapp\n\ngo 1.21\n",
    });
    const result = await detectTechStack(ws);
    expect(result.language).toBe("go");
    expect(result.packageManager).toBe("go");
    expect(result.test).toBe("go test ./...");
    expect(result.framework).toBeUndefined();
  });

  it("go.mod 含 gin → framework=gin", async () => {
    const ws = await makeFixture("go-gin", {
      "go.mod": 'module example.com/myapp\n\nrequire github.com/gin-gonic/gin v1.9.0\n',
    });
    const result = await detectTechStack(ws);
    expect(result.framework).toBe("gin");
  });
});

// --- Python ---

describe("Python 检测", () => {
  it("pyproject.toml (无特殊标记) → pip", async () => {
    const ws = await makeFixture("py-pip", {
      "pyproject.toml": '[project]\nname = "myapp"\n',
    });
    const result = await detectTechStack(ws);
    expect(result.language).toBe("python");
    expect(result.packageManager).toBe("pip");
    expect(result.test).toBe("pytest");
  });

  it("pyproject.toml + [tool.poetry] → poetry", async () => {
    const ws = await makeFixture("py-poetry", {
      "pyproject.toml": '[tool.poetry]\nname = "myapp"\ndependencies = { fastapi = "^0.100" }\n',
    });
    const result = await detectTechStack(ws);
    expect(result.packageManager).toBe("poetry");
    expect(result.test).toBe("poetry run pytest");
    expect(result.framework).toBe("fastapi");
  });

  it("pyproject.toml + [tool.uv] → uv", async () => {
    const ws = await makeFixture("py-uv", {
      "pyproject.toml": '[tool.uv]\nname = "myapp"\n',
    });
    const result = await detectTechStack(ws);
    expect(result.packageManager).toBe("uv");
    expect(result.test).toBe("uv run pytest");
    expect(result.build).toBe("uv build");
  });

  it("requirements.txt → pip", async () => {
    const ws = await makeFixture("py-req", {
      "requirements.txt": "flask==3.0.0\n",
    });
    const result = await detectTechStack(ws);
    expect(result.language).toBe("python");
    expect(result.packageManager).toBe("pip");
  });
});

// --- 默认 ---

describe("默认检测", () => {
  it("空目录 → unknown", async () => {
    const ws = await makeFixture("empty", {});
    const result = await detectTechStack(ws);
    expect(result.language).toBe("unknown");
    expect(result.packageManager).toBe("unknown");
  });
});
