/**
 * Device Type & Terminal Mount Schemas (Phase 8.3)
 *
 * 设备类型和终端挂载管理 API 验证 schemas
 */

import { z } from 'zod';

// ============================================================================
// 基础验证 Schemas
// ============================================================================

/**
 * 设备类型验证 (232 或 485)
 */
export const DeviceTypeSchema = z.enum(['232', '485']);

/**
 * MAC 地址验证
 */
export const MacAddressSchema = z
  .string()
  .regex(/^[A-F0-9]{12}$/i, 'MAC 地址格式错误 (12位十六进制)');

/**
 * PID 验证 (协议端口 ID)
 */
export const PidSchema = z
  .number()
  .int('PID 必须是整数')
  .positive('PID 必须 > 0');

// ============================================================================
// 获取设备类型列表
// ============================================================================

/**
 * GET /api/device-types
 * 获取设备类型列表
 */
export const GetDeviceTypesQuerySchema = z.object({
  type: DeviceTypeSchema.optional(),
});

export type GetDeviceTypesQuery = z.infer<typeof GetDeviceTypesQuerySchema>;

export const GetDeviceTypesResponseSchema = z.object({
  status: z.literal('ok'),
  data: z.array(
    z.object({
      Type: z.string(),
      DevModel: z.string(),
      Protocols: z.array(
        z.object({
          Type: z.number(),
          Protocol: z.string(),
        })
      ),
    })
  ),
});

export type GetDeviceTypesResponse = z.infer<
  typeof GetDeviceTypesResponseSchema
>;

// ============================================================================
// 获取终端详情
// ============================================================================

/**
 * GET /api/terminals/:mac
 * 获取终端详情
 */
export const GetTerminalParamsSchema = z.object({
  mac: MacAddressSchema,
});

export type GetTerminalParams = z.infer<typeof GetTerminalParamsSchema>;

export const GetTerminalResponseSchema = z.object({
  status: z.literal('ok'),
  data: z
    .object({
      DevMac: z.string(),
      name: z.string().optional(),
      Type: z.number().optional(),
      online: z.boolean().optional(),
      mountDevs: z
        .array(
          z.object({
            pid: z.number(),
            protocol: z.string(),
            Type: z.number().optional(),
            protocolType: z.string().optional(),
            port: z.number().optional(),
            remark: z.string().optional(),
            mountDev: z.string().optional(),
          })
        )
        .optional(),
      IP: z.string().optional(),
      prot: z.number().optional(),
      reg: z.boolean().optional(),
      jw: z.string().optional(),
      wd: z.string().optional(),
      createdAt: z.date().optional(),
      updatedAt: z.date().optional(),
    })
    .nullable(),
});

export type GetTerminalResponse = z.infer<typeof GetTerminalResponseSchema>;

// ============================================================================
// 获取注册设备列表
// ============================================================================

/**
 * GET /api/terminals/registered
 * 获取注册设备列表
 */
export const GetRegisteredDevicesQuerySchema = z.object({
  id: z.string().optional(),
});

export type GetRegisteredDevicesQuery = z.infer<
  typeof GetRegisteredDevicesQuerySchema
>;

export const GetRegisteredDevicesResponseSchema = z.object({
  status: z.literal('ok'),
  data: z.any(), // 返回格式取决于老系统的 terminalRegisterService
});

export type GetRegisteredDevicesResponse = z.infer<
  typeof GetRegisteredDevicesResponseSchema
>;

// ============================================================================
// 添加挂载设备
// ============================================================================

/**
 * POST /api/terminals/:mac/mount-devices
 * 添加挂载设备
 */
export const AddMountDeviceParamsSchema = z.object({
  mac: MacAddressSchema,
});

export type AddMountDeviceParams = z.infer<typeof AddMountDeviceParamsSchema>;

export const AddMountDeviceRequestSchema = z.object({
  data: z.object({
    pid: PidSchema,
    protocol: z.string().min(1, '协议名称不能为空'),
    Type: z.number().optional(),
    protocolType: z.string().optional(),
    port: z.number().optional(),
    remark: z.string().optional(),
    mountDev: z.string().optional(),
  }),
});

export type AddMountDeviceRequest = z.infer<
  typeof AddMountDeviceRequestSchema
>;

export const AddMountDeviceResponseSchema = z.object({
  status: z.literal('ok'),
  message: z.string().optional(),
  data: z.object({
    success: z.boolean(),
  }),
});

export type AddMountDeviceResponse = z.infer<
  typeof AddMountDeviceResponseSchema
>;

// ============================================================================
// 删除挂载设备
// ============================================================================

/**
 * DELETE /api/terminals/:mac/mount-devices/:pid
 * 删除挂载设备
 */
export const DeleteMountDeviceParamsSchema = z.object({
  mac: MacAddressSchema,
  pid: z
    .string()
    .regex(/^\d+$/, 'PID 必须是数字')
    .transform((val) => parseInt(val, 10))
    .pipe(PidSchema),
});

export type DeleteMountDeviceParams = z.infer<
  typeof DeleteMountDeviceParamsSchema
>;

export const DeleteMountDeviceResponseSchema = z.object({
  status: z.literal('ok'),
  message: z.string().optional(),
  data: z.object({
    success: z.boolean(),
  }),
});

export type DeleteMountDeviceResponse = z.infer<
  typeof DeleteMountDeviceResponseSchema
>;

// ============================================================================
// 刷新设备超时
// ============================================================================

/**
 * POST /api/terminals/:mac/refresh-timeout
 * 刷新设备超时
 */
export const RefreshDeviceTimeoutParamsSchema = z.object({
  mac: MacAddressSchema,
});

export type RefreshDeviceTimeoutParams = z.infer<
  typeof RefreshDeviceTimeoutParamsSchema
>;

export const RefreshDeviceTimeoutRequestSchema = z.object({
  data: z.object({
    pid: PidSchema,
    interval: z.number().positive('刷新间隔必须 > 0').optional(),
  }),
});

export type RefreshDeviceTimeoutRequest = z.infer<
  typeof RefreshDeviceTimeoutRequestSchema
>;

export const RefreshDeviceTimeoutResponseSchema = z.object({
  status: z.literal('ok'),
  message: z.string().optional(),
  data: z.object({
    success: z.boolean(),
  }),
});

export type RefreshDeviceTimeoutResponse = z.infer<
  typeof RefreshDeviceTimeoutResponseSchema
>;

// ============================================================================
// 错误响应
// ============================================================================

export const DeviceTypeErrorResponseSchema = z.object({
  status: z.literal('error'),
  message: z.string(),
  data: z.null(),
});

export type DeviceTypeErrorResponse = z.infer<
  typeof DeviceTypeErrorResponseSchema
>;
