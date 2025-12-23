/**
 * Alarm Schema Validation (Phase 4.2 Day 3)
 *
 * 告警 API 的 Zod 验证 Schema
 */

import { z } from 'zod';

/**
 * 告警 ID 路径参数 Schema
 */
export const AlarmIdParamsSchema = z.object({
  id: z.string().min(1, 'Alarm ID is required'),
});
export type AlarmIdParams = z.infer<typeof AlarmIdParamsSchema>;

/**
 * 告警查询参数 Schema
 * 用于 GET /api/alarms
 */
export const AlarmQuerySchema = z.object({
  // 分页参数
  page: z
    .string()
    .optional()
    .default('1')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1, 'Page must be at least 1')),

  limit: z
    .string()
    .optional()
    .default('50')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(100, 'Limit must be between 1 and 100')),

  // 过滤参数
  status: z
    .enum(['active', 'acknowledged', 'resolved', 'auto_resolved'])
    .optional(),

  level: z
    .enum(['info', 'warning', 'error', 'critical'])
    .optional(),

  mac: z
    .string()
    .regex(/^[0-9A-Fa-f]{12}$/, 'Invalid MAC address format')
    .optional(),

  pid: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .pipe(z.number().int().positive().optional()),

  protocol: z.string().min(1).optional(),

  tag: z
    .enum(['Threshold', 'AlarmStat', 'ups', 'timeout', 'offline', 'custom'])
    .optional(),

  // 时间范围
  startTime: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(parseInt(val, 10)) : undefined))
    .pipe(z.date().optional()),

  endTime: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(parseInt(val, 10)) : undefined))
    .pipe(z.date().optional()),

  // 排序
  sortBy: z
    .enum(['timeStamp', 'level', 'status', 'mac'])
    .optional()
    .default('timeStamp'),

  sortOrder: z
    .enum(['asc', 'desc'])
    .optional()
    .default('desc'),
});
export type AlarmQuery = z.infer<typeof AlarmQuerySchema>;

/**
 * 确认告警请求 Schema
 * 用于 POST /api/alarms/:id/confirm
 */
export const ConfirmAlarmRequestSchema = z.object({
  data: z.object({
    comment: z.string().max(500, 'Comment cannot exceed 500 characters').optional(),
  }),
});
export type ConfirmAlarmRequest = z.infer<typeof ConfirmAlarmRequestSchema>;

/**
 * 未确认告警计数查询参数 Schema
 * 用于 GET /api/alarms/unconfirmed/count
 */
export const UnconfirmedCountQuerySchema = z.object({
  mac: z
    .string()
    .regex(/^[0-9A-Fa-f]{12}$/, 'Invalid MAC address format')
    .optional(),

  level: z
    .enum(['info', 'warning', 'error', 'critical'])
    .optional(),

  since: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(parseInt(val, 10)) : undefined))
    .pipe(z.date().optional()),
});
export type UnconfirmedCountQuery = z.infer<typeof UnconfirmedCountQuerySchema>;

/**
 * 更新告警联系人请求 Schema
 * 用于 PUT /api/alarms/config/contacts
 */
export const UpdateAlarmContactsRequestSchema = z.object({
  data: z.object({
    emails: z
      .array(z.string().email('Invalid email address'))
      .max(10, 'Maximum 10 email addresses allowed')
      .optional(),

    phones: z
      .array(
        z.string().regex(/^1[3-9]\d{9}$/, 'Invalid phone number format')
      )
      .max(5, 'Maximum 5 phone numbers allowed')
      .optional(),

    enableEmail: z.boolean().optional(),

    enableSms: z.boolean().optional(),

    enablePush: z.boolean().optional(),
  }),
});
export type UpdateAlarmContactsRequest = z.infer<typeof UpdateAlarmContactsRequestSchema>;

/**
 * 批量操作告警请求 Schema
 * 用于批量确认或解决告警
 */
export const BatchAlarmOperationRequestSchema = z.object({
  data: z.object({
    alarmIds: z
      .array(z.string().min(1))
      .min(1, 'At least one alarm ID is required')
      .max(100, 'Maximum 100 alarms per batch operation'),

    operation: z.enum(['confirm', 'resolve']),

    comment: z.string().max(500).optional(),
  }),
});
export type BatchAlarmOperationRequest = z.infer<typeof BatchAlarmOperationRequestSchema>;

/**
 * 告警统计查询参数 Schema
 */
export const AlarmStatsQuerySchema = z.object({
  period: z
    .enum(['hour', 'day', 'week', 'month'])
    .optional()
    .default('day'),

  mac: z
    .string()
    .regex(/^[0-9A-Fa-f]{12}$/, 'Invalid MAC address format')
    .optional(),

  groupBy: z
    .enum(['level', 'tag', 'protocol', 'mac'])
    .optional(),
});
export type AlarmStatsQuery = z.infer<typeof AlarmStatsQuerySchema>;

// ============================================================================
// 验证辅助函数
// ============================================================================

/**
 * 验证告警时间范围
 */
export function validateAlarmTimeRange(
  start?: Date,
  end?: Date
): { valid: boolean; error?: string } {
  if (!start || !end) {
    return { valid: true };
  }

  if (start >= end) {
    return {
      valid: false,
      error: 'Start time must be before end time',
    };
  }

  const diffMs = end.getTime() - start.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  // 最多查询 180 天（告警记录保留更久）
  if (diffDays > 180) {
    return {
      valid: false,
      error: 'Time range cannot exceed 180 days',
    };
  }

  return { valid: true };
}

/**
 * 验证联系人信息
 */
export function validateContactInfo(
  emails?: string[],
  phones?: string[]
): { valid: boolean; error?: string } {
  if (!emails && !phones) {
    return {
      valid: false,
      error: 'At least one contact method (email or phone) is required',
    };
  }

  if (emails && emails.length === 0 && phones && phones.length === 0) {
    return {
      valid: false,
      error: 'At least one contact email or phone is required',
    };
  }

  return { valid: true };
}
