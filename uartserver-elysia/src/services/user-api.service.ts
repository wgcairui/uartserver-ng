/**
 * User API Service (Phase 4.2)
 *
 * 用户设备绑定验证服务
 * 为 API 控制器提供用户权限检查功能
 */

import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { UserDocument } from '../entities/mongodb/user.entity';

/**
 * 用户 API 服务
 *
 * 提供用户设备绑定检查功能
 */
export class UserApiService {
  private db: Db;

  // 老系统集合名称
  private readonly USERS_COLLECTION = 'users';

  constructor(db: Db) {
    this.db = db;
  }

  /**
   * 检查设备是否绑定到用户
   *
   * @param userId 用户 ID
   * @param mac 设备 MAC 地址
   * @returns 是否已绑定
   */
  async isDeviceBound(userId: string, mac: string): Promise<boolean> {
    if (!ObjectId.isValid(userId)) {
      return false;
    }

    const collection = this.db.collection<UserDocument>(this.USERS_COLLECTION);

    // 查询用户文档
    const user = await collection.findOne({
      _id: new ObjectId(userId),
    });

    if (!user) {
      return false;
    }

    // 检查设备列表是否包含该 MAC 地址
    // 注意: MAC 地址比较时忽略大小写和分隔符
    const normalizedMac = this.normalizeMac(mac);
    const userDevices = user.devices || [];

    return userDevices.some((device) => {
      const normalizedDevice = this.normalizeMac(device);
      return normalizedDevice === normalizedMac;
    });
  }

  /**
   * 规范化 MAC 地址
   *
   * 移除分隔符,转换为大写
   *
   * @param mac MAC 地址
   * @returns 规范化的 MAC 地址
   */
  private normalizeMac(mac: string): string {
    return mac.replace(/[:-]/g, '').toUpperCase();
  }

  /**
   * 获取用户绑定的设备列表
   *
   * @param userId 用户 ID
   * @returns 设备 MAC 地址列表
   */
  async getUserDevices(userId: string): Promise<string[]> {
    if (!ObjectId.isValid(userId)) {
      return [];
    }

    const collection = this.db.collection<UserDocument>(this.USERS_COLLECTION);

    const user = await collection.findOne(
      {
        _id: new ObjectId(userId),
      },
      {
        projection: { devices: 1 },
      }
    );

    return user?.devices || [];
  }

  /**
   * 批量检查设备绑定
   *
   * @param userId 用户 ID
   * @param macs 设备 MAC 地址列表
   * @returns MAC 到绑定状态的映射
   */
  async batchCheckDeviceBound(
    userId: string,
    macs: string[]
  ): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>();

    if (!ObjectId.isValid(userId)) {
      // 全部返回 false
      for (const mac of macs) {
        result.set(mac, false);
      }
      return result;
    }

    const userDevices = await this.getUserDevices(userId);
    const normalizedUserDevices = new Set(
      userDevices.map((device) => this.normalizeMac(device))
    );

    for (const mac of macs) {
      const normalizedMac = this.normalizeMac(mac);
      result.set(mac, normalizedUserDevices.has(normalizedMac));
    }

    return result;
  }

  /**
   * 检查用户是否有指定权限
   *
   * @param userId 用户 ID
   * @param permission 权限名称
   * @returns 是否有权限
   */
  async hasPermission(userId: string, permission: string): Promise<boolean> {
    if (!ObjectId.isValid(userId)) {
      return false;
    }

    const collection = this.db.collection<UserDocument>(this.USERS_COLLECTION);

    const user = await collection.findOne({
      _id: new ObjectId(userId),
      isActive: { $ne: false }, // 仅检查活跃用户
    });

    if (!user) {
      return false;
    }

    // 管理员拥有所有权限
    if (user.role === 'admin') {
      return true;
    }

    // 检查权限列表
    return user.permissions?.includes(permission as any) || false;
  }

  /**
   * 获取用户角色
   *
   * @param userId 用户 ID
   * @returns 用户角色
   */
  async getUserRole(userId: string): Promise<string | null> {
    if (!ObjectId.isValid(userId)) {
      return null;
    }

    const collection = this.db.collection<UserDocument>(this.USERS_COLLECTION);

    const user = await collection.findOne(
      {
        _id: new ObjectId(userId),
      },
      {
        projection: { role: 1 },
      }
    );

    return user?.role || null;
  }
}
