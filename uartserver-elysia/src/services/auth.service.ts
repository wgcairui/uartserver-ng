/**
 * Auth Service (Phase 8.1)
 *
 * JWT 认证服务 - 处理用户登录、注册、Token 管理
 */

import { Db, ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import { Phase3Collections } from '../entities/mongodb';
import type {
  LoginRequest,
  RegisterRequest,
  JWTPayload,
  RefreshTokenPayload,
} from '../schemas/auth.schema';

// ============================================================================
// 类型定义
// ============================================================================

export interface UserDocument {
  _id: ObjectId;
  username: string;
  password: string; // bcrypt hashed
  displayName?: string;
  email?: string;
  phone?: string;
  role: 'user' | 'admin' | 'root' | 'test';
  department?: string;
  isActive: boolean;
  refreshToken?: string; // 当前有效的 refresh token
  devices?: string[]; // 绑定设备 MAC
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;

  // 微信相关
  wxOpenId?: string;
  wxUnionId?: string;
}

export interface AuthResult {
  user: UserDocument;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ============================================================================
// Auth Service
// ============================================================================

export class AuthService {
  private collections: Phase3Collections;

  constructor(db: Db) {
    this.collections = new Phase3Collections(db);
  }

  // ============================================================================
  // 密码哈希
  // ============================================================================

  /**
   * 哈希密码
   */
  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  /**
   * 验证密码
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // ============================================================================
  // 用户查询
  // ============================================================================

  /**
   * 根据用户名或手机号查找用户
   */
  async findUserByUsernameOrPhone(username: string): Promise<UserDocument | null> {
    // 尝试用户名
    let user = await this.collections.users.findOne({
      username,
    }) as UserDocument | null;

    // 尝试手机号
    if (!user && /^1[3-9]\d{9}$/.test(username)) {
      user = await this.collections.users.findOne({
        phone: username,
      }) as UserDocument | null;
    }

    return user;
  }

  /**
   * 根据 ID 查找用户
   */
  async findUserById(userId: string): Promise<UserDocument | null> {
    if (!ObjectId.isValid(userId)) {
      return null;
    }

    return await this.collections.users.findOne({
      _id: new ObjectId(userId),
    }) as UserDocument | null;
  }

  /**
   * 根据微信 openId 查找用户
   */
  async findUserByWxOpenId(openId: string): Promise<UserDocument | null> {
    return await this.collections.users.findOne({
      wxOpenId: openId,
    }) as UserDocument | null;
  }

  // ============================================================================
  // 登录
  // ============================================================================

  /**
   * 用户登录验证
   * @returns 用户文档 (如果验证成功)
   */
  async validateUser(username: string, password: string): Promise<UserDocument | null> {
    // 查找用户
    const user = await this.findUserByUsernameOrPhone(username);
    if (!user) {
      return null;
    }

    // 检查用户是否激活
    if (!user.isActive) {
      throw new Error('用户已被禁用');
    }

    // 验证密码
    const isValid = await this.verifyPassword(password, user.password);
    if (!isValid) {
      return null;
    }

    // 更新最后登录时间
    await this.collections.users.updateOne(
      { _id: user._id },
      {
        $set: { lastLoginAt: new Date() },
      }
    );

    return user;
  }

  /**
   * 更新用户 refresh token
   */
  async updateRefreshToken(userId: string, refreshToken: string): Promise<void> {
    await this.collections.users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          refreshToken,
          updatedAt: new Date(),
        },
      }
    );
  }

  /**
   * 清除用户 refresh token (登出)
   */
  async clearRefreshToken(userId: string): Promise<void> {
    await this.collections.users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $unset: { refreshToken: '' },
        $set: { updatedAt: new Date() },
      }
    );
  }

  // ============================================================================
  // 注册
  // ============================================================================

  /**
   * 检查用户名是否已存在
   */
  async usernameExists(username: string): Promise<boolean> {
    const count = await this.collections.users.countDocuments({ username });
    return count > 0;
  }

  /**
   * 检查手机号是否已存在
   */
  async phoneExists(phone: string): Promise<boolean> {
    const count = await this.collections.users.countDocuments({ phone });
    return count > 0;
  }

  /**
   * 检查邮箱是否已存在
   */
  async emailExists(email: string): Promise<boolean> {
    const count = await this.collections.users.countDocuments({ email });
    return count > 0;
  }

  /**
   * 创建新用户
   */
  async createUser(data: {
    username: string;
    password: string;
    displayName?: string;
    phone?: string;
    email?: string;
    role?: 'user' | 'admin' | 'root' | 'test';
  }): Promise<UserDocument> {
    // 检查用户名是否已存在
    if (await this.usernameExists(data.username)) {
      throw new Error('用户名已存在');
    }

    // 检查手机号是否已存在
    if (data.phone && await this.phoneExists(data.phone)) {
      throw new Error('手机号已被注册');
    }

    // 检查邮箱是否已存在
    if (data.email && await this.emailExists(data.email)) {
      throw new Error('邮箱已被注册');
    }

    // 哈希密码
    const hashedPassword = await this.hashPassword(data.password);

    // 创建用户文档
    const newUser: Omit<UserDocument, '_id'> = {
      username: data.username,
      password: hashedPassword,
      displayName: data.displayName,
      phone: data.phone,
      email: data.email,
      role: data.role || 'user',
      isActive: true,
      devices: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 插入数据库
    const result = await this.collections.users.insertOne(newUser as any);

    return {
      ...newUser,
      _id: result.insertedId,
    } as UserDocument;
  }

  // ============================================================================
  // 密码重置
  // ============================================================================

  /**
   * 重置用户密码
   */
  async resetPassword(phone: string, newPassword: string): Promise<boolean> {
    // 查找用户
    const user = await this.collections.users.findOne({ phone });
    if (!user) {
      throw new Error('手机号未注册');
    }

    // 哈希新密码
    const hashedPassword = await this.hashPassword(newPassword);

    // 更新密码
    const result = await this.collections.users.updateOne(
      { _id: user._id },
      {
        $set: {
          password: hashedPassword,
          updatedAt: new Date(),
        },
        // 清除 refresh token (强制重新登录)
        $unset: { refreshToken: '' },
      }
    );

    return result.modifiedCount > 0;
  }

  // ============================================================================
  // 微信登录
  // ============================================================================

  /**
   * 创建或更新微信用户
   */
  async createOrUpdateWxUser(data: {
    openId: string;
    unionId?: string;
    phone?: string;
    username?: string;
  }): Promise<UserDocument> {
    // 查找现有用户
    let user = await this.findUserByWxOpenId(data.openId);

    if (user) {
      // 更新用户信息
      await this.collections.users.updateOne(
        { _id: user._id },
        {
          $set: {
            wxUnionId: data.unionId,
            lastLoginAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );

      return {
        ...user,
        wxUnionId: data.unionId,
      };
    }

    // 创建新用户
    const username = data.username || `wx_${data.openId.slice(0, 8)}`;
    const randomPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await this.hashPassword(randomPassword);

    const newUser: Omit<UserDocument, '_id'> = {
      username,
      password: hashedPassword,
      phone: data.phone,
      wxOpenId: data.openId,
      wxUnionId: data.unionId,
      role: 'user',
      isActive: true,
      devices: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: new Date(),
    };

    const result = await this.collections.users.insertOne(newUser as any);

    return {
      ...newUser,
      _id: result.insertedId,
    } as UserDocument;
  }

  // ============================================================================
  // JWT Payload 生成
  // ============================================================================

  /**
   * 生成 JWT Access Token Payload
   */
  createJWTPayload(user: UserDocument): JWTPayload {
    return {
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
    };
  }

  /**
   * 生成 JWT Refresh Token Payload
   */
  createRefreshTokenPayload(user: UserDocument): RefreshTokenPayload {
    return {
      userId: user._id.toString(),
      tokenId: new ObjectId().toString(), // 唯一 token ID
    };
  }

  // ============================================================================
  // 用户信息过滤 (移除敏感字段)
  // ============================================================================

  /**
   * 移除敏感字段
   */
  sanitizeUser(user: UserDocument) {
    const { password, refreshToken, ...sanitized } = user as any;
    return {
      ...sanitized,
      _id: user._id.toString(),
    };
  }
}
