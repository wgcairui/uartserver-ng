/**
 * Data Query Schemas
 *
 * 数据查询相关的 Zod 验证 schemas
 */

import { z } from 'zod';

// ============================================================================
// 基础验证
// ============================================================================

/**
 * MAC 地址验证
 */
export const MacAddressSchema = z
  .string()
  .regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/, '无效的 MAC 地址格式');

/**
 * 协议 ID 验证
 */
export const ProtocolIdSchema = z.number().int().positive('协议 ID 必须为正整数');

/**
 * 时间范围验证
 */
export const TimeRangeSchema = z
  .object({
    start: z.date(),
    end: z.date(),
  })
  .refine((data) => data.end > data.start, {
    message: '结束时间必须晚于开始时间',
  })
  .refine(
    (data) => {
      const maxRange = 30 * 24 * 60 * 60 * 1000; // 30 天
      return data.end.getTime() - data.start.getTime() <= maxRange;
    },
    {
      message: '时间范围不能超过 30 天',
    }
  );

// ============================================================================
// 最新数据查询
// ============================================================================

/**
 * GET /api/data/latest/:mac/:pid
 * 获取设备最新数据路径参数
 */
export const GetLatestDataParamsSchema = z.object({
  mac: MacAddressSchema,
  pid: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(ProtocolIdSchema),
});

export type GetLatestDataParams = z.infer<typeof GetLatestDataParamsSchema>;

/**
 * 最新数据响应
 */
export interface GetLatestDataResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: Array<{
    name: string;
    value: number;
    unit: string;
    timestamp: Date;
  }>;
}

/**
 * GET /api/data/latest/:mac/:pid/:name
 * 获取指定参数最新数据
 */
export const GetLatestDataByNameParamsSchema = z.object({
  mac: MacAddressSchema,
  pid: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(ProtocolIdSchema),
  name: z.string().min(1, '参数名称不能为空'),
});

export type GetLatestDataByNameParams = z.infer<
  typeof GetLatestDataByNameParamsSchema
>;

/**
 * 单个参数最新数据响应
 */
export interface GetLatestDataByNameResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    name: string;
    value: number;
    unit: string;
    timestamp: Date;
  } | null;
}

// ============================================================================
// 历史数据查询
// ============================================================================

/**
 * GET /api/data/history
 * 获取历史数据查询参数
 */
export const GetHistoryDataQuerySchema = z.object({
  mac: MacAddressSchema,

  pid: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(ProtocolIdSchema),

  names: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(',') : undefined))
    .pipe(z.array(z.string()).optional()),

  start: z
    .string()
    .transform((val) => new Date(val))
    .pipe(z.date()),

  end: z
    .string()
    .transform((val) => new Date(val))
    .pipe(z.date()),

  aggregate: z
    .string()
    .optional()
    .transform((val) => val === 'true')
    .pipe(z.boolean().optional()),

  interval: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .pipe(z.number().int().positive().optional()),
});

export type GetHistoryDataQuery = z.infer<typeof GetHistoryDataQuerySchema>;

/**
 * 历史数据响应
 */
export interface GetHistoryDataResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: Array<{
    timestamp: Date;
    name: string;
    value: number;
    unit: string;
  }>;
}

// ============================================================================
// 聚合数据查询
// ============================================================================

/**
 * GET /api/data/aggregated
 * 获取聚合数据查询参数
 */
export const GetAggregatedDataQuerySchema = z.object({
  mac: MacAddressSchema,

  pid: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(ProtocolIdSchema),

  names: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(',') : undefined))
    .pipe(z.array(z.string()).optional()),

  start: z
    .string()
    .transform((val) => new Date(val))
    .pipe(z.date()),

  end: z
    .string()
    .transform((val) => new Date(val))
    .pipe(z.date()),

  interval: z
    .string()
    .optional()
    .default('3600')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),
});

export type GetAggregatedDataQuery = z.infer<typeof GetAggregatedDataQuerySchema>;

/**
 * 聚合数据响应
 */
export interface GetAggregatedDataResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: Array<{
    name: string;
    avg: number;
    min: number;
    max: number;
    count: number;
    unit: string;
  }>;
}

// ============================================================================
// 时间序列聚合数据查询
// ============================================================================

/**
 * GET /api/data/timeseries
 * 获取时间序列聚合数据
 */
export const GetTimeSeriesDataQuerySchema = GetAggregatedDataQuerySchema;

export type GetTimeSeriesDataQuery = z.infer<typeof GetTimeSeriesDataQuerySchema>;

/**
 * 时间序列聚合数据响应
 */
export interface GetTimeSeriesDataResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: Array<{
    timestamp: Date;
    name: string;
    avg: number;
    count: number;
  }>;
}

// ============================================================================
// 原始数据查询
// ============================================================================

/**
 * GET /api/data/raw
 * 获取原始数据（分页）
 */
export const GetRawDataQuerySchema = z.object({
  mac: MacAddressSchema,

  pid: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(ProtocolIdSchema),

  start: z
    .string()
    .transform((val) => new Date(val))
    .pipe(z.date()),

  end: z
    .string()
    .transform((val) => new Date(val))
    .pipe(z.date()),

  page: z
    .string()
    .optional()
    .default('1')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  limit: z
    .string()
    .optional()
    .default('50')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive().max(500)),
});

export type GetRawDataQuery = z.infer<typeof GetRawDataQuerySchema>;

/**
 * 原始数据响应
 */
export interface GetRawDataResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    data: any[]; // DataRecordDocument[]
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ============================================================================
// 解析数据查询
// ============================================================================

/**
 * GET /api/data/parsed
 * 获取解析数据（分页）
 */
export const GetParsedDataQuerySchema = z.object({
  mac: MacAddressSchema,

  pid: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(ProtocolIdSchema),

  name: z.string().optional(),

  start: z
    .string()
    .transform((val) => new Date(val))
    .pipe(z.date()),

  end: z
    .string()
    .transform((val) => new Date(val))
    .pipe(z.date()),

  page: z
    .string()
    .optional()
    .default('1')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  limit: z
    .string()
    .optional()
    .default('50')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive().max(500)),
});

export type GetParsedDataQuery = z.infer<typeof GetParsedDataQuerySchema>;

/**
 * 解析数据响应
 */
export interface GetParsedDataResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    data: any[]; // ParsedDataDocument[]
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ============================================================================
// 数据统计
// ============================================================================

/**
 * GET /api/data/statistics/:mac/:pid
 * 获取数据统计信息路径参数
 */
export const GetDataStatisticsParamsSchema = z.object({
  mac: MacAddressSchema,
  pid: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(ProtocolIdSchema),
});

export type GetDataStatisticsParams = z.infer<typeof GetDataStatisticsParamsSchema>;

/**
 * 数据统计响应
 */
export interface GetDataStatisticsResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    parameterCount: number;
    lastUpdateTime: Date | null;
    dataPoints: number;
  };
}

// ============================================================================
// 可用参数查询
// ============================================================================

/**
 * GET /api/data/parameters/:mac/:pid
 * 获取可用参数列表
 */
export const GetAvailableParametersParamsSchema = z.object({
  mac: MacAddressSchema,
  pid: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(ProtocolIdSchema),
});

export type GetAvailableParametersParams = z.infer<
  typeof GetAvailableParametersParamsSchema
>;

/**
 * 可用参数响应
 */
export interface GetAvailableParametersResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    mac: string;
    pid: number;
    parameters: string[];
  };
}
