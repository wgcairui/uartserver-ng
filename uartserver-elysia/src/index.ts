/**
 * UartServer Elysia - Main Entry Point
 *
 * 高性能 IoT 设备管理系统 - Powered by Elysia.js + Bun
 *
 * 功能:
 * 1. REST API (Elysia.js)
 * 2. Socket.IO 实时通信 (Bun engine)
 * 3. 全栈开发服务器 (HMR 支持)
 * 4. 端到端类型安全 (Eden Treaty)
 */

import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { jwt } from '@elysiajs/jwt';
import { staticPlugin } from '@elysiajs/static';

// 插件
import { zodValidator } from './plugins/zod-validator';
import { errorHandler } from './plugins/error-handler';
import { socketIOPlugin } from './plugins/socket-io';

// 路由
import { terminalRoutes } from './routes/terminal.route';
import { alarmRoutes } from './routes/alarm.route';
import { dataQueryRoutes } from './routes/data-query.route';
import { userRoutes } from './routes/user.route';
import { authRoutes } from './routes/auth.route';
import { protocolRoutes } from './routes/protocol.route';
import { deviceTypeRoutes } from './routes/device-type.route';
import { terminalManagementRoutes } from './routes/terminal-management.route';

// 数据库
import { mongodb } from './database/mongodb';

// 配置
const PORT = process.env.PORT || 3333;
const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// ============================================================================
// Socket.IO 配置
// ============================================================================

const { plugin: socketPlugin, io, engine } = socketIOPlugin({
  cors: {
    origin: '*',
    credentials: true,
  },
  debug: NODE_ENV === 'development',
});

// TODO: 初始化 Socket.IO 服务 (Phase 4.2 迁移)
// import { SocketIoService } from './services/socket-io.service';
//
// const socketService = new SocketIoService();
// socketService.initialize(io);

// ============================================================================
// 数据库连接初始化
// ============================================================================

console.log('🔌 正在连接 MongoDB...');
await mongodb.connect();

// ============================================================================
// Elysia 应用
// ============================================================================

const app = new Elysia()
  // 插件配置
  .use(cors({
    origin: NODE_ENV === 'development' ? '*' : process.env.CORS_ORIGIN,
    credentials: true,
  }))
  .use(jwt({
    name: 'jwt',
    secret: JWT_SECRET,
  }))
  .use(zodValidator())
  .use(errorHandler())
  .use(socketPlugin)

  // ============================================================================
  // 健康检查路由
  // ============================================================================
  .get('/health', () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV,
  }))

  // ============================================================================
  // API 路由 (迁移进度: Phase 8.1)
  // ============================================================================
  .get('/api/health', () => ({
    status: 'ok',
    message: 'API is running',
    timestamp: new Date().toISOString(),
  }))

  // ✅ Auth Routes (Phase 8.1 - JWT 认证)
  .use(authRoutes)

  // ✅ Terminal Routes (Phase 4.2)
  .use(terminalRoutes)

  // ✅ Alarm Routes (Phase 7 - Day 1)
  .use(alarmRoutes)

  // ✅ Data Query Routes (Phase 7 - Day 2)
  .use(dataQueryRoutes)

  // ✅ User Routes (Phase 7 - Day 3)
  .use(userRoutes)

  // ✅ Protocol Routes (Phase 8.2)
  .use(protocolRoutes)

  // ✅ Device Type Routes (Phase 8.3)
  .use(deviceTypeRoutes)

  // ✅ Terminal Management Routes (Phase 8.3)
  .use(terminalManagementRoutes)

  // TODO: 待迁移的 Controllers (Phase 8.3+)
  // .use(wechatRoutes)
  // ... 其他路由

  // ============================================================================
  // 前端静态文件 (HMR 支持)
  // ============================================================================
  .use(await staticPlugin({
    prefix: '/',
    assets: 'public',
    alwaysStatic: NODE_ENV === 'production',  // 生产环境不启用 HMR
  }))

  // ============================================================================
  // 启动服务器
  // ============================================================================
  .listen({
    port: PORT,
    ...engine.handler(),  // Socket.IO WebSocket 支持
  });

// ============================================================================
// 启动信息
// ============================================================================

const serverURL = `http://localhost:${app.server?.port}`;

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║  🚀 UartServer Elysia - 启动成功!                                 ║
║                                                                  ║
║  📡 HTTP Server:   ${serverURL.padEnd(44)} ║
║  🌐 前端页面:      ${serverURL.padEnd(44)} ║
║  🔌 Socket.IO:     ${`${serverURL}/socket.io/`.padEnd(44)} ║
║  📚 API Health:    ${`${serverURL}/api/health`.padEnd(44)} ║
║                                                                  ║
║  🔧 环境:          ${NODE_ENV.padEnd(44)} ║
║  ⚡ 运行时:        Bun ${Bun.version.padEnd(41)} ║
║                                                                  ║
║  💡 提示:                                                         ║
║    - 修改 public/ 中的文件会自动热重载 (HMR)                      ║
║    - Socket.IO 客户端可以连接到 ${serverURL}           ║
║    - Eden Treaty 提供端到端类型安全的 API 调用                    ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`);

// ============================================================================
// 导出类型供 Eden Treaty 使用
// ============================================================================

export type App = typeof app;

// ============================================================================
// 优雅关闭
// ============================================================================

process.on('SIGTERM', async () => {
  console.log('\n⚠️  收到 SIGTERM 信号,正在优雅关闭...');

  // 停止接受新连接
  app.server?.stop();

  // 关闭 Socket.IO
  io.close(() => {
    console.log('✅ Socket.IO 已关闭');
  });

  // 关闭数据库连接
  await mongodb.disconnect();
  console.log('✅ MongoDB 已关闭');

  // TODO: 关闭 PostgreSQL 连接
  // await postgres.close();

  console.log('✅ 服务器已优雅关闭');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n⚠️  收到 SIGINT 信号,正在优雅关闭...');
  process.exit(0);
});
