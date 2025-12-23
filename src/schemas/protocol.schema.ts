/**
 * Protocol Schema Validation (Phase 4.2 Day 3)
 *
 * 协议 API 的 Zod 验证 Schema
 */

import { z } from 'zod';

/**
 * 协议名称路径参数 Schema
 */
export const ProtocolNameParamsSchema = z.object({
  protocol: z.string().min(1, 'Protocol name is required'),
});
export type ProtocolNameParams = z.infer<typeof ProtocolNameParamsSchema>;

/**
 * 协议查询参数 Schema
 * 用于 GET /api/protocols
 */
export const ProtocolQuerySchema = z.object({
  type: z
    .enum(['modbus', 'mqtt', 'http', 'tcp', 'serial', 'custom'])
    .optional(),

  active: z
    .string()
    .optional()
    .transform((val) => (val ? val === 'true' : undefined))
    .pipe(z.boolean().optional()),

  page: z
    .string()
    .optional()
    .default('1')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1)),

  limit: z
    .string()
    .optional()
    .default('50')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(100)),
});
export type ProtocolQuery = z.infer<typeof ProtocolQuerySchema>;

/**
 * 协议参数配置 Schema
 */
export const ProtocolParameterConfigSchema = z.object({
  visible: z.boolean().optional(),
  customLabel: z.string().max(50).optional(),
  customUnit: z.string().max(20).optional(),
  displayOrder: z.number().int().min(0).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format').optional(),
});

/**
 * 告警条件 Schema
 */
export const AlarmConditionSchema = z.object({
  operator: z.enum(['>', '>=', '<', '<=', '==', '!=', 'between', 'outside']),
  value: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
}).refine(
  (data) => {
    // 对于 between 和 outside 操作符，min 和 max 都必须提供
    if (data.operator === 'between' || data.operator === 'outside') {
      return data.min !== undefined && data.max !== undefined;
    }
    // 对于其他操作符，value 必须提供
    return data.value !== undefined;
  },
  {
    message: 'Invalid condition: between/outside requires min and max, others require value',
  }
);

/**
 * 告警覆盖配置 Schema
 */
export const AlarmOverrideSchema = z.object({
  paramName: z.string().min(1, 'Parameter name is required'),
  enabled: z.boolean(),
  level: z.enum(['info', 'warning', 'error', 'critical']).optional(),
  condition: AlarmConditionSchema.optional(),
  customMessage: z.string().max(200).optional(),
});

/**
 * 更新用户协议配置请求 Schema
 * 用于 PUT /api/protocols/:protocol/user-config
 */
export const UpdateUserProtocolConfigRequestSchema = z.object({
  data: z.object({
    mac: z
      .string()
      .regex(/^[0-9A-Fa-f]{12}$/, 'Invalid MAC address format')
      .optional(),

    pid: z
      .number()
      .int()
      .positive('PID must be a positive integer')
      .optional(),

    parameterConfigs: z
      .record(z.string(), ProtocolParameterConfigSchema)
      .optional(),

    alarmOverrides: z
      .array(AlarmOverrideSchema)
      .max(50, 'Maximum 50 alarm overrides allowed')
      .optional(),

    refreshInterval: z
      .number()
      .int()
      .min(1000, 'Refresh interval must be at least 1 second')
      .max(300000, 'Refresh interval cannot exceed 5 minutes')
      .optional(),
  }),
});
export type UpdateUserProtocolConfigRequest = z.infer<typeof UpdateUserProtocolConfigRequestSchema>;

/**
 * 用户协议配置查询参数 Schema
 * 用于 GET /api/protocols/:protocol/user-config
 */
export const UserProtocolConfigQuerySchema = z.object({
  mac: z
    .string()
    .regex(/^[0-9A-Fa-f]{12}$/, 'Invalid MAC address format')
    .optional(),

  pid: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .pipe(z.number().int().positive().optional()),
});
export type UserProtocolConfigQuery = z.infer<typeof UserProtocolConfigQuerySchema>;

/**
 * 创建协议请求 Schema
 * 用于 POST /api/protocols
 */
export const CreateProtocolRequestSchema = z.object({
  data: z.object({
    name: z
      .string()
      .min(1, 'Protocol name is required')
      .max(50, 'Protocol name cannot exceed 50 characters')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Protocol name can only contain letters, numbers, underscores, and hyphens'),

    displayName: z
      .string()
      .min(1, 'Display name is required')
      .max(100, 'Display name cannot exceed 100 characters'),

    version: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/, 'Version must be in format X.Y.Z')
      .default('1.0.0'),

    description: z
      .string()
      .max(500, 'Description cannot exceed 500 characters')
      .optional(),

    type: z.enum(['modbus', 'mqtt', 'http', 'tcp', 'serial', 'custom']),

    parameters: z
      .array(
        z.object({
          name: z.string().min(1),
          label: z.string().min(1),
          unit: z.string().optional(),
          dataType: z.enum(['number', 'string', 'boolean', 'enum']),
          enumValues: z
            .array(
              z.object({
                value: z.union([z.string(), z.number()]),
                label: z.string(),
              })
            )
            .optional(),
          min: z.number().optional(),
          max: z.number().optional(),
          decimal: z.number().int().min(0).max(10).optional(),
          required: z.boolean().optional(),
          defaultValue: z.any().optional(),
          description: z.string().optional(),
          order: z.number().int().min(0).optional(),
        })
      )
      .min(1, 'At least one parameter is required')
      .max(100, 'Maximum 100 parameters allowed'),

    alarmConfigs: z
      .array(
        z.object({
          paramName: z.string().min(1),
          alarmType: z.enum(['threshold', 'range', 'value', 'offline']),
          level: z.enum(['info', 'warning', 'error', 'critical']),
          condition: AlarmConditionSchema.optional(),
          messageTemplate: z.string().min(1).max(200),
          enabled: z.boolean(),
          silenceDuration: z.number().int().min(0).optional(),
        })
      )
      .max(50, 'Maximum 50 alarm configs allowed')
      .optional(),
  }),
});
export type CreateProtocolRequest = z.infer<typeof CreateProtocolRequestSchema>;

/**
 * 更新协议请求 Schema
 * 用于 PUT /api/protocols/:protocol
 */
export const UpdateProtocolRequestSchema = z.object({
  data: z.object({
    displayName: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    active: z.boolean().optional(),
    parameters: CreateProtocolRequestSchema.shape.data.shape.parameters.optional(),
    alarmConfigs: CreateProtocolRequestSchema.shape.data.shape.alarmConfigs.optional(),
  }),
});
export type UpdateProtocolRequest = z.infer<typeof UpdateProtocolRequestSchema>;

/**
 * 协议参数验证请求 Schema
 */
export const ValidateParameterValueRequestSchema = z.object({
  data: z.object({
    parameterName: z.string().min(1),
    value: z.any(),
  }),
});
export type ValidateParameterValueRequest = z.infer<typeof ValidateParameterValueRequestSchema>;

// ============================================================================
// 验证辅助函数
// ============================================================================

/**
 * 验证协议名称格式
 */
export function validateProtocolName(name: string): { valid: boolean; error?: string } {
  if (!name || name.length === 0) {
    return {
      valid: false,
      error: 'Protocol name cannot be empty',
    };
  }

  if (name.length > 50) {
    return {
      valid: false,
      error: 'Protocol name cannot exceed 50 characters',
    };
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return {
      valid: false,
      error: 'Protocol name can only contain letters, numbers, underscores, and hyphens',
    };
  }

  return { valid: true };
}

/**
 * 验证刷新间隔
 */
export function validateRefreshInterval(interval: number): { valid: boolean; error?: string } {
  if (interval < 1000) {
    return {
      valid: false,
      error: 'Refresh interval must be at least 1 second (1000ms)',
    };
  }

  if (interval > 300000) {
    return {
      valid: false,
      error: 'Refresh interval cannot exceed 5 minutes (300000ms)',
    };
  }

  return { valid: true };
}

/**
 * 验证参数配置数量
 */
export function validateParameterConfigCount(count: number): { valid: boolean; error?: string } {
  if (count > 100) {
    return {
      valid: false,
      error: 'Maximum 100 parameters allowed per protocol',
    };
  }

  return { valid: true };
}
