/**
 * Skills 加载器 — 从文件系统加载 Skill 定义（Markdown + YAML Front Matter）
 */

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export interface SkillInput {
  name: string;
  description: string;
}

export interface SkillOutput {
  name: string;
  format?: string;
}

export interface SkillDefinition {
  name: string;
  description: string;
  inputs: SkillInput[];
  outputs: SkillOutput[];
  tags: string[];
  template: string;
  source: "builtin" | "global" | "project";
  filePath: string;
}

/** 从目录加载所有 Skill 定义 */
export function loadSkillsFromDir(
  dir: string,
  source: SkillDefinition["source"],
): SkillDefinition[] {
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  const skills: SkillDefinition[] = [];

  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const { data, content } = matter(raw);

      skills.push({
        name: (data.name as string) ?? path.basename(file, ".md"),
        description: (data.description as string) ?? "",
        inputs: Array.isArray(data.inputs) ? data.inputs : [],
        outputs: Array.isArray(data.outputs) ? data.outputs : [],
        tags: Array.isArray(data.tags) ? data.tags : [],
        template: content.trim(),
        source,
        filePath,
      });
    } catch (err) {
      console.warn(`Failed to load skill from ${filePath}:`, err);
    }
  }

  return skills;
}
