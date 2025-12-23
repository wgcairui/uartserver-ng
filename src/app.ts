/**
 * 应用构建器
 * 用于测试和生产环境
 */

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import fastifySocketIO from 'fastify-socket.io';
import errorHandler from './plugins/error-handler';
import { config } from './config';
import { mongodb } from './database/mongodb';
import { registerControllers } from './utils/route-loader';
import { TerminalController } from './controllers/terminal.controller';
import { TerminalApiController } from './controllers/terminal-api.controller';
import { DataApiController } from './controllers/data-api.controller';
import { DtuController } from './controllers/dtu.controller';
import { AuthController } from './controllers/auth.controller';
import { UserController } from './controllers/user.controller';
import { setupAuthMiddleware } from './utils/auth-routes';
import { webSocketService } from './services/websocket.service';
import { socketIoService } from './services/socket-io.service';
import { socketUserService } from './services/socket-user.service';
import { terminalCache } from './repositories/terminal-cache';
import { terminalRepository } from './repositories/terminal.repository';
import { metricsService } from './services/metrics.service';
import { initializeServices, closeServices, getServiceContainer } from './services';

/**
 * 构建并配置 Fastify 应用（用于测试）
 * @param options - 可选配置
 */
export async function build(options: {
  logger?: boolean;
  skipSocketIO?: boolean;
} = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger !== undefined ? options.logger : {
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
    disableRequestLogging: config.NODE_ENV === 'test',
    trustProxy: true,
  });

  // 注册安全相关插件

  // 1. Helmet - 设置安全响应头
  await app.register(helmet, {
    // Socket.IO 需要允许的 CSP 设置
    contentSecurityPolicy: config.NODE_ENV === 'production' ? undefined : false,
  });

  // 2. CORS - 跨域资源共享
  await app.register(cors, {
    origin:
      config.NODE_ENV === 'production'
        ? (origin, cb) => {
            // 生产环境：只允许白名单域名
            const allowedOrigins = [
              'http://localhost:3000',
              'http://localhost:9010',
            ];

            if (!origin || allowedOrigins.includes(origin)) {
              cb(null, true);
            } else {
              cb(new Error('Not allowed by CORS'), false);
            }
          }
        : true, // 开发/测试环境：允许所有来源
    credentials: true,
  });

  // 3. Rate Limiting - 请求限流
  // @ts-expect-error - skip is a valid option but not in type definitions
  await app.register(rateLimit, {
    max: config.NODE_ENV === 'production' ? 100 : 1000,
    timeWindow: '1 minute',
    cache: 10000,
    allowList: ['127.0.0.1'],
    skipOnError: true,
    redis: undefined,
    skip: (req: { url?: string }) => {
      return req.url === '/api/terminal/queryData';
    },
    onExceeded: (req) => {
      app.log.warn(`Rate limit exceeded for ${req.ip} on ${req.url}`);
    },
    errorResponseBuilder: () => {
      return {
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded, please try again later',
      };
    },
  });

  // 4. Error Handler - 统一错误处理
  await app.register(errorHandler, {
    includeStack: config.NODE_ENV === 'development',
    logErrors: true,
  });

  // 5. Socket.IO - 实时通信
  if (!options.skipSocketIO) {
    await app.register(fastifySocketIO, {
      cors: {
        origin:
          config.NODE_ENV === 'production'
            ? ['http://localhost:3000', 'http://localhost:9010']
            : '*',
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
      maxHttpBufferSize: 1e6,
      connectTimeout: 45000,
      upgradeTimeout: 10000,
    });

    // Initialize Socket.IO services after app is ready
    app.addHook('onReady', async () => {
      // Initialize application services (Queue, Notifications, etc.)
      try {
        app.log.info('Initializing application services...');
        await initializeServices(mongodb.getDatabase());
        app.log.info('Application services initialized successfully');
      } catch (error) {
        app.log.error('Failed to initialize application services:', error);
        throw error; // 阻止应用启动，因为核心服务失败
      }

      // Warmup terminal cache (load all online terminals)
      try {
        app.log.info('Warming up terminal cache...');
        await terminalCache.warmup(terminalRepository);
        app.log.info('Terminal cache warmed up successfully');
      } catch (error) {
        app.log.error('Failed to warm up terminal cache:', error);
        // 不阻止应用启动，但记录错误
      }

      // Initialize Socket.IO (Node clients)
      socketIoService.initialize(app.io);

      // Initialize WebSocket (Browser users)
      await webSocketService.initialize(app.io);

      // Initialize User Push Service
      socketUserService.initialize(app.io);
    });

    // Graceful shutdown
    app.addHook('onClose', async () => {
      app.log.info('Shutting down services...');

      // Close application services
      try {
        await closeServices();
        app.log.info('Application services closed');
      } catch (error) {
        app.log.error('Error closing application services:', error);
      }

      // Destroy terminal cache
      try {
        terminalCache.destroy();
        app.log.info('Terminal cache destroyed');
      } catch (error) {
        app.log.error('Error destroying terminal cache:', error);
      }
    });
  }

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

  // Prometheus 指标端点
  app.get('/metrics', async (request, reply) => {
    try {
      const metrics = await metricsService.getMetrics();
      reply
        .type(metricsService.getContentType())
        .send(metrics);
    } catch (error) {
      app.log.error('Failed to get metrics:', error);
      reply.code(500).send({ error: 'Failed to retrieve metrics' });
    }
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
  registerControllers(app, [
    TerminalController,
    TerminalApiController,
    DataApiController,
    DtuController,
    AuthController,
    UserController,
  ]);

  // 设置认证中间件
  setupAuthMiddleware(app);

  return app;
}
