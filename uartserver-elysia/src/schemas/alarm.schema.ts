/**
 * Alarm Schemas
 *
 * 告警相关的 Zod 验证 schemas
 */

import { z } from 'zod';

// ============================================================================
// 基础类型
// ============================================================================

/**
 * 告警级别
 */
export const AlarmLevelSchema = z.enum(['info', 'warning', 'error', 'critical']);

/**
 * 告警状态
 */
export const AlarmStatusSchema = z.enum([
  'active',
  'acknowledged',
  'resolved',
  'auto_resolved',
]);

// ============================================================================
// 告警查询 Schemas
// ============================================================================

/**
 * 获取告警列表请求
 */
export const GetAlarmsQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .default('1')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  limit: z
    .string()
    .optional()
    .default('20')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive().max(100)),

  status: AlarmStatusSchema.optional(),
  level: AlarmLevelSchema.optional(),
  mac: z.string().optional(),

  pid: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .pipe(z.number().int().optional()),

  protocol: z.string().optional(),
  tag: z.string().optional(),

  startTime: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined))
    .pipe(z.date().optional()),

  endTime: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined))
    .pipe(z.date().optional()),

  sortBy: z.enum(['timeStamp', 'level', 'status', 'mac']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export type GetAlarmsQuery = z.infer<typeof GetAlarmsQuerySchema>;

/**
 * 获取告警列表响应
 */
export interface GetAlarmsResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    data: any[]; // AlarmDocument[]
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * 获取单个告警请求参数
 */
export const GetAlarmByIdParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, '无效的告警 ID'),
});

export type GetAlarmByIdParams = z.infer<typeof GetAlarmByIdParamsSchema>;

/**
 * 获取单个告警响应
 */
export interface GetAlarmByIdResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: any; // AlarmDocument | null
}

/**
 * 获取未确认告警数量请求
 */
export const GetUnconfirmedCountQuerySchema = z.object({
  mac: z.string().optional(),
  level: AlarmLevelSchema.optional(),
  since: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined))
    .pipe(z.date().optional()),
});

export type GetUnconfirmedCountQuery = z.infer<
  typeof GetUnconfirmedCountQuerySchema
>;

/**
 * 获取未确认告警数量响应
 */
export interface GetUnconfirmedCountResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    count: number;
  };
}

/**
 * 获取告警统计请求
 */
export const GetAlarmStatsQuerySchema = z.object({
  mac: z.string().optional(),
  startTime: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined))
    .pipe(z.date().optional()),
  endTime: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined))
    .pipe(z.date().optional()),
});

export type GetAlarmStatsQuery = z.infer<typeof GetAlarmStatsQuerySchema>;

/**
 * 获取告警统计响应
 */
export interface GetAlarmStatsResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    total: number;
    byLevel: Record<string, number>;
    byStatus: Record<string, number>;
    byTag?: Record<string, number>;
  };
}

// ============================================================================
// 告警操作 Schemas
// ============================================================================

/**
 * 确认告警请求体
 */
export const ConfirmAlarmRequestSchema = z.object({
  data: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, '无效的告警 ID'),
    comment: z.string().optional(),
  }),
});

export type ConfirmAlarmRequest = z.infer<typeof ConfirmAlarmRequestSchema>;

/**
 * 确认告警响应
 */
export interface ConfirmAlarmResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    success: boolean;
  };
}

/**
 * 批量确认告警请求体
 */
export const ConfirmAlarmsBatchRequestSchema = z.object({
  data: z.object({
    ids: z
      .array(z.string().regex(/^[0-9a-fA-F]{24}$/, '无效的告警 ID'))
      .min(1, '至少需要一个告警 ID'),
    comment: z.string().optional(),
  }),
});

export type ConfirmAlarmsBatchRequest = z.infer<
  typeof ConfirmAlarmsBatchRequestSchema
>;

/**
 * 批量确认告警响应
 */
export interface ConfirmAlarmsBatchResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    confirmedCount: number;
  };
}

/**
 * 解决告警请求体
 */
export const ResolveAlarmRequestSchema = z.object({
  data: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, '无效的告警 ID'),
    solution: z.string().optional(),
  }),
});

export type ResolveAlarmRequest = z.infer<typeof ResolveAlarmRequestSchema>;

/**
 * 解决告警响应
 */
export interface ResolveAlarmResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    success: boolean;
  };
}

/**
 * 批量解决告警请求体
 */
export const ResolveAlarmsBatchRequestSchema = z.object({
  data: z.object({
    ids: z
      .array(z.string().regex(/^[0-9a-fA-F]{24}$/, '无效的告警 ID'))
      .min(1, '至少需要一个告警 ID'),
    solution: z.string().optional(),
  }),
});

export type ResolveAlarmsBatchRequest = z.infer<
  typeof ResolveAlarmsBatchRequestSchema
>;

/**
 * 批量解决告警响应
 */
export interface ResolveAlarmsBatchResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    resolvedCount: number;
  };
}

// ============================================================================
// 告警配置 Schemas
// ============================================================================

/**
 * 获取用户告警配置响应
 */
export interface GetUserAlarmConfigResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: any; // UserAlarmSetupDocument | null
}

/**
 * 更新告警联系人请求体
 */
export const UpdateAlarmContactsRequestSchema = z.object({
  data: z.object({
    emails: z.array(z.string().email('无效的邮箱地址')).optional(),
    phones: z
      .array(
        z
          .string()
          .regex(/^1[3-9]\d{9}$/, '无效的手机号码')
      )
      .optional(),
    enableEmail: z.boolean().optional(),
    enableSms: z.boolean().optional(),
    enablePush: z.boolean().optional(),
  }),
});

export type UpdateAlarmContactsRequest = z.infer<
  typeof UpdateAlarmContactsRequestSchema
>;

/**
 * 更新告警联系人响应
 */
export interface UpdateAlarmContactsResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    success: boolean;
  };
}
