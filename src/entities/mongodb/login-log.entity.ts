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
  FAILED_EXPIRED = 'failed_expired',
}

/**
 * 登录方式枚举
 */
export enum LoginMethod {
  PASSWORD = 'password',
  WX_MINI = 'wx_mini',
  WX_PUBLIC = 'wx_public',
  TOKEN_REFRESH = 'token_refresh',
  API_KEY = 'api_key',
}

/**
 * 登录日志文档接口
 */
export interface LoginLogDocument {
  _id: ObjectId;

  /** 用户 ID (登录成功时记录) */
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

  /** 设备信息 (解析自 User Agent) */
  device?: string;

  /** 地理位置 (可选，需要 IP 地理位置服务) */
  location?: string;

  /** 错误信息 (登录失败时记录) */
  errorMessage?: string;

  /** 登录时间 */
  createdAt: Date;
}

/**
 * 创建登录日志参数
 */
export interface CreateLoginLogParams {
  userId?: ObjectId;
  username: string;
  method: LoginMethod;
  result: LoginResult;
  ip: string;
  userAgent?: string;
  device?: string;
  location?: string;
  errorMessage?: string;
}

/**
 * 创建登录日志
 *
 * @param data - 登录日志数据
 * @returns 登录日志文档 (不含 _id)
 */
export function createLoginLog(
  data: CreateLoginLogParams
): Omit<LoginLogDocument, '_id'> {
  return {
    userId: data.userId,
    username: data.username,
    method: data.method,
    result: data.result,
    ip: data.ip,
    userAgent: data.userAgent,
    device: data.device,
    location: data.location,
    errorMessage: data.errorMessage,
    createdAt: new Date(),
  };
}

/**
 * 登录日志查询过滤器
 */
export interface LoginLogFilter {
  userId?: ObjectId;
  username?: string;
  method?: LoginMethod;
  result?: LoginResult;
  ip?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * 构建登录日志查询条件
 *
 * @param filter - 查询过滤器
 * @returns MongoDB 查询条件
 */
export function buildLoginLogQuery(filter: LoginLogFilter): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  if (filter.userId) {
    query.userId = filter.userId;
  }

  if (filter.username) {
    query.username = filter.username;
  }

  if (filter.method) {
    query.method = filter.method;
  }

  if (filter.result) {
    query.result = filter.result;
  }

  if (filter.ip) {
    query.ip = filter.ip;
  }

  if (filter.startDate || filter.endDate) {
    query.createdAt = {};
    if (filter.startDate) {
      (query.createdAt as Record<string, Date>).$gte = filter.startDate;
    }
    if (filter.endDate) {
      (query.createdAt as Record<string, Date>).$lte = filter.endDate;
    }
  }

  return query;
}

/**
 * 登录日志集合名称
 */
export const LOGIN_LOG_COLLECTION = 'login_logs';

/**
 * 登录日志集合索引
 */
export const LOGIN_LOG_INDEXES = [
  // 用户 + 时间复合索引 (查询用户登录历史)
  {
    key: { userId: 1, createdAt: -1 },
    name: 'idx_login_logs_user_time',
  },
  // 用户名 + 时间索引 (按用户名查询)
  {
    key: { username: 1, createdAt: -1 },
    name: 'idx_login_logs_username_time',
  },
  // IP + 时间索引 (安全分析：检测异常 IP)
  {
    key: { ip: 1, createdAt: -1 },
    name: 'idx_login_logs_ip_time',
  },
  // 登录结果 + 时间索引 (统计分析)
  {
    key: { result: 1, createdAt: -1 },
    name: 'idx_login_logs_result_time',
  },
  // TTL 索引：90 天自动过期
  {
    key: { createdAt: -1 },
    name: 'idx_login_logs_time_ttl',
    expireAfterSeconds: 90 * 24 * 60 * 60, // 90 天
  },
] as const;
