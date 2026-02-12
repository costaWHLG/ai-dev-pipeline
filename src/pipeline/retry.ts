/**
 * 重试策略 — 指数退避
 */

export interface RetryOptions {
  maxRetries: number;
  baseDelay?: number;
  maxDelay?: number;
}

const DEFAULT_BASE_DELAY = 1000;
const DEFAULT_MAX_DELAY = 30_000;

/** 计算指数退避延迟 */
export function getRetryDelay(attempt: number, options?: Pick<RetryOptions, "baseDelay" | "maxDelay">): number {
  const base = options?.baseDelay ?? DEFAULT_BASE_DELAY;
  const max = options?.maxDelay ?? DEFAULT_MAX_DELAY;
  // 指数退避 + 随机抖动
  const delay = Math.min(base * Math.pow(2, attempt), max);
  const jitter = delay * 0.1 * Math.random();
  return delay + jitter;
}

/** 等待指定毫秒 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 带重试的执行 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < options.maxRetries) {
        const delay = getRetryDelay(attempt, options);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}
