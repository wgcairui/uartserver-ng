/**
 * Alarm Routes (Phase 7)
 *
 * 告警管理 API 路由
 */

import { Elysia } from 'elysia';

// JWT 认证中间件
import { requireAuth, requireRole } from '../middleware/jwt-auth.middleware';
import { ObjectId } from 'mongodb';

// Schemas
import {
  GetAlarmsQuerySchema,
  GetAlarmByIdParamsSchema,
  GetUnconfirmedCountQuerySchema,
  GetAlarmStatsQuerySchema,
  ConfirmAlarmRequestSchema,
  ConfirmAlarmsBatchRequestSchema,
  ResolveAlarmRequestSchema,
  ResolveAlarmsBatchRequestSchema,
  UpdateAlarmContactsRequestSchema,
  type GetAlarmsQuery,
  type GetAlarmByIdParams,
  type GetUnconfirmedCountQuery,
  type GetAlarmStatsQuery,
  type ConfirmAlarmRequest,
  type ConfirmAlarmsBatchRequest,
  type ResolveAlarmRequest,
  type ResolveAlarmsBatchRequest,
  type UpdateAlarmContactsRequest,
  type GetAlarmsResponse,
  type GetAlarmByIdResponse,
  type GetUnconfirmedCountResponse,
  type GetAlarmStatsResponse,
  type ConfirmAlarmResponse,
  type ConfirmAlarmsBatchResponse,
  type ResolveAlarmResponse,
  type ResolveAlarmsBatchResponse,
  type GetUserAlarmConfigResponse,
  type UpdateAlarmContactsResponse,
} from '../schemas/alarm.schema';

// Services
import { AlarmApiService } from '../services/alarm-api.service';
import { mongodb } from '../database/mongodb';

// 延迟初始化服务实例（避免在模块加载时访问未连接的数据库）
let alarmApiService: AlarmApiService | null = null;

function getAlarmApiService(): AlarmApiService {
  if (!alarmApiService) {
    alarmApiService = new AlarmApiService(mongodb.getDatabase());
  }
  return alarmApiService;
}

// ============================================================================
// Elysia Routes
// ============================================================================

export const alarmRoutes = new Elysia({ prefix: '/api/alarms' })
  // 应用 JWT 认证中间件到所有路由
  .use(requireAuth)
  // ============================================================================
  // 告警查询
  // ============================================================================

  /**
   * GET /api/alarms
   * 获取告警列表（分页）
   */
  .get(
    '/',
    async ({ query }): Promise<GetAlarmsResponse> => {
      try {
        const result = await getAlarmApiService().getAlarms({
          page: query.page,
          limit: query.limit,
          status: query.status,
          level: query.level,
          mac: query.mac,
          pid: query.pid,
          protocol: query.protocol,
          tag: query.tag,
          startTime: query.startTime,
          endTime: query.endTime,
          sortBy: query.sortBy,
          sortOrder: query.sortOrder,
        });

        return {
          status: 'ok',
          data: result,
        };
      } catch (error) {
        console.error('Error getting alarms:', error);
        throw error;
      }
    },
    {
      query: GetAlarmsQuerySchema,
    }
  )

  /**
   * GET /api/alarms/:id
   * 获取单个告警
   */
  .get(
    '/:id',
    async ({ params }): Promise<GetAlarmByIdResponse> => {
      try {
        const alarm = await getAlarmApiService().getAlarmById(
          new ObjectId(params.id)
        );

        if (!alarm) {
          return {
            status: 'error',
            message: '告警不存在',
            data: null,
          };
        }

        return {
          status: 'ok',
          data: alarm,
        };
      } catch (error) {
        console.error('Error getting alarm by ID:', error);
        throw error;
      }
    },
    {
      params: GetAlarmByIdParamsSchema,
    }
  )

  /**
   * GET /api/alarms/unconfirmed/count
   * 获取未确认告警数量
   */
  .get(
    '/unconfirmed/count',
    async ({ query }): Promise<GetUnconfirmedCountResponse> => {
      try {
        const count = await getAlarmApiService().getUnconfirmedCount({
          mac: query.mac,
          level: query.level,
          since: query.since,
        });

        return {
          status: 'ok',
          data: { count },
        };
      } catch (error) {
        console.error('Error getting unconfirmed count:', error);
        throw error;
      }
    },
    {
      query: GetUnconfirmedCountQuerySchema,
    }
  )

  /**
   * GET /api/alarms/stats
   * 获取告警统计
   */
  .get(
    '/stats',
    async ({ query }): Promise<GetAlarmStatsResponse> => {
      try {
        const stats = await getAlarmApiService().getAlarmStats({
          mac: query.mac,
          startTime: query.startTime,
          endTime: query.endTime,
        });

        return {
          status: 'ok',
          data: stats,
        };
      } catch (error) {
        console.error('Error getting alarm stats:', error);
        throw error;
      }
    },
    {
      query: GetAlarmStatsQuerySchema,
    }
  )

  // ============================================================================
  // 告警操作
  // ============================================================================

  /**
   * POST /api/alarms/confirm
   * 确认告警
   */
  .post(
    '/confirm',
    async ({ userId, body }): Promise<ConfirmAlarmResponse> => {
      try {
        const { id, comment } = body.data;

        const success = await getAlarmApiService().confirmAlarm(
          new ObjectId(id),
          userId,
          comment
        );

        if (!success) {
          return {
            status: 'error',
            message: '确认失败，告警可能不存在或已被确认',
            data: { success: false },
          };
        }

        return {
          status: 'ok',
          message: '告警已确认',
          data: { success: true },
        };
      } catch (error) {
        console.error('Error confirming alarm:', error);
        throw error;
      }
    },
    {
      body: ConfirmAlarmRequestSchema,
    }
  )

  /**
   * POST /api/alarms/confirm/batch
   * 批量确认告警
   */
  .post(
    '/confirm/batch',
    async ({ userId, body }): Promise<ConfirmAlarmsBatchResponse> => {
      try {
        const { ids, comment } = body.data;

        const objectIds = ids.map((id) => new ObjectId(id));
        const confirmedCount = await getAlarmApiService().confirmAlarmsBatch(
          objectIds,
          userId,
          comment
        );

        return {
          status: 'ok',
          message: `已确认 ${confirmedCount} 个告警`,
          data: { confirmedCount },
        };
      } catch (error) {
        console.error('Error confirming alarms batch:', error);
        throw error;
      }
    },
    {
      body: ConfirmAlarmsBatchRequestSchema,
    }
  )

  /**
   * POST /api/alarms/resolve
   * 解决告警
   */
  .post(
    '/resolve',
    async ({ userId, body }): Promise<ResolveAlarmResponse> => {
      try {
        const { id, solution } = body.data;

        const success = await getAlarmApiService().resolveAlarm(
          new ObjectId(id),
          userId,
          solution
        );

        if (!success) {
          return {
            status: 'error',
            message: '解决失败，告警可能不存在或已被解决',
            data: { success: false },
          };
        }

        return {
          status: 'ok',
          message: '告警已解决',
          data: { success: true },
        };
      } catch (error) {
        console.error('Error resolving alarm:', error);
        throw error;
      }
    },
    {
      body: ResolveAlarmRequestSchema,
    }
  )

  /**
   * POST /api/alarms/resolve/batch
   * 批量解决告警
   */
  .post(
    '/resolve/batch',
    async ({ userId, body }): Promise<ResolveAlarmsBatchResponse> => {
      try {
        const { ids, solution } = body.data;

        const objectIds = ids.map((id) => new ObjectId(id));
        const resolvedCount = await getAlarmApiService().resolveAlarmsBatch(
          objectIds,
          userId,
          solution
        );

        return {
          status: 'ok',
          message: `已解决 ${resolvedCount} 个告警`,
          data: { resolvedCount },
        };
      } catch (error) {
        console.error('Error resolving alarms batch:', error);
        throw error;
      }
    },
    {
      body: ResolveAlarmsBatchRequestSchema,
    }
  )

  // ============================================================================
  // 告警配置
  // ============================================================================

  /**
   * GET /api/alarms/config/user
   * 获取用户告警配置
   */
  .get('/config/user', async ({ userId }): Promise<GetUserAlarmConfigResponse> => {
    try {

      const config = await getAlarmApiService().getUserAlarmConfig(userId);

      return {
        status: 'ok',
        data: config,
      };
    } catch (error) {
      console.error('Error getting user alarm config:', error);
      throw error;
    }
  })

  /**
   * PUT /api/alarms/config/contacts
   * 更新告警联系人
   */
  .put(
    '/config/contacts',
    async ({ userId, body }): Promise<UpdateAlarmContactsResponse> => {
      try {
        const contacts = body.data;

        const success = await getAlarmApiService().updateAlarmContacts(
          userId,
          contacts
        );

        if (!success) {
          return {
            status: 'error',
            message: '更新失败',
            data: { success: false },
          };
        }

        return {
          status: 'ok',
          message: '联系人信息已更新',
          data: { success: true },
        };
      } catch (error) {
        console.error('Error updating alarm contacts:', error);
        throw error;
      }
    },
    {
      body: UpdateAlarmContactsRequestSchema,
    }
  );
