/**
 * Terminal Repository
 * 负责 Terminal 实体的数据访问和持久化
 * 集成缓存层以提升查询性能
 */

import { mongodb } from '../database/mongodb';
import type { Terminal as TerminalData } from '../types/entities/terminal.entity';
import { TerminalEntity } from '../domain/terminal.entity';
import { logger } from '../utils/logger';
import { terminalCache } from './terminal-cache';

/**
 * Terminal 仓储类
 * 提供实体的获取、查询和批量操作
 */
export class TerminalRepository {
  /**
   * 根据 MAC 地址获取终端实体（带缓存）
   * @param mac - 终端 MAC 地址
   * @returns Terminal 实体或 null
   */
  async findByMac(mac: string): Promise<TerminalEntity | null> {
    // 1. 尝试从缓存获取
    const cached = terminalCache.get(mac);
    if (cached) {
      logger.debug(`Cache hit: ${mac}`);
      return cached;
    }

    // 2. 缓存未命中，从数据库查询
    try {
      const collection = mongodb.getCollection<TerminalData>('terminals');
      const data = await collection.findOne({
        $or: [{ DevMac: mac }, { 'mountDevs.bindDev': mac }],
      });

      if (!data) {
        return null;
      }

      const entity = new TerminalEntity(data);

      // 应用特殊逻辑：pesiv 协议设备在线状态
      entity.updateOnlineStatusForPesiv();

      // 3. 存入缓存
      terminalCache.set(mac, entity);
      logger.debug(`Cache miss: ${mac}, loaded from DB`);

      return entity;
    } catch (error) {
      logger.error(`Failed to find terminal by MAC ${mac}:`, error);
      return null;
    }
  }

  /**
   * 根据节点名称获取终端实体列表（带缓存优化）
   * @param nodeName - 节点名称
   * @returns Terminal 实体数组
   */
  async findByNode(nodeName: string): Promise<TerminalEntity[]> {
    try {
      const collection = mongodb.getCollection<TerminalData>('terminals');
      const dataList = await collection.find({ mountNode: nodeName }).toArray();

      return dataList.map((data) => {
        // 优先使用缓存，避免重置访问计数
        const cached = terminalCache.get(data.DevMac);
        if (cached) {
          return cached;
        }

        // 缓存不存在才创建新实体
        const entity = new TerminalEntity(data);
        entity.updateOnlineStatusForPesiv();
        terminalCache.set(data.DevMac, entity);

        return entity;
      });
    } catch (error) {
      logger.error(`Failed to find terminals by node ${nodeName}:`, error);
      return [];
    }
  }

  /**
   * 根据 MAC 地址数组批量获取终端实体（带缓存优化）
   * @param macs - MAC 地址数组
   * @returns Terminal 实体数组
   */
  async findByMacs(macs: string[]): Promise<TerminalEntity[]> {
    const results: TerminalEntity[] = [];
    const missingMacs: string[] = [];

    // 1. 从缓存批量获取
    for (const mac of macs) {
      const cached = terminalCache.get(mac);
      if (cached) {
        results.push(cached);
      } else {
        missingMacs.push(mac);
      }
    }

    // 2. 从数据库获取缓存未命中的
    if (missingMacs.length > 0) {
      try {
        const collection = mongodb.getCollection<TerminalData>('terminals');
        const dataList = await collection
          .find({ DevMac: { $in: missingMacs } })
          .toArray();

        for (const data of dataList) {
          const entity = new TerminalEntity(data);
          entity.updateOnlineStatusForPesiv();
          results.push(entity);

          // 存入缓存
          terminalCache.set(data.DevMac, entity);
        }

        logger.debug(
          `Batch cache: ${results.length - missingMacs.length} hits, ${missingMacs.length} misses`
        );
      } catch (error) {
        logger.error('Failed to find terminals by MACs:', error);
      }
    }

    return results;
  }

  /**
   * 获取所有在线终端实体
   * @returns 在线终端实体数组
   */
  async findOnlineTerminals(): Promise<TerminalEntity[]> {
    try {
      const collection = mongodb.getCollection<TerminalData>('terminals');
      const dataList = await collection.find({ online: true }).toArray();

      return dataList.map((data) => {
        const entity = new TerminalEntity(data);
        entity.updateOnlineStatusForPesiv();
        return entity;
      });
    } catch (error) {
      logger.error('Failed to find online terminals:', error);
      return [];
    }
  }

  /**
   * 根据过滤条件查询终端实体
   * @param filter - 查询过滤器
   * @returns Terminal 实体数组
   */
  async find(filter: Partial<TerminalData>): Promise<TerminalEntity[]> {
    try {
      const collection = mongodb.getCollection<TerminalData>('terminals');
      const dataList = await collection.find(filter).toArray();

      return dataList.map((data) => {
        const entity = new TerminalEntity(data);
        entity.updateOnlineStatusForPesiv();
        return entity;
      });
    } catch (error) {
      logger.error('Failed to find terminals with filter:', error);
      return [];
    }
  }

  /**
   * 创建或更新终端
   * @param data - 终端数据（必须包含 DevMac）
   * @returns 是否成功
   */
  async upsert(data: TerminalData & { DevMac: string }): Promise<boolean> {
    if (!data.DevMac) {
      throw new Error('DevMac 字段必填');
    }

    try {
      const collection = mongodb.getCollection<TerminalData>('terminals');
      const result = await collection.updateOne(
        { DevMac: data.DevMac },
        {
          $set: {
            ...data,
            uptime: new Date(),
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );

      return result.acknowledged;
    } catch (error) {
      logger.error(`Failed to upsert terminal ${data.DevMac}:`, error);
      return false;
    }
  }

  /**
   * 删除终端
   * @param mac - 终端 MAC
   * @returns 是否成功
   */
  async delete(mac: string): Promise<boolean> {
    try {
      const collection = mongodb.getCollection<TerminalData>('terminals');
      const result = await collection.deleteOne({ DevMac: mac });
      return result.deletedCount > 0;
    } catch (error) {
      logger.error(`Failed to delete terminal ${mac}:`, error);
      return false;
    }
  }

  /**
   * 初始化终端（删除终端及相关数据）
   * @param mac - 终端 MAC
   * @returns 操作耗时(ms)
   */
  async initialize(mac: string): Promise<number> {
    const startTime = Date.now();

    try {
      await Promise.all([
        mongodb.getCollection('log.usebytes').deleteMany({ mac }),
        mongodb.getCollection('log.uartterminaldatatransfinites').deleteMany({ mac }),
        mongodb.getCollection('terminals').deleteOne({ DevMac: mac }),
        mongodb.getCollection('log.dtubusys').deleteMany({ mac }),
        mongodb.getCollection('client.resultcolltions').deleteMany({ mac }),
        mongodb.getCollection('client.resultsingles').deleteMany({ mac }),
        mongodb.getCollection('log.terminals').deleteMany({ TerminalMac: mac }),
      ]);

      logger.info(`Terminal ${mac} initialized (cleaned)`);
    } catch (error) {
      logger.error(`Failed to initialize terminal ${mac}:`, error);
    }

    return Date.now() - startTime;
  }

  /**
   * 批量保存实体的变更
   * @param entities - 实体数组
   * @returns 成功保存的数量
   */
  async flushAll(entities: TerminalEntity[]): Promise<number> {
    let successCount = 0;

    for (const entity of entities) {
      if (entity.hasPendingChanges()) {
        const success = await entity.flush();
        if (success) {
          successCount++;
        }
      }
    }

    if (successCount > 0) {
      logger.debug(`Flushed ${successCount}/${entities.length} terminals`);
    }

    return successCount;
  }
}

/**
 * 导出仓储单例
 */
export const terminalRepository = new TerminalRepository();
