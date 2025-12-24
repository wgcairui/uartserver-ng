/**
 * Auth Schemas (Phase 8.1)
 *
 * JWT 认证相关的 Zod 验证 schemas
 */

import { z } from 'zod';

// ============================================================================
// 基础验证
// ============================================================================

/**
 * 用户名验证 (手机号或用户名)
 */
export const UsernameSchema = z
  .string()
  .min(3, '用户名至少 3 个字符')
  .max(50, '用户名最多 50 个字符')
  .regex(
    /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/,
    '用户名只能包含字母、数字、下划线和中文'
  );

/**
 * 手机号验证 (中国大陆)
 */
export const PhoneNumberSchema = z
  .string()
  .regex(/^1[3-9]\d{9}$/, '无效的手机号码');

/**
 * 密码验证
 */
export const PasswordSchema = z
  .string()
  .min(6, '密码至少 6 位')
  .max(32, '密码最多 32 位')
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, '密码必须包含大小写字母和数字');

/**
 * 邮箱验证
 */
export const EmailSchema = z.string().email('无效的邮箱地址');

/**
 * 验证码验证 (6 位数字)
 */
export const VerificationCodeSchema = z
  .string()
  .regex(/^\d{6}$/, '验证码必须是 6 位数字');

// ============================================================================
// 登录相关
// ============================================================================

/**
 * POST /api/auth/login
 * 用户登录
 */
export const LoginRequestSchema = z.object({
  data: z.object({
    username: z.union([UsernameSchema, PhoneNumberSchema], {
      errorMap: () => ({ message: '请输入有效的用户名或手机号' }),
    }),
    password: z.string().min(1, '密码不能为空'),
    hash: z.string().optional(), // 加密 hash (可选)
  }),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export interface LoginResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number; // 秒
    user: {
      _id: string;
      username: string;
      displayName?: string;
      email?: string;
      phone?: string;
      role: string;
    };
  };
}

/**
 * POST /api/auth/logout
 * 用户登出
 */
export interface LogoutResponse {
  status: 'ok' | 'error';
  message?: string;
}

/**
 * POST /api/auth/refresh
 * 刷新访问令牌
 */
export const RefreshTokenRequestSchema = z.object({
  data: z.object({
    refreshToken: z.string().min(1, 'Refresh token 不能为空'),
  }),
});

export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;

export interface RefreshTokenResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    accessToken: string;
    expiresIn: number;
  };
}

// ============================================================================
// 注册相关
// ============================================================================

/**
 * POST /api/auth/register
 * 用户注册
 */
export const RegisterRequestSchema = z.object({
  data: z
    .object({
      username: UsernameSchema,
      password: PasswordSchema,
      confirmPassword: z.string(),
      phone: PhoneNumberSchema.optional(),
      email: EmailSchema.optional(),
      displayName: z.string().min(1, '姓名不能为空').max(50, '姓名过长').optional(),
      verificationCode: VerificationCodeSchema.optional(), // 手机验证码
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: '两次输入的密码不一致',
      path: ['confirmPassword'],
    })
    .refine(
      (data) => {
        // 如果提供了手机号，必须提供验证码
        if (data.phone && !data.verificationCode) {
          return false;
        }
        return true;
      },
      {
        message: '注册手机号需要提供验证码',
        path: ['verificationCode'],
      }
    ),
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export interface RegisterResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    userId: string;
    username: string;
  };
}

// ============================================================================
// 密码重置
// ============================================================================

/**
 * POST /api/auth/forgot-password
 * 忘记密码 (发送验证码)
 */
export const ForgotPasswordRequestSchema = z.object({
  data: z.object({
    phone: PhoneNumberSchema,
  }),
});

export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;

export interface ForgotPasswordResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    codeSent: boolean;
  };
}

/**
 * POST /api/auth/reset-password
 * 重置密码
 */
export const ResetPasswordRequestSchema = z.object({
  data: z
    .object({
      phone: PhoneNumberSchema,
      verificationCode: VerificationCodeSchema,
      newPassword: PasswordSchema,
      confirmPassword: z.string(),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: '两次输入的密码不一致',
      path: ['confirmPassword'],
    }),
});

export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

export interface ResetPasswordResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    success: boolean;
  };
}

// ============================================================================
// 微信登录
// ============================================================================

/**
 * POST /api/auth/wechat/mini-program
 * 微信小程序登录
 */
export const WechatMiniProgramLoginSchema = z.object({
  data: z.object({
    code: z.string().min(1, '微信授权码不能为空'),
    encryptedData: z.string().optional(),
    iv: z.string().optional(),
  }),
});

export type WechatMiniProgramLogin = z.infer<
  typeof WechatMiniProgramLoginSchema
>;

export interface WechatLoginResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    isNewUser: boolean; // 是否新用户
    user: {
      _id: string;
      username: string;
      openId: string;
      unionId?: string;
    };
  };
}

/**
 * POST /api/auth/wechat/open
 * 微信开放平台登录
 */
export const WechatOpenLoginSchema = z.object({
  data: z.object({
    code: z.string().min(1, '微信授权码不能为空'),
  }),
});

export type WechatOpenLogin = z.infer<typeof WechatOpenLoginSchema>;

// ============================================================================
// 获取加密 Hash (用于安全登录)
// ============================================================================

/**
 * GET /api/auth/hash
 * 获取登录加密 hash
 */
export const GetHashQuerySchema = z.object({
  user: z.string().min(1, '用户名不能为空'),
});

export type GetHashQuery = z.infer<typeof GetHashQuerySchema>;

export interface GetHashResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    hash: string;
    expiresIn: number; // 秒
  };
}

// ============================================================================
// 获取当前用户
// ============================================================================

/**
 * GET /api/auth/me
 * 获取当前登录用户信息
 */
export interface GetCurrentAuthUserResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    _id: string;
    username: string;
    displayName?: string;
    email?: string;
    phone?: string;
    role: string;
    department?: string;
    isActive: boolean;
    createdAt?: Date;
  };
}

// ============================================================================
// 验证邮箱
// ============================================================================

/**
 * POST /api/auth/verify-email
 * 验证邮箱地址
 */
export const VerifyEmailRequestSchema = z.object({
  data: z.object({
    email: EmailSchema,
    code: VerificationCodeSchema,
  }),
});

export type VerifyEmailRequest = z.infer<typeof VerifyEmailRequestSchema>;

export interface VerifyEmailResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    verified: boolean;
  };
}

// ============================================================================
// JWT Payload 类型
// ============================================================================

/**
 * JWT Access Token Payload
 */
export interface JWTPayload {
  userId: string;
  username: string;
  role: string;
  iat?: number; // Issued at
  exp?: number; // Expiration time
}

/**
 * JWT Refresh Token Payload
 */
export interface RefreshTokenPayload {
  userId: string;
  tokenId: string; // 唯一 token ID (用于撤销)
  iat?: number;
  exp?: number;
}
