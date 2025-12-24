/**
 * Admin Log Routes (Phase 8.6)
 *
 * 管理员日志查询 API - 所有端点仅限管理员访问
 *
 * 端点列表:
 * - GET  /api/admin/logs/wechat-events         - 微信事件日志
 * - GET  /api/admin/logs/device-bytes/:mac     - 设备流量日志
 * - GET  /api/admin/logs/device-busy           - 设备繁忙日志
 * - GET  /api/admin/logs/terminal-aggregated   - 终端聚合日志
 * - GET  /api/admin/logs/user-aggregated       - 用户聚合日志
 * - GET  /api/admin/logs/nodes                 - 节点日志
 * - GET  /api/admin/logs/terminals             - 终端日志
 * - GET  /api/admin/logs/sms-sends             - 短信发送日志
 * - GET  /api/admin/logs/sms-count             - 短信发送统计
 * - GET  /api/admin/logs/mail-sends            - 邮件发送日志
 * - GET  /api/admin/logs/device-alarms         - 设备告警日志
 * - GET  /api/admin/logs/user-logins           - 用户登录日志
 * - GET  /api/admin/logs/user-requests         - 用户请求日志
 * - GET  /api/admin/logs/wechat-subscribes     - 微信订阅消息日志
 * - GET  /api/admin/logs/inner-messages        - 内部消息日志
 * - GET  /api/admin/logs/bull-queue            - Bull队列日志
 * - GET  /api/admin/logs/device-use-time       - 设备使用时间
 * - GET  /api/admin/logs/data-clean            - 数据清理记录
 * - GET  /api/admin/logs/user-alarms           - 用户告警信息
 */

import { Elysia, t } from 'elysia';
import { mongodb } from '../database/mongodb';
import { AdminLogService } from '../services/admin-log.service';
import { requireAuth, getAuthUser } from '../middleware/jwt-auth.middleware';
import {
  DateRangeQuerySchema,
  MacDateQuerySchema,
  UserDateQuerySchema,
  UserAlarmQuerySchema,
  type LogResponse,
} from '../schemas/admin-log.schema';

// ============================================================================
// 服务初始化
// ============================================================================

function getAdminLogService(): AdminLogService {
  return new AdminLogService(mongodb.getDatabase());
}

// ============================================================================
// 辅助函数: 管理员权限检查
// ============================================================================

async function checkAdminRole(ctx: any): Promise<void> {
  const { user } = await getAuthUser(ctx);

  if (user.role !== 'admin' && user.role !== 'root') {
    throw new Error('Forbidden - Admin access required');
  }
}

// ============================================================================
// Routes
// ============================================================================

export const adminLogRoutes = new Elysia({ prefix: '/api/admin/logs' })
  .use(requireAuth)

  // ==========================================================================
  // 1. GET /api/admin/logs/wechat-events - 微信事件日志
  // ==========================================================================
  .get(
    '/wechat-events',
    async (ctx): Promise<LogResponse> => {
      try {
        await checkAdminRole(ctx);

        const service = getAdminLogService();
        const logs = await service.getWxEvents();

        return {
          status: 'ok',
          data: logs,
        };
      } catch (error) {
        return {
          status: 'error',
          data: null,
          message: error instanceof Error ? error.message : '获取微信事件日志失败',
        };
      }
    },
    {
      detail: {
        summary: '获取微信推送事件记录',
        description: '获取所有微信推送事件日志 (管理员专用)',
        tags: ['Admin Logs'],
      },
    }
  )

  // ==========================================================================
  // 2. GET /api/admin/logs/device-bytes/:mac - 设备流量日志
  // ==========================================================================
  .get(
    '/device-bytes/:mac',
    async (ctx): Promise<LogResponse> => {
      try {
        await checkAdminRole(ctx);

        const { mac } = ctx.params as { mac: string };
        const service = getAdminLogService();
        const logs = await service.getDeviceBytes(mac);

        return {
          status: 'ok',
          data: logs,
        };
      } catch (error) {
        return {
          status: 'error',
          data: null,
          message: error instanceof Error ? error.message : '获取设备流量日志失败',
        };
      }
    },
    {
      params: t.Object({
        mac: t.String({ minLength: 12, maxLength: 17 }),
      }),
      detail: {
        summary: '获取设备使用流量',
        description: '获取指定设备的流量使用记录 (管理员专用)',
        tags: ['Admin Logs'],
      },
    }
  )

  // ==========================================================================
  // 3. GET /api/admin/logs/device-busy - 设备繁忙日志
  // ==========================================================================
  .get(
    '/device-busy',
    async (ctx): Promise<LogResponse> => {
      try {
        await checkAdminRole(ctx);

        const query = ctx.query as { mac: string; start?: string; end?: string };
        const service = getAdminLogService();

        const { start, end } = service.normalizeDateRange(
          query.start ? parseInt(query.start) : undefined,
          query.end ? parseInt(query.end) : undefined
        );

        const logs = await service.getDeviceBusy(query.mac, start, end);

        return {
          status: 'ok',
          data: logs,
        };
      } catch (error) {
        return {
          status: 'error',
          data: null,
          message: error instanceof Error ? error.message : '获取设备繁忙日志失败',
        };
      }
    },
    {
      query: t.Object({
        mac: t.String({ minLength: 12 }),
        start: t.Optional(t.String()),
        end: t.Optional(t.String()),
      }),
      detail: {
        summary: '获取设备繁忙状态',
        description: '获取设备指定时段的繁忙状态记录 (管理员专用)',
        tags: ['Admin Logs'],
      },
    }
  )

  // ==========================================================================
  // 4. GET /api/admin/logs/terminal-aggregated - 终端聚合日志
  // ==========================================================================
  .get(
    '/terminal-aggregated',
    async (ctx): Promise<LogResponse> => {
      try {
        await checkAdminRole(ctx);

        const query = ctx.query as { mac: string; start?: string; end?: string };
        const service = getAdminLogService();

        const { start, end } = service.normalizeDateRange(
          query.start ? parseInt(query.start) : undefined,
          query.end ? parseInt(query.end) : undefined
        );

        const logs = await service.getTerminalAggregatedLogs(query.mac, start, end);

        return {
          status: 'ok',
          data: logs,
        };
      } catch (error) {
        return {
          status: 'error',
          data: null,
          message: error instanceof Error ? error.message : '获取终端聚合日志失败',
        };
      }
    },
    {
      query: t.Object({
        mac: t.String({ minLength: 12 }),
        start: t.Optional(t.String()),
        end: t.Optional(t.String()),
      }),
      detail: {
        summary: '获取终端聚合日志',
        description: '获取指定设备的聚合日志(告警+事件) (管理员专用)',
        tags: ['Admin Logs'],
      },
    }
  )

  // ==========================================================================
  // 5. GET /api/admin/logs/user-aggregated - 用户聚合日志
  // ==========================================================================
  .get(
    '/user-aggregated',
    async (ctx): Promise<LogResponse> => {
      try {
        await checkAdminRole(ctx);

        const query = ctx.query as { user: string; start?: string; end?: string };
        const service = getAdminLogService();

        const { start, end } = service.normalizeDateRange(
          query.start ? parseInt(query.start) : undefined,
          query.end ? parseInt(query.end) : undefined
        );

        const logs = await service.getUserAggregatedLogs(query.user, start, end);

        return {
          status: 'ok',
          data: logs,
        };
      } catch (error) {
        return {
          status: 'error',
          data: null,
          message: error instanceof Error ? error.message : '获取用户聚合日志失败',
        };
      }
    },
    {
      query: t.Object({
        user: t.String({ minLength: 1 }),
        start: t.Optional(t.String()),
        end: t.Optional(t.String()),
      }),
      detail: {
        summary: '获取用户聚合日志',
        description: '获取指定用户的聚合日志(登录+请求) (管理员专用)',
        tags: ['Admin Logs'],
      },
    }
  )

  // ==========================================================================
  // 6. GET /api/admin/logs/nodes - 节点日志
  // ==========================================================================
  .get(
    '/nodes',
    async (ctx): Promise<LogResponse> => {
      try {
        await checkAdminRole(ctx);

        const query = ctx.query as { start?: string; end?: string };
        const service = getAdminLogService();

        const { start, end } = service.normalizeDateRange(
          query.start ? parseInt(query.start) : undefined,
          query.end ? parseInt(query.end) : undefined
        );

        const logs = await service.getNodeLogs(start, end);

        return {
          status: 'ok',
          data: logs,
        };
      } catch (error) {
        return {
          status: 'error',
          data: null,
          message: error instanceof Error ? error.message : '获取节点日志失败',
        };
      }
    },
    {
      query: t.Object({
        start: t.Optional(t.String()),
        end: t.Optional(t.String()),
      }),
      detail: {
        summary: '获取节点日志',
        description: '获取节点事件日志 (管理员专用)',
        tags: ['Admin Logs'],
      },
    }
  )

  // ==========================================================================
  // 7. GET /api/admin/logs/terminals - 终端日志
  // ==========================================================================
  .get(
    '/terminals',
    async (ctx): Promise<LogResponse> => {
      try {
        await checkAdminRole(ctx);

        const query = ctx.query as { start?: string; end?: string };
        const service = getAdminLogService();

        const { start, end } = service.normalizeDateRange(
          query.start ? parseInt(query.start) : undefined,
          query.end ? parseInt(query.end) : undefined
        );

        const logs = await service.getTerminalLogs(start, end);

        return {
          status: 'ok',
          data: logs,
        };
      } catch (error) {
        return {
          status: 'error',
          data: null,
          message: error instanceof Error ? error.message : '获取终端日志失败',
        };
      }
    },
    {
      query: t.Object({
        start: t.Optional(t.String()),
        end: t.Optional(t.String()),
      }),
      detail: {
        summary: '获取终端日志',
        description: '获取终端事件日志 (管理员专用)',
        tags: ['Admin Logs'],
      },
    }
  )

  // ==========================================================================
  // 8. GET /api/admin/logs/sms-sends - 短信发送日志
  // ==========================================================================
  .get(
    '/sms-sends',
    async (ctx): Promise<LogResponse> => {
      try {
        await checkAdminRole(ctx);

        const query = ctx.query as { start?: string; end?: string };
        const service = getAdminLogService();

        const { start, end } = service.normalizeDateRange(
          query.start ? parseInt(query.start) : undefined,
          query.end ? parseInt(query.end) : undefined
        );

        const logs = await service.getSmsSendLogs(start, end);

        return {
          status: 'ok',
          data: logs,
        };
      } catch (error) {
        return {
          status: 'error',
          data: null,
          message: error instanceof Error ? error.message : '获取短信发送日志失败',
        };
      }
    },
    {
      query: t.Object({
        start: t.Optional(t.String()),
        end: t.Optional(t.String()),
      }),
      detail: {
        summary: '获取短信发送日志',
        description: '获取短信发送记录 (管理员专用)',
        tags: ['Admin Logs'],
      },
    }
  )

  // ==========================================================================
  // 9. GET /api/admin/logs/sms-count - 短信发送统计
  // ==========================================================================
  .get(
    '/sms-count',
    async (ctx): Promise<LogResponse> => {
      try {
        await checkAdminRole(ctx);

        const service = getAdminLogService();
        const stats = await service.getSmsSendCountInfo();

        return {
          status: 'ok',
          data: stats,
        };
      } catch (error) {
        return {
          status: 'error',
          data: null,
          message: error instanceof Error ? error.message : '获取短信统计失败',
        };
      }
    },
    {
      detail: {
        summary: '获取短信发送统计',
        description: '获取每个手机号的短信发送次数统计 (管理员专用)',
        tags: ['Admin Logs'],
      },
    }
  )

  // ==========================================================================
  // 10. GET /api/admin/logs/mail-sends - 邮件发送日志
  // ==========================================================================
  .get(
    '/mail-sends',
    async (ctx): Promise<LogResponse> => {
      try {
        await checkAdminRole(ctx);

        const query = ctx.query as { start?: string; end?: string };
        const service = getAdminLogService();

        const { start, end } = service.normalizeDateRange(
          query.start ? parseInt(query.start) : undefined,
          query.end ? parseInt(query.end) : undefined
        );

        const logs = await service.getMailSendLogs(start, end);

        return {
          status: 'ok',
          data: logs,
        };
      } catch (error) {
        return {
          status: 'error',
          data: null,
          message: error instanceof Error ? error.message : '获取邮件发送日志失败',
        };
      }
    },
    {
      query: t.Object({
        start: t.Optional(t.String()),
        end: t.Optional(t.String()),
      }),
      detail: {
        summary: '获取邮件发送日志',
        description: '获取邮件发送记录 (管理员专用)',
        tags: ['Admin Logs'],
      },
    }
  )

  // ==========================================================================
  // 11. GET /api/admin/logs/device-alarms - 设备告警日志
  // ==========================================================================
  .get(
    '/device-alarms',
    async (ctx): Promise<LogResponse> => {
      try {
        await checkAdminRole(ctx);

        const query = ctx.query as { start?: string; end?: string };
        const service = getAdminLogService();

        const { start, end } = service.normalizeDateRange(
          query.start ? parseInt(query.start) : undefined,
          query.end ? parseInt(query.end) : undefined
        );

        const logs = await service.getDeviceAlarmLogs(start, end);

        return {
          status: 'ok',
          data: logs,
        };
      } catch (error) {
        return {
          status: 'error',
          data: null,
          message: error instanceof Error ? error.message : '获取设备告警日志失败',
        };
      }
    },
    {
      query: t.Object({
        start: t.Optional(t.String()),
        end: t.Optional(t.String()),
      }),
      detail: {
        summary: '获取设备告警日志',
        description: '获取设备参数超限告警记录 (管理员专用)',
        tags: ['Admin Logs'],
      },
    }
  )

  // ==========================================================================
  // 12. GET /api/admin/logs/user-logins - 用户登录日志
  // ==========================================================================
  .get(
    '/user-logins',
    async (ctx): Promise<LogResponse> => {
      try {
        await checkAdminRole(ctx);

        const query = ctx.query as { start?: string; end?: string };
        const service = getAdminLogService();

        const { start, end } = service.normalizeDateRange(
          query.start ? parseInt(query.start) : undefined,
          query.end ? parseInt(query.end) : undefined
        );

        const logs = await service.getUserLoginLogs(start, end);

        return {
          status: 'ok',
          data: logs,
        };
      } catch (error) {
        return {
          status: 'error',
          data: null,
          message: error instanceof Error ? error.message : '获取用户登录日志失败',
        };
      }
    },
    {
      query: t.Object({
        start: t.Optional(t.String()),
        end: t.Optional(t.String()),
      }),
      detail: {
        summary: '获取用户登录日志',
        description: '获取用户登录记录 (管理员专用)',
        tags: ['Admin Logs'],
      },
    }
  )

  // ==========================================================================
  // 13. GET /api/admin/logs/user-requests - 用户请求日志
  // ==========================================================================
  .get(
    '/user-requests',
    async (ctx): Promise<LogResponse> => {
      try {
        await checkAdminRole(ctx);

        const query = ctx.query as { start?: string; end?: string };
        const service = getAdminLogService();

        const { start, end } = service.normalizeDateRange(
          query.start ? parseInt(query.start) : undefined,
          query.end ? parseInt(query.end) : undefined
        );

        const logs = await service.getUserRequestLogs(start, end);

        return {
          status: 'ok',
          data: logs,
        };
      } catch (error) {
        return {
          status: 'error',
          data: null,
          message: error instanceof Error ? error.message : '获取用户请求日志失败',
        };
      }
    },
    {
      query: t.Object({
        start: t.Optional(t.String()),
        end: t.Optional(t.String()),
      }),
      detail: {
        summary: '获取用户请求日志',
        description: '获取用户操作请求记录 (管理员专用)',
        tags: ['Admin Logs'],
      },
    }
  )

  // ==========================================================================
  // 14. GET /api/admin/logs/wechat-subscribes - 微信订阅消息日志
  // ==========================================================================
  .get(
    '/wechat-subscribes',
    async (ctx): Promise<LogResponse> => {
      try {
        await checkAdminRole(ctx);

        const query = ctx.query as { start?: string; end?: string };
        const service = getAdminLogService();

        const { start, end } = service.normalizeDateRange(
          query.start ? parseInt(query.start) : undefined,
          query.end ? parseInt(query.end) : undefined
        );

        const logs = await service.getWxSubscribeLogs(start, end);

        return {
          status: 'ok',
          data: logs,
        };
      } catch (error) {
        return {
          status: 'error',
          data: null,
          message: error instanceof Error ? error.message : '获取微信订阅消息日志失败',
        };
      }
    },
    {
      query: t.Object({
        start: t.Optional(t.String()),
        end: t.Optional(t.String()),
      }),
      detail: {
        summary: '获取微信订阅消息日志',
        description: '获取微信告警推送记录 (管理员专用)',
        tags: ['Admin Logs'],
      },
    }
  )

  // ==========================================================================
  // 15. GET /api/admin/logs/inner-messages - 内部消息日志
  // ==========================================================================
  .get(
    '/inner-messages',
    async (ctx): Promise<LogResponse> => {
      try {
        await checkAdminRole(ctx);

        const query = ctx.query as { start?: string; end?: string };
        const service = getAdminLogService();

        const { start, end } = service.normalizeDateRange(
          query.start ? parseInt(query.start) : undefined,
          query.end ? parseInt(query.end) : undefined
        );

        const logs = await service.getInnerMessageLogs(start, end);

        return {
          status: 'ok',
          data: logs,
        };
      } catch (error) {
        return {
          status: 'error',
          data: null,
          message: error instanceof Error ? error.message : '获取内部消息日志失败',
        };
      }
    },
    {
      query: t.Object({
        start: t.Optional(t.String()),
        end: t.Optional(t.String()),
      }),
      detail: {
        summary: '获取内部消息日志',
        description: '获取站内信记录 (管理员专用)',
        tags: ['Admin Logs'],
      },
    }
  )

  // ==========================================================================
  // 16. GET /api/admin/logs/bull-queue - Bull队列日志
  // ==========================================================================
  .get(
    '/bull-queue',
    async (ctx): Promise<LogResponse> => {
      try {
        await checkAdminRole(ctx);

        const query = ctx.query as { start?: string; end?: string };
        const service = getAdminLogService();

        const { start, end } = service.normalizeDateRange(
          query.start ? parseInt(query.start) : undefined,
          query.end ? parseInt(query.end) : undefined
        );

        const logs = await service.getBullLogs(start, end);

        return {
          status: 'ok',
          data: logs,
        };
      } catch (error) {
        return {
          status: 'error',
          data: null,
          message: error instanceof Error ? error.message : '获取Bull队列日志失败',
        };
      }
    },
    {
      query: t.Object({
        start: t.Optional(t.String()),
        end: t.Optional(t.String()),
      }),
      detail: {
        summary: '获取Bull队列日志',
        description: '获取任务队列执行记录 (管理员专用)',
        tags: ['Admin Logs'],
      },
    }
  )

  // ==========================================================================
  // 17. GET /api/admin/logs/device-use-time - 设备使用时间
  // ==========================================================================
  .get(
    '/device-use-time',
    async (ctx): Promise<LogResponse> => {
      try {
        await checkAdminRole(ctx);

        const query = ctx.query as { mac: string; start?: string; end?: string };
        const service = getAdminLogService();

        const { start, end } = service.normalizeDateRange(
          query.start ? parseInt(query.start) : undefined,
          query.end ? parseInt(query.end) : undefined
        );

        const logs = await service.getDeviceUseTimeLogs(query.mac, start, end);

        return {
          status: 'ok',
          data: logs,
        };
      } catch (error) {
        return {
          status: 'error',
          data: null,
          message: error instanceof Error ? error.message : '获取设备使用时间日志失败',
        };
      }
    },
    {
      query: t.Object({
        mac: t.String({ minLength: 12 }),
        start: t.Optional(t.String()),
        end: t.Optional(t.String()),
      }),
      detail: {
        summary: '获取设备使用时间',
        description: '获取设备查询耗时记录 (管理员专用)',
        tags: ['Admin Logs'],
      },
    }
  )

  // ==========================================================================
  // 18. GET /api/admin/logs/data-clean - 数据清理记录
  // ==========================================================================
  .get(
    '/data-clean',
    async (ctx): Promise<LogResponse> => {
      try {
        await checkAdminRole(ctx);

        const query = ctx.query as { start?: string; end?: string };
        const service = getAdminLogService();

        const { start, end } = service.normalizeDateRange(
          query.start ? parseInt(query.start) : undefined,
          query.end ? parseInt(query.end) : undefined
        );

        const logs = await service.getDataCleanLogs(start, end);

        return {
          status: 'ok',
          data: logs,
        };
      } catch (error) {
        return {
          status: 'error',
          data: null,
          message: error instanceof Error ? error.message : '获取数据清理日志失败',
        };
      }
    },
    {
      query: t.Object({
        start: t.Optional(t.String()),
        end: t.Optional(t.String()),
      }),
      detail: {
        summary: '获取数据清理记录',
        description: '获取定时清理执行记录 (管理员专用)',
        tags: ['Admin Logs'],
      },
    }
  )

  // ==========================================================================
  // 19. GET /api/admin/logs/user-alarms - 用户告警信息
  // ==========================================================================
  .get(
    '/user-alarms',
    async (ctx): Promise<LogResponse> => {
      try {
        await checkAdminRole(ctx);

        const query = ctx.query as { user: string; start: string; end: string };
        const service = getAdminLogService();

        const logs = await service.getUserAlarmLogs(
          query.user,
          parseInt(query.start),
          parseInt(query.end)
        );

        return {
          status: 'ok',
          data: logs,
        };
      } catch (error) {
        return {
          status: 'error',
          data: null,
          message: error instanceof Error ? error.message : '获取用户告警信息失败',
        };
      }
    },
    {
      query: t.Object({
        user: t.String({ minLength: 1 }),
        start: t.String(),
        end: t.String(),
      }),
      detail: {
        summary: '获取用户告警信息',
        description: '获取指定用户的告警记录 (管理员专用)',
        tags: ['Admin Logs'],
      },
    }
  );
