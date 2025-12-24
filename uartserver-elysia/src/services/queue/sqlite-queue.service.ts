/**
 * SQLite Queue Service
 *
 * 基于 Bun 内置 SQLite 的轻量级队列实现
 * - 零外部依赖 (无需 Redis)
 * - 3-6x 性能优于 Node.js SQLite
 * - 适用于开发/测试环境和中小规模生产环境 (≤1000 任务/分钟)
 */

import { Database } from 'bun:sqlite';
import type {
  QueueService,
  Job,
  JobOptions,
  JobProcessor,
  QueueStats,
} from './queue.interface';

/**
 * SQLite Queue 配置
 */
export interface SQLiteQueueConfig {
  /** 数据库文件路径 */
  dbPath: string;
  /** 处理循环间隔 (毫秒) */
  pollInterval?: number;
  /** 最大并发处理数 */
  maxConcurrency?: number;
}

/**
 * SQLite Queue Service Implementation
 */
export class SQLiteQueueService implements QueueService {
  private db: Database;
  private processors: Map<string, JobProcessor> = new Map();
  private isProcessing = false;
  private pollInterval: number;
  private maxConcurrency: number;
  private processingCount = 0;
  private processingPromise: Promise<void> | null = null;

  constructor(config: SQLiteQueueConfig) {
    this.db = new Database(config.dbPath);
    this.pollInterval = config.pollInterval || 100; // 100ms
    this.maxConcurrency = config.maxConcurrency || 10;

    this.initSchema();
    console.log(`[SQLiteQueue] Initialized at ${config.dbPath}`);
  }

  /**
   * 初始化数据库表结构
   */
  private initSchema(): void {
    // 创建任务表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        queue TEXT NOT NULL,
        name TEXT NOT NULL,
        data TEXT NOT NULL,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
        attempts INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 3,
        priority INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch()),
        started_at INTEGER,
        completed_at INTEGER,
        error TEXT
      )
    `);

    // 创建索引 (提升查询性能)
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_queue_status_priority
      ON jobs (queue, status, priority DESC)
    `);

    console.log('[SQLiteQueue] Schema initialized');
  }

  /**
   * 添加任务到队列
   */
  async addJob<T = any>(
    queueName: string,
    jobName: string,
    data: T,
    options?: JobOptions
  ): Promise<Job<T>> {
    const stmt = this.db.prepare(`
      INSERT INTO jobs (queue, name, data, priority, max_attempts)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      queueName,
      jobName,
      JSON.stringify(data),
      options?.priority || 0,
      options?.attempts || 3
    );

    return {
      id: result.lastInsertRowid.toString(),
      name: jobName,
      data,
      status: 'pending',
      createdAt: new Date(),
    };
  }

  /**
   * 注册任务处理器并启动处理循环
   */
  registerProcessor<T = any, R = any>(
    queueName: string,
    processor: JobProcessor<T, R>
  ): void {
    this.processors.set(queueName, processor);

    // 首次注册时启动处理循环
    if (!this.isProcessing) {
      this.startProcessing();
    }

    console.log(`[SQLiteQueue] Registered processor for queue: ${queueName}`);
  }

  /**
   * 启动任务处理循环
   */
  private startProcessing(): void {
    if (this.processingPromise) {
      return; // Already started
    }

    this.isProcessing = true;
    console.log('[SQLiteQueue] Processing started');

    this.processingPromise = (async () => {
      while (this.isProcessing) {
        try {
          // 处理所有队列的任务
          for (const [queueName, processor] of this.processors) {
            // 控制并发数
            if (this.processingCount >= this.maxConcurrency) {
              break;
            }

            await this.processNextJob(queueName, processor);
          }

          // 短暂休眠，避免 CPU 占用过高
          await Bun.sleep(this.pollInterval);
        } catch (error) {
          console.error('[SQLiteQueue] Processing loop error:', error);
          await Bun.sleep(1000); // 错误时等待 1 秒
        }
      }

      // 等待所有正在处理的任务完成
      while (this.processingCount > 0) {
        await Bun.sleep(50);
      }

      console.log('[SQLiteQueue] Processing stopped');
    })();
  }

  /**
   * 处理单个队列的下一个任务
   */
  private async processNextJob(
    queueName: string,
    processor: JobProcessor
  ): Promise<void> {
    // 1. 获取优先级最高的待处理任务
    const getStmt = this.db.prepare(`
      SELECT * FROM jobs
      WHERE queue = ? AND status = 'pending'
      ORDER BY priority DESC, id ASC
      LIMIT 1
    `);

    const row = getStmt.get(queueName) as any;
    if (!row) return; // 没有任务

    // 2. 标记为处理中
    const updateStmt = this.db.prepare(`
      UPDATE jobs
      SET status = 'processing', started_at = unixepoch()
      WHERE id = ? AND status = 'pending'
    `);

    const result = updateStmt.run(row.id);
    if (result.changes === 0) return; // 任务已被其他进程获取

    this.processingCount++;

    // 3. 构造 Job 对象
    const job: Job = {
      id: row.id.toString(),
      name: row.name,
      data: JSON.parse(row.data),
      status: 'processing',
      attempts: row.attempts,
    };

    // 4. 异步处理任务（不阻塞循环）
    this.executeJob(job, queueName, processor).finally(() => {
      this.processingCount--;
    });
  }

  /**
   * 执行任务
   */
  private async executeJob(
    job: Job,
    queueName: string,
    processor: JobProcessor
  ): Promise<void> {
    try {
      // 执行处理器
      await processor(job);

      // 标记为成功
      this.db
        .prepare(
          `
        UPDATE jobs
        SET status = 'completed', completed_at = unixepoch()
        WHERE id = ?
      `
        )
        .run(job.id);

      console.log(`[SQLiteQueue] Job completed: ${queueName}/${job.name} #${job.id}`);
    } catch (error) {
      // 处理失败
      const newAttempts = (job.attempts || 0) + 1;
      const maxAttempts = await this.getMaxAttempts(job.id);

      if (newAttempts >= maxAttempts) {
        // 超过最大重试次数，标记为失败
        this.db
          .prepare(
            `
          UPDATE jobs
          SET status = 'failed', attempts = ?, completed_at = unixepoch(), error = ?
          WHERE id = ?
        `
          )
          .run(newAttempts, error instanceof Error ? error.message : String(error), job.id);

        console.error(
          `[SQLiteQueue] Job failed permanently: ${queueName}/${job.name} #${job.id}`,
          error
        );
      } else {
        // 重置为待处理，等待重试
        this.db
          .prepare(
            `
          UPDATE jobs
          SET status = 'pending', attempts = ?, error = ?
          WHERE id = ?
        `
          )
          .run(newAttempts, error instanceof Error ? error.message : String(error), job.id);

        console.warn(
          `[SQLiteQueue] Job retry scheduled: ${queueName}/${job.name} #${job.id} (${newAttempts}/${maxAttempts})`
        );
      }
    }
  }

  /**
   * 获取任务的最大重试次数
   */
  private async getMaxAttempts(jobId: string): Promise<number> {
    const stmt = this.db.prepare(`SELECT max_attempts FROM jobs WHERE id = ?`);
    const row = stmt.get(jobId) as any;
    return row?.max_attempts || 3;
  }

  /**
   * 获取队列统计信息 (实现 QueueService 接口)
   */
  getQueueStats(queueName: string): QueueStats {
    const query = `
      SELECT
        status,
        COUNT(*) as count
      FROM jobs
      WHERE queue = ?
      GROUP BY status
    `;

    const stmt = this.db.prepare(query);
    const rows = stmt.all(queueName);

    const stats: QueueStats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };

    for (const row of rows as any[]) {
      const status = row.status as string;
      if (status in stats) {
        stats[status as keyof QueueStats] = row.count;
      }
    }

    return stats;
  }

  /**
   * 清理已完成/失败的旧任务 (实现 QueueService 接口)
   *
   * @param queueName - 队列名称（可选，不指定则清理所有队列）
   * @param olderThanDays - 清理多少天前的任务
   */
  async cleanup(queueName?: string, olderThanDays: number = 7): Promise<void> {
    const cutoffTimestamp = Math.floor(Date.now() / 1000) - olderThanDays * 24 * 60 * 60;

    const query = queueName
      ? `DELETE FROM jobs
         WHERE queue = ? AND status IN ('completed', 'failed') AND completed_at <= ?`
      : `DELETE FROM jobs
         WHERE status IN ('completed', 'failed') AND completed_at <= ?`;

    const stmt = this.db.prepare(query);
    const result = queueName ? stmt.run(queueName, cutoffTimestamp) : stmt.run(cutoffTimestamp);

    console.log(`[SQLiteQueue] Cleaned up ${result.changes} old jobs${queueName ? ` from queue ${queueName}` : ''}`);
  }

  /**
   * 关闭队列服务
   */
  async close(): Promise<void> {
    // 停止处理循环
    this.isProcessing = false;

    // 等待处理循环完全停止
    if (this.processingPromise) {
      await this.processingPromise;
      this.processingPromise = null;
    }

    // 关闭数据库
    this.db.close();
    console.log('[SQLiteQueue] Closed');
  }
}
