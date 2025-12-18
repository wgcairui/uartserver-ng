/**
 * MongoDB 连接管理器
 * 使用 MongoDB Native Driver 实现高性能连接管理
 */

import { MongoClient, Db, Collection, Document, MongoClientOptions } from 'mongodb';
import { derivedConfig } from '../config';

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
    await this.client.connect();

    // 提取数据库名称
    const dbName = this.extractDatabaseName(derivedConfig.mongodbUri);
    this.db = this.client.db(dbName);

    console.log(`✓ MongoDB 已连接: ${dbName}`);
  }

  /**
   * 从 URI 中提取数据库名称
   */
  private extractDatabaseName(uri: string): string {
    const match = uri.match(/\/([^/?]+)(\?|$)/);
    return match?.[1] || 'uart_server';
  }

  /**
   * 断开 MongoDB 连接
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
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
    try {
      if (!this.isConnected()) {
        return false;
      }
      // 执行 ping 命令
      await this.getDatabase().admin().ping();
      return true;
    } catch (error) {
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
      return {
        connected: false,
        database: '',
        collections: 0,
      };
    }

    const collections = await this.getDatabase().listCollections().toArray();

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
