/**
 * DTU 操作 API Zod 验证 Schemas
 * 为 DtuController 提供类型安全的参数验证
 */

import { z } from 'zod';
import { MacAddressSchema, stringToPositiveInt, stringToBoolean, stringToDate } from './common.schema';

/**
 * DTU 操作类型枚举
 */
export const DtuOperationTypeSchema = z.enum([
  'restart',
  'restart485',
  'updateMount',
  'OprateInstruct',
  'setTerminal',
  'getTerminal',
]);

/**
 * 挂载设备配置 Schema
 */
export const MountDeviceConfigSchema = z.object({
  pid: z.string().min(1, '设备 PID 不能为空'),
  port: z.number().int().min(1).max(255, '端口号必须在 1-255 之间'),
  protocol: z.string().min(1, '协议名称不能为空'),
  deviceId: z.string().optional(),
  name: z.string().optional(),
  // 允许其他动态字段
}).passthrough();

/**
 * 挂载配置内容（可能是单个设备或设备数组）
 */
export const MountContentSchema = z.union([
  MountDeviceConfigSchema,
  z.array(MountDeviceConfigSchema),
]);

/**
 * 透传指令内容 Schema
 */
export const InstructContentSchema = z.object({
  DevID: z.string().min(1, '设备 ID 不能为空'),
  protocol: z.string().min(1, '协议名称不能为空'),
  instruct: z.string().min(1, '指令不能为空'),
  content: z.string().optional(),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
}).passthrough();

/**
 * 终端参数设置内容 Schema
 */
export const TerminalParamsSchema = z.object({
  // DTU 参数设置的具体字段根据实际需求定义
  IP: z.string().optional(),
  Port: z.number().int().positive().optional(),
  host: z.string().optional(),
  port: z.number().int().positive().optional(),
  interval: z.number().int().positive().optional(),
}).passthrough();

// ========================================
// POST Endpoints Request Schemas
// ========================================

/**
 * POST /api/dtu/restart - 重启 DTU
 */
export const RestartDtuRequestSchema = z.object({
  mac: MacAddressSchema,
});
export type RestartDtuRequest = z.infer<typeof RestartDtuRequestSchema>;

/**
 * POST /api/dtu/restart485 - 重启 485 接口
 */
export const Restart485RequestSchema = z.object({
  mac: MacAddressSchema,
});
export type Restart485Request = z.infer<typeof Restart485RequestSchema>;

/**
 * POST /api/dtu/updateMount - 更新挂载设备
 */
export const UpdateMountRequestSchema = z.object({
  mac: MacAddressSchema,
  content: MountContentSchema,
});
export type UpdateMountRequest = z.infer<typeof UpdateMountRequestSchema>;

/**
 * POST /api/dtu/operate - 透传自定义指令
 */
export const OperateInstructRequestSchema = z.object({
  mac: MacAddressSchema,
  content: InstructContentSchema,
});
export type OperateInstructRequest = z.infer<typeof OperateInstructRequestSchema>;

/**
 * POST /api/dtu/setTerminal - 设置终端参数
 */
export const SetTerminalRequestSchema = z.object({
  mac: MacAddressSchema,
  content: TerminalParamsSchema,
});
export type SetTerminalRequest = z.infer<typeof SetTerminalRequestSchema>;

/**
 * POST /api/dtu/getTerminal - 获取终端信息
 */
export const GetTerminalRequestSchema = z.object({
  mac: MacAddressSchema,
});
export type GetTerminalRequest = z.infer<typeof GetTerminalRequestSchema>;

// ========================================
// GET Endpoints Query Schemas
// ========================================

/**
 * GET /api/dtu/logs - 查询 DTU 操作日志
 */
export const GetDtuLogsQuerySchema = z.object({
  mac: z.string().optional(),
  operation: DtuOperationTypeSchema.optional(),
  operatedBy: z.string().optional(),
  successOnly: stringToBoolean(),
  startTime: stringToDate(),
  endTime: stringToDate(),
  page: stringToPositiveInt('1'),
  limit: stringToPositiveInt('50', 100),
  sortBy: z.enum(['operatedAt', 'useTime']).optional().default('operatedAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});
export type GetDtuLogsQuery = z.infer<typeof GetDtuLogsQuerySchema>;

/**
 * GET /api/dtu/stats - 获取 DTU 操作统计
 */
export const GetDtuStatsQuerySchema = z.object({
  mac: z.string().optional(),
  startTime: stringToDate(),
  endTime: stringToDate(),
});
export type GetDtuStatsQuery = z.infer<typeof GetDtuStatsQuerySchema>;

/**
 * GET /api/dtu/:mac/recent - 获取设备最近操作记录
 * 由于装饰器系统每个方法只支持一个验证，这里验证 params
 */
export const GetRecentOperationsParamsSchema = z.object({
  mac: MacAddressSchema,
});
export type GetRecentOperationsParams = z.infer<typeof GetRecentOperationsParamsSchema>;

export const GetRecentOperationsQuerySchema = z.object({
  limit: stringToPositiveInt('10', 100),
});
export type GetRecentOperationsQuery = z.infer<typeof GetRecentOperationsQuerySchema>;
