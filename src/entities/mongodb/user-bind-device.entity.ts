/**
 * 用户设备绑定实体
 *
 * 记录用户与 DTU 设备的绑定关系
 * 支持设备级权限控制和多设备管理
 */

import { ObjectId } from 'mongodb';

/**
 * 设备权限级别枚举
 */
export enum DevicePermissionLevel {
  READ = 'read',     // 只读：查看设备数据
  WRITE = 'write',   // 读写：查看和控制设备
  ADMIN = 'admin',   // 管理：完全控制，可以解绑设备
}

/**
 * 用户设备绑定文档接口
 */
export interface UserBindDeviceDocument {
  _id: ObjectId;

  /** 用户 ID */
  userId: ObjectId;

  /** 设备 MAC 地址 */
  deviceMac: string;

  /** 设备名称 (用户自定义别名) */
  deviceName?: string;

  /** 设备备注 */
  deviceRemark?: string;

  /** 绑定时间 */
  boundAt: Date;

  /** 是否为主设备 (用户的默认设备) */
  isPrimary: boolean;

  /** 设备权限级别 */
  permissionLevel: DevicePermissionLevel;

  /** 是否启用 */
  isActive: boolean;

  /** 最后访问时间 */
  lastAccessAt?: Date;

  /** 创建时间 */
  createdAt: Date;

  /** 更新时间 */
  updatedAt: Date;
}

/**
 * 创建用户设备绑定参数
 */
export interface CreateUserBindDeviceParams {
  userId: ObjectId;
  deviceMac: string;
  deviceName?: string;
  deviceRemark?: string;
  isPrimary?: boolean;
  permissionLevel?: DevicePermissionLevel;
}

/**
 * 创建用户设备绑定
 *
 * @param data - 绑定数据
 * @returns 绑定文档 (不含 _id)
 */
export function createUserBindDevice(
  data: CreateUserBindDeviceParams
): Omit<UserBindDeviceDocument, '_id'> {
  const now = new Date();
  return {
    userId: data.userId,
    deviceMac: data.deviceMac.toUpperCase(), // MAC 地址统一大写
    deviceName: data.deviceName,
    deviceRemark: data.deviceRemark,
    boundAt: now,
    isPrimary: data.isPrimary ?? false,
    permissionLevel: data.permissionLevel ?? DevicePermissionLevel.READ,
    isActive: true,
    lastAccessAt: undefined,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 更新用户设备绑定参数
 */
export interface UpdateUserBindDeviceParams {
  deviceName?: string;
  deviceRemark?: string;
  isPrimary?: boolean;
  permissionLevel?: DevicePermissionLevel;
  isActive?: boolean;
}

/**
 * 构建更新数据
 *
 * @param data - 更新参数
 * @returns MongoDB 更新数据
 */
export function buildUserBindDeviceUpdate(
  data: UpdateUserBindDeviceParams
): Record<string, unknown> {
  const update: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (data.deviceName !== undefined) {
    update.deviceName = data.deviceName;
  }

  if (data.deviceRemark !== undefined) {
    update.deviceRemark = data.deviceRemark;
  }

  if (data.isPrimary !== undefined) {
    update.isPrimary = data.isPrimary;
  }

  if (data.permissionLevel !== undefined) {
    update.permissionLevel = data.permissionLevel;
  }

  if (data.isActive !== undefined) {
    update.isActive = data.isActive;
  }

  return { $set: update };
}

/**
 * 检查用户是否有设备的指定权限
 *
 * @param binding - 绑定记录
 * @param requiredLevel - 需要的权限级别
 * @returns 是否有权限
 */
export function hasDevicePermission(
  binding: UserBindDeviceDocument,
  requiredLevel: DevicePermissionLevel
): boolean {
  if (!binding.isActive) {
    return false;
  }

  const levelOrder = {
    [DevicePermissionLevel.READ]: 1,
    [DevicePermissionLevel.WRITE]: 2,
    [DevicePermissionLevel.ADMIN]: 3,
  };

  return levelOrder[binding.permissionLevel] >= levelOrder[requiredLevel];
}

/**
 * 用户设备绑定查询过滤器
 */
export interface UserBindDeviceFilter {
  userId?: ObjectId;
  deviceMac?: string;
  isPrimary?: boolean;
  permissionLevel?: DevicePermissionLevel;
  isActive?: boolean;
}

/**
 * 构建查询条件
 *
 * @param filter - 查询过滤器
 * @returns MongoDB 查询条件
 */
export function buildUserBindDeviceQuery(
  filter: UserBindDeviceFilter
): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  if (filter.userId) {
    query.userId = filter.userId;
  }

  if (filter.deviceMac) {
    query.deviceMac = filter.deviceMac.toUpperCase();
  }

  if (filter.isPrimary !== undefined) {
    query.isPrimary = filter.isPrimary;
  }

  if (filter.permissionLevel) {
    query.permissionLevel = filter.permissionLevel;
  }

  if (filter.isActive !== undefined) {
    query.isActive = filter.isActive;
  }

  return query;
}

/**
 * 集合名称
 */
export const USER_BIND_DEVICE_COLLECTION = 'user_bind_devices';

/**
 * 集合索引
 */
export const USER_BIND_DEVICE_INDEXES = [
  // 唯一索引：用户 + 设备 MAC (一个用户只能绑定同一设备一次)
  {
    key: { userId: 1, deviceMac: 1 },
    name: 'idx_user_bind_device_user_mac',
    unique: true,
  },
  // 设备 MAC 索引 (查询设备的所有绑定用户)
  {
    key: { deviceMac: 1 },
    name: 'idx_user_bind_device_mac',
  },
  // 用户 + 活跃状态索引 (查询用户的活跃设备)
  {
    key: { userId: 1, isActive: 1 },
    name: 'idx_user_bind_device_user_active',
  },
  // 用户 + 主设备索引 (快速找到用户的主设备)
  {
    key: { userId: 1, isPrimary: 1 },
    name: 'idx_user_bind_device_user_primary',
  },
  // 绑定时间索引 (按时间排序)
  {
    key: { boundAt: -1 },
    name: 'idx_user_bind_device_bound_time',
  },
] as const;
