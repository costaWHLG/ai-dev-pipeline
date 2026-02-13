/**
 * Skills 管理器 — 注册、查找、优先级管理
 *
 * 查找优先级：项目级 > 用户全局 > 内置
 */

import path from "node:path";
import { config } from "../config.js";
import { loadSkillsFromDir } from "./skills-loader.js";
import type { SkillDefinition } from "./skills-loader.js";

export class SkillsManager {
  private skills = new Map<string, SkillDefinition>();

  /** 从所有来源加载 Skills（内置 + 全局 + 项目） */
  load(projectDir?: string): void {
    this.skills.clear();

    // 1. 内置 skills（优先级最低）
    const builtinDir = path.resolve(
      path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")),
      "../../skills",
    );
    for (const skill of loadSkillsFromDir(builtinDir, "builtin")) {
      this.skills.set(skill.name, skill);
    }

    // 2. 用户全局 skills
    const globalDir = config.skillsGlobalDir.replace(
      /^~/,
      process.env.HOME ?? process.env.USERPROFILE ?? "",
    );
    for (const skill of loadSkillsFromDir(globalDir, "global")) {
      this.skills.set(skill.name, skill);
    }

    // 3. 项目级 skills（优先级最高）
    if (projectDir) {
      const projectSkillsDir = path.join(projectDir, ".ai-pipeline", "skills");
      for (const skill of loadSkillsFromDir(projectSkillsDir, "project")) {
        this.skills.set(skill.name, skill);
      }
    }
  }

  /** 按名称查找 Skill */
  find(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  /** 列出所有已加载的 Skills */
  list(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  /** 按标签查找 Skills */
  findByTag(tag: string): SkillDefinition[] {
    return this.list().filter((s) => s.tags.includes(tag));
  }
}
