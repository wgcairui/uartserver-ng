/**
 * Config Schema Validation (Phase 4.2 Day 4)
 *
 * 用户配置 API 的 Zod 验证 Schema
 * 对应老系统 user.layouts 和 user.aggregations 集合
 */

import { z } from 'zod';

// ============================================================================
// 用户布局配置 Schemas
// ============================================================================

/**
 * 布局 ID 路径参数 Schema
 */
export const LayoutIdParamsSchema = z.object({
  id: z.string().min(1, 'Layout ID is required'),
});
export type LayoutIdParams = z.infer<typeof LayoutIdParamsSchema>;

/**
 * 布局绑定设备 Schema
 */
export const LayoutBindSchema = z.object({
  mac: z
    .string()
    .regex(/^[0-9A-Fa-f]{12}$/, 'Invalid MAC address format'),

  pid: z
    .number()
    .int()
    .nonnegative('PID must be non-negative'),

  name: z
    .string()
    .min(1, 'Parameter name is required'),
});
export type LayoutBind = z.infer<typeof LayoutBindSchema>;

/**
 * 布局项 Schema
 */
export const LayoutItemSchema = z.object({
  x: z.number().nonnegative('X coordinate must be non-negative'),

  y: z.number().nonnegative('Y coordinate must be non-negative'),

  id: z.string().min(1, 'Item ID is required'),

  name: z.string().min(1, 'Item name is required'),

  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format (use #RRGGBB)'),

  bind: LayoutBindSchema,
});
export type LayoutItem = z.infer<typeof LayoutItemSchema>;

/**
 * 更新用户布局请求 Schema
 * 用于 PUT /api/config/layout/:id
 */
export const UpdateUserLayoutRequestSchema = z.object({
  data: z.object({
    type: z
      .string()
      .min(1, 'Layout type is required')
      .max(50, 'Type cannot exceed 50 characters'),

    bg: z
      .string()
      .max(200, 'Background cannot exceed 200 characters')
      .optional(),

    Layout: z
      .array(LayoutItemSchema)
      .max(50, 'Maximum 50 layout items allowed'),
  }),
});
export type UpdateUserLayoutRequest = z.infer<typeof UpdateUserLayoutRequestSchema>;

// ============================================================================
// 用户聚合配置 Schemas
// ============================================================================

/**
 * 聚合 ID 路径参数 Schema
 */
export const AggregationIdParamsSchema = z.object({
  id: z.string().min(1, 'Aggregation ID is required'),
});
export type AggregationIdParams = z.infer<typeof AggregationIdParamsSchema>;

/**
 * 聚合设备 Schema (对齐老系统 aggregation 类)
 */
export const AggregationDeviceSchema = z.object({
  DevMac: z
    .string()
    .regex(/^[0-9A-Fa-f]{12}$/, 'Invalid MAC address format'),

  name: z
    .string()
    .min(1, 'Device name is required'),

  Type: z
    .string()
    .min(1, 'Device type is required'),

  mountDev: z
    .string()
    .min(1, 'Mount device is required'),

  protocol: z
    .string()
    .min(1, 'Protocol is required'),

  pid: z
    .number()
    .int()
    .nonnegative('PID must be non-negative')
    .default(0),
});
export type AggregationDevice = z.infer<typeof AggregationDeviceSchema>;

/**
 * 更新用户聚合请求 Schema (未来扩展)
 * 用于 PUT /api/config/aggregation/:id
 */
export const UpdateUserAggregationRequestSchema = z.object({
  data: z.object({
    name: z
      .string()
      .min(1, 'Aggregation name is required')
      .max(100, 'Name cannot exceed 100 characters'),

    aggregations: z
      .array(AggregationDeviceSchema)
      .max(100, 'Maximum 100 devices per aggregation'),
  }),
});
export type UpdateUserAggregationRequest = z.infer<typeof UpdateUserAggregationRequestSchema>;

// ============================================================================
// 验证辅助函数
// ============================================================================

/**
 * 验证布局项数量
 */
export function validateLayoutItemCount(count: number): { valid: boolean; error?: string } {
  if (count > 50) {
    return {
      valid: false,
      error: 'Maximum 50 layout items allowed per layout',
    };
  }

  return { valid: true };
}

/**
 * 验证聚合设备数量
 */
export function validateAggregationDeviceCount(count: number): { valid: boolean; error?: string } {
  if (count > 100) {
    return {
      valid: false,
      error: 'Maximum 100 devices allowed per aggregation',
    };
  }

  return { valid: true };
}

/**
 * 验证布局坐标范围 (可选，根据前端需求)
 */
export function validateLayoutCoordinates(
  x: number,
  y: number,
  maxX: number = 1920,
  maxY: number = 1080
): { valid: boolean; error?: string } {
  if (x < 0 || y < 0) {
    return {
      valid: false,
      error: 'Coordinates must be non-negative',
    };
  }

  if (x > maxX || y > maxY) {
    return {
      valid: false,
      error: `Coordinates exceed maximum bounds (${maxX}x${maxY})`,
    };
  }

  return { valid: true };
}

/**
 * 验证颜色格式
 */
export function validateColor(color: string): { valid: boolean; error?: string } {
  const colorRegex = /^#[0-9A-Fa-f]{6}$/;

  if (!colorRegex.test(color)) {
    return {
      valid: false,
      error: 'Invalid color format. Use #RRGGBB format (e.g., #FF5733)',
    };
  }

  return { valid: true };
}
