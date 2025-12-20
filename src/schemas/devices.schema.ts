/**
 * Devices API Zod 验证 Schemas
 * 为 DevicesController 提供类型安全的参数验证
 */

import { z } from 'zod';
import { MacAddressSchema, stringToBoolean, stringToPositiveInt, stringToDate } from './common.schema';

/**
 * GET /api/devices - 设备列表查询参数
 */
export const ListDevicesQuerySchema = z.object({
  mac: z.string().optional(),
  online: stringToBoolean(),
  limit: stringToPositiveInt('20', 100),
  page: stringToPositiveInt('1'),
});
export type ListDevicesQuery = z.infer<typeof ListDevicesQuerySchema>;

/**
 * GET /api/devices/:mac - 设备 MAC 路径参数
 * 用于所有需要 :mac 路径参数的端点
 */
export const DeviceMacParamsSchema = z.object({
  mac: MacAddressSchema,
});
export type DeviceMacParams = z.infer<typeof DeviceMacParamsSchema>;

/**
 * GET /api/devices/:mac/data - 设备历史数据查询参数
 */
export const GetDeviceDataQuerySchema = z.object({
  startTime: stringToDate(),
  endTime: stringToDate(),
  limit: stringToPositiveInt('100', 1000),
});
export type GetDeviceDataQuery = z.infer<typeof GetDeviceDataQuerySchema>;
