/**
 * DTU 操作日志服务
 * 负责记录和查询所有 DTU 远程操作历史
 */

import { mongodb } from '../database/mongodb';
import type {
  DtuOperationLog,
  CreateDtuOperationLogParams,
  QueryDtuOperationLogsParams,
  QueryDtuOperationLogsResult,
} from '../types/entities/dtu-operation-log.entity';
import { PaginationHelper } from '../utils/pagination';
import { logger } from '../utils/logger';

class DtuOperationLogService {
  private readonly collectionName = 'log.dtuoperations';

  /**
   * 记录 DTU 操作日志
   * @param params - 日志参数
   */
  async log(params: CreateDtuOperationLogParams): Promise<void> {
    try {
      // 输入验证
      if (!params.mac || typeof params.mac !== 'string') {
        throw new Error(`Invalid MAC address: ${params.mac}`);
      }

      if (!params.operation) {
        throw new Error('Operation type is required');
      }

      if (!params.operatedBy) {
        throw new Error('Operated by is required');
      }

      const log: Omit<DtuOperationLog, '_id'> = {
        mac: params.mac,
        operation: params.operation,
        content: params.content,
        success: params.success,
        message: params.message,
        data: params.data,
        operatedBy: params.operatedBy,
        operatedAt: new Date(),
        useTime: params.useTime,
        nodeName: params.nodeName,
        error: params.error,
      };

      await mongodb
        .getCollection<DtuOperationLog>(this.collectionName)
        .insertOne(log as DtuOperationLog);

      logger.info(
        `DTU operation logged: ${params.mac} - ${params.operation} - ${params.success ? 'SUCCESS' : 'FAILED'} (${params.useTime}ms)`
      );
    } catch (error) {
      logger.error('Failed to log DTU operation:', error);
      // 日志记录失败不应该影响主流程，所以只记录错误不抛出异常
    }
  }

  /**
   * 查询 DTU 操作日志
   * @param params - 查询参数
   */
  async queryLogs(params: QueryDtuOperationLogsParams = {}): Promise<QueryDtuOperationLogsResult> {
    try {
      const {
        mac,
        operation,
        operatedBy,
        successOnly,
        startTime,
        endTime,
        page,
        limit,
        sortBy,
        sortOrder,
      } = params;

      // 使用分页助手
      const pagination = new PaginationHelper(
        { page, limit, sortBy, sortOrder },
        {
          defaultPage: 1,
          defaultLimit: 50,
          maxLimit: 1000,
          defaultSortBy: 'operatedAt',
          defaultSortOrder: 'desc',
        }
      );

      // 构建查询条件
      const filter: any = {};

      if (mac) {
        filter.mac = mac;
      }

      if (operation) {
        filter.operation = operation;
      }

      if (operatedBy) {
        filter.operatedBy = operatedBy;
      }

      if (successOnly !== undefined) {
        filter.success = successOnly;
      }

      if (startTime || endTime) {
        filter.operatedAt = {};
        if (startTime) {
          filter.operatedAt.$gte = startTime;
        }
        if (endTime) {
          filter.operatedAt.$lte = endTime;
        }
      }

      // 执行查询
      const collection = mongodb.getCollection<DtuOperationLog>(this.collectionName);

      const [logs, total] = await Promise.all([
        collection
          .find(filter)
          .sort(pagination.mongoSort)
          .skip(pagination.skip)
          .limit(pagination.limit)
          .toArray(),
        collection.countDocuments(filter),
      ]);

      return {
        logs,
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.ceil(total / pagination.limit),
      };
    } catch (error) {
      logger.error('Failed to query DTU operation logs:', error);
      return {
        logs: [],
        total: 0,
        page: params.page || 1,
        limit: params.limit || 50,
        totalPages: 0,
      };
    }
  }

  /**
   * 获取指定设备的最近操作记录
   * @param mac - 设备 MAC 地址
   * @param limit - 返回数量
   */
  async getRecentOperations(mac: string, limit: number = 10): Promise<DtuOperationLog[]> {
    try {
      const logs = await mongodb
        .getCollection<DtuOperationLog>(this.collectionName)
        .find({ mac })
        .sort({ operatedAt: -1 })
        .limit(limit)
        .toArray();

      return logs;
    } catch (error) {
      logger.error(`Failed to get recent operations for ${mac}:`, error);
      return [];
    }
  }

  /**
   * 获取操作统计信息
   * @param mac - 设备 MAC 地址（可选）
   * @param startTime - 开始时间（可选）
   * @param endTime - 结束时间（可选）
   */
  async getOperationStats(
    mac?: string,
    startTime?: Date,
    endTime?: Date
  ): Promise<{
    total: number;
    success: number;
    failed: number;
    byOperation: Record<string, { total: number; success: number; failed: number }>;
  }> {
    try {
      const filter: any = {};
      if (mac) {
        filter.mac = mac;
      }
      if (startTime || endTime) {
        filter.operatedAt = {};
        if (startTime) {
          filter.operatedAt.$gte = startTime;
        }
        if (endTime) {
          filter.operatedAt.$lte = endTime;
        }
      }

      const stats = await mongodb
        .getCollection<DtuOperationLog>(this.collectionName)
        .aggregate([
          { $match: filter },
          {
            $group: {
              _id: { operation: '$operation', success: '$success' },
              count: { $sum: 1 },
            },
          },
        ])
        .toArray();

      let total = 0;
      let success = 0;
      let failed = 0;
      const byOperation: Record<string, { total: number; success: number; failed: number }> = {};

      for (const stat of stats) {
        const count = stat.count;
        const operation = stat._id.operation;
        const isSuccess = stat._id.success;

        total += count;
        if (isSuccess) {
          success += count;
        } else {
          failed += count;
        }

        if (!byOperation[operation]) {
          byOperation[operation] = { total: 0, success: 0, failed: 0 };
        }
        byOperation[operation].total += count;
        if (isSuccess) {
          byOperation[operation].success += count;
        } else {
          byOperation[operation].failed += count;
        }
      }

      return { total, success, failed, byOperation };
    } catch (error) {
      logger.error('Failed to get operation stats:', error);
      return { total: 0, success: 0, failed: 0, byOperation: {} };
    }
  }

  /**
   * 删除过期的操作日志
   * @param beforeDate - 删除此日期之前的日志
   */
  async deleteExpiredLogs(beforeDate: Date): Promise<number> {
    try {
      const result = await mongodb
        .getCollection<DtuOperationLog>(this.collectionName)
        .deleteMany({
          operatedAt: { $lt: beforeDate },
        });

      const deletedCount = result.deletedCount || 0;
      logger.info(`Deleted ${deletedCount} expired DTU operation logs (before ${beforeDate.toISOString()})`);
      return deletedCount;
    } catch (error) {
      logger.error('Failed to delete expired logs:', error);
      return 0;
    }
  }
}

export const dtuOperationLogService = new DtuOperationLogService();
