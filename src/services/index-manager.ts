/**
 * MongoDB 索引管理服务
 * 自动创建和管理所有集合的索引
 */

import type { Db, IndexDescription, CreateIndexesOptions } from 'mongodb';

/**
 * 索引定义接口
 */
interface IndexSpec {
  key: Record<string, 1 | -1>;
  options?: CreateIndexesOptions;
}

interface IndexDefinition {
  collection: string;
  indexes: IndexSpec[];
}

/**
 * 索引管理服务类
 */
export class IndexManager {
  private db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  /**
   * 确保所有索引存在
   */
  async ensureAllIndexes(): Promise<void> {
    console.log('📋 开始创建/更新索引...');
    const startTime = Date.now();

    const indexDefinitions = this.getIndexDefinitions();
    let totalCreated = 0;
    let totalExisting = 0;

    for (const def of indexDefinitions) {
      try {
        const result = await this.ensureCollectionIndexes(def);
        totalCreated += result.created;
        totalExisting += result.existing;
      } catch (error) {
        console.error(`❌ 集合 ${def.collection} 索引创建失败:`, error);
        throw error;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ 索引创建/更新完成: ${totalCreated} 个新建, ${totalExisting} 个已存在, 耗时 ${duration}ms`);
  }

  /**
   * 为单个集合创建索引
   */
  private async ensureCollectionIndexes(def: IndexDefinition): Promise<{
    created: number;
    existing: number;
  }> {
    const collection = this.db.collection(def.collection);
    let created = 0;
    let existing = 0;

    console.log(`  📂 ${def.collection}: 创建 ${def.indexes.length} 个索引...`);

    for (const index of def.indexes) {
      const indexName = this.generateIndexName(index.key);
      const options: CreateIndexesOptions = {
        ...index.options,
        name: index.options?.name || indexName,
        background: true, // 后台创建，不阻塞数据库
      };

      try {
        await collection.createIndex(index.key, options);
        created++;
        console.log(`    ✓ ${indexName}`);
      } catch (error: any) {
        // 索引已存在的错误可以忽略 (code 85: IndexOptionsConflict, code 86: IndexKeySpecsConflict)
        if (error.code === 85 || error.code === 86) {
          existing++;
          console.log(`    ○ ${indexName} (已存在)`);
        } else {
          throw error;
        }
      }
    }

    return { created, existing };
  }

  /**
   * 生成索引名称
   */
  private generateIndexName(key: Record<string, 1 | -1>): string {
    return Object.entries(key)
      .map(([field, direction]) => `${field}_${direction}`)
      .join('_');
  }

  /**
   * 获取所有索引定义
   * 总计 24 个集合，65 个索引
   */
  private getIndexDefinitions(): IndexDefinition[] {
    return [
      // ============ 核心业务集合 (3个) ============
      {
        collection: 'terminals',
        indexes: [
          { key: { DevMac: 1 }, options: { unique: true } },
          { key: { online: 1 } },
          { key: { ICCID: 1 } },
          { key: { mountNode: 1 } },
          { key: { ownerId: 1 } },
          { key: { 'mountDevs.pid': 1 } },
          { key: { online: 1, UT: -1 } },
        ],
      },

      {
        collection: 'client.resultcolltions',
        indexes: [
          { key: { mac: 1, pid: 1, timeStamp: -1 } }, // 最重要的复合索引
          { key: { timeStamp: -1 } },
          { key: { hasAlarm: 1, timeStamp: -1 } },
          { key: { parentId: 1 } },
        ],
      },

      {
        collection: 'client.resultsingles',
        indexes: [
          { key: { mac: 1, pid: 1 } },
          { key: { parentId: 1 } },
        ],
      },

      // ============ 用户相关集合 (6个) ============
      {
        collection: 'users',
        indexes: [
          { key: { userId: 1 }, options: { unique: true } },
          { key: { user: 1 }, options: { unique: true } },
          { key: { tel: 1 }, options: { unique: true, sparse: true } },
          { key: { openId: 1 } },
          { key: { userGroup: 1 } },
        ],
      },

      {
        collection: 'user.binddevices',
        indexes: [{ key: { user: 1 }, options: { unique: true } }],
      },

      {
        collection: 'user.aggregations',
        indexes: [{ key: { user: 1, id: 1 }, options: { unique: true } }],
      },

      {
        collection: 'user.layouts',
        indexes: [{ key: { user: 1, type: 1 } }],
      },

      {
        collection: 'user.wxpubilcs',
        indexes: [
          { key: { openid: 1 }, options: { unique: true } },
          { key: { unionid: 1 } },
        ],
      },

      {
        collection: 'user.alarmsetups',
        indexes: [{ key: { user: 1 }, options: { unique: true } }],
      },

      // ============ 协议和设备类型 (3个) ============
      {
        collection: 'device.protocols',
        indexes: [
          { key: { Protocol: 1 }, options: { unique: true } },
          { key: { Type: 1 } },
        ],
      },

      {
        collection: 'device.constants',
        indexes: [{ key: { Protocol: 1 }, options: { unique: true } }],
      },

      {
        collection: 'device.argumentalias',
        indexes: [{ key: { mac: 1, pid: 1 }, options: { unique: true } }],
      },

      // ============ 日志集合（带 TTL）(8个) ============
      {
        collection: 'log.terminals',
        indexes: [
          { key: { TerminalMac: 1, timeStamp: -1 } },
          { key: { timeStamp: -1 }, options: { expireAfterSeconds: 2592000 } }, // 30 天
        ],
      },

      {
        collection: 'log.uartterminaldatatransfinites',
        indexes: [
          { key: { mac: 1, pid: 1, timeStamp: -1 } },
          { key: { timeStamp: -1 }, options: { expireAfterSeconds: 7776000 } }, // 90 天
          { key: { isOk: 1, timeStamp: -1 } },
        ],
      },

      {
        collection: 'log.UserRequests',
        indexes: [
          { key: { user: 1, timeStamp: -1 } },
          { key: { timeStamp: -1 }, options: { expireAfterSeconds: 7776000 } }, // 90 天
        ],
      },

      {
        collection: 'log.instructquerys',
        indexes: [
          { key: { mac: 1, timeStamp: -1 } },
          { key: { timeStamp: -1 }, options: { expireAfterSeconds: 2592000 } }, // 30 天
        ],
      },

      {
        collection: 'log.usebytes',
        indexes: [
          { key: { mac: 1, date: 1 }, options: { unique: true } },
          { key: { date: 1 } },
        ],
      },

      {
        collection: 'log.usetime',
        indexes: [
          { key: { mac: 1, pid: 1, timeStamp: -1 } },
          { key: { timeStamp: -1 }, options: { expireAfterSeconds: 2592000 } }, // 30 天
        ],
      },

      {
        collection: 'log.wxsubscribeMessages',
        indexes: [
          { key: { touser: 1, timeStamp: -1 } },
          { key: { timeStamp: -1 }, options: { expireAfterSeconds: 7776000 } }, // 90 天
        ],
      },

      {
        collection: 'log.innerMessages',
        indexes: [
          { key: { user: 1, timeStamp: -1 } },
          { key: { timeStamp: -1 } },
        ],
      },

      // ============ 其他集合 (4个) ============
      {
        collection: 'node.clients',
        indexes: [{ key: { Name: 1 }, options: { unique: true } }],
      },

      {
        collection: 'terminal.registers',
        indexes: [{ key: { DevMac: 1 }, options: { unique: true } }],
      },

      {
        collection: 'dev.register',
        indexes: [{ key: { id: 1 }, options: { unique: true } }],
      },

      {
        collection: 'amap.loctioncaches',
        indexes: [
          { key: { key: 1 }, options: { unique: true } },
          { key: { createdAt: 1 }, options: { expireAfterSeconds: 2592000 } }, // 30 天
        ],
      },
    ];
  }

  /**
   * 列出所有集合的索引
   */
  async listAllIndexes(): Promise<Record<string, IndexDescription[]>> {
    const collections = await this.db.listCollections().toArray();
    const result: Record<string, IndexDescription[]> = {};

    for (const collInfo of collections) {
      const collection = this.db.collection(collInfo.name);
      const indexes = await collection.indexes();
      result[collInfo.name] = indexes;
    }

    return result;
  }

  /**
   * 分析指定集合的索引使用情况
   */
  async analyzeIndexUsage(collectionName: string): Promise<any[]> {
    const collection = this.db.collection(collectionName);
    const stats = await collection.aggregate([{ $indexStats: {} }]).toArray();
    return stats;
  }

  /**
   * 删除未使用的索引
   */
  async dropUnusedIndexes(collectionName: string, threshold: number = 0): Promise<string[]> {
    const stats = await this.analyzeIndexUsage(collectionName);
    const droppedIndexes: string[] = [];

    for (const stat of stats) {
      // 不删除 _id 索引
      if (stat.name === '_id_') {
        continue;
      }

      // 如果访问次数低于阈值，删除索引
      if (stat.accesses.ops <= threshold) {
        const collection = this.db.collection(collectionName);
        await collection.dropIndex(stat.name);
        droppedIndexes.push(stat.name);
        console.log(`  ✓ 已删除未使用的索引: ${stat.name}`);
      }
    }

    return droppedIndexes;
  }

  /**
   * 获取索引统计摘要
   */
  async getIndexSummary(): Promise<{
    totalCollections: number;
    totalIndexes: number;
    indexesByCollection: Record<string, number>;
  }> {
    const allIndexes = await this.listAllIndexes();

    const totalCollections = Object.keys(allIndexes).length;
    const indexesByCollection: Record<string, number> = {};
    let totalIndexes = 0;

    for (const [collection, indexes] of Object.entries(allIndexes)) {
      indexesByCollection[collection] = indexes.length;
      totalIndexes += indexes.length;
    }

    return {
      totalCollections,
      totalIndexes,
      indexesByCollection,
    };
  }
}
