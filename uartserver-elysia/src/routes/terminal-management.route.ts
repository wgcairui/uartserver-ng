/**
 * Terminal Management Routes (Phase 8.3)
 *
 * 终端和挂载设备管理 API 路由
 *
 * ✅ 已集成 JWT 认证中间件
 * ✅ 已集成设备权限检查
 */

import { Elysia } from 'elysia';

// JWT 认证中间件
import { requireAuth, getAuthUser } from '../middleware/jwt-auth.middleware';

// Schemas
import {
  GetTerminalParamsSchema,
  type GetTerminalParams,
  type GetTerminalResponse,
  GetRegisteredDevicesQuerySchema,
  type GetRegisteredDevicesQuery,
  type GetRegisteredDevicesResponse,
  AddMountDeviceParamsSchema,
  type AddMountDeviceParams,
  AddMountDeviceRequestSchema,
  type AddMountDeviceRequest,
  type AddMountDeviceResponse,
  DeleteMountDeviceParamsSchema,
  type DeleteMountDeviceParams,
  type DeleteMountDeviceResponse,
  RefreshDeviceTimeoutParamsSchema,
  type RefreshDeviceTimeoutParams,
  RefreshDeviceTimeoutRequestSchema,
  type RefreshDeviceTimeoutRequest,
  type RefreshDeviceTimeoutResponse,
} from '../schemas/device-type.schema';

// Services
import { TerminalApiService } from '../services/terminal-api.service';
import { UserService } from '../services/user.service';
import { mongodb } from '../database/mongodb';

// 延迟初始化服务实例
let terminalService: TerminalApiService | null = null;
let userService: UserService | null = null;

function getTerminalService(): TerminalApiService {
  if (!terminalService) {
    terminalService = new TerminalApiService(mongodb.getDatabase());
  }
  return terminalService;
}

function getUserService(): UserService {
  if (!userService) {
    userService = new UserService(mongodb.getDatabase());
  }
  return userService;
}

// ============================================================================
// Elysia Routes (with JWT Authentication)
// ============================================================================

export const terminalManagementRoutes = new Elysia({ prefix: '/api/terminals' })
  // 应用 JWT 认证中间件到所有路由
  .use(requireAuth)

  // DEBUG: Test endpoint to verify userId is passed
  .get('/debug-userid', async (ctx) => {
    try {
      const { userId, user } = await getAuthUser(ctx);

      return {
        status: 'ok',
        data: {
          userId,
          username: user.username,
          message: 'Auth is working! ✓',
        },
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        data: null,
      };
    }
  })

  /**
   * GET /api/terminals/:mac
   * 获取终端详情
   */
  .get(
    '/:mac',
    async (ctx): Promise<GetTerminalResponse> => {
      try {
        const { userId } = await getAuthUser(ctx);
        const { mac } = ctx.params;

        // 权限检查: 用户必须已绑定该设备
        console.log('[Terminal API] Checking access for userId:', userId, 'mac:', mac);
        const isBound = await getUserService().hasDeviceAccess(userId, mac);
        console.log('[Terminal API] isBound:', isBound);
        if (!isBound) {
          console.log('[Terminal API] Access denied - returning null');
          return {
            status: 'ok',
            data: null,
          };
        }

        // 获取终端详情
        const terminal = await getTerminalService().getTerminal(mac);

        return {
          status: 'ok',
          data: terminal as any,
        };
      } catch (error) {
        console.error('Error getting terminal:', error);
        throw error;
      }
    },
    {
      params: GetTerminalParamsSchema,
    }
  )

  /**
   * GET /api/terminals/registered
   * 获取注册设备列表
   *
   * 注意: 此端点对应老系统的 getRegisterDev
   * 返回格式取决于老系统的 register.devs 集合结构
   */
  .get(
    '/registered',
    async (ctx): Promise<GetRegisteredDevicesResponse> => {
      try {
        const { userId } = await getAuthUser(ctx);
        const { id } = ctx.query;

        // TODO: 实现注册设备查询逻辑
        // 需要查询 register.devs 集合
        // const collection = mongodb.getDatabase().collection('register.devs');
        // const registerDev = id
        //   ? await collection.findOne({ id })
        //   : await collection.find({}).toArray();

        console.log('Getting registered devices:', { userId, id });

        // 临时返回占位数据
        return {
          status: 'ok',
          data: id ? null : [],
        };
      } catch (error) {
        console.error('Error getting registered devices:', error);
        throw error;
      }
    },
    {
      query: GetRegisteredDevicesQuerySchema,
    }
  )

  /**
   * POST /api/terminals/:mac/mount-devices
   * 添加挂载设备
   */
  .post(
    '/:mac/mount-devices',
    async (ctx): Promise<AddMountDeviceResponse> => {
      try {
        const { userId } = await getAuthUser(ctx);
        const { mac } = ctx.params;
        const { data: mountDev } = ctx.body;

        // 权限检查: 用户必须已绑定该设备
        const isBound = await getUserService().hasDeviceAccess(userId, mac);
        if (!isBound) {
          return {
            status: 'ok',
            message: '设备未绑定',
            data: { success: false },
          };
        }

        // 添加挂载设备
        const success = await getTerminalService().addMountDevice(mac, {
          pid: mountDev.pid,
          protocol: mountDev.protocol,
          Type: mountDev.Type,
          protocolType: mountDev.protocolType,
          port: mountDev.port,
          remark: mountDev.remark,
          mountDev: mountDev.mountDev,
        });

        return {
          status: 'ok',
          message: success ? '添加成功' : '添加失败',
          data: { success },
        };
      } catch (error) {
        console.error('Error adding mount device:', error);

        // 检查是否是 PID 重复错误
        if (error instanceof Error && error.message.includes('already exists')) {
          return {
            status: 'ok',
            message: error.message,
            data: { success: false },
          };
        }

        throw error;
      }
    },
    {
      params: AddMountDeviceParamsSchema,
      body: AddMountDeviceRequestSchema,
    }
  )

  /**
   * DELETE /api/terminals/:mac/mount-devices/:pid
   * 删除挂载设备
   */
  .delete(
    '/:mac/mount-devices/:pid',
    async (ctx): Promise<DeleteMountDeviceResponse> => {
      try {
        const { userId } = await getAuthUser(ctx);
        const { mac, pid } = ctx.params;

        // 权限检查: 用户必须已绑定该设备
        const isBound = await getUserService().hasDeviceAccess(userId, mac);
        if (!isBound) {
          return {
            status: 'ok',
            message: '设备未绑定',
            data: { success: false },
          };
        }

        // 删除挂载设备
        const success = await getTerminalService().removeMountDevice(mac, pid);

        return {
          status: 'ok',
          message: success ? '删除成功' : '删除失败',
          data: { success },
        };
      } catch (error) {
        console.error('Error deleting mount device:', error);
        throw error;
      }
    },
    {
      params: DeleteMountDeviceParamsSchema,
    }
  )

  /**
   * POST /api/terminals/:mac/refresh-timeout
   * 刷新设备超时
   *
   * TODO: 此功能需要与 Socket.IO 服务集成
   * 当前仅返回成功状态
   */
  .post(
    '/:mac/refresh-timeout',
    async (ctx): Promise<RefreshDeviceTimeoutResponse> => {
      try {
        const { userId } = await getAuthUser(ctx);
        const { mac } = ctx.params;
        const { data: refreshData } = ctx.body;

        // 权限检查: 用户必须已绑定该设备
        const isBound = await getUserService().hasDeviceAccess(userId, mac);
        if (!isBound) {
          return {
            status: 'ok',
            message: '设备未绑定',
            data: { success: false },
          };
        }

        // TODO: 通过 Socket.IO 发送刷新指令到设备
        // await socketIOService.sendRefreshTimeout(mac, refreshData.pid, refreshData.interval);

        console.log('Refresh device timeout:', {
          mac,
          pid: refreshData.pid,
          interval: refreshData.interval,
        });

        return {
          status: 'ok',
          message: '刷新成功',
          data: { success: true },
        };
      } catch (error) {
        console.error('Error refreshing device timeout:', error);
        throw error;
      }
    },
    {
      params: RefreshDeviceTimeoutParamsSchema,
      body: RefreshDeviceTimeoutRequestSchema,
    }
  );
