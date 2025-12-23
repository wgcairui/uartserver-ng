/**
 * Protocol API Controller (Phase 4.2 Day 3)
 *
 * 协议管理 API - 4 个端点
 * 对应老系统 api.controller.ts 中的协议相关端点
 * 读取老系统数据,保持数据模型兼容性
 */

import { Controller, Get, Put } from '../decorators/controller';
import { Params, Query, Body, User } from '../decorators/params';
import { mongodb } from '../database/mongodb';
import { ProtocolApiService } from '../services/protocol-api.service';
import {
  ProtocolNameParamsSchema,
  type ProtocolNameParams,
  UserProtocolConfigQuerySchema,
  type UserProtocolConfigQuery,
  UpdateUserProtocolConfigRequestSchema,
  type UpdateUserProtocolConfigRequest,
} from '../schemas/protocol.schema';
import type { UserDocument } from '../entities/mongodb';

/**
 * 协议 API 控制器
 *
 * 提供协议查询和用户配置管理功能
 * 所有数据操作基于老系统集合,确保兼容性
 */
@Controller('/api/protocols')
export class ProtocolApiController {
  private protocolService: ProtocolApiService;

  constructor() {
    this.protocolService = new ProtocolApiService(mongodb.getDatabase());
  }

  // ============================================================================
  // 协议查询端点
  // ============================================================================

  /**
   * 1. 获取协议详情
   *
   * GET /api/protocols/:protocol
   *
   * 对应老系统: POST /getProtocol
   * 返回协议的完整定义,包括指令列表和配置
   */
  @Get('/:protocol')
  async getProtocol(
    @Params(ProtocolNameParamsSchema) params: ProtocolNameParams,
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
      const { protocol } = params;

      // 检查协议是否存在
      const protocolExists = await this.protocolService.protocolExists(protocol);
      if (!protocolExists) {
        return {
          status: 'error',
          message: `协议 "${protocol}" 不存在`,
          data: null,
        };
      }

      // 获取协议定义
      const protocolData = await this.protocolService.getProtocol(protocol);

      if (!protocolData) {
        return {
          status: 'error',
          message: '获取协议详情失败',
          data: null,
        };
      }

      return {
        status: 'ok',
        message: '获取协议详情成功',
        data: protocolData,
      };
    } catch (error: any) {
      console.error('[ProtocolApiController] getProtocol error:', error);
      return {
        status: 'error',
        message: error.message || '获取协议详情失败',
        data: null,
      };
    }
  }

  /**
   * 2. 获取协议告警配置
   *
   * GET /api/protocols/:protocol/alarm-config
   *
   * 对应老系统: POST /getAlarmProtocol
   * 返回协议的告警阈值、告警状态等配置
   */
  @Get('/:protocol/alarm-config')
  async getProtocolAlarmConfig(
    @Params(ProtocolNameParamsSchema) params: ProtocolNameParams,
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
      const { protocol } = params;

      // 检查协议是否存在
      const protocolExists = await this.protocolService.protocolExists(protocol);
      if (!protocolExists) {
        return {
          status: 'error',
          message: `协议 "${protocol}" 不存在`,
          data: null,
        };
      }

      // 获取告警配置
      const alarmConfig = await this.protocolService.getProtocolAlarmConfig(protocol);

      if (!alarmConfig) {
        return {
          status: 'ok',
          message: '该协议暂无告警配置',
          data: {
            Protocol: protocol,
            Threshold: [],
            AlarmStat: [],
            ShowTag: [],
          },
        };
      }

      return {
        status: 'ok',
        message: '获取协议告警配置成功',
        data: alarmConfig,
      };
    } catch (error: any) {
      console.error('[ProtocolApiController] getProtocolAlarmConfig error:', error);
      return {
        status: 'error',
        message: error.message || '获取协议告警配置失败',
        data: null,
      };
    }
  }

  /**
   * 3. 获取用户协议配置
   *
   * GET /api/protocols/:protocol/user-config
   *
   * 对应老系统: POST /getUserAlarmProtocol
   * 返回当前用户对特定协议的自定义告警配置
   */
  @Get('/:protocol/user-config')
  async getUserProtocolConfig(
    @Params(ProtocolNameParamsSchema) params: ProtocolNameParams,
    @Query(UserProtocolConfigQuerySchema) query: UserProtocolConfigQuery,
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
      const { protocol } = params;
      const userId = currentUser.userId || currentUser.user;

      // 检查协议是否存在
      const protocolExists = await this.protocolService.protocolExists(protocol);
      if (!protocolExists) {
        return {
          status: 'error',
          message: `协议 "${protocol}" 不存在`,
          data: null,
        };
      }

      // 获取合并配置 (协议默认配置 + 用户自定义配置)
      const config = await this.protocolService.getMergedProtocolConfig(
        protocol,
        userId
      );

      return {
        status: 'ok',
        message: '获取用户协议配置成功',
        data: {
          protocol: config.protocol?.Protocol || protocol,
          defaultConfig: config.defaultConfig,
          userConfig: config.userConfig,
        },
      };
    } catch (error: any) {
      console.error('[ProtocolApiController] getUserProtocolConfig error:', error);
      return {
        status: 'error',
        message: error.message || '获取用户协议配置失败',
        data: null,
      };
    }
  }

  /**
   * 4. 更新用户协议配置
   *
   * PUT /api/protocols/:protocol/user-config
   *
   * 对应老系统: POST /setUserSetupProtocol
   * 允许用户自定义协议的告警阈值和显示标签
   */
  @Put('/:protocol/user-config')
  async updateUserProtocolConfig(
    @Params(ProtocolNameParamsSchema) params: ProtocolNameParams,
    @Body(UpdateUserProtocolConfigRequestSchema) body: UpdateUserProtocolConfigRequest,
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
      const { protocol } = params;
      const userId = currentUser.userId || currentUser.user;
      const config = body.data;

      // 检查协议是否存在
      const protocolExists = await this.protocolService.protocolExists(protocol);
      if (!protocolExists) {
        return {
          status: 'error',
          message: `协议 "${protocol}" 不存在`,
          data: null,
        };
      }

      // 构建更新配置
      const updateConfig: any = {};

      if (config.parameterConfigs) {
        // parameterConfigs 映射为 ShowTag (老系统字段)
        const showTags = Object.keys(config.parameterConfigs).filter(
          (key) => config.parameterConfigs![key].visible !== false
        );
        updateConfig.ShowTag = showTags;
      }

      if (config.alarmOverrides) {
        // alarmOverrides 映射为 Threshold 和 AlarmStat
        const thresholds: Array<{ name: string; min: number; max: number }> = [];
        const alarmStats: Array<{ name: string; alarmStat: string[] }> = [];

        for (const override of config.alarmOverrides) {
          if (!override.enabled) continue;

          if (override.condition) {
            const { operator, value, min, max } = override.condition;

            // 转换为老系统的阈值格式
            if (operator === 'between' && min !== undefined && max !== undefined) {
              thresholds.push({
                name: override.paramName,
                min,
                max,
              });
            } else if (
              (operator === '>' || operator === '>=') &&
              value !== undefined
            ) {
              thresholds.push({
                name: override.paramName,
                min: value,
                max: Number.MAX_SAFE_INTEGER,
              });
            } else if (
              (operator === '<' || operator === '<=') &&
              value !== undefined
            ) {
              thresholds.push({
                name: override.paramName,
                min: Number.MIN_SAFE_INTEGER,
                max: value,
              });
            }
          }
        }

        if (thresholds.length > 0) {
          updateConfig.Threshold = thresholds;
        }
        if (alarmStats.length > 0) {
          updateConfig.AlarmStat = alarmStats;
        }
      }

      // 如果没有任何更新内容,返回错误
      if (Object.keys(updateConfig).length === 0) {
        return {
          status: 'error',
          message: '未提供有效的配置更新',
          data: null,
        };
      }

      // 更新用户协议配置
      const success = await this.protocolService.updateUserProtocolConfig(
        userId,
        protocol,
        updateConfig
      );

      if (!success) {
        return {
          status: 'error',
          message: '更新用户协议配置失败',
          data: null,
        };
      }

      return {
        status: 'ok',
        message: '更新用户协议配置成功',
        data: {
          protocol,
          userId,
          updated: true,
        },
      };
    } catch (error: any) {
      console.error('[ProtocolApiController] updateUserProtocolConfig error:', error);
      return {
        status: 'error',
        message: error.message || '更新用户协议配置失败',
        data: null,
      };
    }
  }

  /**
   * 辅助端点: 获取所有协议列表
   *
   * GET /api/protocols
   *
   * 返回系统中所有可用的协议
   */
  @Get('/')
  async getProtocols(@User() currentUser?: UserDocument) {
    if (!currentUser) {
      return {
        status: 'error',
        message: '未授权访问',
        data: null,
      };
    }

    try {
      const protocols = await this.protocolService.getProtocols();

      return {
        status: 'ok',
        message: '获取协议列表成功',
        data: protocols,
      };
    } catch (error: any) {
      console.error('[ProtocolApiController] getProtocols error:', error);
      return {
        status: 'error',
        message: error.message || '获取协议列表失败',
        data: null,
      };
    }
  }
}
