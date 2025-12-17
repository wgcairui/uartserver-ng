/**
 * UART Server NG - 主入口文件
 * 基于 Bun + Fastify 的高性能 IoT UART 服务器
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config';
import { mongodb } from './database/mongodb';
import { IndexManager } from './services/index-manager';
import { registerControllers } from './utils/route-loader';
import { TerminalController } from './controllers/terminal.controller';
import { socketService } from './services/socket.service';

/**
 * 创建并配置 Fastify 应用
 */
async function createApp() {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
    requestIdLogLabel: 'reqId',
    disableRequestLogging: false,
    trustProxy: true,
  });

  // 注册 CORS
  await app.register(cors, {
    origin: true, // 允许所有来源
    credentials: true,
  });

  // 健康检查端点
  app.get('/health', async () => {
    const dbHealthy = await mongodb.healthCheck();
    return {
      status: dbHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        connected: mongodb.isConnected(),
        healthy: dbHealthy,
      },
    };
  });

  // 根路径
  app.get('/', async () => {
    return {
      name: 'UART Server NG',
      version: '2.0.0',
      framework: 'Bun + Fastify',
      status: 'running',
      environment: config.NODE_ENV,
    };
  });

  // 注册控制器
  registerControllers(app, [TerminalController]);

  return app;
}

/**
 * 启动服务器
 */
async function start() {
  try {
    console.log('🚀 UART Server NG 启动中...\n');

    // 1. 连接 MongoDB
    console.log('📦 正在连接 MongoDB...');
    await mongodb.connect();
    console.log('✅ MongoDB 连接成功\n');

    // 2. 创建索引
    console.log('📋 正在创建数据库索引...');
    const indexManager = new IndexManager(mongodb.getDatabase());
    await indexManager.ensureAllIndexes();
    console.log('✅ 索引创建完成\n');

    // 3. 创建并启动 Fastify 应用
    console.log('🔧 正在初始化 Fastify 应用...');
    const app = await createApp();

    await app.listen({
      port: config.PORT,
      host: config.HOST,
    });

    // 4. 初始化 Socket.IO
    console.log('🔌 正在初始化 Socket.IO...');
    socketService.initialize(app.server);
    console.log('✅ Socket.IO 初始化完成\n');

    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🎉  UART Server NG 启动成功！                           ║
║                                                           ║
║   🌐  服务器地址: http://${config.HOST}:${config.PORT.toString().padEnd(28)}║
║   📊  环境模式: ${config.NODE_ENV.padEnd(41)}║
║   📁  数据库: ${mongodb.getDatabase().databaseName.padEnd(43)}║
║                                                           ║
║   📚  API 端点:                                           ║
║      GET  /                    - 服务信息                 ║
║      GET  /health              - 健康检查                 ║
║      POST /api/terminal/queryData - 设备数据上报         ║
║      POST /api/terminal/status    - 处理状态查询         ║
║                                                           ║
║   🔌  Socket.IO Namespace:                               ║
║      /node                     - Node 客户端连接         ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);

    // 优雅关闭处理
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n\n⚠️  收到 ${signal} 信号，正在优雅关闭服务器...\n`);

      try {
        // 1. 停止接受新请求
        console.log('⏸️  停止接受新请求...');
        await app.close();
        console.log('✅ Fastify 服务已关闭');

        // 2. 关闭 Socket.IO 连接
        console.log('🔌 正在关闭 Socket.IO...');
        await socketService.close();
        console.log('✅ Socket.IO 已关闭');

        // 3. 关闭数据库连接
        console.log('📦 正在关闭数据库连接...');
        await mongodb.disconnect();
        console.log('✅ MongoDB 连接已关闭');

        console.log('\n✅ 服务器已优雅关闭\n');
        process.exit(0);
      } catch (error) {
        console.error('❌ 关闭过程中发生错误:', error);
        process.exit(1);
      }
    };

    // 监听终止信号
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // 未捕获的异常处理
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ 未处理的 Promise 拒绝:', promise, '原因:', reason);
    });

    process.on('uncaughtException', error => {
      console.error('❌ 未捕获的异常:', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });
  } catch (error) {
    console.error('❌ 服务器启动失败:', error);
    process.exit(1);
  }
}

// 启动服务器
start();
