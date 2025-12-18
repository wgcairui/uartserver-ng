/**
 * 基准性能测试 - 快速验证
 * 使用较小规模 (100 终端) 快速验证系统基本性能
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import type { FastifyInstance } from 'fastify';
import { mongodb } from '../../src/database/mongodb';
import { testDb } from '../helpers/test-db';
import { build } from '../../src/app';
import { createMetricsCollector, type MetricsCollector } from './utils/metrics-collector';
import {
  createTestTerminals,
  cleanupTestTerminals,
  generateMac,
  sleep,
  createResourceMonitor,
  type ResourceMonitor,
} from './utils/test-helpers';

describe('Baseline Performance Test', () => {
  let app: FastifyInstance;
  let serverUrl: string;
  let nodeClient: ClientSocket;
  let metricsCollector: MetricsCollector;
  let resourceMonitor: ResourceMonitor;

  const TERMINAL_COUNT = 100;
  const NODE_NAME = 'baseline-test-node';

  beforeAll(async () => {
    console.log('🚀 基准性能测试准备...');

    await testDb.connect();
    if (!mongodb.isConnected()) {
      await mongodb.connect();
    }

    // 先清理旧数据，再创建测试终端
    await cleanupTestTerminals(testDb.getDb());
    console.log('  ⏳ 创建测试终端数据...');
    await createTestTerminals(testDb.getDb(), TERMINAL_COUNT, 'baseline-test-node');
    console.log('  ✓ 测试终端数据创建完成');

    // 启动应用（会自动加载终端到缓存）
    app = await build();
    await app.listen({ port: 0, host: '127.0.0.1' });
    serverUrl = `http://127.0.0.1:${(app.server.address() as any)?.port}`;

    metricsCollector = createMetricsCollector();
    resourceMonitor = createResourceMonitor();

    console.log('✅ 准备完成\n');
  }, 30000);

  afterAll(async () => {
    if (nodeClient?.connected) {
      nodeClient.disconnect();
    }
    await cleanupTestTerminals(testDb.getDb());
    await app.close();
    await mongodb.disconnect();
    await testDb.disconnect();
  }, 30000);

  test('should meet baseline performance requirements', async () => {
    console.log('📊 开始基准性能测试\n');

    // 连接并注册 Node
    nodeClient = ioClient(`${serverUrl}/node`, { transports: ['websocket'] });

    await new Promise<void>((resolve, reject) => {
      nodeClient.on('connect', () => {
        nodeClient.emit(
          'RegisterNode',
          { Name: NODE_NAME, IP: '127.0.0.1', Port: 20000, MaxConnections: 200 },
          (response: any) => {
            if (response.success) resolve();
            else reject(new Error('Registration failed'));
          }
        );
      });
      nodeClient.on('connect_error', reject);
    });

    // 注册终端（通过 Socket.IO 事件触发缓存更新）
    console.log('  ⏳ 注册终端...');
    for (let i = 0; i < TERMINAL_COUNT; i++) {
      nodeClient.emit('TerminalMountDevRegister', {
        mac: generateMac(i),
        pid: 1,
        mountDev: `test-device-${i}`,
      });

      // 每 20 个终端等待一下，避免过快
      if ((i + 1) % 20 === 0) {
        console.log(`    - 已注册 ${i + 1}/${TERMINAL_COUNT} 个终端`);
        await sleep(100);
      }
    }
    await sleep(2000); // 等待缓存更新
    console.log('  ✓ 终端注册完成\n');

    // 开始性能测试
    metricsCollector.start();
    resourceMonitor.start(200);

    console.log('  🔥 执行查询测试...\n');

    // 并发查询
    const queryPromises: Promise<void>[] = [];

    for (let i = 0; i < TERMINAL_COUNT; i++) {
      const mac = generateMac(i);
      const eventName = `queryResult_${mac}_1`;

      queryPromises.push(
        new Promise<void>((resolve) => {
          const startTime = Date.now();

          nodeClient.once(eventName, (result: any) => {
            const latency = Date.now() - startTime;
            metricsCollector.recordLatency(latency, result.success !== false);
            resolve();
          });

          // 模拟查询结果
          setTimeout(() => {
            const useTime = Math.random() * 150 + 50;
            nodeClient.emit('queryResult', {
              eventName,
              mac,
              pid: 1,
              protocol: 'modbus',
              success: true,
              useTime,
              data: {
                mac,
                pid: 1,
                result: [{ name: 'value', value: '100', parseValue: '100' }],
                timeStamp: Date.now(),
                useTime,
                parentId: '',
                hasAlarm: 0,
              },
            });
          }, Math.random() * 50);
        })
      );

      // 每 20 个批量等待
      if ((i + 1) % 20 === 0) {
        await Promise.all(queryPromises.splice(0));
        metricsCollector.recordResourceUsage();
      }
    }

    await Promise.all(queryPromises);

    metricsCollector.stop();
    resourceMonitor.stop();

    console.log('  ✅ 测试完成\n');

    // 输出结果
    console.log('='.repeat(60));
    console.log(metricsCollector.getSummary());

    const resourceStats = resourceMonitor.getStats();
    if (resourceStats) {
      console.log('\n资源统计:');
      console.log(`  堆内存: ${resourceStats.memory.heapUsed.avg.toFixed(2)} MB (avg)`);
      console.log(`  RSS: ${resourceStats.memory.rss.max.toFixed(2)} MB (peak)`);
    }
    console.log('='.repeat(60) + '\n');

    // 验证基准性能
    const latency = metricsCollector.getLatencyStats();
    const throughput = metricsCollector.getThroughputStats();

    console.log('基准指标验证:\n');
    console.log(`  P95 延迟: ${latency.p95.toFixed(2)} ms`);
    console.log(`  平均延迟: ${latency.mean.toFixed(2)} ms`);
    console.log(`  吞吐量: ${throughput.requestsPerSecond.toFixed(2)} req/s`);
    console.log(`  成功率: ${(throughput.successRate * 100).toFixed(2)}%\n`);

    // 基准验证 (更宽松的标准)
    expect(latency.p95).toBeLessThan(1000); // P95 < 1s
    expect(latency.mean).toBeLessThan(500); // 平均 < 500ms
    expect(throughput.successRate).toBeGreaterThan(0.95); // 成功率 > 95%
    expect(throughput.requestsPerSecond).toBeGreaterThan(100); // 吞吐量 > 100 req/s
  }, 60000);

  test('should handle sequential queries efficiently', async () => {
    console.log('\n📊 顺序查询性能测试\n');

    metricsCollector.reset();
    metricsCollector.start();

    // 顺序执行查询
    for (let i = 0; i < 50; i++) {
      const mac = generateMac(i);
      const eventName = `seqQuery_${mac}_1`;
      const startTime = Date.now();

      await new Promise<void>((resolve) => {
        nodeClient.once(eventName, (result: any) => {
          const latency = Date.now() - startTime;
          metricsCollector.recordLatency(latency, result.success !== false);
          resolve();
        });

        nodeClient.emit('queryResult', {
          eventName,
          mac,
          pid: 1,
          protocol: 'modbus',
          success: true,
          useTime: 100,
          data: {
            mac,
            pid: 1,
            result: [{ name: 'temp', value: '25', parseValue: '25' }],
            timeStamp: Date.now(),
            useTime: 100,
            parentId: '',
            hasAlarm: 0,
          },
        });
      });
    }

    metricsCollector.stop();

    const latency = metricsCollector.getLatencyStats();
    console.log(`  平均延迟: ${latency.mean.toFixed(2)} ms`);
    console.log(`  P95 延迟: ${latency.p95.toFixed(2)} ms`);
    console.log(`  查询总数: ${latency.count}\n`);

    expect(latency.mean).toBeLessThan(200); // 平均延迟 < 200ms
    expect(latency.p95).toBeLessThan(500); // P95 < 500ms
  }, 30000);

  test('should maintain low latency under sustained load', async () => {
    console.log('📊 持续负载延迟稳定性测试\n');

    metricsCollector.reset();
    metricsCollector.start();

    // 持续查询 30 秒
    const duration = 30000;
    const startTime = Date.now();
    let queryCount = 0;

    console.log('  ⏳ 持续查询 30 秒...\n');

    while (Date.now() - startTime < duration) {
      const mac = generateMac(queryCount % TERMINAL_COUNT);
      const eventName = `sustainedQuery_${mac}_${queryCount}`;
      const reqStartTime = Date.now();

      await new Promise<void>((resolve) => {
        nodeClient.once(eventName, (result: any) => {
          const latency = Date.now() - reqStartTime;
          metricsCollector.recordLatency(latency, result.success !== false);
          resolve();
        });

        nodeClient.emit('queryResult', {
          eventName,
          mac,
          pid: 1,
          protocol: 'modbus',
          success: true,
          useTime: 80,
          data: {
            mac,
            pid: 1,
            result: [{ name: 'value', value: '50', parseValue: '50' }],
            timeStamp: Date.now(),
            useTime: 80,
            parentId: '',
            hasAlarm: 0,
          },
        });
      });

      queryCount++;

      // 每 100 个查询输出进度
      if (queryCount % 100 === 0) {
        const elapsed = Date.now() - startTime;
        const progress = (elapsed / duration) * 100;
        console.log(`    进度: ${progress.toFixed(1)}% (${queryCount} 查询)`);
      }

      // 控制查询速率 (~50 queries/s)
      await sleep(20);
    }

    metricsCollector.stop();

    const latency = metricsCollector.getLatencyStats();
    const throughput = metricsCollector.getThroughputStats();

    console.log('\n  结果:');
    console.log(`    总查询数: ${queryCount}`);
    console.log(`    平均延迟: ${latency.mean.toFixed(2)} ms`);
    console.log(`    P95 延迟: ${latency.p95.toFixed(2)} ms`);
    console.log(`    P99 延迟: ${latency.p99.toFixed(2)} ms`);
    console.log(`    吞吐量: ${throughput.requestsPerSecond.toFixed(2)} req/s\n`);

    // 验证持续负载下的性能稳定性
    expect(latency.p95).toBeLessThan(800); // P95 < 800ms
    expect(latency.p99).toBeLessThan(1500); // P99 < 1.5s
    expect(throughput.successRate).toBeGreaterThan(0.98); // 成功率 > 98%
  }, 40000);
});
