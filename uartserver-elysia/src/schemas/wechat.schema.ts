/**
 * WeChat API Schemas (Phase 8.4)
 *
 * 微信相关 API 的验证 schemas
 */

import { t } from 'elysia';

// ============================================================================
// 响应类型定义
// ============================================================================

/**
 * 微信二维码响应
 */
export interface WeChatQRCodeResponse {
  status: 'ok' | 'error';
  data: {
    ticket: string;
    url: string;
    expireSeconds: number;
  } | null;
  message?: string;
}

/**
 * 解绑微信响应
 */
export interface UnbindWeChatResponse {
  status: 'ok' | 'error';
  message?: string;
  data: {
    success: boolean;
  } | null;
}

/**
 * 生成二维码响应
 */
export interface GenerateQRCodeResponse {
  status: 'ok' | 'error';
  data: {
    qrcode: string; // base64 data URL
  } | null;
  message?: string;
}

// ============================================================================
// 请求参数 Schemas
// ============================================================================

/**
 * 生成二维码请求 schema
 */
export const GenerateQRCodeParamsSchema = t.Object({
  scene: t.String({
    minLength: 1,
    maxLength: 200,
    description: '二维码场景值',
  }),
});

export type GenerateQRCodeParams = typeof GenerateQRCodeParamsSchema.static;

/**
 * 生成二维码查询参数 schema
 */
export const GenerateQRCodeQuerySchema = t.Object({
  width: t.Optional(
    t.Number({
      minimum: 50,
      maximum: 1000,
      description: '二维码宽度（像素）',
    })
  ),
  margin: t.Optional(
    t.Number({
      minimum: 0,
      maximum: 10,
      description: '二维码边距',
    })
  ),
});

export type GenerateQRCodeQuery = typeof GenerateQRCodeQuerySchema.static;
