/**
 * 为路由应用认证中间件的工具
 */

import type { FastifyInstance } from 'fastify';
import { requireAuth, requireAdmin } from '../middleware/auth';

/**
 * 为 Fastify 应用注册认证中间件
 */
export function setupAuthMiddleware(app: FastifyInstance) {
  // 需要认证的路由模式
  const authRoutes = [
    '/api/auth/me',
    '/api/auth/change-password',
    '/api/auth/logout',
    '/api/terminals', // Phase 4.2 Day 1: Terminal API (all endpoints require authentication)
    '/api/data', // Phase 4.2 Day 2: Data API (all endpoints require authentication)
    '/api/alarms', // Phase 4.2 Day 3: Alarm API (all endpoints require authentication)
    '/api/protocols', // Phase 4.2 Day 3: Protocol API (all endpoints require authentication)
    '/api/config', // Phase 4.2 Day 4: Config API (all endpoints require authentication)
  ];

  // 需要管理员权限的路由模式
  const adminRoutes = [
    '/api/users',
    '/api/users/',
    '/api/users/stats',
  ];

  // 需要设备权限的路由模式
  const deviceRoutes = [
    '/api/terminals/:mac/control',
    '/api/data/',
  ];

  // 应用认证中间件
  app.addHook('preHandler', async (request, reply) => {
    const url = request.url;

    // 检查是否需要认证
    if (authRoutes.some(route => url?.startsWith(route))) {
      return requireAuth(request, reply);
    }

    // 检查是否需要管理员权限
    if (adminRoutes.some(route => url?.startsWith(route))) {
      return requireAdmin(request, reply);
    }

    // 检查是否需要设备权限
    if (deviceRoutes.some(route => url?.startsWith(route))) {
      // 这里可以添加设备权限检查
      return requireAuth(request, reply);
    }
  });
}