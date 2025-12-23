/**
 * 认证控制器
 *
 * 处理用户注册、登录、令牌刷新等认证相关操作
 */

import { ObjectId } from 'mongodb';
import { Controller, Post, Get, Put } from '../decorators/controller';
import { Validate } from '../decorators/validate';
import { mongodb } from '../database/mongodb';
import { Phase3Collections } from '../entities/mongodb';
import {
  UserDocument,
  UserRole,
  DEFAULT_PERMISSIONS,
} from '../entities/mongodb/user.entity';
import {
  generateTokenPair,
  verifyRefreshToken,
} from '../utils/jwt';
import {
  hashPassword,
  verifyPassword,
  shouldRehashPassword,
} from '../utils/bcrypt';
import {
  RegisterRequestSchema,
  LoginRequestSchema,
  ChangePasswordRequestSchema,
  RefreshTokenRequestSchema,
  type RegisterRequest,
  type LoginRequest,
  type ChangePasswordRequest,
  type RefreshTokenRequest,
} from '../schemas/auth.schema';
import {
  WxMiniLoginRequestSchema,
  BindWxUserRequestSchema,
  UnbindWxUserRequestSchema,
  type WxMiniLoginRequest,
  type BindWxUserRequest,
  type UnbindWxUserRequest,
  type WxMiniLoginResponse,
} from '../schemas/wx-auth.schema';
import { FastifyRequest, FastifyReply } from 'fastify';
import { WxAuthService } from '../services/wx-auth.service';

/**
 * 认证控制器
 */
@Controller('/api/auth')
export class AuthController {
  private collections: Phase3Collections;
  private wxAuthService: WxAuthService;

  constructor() {
    this.collections = new Phase3Collections(mongodb.getDatabase());
    this.wxAuthService = new WxAuthService();
  }

  /**
   * 用户注册
   *
   * @param request - Fastify 请求对象
   * @param reply - Fastify 响应对象
   */
  @Post('/register')
  @Validate(RegisterRequestSchema)
  async register(request: FastifyRequest, reply: FastifyReply) {
    const { data } = request.body as RegisterRequest;

    try {
      // 检查用户名是否已存在
      const existingUser = await this.collections.users.findOne({
        $or: [
          { username: data.username },
          { email: data.email },
        ],
      });

      if (existingUser) {
        if (existingUser.username === data.username) {
          return reply.status(409).send({
            status: 'error',
            message: '用户名已存在',
            code: 'USERNAME_EXISTS',
            timestamp: new Date().toISOString(),
            requestId: request.id,
          });
        }

        if (existingUser.email === data.email) {
          return reply.status(409).send({
            status: 'error',
            message: '邮箱已被注册',
            code: 'EMAIL_EXISTS',
            timestamp: new Date().toISOString(),
            requestId: request.id,
          });
        }
      }

      // 加密密码
      const passwordHash = await hashPassword(data.password);

      // 创建用户文档
      const now = new Date();
      const userDocument: Omit<UserDocument, '_id'> = {
        username: data.username,
        email: data.email,
        displayName: data.displayName,
        phone: data.phone,
        department: data.department,
        passwordHash,
        role: data.role || UserRole.USER,
        permissions: DEFAULT_PERMISSIONS[data.role || UserRole.USER],
        devices: data.devices || [],
        isActive: true,
        isOnline: false,
        createdAt: now,
        updatedAt: now,
        session: {
          loginAttempts: 0,
          passwordChangedAt: now,
        },
      };

      // 保存用户
      const result = await this.collections.users.insertOne(userDocument as any);
      const userId = result.insertedId.toHexString();

      // 生成令牌
      const createdUser = await this.collections.users.findOne({ _id: result.insertedId });
      const tokens = generateTokenPair(createdUser!);

      // 返回响应
      return reply.status(201).send({
        status: 'ok',
        data: {
          user: {
            id: userId,
            username: createdUser!.username,
            email: createdUser!.email,
            displayName: createdUser!.displayName,
            role: createdUser!.role,
            permissions: createdUser!.permissions,
            devices: createdUser!.devices,
            lastLoginAt: undefined,
          },
          tokens,
        },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    } catch (error) {
      console.error('Registration error:', error);
      return reply.status(500).send({
        status: 'error',
        message: '注册失败',
        code: 'REGISTRATION_FAILED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  }

  /**
   * 用户登录
   *
   * @param request - Fastify 请求对象
   * @param reply - Fastify 响应对象
   */
  @Post('/login')
  @Validate(LoginRequestSchema)
  async login(request: FastifyRequest, reply: FastifyReply) {
    const { data } = request.body as LoginRequest;
    const { username, password } = data;

    try {
      // 查找用户（支持用户名或邮箱登录）
      const user = await this.collections.users.findOne({
        $or: [
          { username: username },
          { email: username },
        ],
        isActive: true,
      });

      if (!user) {
        return reply.status(401).send({
          status: 'error',
          message: '用户名或密码错误',
          code: 'INVALID_CREDENTIALS',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 检查账户是否被锁定
      if (user.session.lockedUntil && user.session.lockedUntil > new Date()) {
        const remainingTime = Math.ceil(
          (user.session.lockedUntil.getTime() - Date.now()) / 60000
        );

        return reply.status(423).send({
          status: 'error',
          message: `账户已被锁定，请 ${remainingTime} 分钟后重试`,
          code: 'ACCOUNT_LOCKED',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 验证密码
      const isPasswordValid = await verifyPassword(password, user.passwordHash);

      if (!isPasswordValid) {
        // 增加登录失败次数
        await this.incrementLoginAttempts(user._id);

        return reply.status(401).send({
          status: 'error',
          message: '用户名或密码错误',
          code: 'INVALID_CREDENTIALS',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 检查是否需要重新加密密码
      if (shouldRehashPassword(user.passwordHash)) {
        const newPasswordHash = await hashPassword(password);
        await this.collections.users.updateOne(
          { _id: user._id },
          {
            $set: {
              passwordHash: newPasswordHash,
              'session.passwordChangedAt': new Date(),
              updatedAt: new Date(),
            },
          }
        );
      }

      // 重置登录失败次数
      await this.resetLoginAttempts(user._id);

      // 更新登录信息
      const now = new Date();
      const forwardedFor = request.headers['x-forwarded-for'];
      const clientIp = request.ip || (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor) || 'unknown';
      const userAgent = request.headers['user-agent'] || 'unknown';

      await this.collections.users.updateOne(
        { _id: user._id },
        {
          $set: {
            lastLoginAt: now,
            lastLoginIp: clientIp,
            isOnline: true,
            'session.userAgent': userAgent,
            updatedAt: now,
          },
        }
      );

      // 生成令牌
      const tokens = generateTokenPair(user);

      // 保存刷新令牌
      await this.collections.users.updateOne(
        { _id: user._id },
        {
          $set: {
            'session.refreshToken': tokens.refreshToken,
            updatedAt: now,
          },
        }
      );

      // 记录登录日志
      console.info('[AUTH LOGIN]', {
        userId: user._id.toHexString(),
        username: user.username,
        ip: clientIp,
        userAgent,
        timestamp: now.toISOString(),
      });

      // 返回响应
      return reply.send({
        status: 'ok',
        data: {
          user: {
            id: user._id.toHexString(),
            username: user.username,
            email: user.email,
            displayName: user.displayName,
            role: user.role,
            permissions: user.permissions,
            devices: user.devices,
            lastLoginAt: now.toISOString(),
          },
          tokens,
        },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    } catch (error) {
      console.error('Login error:', error);
      return reply.status(500).send({
        status: 'error',
        message: '登录失败',
        code: 'LOGIN_FAILED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  }

  /**
   * 刷新访问令牌
   *
   * @param request - Fastify 请求对象
   * @param reply - Fastify 响应对象
   */
  @Post('/refresh')
  @Validate(RefreshTokenRequestSchema)
  async refreshToken(request: FastifyRequest, reply: FastifyReply) {
    const { data } = request.body as RefreshTokenRequest;
    const { refreshToken } = data;

    try {
      // 验证刷新令牌
      const payload = verifyRefreshToken(refreshToken);

      // 获取用户信息
      const user = await this.collections.users.findOne({
        _id: new ObjectId(payload.sub),
        isActive: true,
        'session.refreshToken': refreshToken,
      });

      if (!user) {
        return reply.status(401).send({
          status: 'error',
          message: '无效的刷新令牌',
          code: 'INVALID_REFRESH_TOKEN',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 生成新的令牌对
      const tokens = generateTokenPair(user);

      // 更新刷新令牌
      await this.collections.users.updateOne(
        { _id: user._id },
        {
          $set: {
            'session.refreshToken': tokens.refreshToken,
            updatedAt: new Date(),
          },
        }
      );

      // 返回响应
      return reply.send({
        status: 'ok',
        data: {
          tokens,
        },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    } catch (error) {
      console.error('Token refresh error:', error);

      const message = error instanceof Error ? error.message : '刷新令牌失败';
      const code = message.includes('expired') ? 'REFRESH_TOKEN_EXPIRED' : 'INVALID_REFRESH_TOKEN';

      return reply.status(401).send({
        status: 'error',
        message,
        code,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  }

  /**
   * 获取当前用户信息
   *
   * @param request - Fastify 请求对象
   * @param reply - Fastify 响应对象
   */
  @Get('/me')
  async getCurrentUser(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = request.user;

      if (!user) {
        return reply.status(401).send({
          status: 'error',
          message: '未认证',
          code: 'UNAUTHENTICATED',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      return reply.send({
        status: 'ok',
        data: {
          id: user._id.toHexString(),
          username: user.username,
          email: user.email,
          displayName: user.displayName,
          phone: user.phone,
          department: user.department,
          role: user.role,
          permissions: user.permissions,
          devices: user.devices,
          lastLoginAt: user.lastLoginAt?.toISOString(),
          createdAt: user.createdAt.toISOString(),
        },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    } catch (error) {
      console.error('Get current user error:', error);
      return reply.status(500).send({
        status: 'error',
        message: '获取用户信息失败',
        code: 'GET_USER_FAILED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  }

  /**
   * 修改密码
   *
   * @param request - Fastify 请求对象
   * @param reply - Fastify 响应对象
   */
  @Put('/change-password')
  @Validate(ChangePasswordRequestSchema)
  async changePassword(request: FastifyRequest, reply: FastifyReply) {
    const { data } = request.body as ChangePasswordRequest;
    const user = request.user;

    if (!user) {
      return reply.status(401).send({
        status: 'error',
        message: '未认证',
        code: 'UNAUTHENTICATED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    try {
      // 获取完整的用户信息（包括密码哈希）
      const fullUser = await this.collections.users.findOne({ _id: user._id });
      if (!fullUser) {
        return reply.status(404).send({
          status: 'error',
          message: '用户不存在',
          code: 'USER_NOT_FOUND',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 验证当前密码
      const isCurrentPasswordValid = await verifyPassword(
        data.currentPassword,
        fullUser.passwordHash
      );

      if (!isCurrentPasswordValid) {
        return reply.status(400).send({
          status: 'error',
          message: '当前密码错误',
          code: 'INVALID_CURRENT_PASSWORD',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 加密新密码
      const newPasswordHash = await hashPassword(data.newPassword);

      // 更新密码
      await this.collections.users.updateOne(
        { _id: user._id },
        {
          $set: {
            passwordHash: newPasswordHash,
            'session.passwordChangedAt': new Date(),
            'session.refreshToken': undefined, // 清除所有刷新令牌，强制重新登录
            updatedAt: new Date(),
          },
        }
      );

      return reply.send({
        status: 'ok',
        message: '密码修改成功',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    } catch (error) {
      console.error('Change password error:', error);
      return reply.status(500).send({
        status: 'error',
        message: '修改密码失败',
        code: 'CHANGE_PASSWORD_FAILED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  }

  /**
   * 登出
   *
   * @param request - Fastify 请求对象
   * @param reply - Fastify 响应对象
   */
  @Post('/logout')
  async logout(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user;

    if (!user) {
      return reply.status(401).send({
        status: 'error',
        message: '未认证',
        code: 'UNAUTHENTICATED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    try {
      // 清除刷新令牌并更新状态
      await this.collections.users.updateOne(
        { _id: user._id },
        {
          $set: {
            'session.refreshToken': undefined,
            isOnline: false,
            updatedAt: new Date(),
          },
        }
      );

      return reply.send({
        status: 'ok',
        message: '登出成功',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    } catch (error) {
      console.error('Logout error:', error);
      return reply.status(500).send({
        status: 'error',
        message: '登出失败',
        code: 'LOGOUT_FAILED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  }

  /**
   * 微信小程序登录
   *
   * @param request - Fastify 请求对象
   * @param reply - Fastify 响应对象
   */
  @Post('/wx/login')
  @Validate(WxMiniLoginRequestSchema)
  async wxMiniLogin(request: FastifyRequest, reply: FastifyReply) {
    const { data } = request.body as WxMiniLoginRequest;

    try {
      // 调用微信认证服务
      const result = await this.wxAuthService.wxMiniLogin(data.code, data.appid);

      // 构建响应
      const responseData: WxMiniLoginResponse = {
        user: {
          id: result.user._id.toHexString(),
          openid: result.user.openid,
          unionid: result.user.unionid,
          nickname: result.user.nickname,
          avatar_url: result.user.avatar_url,
          binding_status: result.user.binding_status,
        },
        systemUser: result.systemUser ? {
          id: result.systemUser._id.toHexString(),
          username: result.systemUser.username,
          email: result.systemUser.email,
          displayName: result.systemUser.displayName,
          role: result.systemUser.role,
          permissions: result.systemUser.permissions,
        } : undefined,
        isNewUser: result.isNewUser,
      };

      // 如果已绑定系统用户，生成JWT令牌
      if (result.systemUser) {
        const tokens = generateTokenPair(result.systemUser);
        responseData.tokens = {
          ...tokens,
          tokenType: 'Bearer',
        };

        // 保存刷新令牌
        await this.collections.users.updateOne(
          { _id: result.systemUser._id },
          {
            $set: {
              'session.refreshToken': tokens.refreshToken,
              isOnline: true,
              lastLoginAt: new Date(),
              updatedAt: new Date(),
            },
          }
        );
      }

      // 记录登录日志
      console.info('[WX_AUTH LOGIN]', {
        wxUserId: result.user._id.toHexString(),
        unionid: result.user.unionid,
        openid: result.user.openid,
        bindingStatus: result.user.binding_status,
        hasSystemUser: !!result.systemUser,
        isNewUser: result.isNewUser,
        timestamp: new Date().toISOString(),
      });

      return reply.send({
        status: 'ok',
        data: responseData,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    } catch (error) {
      console.error('WeChat mini program login error:', error);

      const message = error instanceof Error ? error.message : '微信登录失败';

      return reply.status(401).send({
        status: 'error',
        message,
        code: 'WX_LOGIN_FAILED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  }

  /**
   * 绑定微信用户到系统账号
   *
   * @param request - Fastify 请求对象
   * @param reply - Fastify 响应对象
   */
  @Post('/wx/bind')
  @Validate(BindWxUserRequestSchema)
  async bindWxUser(request: FastifyRequest, reply: FastifyReply) {
    const { data } = request.body as BindWxUserRequest;
    const user = request.user;

    if (!user) {
      return reply.status(401).send({
        status: 'error',
        message: '未认证',
        code: 'UNAUTHENTICATED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    try {
      // 执行绑定
      const updatedWxUser = await this.wxAuthService.bindWxUser(
        data.wxUserId,
        data.systemUserId
      );

      return reply.send({
        status: 'ok',
        message: '微信账号绑定成功',
        data: {
          wxUser: {
            id: updatedWxUser._id.toHexString(),
            binding_status: updatedWxUser.binding_status,
            bound_at: updatedWxUser.bound_at,
          },
        },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    } catch (error) {
      console.error('Bind WeChat user error:', error);

      const message = error instanceof Error ? error.message : '绑定微信账号失败';

      return reply.status(400).send({
        status: 'error',
        message,
        code: 'WX_BIND_FAILED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  }

  /**
   * 解绑微信用户
   *
   * @param request - Fastify 请求对象
   * @param reply - Fastify 响应对象
   */
  @Post('/wx/unbind')
  @Validate(UnbindWxUserRequestSchema)
  async unbindWxUser(request: FastifyRequest, reply: FastifyReply) {
    const { data } = request.body as UnbindWxUserRequest;
    const user = request.user;

    if (!user) {
      return reply.status(401).send({
        status: 'error',
        message: '未认证',
        code: 'UNAUTHENTICATED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    try {
      // 执行解绑
      const updatedWxUser = await this.wxAuthService.unbindWxUser(
        data.systemUserId
      );

      return reply.send({
        status: 'ok',
        message: '微信账号解绑成功',
        data: {
          wxUser: {
            id: updatedWxUser._id.toHexString(),
            binding_status: updatedWxUser.binding_status,
          },
        },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    } catch (error) {
      console.error('Unbind WeChat user error:', error);

      const message = error instanceof Error ? error.message : '解绑微信账号失败';

      return reply.status(400).send({
        status: 'error',
        message,
        code: 'WX_UNBIND_FAILED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  }

  /**
   * 增加登录失败次数
   *
   * @param userId - 用户 ID
   */
  private async incrementLoginAttempts(userId: ObjectId): Promise<void> {
    const MAX_ATTEMPTS = 5;
    const LOCK_DURATION = 15 * 60 * 1000; // 15分钟

    const user = await this.collections.users.findOne({ _id: userId });
    if (!user) return;

    const attempts = user.session.loginAttempts + 1;
    const updateData: any = {
      $set: {
        'session.loginAttempts': attempts,
        updatedAt: new Date(),
      },
    };

    // 如果达到最大尝试次数，锁定账户
    if (attempts >= MAX_ATTEMPTS) {
      updateData.$set['session.lockedUntil'] = new Date(Date.now() + LOCK_DURATION);
    }

    await this.collections.users.updateOne({ _id: userId }, updateData);
  }

  /**
   * 重置登录失败次数
   *
   * @param userId - 用户 ID
   */
  private async resetLoginAttempts(userId: ObjectId): Promise<void> {
    await this.collections.users.updateOne(
      { _id: userId },
      {
        $set: {
          'session.loginAttempts': 0,
          'session.lockedUntil': undefined,
          updatedAt: new Date(),
        },
      }
    );
  }
}