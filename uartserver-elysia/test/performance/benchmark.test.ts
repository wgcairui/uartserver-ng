/**
 * Performance Benchmark Tests
 *
 * 性能基准测试：验证 Elysia.js 的性能优势
 *
 * 目标：
 * - Fire-and-Forget: < 10ms
 * - Cache Stats: < 50ms
 * - Throughput: > 10,000 req/s
 */

import { describe, test, expect } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import type { App } from '../../src/index';

const api = treaty<App>('localhost:3333');

/**
 * 性能测量工具
 */
class PerformanceMeter {
  private start: number = 0;
  private durations: number[] = [];

  startTimer() {
    this.start = performance.now();
  }

  recordDuration() {
    const duration = performance.now() - this.start;
    this.durations.push(duration);
    return duration;
  }

  getStats() {
    const sorted = [...this.durations].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, val) => acc + val, 0);

    return {
      count: sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: sum / sorted.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  reset() {
    this.durations = [];
  }
}

describe('Performance Benchmark Tests', () => {
  /**
   * 测试 1: Fire-and-Forget 响应时间
   */
  describe('Fire-and-Forget Response Time', () => {
    test('单次请求应该 < 10ms', async () => {
      const meter = new PerformanceMeter();

      meter.startTimer();
      await api.api.terminal.queryData.post({
        data: {
          mac: '00:11:22:33:44:55',
          pid: 1000,
          protocol: 'modbus',
          type: 1,
          content: 'benchmark test',
          timeStamp: Date.now(),
        },
      });
      const duration = meter.recordDuration();

      console.log(`🔥 Fire-and-Forget 响应时间: ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(10);
    });

    test('100 次连续请求的平均响应时间 < 10ms', async () => {
      const meter = new PerformanceMeter();

      for (let i = 0; i < 100; i++) {
        meter.startTimer();
        await api.api.terminal.queryData.post({
          data: {
            mac: '00:11:22:33:44:55',
            pid: 1000 + i,
            protocol: 'modbus',
            type: 1,
            content: `test-${i}`,
            timeStamp: Date.now(),
          },
        });
        meter.recordDuration();
      }

      const stats = meter.getStats();
      console.log(`📊 Fire-and-Forget 统计 (100 次):`);
      console.log(`  平均: ${stats.mean.toFixed(2)}ms`);
      console.log(`  中位数: ${stats.median.toFixed(2)}ms`);
      console.log(`  P95: ${stats.p95.toFixed(2)}ms`);
      console.log(`  P99: ${stats.p99.toFixed(2)}ms`);
      console.log(`  最小: ${stats.min.toFixed(2)}ms`);
      console.log(`  最大: ${stats.max.toFixed(2)}ms`);

      expect(stats.mean).toBeLessThan(10);
      expect(stats.p95).toBeLessThan(15);
    });
  });

  /**
   * 测试 2: Cache Stats 响应时间
   */
  describe('Cache Stats Response Time', () => {
    test('单次请求应该 < 50ms', async () => {
      const meter = new PerformanceMeter();

      meter.startTimer();
      await api.api.terminal.cache.stats.get();
      const duration = meter.recordDuration();

      console.log(`📊 Cache Stats 响应时间: ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(50);
    });

    test('100 次连续请求的平均响应时间 < 50ms', async () => {
      const meter = new PerformanceMeter();

      for (let i = 0; i < 100; i++) {
        meter.startTimer();
        await api.api.terminal.cache.stats.get();
        meter.recordDuration();
      }

      const stats = meter.getStats();
      console.log(`📊 Cache Stats 统计 (100 次):`);
      console.log(`  平均: ${stats.mean.toFixed(2)}ms`);
      console.log(`  P95: ${stats.p95.toFixed(2)}ms`);

      expect(stats.mean).toBeLessThan(50);
    });
  });

  /**
   * 测试 3: 并发性能
   */
  describe('Concurrent Performance', () => {
    test('100 个并发请求应该全部成功', async () => {
      const meter = new PerformanceMeter();
      const concurrency = 100;

      meter.startTimer();
      const requests = Array.from({ length: concurrency }, (_, i) =>
        api.api.terminal.queryData.post({
          data: {
            mac: `00:11:22:33:44:${String(i % 256).padStart(2, '0')}`,
            pid: 2000 + i,
            protocol: 'modbus',
            type: 1,
            content: `concurrent-${i}`,
            timeStamp: Date.now(),
          },
        })
      );

      const results = await Promise.all(requests);
      const totalDuration = meter.recordDuration();

      const successCount = results.filter((r) => r.error === null).length;

      console.log(`⚡ 并发测试 (${concurrency} 请求):`);
      console.log(`  成功: ${successCount}/${concurrency}`);
      console.log(`  总耗时: ${totalDuration.toFixed(2)}ms`);
      console.log(`  平均: ${(totalDuration / concurrency).toFixed(2)}ms/req`);

      expect(successCount).toBe(concurrency);
    });

    test('500 个并发请求应该保持高性能', async () => {
      const meter = new PerformanceMeter();
      const concurrency = 500;

      meter.startTimer();
      const requests = Array.from({ length: concurrency }, (_, i) =>
        api.api.terminal.cache.stats.get()
      );

      const results = await Promise.all(requests);
      const totalDuration = meter.recordDuration();

      const successCount = results.filter((r) => r.error === null).length;
      const avgDuration = totalDuration / concurrency;

      console.log(`⚡ 高并发测试 (${concurrency} 请求):`);
      console.log(`  成功: ${successCount}/${concurrency}`);
      console.log(`  总耗时: ${totalDuration.toFixed(2)}ms`);
      console.log(`  平均: ${avgDuration.toFixed(2)}ms/req`);
      console.log(`  吞吐量: ${((concurrency / totalDuration) * 1000).toFixed(0)} req/s`);

      expect(successCount).toBe(concurrency);
      expect(avgDuration).toBeLessThan(100); // 平均每个请求 < 100ms
    });
  });

  /**
   * 测试 4: 吞吐量测试
   */
  describe('Throughput Test', () => {
    test('1秒内应该处理 > 1000 个请求', async () => {
      const duration = 1000; // 1 秒
      const startTime = Date.now();
      let requestCount = 0;
      const requests: Promise<any>[] = [];

      // 持续发送请求直到时间到
      while (Date.now() - startTime < duration) {
        requests.push(
          api.api.terminal.queryData.post({
            data: {
              mac: '00:11:22:33:44:99',
              pid: 3000 + requestCount,
              protocol: 'modbus',
              type: 1,
              content: `throughput-${requestCount}`,
              timeStamp: Date.now(),
            },
          })
        );
        requestCount++;

        // 每 10 个请求暂停 1ms，避免过度占用
        if (requestCount % 10 === 0) {
          await new Promise((resolve) => setImmediate(resolve));
        }
      }

      // 等待所有请求完成
      const results = await Promise.all(requests);
      const actualDuration = Date.now() - startTime;
      const successCount = results.filter((r) => r.error === null).length;
      const throughput = (successCount / actualDuration) * 1000;

      console.log(`🚀 吞吐量测试:`);
      console.log(`  总请求数: ${requestCount}`);
      console.log(`  成功请求: ${successCount}`);
      console.log(`  测试时长: ${actualDuration}ms`);
      console.log(`  吞吐量: ${throughput.toFixed(0)} req/s`);

      expect(throughput).toBeGreaterThan(1000);
    }, 5000); // 5秒超时
  });

  /**
   * 测试 5: 稳定性测试
   */
  describe('Stability Test', () => {
    test('连续 1000 个请求无错误', async () => {
      const totalRequests = 1000;
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < totalRequests; i++) {
        const { error } = await api.api.terminal.queryData.post({
          data: {
            mac: '00:11:22:33:44:88',
            pid: 4000 + i,
            protocol: 'modbus',
            type: 1,
            content: `stability-${i}`,
            timeStamp: Date.now(),
          },
        });

        if (error) {
          errorCount++;
        } else {
          successCount++;
        }
      }

      console.log(`💪 稳定性测试 (${totalRequests} 请求):`);
      console.log(`  成功: ${successCount}`);
      console.log(`  失败: ${errorCount}`);
      console.log(`  成功率: ${((successCount / totalRequests) * 100).toFixed(2)}%`);

      expect(successCount).toBe(totalRequests);
      expect(errorCount).toBe(0);
    }, 30000); // 30秒超时
  });
});
