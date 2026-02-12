/**
 * 项目级并发锁 — 同一项目串行执行
 */

/** 锁条目 */
interface LockEntry {
  resolve: () => void;
}

export class ProjectLock {
  private locks = new Map<string, Promise<void>>();
  private waiters = new Map<string, LockEntry[]>();

  /** 获取项目锁（同一项目串行） */
  async acquire(projectId: string): Promise<void> {
    while (this.locks.has(projectId)) {
      // 等待当前锁释放
      await new Promise<void>((resolve) => {
        const waiters = this.waiters.get(projectId) ?? [];
        waiters.push({ resolve });
        this.waiters.set(projectId, waiters);
      });
    }

    // 设置锁
    let releaseFn: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseFn = resolve;
    });
    this.locks.set(projectId, lockPromise);
  }

  /** 释放项目锁 */
  release(projectId: string): void {
    this.locks.delete(projectId);

    // 唤醒第一个等待者
    const waiters = this.waiters.get(projectId);
    if (waiters && waiters.length > 0) {
      const next = waiters.shift()!;
      if (waiters.length === 0) {
        this.waiters.delete(projectId);
      }
      next.resolve();
    }
  }

  /** 检查项目是否被锁定 */
  isLocked(projectId: string): boolean {
    return this.locks.has(projectId);
  }
}

/** 全局项目锁实例 */
export const projectLock = new ProjectLock();
