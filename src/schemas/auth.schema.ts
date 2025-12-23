/**
 * 认证相关 Zod Schema
 *
 * 为认证 API 提供请求和响应的验证模式
 */

import { z } from 'zod';
import { UserRole, PERMISSIONS, type Permission } from '../entities/mongodb/user.entity';

/**
 * 用户注册请求 Schema
 */
export const RegisterRequestSchema = z.object({
  data: z.object({
    username: z.string()
      .min(3, '用户名至少需要3个字符')
      .max(50, '用户名不能超过50个字符')
      .regex(/^[a-zA-Z0-9_-]+$/, '用户名只能包含字母、数字、下划线和连字符'),

    email: z.string()
      .email('请输入有效的邮箱地址')
      .max(100, '邮箱地址不能超过100个字符'),

    password: z.string()
      .min(8, '密码至少需要8个字符')
      .max(128, '密码不能超过128个字符')
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
             '密码必须包含至少1个大写字母、1个小写字母、1个数字和1个特殊字符(@$!%*?&)'),

    displayName: z.string()
      .max(50, '显示名称不能超过50个字符')
      .optional(),

    phone: z.string()
      .regex(/^1[3-9]\d{9}$/, '请输入有效的手机号码')
      .optional(),

    department: z.string()
      .max(100, '部门名称不能超过100个字符')
      .optional(),

    role: z.nativeEnum(UserRole)
      .default(UserRole.USER),

    devices: z.array(z.string().regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/,
                                     '设备MAC地址格式不正确'))
      .optional(),
  }),
});

/**
 * 用户登录请求 Schema
 */
export const LoginRequestSchema = z.object({
  data: z.object({
    username: z.string()
      .min(1, '用户名或邮箱不能为空'),

    password: z.string()
      .min(1, '密码不能为空'),

    remember: z.boolean()
      .default(false),
  }),
});

/**
 * 修改密码请求 Schema
 */
export const ChangePasswordRequestSchema = z.object({
  data: z.object({
    currentPassword: z.string()
      .min(1, '当前密码不能为空'),

    newPassword: z.string()
      .min(8, '新密码至少需要8个字符')
      .max(128, '新密码不能超过128个字符')
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
             '新密码必须包含至少1个大写字母、1个小写字母、1个数字和1个特殊字符(@$!%*?&)'),
  }),
});

/**
 * 重置密码请求 Schema (管理员操作)
 */
export const ResetPasswordRequestSchema = z.object({
  data: z.object({
    userId: z.string()
      .min(1, '用户ID不能为空'),

    newPassword: z.string()
      .min(8, '新密码至少需要8个字符')
      .max(128, '新密码不能超过128个字符')
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
             '新密码必须包含至少1个大写字母、1个小写字母、1个数字和1个特殊字符(@$!%*?&)'),
  }),
});

/**
 * 刷新令牌请求 Schema
 */
export const RefreshTokenRequestSchema = z.object({
  data: z.object({
    refreshToken: z.string()
      .min(1, '刷新令牌不能为空'),
  }),
});

/**
 * 更新用户信息请求 Schema
 */
export const UpdateUserRequestSchema = z.object({
  data: z.object({
    email: z.string()
      .email('请输入有效的邮箱地址')
      .max(100, '邮箱地址不能超过100个字符')
      .optional(),

    displayName: z.string()
      .max(50, '显示名称不能超过50个字符')
      .optional(),

    phone: z.string()
      .regex(/^1[3-9]\d{9}$/, '请输入有效的手机号码')
      .optional(),

    department: z.string()
      .max(100, '部门名称不能超过100个字符')
      .optional(),

    role: z.nativeEnum(UserRole)
      .optional(),

    permissions: z.array(z.enum(Object.values(PERMISSIONS) as [Permission, ...Permission[]]))
      .optional(),

    devices: z.array(z.string().regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/,
                                     '设备MAC地址格式不正确'))
      .optional(),

    isActive: z.boolean()
      .optional(),
  }),
});

/**
 * 用户查询参数 Schema
 */
export const UserQuerySchema = z.object({
  page: z.string()
    .default('1')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  limit: z.string()
    .default('20')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive().max(100)),

  role: z.nativeEnum(UserRole)
    .optional(),

  department: z.string()
    .optional(),

  isActive: z.string()
    .transform((val) => val === 'true')
    .optional(),

  search: z.string()
    .max(100, '搜索关键词不能超过100个字符')
    .optional(),
});

/**
 * API 响应 Schema
 */
export const ApiResponseSchema = z.object({
  status: z.enum(['ok', 'error']),
  message: z.string().optional(),
  data: z.any().optional(),
  timestamp: z.string(),
  requestId: z.string(),
});

/**
 * 认证响应 Schema
 */
export const AuthResponseSchema = z.object({
  status: z.literal('ok'),
  data: z.object({
    user: z.object({
      id: z.string(),
      username: z.string(),
      email: z.string(),
      displayName: z.string().optional(),
      role: z.nativeEnum(UserRole),
      permissions: z.array(z.string()),
      devices: z.array(z.string()).optional(),
      lastLoginAt: z.string().datetime().optional(),
    }),
    tokens: z.object({
      accessToken: z.string(),
      refreshToken: z.string(),
      expiresIn: z.number(),
      tokenType: z.literal('Bearer'),
    }),
  }),
  timestamp: z.string(),
  requestId: z.string(),
});

/**
 * 错误响应 Schema
 */
export const ErrorResponseSchema = z.object({
  status: z.literal('error'),
  message: z.string(),
  code: z.string(),
  details: z.any().optional(),
  timestamp: z.string(),
  requestId: z.string(),
});

/**
 * 类型推导
 */
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;
export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;
export type UserQuery = z.infer<typeof UserQuerySchema>;
export type ApiResponse = z.infer<typeof ApiResponseSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;