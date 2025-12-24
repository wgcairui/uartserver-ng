/**
 * Auth Routes (Phase 8.1)
 *
 * JWT 认证 API 路由
 *
 * 功能:
 * - 用户登录/登出
 * - Token 刷新
 * - 用户注册
 * - 密码重置
 * - 微信登录
 */

import { Elysia } from 'elysia';
import { jwt } from '@elysiajs/jwt';

// Schemas
import {
  LoginRequestSchema,
  RegisterRequestSchema,
  RefreshTokenRequestSchema,
  ForgotPasswordRequestSchema,
  ResetPasswordRequestSchema,
  WechatMiniProgramLoginSchema,
  WechatOpenLoginSchema,
  GetHashQuerySchema,
  type LoginRequest,
  type LoginResponse,
  type LogoutResponse,
  type RegisterRequest,
  type RegisterResponse,
  type RefreshTokenRequest,
  type RefreshTokenResponse,
  type ForgotPasswordRequest,
  type ForgotPasswordResponse,
  type ResetPasswordRequest,
  type ResetPasswordResponse,
  type WechatMiniProgramLogin,
  type WechatOpenLogin,
  type WechatLoginResponse,
  type GetHashQuery,
  type GetHashResponse,
  type GetCurrentAuthUserResponse,
  type JWTPayload,
} from '../schemas/auth.schema';

// Services
import { AuthService } from '../services/auth.service';
import { mongodb } from '../database/mongodb';
import { Phase3Collections } from '../entities/mongodb';

// Config
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
const JWT_EXPIRES_IN = 7 * 24 * 60 * 60; // 7 days (seconds)
const REFRESH_TOKEN_EXPIRES_IN = 30 * 24 * 60 * 60; // 30 days (seconds)

// ============================================================================
// 延迟初始化服务
// ============================================================================

let authService: AuthService | null = null;

function getAuthService(): AuthService {
  if (!authService) {
    authService = new AuthService(mongodb.getDatabase());
  }
  return authService;
}

// ============================================================================
// Elysia Auth Routes
// ============================================================================

export const authRoutes = new Elysia({ prefix: '/api/auth' })
  // ============================================================================
  // JWT 插件配置
  // ============================================================================
  .use(
    jwt({
      name: 'jwt',
      secret: JWT_SECRET,
      exp: JWT_EXPIRES_IN, // Access token 过期时间
    })
  )

  // ============================================================================
  // 用户登录
  // ============================================================================

  /**
   * POST /api/auth/login
   * 用户登录 (用户名/手机号 + 密码)
   */
  .post(
    '/login',
    async ({ body, jwt }): Promise<LoginResponse> => {
      try {
        const { data } = body;
        const service = getAuthService();

        // 验证用户凭证
        const user = await service.validateUser(data.username, data.password);

        if (!user) {
          return {
            status: 'error',
            message: '用户名或密码错误',
          };
        }

        // 生成 Access Token
        const accessToken = await jwt.sign(service.createJWTPayload(user));

        // 生成 Refresh Token
        const refreshTokenPayload = service.createRefreshTokenPayload(user);
        const refreshToken = await jwt.sign(refreshTokenPayload);

        // 存储 refresh token 到数据库
        await service.updateRefreshToken(user._id.toString(), refreshToken);

        return {
          status: 'ok',
          data: {
            accessToken,
            refreshToken,
            expiresIn: JWT_EXPIRES_IN,
            user: {
              _id: user._id.toString(),
              username: user.username,
              displayName: user.displayName,
              email: user.email,
              phone: user.phone,
              role: user.role,
            },
          },
        };
      } catch (error) {
        console.error('Login error:', error);
        return {
          status: 'error',
          message: error instanceof Error ? error.message : '登录失败',
        };
      }
    },
    {
      body: LoginRequestSchema,
    }
  )

  /**
   * POST /api/auth/logout
   * 用户登出 (清除 refresh token)
   *
   * 需要 JWT 认证
   */
  .post(
    '/logout',
    async ({ jwt, cookie: { auth } }): Promise<LogoutResponse> => {
      try {
        // 验证 access token
        const payload = await jwt.verify(auth.value);
        if (!payload) {
          return {
            status: 'error',
            message: 'Unauthorized',
          };
        }

        // 清除 refresh token
        const service = getAuthService();
        await service.clearRefreshToken((payload as JWTPayload).userId);

        // 清除客户端 cookie
        auth.remove();

        return {
          status: 'ok',
          message: '登出成功',
        };
      } catch (error) {
        console.error('Logout error:', error);
        return {
          status: 'error',
          message: '登出失败',
        };
      }
    }
  )

  /**
   * POST /api/auth/refresh
   * 刷新访问令牌
   */
  .post(
    '/refresh',
    async ({ body, jwt }): Promise<RefreshTokenResponse> => {
      try {
        const { data } = body;
        const service = getAuthService();

        // 验证 refresh token
        const payload = await jwt.verify(data.refreshToken);
        if (!payload) {
          return {
            status: 'error',
            message: 'Invalid refresh token',
          };
        }

        // 查找用户
        const user = await service.findUserById((payload as any).userId);
        if (!user) {
          return {
            status: 'error',
            message: '用户不存在',
          };
        }

        // 检查 refresh token 是否匹配
        if (user.refreshToken !== data.refreshToken) {
          return {
            status: 'error',
            message: 'Refresh token 已失效',
          };
        }

        // 生成新的 access token
        const accessToken = await jwt.sign(service.createJWTPayload(user));

        return {
          status: 'ok',
          data: {
            accessToken,
            expiresIn: JWT_EXPIRES_IN,
          },
        };
      } catch (error) {
        console.error('Refresh token error:', error);
        return {
          status: 'error',
          message: 'Token 刷新失败',
        };
      }
    },
    {
      body: RefreshTokenRequestSchema,
    }
  )

  // ============================================================================
  // 用户注册
  // ============================================================================

  /**
   * POST /api/auth/register
   * 用户注册
   */
  .post(
    '/register',
    async ({ body }): Promise<RegisterResponse> => {
      try {
        const { data } = body;
        const service = getAuthService();

        // TODO: 验证手机验证码 (如果提供了手机号)
        // if (data.phone && data.verificationCode) {
        //   const isValid = await verifyPhoneCode(data.phone, data.verificationCode);
        //   if (!isValid) {
        //     return { status: 'error', message: '验证码错误或已过期' };
        //   }
        // }

        // 创建用户
        const user = await service.createUser({
          username: data.username,
          password: data.password,
          displayName: data.displayName,
          phone: data.phone,
          email: data.email,
        });

        return {
          status: 'ok',
          message: '注册成功',
          data: {
            userId: user._id.toString(),
            username: user.username,
          },
        };
      } catch (error) {
        console.error('Register error:', error);
        return {
          status: 'error',
          message: error instanceof Error ? error.message : '注册失败',
        };
      }
    },
    {
      body: RegisterRequestSchema,
    }
  )

  // ============================================================================
  // 密码重置
  // ============================================================================

  /**
   * POST /api/auth/forgot-password
   * 忘记密码 (发送验证码)
   */
  .post(
    '/forgot-password',
    async ({ body }): Promise<ForgotPasswordResponse> => {
      try {
        const { data } = body;

        // TODO: 发送短信验证码
        // await sendSMS(data.phone, code);

        return {
          status: 'ok',
          message: '验证码已发送',
          data: {
            codeSent: true,
          },
        };
      } catch (error) {
        console.error('Forgot password error:', error);
        return {
          status: 'error',
          message: '发送验证码失败',
        };
      }
    },
    {
      body: ForgotPasswordRequestSchema,
    }
  )

  /**
   * POST /api/auth/reset-password
   * 重置密码
   */
  .post(
    '/reset-password',
    async ({ body }): Promise<ResetPasswordResponse> => {
      try {
        const { data } = body;
        const service = getAuthService();

        // TODO: 验证短信验证码
        // const isValid = await verifyPhoneCode(data.phone, data.verificationCode);
        // if (!isValid) {
        //   return { status: 'error', message: '验证码错误或已过期' };
        // }

        // 重置密码
        const success = await service.resetPassword(data.phone, data.newPassword);

        if (!success) {
          return {
            status: 'error',
            message: '密码重置失败',
          };
        }

        return {
          status: 'ok',
          message: '密码已重置,请重新登录',
          data: {
            success: true,
          },
        };
      } catch (error) {
        console.error('Reset password error:', error);
        return {
          status: 'error',
          message: error instanceof Error ? error.message : '密码重置失败',
        };
      }
    },
    {
      body: ResetPasswordRequestSchema,
    }
  )

  // ============================================================================
  // 微信登录 (Placeholder - 需要微信 SDK)
  // ============================================================================

  /**
   * POST /api/auth/wechat/mini-program
   * 微信小程序登录
   */
  .post(
    '/wechat/mini-program',
    async ({ body, jwt }): Promise<WechatLoginResponse> => {
      try {
        const { data } = body;
        const service = getAuthService();

        // TODO: 调用微信 API 验证 code
        // const { openId, unionId } = await wechatAPI.code2Session(data.code);

        // 临时实现: 直接返回错误
        return {
          status: 'error',
          message: '微信登录功能暂未实现',
        };

        // 完整实现应该包括:
        // 1. 验证微信授权码
        // 2. 获取用户 openId/unionId
        // 3. 创建或更新用户
        // 4. 生成 JWT tokens
        // 5. 返回用户信息
      } catch (error) {
        console.error('WeChat login error:', error);
        return {
          status: 'error',
          message: '微信登录失败',
        };
      }
    },
    {
      body: WechatMiniProgramLoginSchema,
    }
  )

  /**
   * POST /api/auth/wechat/open
   * 微信开放平台登录
   */
  .post(
    '/wechat/open',
    async ({ body, jwt }): Promise<WechatLoginResponse> => {
      try {
        const { data } = body;

        // TODO: 实现微信开放平台登录
        return {
          status: 'error',
          message: '微信开放平台登录功能暂未实现',
        };
      } catch (error) {
        console.error('WeChat open login error:', error);
        return {
          status: 'error',
          message: '微信登录失败',
        };
      }
    },
    {
      body: WechatOpenLoginSchema,
    }
  )

  // ============================================================================
  // 获取加密 Hash (用于安全登录)
  // ============================================================================

  /**
   * GET /api/auth/hash
   * 获取登录加密 hash (临时 token)
   */
  .get(
    '/hash',
    async ({ query }): Promise<GetHashResponse> => {
      try {
        // TODO: 实现加密 hash 生成
        // 1. 生成随机 hash
        // 2. 存储到 Redis (120 秒过期)
        // 3. 返回 hash

        return {
          status: 'error',
          message: 'Hash 生成功能暂未实现',
        };
      } catch (error) {
        console.error('Get hash error:', error);
        return {
          status: 'error',
          message: 'Hash 生成失败',
        };
      }
    },
    {
      query: GetHashQuerySchema,
    }
  )

  // ============================================================================
  // 获取当前用户
  // ============================================================================

  /**
   * GET /api/auth/me
   * 获取当前登录用户信息
   *
   * 需要 JWT 认证
   */
  .get('/me', async ({ jwt, cookie: { auth } }): Promise<GetCurrentAuthUserResponse> => {
    try {
      // 验证 access token
      const payload = await jwt.verify(auth.value);
      if (!payload) {
        return {
          status: 'error',
          message: 'Unauthorized',
        };
      }

      // 查找用户
      const service = getAuthService();
      const user = await service.findUserById((payload as JWTPayload).userId);

      if (!user) {
        return {
          status: 'error',
          message: '用户不存在',
        };
      }

      // 返回用户信息 (移除敏感字段)
      return {
        status: 'ok',
        data: {
          _id: user._id.toString(),
          username: user.username,
          displayName: user.displayName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          department: user.department,
          isActive: user.isActive,
          createdAt: user.createdAt,
        },
      };
    } catch (error) {
      console.error('Get current user error:', error);
      return {
        status: 'error',
        message: '获取用户信息失败',
      };
    }
  });
