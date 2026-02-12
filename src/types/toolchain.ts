/**
 * 技术栈工具链定义
 */

/** 工具链配置 */
export interface ToolChain {
  language: string;
  packageManager: string;
  test: string;
  lint: string;
  build: string;
  typeCheck?: string;
  framework?: string;
}
