/**
 * 认证中间件
 *
 * 提供 JWT 认证、权限检查和设备访问控制功能
 */

import { ObjectId } from 'mongodb';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { mongodb } from '../database/mongodb';
import { Phase3Collections } from '../entities/mongodb';
import {
  verifyAccessToken,
  extractTokenFromHeader,
  sanitizeUser,
} from '../utils/jwt';
import type { UserDocument, Permission } from '../entities/mongodb/user.entity';
// FastifyRequest 类型扩展在 types.ts 中定义

/**
 * 认证选项
 */
export interface AuthOptions {
  /** 是否必须认证 */
  required?: boolean;
  /** 需要的权限 */
  permissions?: Permission[];
  /** 需要访问的设备 MAC */
  deviceMac?: string;
  /** 允许的角色 */
  roles?: string[];
}

/**
 * 认证中间件工厂函数
 *
 * @param options - 认证选项
 * @returns 认证中间件
 *
 * @example
 * ```typescript
 * // 必须认证
 * app.addHook('preHandler', authMiddleware({ required: true }));
 *
 * // 需要特定权限
 * app.addHook('preHandler', authMiddleware({
 *   required: true,
 *   permissions: ['device:write']
 * }));
 *
 * // 可选认证
 * app.addHook('preHandler', authMiddleware({ required: false }));
 * ```
 */
export function authMiddleware(options: AuthOptions = {}) {
  const {
    required = false,
    permissions = [],
    deviceMac,
    roles = [],
  } = options;

  return async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      // 从请求头提取令牌
      const token = extractTokenFromHeader(request.headers.authorization);

      // 没有令牌的情况
      if (!token) {
        if (required) {
          return reply.status(401).send({
            status: 'error',
            message: 'Authentication required',
            code: 'AUTH_REQUIRED',
          });
        }
        // 可选认证，继续执行
        return;
      }

      // 验证令牌
      const payload = verifyAccessToken(token);

      // 获取用户信息
      const db = mongodb.getDatabase();
      const collections = new Phase3Collections(db);

      const user = await collections.users.findOne({
        _id: new ObjectId(payload.sub),
        isActive: true,
      });

      // 用户不存在或未激活
      if (!user) {
        return reply.status(401).send({
          status: 'error',
          message: 'Invalid authentication',
          code: 'USER_NOT_FOUND',
        });
      }

      // 检查账户是否被锁定
      if (user.session.lockedUntil && user.session.lockedUntil > new Date()) {
        return reply.status(423).send({
          status: 'error',
          message: 'Account is locked',
          code: 'ACCOUNT_LOCKED',
        });
      }

      // 检查角色权限
      if (roles.length > 0 && !roles.includes(user.role)) {
        return reply.status(403).send({
          status: 'error',
          message: 'Insufficient role permissions',
          code: 'INSUFFICIENT_ROLE',
        });
      }

      // 检查功能权限
      if (permissions.length > 0) {
        const hasAllPermissions = permissions.every(permission =>
          user.permissions.includes(permission),
        );
        if (!hasAllPermissions) {
          return reply.status(403).send({
            status: 'error',
            message: 'Insufficient permissions',
            code: 'INSUFFICIENT_PERMISSIONS',
            details: {
              required: permissions,
              user: user.permissions,
            },
          });
        }
      }

      // 检查设备访问权限
      if (deviceMac && !canAccessDevice(user, deviceMac)) {
        return reply.status(403).send({
          status: 'error',
          message: 'Device access denied',
          code: 'DEVICE_ACCESS_DENIED',
          details: {
            device: deviceMac,
            userDevices: user.devices || [],
          },
        });
      }

      // 将用户信息和载荷添加到请求对象
      request.user = sanitizeUser(user);
      request.jwtPayload = payload;

    } catch (error) {
      console.error('Authentication error:', error);

      if (required) {
        const message = error instanceof Error ? error.message : 'Authentication failed';
        const code = message.includes('expired') ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';

        return reply.status(401).send({
          status: 'error',
          message,
          code,
        });
      }
      // 可选认证失败，继续执行但不设置用户信息
    }
  };
}

/**
 * 检查用户是否可以访问指定设备
 *
 * @param user - 用户文档
 * @param deviceMac - 设备 MAC 地址
 * @returns 是否可以访问
 */
function canAccessDevice(user: UserDocument, deviceMac: string): boolean {
  // 管理员可以访问所有设备
  if (user.role === 'admin') {
    return true;
  }

  // 检查设备权限列表
  return user.devices?.includes(deviceMac) || false;
}

/**
 * 创建必须认证的中间件
 */
export const requireAuth = authMiddleware({ required: true });

/**
 * 创建管理员权限中间件
 */
export const requireAdmin = authMiddleware({
  required: true,
  roles: ['admin'],
});

/**
 * 创建需要特定权限的中间件工厂
 *
 * @param permissions - 所需权限列表
 * @returns 权限检查中间件
 */
export function requirePermissions(permissions: Permission[]) {
  return authMiddleware({
    required: true,
    permissions,
  });
}

/**
 * 创建设备访问权限中间件工厂
 *
 * @param deviceMac - 设备 MAC 地址 (可选，从请求参数获取)
 * @returns 设备权限检查中间件
 */
export function requireDeviceAccess(deviceMac?: string) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    // 如果没有提供设备 MAC，尝试从请求参数获取
    const targetDeviceMac = deviceMac || (request.params as any)?.mac || (request.query as any)?.mac;

    if (!targetDeviceMac) {
      return reply.status(400).send({
        status: 'error',
        message: 'Device MAC address is required',
        code: 'DEVICE_MAC_REQUIRED',
      });
    }

    return authMiddleware({
      required: true,
      deviceMac: targetDeviceMac,
    })(request, reply);
  };
}

/**
 * 可选认证中间件 (用户可能登录也可能未登录)
 */
export const optionalAuth = authMiddleware({ required: false });

/**
 * 检查用户权限的辅助函数
 *
 * @param request - Fastify 请求对象
 * @param permission - 要检查的权限
 * @returns 是否有权限
 */
export function hasPermission(request: FastifyRequest, permission: Permission): boolean {
  return request.user?.permissions?.includes(permission) || false;
}

/**
 * 检查用户角色的辅助函数
 *
 * @param request - Fastify 请求对象
 * @param role - 要检查的角色
 * @returns 是否是指定角色
 */
export function hasRole(request: FastifyRequest, role: string): boolean {
  return request.user?.role === role;
}

/**
 * 检查用户是否为管理员的辅助函数
 *
 * @param request - Fastify 请求对象
 * @returns 是否是管理员
 */
export function isAdmin(request: FastifyRequest): boolean {
  return hasRole(request, 'admin');
}

/**
 * 获取当前用户 ID 的辅助函数
 *
 * @param request - Fastify 请求对象
 * @returns 用户 ID 或 null
 */
export function getCurrentUserId(request: FastifyRequest): string | null {
  return request.user?._id?.toString() || request.jwtPayload?.sub || null;
}

/**
 * 认证错误处理中间件
 *
 * 统一处理认证相关的错误
 */
export function authErrorHandler(
  error: Error,
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  // 认证相关的错误
  if (error.message.includes('Authentication') ||
      error.message.includes('Token') ||
      error.message.includes('Permission')) {

    const statusCode = error.message.includes('expired') ? 401 :
                      error.message.includes('denied') ? 403 : 401;

    reply.status(statusCode).send({
      status: 'error',
      message: error.message,
      code: error.message.includes('expired') ? 'TOKEN_EXPIRED' :
            error.message.includes('denied') ? 'ACCESS_DENIED' : 'AUTH_FAILED',
    });
    return;
  }

  // 其他错误继续传递
  throw error;
}

/**
 * 安全日志记录
 *
 * @param action - 操作类型
 * @param userId - 用户 ID
 * @param details - 额外详情
 */
export function logAuthAction(
  action: string,
  userId?: string,
  details?: Record<string, any>,
): void {
  const logData = {
    timestamp: new Date().toISOString(),
    action,
    userId,
    ip: details?.ip,
    userAgent: details?.userAgent,
    ...details,
  };

  if (action.includes('FAILED') || action.includes('DENIED')) {
    console.warn('[AUTH SECURITY]', logData);
  } else {
    console.info('[AUTH]', logData);
  }
}