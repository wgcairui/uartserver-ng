/**
 * 微信用户实体
 *
 * 对齐老系统的微信用户数据结构
 * 支持微信公众号和小程序用户管理
 */

import { ObjectId } from 'mongodb';

/**
 * 微信用户文档接口
 *
 * 对齐老系统的字段，保持兼容性
 */
export interface WxUserDocument {
  /** MongoDB ObjectId */
  _id: ObjectId;

  /** 微信小程序 AppID */
  appid?: string;

  /** 微信小程序 UnionID (用户唯一标识) */
  unionid?: string;

  /** 微信公众号 OpenID */
  openid?: string;

  /** 微信小程序 OpenID */
  miniapp_openid?: string;

  /** 微信小程序 Session Key */
  session_key?: string;

  /** 微信小程序 Session 过期时间 */
  session_expires_in?: number;

  /** 用户昵称 */
  nickname?: string;

  /** 用户头像 URL */
  avatar_url?: string;

  /** 用户性别 */
  gender?: number; // 0:未知, 1:男, 2:女

  /** 用户国家代码 */
  country?: string;

  /** 省份省份 */
  province?: string;

  /** 省份城市 */
  city?: string;

  /** 用户语言 */
  language?: string;

  /** 绑定的系统用户ID */
  system_user_id?: ObjectId;

  /** 绑定状态 */
  binding_status: 'unbound' | 'bound' | 'expired';

  /** 绑定时间 */
  bound_at?: Date;

  /** 最后活跃时间 */
  last_active_at?: Date;

  /** 创建时间 */
  created_at: Date;

  /** 更新时间 */
  updated_at: Date;

  /** 是否禁用 */
  is_disabled?: boolean;
}

/**
 * 微信小程序登录请求
 */
export interface WxMiniLoginRequest {
  /** 微信小程序登录凭证 */
  code: string;

  /** 微信小程序 AppID (可选，使用配置值) */
  appid?: string;
}

/**
 * 微信小程序登录响应
 */
export interface WxMiniLoginResponse {
  /** 微信用户的唯一标识 */
  openid: string;

  /** 用户会话密钥 */
  session_key: string;

  /** 会话过期时间 */
  expires_in: number;

  /** 用户在开放平台的唯一标识 */
  unionid?: string;

  /** 错误码 */
  errcode?: number;

  /** 错误信息 */
  errmsg?: string;
}

/**
 * 微信用户信息响应
 */
export interface WxUserInfoResponse {
  /** 用户唯一标识 */
  openid: string;

  /** 用户昵称 */
  nickname: string;

  /** 用户头像 */
  headimgurl?: string;

  /** 用户性别 */
  sex?: number;

  /** 用户国家 */
  country?: string;

  /** 用户省份 */
  province?: string;

  /** 用户城市 */
  city?: string;

  /** 用户语言 */
  language?: string;

  /** 用户特权 */
  privilege: string[];

  /** 水印信息 */
  watermark: {
    timestamp: number;
    appid: string;
  };
}

/**
 * 绑定微信用户请求
 */
export interface BindWxUserRequest {
  /** 微信 UnionID 或 OpenID */
  wx_user_id: string;

  /** 系统用户ID */
  system_user_id: string;

  /** 验证码 */
  verification_code?: string;
}

/**
 * 解绑微信用户请求
 */
export interface UnbindWxUserRequest {
  /** 系统用户ID */
  system_user_id: string;

  /** 验证码 */
  verification_code?: string;
}

/**
 * 微信用户状态枚举
 */
export enum WxUserBindingStatus {
  UNBOUND = 'unbound',    // 未绑定
  BOUND = 'bound',        // 已绑定
  EXPIRED = 'expired',     // 已过期
}

/**
 * 微信用户类型枚举
 */
export enum WxUserType {
  PUBLIC = 'public',      // 公众号用户
  MINIPROGRAM = 'miniprogram', // 小程序用户
  OPEN = 'open',          // 开放平台用户
}

/**
 * 创建微信用户文档
 *
 * @param data - 微信用户数据
 * @returns 微信用户文档
 */
export function createWxUser(data: Partial<WxUserDocument>): Omit<WxUserDocument, '_id'> {
  const now = new Date();

  return {
    appid: data.appid,
    unionid: data.unionid,
    openid: data.openid,
    miniapp_openid: data.miniapp_openid,
    session_key: data.session_key,
    session_expires_in: data.session_expires_in,
    nickname: data.nickname,
    avatar_url: data.avatar_url || data.headimgurl,
    gender: data.gender || data.sex,
    country: data.country,
    province: data.province,
    city: data.city,
    language: data.language,
    system_user_id: data.system_user_id,
    binding_status: WxUserBindingStatus.UNBOUND,
    bound_at: undefined,
    last_active_at: now,
    created_at: now,
    updated_at: now,
    is_disabled: false,
  };
}

/**
 * 验证微信小程序登录凭证
 *
 * @param code - 登录凭证
 * @param appid - 小程序 AppID
 * @returns 验证结果
 */
export async function validateWxMiniLoginCode(code: string, appid?: string): Promise<{
  valid: boolean;
  error?: string;
}> {
  if (!code) {
    return { valid: false, error: '登录凭证不能为空' };
  }

  if (code.length < 1 || code.length > 1024) {
    return { valid: false, error: '登录凭证格式错误' };
  }

  // TODO: 调用微信 API 验证 code
  // const result = await wxApi.code2Session(code, appid);
  // if (result.errcode !== 0) {
  //   return { valid: false, error: result.errmsg };
  // }

  return { valid: true };
}

/**
 * 获取微信用户显示名称
 *
 * @param user - 微信用户
 * @returns 显示名称
 */
export function getWxUserDisplayName(user: WxUserDocument): string {
  return user.nickname || '微信用户';
}

/**
 * 检查微信用户是否已绑定系统账号
 *
 * @param user - 微信用户
 * @returns 是否已绑定
 */
export function isWxUserBound(user: WxUserDocument): boolean {
  return user.binding_status === WxUserBindingStatus.BOUND &&
         user.system_user_id !== undefined;
}

/**
 * 绑定微信用户到系统账号
 *
 * @param wxUser - 微信用户
 * @param systemUserId - 系统用户ID
 * @returns 绑定结果
 */
export function bindWxUserToSystem(
  wxUser: WxUserDocument,
  systemUserId: ObjectId
): Partial<WxUserDocument> {
  return {
    system_user_id: systemUserId,
    binding_status: WxUserBindingStatus.BOUND,
    bound_at: new Date(),
    updated_at: new Date(),
  };
}

/**
 * 解绑微信用户
 *
 * @param wxUser - 微信用户
 * @returns 解绑结果
 */
export function unbindWxUser(wxUser: WxUserDocument): Partial<WxUserDocument> {
  return {
    system_user_id: undefined,
    binding_status: WxUserBindingStatus.UNBOUND,
    bound_at: undefined,
    updated_at: new Date(),
  };
}

/**
 * 微信用户集合名称
 */
export const WX_USER_COLLECTION = 'wx_users';

/**
 * 微信用户集合索引配置
 */
export const WX_USER_INDEXES = [
  // 唯一索引：UnionID + AppID
  {
    key: { unionid: 1, appid: 1 },
    name: 'idx_wx_users_unionid_appid',
    unique: true,
  },

  // 唯一索引：OpenID + AppID
  {
    key: { openid: 1, appid: 1 },
    name: 'idx_wx_users_openid_appid',
    unique: true,
    sparse: true,
  },

  // 索引：系统用户ID
  {
    key: { system_user_id: 1 },
    name: 'idx_wx_users_system_user_id',
    sparse: true,
  },

  // 索引：绑定状态
  {
    key: { binding_status: 1 },
    name: 'idx_wx_users_binding_status',
  },

  // 索引：创建时间
  {
    key: { created_at: -1 },
    name: 'idx_wx_users_created_at',
  },

  // 索引：最后活跃时间
  {
    key: { last_active_at: -1 },
    name: 'idx_wx_users_last_active',
  },
] as const;

/**
 * 微信用户类型定义
 */
export type WxUserType = 'public' | 'miniprogram' | 'open';