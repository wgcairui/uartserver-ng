/**
 * Alarms API Zod 验证 Schemas
 * 为 AlarmsController 提供类型安全的参数验证
 */

import { z } from 'zod';
import { stringToBoolean, stringToPositiveInt, stringToDate } from './common.schema';

/**
 * 告警级别 Schema
 * 与 AlarmLevel 类型保持一致
 */
export const AlarmLevelSchema = z.enum(['critical', 'error', 'warning', 'info']);
export type AlarmLevel = z.infer<typeof AlarmLevelSchema>;

/**
 * GET /api/alarms - 告警列表查询参数
 */
export const ListAlarmsQuerySchema = z.object({
  level: AlarmLevelSchema.optional(),
  mac: z.string().optional(),
  pid: z.string().optional(),
  acknowledged: stringToBoolean(),
  resolved: stringToBoolean(),
  limit: stringToPositiveInt('50', 100),
  page: stringToPositiveInt('1'),
});
export type ListAlarmsQuery = z.infer<typeof ListAlarmsQuerySchema>;

/**
 * GET /api/alarms/:id - 告警 ID 路径参数
 * 用于所有需要 :id 路径参数的端点
 */
export const AlarmIdParamsSchema = z.object({
  id: z.string().min(1, '告警 ID 不能为空'),
});
export type AlarmIdParams = z.infer<typeof AlarmIdParamsSchema>;

/**
 * POST /api/alarms/:id/acknowledge - 确认告警请求体
 */
export const AcknowledgeAlarmBodySchema = z.object({
  userId: z.string().min(1, '用户 ID 不能为空'),
  comment: z.string().optional(),
});
export type AcknowledgeAlarmBody = z.infer<typeof AcknowledgeAlarmBodySchema>;

/**
 * POST /api/alarms/:id/resolve - 解决告警请求体
 */
export const ResolveAlarmBodySchema = z.object({
  userId: z.string().min(1, '用户 ID 不能为空'),
  solution: z.string().optional(),
});
export type ResolveAlarmBody = z.infer<typeof ResolveAlarmBodySchema>;

/**
 * GET /api/alarms/stats - 告警统计查询参数
 */
export const AlarmStatsQuerySchema = z.object({
  startTime: stringToDate(),
  endTime: stringToDate(),
});
export type AlarmStatsQuery = z.infer<typeof AlarmStatsQuerySchema>;
