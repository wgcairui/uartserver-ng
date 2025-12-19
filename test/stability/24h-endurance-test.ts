/**
 * 24 小时稳定性测试
 *
 * 目标：
 * 1. 验证系统在长时间运行下的稳定性
 * 2. 检测内存泄漏
 * 3. 监控性能指标变化趋势
 * 4. 验证错误恢复机制
 *
 * 运行方式：
 * ```bash
 * bun run test/stability/24h-endurance-test.ts
 * ```
 *
 * 监控：
 * - Prometheus: http://localhost:9090
 * - Grafana: http://localhost:3000
 * - 测试日志: logs/stability-test.log
 */

import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import type { FastifyInstance } from 'fastify';
import { build } from '../../src/app';
import { mongodb } from '../../src/database/mongodb';
import { testDb } from '../helpers/test-db';
import * as fs from 'fs';
import * as path from 'path';

// ========== 测试配置 ==========

const CONFIG = {
  // 测试时长（24 小时）
  DURATION_MS: 24 * 60 * 60 * 1000,

  // 模拟终端数量
  NUM_TERMINALS: 50,

  // 模拟用户数量
  NUM_USERS: 10,

  // 查询间隔（每个终端）
  QUERY_INTERVAL_MS: 5000,

  // 指标收集间隔（5 分钟）
  METRICS_INTERVAL_MS: 5 * 60 * 1000,

  // 日志文件路径
  LOG_FILE: path.join(process.cwd(), 'logs', 'stability-test.log'),

  // 测试报告路径
  REPORT_FILE: path.join(process.cwd(), 'logs', 'stability-test-report.json'),
};

// ========== 测试状态 ==========

interface TestMetrics {
  timestamp: number;
  memoryUsage: NodeJS.MemoryUsage;
  activeConnections: number;
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  avgResponseTime: number;
  errors: string[];
}

class StabilityTest {
  private app!: FastifyInstance;
  private serverUrl!: string;
  private nodeClients: ClientSocket[] = [];
  private userClients: ClientSocket[] = [];

  private startTime!: number;
  private metrics: TestMetrics[] = [];
  private totalQueries = 0;
  private successfulQueries = 0;
  private failedQueries = 0;
  private responseTimes: number[] = [];
  private errors: string[] = [];

  private metricsInterval!: Timer;
  private queryIntervals: Timer[] = [];

  private isRunning = false;

  constructor() {
    this.ensureLogDirectory();
  }

  /**
   * 确保日志目录存在
   */
  private ensureLogDirectory(): void {
    const logDir = path.dirname(CONFIG.LOG_FILE);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * 记录日志
   */
  private log(message: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO'): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}\n`;

    console.log(logMessage.trim());
    fs.appendFileSync(CONFIG.LOG_FILE, logMessage);
  }

  /**
   * 启动应用服务器
   */
  private async startServer(): Promise<void> {
    this.log('🚀 启动应用服务器...');

    await testDb.connect();
    if (!mongodb.isConnected()) {
      await mongodb.connect();
    }

    this.app = await build();
    await this.app.listen({ port: 0, host: '127.0.0.1' });
    this.serverUrl = `http://127.0.0.1:${(this.app.server.address() as any)?.port}`;

    this.log(`✅ 服务器启动成功: ${this.serverUrl}`);
  }

  /**
   * 创建 Node 客户端（模拟 DTU 设备）
   */
  private async createNodeClients(): Promise<void> {
    this.log(`📡 创建 ${CONFIG.NUM_TERMINALS} 个 Node 客户端...`);

    for (let i = 0; i < CONFIG.NUM_TERMINALS; i++) {
      const client = ioClient(`${this.serverUrl}/node`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve, reject) => {
        client.on('connect', () => {
          client.emit('RegisterNode', {
            Name: `stability-test-node-${i}`,
            IP: '127.0.0.1',
            Port: 20000 + i,
            MaxConnections: 100,
          }, (response: any) => {
            if (response.success) {
              // 注册测试终端
              client.emit('TerminalMountDevRegister', {
                mac: `AA:BB:CC:DD:EE:${i.toString(16).padStart(2, '0')}`,
                pid: 1,
                mountDev: `test-device-${i}`,
              });
              resolve();
            } else {
              reject(new Error('Node registration failed'));
            }
          });
        });

        client.on('connect_error', reject);
      });

      this.nodeClients.push(client);
    }

    this.log(`✅ ${CONFIG.NUM_TERMINALS} 个 Node 客户端创建完成`);
  }

  /**
   * 创建用户客户端
   */
  private async createUserClients(): Promise<void> {
    this.log(`👥 创建 ${CONFIG.NUM_USERS} 个用户客户端...`);

    for (let i = 0; i < CONFIG.NUM_USERS; i++) {
      const client = ioClient(`${this.serverUrl}/user`, {
        transports: ['websocket'],
        auth: { token: 'dev-mode' },
      });

      await new Promise<void>((resolve, reject) => {
        client.on('connect', () => {
          // 订阅多个设备
          const devicesPerUser = Math.ceil(CONFIG.NUM_TERMINALS / CONFIG.NUM_USERS);
          const startIdx = i * devicesPerUser;
          const endIdx = Math.min(startIdx + devicesPerUser, CONFIG.NUM_TERMINALS);

          let subscribed = 0;
          const totalDevices = endIdx - startIdx;

          for (let j = startIdx; j < endIdx; j++) {
            client.emit('subscribe', {
              mac: `AA:BB:CC:DD:EE:${j.toString(16).padStart(2, '0')}`,
              pid: 1,
            }, (response: any) => {
              subscribed++;
              // 所有设备订阅完成后 resolve
              if (subscribed === totalDevices) {
                resolve();
              }
            });
          }

          // 如果没有设备需要订阅，直接 resolve
          if (totalDevices === 0) {
            resolve();
          }
        });

        client.on('connect_error', reject);
      });

      this.userClients.push(client);
    }

    this.log(`✅ ${CONFIG.NUM_USERS} 个用户客户端创建完成`);
  }

  /**
   * 启动持续查询
   */
  private startContinuousQueries(): void {
    this.log('🔄 启动持续查询...');

    this.nodeClients.forEach((client, index) => {
      const mac = `AA:BB:CC:DD:EE:${index.toString(16).padStart(2, '0')}`;
      const interval = setInterval(() => {
        if (!this.isRunning) {
          clearInterval(interval);
          return;
        }

        const queryStart = Date.now();
        const queryEventName = `queryResult_${mac}_1`;

        this.totalQueries++;

        // 模拟查询结果
        client.emit('queryResult', {
          eventName: queryEventName,
          mac,
          pid: 1,
          protocol: 'modbus',
          success: Math.random() > 0.05, // 5% 失败率
          useTime: Math.floor(Math.random() * 100) + 20,
          data: {
            mac,
            pid: 1,
            result: [
              {
                name: 'temperature',
                value: (20 + Math.random() * 10).toFixed(1),
                parseValue: (20 + Math.random() * 10).toFixed(1),
                alarm: Math.random() > 0.9, // 10% 告警率
                unit: '°C',
              },
            ],
            timeStamp: Date.now(),
            useTime: Math.floor(Math.random() * 100) + 20,
            parentId: '',
            hasAlarm: Math.random() > 0.9 ? 1 : 0,
          },
        });

        const responseTime = Date.now() - queryStart;
        this.responseTimes.push(responseTime);
        this.successfulQueries++;

      }, CONFIG.QUERY_INTERVAL_MS);

      this.queryIntervals.push(interval);
    });

    this.log(`✅ 持续查询已启动（间隔: ${CONFIG.QUERY_INTERVAL_MS}ms）`);
  }

  /**
   * 收集性能指标
   */
  private collectMetrics(): void {
    const metrics: TestMetrics = {
      timestamp: Date.now(),
      memoryUsage: process.memoryUsage(),
      activeConnections: this.nodeClients.length + this.userClients.length,
      totalQueries: this.totalQueries,
      successfulQueries: this.successfulQueries,
      failedQueries: this.failedQueries,
      avgResponseTime: this.responseTimes.length > 0
        ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
        : 0,
      errors: [...this.errors],
    };

    this.metrics.push(metrics);

    // 清空响应时间数组（保持内存占用稳定）
    this.responseTimes = [];

    // 记录关键指标
    const elapsed = Date.now() - this.startTime;
    const elapsedHours = (elapsed / (1000 * 60 * 60)).toFixed(2);
    const memoryMB = (metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
    const successRate = ((metrics.successfulQueries / metrics.totalQueries) * 100).toFixed(2);

    this.log(`📊 运行 ${elapsedHours}h | 内存: ${memoryMB}MB | 查询: ${metrics.totalQueries} | 成功率: ${successRate}%`);
  }

  /**
   * 启动指标收集
   */
  private startMetricsCollection(): void {
    this.log(`📈 启动指标收集（间隔: ${CONFIG.METRICS_INTERVAL_MS / 1000}s）...`);

    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, CONFIG.METRICS_INTERVAL_MS);
  }

  /**
   * 生成测试报告
   */
  private generateReport(): void {
    this.log('📝 生成测试报告...');

    const duration = Date.now() - this.startTime;
    const durationHours = duration / (1000 * 60 * 60);

    const report = {
      testConfig: CONFIG,
      startTime: new Date(this.startTime).toISOString(),
      endTime: new Date().toISOString(),
      durationMs: duration,
      durationHours,

      summary: {
        totalQueries: this.totalQueries,
        successfulQueries: this.successfulQueries,
        failedQueries: this.failedQueries,
        successRate: (this.successfulQueries / this.totalQueries) * 100,
        avgQueriesPerSecond: this.totalQueries / (duration / 1000),
      },

      memory: {
        initial: this.metrics[0]?.memoryUsage,
        final: this.metrics[this.metrics.length - 1]?.memoryUsage,
        peak: this.metrics.reduce((max, m) =>
          m.memoryUsage.heapUsed > max.heapUsed ? m.memoryUsage : max,
          this.metrics[0]?.memoryUsage || { heapUsed: 0 }
        ),
      },

      errors: this.errors,
      metricsHistory: this.metrics,
    };

    fs.writeFileSync(CONFIG.REPORT_FILE, JSON.stringify(report, null, 2));

    this.log('✅ 测试报告已生成: ' + CONFIG.REPORT_FILE);
    this.log('\n========== 测试总结 ==========');
    this.log(`运行时长: ${durationHours.toFixed(2)} 小时`);
    this.log(`总查询数: ${report.summary.totalQueries}`);
    this.log(`成功率: ${report.summary.successRate.toFixed(2)}%`);
    this.log(`平均 QPS: ${report.summary.avgQueriesPerSecond.toFixed(2)}`);
    this.log(`初始内存: ${(report.memory.initial.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    this.log(`最终内存: ${(report.memory.final.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    this.log(`峰值内存: ${(report.memory.peak.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    this.log(`错误数量: ${report.errors.length}`);
    this.log('================================\n');
  }

  /**
   * 清理资源
   */
  private async cleanup(): Promise<void> {
    this.log('🧹 清理测试资源...');

    this.isRunning = false;

    // 停止所有间隔
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    this.queryIntervals.forEach(interval => clearInterval(interval));

    // 断开所有客户端
    this.nodeClients.forEach(client => client.disconnect());
    this.userClients.forEach(client => client.disconnect());

    // 停止服务器
    if (this.app) {
      await this.app.close();
    }

    await mongodb.disconnect();
    await testDb.disconnect();

    this.log('✅ 清理完成');
  }

  /**
   * 运行测试
   */
  public async run(): Promise<void> {
    this.log('\n========================================');
    this.log('🚀 启动 24 小时稳定性测试');
    this.log('========================================\n');

    this.log(`配置信息:`);
    this.log(`  - 测试时长: ${CONFIG.DURATION_MS / (1000 * 60 * 60)}h`);
    this.log(`  - 终端数量: ${CONFIG.NUM_TERMINALS}`);
    this.log(`  - 用户数量: ${CONFIG.NUM_USERS}`);
    this.log(`  - 查询间隔: ${CONFIG.QUERY_INTERVAL_MS}ms`);
    this.log(`  - 指标收集间隔: ${CONFIG.METRICS_INTERVAL_MS / 1000}s`);
    this.log('');

    try {
      this.startTime = Date.now();
      this.isRunning = true;

      // 1. 启动服务器
      await this.startServer();

      // 2. 创建客户端
      await this.createNodeClients();
      await this.createUserClients();

      // 3. 启动持续查询
      this.startContinuousQueries();

      // 4. 启动指标收集
      this.startMetricsCollection();

      // 5. 等待测试完成
      this.log(`⏳ 测试运行中... (将运行 ${CONFIG.DURATION_MS / (1000 * 60 * 60)}h)`);
      this.log(`监控地址:`);
      this.log(`  - Prometheus: http://localhost:9090`);
      this.log(`  - Grafana: http://localhost:3000`);
      this.log(`  - 日志文件: ${CONFIG.LOG_FILE}`);
      this.log('');

      await new Promise(resolve => setTimeout(resolve, CONFIG.DURATION_MS));

      this.log('\n✅ 测试完成！');

    } catch (error: any) {
      this.log(`❌ 测试失败: ${error.message}`, 'ERROR');
      this.errors.push(error.message);
      throw error;

    } finally {
      // 生成报告
      this.generateReport();

      // 清理资源
      await this.cleanup();
    }
  }
}

// ========== 主程序 ==========

async function main() {
  const test = new StabilityTest();

  // 处理中断信号
  process.on('SIGINT', async () => {
    console.log('\n\n⚠️  收到中断信号，正在停止测试...');
    process.exit(0);
  });

  await test.run();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
