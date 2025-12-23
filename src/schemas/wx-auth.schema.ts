/**
 * 微信认证相关的 Zod schemas
 */

import { z } from 'zod';

/**
 * 微信小程序登录请求
 */
export const WxMiniLoginRequestSchema = z.object({
  data: z.object({
    code: z.string().min(1, '登录凭证不能为空'),
    appid: z.string().optional(),
  }),
});

/**
 * 微信小程序登录响应
 */
export interface WxMiniLoginResponse {
  user: {
    id: string;
    openid?: string;
    unionid?: string;
    nickname?: string;
    avatar_url?: string;
    binding_status: 'unbound' | 'bound' | 'expired';
  };
  systemUser?: {
    id: string;
    username: string;
    email?: string;
    displayName?: string;
    role: string;
    permissions: string[];
  };
  isNewUser: boolean;
  tokens?: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: string;
  };
}

/**
 * 绑定微信用户请求
 */
export const BindWxUserRequestSchema = z.object({
  data: z.object({
    wxUserId: z.string().min(1, '微信用户ID不能为空'),
    systemUserId: z.string().min(1, '系统用户ID不能为空'),
    verificationCode: z.string().optional(),
  }),
});

/**
 * 解绑微信用户请求
 */
export const UnbindWxUserRequestSchema = z.object({
  data: z.object({
    systemUserId: z.string().min(1, '系统用户ID不能为空'),
    verificationCode: z.string().optional(),
  }),
});

/**
 * 微信小程序登录请求类型 (从 schema 推导)
 */
export type WxMiniLoginRequest = {
  data: {
    code: string;
    appid?: string;
  };
};

/**
 * 微信用户绑定请求类型 (从 schema 推导)
 */
export type BindWxUserRequest = {
  data: {
    wxUserId: string;
    systemUserId: string;
    verificationCode?: string;
  };
};

/**
 * 微信用户解绑请求类型 (从 schema 推导)
 */
export type UnbindWxUserRequest = {
  data: {
    systemUserId: string;
    verificationCode?: string;
  };
};