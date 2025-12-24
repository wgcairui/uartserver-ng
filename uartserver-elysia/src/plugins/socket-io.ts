/**
 * Socket.IO 集成插件
 *
 * 使用 @socket.io/bun-engine 将 Socket.IO 集成到 Elysia.js
 *
 * 功能:
 * 1. 配置 Socket.IO 服务器
 * 2. 集成 Bun WebSocket 引擎
 * 3. 提供 Socket.IO 服务实例
 */

import { Elysia } from 'elysia';
import { Server as SocketIOServer } from 'socket.io';
import { Server as BunEngine } from '@socket.io/bun-engine';

/**
 * Socket.IO 插件选项
 */
export interface SocketIOPluginOptions {
  /** CORS 配置 */
  cors?: {
    origin: string | string[];
    credentials?: boolean;
  };
  /** 是否启用调试日志 */
  debug?: boolean;
}

/**
 * Socket.IO 插件
 *
 * 使用方式:
 * ```typescript
 * import { socketIOPlugin } from './plugins/socket-io';
 *
 * const { plugin, io, engine } = socketIOPlugin({
 *   cors: { origin: '*', credentials: true }
 * });
 *
 * const app = new Elysia()
 *   .use(plugin)
 *   .listen({
 *     port: 3000,
 *     ...engine.handler()  // 启用 WebSocket 支持
 *   });
 *
 * // 使用 Socket.IO 服务
 * io.on('connection', (socket) => {
 *   console.log('Client connected:', socket.id);
 * });
 * ```
 */
export function socketIOPlugin(options: SocketIOPluginOptions = {}) {
  const {
    cors = { origin: '*', credentials: true },
    debug = false,
  } = options;

  // 创建 Socket.IO 服务器
  const io = new SocketIOServer({
    cors,
  });

  // 创建 Bun 引擎
  const engine = new BunEngine();

  // 绑定引擎到 Socket.IO
  io.bind(engine);

  if (debug) {
    console.log('✅ Socket.IO server created with Bun engine');
  }

  // 创建 Elysia 插件
  const plugin = new Elysia({ name: 'socket-io' })
    // 注册 Socket.IO 路由处理器
    .all('/socket.io/*', ({ request, server }) => {
      if (debug) {
        console.log('[Socket.IO] Handling request:', request.url);
      }
      if (!server) {
        throw new Error('Server instance not available');
      }
      return engine.handleRequest(request, server);
    })
    // 将 Socket.IO 实例注入到 context
    .decorate('io', io);

  return {
    plugin,
    io,
    engine,
  };
}

/**
 * 使用示例:
 *
 * ```typescript
 * import { Elysia } from 'elysia';
 * import { socketIOPlugin } from './plugins/socket-io';
 * import { SocketIoService } from './services/socket-io.service';
 * import { mongodb } from './database/mongodb';
 *
 * // 创建 Socket.IO 插件
 * const { plugin, io, engine } = socketIOPlugin({
 *   cors: { origin: '*', credentials: true },
 *   debug: true
 * });
 *
 * // 初始化 Socket.IO 服务 (业务逻辑层,完全不变!)
 * const socketService = new SocketIoService();
 * socketService.initialize(io);
 *
 * // 创建 Elysia 应用
 * const app = new Elysia()
 *   .use(plugin)  // 注册 Socket.IO 插件
 *   .get('/', () => 'Hello Elysia with Socket.IO!')
 *   .listen({
 *     port: 3000,
 *     ...engine.handler()  // 启用 WebSocket 支持
 *   });
 *
 * console.log(`
 * 🚀 Server running!
 * 📡 HTTP: http://localhost:3000
 * 🔌 Socket.IO: http://localhost:3000/socket.io/
 * `);
 * ```
 */
