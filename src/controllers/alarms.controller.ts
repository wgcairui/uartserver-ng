/**
 * Alarms Controller
 *
 * 告警管理 API:
 * - 获取告警列表
 * - 获取告警详情
 * - 确认告警
 * - 解决告警
 */

import { Controller, Get, Post } from '../decorators/controller';
import { Params, Query, Body } from '../decorators/params';
import type { Alarm } from '../services/alarm-rule-engine.service';
import {
  ListAlarmsQuerySchema,
  type ListAlarmsQuery,
  AlarmIdParamsSchema,
  type AlarmIdParams,
  AcknowledgeAlarmBodySchema,
  type AcknowledgeAlarmBody,
  ResolveAlarmBodySchema,
  type ResolveAlarmBody,
  AlarmStatsQuerySchema,
  type AlarmStatsQuery,
} from '../schemas/alarms.schema';

/**
 * Alarms Controller
 */
@Controller('/api/alarms')
export class AlarmsController {
  /**
   * 获取告警列表
   *
   * GET /api/alarms?level={level}&mac={mac}&acknowledged={ack}&resolved={resolved}
   */
  @Get('/')
  async listAlarms(@Query(ListAlarmsQuerySchema) query: ListAlarmsQuery) {
    const { level, mac, pid, acknowledged, resolved, limit, page } = query;
    console.log('[AlarmsController] List alarms:', {
      level,
      mac,
      pid,
      acknowledged,
      resolved,
    });

    // TODO: 从数据库查询告警列表
    const alarms: Alarm[] = [];

    return {
      status: 'ok',
      data: {
        alarms,
        total: alarms.length,
        page,
        limit,
      },
    };
  }

  /**
   * 获取告警详情
   *
   * GET /api/alarms/:id
   */
  @Get('/:id')
  async getAlarm(@Params(AlarmIdParamsSchema) params: AlarmIdParams) {
    const { id } = params;
    console.log(`[AlarmsController] Get alarm: ${id}`);

    // TODO: 从数据库查询告警详情

    return {
      status: 'ok',
      data: {
        id,
        // ... 告警详情
      },
    };
  }

  /**
   * 确认告警
   *
   * POST /api/alarms/:id/acknowledge
   *
   * Body: { userId: string, comment?: string }
   */
  @Post('/:id/acknowledge')
  async acknowledgeAlarm(
    @Params(AlarmIdParamsSchema) params: AlarmIdParams,
    @Body(AcknowledgeAlarmBodySchema) body: AcknowledgeAlarmBody
  ) {
    const { id } = params;
    const { userId, comment } = body;
    console.log(`[AlarmsController] Acknowledge alarm: ${id} by ${userId}`);

    // TODO: 更新告警状态为已确认
    // 1. 查询告警
    // 2. 更新 acknowledged = true
    // 3. 记录确认人和时间
    // 4. 记录备注

    return {
      status: 'ok',
      message: 'Alarm acknowledged',
      data: {
        id,
        acknowledgedBy: userId,
        acknowledgedAt: new Date(),
        comment,
      },
    };
  }

  /**
   * 解决告警
   *
   * POST /api/alarms/:id/resolve
   *
   * Body: { userId: string, solution?: string }
   */
  @Post('/:id/resolve')
  async resolveAlarm(
    @Params(AlarmIdParamsSchema) params: AlarmIdParams,
    @Body(ResolveAlarmBodySchema) body: ResolveAlarmBody
  ) {
    const { id } = params;
    const { userId, solution } = body;
    console.log(`[AlarmsController] Resolve alarm: ${id} by ${userId}`);

    // TODO: 更新告警状态为已解决
    // 1. 查询告警
    // 2. 更新 resolved = true
    // 3. 记录解决人和时间
    // 4. 记录解决方案

    return {
      status: 'ok',
      message: 'Alarm resolved',
      data: {
        id,
        resolvedBy: userId,
        resolvedAt: new Date(),
        solution,
      },
    };
  }

  /**
   * 获取告警统计
   *
   * GET /api/alarms/stats
   */
  @Get('/stats')
  async getAlarmStats(@Query(AlarmStatsQuerySchema) query: AlarmStatsQuery) {
    const { startTime, endTime } = query;
    console.log('[AlarmsController] Get alarm stats:', { startTime, endTime });

    // TODO: 统计告警数据
    // - 按级别统计
    // - 按设备统计
    // - 趋势分析

    return {
      status: 'ok',
      data: {
        byLevel: {
          critical: 0,
          error: 0,
          warning: 0,
          info: 0,
        },
        total: 0,
        acknowledged: 0,
        resolved: 0,
      },
    };
  }
}
