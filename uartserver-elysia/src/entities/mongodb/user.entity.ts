/**
 * 用户实体定义
 *
 * 兼容老系统数据结构，同时提供新的安全特性
 * 老系统使用 MySQL 表结构，新系统迁移到 MongoDB
 */

import { ObjectId } from 'mongodb';

/**
 * 用户角色枚举
 */
export enum UserRole {
  ADMIN = 'admin',     // 管理员
  USER = 'user',       // 普通用户
  GUEST = 'guest',     // 访客
}

/**
 * 权限常量
 */
export const PERMISSIONS = {
  // 设备权限
  DEVICE_READ: 'device:read',
  DEVICE_WRITE: 'device:write',
  DEVICE_CONTROL: 'device:control',
  DEVICE_DELETE: 'device:delete',

  // 用户管理权限
  USER_READ: 'user:read',
  USER_WRITE: 'user:write',
  USER_DELETE: 'user:delete',
  USER_ADMIN: 'user:admin',

  // 系统权限
  SYSTEM_CONFIG: 'system:config',
  SYSTEM_MONITOR: 'system:monitor',
  SYSTEM_LOG: 'system:log',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

/**
 * MongoDB 用户文档接口
 *
 * 设计原则:
 * 1. 兼容老系统字段
 * 2. 增加新的安全字段
 * 3. 支持细粒度权限控制
 * 4. 设备级权限隔离
 */
export interface UserDocument {
  /** MongoDB ObjectId */
  _id: ObjectId;

  // === 基础信息 (兼容老系统) ===
  /** 用户名 - 唯一 */
  username: string;

  /** 邮箱 - 唯一 */
  email: string;

  /** 显示名称 */
  displayName?: string;

  /** 手机号码 */
  phone?: string;

  /** 部门 */
  department?: string;

  // === 安全相关 (新增/增强) ===
  /** bcrypt 加密后的密码 */
  passwordHash: string;

  /** 用户角色 */
  role: UserRole;

  /** 权限列表 */
  permissions: Permission[];

  /** 可访问的设备 MAC 列表 */
  devices?: string[];

  // === 状态信息 (兼容老系统并增强) ===
  /** 账户是否激活 */
  isActive: boolean;

  /** 是否在线 */
  isOnline?: boolean;

  /** 最后登录时间 */
  lastLoginAt?: Date;

  /** 最后登录 IP */
  lastLoginIp?: string;

  // === 安全增强字段 (新增) ===
  session: {
    /** 最后登录设备信息 */
    userAgent?: string;

    /** 登录失败次数 */
    loginAttempts: number;

    /** 账户锁定时间 */
    lockedUntil?: Date;

    /** 刷新令牌 */
    refreshToken?: string;

    /** 密码修改时间 */
    passwordChangedAt?: Date;
  };

  // === 老系统兼容字段 ===
  /** 微信公众号 ID (老系统兼容: wpId) */
  wpId?: string;

  /** 微信小程序 ID (关联 wx_users 集合) */
  wxId?: string;

  /** 地址信息 (老系统兼容: address) */
  address?: string;

  /** 公司信息 (老系统兼容: company) */
  company?: string;

  /** 备注信息 (老系统兼容) */
  remark?: string;

  // === 审计字段 ===
  /** 创建时间 */
  createdAt: Date;

  /** 更新时间 */
  updatedAt: Date;

  /** 创建者用户ID */
  createdBy?: ObjectId;

  /** 更新者用户ID */
  updatedBy?: ObjectId;
}

/**
 * 创建新用户时的请求接口
 */
export interface CreateUserRequest {
  username: string;
  email: string;
  password: string;
  displayName?: string;
  phone?: string;
  department?: string;
  role?: UserRole;
  devices?: string[];
}

/**
 * 更新用户信息时的请求接口
 */
export interface UpdateUserRequest {
  email?: string;
  displayName?: string;
  phone?: string;
  department?: string;
  role?: UserRole;
  permissions?: Permission[];
  devices?: string[];
  isActive?: boolean;
  // 老系统兼容字段
  wpId?: string;
  wxId?: string;
  address?: string;
  company?: string;
  remark?: string;
}

/**
 * 用户登录请求接口
 */
export interface LoginRequest {
  username: string; // 可以是用户名或邮箱
  password: string;
  remember?: boolean; // 是否记住登录
}

/**
 * 修改密码请求接口
 */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/**
 * 重置密码请求接口 (管理员操作)
 */
export interface ResetPasswordRequest {
  userId: string;
  newPassword: string;
}

/**
 * JWT Token 载荷接口
 */
export interface JWTPayload {
  /** 用户 ID */
  sub: string;

  /** 用户名 */
  username: string;

  /** 用户角色 */
  role: UserRole;

  /** 权限列表 */
  permissions: Permission[];

  /** 可访问的设备列表 */
  devices?: string[];

  /** Token 类型 */
  type: 'access' | 'refresh';

  /** 签发时间 */
  iat: number;

  /** 过期时间 */
  exp: number;

  /** 发行者 */
  iss: string;
}

/**
 * 认证响应接口
 */
export interface AuthResponse {
  /** 用户信息 */
  user: {
    id: string;
    username: string;
    email: string;
    displayName?: string;
    role: UserRole;
    permissions: Permission[];
    devices?: string[];
    lastLoginAt?: Date;
  };

  /** Token 信息 */
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: 'Bearer';
  };
}

/**
 * 用户查询选项接口
 */
export interface UserQueryOptions {
  page?: number;
  limit?: number;
  role?: UserRole;
  department?: string;
  isActive?: boolean;
  search?: string; // 搜索用户名或邮箱
}

/**
 * 用户统计信息接口
 */
export interface UserStats {
  /** 总用户数 */
  total: number;

  /** 活跃用户数 */
  active: number;

  /** 在线用户数 */
  online: number;

  /** 按角色分组的用户数 */
  byRole: Partial<Record<UserRole, number>>;

  /** 按部门分组的用户数 */
  byDepartment: Record<string, number>;
}

/**
 * 默认权限配置
 */
export const DEFAULT_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.ADMIN]: Object.values(PERMISSIONS), // 管理员拥有所有权限
  [UserRole.USER]: [
    PERMISSIONS.DEVICE_READ,
    PERMISSIONS.DEVICE_WRITE,
    PERMISSIONS.DEVICE_CONTROL,
  ], // 普通用户可以查看和操作设备
  [UserRole.GUEST]: [
    PERMISSIONS.DEVICE_READ,
  ], // 访客只能查看设备
};

/**
 * 验证用户输入密码的复杂度
 */
export function validatePasswordStrength(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('密码长度至少8位');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('密码必须包含至少1个大写字母');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('密码必须包含至少1个小写字母');
  }

  if (!/\d/.test(password)) {
    errors.push('密码必须包含至少1个数字');
  }

  if (!/[@$!%*?&]/.test(password)) {
    errors.push('密码必须包含至少1个特殊字符(@$!%*?&)');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * 生成用户显示名称
 */
export function generateDisplayName(user: {
  username: string;
  displayName?: string;
}): string {
  return user.displayName || user.username;
}

/**
 * 检查用户是否有指定权限
 */
export function hasPermission(user: UserDocument, permission: Permission): boolean {
  return user.permissions.includes(permission);
}

/**
 * 检查用户是否可以访问指定设备
 */
export function canAccessDevice(user: UserDocument, deviceMac: string): boolean {
  // 管理员可以访问所有设备
  if (user.role === UserRole.ADMIN) {
    return true;
  }

  // 检查设备权限列表
  return user.devices?.includes(deviceMac) || false;
}

/**
 * 用户集合名称
 */
export const USER_COLLECTION = 'users';

/**
 * 用户集合索引配置
 */
export const USER_INDEXES = [
  // 唯一索引：用户名
  {
    key: { username: 1 },
    name: 'idx_users_username',
    unique: true,
  },
  // 唯一索引：邮箱
  {
    key: { email: 1 },
    name: 'idx_users_email',
    unique: true,
  },
  // 复合索引：角色 + 状态
  {
    key: { role: 1, isActive: 1 },
    name: 'idx_users_role_status',
  },
  // 索引：设备权限列表
  {
    key: { devices: 1 },
    name: 'idx_users_devices',
  },
  // 索引：最后登录时间
  {
    key: { lastLoginAt: -1 },
    name: 'idx_users_last_login',
  },
  // 索引：刷新令牌
  {
    key: { 'session.refreshToken': 1 },
    name: 'idx_users_refresh_token',
  },
  // TTL 索引：账户锁定时间自动过期
  {
    key: { 'session.lockedUntil': 1 },
    name: 'idx_users_locked_until',
    expireAfterSeconds: 0,
    sparse: true,
  },
  // 老系统兼容索引：微信 ID
  {
    key: { wxId: 1 },
    name: 'idx_users_wx_id',
    sparse: true,
  },
  // 老系统兼容索引：微信公众号 ID
  {
    key: { wpId: 1 },
    name: 'idx_users_wp_id',
    sparse: true,
  },
  // 老系统兼容索引：手机号
  {
    key: { phone: 1 },
    name: 'idx_users_phone',
    sparse: true,
  },
] as const;