/**
 * Terminal API Zod 验证 Schemas
 * 为 TerminalController 提供类型安全的参数验证
 */

import { z } from 'zod';
import { QueryResultSchema } from './query-data.schema';
import {
  MacAddressSchema,
  PaginationSchema,
  stringToBoolean,
  stringToPositiveInt,
} from './common.schema';

// ============================================================================
// Phase 2 Schemas (现有)
// ============================================================================

/**
 * POST /api/terminal/queryData - 设备查询数据
 */
export const QueryDataRequestSchema = z.object({
  data: QueryResultSchema,
});
export type QueryDataRequest = z.infer<typeof QueryDataRequestSchema>;

/**
 * DELETE /api/terminal/cache/:mac - 清除特定终端的缓存
 */
export const ClearTerminalCacheParamsSchema = z.object({
  mac: MacAddressSchema,
});
export type ClearTerminalCacheParams = z.infer<typeof ClearTerminalCacheParamsSchema>;

// ============================================================================
// Phase 4.2 Schemas (新增 - API 网关)
// ============================================================================

/**
 * MAC 地址路由参数 Schema
 * 用于 GET /api/terminals/:mac 等端点
 */
export const MacParamsSchema = z.object({
  mac: MacAddressSchema,
});
export type MacParams = z.infer<typeof MacParamsSchema>;

/**
 * 挂载设备数据 Schema
 */
export const MountDeviceSchema = z.object({
  pid: z.number().int().positive('PID 必须为正整数'),
  protocol: z.string().min(1, '协议 ID 不能为空'),
  Type: z.string().optional(),
  mountDev: z.string().min(1, '挂载设备地址不能为空'),
  name: z.string().min(1, '设备名称不能为空').max(50, '设备名称过长').optional(),
  online: z.boolean().optional(),
  bindDev: z.string().optional(),
  dataId: z.string().optional(),
  formResize: z.number().int().optional(),
  isState: z.boolean().optional(),
});
export type MountDeviceInput = z.infer<typeof MountDeviceSchema>;

/**
 * PUT /api/terminals/:mac - 更新终端信息
 */
export const UpdateTerminalRequestSchema = z.object({
  data: z.object({
    name: z
      .string()
      .min(1, '终端名称不能为空')
      .max(50, '终端名称不能超过 50 个字符')
      .optional(),
    jw: z
      .string()
      .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, 'GPS 坐标格式错误 (例: 116.404,39.915)')
      .optional(),
    remark: z.string().max(200, '备注不能超过 200 个字符').optional(),
    share: z.boolean().optional(),
  }),
});
export type UpdateTerminalRequest = z.infer<typeof UpdateTerminalRequestSchema>;

/**
 * POST /api/terminals/:mac/devices - 添加挂载设备
 */
export const AddMountDeviceRequestSchema = z.object({
  data: z.object({
    pid: z.number().int().positive('PID 必须为正整数'),
    protocol: z.string().min(1, '协议 ID 不能为空'),
    mountDev: z.string().min(1, '挂载设备地址不能为空'),
    Type: z.string().optional(),
    name: z.string().min(1, '设备名称不能为空').max(50, '设备名称过长').optional(),
    formResize: z.number().int().optional(),
    isState: z.boolean().optional(),
  }),
});
export type AddMountDeviceRequest = z.infer<typeof AddMountDeviceRequestSchema>;

/**
 * DELETE /api/terminals/:mac/devices/:pid - 删除挂载设备路由参数
 */
export const DeleteMountDeviceParamsSchema = z.object({
  mac: MacAddressSchema,
  pid: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive('PID 必须为正整数')),
});
export type DeleteMountDeviceParams = z.infer<typeof DeleteMountDeviceParamsSchema>;

/**
 * MAC + PID 组合参数 Schema
 * 用于 /api/terminals/:mac/devices/:pid 等端点
 */
export const MacPidParamsSchema = z.object({
  mac: MacAddressSchema,
  pid: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),
});
export type MacPidParams = z.infer<typeof MacPidParamsSchema>;

/**
 * GET /api/terminals - 终端列表查询参数
 */
export const TerminalQuerySchema = PaginationSchema.extend({
  online: stringToBoolean().pipe(z.boolean().optional()),
  share: stringToBoolean().pipe(z.boolean().optional()),
  keyword: z.string().optional(),
});
export type TerminalQuery = z.infer<typeof TerminalQuerySchema>;

/**
 * POST /api/data/:mac/:pid/refresh-timeout - 刷新超时请求
 */
export const RefreshTimeoutRequestSchema = z.object({
  data: z.object({
    interval: z
      .number()
      .int()
      .positive('轮询间隔必须为正整数')
      .max(300000, '轮询间隔不能超过 5 分钟 (300000ms)')
      .optional(),
  }),
});
export type RefreshTimeoutRequest = z.infer<typeof RefreshTimeoutRequestSchema>;

/**
 * GPS 坐标更新 Schema
 * PUT /api/terminals/:mac 的 jw 字段专用验证
 */
export const GpsCoordinatesSchema = z.object({
  data: z.object({
    jw: z
      .string()
      .regex(
        /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/,
        'GPS 坐标格式错误。正确格式: 经度,纬度 (例: 116.404,39.915)'
      ),
  }),
});
export type GpsCoordinates = z.infer<typeof GpsCoordinatesSchema>;

/**
 * 批量 MAC 地址 Schema
 * 用于批量操作终端的场景
 */
export const MacListSchema = z.object({
  data: z.object({
    macs: z
      .array(MacAddressSchema)
      .min(1, '至少需要一个 MAC 地址')
      .max(100, '最多支持 100 个 MAC 地址'),
  }),
});
export type MacList = z.infer<typeof MacListSchema>;

/**
 * 终端统计查询 Schema
 * GET /api/terminals/stats 等统计端点
 */
export const TerminalStatsQuerySchema = z.object({
  startDate: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined))
    .pipe(z.date().optional()),
  endDate: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined))
    .pipe(z.date().optional()),
  groupBy: z.enum(['day', 'week', 'month']).optional().default('day'),
});
export type TerminalStatsQuery = z.infer<typeof TerminalStatsQuerySchema>;

// ============================================================================
// 辅助验证函数
// ============================================================================

/**
 * 验证 MAC 地址格式的辅助函数
 *
 * @param mac - MAC 地址字符串
 * @returns 验证结果
 */
export function validateMacAddress(mac: string): {
  valid: boolean;
  error?: string;
} {
  const result = MacAddressSchema.safeParse(mac);
  if (result.success) {
    return { valid: true };
  }
  return {
    valid: false,
    error: result.error.issues[0]?.message || 'Invalid MAC address',
  };
}
