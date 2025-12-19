/**
 * Alarm Rules Controller
 *
 * 告警规则管理 API:
 * - 获取规则列表
 * - 获取规则详情
 * - 创建规则
 * - 更新规则
 * - 删除规则
 * - 启用/禁用规则
 */

import { Controller, Get, Post, Put, Delete } from '../decorators/controller';
import { Params, Body, Query } from '../decorators/params';
import { AlarmRuleEngineService } from '../services/alarm-rule-engine.service';
import type { AlarmRuleType, AlarmLevel } from '../services/alarm-rule-engine.service';
import type { AlarmRuleDocument, ThresholdCondition, ConstantCondition } from '../entities/mongodb';
import { ObjectId } from 'mongodb';
import { mongodb } from '../database/mongodb';

/**
 * 创建规则请求体
 */
export interface CreateRuleRequest {
  /** 规则名称 */
  name: string;
  /** 规则描述 */
  description?: string;
  /** 规则类型 */
  type: AlarmRuleType;
  /** 告警级别 */
  level: AlarmLevel;
  /** 目标协议 */
  protocol?: string;
  /** 设备 PID (可选) */
  pid?: string | number;
  /** 参数名称 */
  paramName?: string;
  /** 阈值条件 */
  threshold?: ThresholdCondition;
  /** 常量条件 */
  constant?: ConstantCondition;
  /** 自定义脚本 */
  customScript?: string;
  /** 去重时间窗口 (秒) */
  deduplicationWindow?: number;
  /** 创建人 */
  createdBy: string;
}

/**
 * 更新规则请求体
 */
export interface UpdateRuleRequest {
  /** 规则名称 */
  name?: string;
  /** 规则描述 */
  description?: string;
  /** 告警级别 */
  level?: AlarmLevel;
  /** 目标协议 */
  protocol?: string;
  /** 设备 PID */
  pid?: string | number;
  /** 参数名称 */
  paramName?: string;
  /** 阈值条件 */
  threshold?: ThresholdCondition;
  /** 常量条件 */
  constant?: ConstantCondition;
  /** 自定义脚本 */
  customScript?: string;
  /** 去重时间窗口 (秒) */
  deduplicationWindow?: number;
  /** 是否启用 */
  enabled?: boolean;
  /** 更新人 */
  updatedBy?: string;
}

/**
 * Alarm Rules Controller
 */
@Controller('/api/alarm-rules')
export class AlarmRulesController {
  private alarmEngine: AlarmRuleEngineService;

  constructor() {
    // 初始化告警规则引擎
    this.alarmEngine = new AlarmRuleEngineService(mongodb.getDatabase());
  }

  /**
   * 获取规则列表
   *
   * GET /api/alarm-rules?type={type}&level={level}&enabled={enabled}&protocol={protocol}
   */
  @Get('/')
  async listRules(
    @Query('type') type?: string,
    @Query('level') level?: string,
    @Query('enabled') enabled?: string,
    @Query('protocol') protocol?: string,
    @Query('limit') limit: string = '50',
    @Query('page') page: string = '1'
  ) {
    console.log('[AlarmRulesController] List rules:', { type, level, enabled, protocol });

    try {
      // 构建查询过滤器
      const filter: any = {};

      if (type) filter.type = type;
      if (level) filter.level = level;
      if (enabled !== undefined) filter.enabled = enabled === 'true';
      if (protocol) filter.protocol = protocol;

      // 查询规则列表
      const allRules = await this.alarmEngine.getRules(filter);

      // 分页
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const startIndex = (pageNum - 1) * limitNum;
      const endIndex = startIndex + limitNum;

      const rules = allRules.slice(startIndex, endIndex);

      return {
        status: 'ok',
        data: {
          rules,
          total: allRules.length,
          page: pageNum,
          limit: limitNum,
          hasMore: endIndex < allRules.length,
        },
      };
    } catch (error) {
      console.error('[AlarmRulesController] Error listing rules:', error);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to list rules',
        data: null,
      };
    }
  }

  /**
   * 获取规则详情
   *
   * GET /api/alarm-rules/:id
   */
  @Get('/:id')
  async getRule(@Params('id') id: string) {
    console.log(`[AlarmRulesController] Get rule: ${id}`);

    try {
      // 验证 ID 格式
      if (!ObjectId.isValid(id)) {
        return {
          status: 'error',
          message: 'Invalid rule ID format',
          data: null,
        };
      }

      // 查询规则详情
      const rules = await this.alarmEngine.getRules({ _id: new ObjectId(id) });

      if (rules.length === 0) {
        return {
          status: 'error',
          message: 'Rule not found',
          data: null,
        };
      }

      return {
        status: 'ok',
        data: rules[0],
      };
    } catch (error) {
      console.error('[AlarmRulesController] Error getting rule:', error);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to get rule',
        data: null,
      };
    }
  }

  /**
   * 创建规则
   *
   * POST /api/alarm-rules
   *
   * Body: CreateRuleRequest
   */
  @Post('/')
  async createRule(@Body('data') data: CreateRuleRequest) {
    console.log('[AlarmRulesController] Create rule:', data);

    try {
      // 验证必填字段
      if (!data.name) {
        return {
          status: 'error',
          message: 'Rule name is required',
          data: null,
        };
      }

      if (!data.type) {
        return {
          status: 'error',
          message: 'Rule type is required',
          data: null,
        };
      }

      if (!data.level) {
        return {
          status: 'error',
          message: 'Alarm level is required',
          data: null,
        };
      }

      if (!data.createdBy) {
        return {
          status: 'error',
          message: 'Creator user ID is required',
          data: null,
        };
      }

      // 根据规则类型验证条件
      if (data.type === 'threshold' && !data.threshold) {
        return {
          status: 'error',
          message: 'Threshold condition is required for threshold rule',
          data: null,
        };
      }

      if (data.type === 'constant' && !data.constant) {
        return {
          status: 'error',
          message: 'Constant condition is required for constant rule',
          data: null,
        };
      }

      // 构建规则文档
      const now = new Date();
      const rule: Omit<AlarmRuleDocument, '_id'> = {
        name: data.name,
        description: data.description,
        type: data.type,
        level: data.level,
        protocol: data.protocol,
        pid: data.pid,
        paramName: data.paramName,
        threshold: data.threshold,
        constant: data.constant,
        customScript: data.customScript,
        enabled: true,
        deduplicationWindow: data.deduplicationWindow || 300,
        triggerCount: 0,
        createdBy: data.createdBy,
        createdAt: now,
        updatedAt: now,
      };

      // 添加规则
      const ruleId = await this.alarmEngine.addRule(rule as AlarmRuleDocument);

      return {
        status: 'ok',
        message: 'Rule created successfully',
        data: {
          id: ruleId.toString(),
          ...rule,
        },
      };
    } catch (error) {
      console.error('[AlarmRulesController] Error creating rule:', error);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to create rule',
        data: null,
      };
    }
  }

  /**
   * 更新规则
   *
   * PUT /api/alarm-rules/:id
   *
   * Body: UpdateRuleRequest
   */
  @Put('/:id')
  async updateRule(@Params('id') id: string, @Body('data') data: UpdateRuleRequest) {
    console.log(`[AlarmRulesController] Update rule: ${id}`, data);

    try {
      // 验证 ID 格式
      if (!ObjectId.isValid(id)) {
        return {
          status: 'error',
          message: 'Invalid rule ID format',
          data: null,
        };
      }

      // 验证规则是否存在
      const existingRules = await this.alarmEngine.getRules({ _id: new ObjectId(id) });
      if (existingRules.length === 0) {
        return {
          status: 'error',
          message: 'Rule not found',
          data: null,
        };
      }

      // 更新规则
      const updates: Partial<AlarmRuleDocument> = {
        ...data,
        updatedAt: new Date(),
      };

      await this.alarmEngine.updateRule(id, updates);

      // 获取更新后的规则
      const updatedRules = await this.alarmEngine.getRules({ _id: new ObjectId(id) });

      return {
        status: 'ok',
        message: 'Rule updated successfully',
        data: updatedRules[0],
      };
    } catch (error) {
      console.error('[AlarmRulesController] Error updating rule:', error);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to update rule',
        data: null,
      };
    }
  }

  /**
   * 删除规则
   *
   * DELETE /api/alarm-rules/:id
   */
  @Delete('/:id')
  async deleteRule(@Params('id') id: string) {
    console.log(`[AlarmRulesController] Delete rule: ${id}`);

    try {
      // 验证 ID 格式
      if (!ObjectId.isValid(id)) {
        return {
          status: 'error',
          message: 'Invalid rule ID format',
          data: null,
        };
      }

      // 验证规则是否存在
      const existingRules = await this.alarmEngine.getRules({ _id: new ObjectId(id) });
      if (existingRules.length === 0) {
        return {
          status: 'error',
          message: 'Rule not found',
          data: null,
        };
      }

      // 删除规则
      await this.alarmEngine.deleteRule(id);

      return {
        status: 'ok',
        message: 'Rule deleted successfully',
        data: {
          id,
          deletedAt: new Date(),
        },
      };
    } catch (error) {
      console.error('[AlarmRulesController] Error deleting rule:', error);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to delete rule',
        data: null,
      };
    }
  }

  /**
   * 启用规则
   *
   * POST /api/alarm-rules/:id/enable
   */
  @Post('/:id/enable')
  async enableRule(@Params('id') id: string, @Body('userId') userId: string = 'system') {
    console.log(`[AlarmRulesController] Enable rule: ${id}`);

    try {
      // 验证 ID 格式
      if (!ObjectId.isValid(id)) {
        return {
          status: 'error',
          message: 'Invalid rule ID format',
          data: null,
        };
      }

      // 验证规则是否存在
      const existingRules = await this.alarmEngine.getRules({ _id: new ObjectId(id) });
      if (existingRules.length === 0) {
        return {
          status: 'error',
          message: 'Rule not found',
          data: null,
        };
      }

      // 启用规则
      await this.alarmEngine.updateRule(id, {
        enabled: true,
        updatedBy: userId,
        updatedAt: new Date(),
      });

      // 刷新规则缓存
      await this.alarmEngine.refreshRulesCache();

      return {
        status: 'ok',
        message: 'Rule enabled successfully',
        data: {
          id,
          enabled: true,
        },
      };
    } catch (error) {
      console.error('[AlarmRulesController] Error enabling rule:', error);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to enable rule',
        data: null,
      };
    }
  }

  /**
   * 禁用规则
   *
   * POST /api/alarm-rules/:id/disable
   */
  @Post('/:id/disable')
  async disableRule(@Params('id') id: string, @Body('userId') userId: string = 'system') {
    console.log(`[AlarmRulesController] Disable rule: ${id}`);

    try {
      // 验证 ID 格式
      if (!ObjectId.isValid(id)) {
        return {
          status: 'error',
          message: 'Invalid rule ID format',
          data: null,
        };
      }

      // 验证规则是否存在
      const existingRules = await this.alarmEngine.getRules({ _id: new ObjectId(id) });
      if (existingRules.length === 0) {
        return {
          status: 'error',
          message: 'Rule not found',
          data: null,
        };
      }

      // 禁用规则
      await this.alarmEngine.updateRule(id, {
        enabled: false,
        updatedBy: userId,
        updatedAt: new Date(),
      });

      // 刷新规则缓存
      await this.alarmEngine.refreshRulesCache();

      return {
        status: 'ok',
        message: 'Rule disabled successfully',
        data: {
          id,
          enabled: false,
        },
      };
    } catch (error) {
      console.error('[AlarmRulesController] Error disabling rule:', error);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to disable rule',
        data: null,
      };
    }
  }

  /**
   * 批量启用规则
   *
   * POST /api/alarm-rules/batch/enable
   *
   * Body: { ids: string[], userId?: string }
   */
  @Post('/batch/enable')
  async batchEnableRules(@Body('ids') ids: string[], @Body('userId') userId: string = 'system') {
    console.log('[AlarmRulesController] Batch enable rules:', ids);

    try {
      if (!ids || ids.length === 0) {
        return {
          status: 'error',
          message: 'No rule IDs provided',
          data: null,
        };
      }

      const results = [];
      for (const id of ids) {
        try {
          await this.alarmEngine.updateRule(id, {
            enabled: true,
            updatedBy: userId,
            updatedAt: new Date(),
          });
          results.push({ id, success: true });
        } catch (error) {
          results.push({
            id,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // 刷新规则缓存
      await this.alarmEngine.refreshRulesCache();

      return {
        status: 'ok',
        message: 'Batch enable completed',
        data: {
          total: ids.length,
          succeeded: results.filter((r) => r.success).length,
          failed: results.filter((r) => !r.success).length,
          results,
        },
      };
    } catch (error) {
      console.error('[AlarmRulesController] Error batch enabling rules:', error);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to batch enable rules',
        data: null,
      };
    }
  }

  /**
   * 批量禁用规则
   *
   * POST /api/alarm-rules/batch/disable
   *
   * Body: { ids: string[], userId?: string }
   */
  @Post('/batch/disable')
  async batchDisableRules(@Body('ids') ids: string[], @Body('userId') userId: string = 'system') {
    console.log('[AlarmRulesController] Batch disable rules:', ids);

    try {
      if (!ids || ids.length === 0) {
        return {
          status: 'error',
          message: 'No rule IDs provided',
          data: null,
        };
      }

      const results = [];
      for (const id of ids) {
        try {
          await this.alarmEngine.updateRule(id, {
            enabled: false,
            updatedBy: userId,
            updatedAt: new Date(),
          });
          results.push({ id, success: true });
        } catch (error) {
          results.push({
            id,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // 刷新规则缓存
      await this.alarmEngine.refreshRulesCache();

      return {
        status: 'ok',
        message: 'Batch disable completed',
        data: {
          total: ids.length,
          succeeded: results.filter((r) => r.success).length,
          failed: results.filter((r) => !r.success).length,
          results,
        },
      };
    } catch (error) {
      console.error('[AlarmRulesController] Error batch disabling rules:', error);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to batch disable rules',
        data: null,
      };
    }
  }

  /**
   * 获取规则统计信息
   *
   * GET /api/alarm-rules/stats
   */
  @Get('/stats')
  async getRuleStats() {
    console.log('[AlarmRulesController] Get rule stats');

    try {
      const allRules = await this.alarmEngine.getRules();

      const stats = {
        total: allRules.length,
        enabled: allRules.filter((r) => r.enabled).length,
        disabled: allRules.filter((r) => !r.enabled).length,
        byType: {
          threshold: allRules.filter((r) => r.type === 'threshold').length,
          constant: allRules.filter((r) => r.type === 'constant').length,
          offline: allRules.filter((r) => r.type === 'offline').length,
          timeout: allRules.filter((r) => r.type === 'timeout').length,
          custom: allRules.filter((r) => r.type === 'custom').length,
        },
        byLevel: {
          info: allRules.filter((r) => r.level === 'info').length,
          warning: allRules.filter((r) => r.level === 'warning').length,
          error: allRules.filter((r) => r.level === 'error').length,
          critical: allRules.filter((r) => r.level === 'critical').length,
        },
        totalTriggers: allRules.reduce((sum, r) => sum + (r.triggerCount || 0), 0),
        mostTriggered: allRules
          .sort((a, b) => (b.triggerCount || 0) - (a.triggerCount || 0))
          .slice(0, 5)
          .map((r) => ({
            id: r._id?.toString(),
            name: r.name,
            triggerCount: r.triggerCount || 0,
          })),
      };

      return {
        status: 'ok',
        data: stats,
      };
    } catch (error) {
      console.error('[AlarmRulesController] Error getting rule stats:', error);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to get rule stats',
        data: null,
      };
    }
  }
}
