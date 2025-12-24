/**
 * User Schemas
 *
 * 用户相关的 Zod 验证 schemas
 */

import { z } from 'zod';

// ============================================================================
// 基础验证
// ============================================================================

/**
 * 用户 ID 验证（MongoDB ObjectId）
 */
export const UserIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, '无效的用户 ID');

/**
 * 手机号验证（中国大陆）
 */
export const PhoneNumberSchema = z
  .string()
  .regex(/^1[3-9]\d{9}$/, '无效的手机号码');

/**
 * 邮箱验证
 */
export const EmailSchema = z.string().email('无效的邮箱地址');

/**
 * MAC 地址验证
 */
export const MacAddressSchema = z
  .string()
  .regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/, '无效的 MAC 地址格式');

/**
 * 用户角色枚举
 */
export const UserRoleSchema = z.enum(['user', 'admin', 'root', 'test']);

// ============================================================================
// 用户信息查询
// ============================================================================

/**
 * GET /api/users/me
 * 获取当前用户信息
 */
export interface GetCurrentUserResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    _id: string;
    user: string; // 用户名或手机号
    name?: string;
    email?: string;
    tel?: string;
    role: string;
    userGroup?: string;
    isActive: boolean;
    rgtype?: number;
    creatTime?: Date;
    modifyTime?: Date;
  } | null;
}

/**
 * GET /api/users/:id
 * 获取指定用户信息（管理员）
 */
export const GetUserByIdParamsSchema = z.object({
  id: UserIdSchema,
});

export type GetUserByIdParams = z.infer<typeof GetUserByIdParamsSchema>;

export interface GetUserByIdResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: any; // UserDocument
}

// ============================================================================
// 用户设备绑定
// ============================================================================

/**
 * GET /api/users/devices
 * 获取用户绑定的设备列表
 */
export interface GetUserDevicesResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    devices: Array<{
      DevMac: string;
      name?: string;
      type?: string;
      online?: boolean;
      mountDevs?: number;
      pid?: number;
      protocol?: string;
    }>;
  };
}

/**
 * POST /api/users/devices
 * 添加设备绑定
 */
export const AddDeviceBindingRequestSchema = z.object({
  data: z.object({
    mac: MacAddressSchema,
  }),
});

export type AddDeviceBindingRequest = z.infer<typeof AddDeviceBindingRequestSchema>;

export interface AddDeviceBindingResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    success: boolean;
  };
}

/**
 * DELETE /api/users/devices/:mac
 * 删除设备绑定
 */
export const DeleteDeviceBindingParamsSchema = z.object({
  mac: MacAddressSchema,
});

export type DeleteDeviceBindingParams = z.infer<
  typeof DeleteDeviceBindingParamsSchema
>;

export interface DeleteDeviceBindingResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    success: boolean;
  };
}

/**
 * GET /api/users/devices/:mac/check
 * 检查设备是否绑定到当前用户
 */
export const CheckDeviceBindingParamsSchema = z.object({
  mac: MacAddressSchema,
});

export type CheckDeviceBindingParams = z.infer<
  typeof CheckDeviceBindingParamsSchema
>;

export interface CheckDeviceBindingResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    mac: string;
    isBound: boolean;
  };
}

// ============================================================================
// 用户信息更新
// ============================================================================

/**
 * PUT /api/users/me
 * 更新当前用户信息
 */
export const UpdateCurrentUserRequestSchema = z.object({
  data: z.object({
    name: z.string().min(1, '姓名不能为空').max(50, '姓名过长').optional(),
    email: EmailSchema.optional(),
    tel: PhoneNumberSchema.optional(),
  }),
});

export type UpdateCurrentUserRequest = z.infer<
  typeof UpdateCurrentUserRequestSchema
>;

export interface UpdateCurrentUserResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    success: boolean;
  };
}

/**
 * PUT /api/users/me/password
 * 修改密码
 */
export const ChangePasswordRequestSchema = z.object({
  data: z.object({
    oldPassword: z.string().min(6, '旧密码至少 6 位'),
    newPassword: z
      .string()
      .min(6, '新密码至少 6 位')
      .max(32, '新密码最多 32 位')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        '密码必须包含大小写字母和数字'
      ),
  }),
});

export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

export interface ChangePasswordResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    success: boolean;
  };
}

// ============================================================================
// 终端设备管理
// ============================================================================

/**
 * PUT /api/users/devices/:mac/name
 * 修改设备别名
 */
export const UpdateDeviceNameParamsSchema = z.object({
  mac: MacAddressSchema,
});

export const UpdateDeviceNameRequestSchema = z.object({
  data: z.object({
    name: z.string().min(1, '设备名称不能为空').max(50, '设备名称过长'),
  }),
});

export type UpdateDeviceNameParams = z.infer<typeof UpdateDeviceNameParamsSchema>;
export type UpdateDeviceNameRequest = z.infer<
  typeof UpdateDeviceNameRequestSchema
>;

export interface UpdateDeviceNameResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    success: boolean;
  };
}

/**
 * GET /api/users/devices/:mac/online
 * 检查设备是否在线
 */
export const CheckDeviceOnlineParamsSchema = z.object({
  mac: MacAddressSchema,
});

export type CheckDeviceOnlineParams = z.infer<
  typeof CheckDeviceOnlineParamsSchema
>;

export interface CheckDeviceOnlineResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    mac: string;
    online: boolean;
    terminal?: any; // TerminalDocument
  };
}

// ============================================================================
// 用户告警配置
// ============================================================================

/**
 * GET /api/users/alarm-setup
 * 获取用户告警配置
 */
export interface GetUserAlarmSetupResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: any; // UserAlarmSetupDocument
}

/**
 * PUT /api/users/alarm-setup/contacts
 * 更新告警联系方式
 */
export const UpdateAlarmContactsRequestSchema = z.object({
  data: z.object({
    tel: z.array(PhoneNumberSchema).optional(),
    email: z.array(EmailSchema).optional(),
    wxOpenId: z.string().optional(),
  }),
});

export type UpdateAlarmContactsRequest = z.infer<
  typeof UpdateAlarmContactsRequestSchema
>;

export interface UpdateAlarmContactsResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    success: boolean;
  };
}

// ============================================================================
// 用户布局配置
// ============================================================================

/**
 * GET /api/users/layout
 * 获取用户布局配置
 */
export interface GetUserLayoutResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: any; // UserLayoutDocument
}

/**
 * PUT /api/users/layout
 * 更新用户布局配置
 */
export const UpdateUserLayoutRequestSchema = z.object({
  data: z.object({
    layout: z.record(z.any()), // 布局配置对象
  }),
});

export type UpdateUserLayoutRequest = z.infer<typeof UpdateUserLayoutRequestSchema>;

export interface UpdateUserLayoutResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    success: boolean;
  };
}

// ============================================================================
// 用户统计
// ============================================================================

/**
 * GET /api/users/statistics
 * 获取用户统计信息（管理员）
 */
export interface GetUsersStatisticsResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    totalUsers: number;
    activeUsers: number;
    totalDevices: number;
    onlineDevices: number;
  };
}

// ============================================================================
// 批量操作
// ============================================================================

/**
 * POST /api/users/devices/batch-check
 * 批量检查设备绑定状态
 */
export const BatchCheckDevicesRequestSchema = z.object({
  data: z.object({
    macs: z
      .array(MacAddressSchema)
      .min(1, '至少需要一个 MAC 地址')
      .max(100, '最多支持 100 个设备'),
  }),
});

export type BatchCheckDevicesRequest = z.infer<
  typeof BatchCheckDevicesRequestSchema
>;

export interface BatchCheckDevicesResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    bindings: Record<string, boolean>;
  };
}
