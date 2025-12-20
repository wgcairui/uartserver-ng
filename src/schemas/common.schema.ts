/**
 * Common Zod Validation Schemas
 *
 * 共享的验证 schemas，供所有 API schemas 复用
 * 包含：MAC 地址、分页、类型转换等通用验证逻辑
 */

import { z } from 'zod';

// ============================================================================
// 基础字段验证 (Basic Field Validation)
// ============================================================================

/**
 * MAC 地址验证 Schema
 *
 * 支持两种格式:
 * - 标准格式: 00:11:22:33:44:55
 * - 紧凑格式: 001122334455
 *
 * @example
 * ```typescript
 * const schema = z.object({ mac: MacAddressSchema });
 * schema.parse({ mac: '00:11:22:33:44:55' }); // ✅
 * schema.parse({ mac: '001122334455' });      // ✅
 * schema.parse({ mac: 'invalid' });           // ❌ 验证失败
 * ```
 */
export const MacAddressSchema = z
  .string()
  .min(1, 'MAC 地址不能为空')
  .regex(
    /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$|^[0-9A-Fa-f]{12}$/,
    '无效的 MAC 地址格式'
  );

// ============================================================================
// 类型转换辅助函数 (Type Conversion Helpers)
// ============================================================================

/**
 * 字符串转布尔值
 *
 * Query 参数通常是字符串，此函数将 'true'/'false' 转换为 boolean
 *
 * @example
 * ```typescript
 * const schema = z.object({ enabled: stringToBoolean() });
 * schema.parse({ enabled: 'true' });  // { enabled: true }
 * schema.parse({ enabled: 'false' }); // { enabled: false }
 * schema.parse({ enabled: 'other' }); // { enabled: undefined }
 * schema.parse({});                   // { enabled: undefined }
 * ```
 */
export function stringToBoolean() {
  return z
    .string()
    .optional()
    .transform((val) => {
      if (val === undefined) return undefined;
      if (val === 'true') return true;
      if (val === 'false') return false;
      return undefined;
    });
}

/**
 * 字符串转正整数
 *
 * Query 参数的数字转换，自动验证为正整数
 *
 * @param defaultValue - 默认值（字符串）
 * @param max - 最大值限制（可选）
 *
 * @example
 * ```typescript
 * const schema = z.object({
 *   limit: stringToPositiveInt('50', 100),
 *   page: stringToPositiveInt('1')
 * });
 * schema.parse({ limit: '20', page: '2' }); // { limit: 20, page: 2 }
 * schema.parse({});                          // { limit: 50, page: 1 }
 * schema.parse({ limit: '200' });            // ❌ 超过最大值 100
 * ```
 */
export function stringToPositiveInt(defaultValue: string, max?: number) {
  let schema = z
    .string()
    .optional()
    .default(defaultValue)
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive());

  if (max !== undefined) {
    schema = schema.pipe(z.number().max(max)) as any;
  }

  return schema;
}

/**
 * 字符串转日期
 *
 * 将 ISO 8601 字符串转换为 Date 对象
 *
 * @example
 * ```typescript
 * const schema = z.object({ startTime: stringToDate() });
 * schema.parse({ startTime: '2024-01-01T00:00:00Z' });
 * // { startTime: Date }
 * ```
 */
export function stringToDate() {
  return z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined))
    .pipe(z.date().optional());
}

// ============================================================================
// 分页 Schema (Pagination Schema)
// ============================================================================

/**
 * 标准分页参数 Schema
 *
 * 提供统一的分页验证和类型转换
 * - limit: 每页数量，默认 50，最大 100
 * - page: 页码，默认 1，必须为正整数
 *
 * @example
 * ```typescript
 * const ListUsersQuerySchema = z.object({
 *   name: z.string().optional(),
 *   ...PaginationSchema.shape, // 复用分页字段
 * });
 *
 * // 或者直接继承
 * const ListUsersQuerySchema = PaginationSchema.extend({
 *   name: z.string().optional(),
 * });
 * ```
 */
export const PaginationSchema = z.object({
  /**
   * 每页数量
   * - 默认: 50
   * - 范围: 1-100
   */
  limit: stringToPositiveInt('50', 100),

  /**
   * 页码（从 1 开始）
   * - 默认: 1
   * - 必须为正整数
   */
  page: stringToPositiveInt('1'),
});

/**
 * 分页参数类型
 *
 * @example
 * ```typescript
 * function listItems(pagination: PaginationParams) {
 *   const { limit, page } = pagination; // limit: number, page: number
 * }
 * ```
 */
export type PaginationParams = z.infer<typeof PaginationSchema>;

// ============================================================================
// 时间范围 Schema (Time Range Schema)
// ============================================================================

/**
 * 时间范围参数 Schema
 *
 * 用于筛选时间范围的查询参数
 * - startTime: 开始时间（可选）
 * - endTime: 结束时间（可选）
 *
 * @example
 * ```typescript
 * const GetLogsQuerySchema = TimeRangeSchema.extend({
 *   level: z.enum(['info', 'warn', 'error']).optional(),
 * });
 * ```
 */
export const TimeRangeSchema = z.object({
  /**
   * 开始时间（ISO 8601 格式）
   */
  startTime: stringToDate(),

  /**
   * 结束时间（ISO 8601 格式）
   */
  endTime: stringToDate(),
});

/**
 * 时间范围参数类型
 */
export type TimeRangeParams = z.infer<typeof TimeRangeSchema>;

// ============================================================================
// 组合 Schema (Combined Schemas)
// ============================================================================

/**
 * 分页 + 时间范围
 *
 * 最常用的列表查询组合：分页 + 时间筛选
 *
 * @example
 * ```typescript
 * const ListLogsQuerySchema = PaginatedTimeRangeSchema.extend({
 *   level: z.enum(['info', 'warn', 'error']).optional(),
 * });
 * ```
 */
export const PaginatedTimeRangeSchema = PaginationSchema.merge(TimeRangeSchema);

/**
 * 分页 + 时间范围参数类型
 */
export type PaginatedTimeRangeParams = z.infer<typeof PaginatedTimeRangeSchema>;
