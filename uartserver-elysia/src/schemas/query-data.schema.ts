/**
 * queryData API 数据结构和验证 Schema
 */

import { z } from 'zod';

/**
 * 查询结果数据 Schema
 */
export const QueryResultSchema = z.object({
  mac: z.string().min(1, '终端 MAC 不能为空'),
  pid: z.number().int().positive('设备 PID 必须为正整数'),
  protocol: z.string().min(1, '协议不能为空'),
  type: z.number().int(), // 数据类型
  content: z.string(), // 数据内容
  buffer: z.instanceof(Buffer).optional(), // 原始数据缓冲区
  timeStamp: z.number().optional(), // 时间戳
});

/**
 * 查询结果数据类型
 */
export type QueryResult = z.infer<typeof QueryResultSchema>;

/**
 * queryData API 请求体 Schema
 */
export const QueryDataRequestSchema = z.object({
  data: QueryResultSchema,
});

/**
 * queryData API 响应 Schema
 */
export const QueryDataResponseSchema = z.object({
  status: z.enum(['ok', 'skip', 'error']),
  message: z.string().optional(),
});

/**
 * queryData API 响应类型
 */
export type QueryDataResponse = z.infer<typeof QueryDataResponseSchema>;
