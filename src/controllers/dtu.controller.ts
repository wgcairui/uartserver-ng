/**
 * DTU 操作控制器
 * 提供 DTU 远程操作的 REST API 接口
 */

import { Controller, Get, Post } from '../decorators/controller';
import { Body, Query, Params, User } from '../decorators/params';
import { socketIoService } from '../services/socket-io.service';
import { dtuOperationLogService } from '../services/dtu-operation-log.service';
import type { DtuOperationType } from '../types/socket-events';
import { logger } from '../utils/logger';

/**
 * API 响应基础接口
 */
interface ApiResponse<T = any> {
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
  async restartDtu(
    @Body('mac') mac: string,
    @User('userId') userId?: string
  ): Promise<ApiResponse> {
    try {
      if (!mac || typeof mac !== 'string') {
        return {
          success: false,
          message: 'Invalid MAC address',
        };
      }

      // 检查速率限制
      const rateLimit = this.checkRateLimit(mac, 'restart');
      if (!rateLimit.allowed) {
        return {
          success: false,
          message: `操作过于频繁，请在 ${rateLimit.remainingTime} 秒后重试`,
        };
      }

      const operatedBy = userId || 'unknown';
      const result = await socketIoService.OprateDTU(mac, 'restart', undefined, operatedBy);

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
  async restart485(
    @Body('mac') mac: string,
    @User('userId') userId?: string
  ): Promise<ApiResponse> {
    try {
      if (!mac || typeof mac !== 'string') {
        return {
          success: false,
          message: 'Invalid MAC address',
        };
      }

      // 检查速率限制
      const rateLimit = this.checkRateLimit(mac, 'restart485');
      if (!rateLimit.allowed) {
        return {
          success: false,
          message: `操作过于频繁，请在 ${rateLimit.remainingTime} 秒后重试`,
        };
      }

      const operatedBy = userId || 'unknown';
      const result = await socketIoService.OprateDTU(mac, 'restart485', undefined, operatedBy);

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
  async updateMount(
    @Body('mac') mac: string,
    @Body('content') content: any,
    @User('userId') userId?: string
  ): Promise<ApiResponse> {
    try {
      if (!mac || typeof mac !== 'string') {
        return {
          success: false,
          message: 'Invalid MAC address',
        };
      }

      if (!content) {
        return {
          success: false,
          message: 'Mount configuration is required',
        };
      }

      // 检查速率限制
      const rateLimit = this.checkRateLimit(mac, 'updateMount');
      if (!rateLimit.allowed) {
        return {
          success: false,
          message: `操作过于频繁，请在 ${rateLimit.remainingTime} 秒后重试`,
        };
      }

      const operatedBy = userId || 'unknown';
      const result = await socketIoService.OprateDTU(mac, 'updateMount', content, operatedBy);

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
  async operateInstruct(
    @Body('mac') mac: string,
    @Body('content') content: any,
    @User('userId') userId?: string
  ): Promise<ApiResponse> {
    try {
      if (!mac || typeof mac !== 'string') {
        return {
          success: false,
          message: 'Invalid MAC address',
        };
      }

      if (!content) {
        return {
          success: false,
          message: 'Instruction content is required',
        };
      }

      // 检查速率限制
      const rateLimit = this.checkRateLimit(mac, 'OprateInstruct');
      if (!rateLimit.allowed) {
        return {
          success: false,
          message: `操作过于频繁，请在 ${rateLimit.remainingTime} 秒后重试`,
        };
      }

      const operatedBy = userId || 'unknown';
      const result = await socketIoService.OprateDTU(mac, 'OprateInstruct', content, operatedBy);

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
  async setTerminal(
    @Body('mac') mac: string,
    @Body('content') content: any,
    @User('userId') userId?: string
  ): Promise<ApiResponse> {
    try {
      if (!mac || typeof mac !== 'string') {
        return {
          success: false,
          message: 'Invalid MAC address',
        };
      }

      if (!content) {
        return {
          success: false,
          message: 'Terminal parameters are required',
        };
      }

      // 检查速率限制
      const rateLimit = this.checkRateLimit(mac, 'setTerminal');
      if (!rateLimit.allowed) {
        return {
          success: false,
          message: `操作过于频繁，请在 ${rateLimit.remainingTime} 秒后重试`,
        };
      }

      const operatedBy = userId || 'unknown';
      const result = await socketIoService.OprateDTU(mac, 'setTerminal', content, operatedBy);

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
  async getTerminal(
    @Body('mac') mac: string,
    @User('userId') userId?: string
  ): Promise<ApiResponse> {
    try {
      if (!mac || typeof mac !== 'string') {
        return {
          success: false,
          message: 'Invalid MAC address',
        };
      }

      // 检查速率限制
      const rateLimit = this.checkRateLimit(mac, 'getTerminal');
      if (!rateLimit.allowed) {
        return {
          success: false,
          message: `操作过于频繁，请在 ${rateLimit.remainingTime} 秒后重试`,
        };
      }

      const operatedBy = userId || 'unknown';
      const result = await socketIoService.OprateDTU(mac, 'getTerminal', undefined, operatedBy);

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
  async getDtuLogs(
    @Query('mac') mac?: string,
    @Query('operation') operation?: string,
    @Query('operatedBy') operatedBy?: string,
    @Query('successOnly') successOnly?: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string
  ): Promise<ApiResponse> {
    try {
      const result = await dtuOperationLogService.queryLogs({
        mac,
        operation: operation as DtuOperationType | undefined,
        operatedBy,
        successOnly: successOnly === 'true' ? true : successOnly === 'false' ? false : undefined,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 50,
        sortBy: (sortBy as 'operatedAt' | 'useTime') || 'operatedAt',
        sortOrder: (sortOrder as 'asc' | 'desc') || 'desc',
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
  async getDtuStats(
    @Query('mac') mac?: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string
  ): Promise<ApiResponse> {
    try {
      const stats = await dtuOperationLogService.getOperationStats(
        mac,
        startTime ? new Date(startTime) : undefined,
        endTime ? new Date(endTime) : undefined
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
  async getRecentOperations(
    @Params('mac') mac: string,
    @Query('limit') limit?: string
  ): Promise<ApiResponse> {
    try {
      if (!mac || typeof mac !== 'string') {
        return {
          success: false,
          message: 'Invalid MAC address',
        };
      }

      const logs = await dtuOperationLogService.getRecentOperations(
        mac,
        limit ? parseInt(limit, 10) : 10
      );

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
