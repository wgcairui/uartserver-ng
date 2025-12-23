/**
 * Data Schema Validation (Phase 4.2 Day 2)
 *
 * 数据查询 API 的 Zod 验证 Schema
 */

import { z } from 'zod';

/**
 * MAC 地址和 PID 路径参数 Schema
 */
export const MacPidParamsSchema = z.object({
  mac: z.string().regex(/^[0-9A-Fa-f]{12}$/, 'Invalid MAC address format'),
  pid: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive('PID must be a positive integer')),
});
export type MacPidParams = z.infer<typeof MacPidParamsSchema>;

/**
 * MAC、PID、Name 路径参数 Schema
 */
export const MacPidNameParamsSchema = z.object({
  mac: z.string().regex(/^[0-9A-Fa-f]{12}$/, 'Invalid MAC address format'),
  pid: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive('PID must be a positive integer')),
  name: z.string().min(1, 'Parameter name cannot be empty'),
});
export type MacPidNameParams = z.infer<typeof MacPidNameParamsSchema>;

/**
 * 历史数据查询参数 Schema
 * 用于 GET /api/data/history/:mac/:pid
 */
export const HistoryDataQuerySchema = z.object({
  // 参数名称（可选，不指定则返回所有参数）
  name: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      if (typeof val === 'string') return [val];
      return val;
    }),

  // 开始时间（Unix 时间戳，毫秒）
  start: z
    .string()
    .regex(/^\d+$/, 'Start time must be a valid timestamp')
    .transform((val) => new Date(parseInt(val, 10))),

  // 结束时间（Unix 时间戳，毫秒）
  end: z
    .string()
    .regex(/^\d+$/, 'End time must be a valid timestamp')
    .transform((val) => new Date(parseInt(val, 10))),

  // 是否聚合（可选，默认 false）
  aggregate: z
    .string()
    .optional()
    .transform((val) => val === 'true')
    .pipe(z.boolean().optional())
    .default(false),

  // 聚合间隔（秒，可选，仅在 aggregate=true 时有效）
  interval: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .pipe(z.number().int().positive().optional()),
});
export type HistoryDataQuery = z.infer<typeof HistoryDataQuerySchema>;

/**
 * 单个参数历史数据查询参数 Schema
 * 用于 GET /api/data/:mac/:pid/:name
 */
export const SingleParamHistoryQuerySchema = z.object({
  // 开始时间（Unix 时间戳，毫秒）
  start: z
    .string()
    .regex(/^\d+$/, 'Start time must be a valid timestamp')
    .transform((val) => new Date(parseInt(val, 10))),

  // 结束时间（Unix 时间戳，毫秒）
  end: z
    .string()
    .regex(/^\d+$/, 'End time must be a valid timestamp')
    .transform((val) => new Date(parseInt(val, 10))),

  // 是否聚合（可选，默认 false）
  aggregate: z
    .string()
    .optional()
    .transform((val) => val === 'true')
    .pipe(z.boolean().optional())
    .default(false),

  // 聚合间隔（秒，可选）
  interval: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .pipe(z.number().int().positive().optional()),
});
export type SingleParamHistoryQuery = z.infer<typeof SingleParamHistoryQuerySchema>;

/**
 * 原始数据查询参数 Schema
 * 用于 GET /api/data/raw
 */
export const RawDataQuerySchema = z.object({
  // MAC 地址
  mac: z.string().regex(/^[0-9A-Fa-f]{12}$/, 'Invalid MAC address format'),

  // PID
  pid: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive('PID must be a positive integer')),

  // 开始时间（Unix 时间戳，毫秒）
  start: z
    .string()
    .regex(/^\d+$/, 'Start time must be a valid timestamp')
    .transform((val) => new Date(parseInt(val, 10))),

  // 结束时间（Unix 时间戳，毫秒）
  end: z
    .string()
    .regex(/^\d+$/, 'End time must be a valid timestamp')
    .transform((val) => new Date(parseInt(val, 10))),

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
    .default('100')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(1000, 'Limit must be between 1 and 1000')),
});
export type RawDataQuery = z.infer<typeof RawDataQuerySchema>;

/**
 * 解析数据查询参数 Schema
 * 用于 GET /api/data/parsed
 */
export const ParsedDataQuerySchema = z.object({
  // MAC 地址
  mac: z.string().regex(/^[0-9A-Fa-f]{12}$/, 'Invalid MAC address format'),

  // PID
  pid: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive('PID must be a positive integer')),

  // 参数名称（可选）
  name: z.string().min(1).optional(),

  // 开始时间（Unix 时间戳，毫秒）
  start: z
    .string()
    .regex(/^\d+$/, 'Start time must be a valid timestamp')
    .transform((val) => new Date(parseInt(val, 10))),

  // 结束时间（Unix 时间戳，毫秒）
  end: z
    .string()
    .regex(/^\d+$/, 'End time must be a valid timestamp')
    .transform((val) => new Date(parseInt(val, 10))),

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
    .default('100')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(1000, 'Limit must be between 1 and 1000')),
});
export type ParsedDataQuery = z.infer<typeof ParsedDataQuerySchema>;

/**
 * 刷新超时请求 Schema
 * 用于 POST /api/data/:mac/:pid/refresh-timeout
 */
export const RefreshTimeoutRequestSchema = z.object({
  data: z.object({
    interval: z
      .number()
      .int()
      .min(0, 'Interval must be non-negative')
      .max(300000, 'Interval cannot exceed 5 minutes (300000ms)')
      .optional(),
  }),
});
export type RefreshTimeoutRequest = z.infer<typeof RefreshTimeoutRequestSchema>;

/**
 * 批量查询设备数据请求 Schema
 * 用于查询多个设备的最新数据
 */
export const BatchLatestDataRequestSchema = z.object({
  data: z.object({
    devices: z
      .array(
        z.object({
          mac: z.string().regex(/^[0-9A-Fa-f]{12}$/, 'Invalid MAC address format'),
          pid: z.number().int().positive('PID must be a positive integer'),
        })
      )
      .min(1, 'At least one device is required')
      .max(100, 'Maximum 100 devices per request'),
  }),
});
export type BatchLatestDataRequest = z.infer<typeof BatchLatestDataRequestSchema>;

/**
 * 数据导出请求 Schema
 */
export const DataExportRequestSchema = z.object({
  mac: z.string().regex(/^[0-9A-Fa-f]{12}$/, 'Invalid MAC address format'),
  pid: z.number().int().positive('PID must be a positive integer'),
  name: z.union([z.string(), z.array(z.string())]).optional(),
  start: z.date(),
  end: z.date(),
  format: z.enum(['csv', 'json', 'excel']).default('csv'),
});
export type DataExportRequest = z.infer<typeof DataExportRequestSchema>;

// ============================================================================
// 验证辅助函数
// ============================================================================

/**
 * 验证时间范围
 */
export function validateTimeRange(
  start: Date,
  end: Date
): { valid: boolean; error?: string } {
  if (start >= end) {
    return {
      valid: false,
      error: 'Start time must be before end time',
    };
  }

  const diffMs = end.getTime() - start.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  // 最多查询 90 天
  if (diffDays > 90) {
    return {
      valid: false,
      error: 'Time range cannot exceed 90 days',
    };
  }

  const now = new Date();
  if (end > now) {
    return {
      valid: false,
      error: 'End time cannot be in the future',
    };
  }

  return { valid: true };
}

/**
 * 验证聚合参数
 */
export function validateAggregation(
  aggregate: boolean,
  interval?: number
): { valid: boolean; error?: string } {
  if (!aggregate) {
    return { valid: true };
  }

  if (!interval || interval <= 0) {
    return {
      valid: false,
      error: 'Aggregation interval must be positive when aggregate is true',
    };
  }

  // 间隔不能小于 60 秒
  if (interval < 60) {
    return {
      valid: false,
      error: 'Aggregation interval must be at least 60 seconds',
    };
  }

  // 间隔不能大于 1 天
  if (interval > 86400) {
    return {
      valid: false,
      error: 'Aggregation interval cannot exceed 1 day (86400 seconds)',
    };
  }

  return { valid: true };
}
