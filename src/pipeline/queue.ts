/**
 * 内存任务队列 — p-queue 封装
 */

import PQueue from "p-queue";
import type { DevEvent } from "../types/index.js";

export type PipelineHandler = (event: DevEvent) => Promise<void>;

export class TaskQueue {
  private queue: PQueue;
  private handler: PipelineHandler | null = null;

  constructor(concurrency: number = 5) {
    this.queue = new PQueue({ concurrency });
  }

  /** 注册流水线处理函数 */
  onEvent(handler: PipelineHandler): void {
    this.handler = handler;
  }

  /** 投递事件到队列 */
  async enqueue(event: DevEvent): Promise<void> {
    if (!this.handler) {
      throw new Error("No pipeline handler registered");
    }
    const handler = this.handler;
    this.queue.add(() => handler(event));
  }

  /** 获取队列状态 */
  get size(): number {
    return this.queue.size;
  }

  get pending(): number {
    return this.queue.pending;
  }

  /** 等待所有任务完成 */
  async drain(): Promise<void> {
    await this.queue.onIdle();
  }

  /** 暂停队列 */
  pause(): void {
    this.queue.pause();
  }

  /** 恢复队列 */
  start(): void {
    this.queue.start();
  }

  /** 清空队列 */
  clear(): void {
    this.queue.clear();
  }
}
