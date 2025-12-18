/**
 * 性能测试辅助函数
 */

import type { Db } from 'mongodb';

/**
 * 测试终端配置
 */
export interface TestTerminalConfig {
  DevMac: string; // 使用 DevMac 字段名以匹配数据库
  name: string;
  mountNode: string;
  online: boolean;
  mountDevs: Array<{
    pid: number;
    protocol: string;
    Type: string;
    online: boolean;
    minQueryLimit: number;
    mountDev: string;
  }>;
}

/**
 * 生成测试 MAC 地址
 */
export function generateMac(index: number): string {
  const hex = index.toString(16).padStart(4, '0');
  return `AA:BB:CC:DD:${hex.slice(0, 2)}:${hex.slice(2, 4)}`.toUpperCase();
}

/**
 * 批量创建测试终端
 */
export async function createTestTerminals(
  db: Db,
  count: number,
  nodePrefix: string = 'perf-node'
): Promise<TestTerminalConfig[]> {
  const terminals: TestTerminalConfig[] = [];

  for (let i = 0; i < count; i++) {
    const mac = generateMac(i);
    const nodeIndex = Math.floor(i / 100); // 每 100 个终端分配一个节点

    const terminal: TestTerminalConfig = {
      DevMac: mac, // 使用 DevMac 字段
      name: `Performance Test Terminal ${i}`,
      mountNode: `${nodePrefix}-${nodeIndex}`,
      online: true,
      mountDevs: [
        {
          pid: 1,
          protocol: 'modbus',
          Type: 'collector',
          online: true,
          minQueryLimit: 5000,
          mountDev: `test-device-${i}`,
        },
      ],
    };

    terminals.push(terminal);
  }

  // 批量插入到数据库
  if (terminals.length > 0) {
    await db.collection('terminals').insertMany(terminals);
  }

  return terminals;
}

/**
 * 清理测试终端
 */
export async function cleanupTestTerminals(
  db: Db,
  macPrefix: string = 'AA:BB:CC:DD'
): Promise<void> {
  await db.collection('terminals').deleteMany({
    DevMac: { $regex: `^${macPrefix}` },
  });
  console.log(`  ✓ 清理测试终端完成 (prefix: ${macPrefix})`);
}

/**
 * 等待指定时间
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 并发执行任务
 */
export async function runConcurrent<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number = 100
): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<void>[] = [];

  for (const task of tasks) {
    const promise = task().then((result) => {
      results.push(result);
      executing.splice(executing.indexOf(promise), 1);
    });

    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

/**
 * 重试函数
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (i < maxRetries - 1) {
        await sleep(delayMs);
      }
    }
  }

  throw lastError || new Error('Retry failed');
}

/**
 * 监控资源使用
 */
export class ResourceMonitor {
  private interval: Timer | null = null;
  private snapshots: Array<{
    timestamp: number;
    memory: NodeJS.MemoryUsage;
    cpu: NodeJS.CpuUsage;
  }> = [];

  /**
   * 开始监控
   */
  start(intervalMs: number = 1000): void {
    this.snapshots = [];
    this.interval = setInterval(() => {
      this.snapshots.push({
        timestamp: Date.now(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
      });
    }, intervalMs);
  }

  /**
   * 停止监控
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * 获取快照
   */
  getSnapshots() {
    return this.snapshots;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    if (this.snapshots.length === 0) {
      return null;
    }

    const memoryValues = this.snapshots.map((s) => s.memory.heapUsed / 1024 / 1024);
    const rssValues = this.snapshots.map((s) => s.memory.rss / 1024 / 1024);

    return {
      memory: {
        heapUsed: {
          min: Math.min(...memoryValues),
          max: Math.max(...memoryValues),
          avg: memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length,
        },
        rss: {
          min: Math.min(...rssValues),
          max: Math.max(...rssValues),
          avg: rssValues.reduce((a, b) => a + b, 0) / rssValues.length,
        },
      },
      snapshotCount: this.snapshots.length,
      duration: this.snapshots[this.snapshots.length - 1].timestamp - this.snapshots[0].timestamp,
    };
  }
}

/**
 * 创建资源监控器
 */
export function createResourceMonitor(): ResourceMonitor {
  return new ResourceMonitor();
}
