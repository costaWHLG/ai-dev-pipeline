/**
 * 技术栈检测器 — 扫描工作区特征文件，自动识别语言、包管理器和工具链
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { ToolChain } from "../types/toolchain.js";

/** 检查文件是否存在 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** 安全读取文件内容，不存在时返回 null */
async function readFileOrNull(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

/** 安全解析 JSON，失败时返回 null */
function parseJsonOrNull<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// --- Node.js 检测 ---

/** 根据 lockfile 判断包管理器 */
async function detectNodePackageManager(workspace: string): Promise<string> {
  if (await fileExists(path.join(workspace, "pnpm-lock.yaml"))) return "pnpm";
  if (await fileExists(path.join(workspace, "yarn.lock"))) return "yarn";
  return "npm";
}

/** 从 package.json 的 dependencies / devDependencies 中检测框架 */
function detectNodeFramework(pkg: Record<string, unknown>): string | undefined {
  const deps: Record<string, string> = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  };
  if ("next" in deps) return "next";
  if ("nuxt" in deps) return "nuxt";
  if ("@nestjs/core" in deps) return "nest";
  if ("express" in deps) return "express";
  if ("fastify" in deps) return "fastify";
  if ("react" in deps) return "react";
  if ("vue" in deps) return "vue";
  if ("svelte" in deps) return "svelte";
  return undefined;
}

async function detectNodejs(workspace: string): Promise<ToolChain> {
  const pm = await detectNodePackageManager(workspace);
  const run = pm === "npm" ? "npm run" : pm;

  const raw = await readFileOrNull(path.join(workspace, "package.json"));
  const pkg = raw ? parseJsonOrNull<Record<string, unknown>>(raw) : null;
  const framework = pkg ? detectNodeFramework(pkg) : undefined;

  // 检查是否有 TypeScript
  const hasTs =
    (await fileExists(path.join(workspace, "tsconfig.json"))) ||
    Boolean(
      pkg &&
        (pkg.devDependencies as Record<string, string> | undefined)?.["typescript"],
    );

  return {
    language: "nodejs",
    packageManager: pm,
    test: `${run} test`,
    lint: `${run} lint`,
    build: `${run} build`,
    typeCheck: hasTs ? "tsc --noEmit" : undefined,
    framework,
  };
}

// --- Java 检测 ---

async function detectJavaMaven(workspace: string): Promise<ToolChain> {
  const raw = await readFileOrNull(path.join(workspace, "pom.xml"));
  const framework = raw?.includes("spring-boot") ? "spring" : undefined;
  return {
    language: "java",
    packageManager: "maven",
    test: "mvn test",
    lint: "mvn checkstyle:check",
    build: "mvn package -DskipTests",
    framework,
  };
}

async function detectJavaGradle(workspace: string): Promise<ToolChain> {
  const raw =
    (await readFileOrNull(path.join(workspace, "build.gradle"))) ??
    (await readFileOrNull(path.join(workspace, "build.gradle.kts")));
  const framework = raw?.includes("spring") ? "spring" : undefined;
  return {
    language: "java",
    packageManager: "gradle",
    test: "gradle test",
    lint: "gradle check",
    build: "gradle build -x test",
    framework,
  };
}

// --- Go 检测 ---

async function detectGo(workspace: string): Promise<ToolChain> {
  const raw = await readFileOrNull(path.join(workspace, "go.mod"));
  let framework: string | undefined;
  if (raw?.includes("github.com/gin-gonic/gin")) framework = "gin";
  else if (raw?.includes("github.com/labstack/echo")) framework = "echo";
  else if (raw?.includes("github.com/gofiber/fiber")) framework = "fiber";
  return {
    language: "go",
    packageManager: "go",
    test: "go test ./...",
    lint: "golangci-lint run",
    build: "go build ./...",
    framework,
  };
}

// --- Python 检测 ---
async function detectPythonFromPyproject(workspace: string): Promise<ToolChain> {
  const raw = (await readFileOrNull(path.join(workspace, "pyproject.toml")))!;

  // 判断包管理器：uv > poetry > pip
  let pm = "pip";
  if (raw.includes("[tool.uv]") || (await fileExists(path.join(workspace, "uv.lock")))) {
    pm = "uv";
  } else if (raw.includes("[tool.poetry]") || (await fileExists(path.join(workspace, "poetry.lock")))) {
    pm = "poetry";
  }

  // 检测框架
  let framework: string | undefined;
  if (raw.includes("fastapi")) framework = "fastapi";
  else if (raw.includes("django")) framework = "django";
  else if (raw.includes("flask")) framework = "flask";

  const run = pm === "uv" ? "uv run" : pm === "poetry" ? "poetry run" : "";
  const prefix = run ? `${run} ` : "";

  return {
    language: "python",
    packageManager: pm,
    test: `${prefix}pytest`,
    lint: `${prefix}ruff check .`,
    build: pm === "uv" ? "uv build" : pm === "poetry" ? "poetry build" : "python -m build",
    framework,
  };
}

function detectPythonPip(): ToolChain {
  return {
    language: "python",
    packageManager: "pip",
    test: "pytest",
    lint: "ruff check .",
    build: "python -m build",
  };
}

// --- 默认 ---

function unknownToolChain(): ToolChain {
  return {
    language: "unknown",
    packageManager: "unknown",
    test: "echo 'no test command configured'",
    lint: "echo 'no lint command configured'",
    build: "echo 'no build command configured'",
  };
}

// --- 主入口 ---

/**
 * 检测工作区技术栈
 *
 * 优先级：
 * 1. .ai-toolchain.json 手动覆盖
 * 2. package.json → Node.js
 * 3. pom.xml → Java / Maven
 * 4. build.gradle(.kts) → Java / Gradle
 * 5. go.mod → Go
 * 6. pyproject.toml → Python (uv/poetry/pip)
 * 7. requirements.txt → Python / pip
 * 8. 默认 unknown
 */
export async function detectTechStack(workspace: string): Promise<ToolChain> {
  // 1. 手动覆盖
  const overridePath = path.join(workspace, ".ai-toolchain.json");
  const overrideRaw = await readFileOrNull(overridePath);
  if (overrideRaw !== null) {
    const parsed = parseJsonOrNull<ToolChain>(overrideRaw);
    if (parsed) return parsed;
  }

  // 2. Node.js
  if (await fileExists(path.join(workspace, "package.json"))) {
    return detectNodejs(workspace);
  }

  // 3. Java / Maven
  if (await fileExists(path.join(workspace, "pom.xml"))) {
    return detectJavaMaven(workspace);
  }

  // 4. Java / Gradle
  if (
    (await fileExists(path.join(workspace, "build.gradle"))) ||
    (await fileExists(path.join(workspace, "build.gradle.kts")))
  ) {
    return detectJavaGradle(workspace);
  }

  // 5. Go
  if (await fileExists(path.join(workspace, "go.mod"))) {
    return detectGo(workspace);
  }

  // 6. Python / pyproject.toml
  if (await fileExists(path.join(workspace, "pyproject.toml"))) {
    return detectPythonFromPyproject(workspace);
  }

  // 7. Python / requirements.txt
  if (await fileExists(path.join(workspace, "requirements.txt"))) {
    return detectPythonPip();
  }

  // 8. 默认
  return unknownToolChain();
}
