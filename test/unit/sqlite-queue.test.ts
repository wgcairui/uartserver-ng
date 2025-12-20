/**
 * SQLite Queue Service Unit Tests
 *
 * 测试 SQLite 队列服务的核心功能：
 * - 任务添加和处理
 * - 优先级队列
 * - 重试机制
 * - 并发控制
 * - 统计信息
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { SQLiteQueueService } from '../../src/services/queue/sqlite-queue.service';
import type { Job, QueueStats } from '../../src/services/queue/queue.interface';
import { unlink } from 'node:fs/promises';

describe('SQLiteQueueService', () => {
  const testDbPath = './test-queue.db';
  let queueService: SQLiteQueueService;

  beforeEach(() => {
    queueService = new SQLiteQueueService({
      dbPath: testDbPath,
      pollInterval: 50, // 快速轮询用于测试
      maxConcurrency: 5,
    });
  });

  afterEach(async () => {
    await queueService.close();
    try {
      await unlink(testDbPath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe('addJob()', () => {
    test('should add job to queue with default options', async () => {
      const job = await queueService.addJob('test-queue', 'test-job', { message: 'hello' });

      expect(job.id).toBeDefined();
      expect(job.name).toBe('test-job');
      expect(job.data).toEqual({ message: 'hello' });
      expect(job.status).toBe('pending');
    });

    test('should add job with priority', async () => {
      const highPriorityJob = await queueService.addJob(
        'test-queue',
        'high-priority',
        { urgent: true },
        { priority: 10 }
      );

      const lowPriorityJob = await queueService.addJob(
        'test-queue',
        'low-priority',
        { urgent: false },
        { priority: 1 }
      );

      expect(highPriorityJob.id).toBeDefined();
      expect(lowPriorityJob.id).toBeDefined();
    });

    test('should add job with custom max attempts', async () => {
      const job = await queueService.addJob(
        'test-queue',
        'retry-job',
        { data: 'test' },
        { attempts: 5 }
      );

      expect(job.id).toBeDefined();
    });
  });

  describe('registerProcessor() and job processing', () => {
    test('should process job successfully', async () => {
      const processedJobs: Job[] = [];

      queueService.registerProcessor('test-queue', async (job) => {
        processedJobs.push(job);
      });

      await queueService.addJob('test-queue', 'test-job', { message: 'process me' });

      // Wait for job to be processed
      await Bun.sleep(200);

      expect(processedJobs.length).toBe(1);
      expect(processedJobs[0].name).toBe('test-job');
      expect(processedJobs[0].data).toEqual({ message: 'process me' });
    });

    test('should process jobs in priority order', async () => {
      const processedOrder: string[] = [];

      queueService.registerProcessor('priority-queue', async (job) => {
        processedOrder.push(job.data.name);
        await Bun.sleep(50); // Simulate work
      });

      // Add jobs in reverse priority order
      await queueService.addJob('priority-queue', 'low', { name: 'low' }, { priority: 1 });
      await queueService.addJob('priority-queue', 'high', { name: 'high' }, { priority: 10 });
      await queueService.addJob('priority-queue', 'medium', { name: 'medium' }, { priority: 5 });

      // Wait for all jobs to be processed
      await Bun.sleep(400);

      expect(processedOrder).toEqual(['high', 'medium', 'low']);
    });

    test('should handle multiple queues independently', async () => {
      const queue1Jobs: Job[] = [];
      const queue2Jobs: Job[] = [];

      queueService.registerProcessor('queue-1', async (job) => {
        queue1Jobs.push(job);
      });

      queueService.registerProcessor('queue-2', async (job) => {
        queue2Jobs.push(job);
      });

      await queueService.addJob('queue-1', 'job1', { data: 'q1' });
      await queueService.addJob('queue-2', 'job2', { data: 'q2' });
      await queueService.addJob('queue-1', 'job3', { data: 'q1-2' });

      await Bun.sleep(300);

      expect(queue1Jobs.length).toBe(2);
      expect(queue2Jobs.length).toBe(1);
    });
  });

  describe('retry mechanism', () => {
    /**
     * TODO: 实现重试机制测试
     *
     * 这是一个关键的业务逻辑测试，需要验证：
     * 1. 任务失败后是否会重试
     * 2. 重试次数是否受 max_attempts 限制
     * 3. 超过最大重试次数后，任务状态是否变为 'failed'
     *
     * 提示：
     * - 使用一个会抛出错误的 processor
     * - 使用计数器追踪重试次数
     * - 设置 attempts: 3 作为最大重试次数
     * - 使用 getQueueStats() 验证最终状态
     *
     * 示例结构：
     * test('should retry failed jobs up to max attempts', async () => {
     *   let attemptCount = 0;
     *   queueService.registerProcessor('retry-queue', async (job) => {
     *     attemptCount++;
     *     throw new Error('Simulated failure');
     *   });
     *
     *   await queueService.addJob('retry-queue', 'failing-job', { data: 'test' }, { attempts: 3 });
     *
     *   // 等待所有重试完成 (每次重试间隔约 pollInterval)
     *   await Bun.sleep(???);
     *
     *   // 验证重试次数
     *   expect(attemptCount).toBe(???);
     *
     *   // 验证最终状态
     *   const stats = queueService.getQueueStats('retry-queue');
     *   expect(stats.failed).toBe(???);
     * });
     */
  });

  describe('concurrent processing', () => {
    test('should respect maxConcurrency limit', async () => {
      let currentlyProcessing = 0;
      let maxConcurrentReached = 0;

      queueService.registerProcessor('concurrent-queue', async (job) => {
        currentlyProcessing++;
        maxConcurrentReached = Math.max(maxConcurrentReached, currentlyProcessing);
        await Bun.sleep(100); // Simulate work
        currentlyProcessing--;
      });

      // Add 10 jobs
      for (let i = 0; i < 10; i++) {
        await queueService.addJob('concurrent-queue', `job-${i}`, { index: i });
      }

      // Wait for all jobs to complete
      await Bun.sleep(500);

      // maxConcurrency is 5, so we should never exceed it
      expect(maxConcurrentReached).toBeLessThanOrEqual(5);
    });
  });

  describe('getQueueStats()', () => {
    test('should return correct queue statistics', async () => {
      // Add jobs with different outcomes
      queueService.registerProcessor('stats-queue', async (job) => {
        if (job.data.shouldFail) {
          throw new Error('Forced failure');
        }
        // Success
      });

      await queueService.addJob('stats-queue', 'success-1', { shouldFail: false });
      await queueService.addJob('stats-queue', 'success-2', { shouldFail: false });
      await queueService.addJob('stats-queue', 'fail-1', { shouldFail: true }, { attempts: 1 });

      // Wait for processing (longer to ensure all jobs complete)
      await Bun.sleep(500);

      const stats = queueService.getQueueStats('stats-queue');

      expect(stats.completed).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.pending).toBe(0);
    });

    test('should return empty stats for non-existent queue', () => {
      const stats = queueService.getQueueStats('non-existent');

      expect(stats.pending).toBe(0);
      expect(stats.processing).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
    });
  });

  describe('cleanup()', () => {
    test('should cleanup old completed jobs', async () => {
      queueService.registerProcessor('cleanup-queue', async (job) => {
        // Process successfully
      });

      await queueService.addJob('cleanup-queue', 'job-1', { data: 'test' });
      await queueService.addJob('cleanup-queue', 'job-2', { data: 'test' });

      // Wait for jobs to complete (longer to ensure completion)
      await Bun.sleep(400);

      let stats = queueService.getQueueStats('cleanup-queue');
      expect(stats.completed).toBe(2);

      // Cleanup jobs older than 0 days (all)
      await queueService.cleanup('cleanup-queue', 0);

      stats = queueService.getQueueStats('cleanup-queue');
      expect(stats.completed).toBe(0);
    });

    test('should cleanup all queues when queueName not specified', async () => {
      queueService.registerProcessor('queue-a', async () => {});
      queueService.registerProcessor('queue-b', async () => {});

      await queueService.addJob('queue-a', 'job', { data: 'a' });
      await queueService.addJob('queue-b', 'job', { data: 'b' });

      // Wait for jobs to complete (longer to ensure completion)
      await Bun.sleep(400);

      // Verify jobs completed first
      let statsA = queueService.getQueueStats('queue-a');
      let statsB = queueService.getQueueStats('queue-b');
      expect(statsA.completed).toBe(1);
      expect(statsB.completed).toBe(1);

      // Cleanup all queues
      await queueService.cleanup(undefined, 0);

      statsA = queueService.getQueueStats('queue-a');
      statsB = queueService.getQueueStats('queue-b');

      expect(statsA.completed).toBe(0);
      expect(statsB.completed).toBe(0);
    });
  });

  describe('error handling', () => {
    test('should handle processor errors gracefully', async () => {
      const errors: Error[] = [];

      queueService.registerProcessor('error-queue', async (job) => {
        const error = new Error('Test error');
        errors.push(error);
        throw error;
      });

      await queueService.addJob('error-queue', 'error-job', { data: 'test' }, { attempts: 1 });

      await Bun.sleep(200);

      expect(errors.length).toBe(1);

      const stats = queueService.getQueueStats('error-queue');
      expect(stats.failed).toBe(1);
    });
  });
});
