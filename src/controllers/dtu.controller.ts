/**
 * DTU 操作控制器
 * 提供 DTU 远程操作的 REST API 接口
 *
 * 架构层级：
 * Controller → Domain Service (terminalOperationService) → Entity + Infrastructure Service
 */

import { Controller, Get, Post } from '../decorators/controller';
import { Body, Query, Params, User } from '../decorators/params';
import { Validate, type Validated } from '../decorators/validate';
import { terminalOperationService } from '../domain/terminal-operation.service';
import { terminalRepository } from '../repositories/terminal.repository';
import { dtuOperationLogService } from '../services/dtu-operation-log.service';
import type { DtuOperationType } from '../types/socket-events';
import { logger } from '../utils/logger';
import {
  RestartDtuRequestSchema,
  type RestartDtuRequest,
  Restart485RequestSchema,
  type Restart485Request,
  UpdateMountRequestSchema,
  type UpdateMountRequest,
  OperateInstructRequestSchema,
  type OperateInstructRequest,
  SetTerminalRequestSchema,
  type SetTerminalRequest,
  GetTerminalRequestSchema,
  type GetTerminalRequest,
  GetDtuLogsQuerySchema,
  type GetDtuLogsQuery,
  GetDtuStatsQuerySchema,
  type GetDtuStatsQuery,
  GetRecentOperationsParamsSchema,
  type GetRecentOperationsParams,
} from '../schemas/dtu.schema';

/**
 * API 响应基础接口
 */
interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

/**
 * DTU Controller
 * 处理 DTU 远程操作相关的 API 请求
 */
@Controller('/api/dtu')
export class DtuController {
  /**
   * 记录每个设备的最后操作时间（用于速率限制）
   * Key: `${mac}_${operation}`, Value: timestamp
   */
  private recentOperations = new Map<string, number>();

  /**
   * 操作冷却时间配置（毫秒）
   */
  private readonly OPERATION_COOLDOWNS: Record<DtuOperationType, number> = {
    restart: 60000, // 重启 DTU - 1 分钟冷却
    restart485: 30000, // 重启 485 - 30 秒冷却
    updateMount: 10000, // 更新挂载 - 10 秒冷却
    OprateInstruct: 5000, // 透传指令 - 5 秒冷却
    setTerminal: 10000, // 设置终端 - 10 秒冷却
    getTerminal: 5000, // 获取终端 - 5 秒冷却
  };

  /**
   * 检查操作速率限制
   * @param mac - 设备 MAC 地址
   * @param operation - 操作类型
   * @returns { allowed: boolean, remainingTime?: number }
   */
  private checkRateLimit(
    mac: string,
    operation: DtuOperationType
  ): { allowed: boolean; remainingTime?: number } {
    const key = `${mac}_${operation}`;
    const lastOperationTime = this.recentOperations.get(key) || 0;
    const now = Date.now();
    const cooldown = this.OPERATION_COOLDOWNS[operation];
    const timeSinceLastOperation = now - lastOperationTime;

    if (timeSinceLastOperation < cooldown) {
      const remainingTime = Math.ceil((cooldown - timeSinceLastOperation) / 1000);
      return { allowed: false, remainingTime };
    }

    // 更新最后操作时间
    this.recentOperations.set(key, now);

    // 清理过期的操作记录（5 分钟前的记录）
    if (this.recentOperations.size > 1000) {
      const fiveMinutesAgo = now - 300000;
      for (const [k, time] of this.recentOperations.entries()) {
        if (time < fiveMinutesAgo) {
          this.recentOperations.delete(k);
        }
      }
    }

    return { allowed: true };
  }

  /**
   * 重启 DTU
   * POST /api/dtu/restart
   */
  @Post('/restart')
  @Validate(RestartDtuRequestSchema)
  async restartDtu(
    @Body() body: Validated<RestartDtuRequest>,
    @User('userId') userId?: string
  ): Promise<ApiResponse> {
    try {
      const { mac } = body;

      // 检查速率限制
      const rateLimit = this.checkRateLimit(mac, 'restart');
      if (!rateLimit.allowed) {
        return {
          success: false,
          message: `操作过于频繁，请在 ${rateLimit.remainingTime} 秒后重试`,
        };
      }

      // 获取终端实体
      const terminal = await terminalRepository.findByMac(mac);
      if (!terminal) {
        return {
          success: false,
          message: '设备不存在',
        };
      }

      // 调用领域服务
      const operatedBy = userId || 'unknown';
      const result = await terminalOperationService.restart(terminal, operatedBy);

      return {
        success: result.ok === 1,
        message: result.msg,
        data: result.data,
      };
    } catch (error) {
      logger.error('Failed to restart DTU:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error',
      };
    }
  }

  /**
   * 重启 485 接口
   * POST /api/dtu/restart485
   */
  @Post('/restart485')
  @Validate(Restart485RequestSchema)
  async restart485(
    @Body() body: Validated<Restart485Request>,
    @User('userId') userId?: string
  ): Promise<ApiResponse> {
    try {
      const { mac } = body;

      // 检查速率限制
      const rateLimit = this.checkRateLimit(mac, 'restart485');
      if (!rateLimit.allowed) {
        return {
          success: false,
          message: `操作过于频繁，请在 ${rateLimit.remainingTime} 秒后重试`,
        };
      }

      // 获取终端实体
      const terminal = await terminalRepository.findByMac(mac);
      if (!terminal) {
        return {
          success: false,
          message: '设备不存在',
        };
      }

      // 调用领域服务
      const operatedBy = userId || 'unknown';
      const result = await terminalOperationService.restart485(terminal, operatedBy);

      return {
        success: result.ok === 1,
        message: result.msg,
        data: result.data,
      };
    } catch (error) {
      logger.error('Failed to restart 485:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error',
      };
    }
  }

  /**
   * 更新挂载设备配置
   * POST /api/dtu/updateMount
   */
  @Post('/updateMount')
  @Validate(UpdateMountRequestSchema)
  async updateMount(
    @Body() body: Validated<UpdateMountRequest>,
    @User('userId') userId?: string
  ): Promise<ApiResponse> {
    try {
      const { mac, content } = body;

      // 检查速率限制
      const rateLimit = this.checkRateLimit(mac, 'updateMount');
      if (!rateLimit.allowed) {
        return {
          success: false,
          message: `操作过于频繁，请在 ${rateLimit.remainingTime} 秒后重试`,
        };
      }

      // 获取终端实体
      const terminal = await terminalRepository.findByMac(mac);
      if (!terminal) {
        return {
          success: false,
          message: '设备不存在',
        };
      }

      // 调用领域服务
      const operatedBy = userId || 'unknown';
      const result = await terminalOperationService.updateMount(terminal, content, operatedBy);

      return {
        success: result.ok === 1,
        message: result.msg,
        data: result.data,
      };
    } catch (error) {
      logger.error('Failed to update mount:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error',
      };
    }
  }

  /**
   * 透传自定义指令
   * POST /api/dtu/operate
   */
  @Post('/operate')
  @Validate(OperateInstructRequestSchema)
  async operateInstruct(
    @Body() body: Validated<OperateInstructRequest>,
    @User('userId') userId?: string
  ): Promise<ApiResponse> {
    try {
      const { mac, content } = body;

      // 检查速率限制
      const rateLimit = this.checkRateLimit(mac, 'OprateInstruct');
      if (!rateLimit.allowed) {
        return {
          success: false,
          message: `操作过于频繁，请在 ${rateLimit.remainingTime} 秒后重试`,
        };
      }

      // 获取终端实体
      const terminal = await terminalRepository.findByMac(mac);
      if (!terminal) {
        return {
          success: false,
          message: '设备不存在',
        };
      }

      // 调用领域服务
      const operatedBy = userId || 'unknown';
      const result = await terminalOperationService.sendInstruct(terminal, content, operatedBy);

      return {
        success: result.ok === 1,
        message: result.msg,
        data: result.data,
      };
    } catch (error) {
      logger.error('Failed to operate instruct:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error',
      };
    }
  }

  /**
   * 设置终端参数
   * POST /api/dtu/setTerminal
   */
  @Post('/setTerminal')
  @Validate(SetTerminalRequestSchema)
  async setTerminal(
    @Body() body: Validated<SetTerminalRequest>,
    @User('userId') userId?: string
  ): Promise<ApiResponse> {
    try {
      const { mac, content } = body;

      // 检查速率限制
      const rateLimit = this.checkRateLimit(mac, 'setTerminal');
      if (!rateLimit.allowed) {
        return {
          success: false,
          message: `操作过于频繁，请在 ${rateLimit.remainingTime} 秒后重试`,
        };
      }

      // 获取终端实体
      const terminal = await terminalRepository.findByMac(mac);
      if (!terminal) {
        return {
          success: false,
          message: '设备不存在',
        };
      }

      // 调用领域服务
      const operatedBy = userId || 'unknown';
      const result = await terminalOperationService.setTerminal(terminal, content, operatedBy);

      return {
        success: result.ok === 1,
        message: result.msg,
        data: result.data,
      };
    } catch (error) {
      logger.error('Failed to set terminal:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error',
      };
    }
  }

  /**
   * 获取终端信息
   * POST /api/dtu/getTerminal
   */
  @Post('/getTerminal')
  @Validate(GetTerminalRequestSchema)
  async getTerminal(
    @Body() body: Validated<GetTerminalRequest>,
    @User('userId') userId?: string
  ): Promise<ApiResponse> {
    try {
      const { mac } = body;

      // 检查速率限制
      const rateLimit = this.checkRateLimit(mac, 'getTerminal');
      if (!rateLimit.allowed) {
        return {
          success: false,
          message: `操作过于频繁，请在 ${rateLimit.remainingTime} 秒后重试`,
        };
      }

      // 获取终端实体
      const terminal = await terminalRepository.findByMac(mac);
      if (!terminal) {
        return {
          success: false,
          message: '设备不存在',
        };
      }

      // 调用领域服务
      const operatedBy = userId || 'unknown';
      const result = await terminalOperationService.getTerminal(terminal, operatedBy);

      return {
        success: result.ok === 1,
        message: result.msg,
        data: result.data,
      };
    } catch (error) {
      logger.error('Failed to get terminal:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error',
      };
    }
  }

  /**
   * 查询 DTU 操作日志
   * GET /api/dtu/logs
   */
  @Get('/logs')
  @Validate(GetDtuLogsQuerySchema, 'query')
  async getDtuLogs(@Query() query: Validated<GetDtuLogsQuery>): Promise<ApiResponse> {
    try {
      const result = await dtuOperationLogService.queryLogs({
        mac: query.mac,
        operation: query.operation,
        operatedBy: query.operatedBy,
        successOnly: query.successOnly,
        startTime: query.startTime,
        endTime: query.endTime,
        page: query.page,
        limit: query.limit,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      });

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      logger.error('Failed to get DTU logs:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error',
      };
    }
  }

  /**
   * 获取 DTU 操作统计
   * GET /api/dtu/stats
   */
  @Get('/stats')
  @Validate(GetDtuStatsQuerySchema, 'query')
  async getDtuStats(@Query() query: Validated<GetDtuStatsQuery>): Promise<ApiResponse> {
    try {
      const stats = await dtuOperationLogService.getOperationStats(
        query.mac,
        query.startTime,
        query.endTime
      );

      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      logger.error('Failed to get DTU stats:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error',
      };
    }
  }

  /**
   * 获取设备最近操作记录
   * GET /api/dtu/:mac/recent
   */
  @Get('/:mac/recent')
  @Validate(GetRecentOperationsParamsSchema, 'params')
  async getRecentOperations(
    @Params() params: Validated<GetRecentOperationsParams>,
    @Query('limit') limitStr?: string
  ): Promise<ApiResponse> {
    try {
      const { mac } = params;
      const limit = limitStr ? parseInt(limitStr, 10) : 10;

      const logs = await dtuOperationLogService.getRecentOperations(mac, limit);

      return {
        success: true,
        data: logs,
      };
    } catch (error) {
      logger.error('Failed to get recent operations:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error',
      };
    }
  }
}
