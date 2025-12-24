/**
 * Device Type Routes (Phase 8.3)
 *
 * 设备类型管理 API 路由
 *
 * ✅ 已集成 JWT 认证中间件
 */

import { Elysia } from 'elysia';

// JWT 认证中间件
import { requireAuth, getAuthUser } from '../middleware/jwt-auth.middleware';

// Schemas
import {
  GetDeviceTypesQuerySchema,
  type GetDeviceTypesQuery,
  type GetDeviceTypesResponse,
} from '../schemas/device-type.schema';

// Services
import { DeviceTypeService } from '../services/device-type.service';
import { mongodb } from '../database/mongodb';

// 延迟初始化服务实例
let deviceTypeService: DeviceTypeService | null = null;

function getDeviceTypeService(): DeviceTypeService {
  if (!deviceTypeService) {
    deviceTypeService = new DeviceTypeService(mongodb.getDatabase());
  }
  return deviceTypeService;
}

// ============================================================================
// Elysia Routes (with JWT Authentication)
// ============================================================================

export const deviceTypeRoutes = new Elysia({ prefix: '/api/device-types' })
  // 应用 JWT 认证中间件到所有路由
  .use(requireAuth)

  /**
   * GET /api/device-types
   * 获取设备类型列表
   */
  .get(
    '/',
    async (ctx): Promise<GetDeviceTypesResponse> => {
      try {
        // 强制认证
        await getAuthUser(ctx);

        const deviceTypes = await getDeviceTypeService().getDeviceTypes(
          ctx.query.type
        );

        return {
          status: 'ok',
          data: deviceTypes as any,
        };
      } catch (error) {
        console.error('Error getting device types:', error);
        throw error;
      }
    },
    {
      query: GetDeviceTypesQuerySchema,
    }
  );
