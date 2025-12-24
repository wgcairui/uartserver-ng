/**
 * JWT Authentication Middleware (Phase 8.1 Day 2)
 *
 * 提供可复用的 JWT 认证和权限检查功能
 *
 * 使用方式:
 * ```typescript
 * import { requireAuth, requireRole } from '../middleware/jwt-auth.middleware';
 *
 * // 要求登录
 * .get('/protected', requireAuth, async ({ userId, user }) => {
 *   return { userId, username: user.username };
 * })
 *
 * // 要求特定角色
 * .get('/admin', requireRole(['admin', 'root']), async ({ user }) => {
 *   return { admin: user.username };
 * })
 * ```
 */

import { Elysia, NotFoundError } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import type { JWTPayload } from '../schemas/auth.schema';
import { AuthService } from '../services/auth.service';
import { mongodb } from '../database/mongodb';

// JWT 配置
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// ============================================================================
// 用户角色类型
// ============================================================================

export type UserRole = 'user' | 'admin' | 'root' | 'test';

// ============================================================================
// JWT Auth Plugin (全局可用)
// ============================================================================

/**
 * JWT 认证插件 - 为所有路由提供 JWT 验证能力
 *
 * 添加到路由后可用:
 * - ctx.jwt - JWT 签名和验证
 * - ctx.userId - 当前用户 ID (如果已认证)
 * - ctx.userRole - 当前用户角色 (如果已认证)
 */
export const jwtAuthPlugin = new Elysia({ name: 'jwt-auth' })
  // JWT 插件
  .use(
    jwt({
      name: 'jwt',
      secret: JWT_SECRET,
    })
  )

  // 从 JWT cookie 中提取用户信息 (可选,不强制认证)
  .derive(async ({ jwt, cookie: { auth }, headers }) => {
    let userId: string | undefined;
    let userRole: UserRole | undefined;

    try {
      // 优先从 cookie 获取
      let token = auth?.value;
      console.log('[jwtAuthPlugin] Cookie auth:', token ? token.substring(0, 30) + '...' : 'none');

      // 如果 cookie 没有,尝试从 Authorization header 获取
      if (!token && headers.authorization) {
        console.log('[jwtAuthPlugin] Authorization header:', headers.authorization?.substring(0, 50));
        const match = headers.authorization.match(/^Bearer\s+(.+)$/i);
        if (match) {
          token = match[1];
          console.log('[jwtAuthPlugin] Extracted token from header:', token.substring(0, 30) + '...');
        }
      }

      if (token) {
        const payload = await jwt.verify(token);
        console.log('[jwtAuthPlugin] JWT payload:', payload);
        if (payload) {
          const jwtPayload = payload as JWTPayload;
          userId = jwtPayload.userId;
          userRole = jwtPayload.role as UserRole;
          console.log('[jwtAuthPlugin] Extracted userId:', userId, 'role:', userRole);
        }
      } else {
        console.log('[jwtAuthPlugin] No token found');
      }
    } catch (error) {
      // JWT 验证失败,userId 保持 undefined
      console.warn('[jwtAuthPlugin] JWT verification failed:', error);
    }

    console.log('[jwtAuthPlugin] Returning userId:', userId);
    return {
      userId,
      userRole,
    };
  });

// ============================================================================
// 认证中间件 (Guard)
// ============================================================================

/**
 * 认证辅助函数 - 从请求中提取并验证用户
 * 这个函数可以在路由处理器中直接调用
 */
export async function authenticateUser(ctx: any): Promise<{ userId: string; user: any }> {
  // 获取 token
  let token = ctx.cookie?.auth?.value;
  if (!token && ctx.headers?.authorization) {
    const match = ctx.headers.authorization.match(/^Bearer\s+(.+)$/i);
    if (match) {
      token = match[1];
    }
  }

  if (!token) {
    throw new Error('Unauthorized - No token provided');
  }

  // 验证 token (使用 ctx.jwt)
  if (!ctx.jwt) {
    throw new Error('JWT plugin not available in context');
  }

  const payload = await ctx.jwt.verify(token) as JWTPayload | false;

  if (!payload) {
    throw new Error('Unauthorized - Invalid token');
  }

  const userId = payload.userId;

  // 获取完整用户信息
  const authService = new AuthService(mongodb.getDatabase());
  const user = await authService.findUserById(userId);

  if (!user) {
    throw new Error('Unauthorized - User not found');
  }

  if (!user.isActive) {
    throw new Error('Unauthorized - User is inactive');
  }

  return {
    userId,
    user,
  };
}

/**
 * 要求用户已登录 - Elysia 插件版本
 *
 * 使用方式:
 * ```typescript
 * .use(requireAuth)
 * .get('/protected', async (ctx) => {
 *   const { userId, user } = await getAuthUser(ctx);
 *   return { userId };
 * })
 * ```
 */
export const requireAuth = new Elysia({ name: 'require-auth' }).use(
  jwt({
    name: 'jwt',
    secret: JWT_SECRET,
  })
);

/**
 * 从 context 中获取认证用户
 * 这是一个便捷函数,在路由处理器中调用
 */
export async function getAuthUser(ctx: any): Promise<{ userId: string; user: any }> {
  return await authenticateUser(ctx);
}

/**
 * 要求特定角色
 *
 * 使用方式:
 * ```typescript
 * .get('/admin', requireRole(['admin', 'root']), async ({ user }) => {
 *   return { admin: user.username };
 * })
 * ```
 */
export function requireRole(allowedRoles: UserRole[]) {
  return new Elysia({ name: `require-role-${allowedRoles.join('-')}` })
    .use(requireAuth)
    .derive(({ user }) => {
      if (!allowedRoles.includes(user.role as UserRole)) {
        throw new Error(
          `Forbidden - Requires one of: ${allowedRoles.join(', ')}`
        );
      }

      return {};
    });
}

// ============================================================================
// 可选认证 (Optional Auth)
// ============================================================================

/**
 * 可选认证 - 如果有 JWT 则验证,没有也不报错
 *
 * 使用方式:
 * ```typescript
 * .get('/public-or-private', optionalAuth, async ({ user }) => {
 *   if (user) {
 *     return { message: 'Welcome back!', username: user.username };
 *   }
 *   return { message: 'Hello, guest!' };
 * })
 * ```
 */
export const optionalAuth = new Elysia({ name: 'optional-auth' })
  .use(jwtAuthPlugin)
  .derive(async ({ userId }) => {
    if (!userId) {
      return { user: null };
    }

    try {
      const authService = new AuthService(mongodb.getDatabase());
      const user = await authService.findUserById(userId);
      return { user: user || null };
    } catch (error) {
      return { user: null };
    }
  });

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 从请求中获取当前用户 ID
 *
 * @deprecated 使用 requireAuth 中间件后可直接访问 userId
 */
export async function getCurrentUserId(ctx: any): Promise<string | null> {
  try {
    const token = ctx.cookie?.auth?.value || ctx.headers?.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return null;

    const payload = await ctx.jwt.verify(token);
    return payload ? (payload as JWTPayload).userId : null;
  } catch (error) {
    return null;
  }
}

// ============================================================================
// 权限检查辅助函数
// ============================================================================

/**
 * 检查用户是否有权限访问资源
 */
export async function checkPermission(
  userId: string,
  resource: string,
  action: 'read' | 'write' | 'delete'
): Promise<boolean> {
  // TODO: 实现基于角色的权限控制 (RBAC)
  // 可以根据用户角色和资源类型判断权限

  const authService = new AuthService(mongodb.getDatabase());
  const user = await authService.findUserById(userId);

  if (!user) return false;

  // 示例: root 和 admin 有所有权限
  if (user.role === 'root' || user.role === 'admin') {
    return true;
  }

  // 其他角色的权限逻辑
  return true; // 默认允许 (需要根据实际业务调整)
}

/**
 * 检查用户是否拥有设备访问权限
 */
export async function checkDeviceAccess(
  userId: string,
  mac: string
): Promise<boolean> {
  const authService = new AuthService(mongodb.getDatabase());
  const user = await authService.findUserById(userId);

  if (!user) return false;

  // root 和 admin 可以访问所有设备
  if (user.role === 'root' || user.role === 'admin') {
    return true;
  }

  // 检查设备是否在用户的绑定列表中
  return user.devices?.includes(mac) || false;
}
