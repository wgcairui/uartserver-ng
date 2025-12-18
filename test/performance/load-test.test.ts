/**
 * 负载测试 - 1000 终端并发查询
 * 测试系统在高负载下的性能表现
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import type { FastifyInstance } from 'fastify';
import { mongodb } from '../../src/database/mongodb';
import { testDb } from '../helpers/test-db';
import { build } from '../../src/app';
import {
  createMetricsCollector,
  type MetricsCollector,
} from './utils/metrics-collector';
import {
  createTestTerminals,
  cleanupTestTerminals,
  generateMac,
  sleep,
  createResourceMonitor,
  type ResourceMonitor,
} from './utils/test-helpers';

describe('Load Test - 1000 Concurrent Terminals', () => {
  let app: FastifyInstance;
  let serverUrl: string;
  let nodeClient: ClientSocket;
  let metricsCollector: MetricsCollector;
  let resourceMonitor: ResourceMonitor;

  // 测试配置
  const TERMINAL_COUNT = 1000;
  const CONCURRENT_QUERIES = 100; // 每批并发查询数
  const NODE_NAME = 'load-test-node-0';

  beforeAll(async () => {
    console.log('🚀 开始负载测试准备...');

    // 连接数据库
    await testDb.connect();
    if (!mongodb.isConnected()) {
      await mongodb.connect();
    }

    // 启动应用
    app = await build();
    await app.listen({ port: 0, host: '127.0.0.1' });
    serverUrl = `http://127.0.0.1:${(app.server.address() as any)?.port}`;

    console.log(`  ✓ 服务器启动: ${serverUrl}`);

    // 清理旧数据并创建测试终端
    await cleanupTestTerminals(testDb.getDb());
    console.log('  ✓ 清理旧数据完成');

    console.log(`  ⏳ 创建 ${TERMINAL_COUNT} 个测试终端数据...`);
    await createTestTerminals(testDb.getDb(), TERMINAL_COUNT, 'load-test-node');
    console.log('  ✓ 测试终端数据创建完成');

    // 初始化指标收集器
    metricsCollector = createMetricsCollector();
    resourceMonitor = createResourceMonitor();

    console.log('✅ 负载测试准备完成\n');
  }, 60000);

  afterAll(async () => {
    console.log('\n🧹 清理测试环境...');

    if (nodeClient?.connected) {
      nodeClient.disconnect();
    }

    await cleanupTestTerminals(testDb.getDb());
    await app.close();
    await mongodb.disconnect();
    await testDb.disconnect();

    console.log('✅ 清理完成');
  }, 30000);

  test('should handle 1000 concurrent terminal queries', async () => {
    console.log('\n📊 开始负载测试: 1000 个终端并发查询\n');

    // 连接 Node 客户端
    nodeClient = ioClient(`${serverUrl}/node`, {
      transports: ['websocket'],
    });

    await new Promise<void>((resolve, reject) => {
      nodeClient.on('connect', () => {
        console.log('  ✓ Node 客户端已连接');

        // 注册 Node
        nodeClient.emit(
          'RegisterNode',
          {
            Name: NODE_NAME,
            IP: '127.0.0.1',
            Port: 20000,
            MaxConnections: 2000,
          },
          (response: any) => {
            if (response.success) {
              console.log('  ✓ Node 注册成功\n');
              resolve();
            } else {
              reject(new Error('Node registration failed'));
            }
          }
        );
      });

      nodeClient.on('connect_error', reject);
    });

    // 注册所有终端到 Node（通过 Socket.IO 事件触发缓存更新）
    console.log('  ⏳ 注册终端到 Node...');
    for (let i = 0; i < TERMINAL_COUNT; i++) {
      const mac = generateMac(i);
      nodeClient.emit('TerminalMountDevRegister', {
        mac,
        pid: 1,
        mountDev: `test-device-${i}`,
      });

      // 每 50 个终端等待一下，避免过快
      if ((i + 1) % 50 === 0) {
        console.log(`    - 已注册 ${i + 1}/${TERMINAL_COUNT} 个终端`);
        await sleep(100);
      }
    }
    console.log('  ✓ 所有终端注册完成\n');

    // 等待系统稳定和缓存更新
    console.log('  ⏳ 等待系统稳定...');
    await sleep(3000);
    console.log('  ✓ 系统已稳定\n');

    // 开始性能测试
    console.log('  🔥 开始并发查询测试...\n');

    metricsCollector.start();
    resourceMonitor.start(500); // 每 500ms 采样一次资源

    // 模拟查询请求
    const queryPromises: Promise<void>[] = [];

    for (let i = 0; i < TERMINAL_COUNT; i++) {
      const mac = generateMac(i);

      const queryPromise = new Promise<void>((resolve) => {
        const startTime = Date.now();

        // 设置查询事件监听器
        const eventName = `queryResult_${mac}_1`;
        nodeClient.once(eventName, (result: any) => {
          const latency = Date.now() - startTime;
          metricsCollector.recordLatency(latency, result.success !== false);
          resolve();
        });

        // 模拟服务器发送查询指令
        // 注意: 实际场景中是服务器主动发送查询指令给 Node
        // 这里为了测试，我们直接触发查询结果返回
        // 使用 setImmediate 以最小延迟执行，更好地测试系统实际吞吐量
        setImmediate(() => {
          const useTime = Math.random() * 50 + 10; // 10-60ms 随机延迟
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
              result: [
                { name: 'temperature', value: '25.5', parseValue: '25.5' },
                { name: 'humidity', value: '60', parseValue: '60' },
              ],
              timeStamp: Date.now(),
              useTime,
              parentId: '',
              hasAlarm: 0,
            },
          });
        });
      });

      queryPromises.push(queryPromise);

      // 分批执行，避免一次性创建太多 Promise
      if ((i + 1) % CONCURRENT_QUERIES === 0 || i === TERMINAL_COUNT - 1) {
        await Promise.all(queryPromises.splice(0));
        metricsCollector.recordResourceUsage();

        const progress = ((i + 1) / TERMINAL_COUNT) * 100;
        console.log(`    - 进度: ${progress.toFixed(1)}% (${i + 1}/${TERMINAL_COUNT})`);
      }
    }

    metricsCollector.stop();
    resourceMonitor.stop();

    console.log('\n  ✅ 查询测试完成\n');

    // 输出性能指标
    console.log('='.repeat(60));
    console.log(metricsCollector.getSummary());
    console.log('='.repeat(60));

    const resourceStats = resourceMonitor.getStats();
    if (resourceStats) {
      console.log('\n资源使用详情:');
      console.log(`  - 堆内存: ${resourceStats.memory.heapUsed.min.toFixed(2)} MB (min)`);
      console.log(`            ${resourceStats.memory.heapUsed.max.toFixed(2)} MB (max)`);
      console.log(`            ${resourceStats.memory.heapUsed.avg.toFixed(2)} MB (avg)`);
      console.log(`  - RSS 内存: ${resourceStats.memory.rss.max.toFixed(2)} MB (peak)`);
      console.log(`  - 采样次数: ${resourceStats.snapshotCount}`);
      console.log('='.repeat(60));
    }

    // 验证性能指标
    const latencyStats = metricsCollector.getLatencyStats();
    const throughputStats = metricsCollector.getThroughputStats();
    const peakResource = metricsCollector.getPeakResourceStats();

    console.log('\n📋 验收标准检查:\n');

    // 验收标准 1: P95 延迟 < 500ms
    const p95Pass = latencyStats.p95 < 500;
    console.log(`  ${p95Pass ? '✅' : '❌'} P95 延迟: ${latencyStats.p95.toFixed(2)} ms (目标 < 500ms)`);

    // 验收标准 2: 吞吐量 > 1000 queries/s
    const throughputPass = throughputStats.requestsPerSecond > 1000;
    console.log(
      `  ${throughputPass ? '✅' : '❌'} 吞吐量: ${throughputStats.requestsPerSecond.toFixed(2)} req/s (目标 > 1000 req/s)`
    );

    // 验收标准 3: 内存使用 < 500MB
    const memoryPass = peakResource.memory < 500;
    console.log(
      `  ${memoryPass ? '✅' : '❌'} 峰值内存: ${peakResource.memory.toFixed(2)} MB (目标 < 500MB)`
    );

    // 验收标准 4: 成功率 > 95%
    const successRatePass = throughputStats.successRate > 0.95;
    console.log(
      `  ${successRatePass ? '✅' : '❌'} 成功率: ${(throughputStats.successRate * 100).toFixed(2)}% (目标 > 95%)`
    );

    console.log('\n' + '='.repeat(60) + '\n');

    // 断言验收标准
    expect(latencyStats.p95).toBeLessThan(500);
    expect(throughputStats.requestsPerSecond).toBeGreaterThan(1000);
    expect(peakResource.memory).toBeLessThan(500);
    expect(throughputStats.successRate).toBeGreaterThan(0.95);
    expect(throughputStats.totalRequests).toBe(TERMINAL_COUNT);
  }, 120000); // 2 分钟超时
});
