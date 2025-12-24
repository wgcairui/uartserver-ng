/**
 * User Routes (Phase 7 Day 3 + Phase 8.1 Day 2 更新)
 *
 * 用户管理 API 路由
 *
 * ✅ 已集成 JWT 认证中间件
 */

import { Elysia } from 'elysia';

// JWT 认证中间件
import { requireAuth, requireRole } from '../middleware/jwt-auth.middleware';

// Schemas
import {
  GetUserByIdParamsSchema,
  AddDeviceBindingRequestSchema,
  DeleteDeviceBindingParamsSchema,
  CheckDeviceBindingParamsSchema,
  UpdateCurrentUserRequestSchema,
  ChangePasswordRequestSchema,
  UpdateDeviceNameParamsSchema,
  UpdateDeviceNameRequestSchema,
  CheckDeviceOnlineParamsSchema,
  UpdateAlarmContactsRequestSchema,
  UpdateUserLayoutRequestSchema,
  BatchCheckDevicesRequestSchema,
  type GetUserByIdParams,
  type AddDeviceBindingRequest,
  type DeleteDeviceBindingParams,
  type CheckDeviceBindingParams,
  type UpdateCurrentUserRequest,
  type ChangePasswordRequest,
  type UpdateDeviceNameParams,
  type UpdateDeviceNameRequest,
  type CheckDeviceOnlineParams,
  type UpdateAlarmContactsRequest,
  type UpdateUserLayoutRequest,
  type BatchCheckDevicesRequest,
  type GetCurrentUserResponse,
  type GetUserByIdResponse,
  type GetUserDevicesResponse,
  type AddDeviceBindingResponse,
  type DeleteDeviceBindingResponse,
  type CheckDeviceBindingResponse,
  type UpdateCurrentUserResponse,
  type ChangePasswordResponse,
  type UpdateDeviceNameResponse,
  type CheckDeviceOnlineResponse,
  type GetUserAlarmSetupResponse,
  type UpdateAlarmContactsResponse,
  type GetUserLayoutResponse,
  type UpdateUserLayoutResponse,
  type GetUsersStatisticsResponse,
  type BatchCheckDevicesResponse,
} from '../schemas/user.schema';

// Services
import { UserService } from '../services/user.service';
import { mongodb } from '../database/mongodb';
import { Phase3Collections } from '../entities/mongodb';

// 延迟初始化服务实例
let userService: UserService | null = null;
let collections: Phase3Collections | null = null;

function getUserService(): UserService {
  if (!userService) {
    userService = new UserService(mongodb.getDatabase());
  }
  return userService;
}

function getCollections(): Phase3Collections {
  if (!collections) {
    collections = new Phase3Collections(mongodb.getDatabase());
  }
  return collections;
}

// ============================================================================
// Elysia Routes (with JWT Authentication)
// ============================================================================

export const userRoutes = new Elysia({ prefix: '/api/users' })
  // 应用 JWT 认证中间件到所有路由
  .use(requireAuth)
  // ============================================================================
  // 用户信息查询
  // ============================================================================

  /**
   * GET /api/users/me
   * 获取当前用户信息
   *
   * TODO: 添加 JWT 认证中间件
   */
  .get('/me', async ({ userId }): Promise<GetCurrentUserResponse> => {
    try {
      
      const user = await getUserService().getUserById(userId);

      if (!user) {
        return {
          status: 'error',
          message: '用户不存在',
          data: null,
        };
      }

      // 过滤敏感字段
      const { password: _, refreshToken: __, ...userData } = user as any;

      return {
        status: 'ok',
        data: {
          _id: user._id.toString(),
          user: user.username,
          name: user.displayName,
          email: user.email,
          tel: user.phone,
          role: user.role,
          userGroup: user.department,
          isActive: user.isActive,
          rgtype: user.rgtype,
          creatTime: user.createdAt,
          modifyTime: user.updatedAt,
        },
      };
    } catch (error) {
      console.error('Error getting current user:', error);
      throw error;
    }
  })

  /**
   * GET /api/users/:id
   * 获取指定用户信息（管理员）
   *
   * TODO: 添加管理员权限检查
   */
  .get(
    '/:id',
    async ({ userId, params }): Promise<GetUserByIdResponse> => {
      try {
        const user = await getUserService().getUserById(params.id);

        if (!user) {
          return {
            status: 'error',
            message: '用户不存在',
            data: null,
          };
        }

        // 过滤敏感字段
        const { password: _, refreshToken: __, ...userData } = user as any;

        return {
          status: 'ok',
          data: userData,
        };
      } catch (error) {
        console.error('Error getting user by ID:', error);
        throw error;
      }
    },
    {
      params: GetUserByIdParamsSchema,
    }
  )

  // ============================================================================
  // 用户设备绑定
  // ============================================================================

  /**
   * GET /api/users/devices
   * 获取用户绑定的设备列表
   */
  .get('/devices', async ({ userId }): Promise<GetUserDevicesResponse> => {
    try {
      

      // 获取用户设备列表
      const user = await getUserService().getUserById(userId);
      if (!user) {
        return {
          status: 'error',
          message: '用户不存在',
          data: undefined,
        };
      }

      const deviceMacs = user.devices || [];

      // 获取设备详细信息
      const terminals = await getCollections()
        .terminals.find({ DevMac: { $in: deviceMacs } })
        .toArray();

      return {
        status: 'ok',
        data: {
          devices: terminals.map((t) => ({
            DevMac: t.DevMac,
            name: t.name,
            type: t.Type,
            online: t.online,
            mountDevs: t.mountDevs?.length || 0,
            pid: t.pid,
            protocol: t.protocol,
          })),
        },
      };
    } catch (error) {
      console.error('Error getting user devices:', error);
      throw error;
    }
  })

  /**
   * POST /api/users/devices
   * 添加设备绑定
   */
  .post(
    '/devices',
    async ({ userId, body }): Promise<AddDeviceBindingResponse> => {
      try {
        
        const { mac } = body.data;

        // 检查设备是否存在
        const terminal = await getCollections().terminals.findOne({
          DevMac: mac,
        });

        if (!terminal) {
          return {
            status: 'error',
            message: '设备不存在',
            data: { success: false },
          };
        }

        // 检查设备是否已被其他用户绑定
        const hasAccess = await getUserService().hasDeviceAccess(userId, mac);
        if (hasAccess) {
          return {
            status: 'error',
            message: '设备已绑定',
            data: { success: false },
          };
        }

        // 添加设备绑定
        const success = await getUserService().addDeviceAccess(userId, mac);

        return {
          status: 'ok',
          message: '设备绑定成功',
          data: { success },
        };
      } catch (error) {
        console.error('Error adding device binding:', error);
        return {
          status: 'error',
          message: error instanceof Error ? error.message : '绑定失败',
          data: { success: false },
        };
      }
    },
    {
      body: AddDeviceBindingRequestSchema,
    }
  )

  /**
   * DELETE /api/users/devices/:mac
   * 删除设备绑定
   */
  .delete(
    '/devices/:mac',
    async ({ userId, params }): Promise<DeleteDeviceBindingResponse> => {
      try {
        
        const { mac } = params;

        const success = await getUserService().removeDeviceAccess(userId, mac);

        return {
          status: 'ok',
          message: '设备绑定已删除',
          data: { success },
        };
      } catch (error) {
        console.error('Error deleting device binding:', error);
        throw error;
      }
    },
    {
      params: DeleteDeviceBindingParamsSchema,
    }
  )

  /**
   * GET /api/users/devices/:mac/check
   * 检查设备是否绑定到当前用户
   */
  .get(
    '/devices/:mac/check',
    async ({ userId, params }): Promise<CheckDeviceBindingResponse> => {
      try {
        
        const { mac } = params;

        const isBound = await getUserService().hasDeviceAccess(userId, mac);

        return {
          status: 'ok',
          data: {
            mac,
            isBound,
          },
        };
      } catch (error) {
        console.error('Error checking device binding:', error);
        throw error;
      }
    },
    {
      params: CheckDeviceBindingParamsSchema,
    }
  )

  /**
   * POST /api/users/devices/batch-check
   * 批量检查设备绑定状态
   */
  .post(
    '/devices/batch-check',
    async ({ userId, body }): Promise<BatchCheckDevicesResponse> => {
      try {
        
        const { macs } = body.data;

        const bindings: Record<string, boolean> = {};

        // 批量检查
        for (const mac of macs) {
          bindings[mac] = await getUserService().hasDeviceAccess(userId, mac);
        }

        return {
          status: 'ok',
          data: { bindings },
        };
      } catch (error) {
        console.error('Error batch checking devices:', error);
        throw error;
      }
    },
    {
      body: BatchCheckDevicesRequestSchema,
    }
  )

  // ============================================================================
  // 用户信息更新
  // ============================================================================

  /**
   * PUT /api/users/me
   * 更新当前用户信息
   */
  .put(
    '/me',
    async ({ userId, body }): Promise<UpdateCurrentUserResponse> => {
      try {
        
        const updates = body.data;

        const success = await getUserService().updateUser(userId, {
          displayName: updates.name,
          email: updates.email,
          phone: updates.tel,
        });

        return {
          status: 'ok',
          message: '用户信息已更新',
          data: { success },
        };
      } catch (error) {
        console.error('Error updating current user:', error);
        throw error;
      }
    },
    {
      body: UpdateCurrentUserRequestSchema,
    }
  )

  /**
   * PUT /api/users/me/password
   * 修改密码
   */
  .put(
    '/me/password',
    async ({ userId, body }): Promise<ChangePasswordResponse> => {
      try {
        
        const { oldPassword, newPassword } = body.data;

        // 验证旧密码
        const isValid = await getUserService().verifyUserPassword(
          userId,
          oldPassword
        );

        if (!isValid) {
          return {
            status: 'error',
            message: '旧密码不正确',
            data: { success: false },
          };
        }

        // 更新密码
        const success = await getUserService().updatePassword(userId, newPassword);

        return {
          status: 'ok',
          message: '密码已更新',
          data: { success },
        };
      } catch (error) {
        console.error('Error changing password:', error);
        throw error;
      }
    },
    {
      body: ChangePasswordRequestSchema,
    }
  )

  // ============================================================================
  // 终端设备管理
  // ============================================================================

  /**
   * PUT /api/users/devices/:mac/name
   * 修改设备别名
   */
  .put(
    '/devices/:mac/name',
    async ({ params, body }): Promise<UpdateDeviceNameResponse> => {
      try {
        
        const { mac } = params;
        const { name } = body.data;

        // 检查用户是否有权限
        const hasAccess = await getUserService().hasDeviceAccess(userId, mac);
        if (!hasAccess) {
          return {
            status: 'error',
            message: '无权限修改该设备',
            data: { success: false },
          };
        }

        // 更新设备名称
        const result = await getCollections().terminals.updateOne(
          { DevMac: mac },
          { $set: { name } }
        );

        return {
          status: 'ok',
          message: '设备名称已更新',
          data: { success: result.modifiedCount > 0 },
        };
      } catch (error) {
        console.error('Error updating device name:', error);
        throw error;
      }
    },
    {
      params: UpdateDeviceNameParamsSchema,
      body: UpdateDeviceNameRequestSchema,
    }
  )

  /**
   * GET /api/users/devices/:mac/online
   * 检查设备是否在线
   */
  .get(
    '/devices/:mac/online',
    async ({ userId, params }): Promise<CheckDeviceOnlineResponse> => {
      try {
        
        const { mac } = params;

        // 检查用户是否有权限
        const hasAccess = await getUserService().hasDeviceAccess(userId, mac);
        if (!hasAccess) {
          return {
            status: 'error',
            message: '无权限查看该设备',
            data: undefined,
          };
        }

        const terminal = await getCollections().terminals.findOne({
          DevMac: mac,
        });

        if (!terminal) {
          return {
            status: 'error',
            message: '设备不存在',
            data: undefined,
          };
        }

        return {
          status: 'ok',
          data: {
            mac,
            online: terminal.online || false,
            terminal: terminal.online ? terminal : undefined,
          },
        };
      } catch (error) {
        console.error('Error checking device online:', error);
        throw error;
      }
    },
    {
      params: CheckDeviceOnlineParamsSchema,
    }
  )

  // ============================================================================
  // 用户统计（管理员）
  // ============================================================================

  /**
   * GET /api/users/statistics
   * 获取用户统计信息（管理员）
   *
   * TODO: 添加管理员权限检查
   */
  .get('/statistics', async ({ userId }): Promise<GetUsersStatisticsResponse> => {
    try {
      const stats = await getUserService().getUserStats();

      // 获取设备统计
      const totalDevices = await getCollections().terminals.countDocuments({});
      const onlineDevices = await getCollections().terminals.countDocuments({
        online: true,
      });

      return {
        status: 'ok',
        data: {
          totalUsers: stats.totalUsers,
          activeUsers: stats.activeUsers,
          totalDevices,
          onlineDevices,
        },
      };
    } catch (error) {
      console.error('Error getting users statistics:', error);
      throw error;
    }
  });
