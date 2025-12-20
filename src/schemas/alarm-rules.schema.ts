/**
 * Alarm Rules API 数据结构和验证 Schema
 */

import { z } from 'zod';
import { stringToBoolean, stringToPositiveInt } from './common.schema';

/**
 * 告警规则类型 Schema
 */
export const AlarmRuleTypeSchema = z.enum([
  'threshold',
  'constant',
  'offline',
  'timeout',
  'custom',
]);

/**
 * 告警级别 Schema
 */
export const AlarmLevelSchema = z.enum(['info', 'warning', 'error', 'critical']);

/**
 * 阈值条件 Schema
 */
export const ThresholdConditionSchema = z.object({
  min: z.number().describe('最小值'),
  max: z.number().describe('最大值'),
});

/**
 * 常量条件 Schema
 */
export const ConstantConditionSchema = z.object({
  alarmStat: z.array(z.string()).min(1, '正常值列表不能为空'),
});

/**
 * 创建规则请求体 Schema
 */
export const CreateRuleRequestSchema = z
  .object({
    data: z.object({
      name: z.string().min(1, '规则名称不能为空'),
      description: z.string().optional(),
      type: AlarmRuleTypeSchema,
      level: AlarmLevelSchema,
      protocol: z.string().optional(),
      pid: z.union([z.string(), z.number()]).optional(),
      paramName: z.string().optional(),
      threshold: ThresholdConditionSchema.optional(),
      constant: ConstantConditionSchema.optional(),
      customScript: z.string().optional(),
      deduplicationWindow: z.number().int().positive().optional().default(300),
      createdBy: z.string().min(1, '创建人不能为空'),
    }),
  })
  .refine(
    (data) => {
      // threshold 类型必须有 threshold 条件
      if (data.data.type === 'threshold' && !data.data.threshold) {
        return false;
      }
      // constant 类型必须有 constant 条件
      if (data.data.type === 'constant' && !data.data.constant) {
        return false;
      }
      // custom 类型必须有 customScript
      if (data.data.type === 'custom' && !data.data.customScript) {
        return false;
      }
      return true;
    },
    {
      message: '规则类型与条件不匹配',
    }
  );

/**
 * 更新规则请求体 Schema
 */
export const UpdateRuleRequestSchema = z.object({
  data: z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    level: AlarmLevelSchema.optional(),
    protocol: z.string().optional(),
    pid: z.union([z.string(), z.number()]).optional(),
    paramName: z.string().optional(),
    threshold: ThresholdConditionSchema.optional(),
    constant: ConstantConditionSchema.optional(),
    customScript: z.string().optional(),
    deduplicationWindow: z.number().int().positive().optional(),
    enabled: z.boolean().optional(),
    updatedBy: z.string().optional(),
  }),
});

/**
 * 启用/禁用规则请求体 Schema
 */
export const EnableDisableRuleRequestSchema = z.object({
  userId: z.string().optional().default('system'),
});

/**
 * 批量操作请求体 Schema
 */
export const BatchOperationRequestSchema = z.object({
  ids: z.array(z.string()).min(1, '规则 ID 列表不能为空'),
  userId: z.string().optional().default('system'),
});

/**
 * 查询参数 Schema
 */
export const ListRulesQuerySchema = z.object({
  type: AlarmRuleTypeSchema.optional(),
  level: AlarmLevelSchema.optional(),
  enabled: stringToBoolean(),
  protocol: z.string().optional(),
  limit: stringToPositiveInt('50', 100),
  page: stringToPositiveInt('1'),
});

/**
 * 统一响应 Schema
 */
export const ApiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    status: z.enum(['ok', 'error']),
    message: z.string().optional(),
    data: z.union([dataSchema, z.null()]),
  });

/**
 * 类型导出
 */
export type AlarmRuleType = z.infer<typeof AlarmRuleTypeSchema>;
export type AlarmLevel = z.infer<typeof AlarmLevelSchema>;
export type ThresholdCondition = z.infer<typeof ThresholdConditionSchema>;
export type ConstantCondition = z.infer<typeof ConstantConditionSchema>;
export type CreateRuleRequest = z.infer<typeof CreateRuleRequestSchema>;
export type UpdateRuleRequest = z.infer<typeof UpdateRuleRequestSchema>;
export type EnableDisableRuleRequest = z.infer<typeof EnableDisableRuleRequestSchema>;
export type BatchOperationRequest = z.infer<typeof BatchOperationRequestSchema>;
export type ListRulesQuery = z.infer<typeof ListRulesQuerySchema>;
