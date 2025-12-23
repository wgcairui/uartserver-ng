/**
 * Alarm API Controller (Phase 4.2 Day 3)
 *
 * 告警管理 API - 5 个端点
 * 对应老系统 api.controller.ts 中的告警相关端点
 */

import { Controller, Get, Put, Post } from '../decorators/controller';
import { Params, Query, Body, User } from '../decorators/params';
import { mongodb } from '../database/mongodb';
import { AlarmApiService } from '../services/alarm-api.service';
import {
  AlarmIdParamsSchema,
  type AlarmIdParams,
  AlarmQuerySchema,
  type AlarmQuery,
  ConfirmAlarmRequestSchema,
  type ConfirmAlarmRequest,
  UnconfirmedCountQuerySchema,
  type UnconfirmedCountQuery,
  UpdateAlarmContactsRequestSchema,
  type UpdateAlarmContactsRequest,
} from '../schemas/alarm.schema';
import type { UserDocument } from '../entities/mongodb';
import { ObjectId } from 'mongodb';

/**
 * 告警 API 控制器
 *
 * 提供告警查询、确认、统计和配置管理功能
 */
@Controller('/api/alarms')
export class AlarmApiController {
  private alarmService: AlarmApiService;

  constructor() {
    this.alarmService = new AlarmApiService(mongodb.getDatabase());
  }

  // ============================================================================
  // 告警查询端点
  // ============================================================================

  /**
   * 1. 获取告警列表
   *
   * GET /api/alarms
   *
   * 支持多维度过滤和分页
   */
  @Get('/')
  async getAlarms(
    @Query(AlarmQuerySchema) query: AlarmQuery,
    @User() currentUser?: UserDocument
  ) {
    if (!currentUser) {
      return {
        status: 'error',
        message: '未授权访问',
        data: null,
      };
    }

    try {
      // 构建查询选项
      const options = {
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
      };

      // 时间范围验证
      if (options.startTime && options.endTime && options.startTime >= options.endTime) {
        return {
          status: 'error',
          message: '开始时间必须早于结束时间',
          data: null,
        };
      }

      const result = await this.alarmService.getAlarms(options);

      return {
        status: 'ok',
        message: '获取告警列表成功',
        data: result,
      };
    } catch (error: any) {
      console.error('[AlarmApiController] getAlarms error:', error);
      return {
        status: 'error',
        message: error.message || '获取告警列表失败',
        data: null,
      };
    }
  }

  /**
   * 1.5 获取单个告警详情 (辅助端点)
   *
   * GET /api/alarms/:id
   */
  @Get('/:id')
  async getAlarmById(
    @Params(AlarmIdParamsSchema) params: AlarmIdParams,
    @User() currentUser?: UserDocument
  ) {
    if (!currentUser) {
      return {
        status: 'error',
        message: '未授权访问',
        data: null,
      };
    }

    try {
      // 验证 ObjectId 格式
      if (!ObjectId.isValid(params.id)) {
        return {
          status: 'error',
          message: '无效的告警 ID 格式',
          data: null,
        };
      }

      const alarm = await this.alarmService.getAlarmById(new ObjectId(params.id));

      if (!alarm) {
        return {
          status: 'error',
          message: '告警不存在',
          data: null,
        };
      }

      return {
        status: 'ok',
        message: '获取告警详情成功',
        data: alarm,
      };
    } catch (error: any) {
      console.error('[AlarmApiController] getAlarmById error:', error);
      return {
        status: 'error',
        message: error.message || '获取告警详情失败',
        data: null,
      };
    }
  }

  /**
   * 2. 确认告警
   *
   * POST /api/alarms/:id/confirm
   *
   * 对应老系统功能,标记告警已确认
   */
  @Post('/:id/confirm')
  async confirmAlarm(
    @Params(AlarmIdParamsSchema) params: AlarmIdParams,
    @Body(ConfirmAlarmRequestSchema) body: ConfirmAlarmRequest,
    @User() currentUser?: UserDocument
  ) {
    if (!currentUser) {
      return {
        status: 'error',
        message: '未授权访问',
        data: null,
      };
    }

    try {
      // 验证 ObjectId 格式
      if (!ObjectId.isValid(params.id)) {
        return {
          status: 'error',
          message: '无效的告警 ID 格式',
          data: null,
        };
      }

      const alarmId = new ObjectId(params.id);
      const userId = currentUser.userId || currentUser.user;
      const comment = body.data.comment;

      // 确认告警
      const success = await this.alarmService.confirmAlarm(alarmId, userId, comment);

      if (!success) {
        return {
          status: 'error',
          message: '告警确认失败,可能已经被确认或不存在',
          data: null,
        };
      }

      return {
        status: 'ok',
        message: '告警确认成功',
        data: { alarmId: params.id, confirmedBy: userId },
      };
    } catch (error: any) {
      console.error('[AlarmApiController] confirmAlarm error:', error);
      return {
        status: 'error',
        message: error.message || '告警确认失败',
        data: null,
      };
    }
  }

  /**
   * 3. 获取未确认告警数量
   *
   * GET /api/alarms/unconfirmed/count
   *
   * 支持按设备和级别过滤
   */
  @Get('/unconfirmed/count')
  async getUnconfirmedCount(
    @Query(UnconfirmedCountQuerySchema) query: UnconfirmedCountQuery,
    @User() currentUser?: UserDocument
  ) {
    if (!currentUser) {
      return {
        status: 'error',
        message: '未授权访问',
        data: null,
      };
    }

    try {
      const count = await this.alarmService.getUnconfirmedCount({
        mac: query.mac,
        level: query.level,
        since: query.since,
      });

      return {
        status: 'ok',
        message: '获取未确认告警数量成功',
        data: { count },
      };
    } catch (error: any) {
      console.error('[AlarmApiController] getUnconfirmedCount error:', error);
      return {
        status: 'error',
        message: error.message || '获取未确认告警数量失败',
        data: null,
      };
    }
  }

  /**
   * 4. 获取告警配置
   *
   * GET /api/alarms/config
   *
   * 返回当前用户的告警通知配置
   * 对应老系统 getUserAlarmSetup 功能
   */
  @Get('/config')
  async getAlarmConfig(@User() currentUser?: UserDocument) {
    if (!currentUser) {
      return {
        status: 'error',
        message: '未授权访问',
        data: null,
      };
    }

    try {
      const userId = currentUser.userId || currentUser.user;
      const config = await this.alarmService.getUserAlarmConfig(userId);

      if (!config) {
        // 返回默认空配置
        return {
          status: 'ok',
          message: '用户尚未配置告警设置',
          data: {
            user: userId,
            tels: [],
            mails: [],
            wxs: [],
            ProtocolSetup: [],
          },
        };
      }

      return {
        status: 'ok',
        message: '获取告警配置成功',
        data: config,
      };
    } catch (error: any) {
      console.error('[AlarmApiController] getAlarmConfig error:', error);
      return {
        status: 'error',
        message: error.message || '获取告警配置失败',
        data: null,
      };
    }
  }

  /**
   * 5. 更新告警联系人
   *
   * PUT /api/alarms/config/contacts
   *
   * 更新用户的告警通知联系方式
   */
  @Put('/config/contacts')
  async updateAlarmContacts(
    @Body(UpdateAlarmContactsRequestSchema) body: UpdateAlarmContactsRequest,
    @User() currentUser?: UserDocument
  ) {
    if (!currentUser) {
      return {
        status: 'error',
        message: '未授权访问',
        data: null,
      };
    }

    try {
      const userId = currentUser.userId || currentUser.user;
      const contacts = body.data;

      // 验证至少有一种联系方式
      const hasContacts =
        (contacts.emails && contacts.emails.length > 0) ||
        (contacts.phones && contacts.phones.length > 0);

      if (!hasContacts) {
        return {
          status: 'error',
          message: '至少需要提供一种联系方式(邮箱或电话)',
          data: null,
        };
      }

      // 更新联系人
      const success = await this.alarmService.updateAlarmContacts(userId, {
        emails: contacts.emails,
        phones: contacts.phones,
        enableEmail: contacts.enableEmail,
        enableSms: contacts.enableSms,
        enablePush: contacts.enablePush,
      });

      if (!success) {
        return {
          status: 'error',
          message: '更新告警联系人失败',
          data: null,
        };
      }

      return {
        status: 'ok',
        message: '更新告警联系人成功',
        data: { userId, updated: true },
      };
    } catch (error: any) {
      console.error('[AlarmApiController] updateAlarmContacts error:', error);
      return {
        status: 'error',
        message: error.message || '更新告警联系人失败',
        data: null,
      };
    }
  }

  /**
   * 6. 获取告警统计信息 (辅助端点)
   *
   * GET /api/alarms/stats
   *
   * 返回告警统计数据(按级别、状态分组)
   */
  @Get('/stats')
  async getAlarmStats(
    @Query(UnconfirmedCountQuerySchema) query: UnconfirmedCountQuery,
    @User() currentUser?: UserDocument
  ) {
    if (!currentUser) {
      return {
        status: 'error',
        message: '未授权访问',
        data: null,
      };
    }

    try {
      const stats = await this.alarmService.getAlarmStats({
        mac: query.mac,
        startTime: query.since,
      });

      return {
        status: 'ok',
        message: '获取告警统计成功',
        data: stats,
      };
    } catch (error: any) {
      console.error('[AlarmApiController] getAlarmStats error:', error);
      return {
        status: 'error',
        message: error.message || '获取告警统计失败',
        data: null,
      };
    }
  }
}
