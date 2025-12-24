/**
 * SMS Verification Schemas (Phase 8.5)
 *
 * 短信验证 API 的验证 schemas
 */

import { t } from 'elysia';

// ============================================================================
// 响应类型定义
// ============================================================================

/**
 * 发送验证码响应
 */
export interface SendSMSCodeResponse {
  status: 'ok' | 'error';
  data: {
    message: string; // 提示信息 (如: "手机号:138***7890")
    expiresIn: number; // 验证码有效期(秒), 默认300秒
  } | null;
  message?: string;
}

/**
 * 验证验证码响应
 */
export interface VerifySMSCodeResponse {
  status: 'ok' | 'error';
  data: {
    verified: boolean;
  } | null;
  message?: string;
}

// ============================================================================
// 请求参数 Schemas
// ============================================================================

/**
 * 验证验证码请求 schema
 */
export const VerifySMSCodeRequestSchema = t.Object({
  data: t.Object({
    code: t.String({
      minLength: 4,
      maxLength: 6,
      pattern: '^[0-9]+$',
      description: '验证码 (4-6位数字)',
    }),
  }),
});

export type VerifySMSCodeRequest =
  typeof VerifySMSCodeRequestSchema.static;
