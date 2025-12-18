/**
 * 测试数据库辅助工具
 * 用于集成测试的 MongoDB 连接和数据管理
 */

import { MongoClient, Db, Collection, Document } from 'mongodb';

const TEST_MONGODB_URI = process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/uart_server_test';

export class TestDatabase {
  private client: MongoClient | null = null;
  private db: Db | null = null;

  /**
   * 连接到测试数据库
   */
  async connect(): Promise<void> {
    if (this.client) {
      return; // 已连接
    }

    this.client = new MongoClient(TEST_MONGODB_URI);
    await this.client.connect();
    this.db = this.client.db();
    console.log('✅ Test database connected');
  }

  /**
   * 断开数据库连接
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      console.log('✅ Test database disconnected');
    }
  }

  /**
   * 获取数据库实例
   */
  getDb(): Db {
    if (!this.db) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.db;
  }

  /**
   * 获取集合
   */
  getCollection<T extends Document = Document>(name: string): Collection<T> {
    return this.getDb().collection<T>(name);
  }

  /**
   * 清空集合
   */
  async clearCollection(name: string): Promise<void> {
    await this.getCollection(name).deleteMany({});
    console.log(`🗑️  Cleared collection: ${name}`);
  }

  /**
   * 清空所有测试集合
   */
  async clearAllCollections(): Promise<void> {
    const collections = [
      'log.dtuoperations',
      'client.resultsingles',
      'client.resultcolltions',
      'user.terminalBindings',
      'terminals',
    ];

    for (const collection of collections) {
      try {
        await this.clearCollection(collection);
      } catch (error) {
        // 集合可能不存在，忽略错误
        console.log(`⚠️  Could not clear ${collection}:`, error);
      }
    }
  }

  /**
   * 插入测试数据
   */
  async insertTestData<T>(collectionName: string, data: T[]): Promise<void> {
    if (data.length === 0) return;
    await this.getCollection(collectionName).insertMany(data as any[]);
    console.log(`✅ Inserted ${data.length} test records into ${collectionName}`);
  }

  /**
   * 等待数据库操作完成（用于测试异步操作）
   */
  async waitFor(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * 全局测试数据库实例
 */
export const testDb = new TestDatabase();
