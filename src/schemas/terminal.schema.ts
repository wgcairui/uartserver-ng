/**
 * Terminal API Zod 验证 Schemas
 * 为 TerminalController 提供类型安全的参数验证
 */

import { z } from 'zod';
import { QueryResultSchema } from './query-data.schema';
import { MacAddressSchema } from './common.schema';

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
