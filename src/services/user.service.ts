/**
 * 用户服务
 *
 * 处理用户相关的业务逻辑
 * 对齐老系统: midwayuartserver/src/service/user.sevice.ts
 */

import { mongodb } from '../database/mongodb';
import { Phase3Collections } from '../entities/mongodb';
import {
  UserDocument,
  UserRole,
  Permission,
  DEFAULT_PERMISSIONS,
  UserStats,
} from '../entities/mongodb/user.entity';
import { hashPassword, verifyPassword } from '../utils/bcrypt';
import { ObjectId, Filter, UpdateFilter } from 'mongodb';

/**
 * 用户查询过滤器
 */
export interface UserFilter {
  role?: UserRole;
  isActive?: boolean;
  search?: string;
  department?: string;
}

/**
 * 分页参数
 */
export interface PaginationParams {
  page: number;
  limit: number;
}

/**
 * 分页结果
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * 创建用户参数
 */
export interface CreateUserParams {
  username: string;
  password: string;
  email: string;
  displayName?: string;
  phone?: string;
  department?: string;
  role?: UserRole;
  devices?: string[];
}

/**
 * 更新用户参数
 */
export interface UpdateUserParams {
  email?: string;
  phone?: string;
  displayName?: string;
  department?: string;
  role?: UserRole;
  isActive?: boolean;
  devices?: string[];
  permissions?: Permission[];
}

/**
 * 用户服务类
 */
export class UserService {
  private collections: Phase3Collections;

  constructor() {
    this.collections = new Phase3Collections(mongodb.getDatabase());
  }

  // ==================== 查询方法 ====================

  /**
   * 根据 ID 获取用户
   */
  async getUserById(id: string): Promise<UserDocument | null> {
    if (!ObjectId.isValid(id)) {
      return null;
    }
    return this.collections.users.findOne({
      _id: new ObjectId(id),
    });
  }

  /**
   * 根据用户名获取用户
   */
  async getUserByUsername(username: string): Promise<UserDocument | null> {
    return this.collections.users.findOne({ username });
  }

  /**
   * 根据邮箱获取用户
   */
  async getUserByEmail(email: string): Promise<UserDocument | null> {
    return this.collections.users.findOne({ email });
  }

  /**
   * 根据手机号获取用户
   */
  async getUserByPhone(phone: string): Promise<UserDocument | null> {
    return this.collections.users.findOne({ phone });
  }

  /**
   * 根据 ID 或手机号获取用户
   * 兼容老系统: getUserByIdOrTel
   */
  async getUserByIdOrTel(idOrTel: string): Promise<UserDocument | null> {
    // 尝试作为 ObjectId
    if (ObjectId.isValid(idOrTel)) {
      const user = await this.getUserById(idOrTel);
      if (user) return user;
    }

    // 尝试作为手机号
    return this.getUserByPhone(idOrTel);
  }

  /**
   * 根据微信 ID 查找用户
   * 兼容老系统: getUserBindWx
   */
  async getUserByWxId(wxId: string): Promise<UserDocument | null> {
    return this.collections.users.findOne({ wxId } as Filter<UserDocument>);
  }

  /**
   * 根据刷新令牌查找用户
   */
  async getUserByRefreshToken(refreshToken: string): Promise<UserDocument | null> {
    return this.collections.users.findOne({
      'session.refreshToken': refreshToken,
    });
  }

  // ==================== 创建与更新 ====================

  /**
   * 创建用户
   */
  async createUser(data: CreateUserParams): Promise<UserDocument> {
    // 检查用户名是否已存在
    const existingUsername = await this.getUserByUsername(data.username);
    if (existingUsername) {
      throw new Error('用户名已存在');
    }

    // 检查邮箱是否已存在
    const existingEmail = await this.getUserByEmail(data.email);
    if (existingEmail) {
      throw new Error('邮箱已被使用');
    }

    // 检查手机号是否已存在
    if (data.phone) {
      const existingPhone = await this.getUserByPhone(data.phone);
      if (existingPhone) {
        throw new Error('手机号已被使用');
      }
    }

    // 哈希密码
    const passwordHash = await hashPassword(data.password);

    // 确定角色和权限
    const role = data.role || UserRole.USER;
    const permissions = DEFAULT_PERMISSIONS[role];

    const now = new Date();

    // 创建用户文档
    const userDoc: Omit<UserDocument, '_id'> = {
      username: data.username,
      email: data.email,
      passwordHash,
      displayName: data.displayName,
      phone: data.phone,
      department: data.department,
      role,
      permissions,
      devices: data.devices || [],
      isActive: true,
      session: {
        loginAttempts: 0,
      },
      createdAt: now,
      updatedAt: now,
    };

    // 插入数据库
    const result = await this.collections.users.insertOne(userDoc as UserDocument);

    return {
      _id: result.insertedId,
      ...userDoc,
    } as UserDocument;
  }

  /**
   * 更新用户
   */
  async updateUser(
    id: string,
    data: UpdateUserParams
  ): Promise<UserDocument | null> {
    if (!ObjectId.isValid(id)) {
      throw new Error('无效的用户 ID');
    }

    const objectId = new ObjectId(id);

    // 如果更新邮箱，检查是否已被使用
    if (data.email) {
      const existing = await this.collections.users.findOne({
        _id: { $ne: objectId },
        email: data.email,
      });
      if (existing) {
        throw new Error('邮箱已被其他用户使用');
      }
    }

    // 如果更新手机号，检查是否已被使用
    if (data.phone) {
      const existing = await this.collections.users.findOne({
        _id: { $ne: objectId },
        phone: data.phone,
      });
      if (existing) {
        throw new Error('手机号已被其他用户使用');
      }
    }

    const updateData: UpdateFilter<UserDocument> = {
      $set: {
        ...data,
        updatedAt: new Date(),
      },
    };

    await this.collections.users.updateOne(
      { _id: objectId },
      updateData
    );

    return this.getUserById(id);
  }

  /**
   * 更新密码
   */
  async updatePassword(id: string, newPassword: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) {
      throw new Error('无效的用户 ID');
    }

    const passwordHash = await hashPassword(newPassword);

    const result = await this.collections.users.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          passwordHash,
          updatedAt: new Date(),
        },
      }
    );

    return result.modifiedCount > 0;
  }

  /**
   * 验证密码
   */
  async verifyUserPassword(id: string, password: string): Promise<boolean> {
    const user = await this.getUserById(id);
    if (!user) return false;

    return verifyPassword(password, user.passwordHash);
  }

  /**
   * 删除用户 (软删除)
   */
  async deleteUser(id: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) {
      throw new Error('无效的用户 ID');
    }

    const result = await this.collections.users.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          isActive: false,
          updatedAt: new Date(),
        },
      }
    );

    return result.modifiedCount > 0;
  }

  /**
   * 硬删除用户 (谨慎使用)
   */
  async hardDeleteUser(id: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) {
      throw new Error('无效的用户 ID');
    }

    const result = await this.collections.users.deleteOne({
      _id: new ObjectId(id),
    });

    return result.deletedCount > 0;
  }

  // ==================== 列表与统计 ====================

  /**
   * 获取用户列表 (分页)
   */
  async getUsers(
    filter: UserFilter,
    pagination: PaginationParams
  ): Promise<PaginatedResult<UserDocument>> {
    const mongoFilter: Filter<UserDocument> = {};

    if (filter.role) {
      mongoFilter.role = filter.role;
    }

    if (filter.isActive !== undefined) {
      mongoFilter.isActive = filter.isActive;
    }

    if (filter.department) {
      mongoFilter.department = filter.department;
    }

    if (filter.search) {
      mongoFilter.$or = [
        { username: { $regex: filter.search, $options: 'i' } },
        { email: { $regex: filter.search, $options: 'i' } },
        { phone: { $regex: filter.search, $options: 'i' } },
        { displayName: { $regex: filter.search, $options: 'i' } },
      ];
    }

    const skip = (pagination.page - 1) * pagination.limit;

    const [data, total] = await Promise.all([
      this.collections.users
        .find(mongoFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pagination.limit)
        .toArray(),
      this.collections.users.countDocuments(mongoFilter),
    ]);

    return {
      data,
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit),
    };
  }

  /**
   * 获取用户统计信息
   */
  async getUserStats(): Promise<UserStats> {
    const [total, active, online, roleStats, deptStats] = await Promise.all([
      this.collections.users.countDocuments(),
      this.collections.users.countDocuments({ isActive: true }),
      this.collections.users.countDocuments({ isOnline: true }),
      this.collections.users.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ]).toArray(),
      this.collections.users.aggregate([
        { $match: { department: { $exists: true, $ne: null } } },
        { $group: { _id: '$department', count: { $sum: 1 } } },
      ]).toArray(),
    ]);

    const byRole: Partial<Record<UserRole, number>> = {};
    for (const item of roleStats) {
      byRole[item._id as UserRole] = item.count as number;
    }

    const byDepartment: Record<string, number> = {};
    for (const item of deptStats) {
      byDepartment[item._id as string] = item.count as number;
    }

    return {
      total,
      active,
      online,
      byRole,
      byDepartment,
    };
  }

  // ==================== 会话管理 ====================

  /**
   * 更新用户最后登录信息
   */
  async updateLastLogin(id: string, ip?: string, userAgent?: string): Promise<void> {
    if (!ObjectId.isValid(id)) {
      return;
    }

    const updateData: UpdateFilter<UserDocument> = {
      $set: {
        lastLoginAt: new Date(),
        lastLoginIp: ip,
        'session.userAgent': userAgent,
        'session.loginAttempts': 0, // 登录成功后重置失败次数
        updatedAt: new Date(),
      },
    };

    await this.collections.users.updateOne(
      { _id: new ObjectId(id) },
      updateData
    );
  }

  /**
   * 记录登录失败
   */
  async recordLoginFailure(id: string): Promise<number> {
    if (!ObjectId.isValid(id)) {
      return 0;
    }

    const result = await this.collections.users.findOneAndUpdate(
      { _id: new ObjectId(id) },
      {
        $inc: { 'session.loginAttempts': 1 },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: 'after' }
    );

    return result?.session?.loginAttempts || 0;
  }

  /**
   * 锁定账户
   */
  async lockAccount(id: string, duration: number = 30 * 60 * 1000): Promise<void> {
    if (!ObjectId.isValid(id)) {
      return;
    }

    const lockedUntil = new Date(Date.now() + duration);

    await this.collections.users.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          'session.lockedUntil': lockedUntil,
          updatedAt: new Date(),
        },
      }
    );
  }

  /**
   * 解锁账户
   */
  async unlockAccount(id: string): Promise<void> {
    if (!ObjectId.isValid(id)) {
      return;
    }

    await this.collections.users.updateOne(
      { _id: new ObjectId(id) },
      {
        $unset: { 'session.lockedUntil': '' },
        $set: {
          'session.loginAttempts': 0,
          updatedAt: new Date(),
        },
      }
    );
  }

  /**
   * 检查账户是否被锁定
   */
  async isAccountLocked(id: string): Promise<boolean> {
    const user = await this.getUserById(id);
    if (!user) return false;

    const lockedUntil = user.session?.lockedUntil;
    if (!lockedUntil) return false;

    return new Date() < new Date(lockedUntil);
  }

  /**
   * 更新刷新令牌
   */
  async updateRefreshToken(id: string, refreshToken: string): Promise<void> {
    if (!ObjectId.isValid(id)) {
      return;
    }

    await this.collections.users.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          'session.refreshToken': refreshToken,
          updatedAt: new Date(),
        },
      }
    );
  }

  /**
   * 清除刷新令牌 (登出)
   */
  async clearRefreshToken(id: string): Promise<void> {
    if (!ObjectId.isValid(id)) {
      return;
    }

    await this.collections.users.updateOne(
      { _id: new ObjectId(id) },
      {
        $unset: { 'session.refreshToken': '' },
        $set: { updatedAt: new Date() },
      }
    );
  }

  /**
   * 设置用户在线状态
   */
  async setOnlineStatus(id: string, isOnline: boolean): Promise<void> {
    if (!ObjectId.isValid(id)) {
      return;
    }

    await this.collections.users.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          isOnline,
          updatedAt: new Date(),
        },
      }
    );
  }

  // ==================== 微信绑定 ====================

  /**
   * 绑定微信 ID
   */
  async bindWxId(userId: string, wxId: string): Promise<boolean> {
    if (!ObjectId.isValid(userId)) {
      throw new Error('无效的用户 ID');
    }

    // 检查微信 ID 是否已被其他用户绑定
    const existing = await this.collections.users.findOne({
      _id: { $ne: new ObjectId(userId) },
      wxId,
    } as Filter<UserDocument>);

    if (existing) {
      throw new Error('该微信账号已被其他用户绑定');
    }

    const result = await this.collections.users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          wxId,
          updatedAt: new Date(),
        } as Partial<UserDocument>,
      }
    );

    return result.modifiedCount > 0;
  }

  /**
   * 解绑微信 ID
   */
  async unbindWxId(userId: string): Promise<boolean> {
    if (!ObjectId.isValid(userId)) {
      throw new Error('无效的用户 ID');
    }

    const result = await this.collections.users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $unset: { wxId: '' },
        $set: { updatedAt: new Date() },
      } as UpdateFilter<UserDocument>
    );

    return result.modifiedCount > 0;
  }

  // ==================== 设备权限 ====================

  /**
   * 添加设备权限
   */
  async addDeviceAccess(userId: string, deviceMac: string): Promise<boolean> {
    if (!ObjectId.isValid(userId)) {
      throw new Error('无效的用户 ID');
    }

    const result = await this.collections.users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $addToSet: { devices: deviceMac },
        $set: { updatedAt: new Date() },
      }
    );

    return result.modifiedCount > 0;
  }

  /**
   * 移除设备权限
   */
  async removeDeviceAccess(userId: string, deviceMac: string): Promise<boolean> {
    if (!ObjectId.isValid(userId)) {
      throw new Error('无效的用户 ID');
    }

    const result = await this.collections.users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $pull: { devices: deviceMac },
        $set: { updatedAt: new Date() },
      }
    );

    return result.modifiedCount > 0;
  }

  /**
   * 设置设备权限列表
   */
  async setDeviceAccess(userId: string, deviceMacs: string[]): Promise<boolean> {
    if (!ObjectId.isValid(userId)) {
      throw new Error('无效的用户 ID');
    }

    const result = await this.collections.users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          devices: deviceMacs,
          updatedAt: new Date(),
        },
      }
    );

    return result.modifiedCount > 0;
  }

  /**
   * 检查用户是否有设备访问权限
   */
  async hasDeviceAccess(userId: string, deviceMac: string): Promise<boolean> {
    const user = await this.getUserById(userId);
    if (!user) return false;

    // 管理员可以访问所有设备
    if (user.role === UserRole.ADMIN) {
      return true;
    }

    return user.devices?.includes(deviceMac) || false;
  }
}

// 单例导出
export const userService = new UserService();
