# Phase 4.1: 用户认证与授权 - 详细实施文档

> **版本**: 2.1 (Review 后更新)
> **更新日期**: 2025-12-23
> **状态**: 实施中 (已完成 ~70%)
> **预计剩余工时**: 10-12 小时

---

## 目录

1. [当前完成度分析](#1-当前完成度分析)
2. [新旧系统对比](#2-新旧系统对比)
3. [详细实施步骤](#3-详细实施步骤)
4. [执行计划](#4-执行计划)
5. [验收标准](#5-验收标准)
6. [附录：老系统参考](#6-附录老系统参考)

---

## 1. 当前完成度分析

### 1.1 已完成模块 (~60%)

| 模块 | 文件路径 | 状态 | 说明 |
|------|----------|------|------|
| User 实体 | `src/entities/mongodb/user.entity.ts` | ✅ 完成 | 角色、权限、会话管理完整 |
| WxUser 实体 | `src/entities/mongodb/wx-user.entity.ts` | ✅ 完成 | 微信用户绑定状态管理 |
| JWT 工具 | `src/utils/jwt.ts` | ✅ 完成 | Token 生成/验证/刷新 |
| Bcrypt 工具 | `src/utils/bcrypt.ts` | ✅ 完成 | 密码哈希/验证/强度检查 |
| Auth 中间件 | `src/middleware/auth.ts` | ✅ 完成 | 认证/权限/装饰器 |
| Auth Schema | `src/schemas/auth.schema.ts` | ✅ 完成 | Zod 验证完整 |
| Auth Controller | `src/controllers/auth.controller.ts` | ✅ 完成 | 登录/注册/刷新/微信 |
| User Controller | `src/controllers/user.controller.ts` | ✅ 完成 | CRUD/统计/密码重置 |
| WxAuth Service | `src/services/wx-auth.service.ts` | ⚠️ 有BUG | 第 401 行语法错误 |
| 集合注册 | `src/entities/mongodb/index.ts` | ✅ 完成 | Phase3Collections 已集成 |

### 1.2 待完成模块 (~30%)

> **2025-12-23 Review 更新**: 经代码审查，部分模块已实现

| 模块 | 文件路径 | 优先级 | 状态 | 工时 |
|------|----------|--------|------|------|
| WxAuth Schema | `src/schemas/wx-auth.schema.ts` | P0 | ✅ **已完成** | - |
| WxAuth Service 修复 | `src/services/wx-auth.service.ts` | P0 | ❌ **待修复** | 0.5h |
| User Service | `src/services/user.service.ts` | P0 | ❌ 待创建 | 3h |
| 控制器注册 | `src/app.ts` | P0 | ✅ **已完成** | - |
| 全局认证 Hooks | `src/app.ts` | P0 | ✅ **已完成** | - |
| 登录日志实体 | `src/entities/mongodb/login-log.entity.ts` | P1 | ❌ 待创建 | 2h |
| 设备绑定实体 | `src/entities/mongodb/user-bind-device.entity.ts` | P1 | ❌ 待创建 | 2h |
| 老系统兼容字段 | `src/entities/mongodb/user.entity.ts` | P2 | ❌ 待添加 | 1h |
| 路由配置 | `src/utils/auth-routes.ts` | P2 | ✅ **已完成** | - |
| MongoDB 索引注册 | `src/entities/mongodb/index.ts` | P2 | ❌ 待更新 | 0.5h |
| 单元测试 | `src/__tests__/auth.test.ts` | P2 | ❌ 待创建 | 3h |

**剩余工时合计**: 0.5 + 3 + 2 + 2 + 1 + 0.5 + 3 = **12 小时**

---

## 2. 新旧系统对比

### 2.1 用户实体字段映射

**老系统文件**: `midwayuartserver/src/mongo_entity/user.ts`

| 老系统字段 | 新系统字段 | 映射状态 | 说明 |
|-----------|-----------|----------|------|
| `userId` | `_id` (ObjectId) | ✅ 已映射 | MongoDB 原生 ID |
| `user` | `username` | ✅ 已映射 | 用户名 |
| `passwd` | `passwordHash` | ✅ 已映射 | bcrypt 哈希 |
| `userGroup` | `role` | ✅ 已映射 | admin/user/guest |
| `tel` | `phone` | ✅ 已映射 | 电话号码 |
| `mail` | `email` | ✅ 已映射 | 邮箱地址 |
| `wxId` | `wxId` | ✅ 已映射 | 微信 UnionID |
| `wpId` | `wpId` | ❌ **缺失** | 需要添加 |
| `openId` | - | ⚠️ 通过 WxUser | 关联查询 |
| `address` | `address` | ❌ **缺失** | 需要添加 |
| `company` | `company` | ❌ **缺失** | 需要添加 |
| `modifyTime` | `updatedAt` | ✅ 已映射 | 更新时间 |
| `createTime` | `createdAt` | ✅ 已映射 | 创建时间 |

### 2.2 JWT 配置对比

| 配置项 | 老系统 | 新系统 | 差异 |
|--------|--------|--------|------|
| Secret | `ladisWebSite` (硬编码) | 环境变量 `JWT_SECRET` | **更安全** |
| Access Token 有效期 | 5 小时 | 15 分钟 | **更短更安全** |
| Refresh Token | 无 | 7 天 | **新增功能** |
| 算法 | HS256 | HS256 | 相同 |

### 2.3 认证流程对比

```
老系统 (midwayuartserver):
┌─────────┐    ┌──────────────┐    ┌─────────────────┐
│  Login  │ -> │ BcryptCompare│ -> │ Secret_JwtSign  │ -> Token (5h)
└─────────┘    └──────────────┘    └─────────────────┘

新系统 (uartserver-ng):
┌─────────┐    ┌───────────────┐    ┌─────────────────────────────┐
│  Login  │ -> │ verifyPassword│ -> │ generateAccessToken (15min) │
└─────────┘    └───────────────┘    │ generateRefreshToken (7d)   │
                                    └─────────────────────────────┘
                                              │
                                              v
                                    支持静默刷新 + Token 黑名单
```

---

## 3. 详细实施步骤

### Step 1: 创建 WxAuth Schema

**文件**: `src/schemas/wx-auth.schema.ts`
**操作**: 新建文件
**优先级**: P0
**工时**: 1 小时

```typescript
/**
 * 微信认证 Schema
 *
 * 微信小程序和公众号认证相关的 Zod 验证
 * 对齐老系统: midwayuartserver/src/controller/auth.controller.ts
 */

import { z } from 'zod';

/**
 * 微信小程序登录请求
 * 对应老系统: /login/wxlogin 接口
 */
export const WxMiniLoginRequestSchema = z.object({
  /** 微信小程序登录凭证 code */
  code: z.string().min(1, '登录凭证不能为空').max(1024, '登录凭证格式错误'),
  /** 微信小程序 AppID (可选，默认使用配置) */
  appid: z.string().optional(),
});

export type WxMiniLoginRequest = z.infer<typeof WxMiniLoginRequestSchema>;

/**
 * 微信用户绑定请求
 */
export const BindWxUserRequestSchema = z.object({
  /** 微信用户 ID (MongoDB ObjectId) */
  wxUserId: z.string().regex(/^[0-9a-fA-F]{24}$/, '无效的微信用户 ID'),
  /** 系统用户 ID (MongoDB ObjectId) */
  systemUserId: z.string().regex(/^[0-9a-fA-F]{24}$/, '无效的系统用户 ID'),
  /** 验证码 (可选) */
  verificationCode: z.string().optional(),
});

export type BindWxUserRequest = z.infer<typeof BindWxUserRequestSchema>;

/**
 * 微信用户解绑请求
 */
export const UnbindWxUserRequestSchema = z.object({
  /** 微信用户 ID (MongoDB ObjectId) */
  wxUserId: z.string().regex(/^[0-9a-fA-F]{24}$/, '无效的微信用户 ID'),
  /** 验证码 (可选) */
  verificationCode: z.string().optional(),
});

export type UnbindWxUserRequest = z.infer<typeof UnbindWxUserRequestSchema>;

/**
 * 查询微信用户请求
 */
export const GetWxUserQuerySchema = z.object({
  /** 按 UnionID 查询 */
  unionid: z.string().optional(),
  /** 按 OpenID 查询 */
  openid: z.string().optional(),
  /** 按系统用户 ID 查询 */
  systemUserId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  /** 按 AppID 过滤 */
  appid: z.string().optional(),
}).refine(
  (data) => data.unionid || data.openid || data.systemUserId,
  { message: '必须提供 unionid、openid 或 systemUserId 之一' }
);

export type GetWxUserQuery = z.infer<typeof GetWxUserQuerySchema>;

/**
 * 微信用户统计响应
 */
export const WxUserStatsResponseSchema = z.object({
  /** 总用户数 */
  total: z.number(),
  /** 已绑定用户数 */
  bound: z.number(),
  /** 未绑定用户数 */
  unbound: z.number(),
  /** 已过期用户数 */
  expired: z.number(),
  /** 活跃用户数 (7天内) */
  active: z.number(),
});

export type WxUserStatsResponse = z.infer<typeof WxUserStatsResponseSchema>;
```

---

### Step 2: 修复 WxAuth Service 语法错误

**文件**: `src/services/wx-auth.service.ts`
**操作**: 修改第 399-405 行
**优先级**: P0
**工时**: 0.5 小时

**问题描述**: `const` 语句错误地放在 `Promise.all` 数组内部

**修改前** (第 399-405 行):
```typescript
const [
  totalStats,
  bindingStats,
  activeStats,
] = await Promise.all([
  this.collections.wxUsers.countDocuments(),
  this.collections.wxUsers.aggregate([...]).toArray(),
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);  // ❌ 语法错误
  this.collections.wxUsers.countDocuments({
    last_active_at: { $gte: sevenDaysAgo },
  }),
]);
```

**修改后**:
```typescript
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);  // ✅ 移到外面

const [
  totalStats,
  bindingStats,
  activeStats,
] = await Promise.all([
  // 总数统计
  this.collections.wxUsers.countDocuments(),

  // 绑定状态统计
  this.collections.wxUsers.aggregate([
    {
      $group: {
        _id: '$binding_status',
        count: { $sum: 1 },
      },
    },
  ]).toArray(),

  // 活跃用户统计 (7天内活跃)
  this.collections.wxUsers.countDocuments({
    last_active_at: { $gte: sevenDaysAgo },
  }),
]);
```

---

### Step 3: 创建 User Service

**文件**: `src/services/user.service.ts`
**操作**: 新建文件
**优先级**: P0
**工时**: 3 小时
**参考老系统**: `midwayuartserver/src/service/user.sevice.ts`

```typescript
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
  createUser,
} from '../entities/mongodb/user.entity';
import { hashPassword, verifyPassword } from '../utils/bcrypt';
import { ObjectId, Filter } from 'mongodb';

/**
 * 用户查询过滤器
 */
export interface UserFilter {
  role?: UserRole;
  isActive?: boolean;
  search?: string;
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
 * 用户服务类
 */
export class UserService {
  private collections: Phase3Collections;

  constructor() {
    this.collections = new Phase3Collections(mongodb.getDatabase());
  }

  /**
   * 根据 ID 获取用户
   */
  async getUserById(id: string): Promise<UserDocument | null> {
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
    if (/^[0-9a-fA-F]{24}$/.test(idOrTel)) {
      const user = await this.getUserById(idOrTel);
      if (user) return user;
    }

    // 尝试作为手机号
    return this.getUserByPhone(idOrTel);
  }

  /**
   * 创建用户
   */
  async createUser(data: {
    username: string;
    password: string;
    email?: string;
    phone?: string;
    role?: UserRole;
    displayName?: string;
  }): Promise<UserDocument> {
    // 检查用户名是否已存在
    const existing = await this.getUserByUsername(data.username);
    if (existing) {
      throw new Error('用户名已存在');
    }

    // 检查邮箱是否已存在
    if (data.email) {
      const existingEmail = await this.getUserByEmail(data.email);
      if (existingEmail) {
        throw new Error('邮箱已被使用');
      }
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

    // 创建用户文档
    const userDoc = createUser({
      username: data.username,
      passwordHash,
      email: data.email,
      phone: data.phone,
      role: data.role || UserRole.USER,
      displayName: data.displayName,
    });

    // 插入数据库
    const result = await this.collections.users.insertOne(userDoc as any);

    return {
      _id: result.insertedId,
      ...userDoc,
    };
  }

  /**
   * 更新用户
   */
  async updateUser(
    id: string,
    data: Partial<Pick<UserDocument, 'email' | 'phone' | 'displayName' | 'avatar' | 'role' | 'isActive'>>
  ): Promise<UserDocument | null> {
    const objectId = new ObjectId(id);

    const updateData = {
      ...data,
      updatedAt: new Date(),
    };

    await this.collections.users.updateOne(
      { _id: objectId },
      { $set: updateData }
    );

    return this.getUserById(id);
  }

  /**
   * 更新密码
   */
  async updatePassword(id: string, newPassword: string): Promise<boolean> {
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
  async getUserStats(): Promise<{
    total: number;
    active: number;
    byRole: Record<string, number>;
  }> {
    const [total, active, roleStats] = await Promise.all([
      this.collections.users.countDocuments(),
      this.collections.users.countDocuments({ isActive: true }),
      this.collections.users.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ]).toArray(),
    ]);

    const byRole = roleStats.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {} as Record<string, number>);

    return { total, active, byRole };
  }

  /**
   * 更新用户最后登录时间
   */
  async updateLastLogin(id: string): Promise<void> {
    await this.collections.users.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );
  }

  /**
   * 根据微信 ID 查找用户
   * 兼容老系统: getUserBindWx
   */
  async getUserByWxId(wxId: string): Promise<UserDocument | null> {
    return this.collections.users.findOne({ wxId });
  }

  /**
   * 绑定微信 ID
   */
  async bindWxId(userId: string, wxId: string): Promise<boolean> {
    const result = await this.collections.users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          wxId,
          updatedAt: new Date(),
        },
      }
    );

    return result.modifiedCount > 0;
  }

  /**
   * 解绑微信 ID
   */
  async unbindWxId(userId: string): Promise<boolean> {
    const result = await this.collections.users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $unset: { wxId: '' },
        $set: { updatedAt: new Date() },
      }
    );

    return result.modifiedCount > 0;
  }
}

// 单例导出
export const userService = new UserService();
```

---

### Step 4: 注册控制器到 app.ts

**文件**: `src/app.ts`
**操作**: 修改现有文件
**优先级**: P0
**工时**: 1 小时

**需要添加的导入**:
```typescript
// 在文件顶部添加导入
import { AuthController } from './controllers/auth.controller';
import { UserController } from './controllers/user.controller';
```

**需要修改的注册代码**:
```typescript
// 在 registerControllers 调用中添加
registerControllers(app, [
  // ... 现有控制器 ...
  AuthController,
  UserController,
]);
```

---

### Step 5: 添加全局认证中间件 Hooks

**文件**: `src/app.ts`
**操作**: 在路由注册前添加 Hooks
**优先级**: P0
**工时**: 2 小时

```typescript
import { authMiddleware } from './middleware/auth';

// 公开路由列表 (无需认证)
const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/wx/',
  '/health',
  '/api/docs',
];

// 在路由注册之前添加全局认证 Hook
app.addHook('onRequest', async (request, reply) => {
  // 跳过 OPTIONS 请求
  if (request.method === 'OPTIONS') {
    return;
  }

  // 检查是否为公开路由
  const isPublic = PUBLIC_ROUTES.some(path =>
    request.url.startsWith(path)
  );

  if (isPublic) {
    return;
  }

  // 应用认证中间件
  try {
    await authMiddleware(request, reply);
  } catch (error) {
    // 认证失败由中间件处理
  }
});
```

---

### Step 6: 创建登录日志实体

**文件**: `src/entities/mongodb/login-log.entity.ts`
**操作**: 新建文件
**优先级**: P1
**工时**: 2 小时
**参考老系统**: 老系统无此功能，为新增安全特性

```typescript
/**
 * 登录日志实体
 *
 * 记录用户登录历史，用于安全审计
 * 新增安全特性，老系统无此功能
 */

import { ObjectId } from 'mongodb';

/**
 * 登录结果枚举
 */
export enum LoginResult {
  SUCCESS = 'success',
  FAILED_PASSWORD = 'failed_password',
  FAILED_USER_NOT_FOUND = 'failed_user_not_found',
  FAILED_DISABLED = 'failed_disabled',
  FAILED_LOCKED = 'failed_locked',
}

/**
 * 登录方式枚举
 */
export enum LoginMethod {
  PASSWORD = 'password',
  WX_MINI = 'wx_mini',
  WX_PUBLIC = 'wx_public',
  TOKEN_REFRESH = 'token_refresh',
}

/**
 * 登录日志文档接口
 */
export interface LoginLogDocument {
  _id: ObjectId;
  /** 用户 ID */
  userId?: ObjectId;
  /** 用户名 */
  username: string;
  /** 登录方式 */
  method: LoginMethod;
  /** 登录结果 */
  result: LoginResult;
  /** IP 地址 */
  ip: string;
  /** User Agent */
  userAgent?: string;
  /** 设备信息 */
  device?: string;
  /** 地理位置 */
  location?: string;
  /** 错误信息 */
  errorMessage?: string;
  /** 登录时间 */
  createdAt: Date;
}

/**
 * 创建登录日志
 */
export function createLoginLog(
  data: Omit<LoginLogDocument, '_id' | 'createdAt'>
): Omit<LoginLogDocument, '_id'> {
  return {
    ...data,
    createdAt: new Date(),
  };
}

/**
 * 登录日志集合名称
 */
export const LOGIN_LOG_COLLECTION = 'login_logs';

/**
 * 登录日志集合索引
 */
export const LOGIN_LOG_INDEXES = [
  {
    key: { userId: 1, createdAt: -1 },
    name: 'idx_login_logs_user_time',
  },
  {
    key: { username: 1, createdAt: -1 },
    name: 'idx_login_logs_username_time',
  },
  {
    key: { ip: 1, createdAt: -1 },
    name: 'idx_login_logs_ip_time',
  },
  {
    key: { createdAt: -1 },
    name: 'idx_login_logs_time',
    expireAfterSeconds: 90 * 24 * 60 * 60, // 90 天自动过期
  },
] as const;

// 导出类型
export type { LoginLogDocument };
```

---

### Step 7: 创建用户设备绑定实体

**文件**: `src/entities/mongodb/user-bind-device.entity.ts`
**操作**: 新建文件
**优先级**: P1
**工时**: 2 小时
**参考老系统**: `midwayuartserver/src/mongo_entity/userBindDevice.ts`

```typescript
/**
 * 用户设备绑定实体
 *
 * 对齐老系统: midwayuartserver/src/mongo_entity/userBindDevice.ts
 * 记录用户与 DTU 设备的绑定关系
 */

import { ObjectId } from 'mongodb';

/**
 * 用户设备绑定文档接口
 */
export interface UserBindDeviceDocument {
  _id: ObjectId;
  /** 用户 ID */
  userId: ObjectId;
  /** 设备 MAC 地址 */
  deviceMac: string;
  /** 设备名称 (用户自定义) */
  deviceName?: string;
  /** 绑定时间 */
  boundAt: Date;
  /** 是否为主设备 */
  isPrimary: boolean;
  /** 设备权限级别 */
  permissionLevel: 'read' | 'write' | 'admin';
  /** 是否启用 */
  isActive: boolean;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
}

/**
 * 创建用户设备绑定
 */
export function createUserBindDevice(data: {
  userId: ObjectId;
  deviceMac: string;
  deviceName?: string;
  isPrimary?: boolean;
  permissionLevel?: 'read' | 'write' | 'admin';
}): Omit<UserBindDeviceDocument, '_id'> {
  const now = new Date();
  return {
    userId: data.userId,
    deviceMac: data.deviceMac,
    deviceName: data.deviceName,
    boundAt: now,
    isPrimary: data.isPrimary ?? false,
    permissionLevel: data.permissionLevel ?? 'read',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 集合名称
 */
export const USER_BIND_DEVICE_COLLECTION = 'user_bind_devices';

/**
 * 集合索引
 */
export const USER_BIND_DEVICE_INDEXES = [
  {
    key: { userId: 1, deviceMac: 1 },
    name: 'idx_user_bind_device_user_mac',
    unique: true,
  },
  {
    key: { deviceMac: 1 },
    name: 'idx_user_bind_device_mac',
  },
  {
    key: { userId: 1, isActive: 1 },
    name: 'idx_user_bind_device_user_active',
  },
] as const;
```

---

### Step 8: 添加老系统兼容字段

**文件**: `src/entities/mongodb/user.entity.ts`
**操作**: 修改现有文件
**优先级**: P2
**工时**: 1 小时

**在 `UserDocument` 接口中添加字段**:
```typescript
export interface UserDocument {
  // ... 现有字段保持不变 ...

  /** 微信公众号 ID (老系统兼容: wpId) */
  wpId?: string;

  /** 地址信息 (老系统兼容: address) */
  address?: string;

  /** 公司信息 (老系统兼容: company) */
  company?: string;

  /** 备注信息 (老系统兼容) */
  remark?: string;
}
```

**在 `createUser` 函数中添加字段初始化**:
```typescript
export function createUser(data: Partial<UserDocument>): Omit<UserDocument, '_id'> {
  const now = new Date();
  return {
    // ... 现有字段 ...
    wpId: data.wpId,
    address: data.address,
    company: data.company,
    remark: data.remark,
  };
}
```

---

### Step 9: 更新 MongoDB Index 注册

**文件**: `src/entities/mongodb/index.ts`
**操作**: 修改现有文件
**优先级**: P2
**工时**: 1 小时

**添加导入**:
```typescript
// 添加新实体导入
import {
  LOGIN_LOG_COLLECTION,
  LOGIN_LOG_INDEXES,
  type LoginLogDocument,
} from './login-log.entity';

import {
  USER_BIND_DEVICE_COLLECTION,
  USER_BIND_DEVICE_INDEXES,
  type UserBindDeviceDocument,
} from './user-bind-device.entity';

// 添加导出
export * from './login-log.entity';
export * from './user-bind-device.entity';
```

**在 `PHASE3_COLLECTIONS` 数组中添加**:
```typescript
export const PHASE3_COLLECTIONS: CollectionConfig[] = [
  // ... 现有配置 ...
  {
    name: LOGIN_LOG_COLLECTION,
    indexes: LOGIN_LOG_INDEXES as unknown as IndexDescription[],
  },
  {
    name: USER_BIND_DEVICE_COLLECTION,
    indexes: USER_BIND_DEVICE_INDEXES as unknown as IndexDescription[],
  },
];
```

**在 `Phase3Collections` 类中添加 getter**:
```typescript
export class Phase3Collections {
  // ... 现有 getters ...

  get loginLogs() {
    return this.db.collection<LoginLogDocument>(LOGIN_LOG_COLLECTION);
  }

  get userBindDevices() {
    return this.db.collection<UserBindDeviceDocument>(USER_BIND_DEVICE_COLLECTION);
  }
}
```

---

### Step 10: 创建路由配置文件

**文件**: `src/utils/auth-routes.ts`
**操作**: 新建文件
**优先级**: P2
**工时**: 1 小时

```typescript
/**
 * 认证路由配置
 *
 * 定义公开路由和受保护路由
 */

/**
 * 公开路由列表 (无需认证)
 */
export const PUBLIC_ROUTES = [
  // 认证相关
  'POST /api/auth/login',
  'POST /api/auth/register',
  'POST /api/auth/refresh',
  'POST /api/auth/wx/mini-login',

  // 健康检查
  'GET /health',
  'GET /api/health',

  // API 文档
  'GET /api/docs',
  'GET /api/docs/*',
] as const;

/**
 * 管理员路由列表
 */
export const ADMIN_ROUTES = [
  'GET /api/users',
  'DELETE /api/users/:id',
  'PUT /api/users/:id/role',
  'GET /api/users/stats',
  'GET /api/wx-users/stats',
] as const;

/**
 * 检查路由是否为公开路由
 */
export function isPublicRoute(method: string, path: string): boolean {
  const route = `${method.toUpperCase()} ${path}`;

  return PUBLIC_ROUTES.some(publicRoute => {
    // 处理通配符
    if (publicRoute.endsWith('/*')) {
      const prefix = publicRoute.slice(0, -1);
      return route.startsWith(prefix);
    }
    return route === publicRoute;
  });
}

/**
 * 检查路由是否需要管理员权限
 */
export function isAdminRoute(method: string, path: string): boolean {
  const route = `${method.toUpperCase()} ${path}`;

  return ADMIN_ROUTES.some(adminRoute => {
    // 处理路径参数
    const pattern = adminRoute.replace(/:[\w]+/g, '[^/]+');
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(route);
  });
}
```

---

### Step 11: 创建认证测试

**文件**: `src/__tests__/auth.test.ts`
**操作**: 新建文件
**优先级**: P2
**工时**: 3 小时

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../utils/bcrypt';
import { generateAccessToken, generateRefreshToken, verifyAccessToken } from '../utils/jwt';

describe('Authentication Utils', () => {
  describe('Password Hashing', () => {
    it('should hash password correctly', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);

      expect(hash).not.toBe(password);
      expect(hash.startsWith('$2')).toBe(true);
    });

    it('should verify correct password', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('should reject wrong password', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword('wrongPassword', hash);

      expect(isValid).toBe(false);
    });

    it('should validate password strength', () => {
      const weakResult = validatePasswordStrength('123');
      expect(weakResult.isValid).toBe(false);

      const strongResult = validatePasswordStrength('StrongPass123!');
      expect(strongResult.isValid).toBe(true);
    });
  });

  describe('JWT Tokens', () => {
    const testPayload = {
      userId: '507f1f77bcf86cd799439011',
      username: 'testuser',
      role: 'user',
    };

    it('should generate access token', () => {
      const token = generateAccessToken(testPayload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWT has 3 parts
    });

    it('should verify valid access token', () => {
      const token = generateAccessToken(testPayload);
      const decoded = verifyAccessToken(token);

      expect(decoded.userId).toBe(testPayload.userId);
      expect(decoded.username).toBe(testPayload.username);
      expect(decoded.role).toBe(testPayload.role);
    });

    it('should generate refresh token', () => {
      const token = generateRefreshToken(testPayload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    it('should reject invalid token', () => {
      expect(() => {
        verifyAccessToken('invalid.token.here');
      }).toThrow();
    });
  });
});
```

---

## 4. 执行计划

> **2025-12-23 Review 更新**: 根据代码审查结果调整

### 已完成 ✅

| Step | 任务 | 完成方式 |
|------|------|----------|
| Step 1 | 创建 `wx-auth.schema.ts` | 文件已存在 |
| Step 4 | 注册控制器到 `app.ts` | `app.ts:227` 已注册 |
| Step 5 | 添加全局认证中间件 | `app.ts:230` 已调用 `setupAuthMiddleware` |
| Step 10 | 创建路由配置 | `auth-routes.ts` 已实现 |

### Day 1: 紧急修复 (3.5h)

- [ ] **Step 2**: 修复 `wx-auth.service.ts` 语法错误 (0.5h)
  - 位置: 第 401 行
  - 问题: `const` 语句在 `Promise.all` 数组内部
- [ ] **Step 3**: 创建 `user.service.ts` (3h)
  - 参考: `midwayuartserver/src/service/user.sevice.ts`

### Day 2: 扩展实体 (5h)

- [ ] **Step 6**: 创建登录日志实体 (2h)
- [ ] **Step 7**: 创建用户设备绑定实体 (2h)
- [ ] **Step 8**: 添加老系统兼容字段 (1h)
  - 添加: `wpId`, `address`, `company`, `remark`

### Day 3: 索引与测试 (3.5h)

- [ ] **Step 9**: 更新 MongoDB Index 注册 (0.5h)
  - 添加 `loginLogs` 和 `userBindDevices` getter
- [ ] **Step 11**: 创建认证测试 (3h)

### 工时汇总

| 阶段 | 工时 | 累计 |
|------|------|------|
| Day 1 紧急修复 | 3.5h | 3.5h |
| Day 2 扩展实体 | 5h | 8.5h |
| Day 3 索引与测试 | 3.5h | **12h** |

---

## 5. 验收标准

### 5.1 功能验收

| 功能 | 验收条件 | 状态 |
|------|----------|------|
| 用户注册 | 用户名/邮箱/手机号唯一性检查通过 | ⬜ |
| 用户登录 | 返回 Access Token + Refresh Token | ⬜ |
| Token 刷新 | Refresh Token 可正常刷新 Access Token | ⬜ |
| 微信登录 | code2Session 调用成功 | ⬜ |
| 权限控制 | 管理员路由仅管理员可访问 | ⬜ |
| 登录日志 | 登录行为正确记录 | ⬜ |

### 5.2 技术验收

- [ ] TypeScript 类型检查通过: `npx tsc --noEmit`
- [ ] ESLint 检查通过: `npm run lint`
- [ ] 单元测试通过: `npm test`
- [ ] API 响应格式符合规范: `{ status, message, data }`
- [ ] 所有 Schema 使用 Zod 验证

---

## 6. 附录：老系统参考

### 6.1 关键文件路径

| 功能 | 老系统路径 | 说明 |
|------|-----------|------|
| 用户实体 | `midwayuartserver/src/mongo_entity/user.ts` | 用户字段定义 |
| 认证控制器 | `midwayuartserver/src/controller/auth.controller.ts` | 登录/注册接口 |
| JWT 工具 | `midwayuartserver/src/util/util.ts` | Secret_JwtSign, BcryptDo |
| 认证中间件 | `midwayuartserver/src/middleware/userValidation.middleware.ts` | Token 验证 |
| 权限守卫 | `midwayuartserver/src/guard/auth.guard.ts` | 角色权限检查 |
| 用户服务 | `midwayuartserver/src/service/user.sevice.ts` | 用户业务逻辑 |

### 6.2 老系统 JWT 配置

```typescript
// 来源: midwayuartserver/src/util/util.ts
const tokenExpiresTime = 1000 * 60 * 60 * 5; // 5 小时
const secret = 'ladisWebSite';  // 硬编码密钥

export function Secret_JwtSign(payload, options) {
  return jwt.sign(payload, secret, {
    expiresIn: options?.expiresIn || tokenExpiresTime,
    ...options,
  });
}
```

### 6.3 老系统密码处理

```typescript
// 来源: midwayuartserver/src/util/util.ts
export function BcryptDo(passwd): Promise<string> {
  return bcrypt.hash(passwd, 12); // 12 轮加盐
}

export function BcryptCompare(passwd, hash): Promise<boolean> {
  return bcrypt.compare(passwd, hash);
}
```

---

**文档版本**: 2.1
**最后更新**: 2025-12-23
**作者**: Claude Code
**Review**: 已完成代码审查，调整实际完成状态
