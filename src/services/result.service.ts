/**
 * Result Service - 查询结果存储服务
 * 负责将设备查询结果存储到 MongoDB
 */

import { mongodb } from '../database/mongodb';
import type {
  TerminalClientResult,
  TerminalClientResultSingle,
  SaveResultItem,
} from '../types/entities/result.entity';
import { logger } from '../utils/logger';
import { webSocketService } from './websocket.service';
import { getRoomName } from '../types/websocket-events';

/**
 * 扩展的保存结果项类型
 * 解析器可能返回包含告警、单位、模拟标记的数据
 */
type SaveResultItemExtended = SaveResultItem & {
  /** 是否告警（可选） */
  alarm?: boolean;
  /** 单位（可选） */
  unit?: string;
  /** 是否模拟数据（可选） */
  issimulate?: boolean;
};

class ResultService {
  /**
   * 存储查询结果到 MongoDB
   * 同时更新历史集合和单例集合
   * @param mac - 终端 MAC 地址
   * @param pid - 协议 ID
   * @param result - 解析后的结果数据
   * @param timeStamp - 时间戳
   * @param useTime - 响应时间(ms)
   * @param parentId - 父记录 ID
   * @param hasAlarm - 是否包含告警
   * @param Interval - 查询间隔
   */
  async saveQueryResult(params: {
    mac: string;
    pid: number;
    result: SaveResultItemExtended[];
    timeStamp: number;
    useTime: number;
    parentId: string;
    hasAlarm: number;
    Interval: number;
  }): Promise<void> {
    const { mac, pid, result, timeStamp, useTime, parentId, hasAlarm, Interval } = params;

    // 输入验证
    if (!mac || typeof mac !== 'string') {
      throw new Error(`Invalid MAC address: ${mac}`);
    }
    if (typeof pid !== 'number' || pid < 0 || !Number.isInteger(pid)) {
      throw new Error(`Invalid PID: ${pid}`);
    }
    if (!Array.isArray(result) || result.length === 0) {
      logger.warn(`Empty or invalid result for ${mac}/${pid}`);
      return; // 空结果不存储
    }
    if (typeof timeStamp !== 'number' || timeStamp <= 0) {
      throw new Error(`Invalid timestamp: ${timeStamp}`);
    }

    // 使用事务确保两个集合操作的原子性
    const session = mongodb.getClient().startSession();

    try {
      await session.withTransaction(async () => {
        // 1. 存储到历史集合 (client.resultcolltions)
        const historicalResult: Omit<TerminalClientResult, '_id'> = {
          mac,
          pid,
          result: result.map((r) => ({
            name: r.name,
            value: r.value,
            parseValue: r.parseValue,
          })),
          timeStamp,
          useTime,
          parentId,
          hasAlarm,
        };

        await mongodb
          .getCollection<TerminalClientResult>('client.resultcolltions')
          .insertOne(historicalResult as TerminalClientResult, { session });

        // 2. 更新单例集合 (client.resultsingles) - upsert
        //    注意：单例集合需要完整的 ResultItem (包含 alarm, unit, issimulate)
        //    如果 result 中已包含这些字段则使用实际值，否则使用默认值
        const singleResult: Omit<TerminalClientResultSingle, '_id'> = {
          mac,
          pid,
          result: result.map((r) => ({
            name: r.name,
            value: r.value,
            parseValue: r.parseValue,
            alarm: r.alarm ?? false, // 使用实际值或默认 false
            unit: r.unit ?? '', // 使用实际值或空字符串
            issimulate: r.issimulate ?? false, // 使用实际值或默认 false
          })),
          time: new Date(timeStamp).toISOString(),
          useTime,
          parentId,
          Interval,
        };

        await mongodb
          .getCollection<TerminalClientResultSingle>('client.resultsingles')
          .updateOne({ mac, pid }, { $set: singleResult }, { upsert: true, session });
      });

      logger.debug(`Result saved: ${mac}/${pid}, ${result.length} items, hasAlarm=${hasAlarm}`);

      // 推送实时数据给订阅用户（异步，不等待）
      this.pushRealTimeUpdate(mac, pid, singleResult, hasAlarm).catch((error) => {
        logger.error(`Failed to push real-time update for ${mac}/${pid}:`, error);
      });
    } catch (error) {
      logger.error(`Failed to save query result for ${mac}/${pid}:`, error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * 推送实时数据更新（异步，不阻塞主流程）
   */
  private async pushRealTimeUpdate(
    mac: string,
    pid: number,
    data: Omit<TerminalClientResultSingle, '_id'>,
    hasAlarm: number
  ): Promise<void> {
    try {
      const room = getRoomName(mac, pid);
      const subscriberCount = webSocketService.getRoomSubscriberCount(mac, pid);

      // 如果没有订阅者，跳过推送
      if (subscriberCount === 0) {
        return;
      }

      // 推送数据更新
      webSocketService.pushToRoom(room, {
        type: 'data',
        mac,
        pid,
        data: data as TerminalClientResultSingle,
        timestamp: Date.now(),
      });

      // 如果有告警，额外推送告警消息
      if (hasAlarm > 0) {
        webSocketService.pushToRoom(room, {
          type: 'alarm',
          mac,
          pid,
          alarmType: 'data_alarm',
          alarmLevel: 'warning',
          message: '设备数据存在告警',
          timestamp: Date.now(),
          data: data.result.filter((r) => r.alarm),
        });
      }

      logger.debug(`Pushed real-time update to ${subscriberCount} subscribers in room ${room}`);
    } catch (error) {
      // 推送失败不应该影响主流程，只记录日志
      logger.error('Failed to push real-time update:', error);
    }
  }

  /**
   * 获取最新的查询结果
   * @param mac - 终端 MAC 地址
   * @param pid - 协议 ID
   */
  async getLatestResult(mac: string, pid: number): Promise<TerminalClientResultSingle | null> {
    try {
      const result = await mongodb
        .getCollection<TerminalClientResultSingle>('client.resultsingles')
        .findOne({ mac, pid });

      return result;
    } catch (error) {
      logger.error(`Failed to get latest result for ${mac}/${pid}:`, error);
      return null;
    }
  }

  /**
   * 获取历史查询结果
   * @param mac - 终端 MAC 地址
   * @param pid - 协议 ID
   * @param startTime - 开始时间戳
   * @param endTime - 结束时间戳
   * @param limit - 返回数量限制
   */
  async getHistoricalResults(
    mac: string,
    pid: number,
    startTime: number,
    endTime: number,
    limit: number = 1000
  ): Promise<TerminalClientResult[]> {
    try {
      const results = await mongodb
        .getCollection<TerminalClientResult>('client.resultcolltions')
        .find({
          mac,
          pid,
          timeStamp: { $gte: startTime, $lte: endTime },
        })
        .sort({ timeStamp: -1 })
        .limit(limit)
        .toArray();

      return results;
    } catch (error) {
      logger.error(`Failed to get historical results for ${mac}/${pid}:`, error);
      return [];
    }
  }

  /**
   * 获取指定参数的历史数据
   * @param mac - 终端 MAC 地址
   * @param pid - 协议 ID
   * @param paramNames - 参数名称数组
   * @param startTime - 开始时间戳
   * @param endTime - 结束时间戳
   */
  async getParameterHistory(
    mac: string,
    pid: number,
    paramNames: string[],
    startTime: number,
    endTime: number
  ): Promise<Array<{ name: string; value: string; time: number }>> {
    try {
      const results = await mongodb
        .getCollection<TerminalClientResult>('client.resultcolltions')
        .aggregate<{ name: string; value: string; time: number }>([
          {
            $match: {
              mac,
              pid,
              timeStamp: { $gte: startTime, $lte: endTime },
            },
          },
          { $project: { timeStamp: 1, result: 1 } },
          { $unwind: '$result' },
          {
            $match: {
              'result.name': { $in: paramNames },
            },
          },
          {
            $project: {
              name: '$result.name',
              value: '$result.parseValue',
              time: '$timeStamp',
              _id: 0,
            },
          },
          { $sort: { time: 1 } },
        ])
        .toArray();

      return results;
    } catch (error) {
      logger.error(`Failed to get parameter history for ${mac}/${pid}:`, error);
      return [];
    }
  }

  /**
   * 删除过期的历史数据
   * @param beforeTimestamp - 删除此时间戳之前的数据
   */
  async deleteExpiredResults(beforeTimestamp: number): Promise<number> {
    try {
      const result = await mongodb
        .getCollection<TerminalClientResult>('client.resultcolltions')
        .deleteMany({
          timeStamp: { $lt: beforeTimestamp },
        });

      logger.info(`Deleted ${result.deletedCount} expired results (before ${new Date(beforeTimestamp).toISOString()})`);
      return result.deletedCount || 0;
    } catch (error) {
      logger.error('Failed to delete expired results:', error);
      return 0;
    }
  }
}

export const resultService = new ResultService();
