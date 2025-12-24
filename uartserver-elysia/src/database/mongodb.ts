/**
 * MongoDB 连接管理器
 * 使用 MongoDB Native Driver 实现高性能连接管理
 */

import { MongoClient, Db, Collection, Document, MongoClientOptions } from 'mongodb';
import { derivedConfig } from '../config';
import { databaseMetrics } from '../services/metrics/database-metrics';
import { initializePhase3Collections } from '../entities/mongodb';

/**
 * MongoDB 连接管理器类
 * 单例模式，全局共享一个连接实例
 */
export class MongoDBManager {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private connectionPromise: Promise<void> | null = null;

  /**
   * 连接到 MongoDB
   */
  async connect(): Promise<void> {
    // 如果已经连接，直接返回
    if (this.isConnected()) {
      return;
    }

    // 如果正在连接中，等待连接完成
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // 创建新的连接
    this.connectionPromise = this._connect();
    await this.connectionPromise;
    this.connectionPromise = null;
  }

  /**
   * 内部连接实现
   */
  private async _connect(): Promise<void> {
    const options: MongoClientOptions = {
      maxPoolSize: 50, // 最大连接池大小
      minPoolSize: 10, // 最小连接池大小
      maxIdleTimeMS: 30000, // 连接最大空闲时间 30s
      serverSelectionTimeoutMS: 5000, // 服务器选择超时 5s
      socketTimeoutMS: 45000, // Socket 超时 45s
      compressors: ['zlib'], // 启用压缩
    };

    this.client = new MongoClient(derivedConfig.mongodbUri, options);

    // 添加命令监控监听器
    this.setupMonitoring(this.client);

    await this.client.connect();

    // 提取数据库名称
    const dbName = this.extractDatabaseName(derivedConfig.mongodbUri);
    this.db = this.client.db(dbName);

    // 记录连接成功
    databaseMetrics.recordConnectionStatus(true);
    databaseMetrics.recordConnectionCreated();

    console.log(`✓ MongoDB 已连接: ${dbName}`);

    // 初始化 Phase 3 集合和索引
    await initializePhase3Collections(this.db);

    // 启动连接池监控
    this.startPoolMonitoring();
  }

  /**
   * 从 URI 中提取数据库名称
   */
  private extractDatabaseName(uri: string): string {
    const match = uri.match(/\/([^/?]+)(\?|$)/);
    return match?.[1] || 'uart_server';
  }

  /**
   * 设置 MongoDB 命令监控
   */
  private setupMonitoring(client: MongoClient): void {
    // 命令开始监控 - 记录开始时间
    const commandStartTimes = new Map<number, number>();

    client.on('commandStarted', (event) => {
      commandStartTimes.set(event.requestId, Date.now());
    });

    // 命令成功监控
    client.on('commandSucceeded', (event) => {
      const startTime = commandStartTimes.get(event.requestId);
      if (startTime) {
        const duration = Date.now() - startTime;
        databaseMetrics.recordOperation(event.commandName, duration, false);
        commandStartTimes.delete(event.requestId);
      }
    });

    // 命令失败监控
    client.on('commandFailed', (event) => {
      const startTime = commandStartTimes.get(event.requestId);
      if (startTime) {
        const duration = Date.now() - startTime;
        databaseMetrics.recordOperation(event.commandName, duration, true);
        commandStartTimes.delete(event.requestId);
      }
    });

    // 连接池事件监控
    client.on('connectionCreated', () => {
      databaseMetrics.recordConnectionCreated();
    });

    client.on('connectionClosed', () => {
      databaseMetrics.recordConnectionClosed();
    });

    client.on('connectionCheckOutFailed', () => {
      databaseMetrics.recordConnectionError();
    });
  }

  /**
   * 启动连接池监控
   * 定期更新连接池指标
   */
  private poolMonitoringInterval: NodeJS.Timeout | null = null;

  private startPoolMonitoring(): void {
    // 每 10 秒更新一次连接池指标
    this.poolMonitoringInterval = setInterval(() => {
      if (!this.client) return;

      try {
        // 注意：MongoDB Node.js Driver 没有直接暴露连接池统计信息的 API
        // 这里我们只能记录配置的最大和最小连接池大小
        // 实际的活跃连接数需要通过 APM 或其他监控工具获取
        databaseMetrics.updatePoolMetrics({
          poolSize: 50, // maxPoolSize 配置值
          activeConnections: 0, // 无法直接获取，需要使用 APM
          availableConnections: 0, // 无法直接获取
          waitQueueSize: 0, // 无法直接获取
        });
      } catch (error) {
        console.error('Failed to update pool metrics:', error);
      }
    }, 10000);
  }

  /**
   * 停止连接池监控
   */
  private stopPoolMonitoring(): void {
    if (this.poolMonitoringInterval) {
      clearInterval(this.poolMonitoringInterval);
      this.poolMonitoringInterval = null;
    }
  }

  /**
   * 断开 MongoDB 连接
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      // 停止连接池监控
      this.stopPoolMonitoring();

      await this.client.close();

      // 记录断开连接
      databaseMetrics.recordConnectionStatus(false);
      databaseMetrics.recordConnectionClosed();

      this.client = null;
      this.db = null;
      console.log('✓ MongoDB 已断开连接');
    }
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.client !== null && this.db !== null;
  }

  /**
   * 获取数据库实例
   */
  getDatabase(): Db {
    if (!this.db) {
      throw new Error('MongoDB 未连接，请先调用 connect()');
    }
    return this.db;
  }

  /**
   * 获取客户端实例
   */
  getClient(): MongoClient {
    if (!this.client) {
      throw new Error('MongoDB 未连接，请先调用 connect()');
    }
    return this.client;
  }

  /**
   * 获取集合
   */
  getCollection<T extends Document = Document>(name: string): Collection<T> {
    return this.getDatabase().collection<T>(name);
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    const startTime = Date.now();

    try {
      if (!this.isConnected()) {
        const duration = Date.now() - startTime;
        databaseMetrics.recordHealthCheck(false, duration);
        return false;
      }

      // 执行 ping 命令
      await this.getDatabase().admin().ping();

      const duration = Date.now() - startTime;
      databaseMetrics.recordHealthCheck(true, duration);

      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      databaseMetrics.recordHealthCheck(false, duration);

      console.error('MongoDB 健康检查失败:', error);
      return false;
    }
  }

  /**
   * 获取连接统计信息
   */
  async getStats(): Promise<{
    connected: boolean;
    database: string;
    collections: number;
  }> {
    if (!this.isConnected()) {
      databaseMetrics.updateCollectionsCount(0);
      return {
        connected: false,
        database: '',
        collections: 0,
      };
    }

    const collections = await this.getDatabase().listCollections().toArray();

    // 更新集合数量指标
    databaseMetrics.updateCollectionsCount(collections.length);

    return {
      connected: true,
      database: this.getDatabase().databaseName,
      collections: collections.length,
    };
  }
}

/**
 * 全局 MongoDB 管理器实例
 */
export const mongodb = new MongoDBManager();

/**
 * 初始化 MongoDB 连接
 */
export async function initMongoDB(): Promise<void> {
  await mongodb.connect();
}

/**
 * 关闭 MongoDB 连接
 */
export async function closeMongoDB(): Promise<void> {
  await mongodb.disconnect();
}
