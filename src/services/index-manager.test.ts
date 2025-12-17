import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { MongoDBManager } from '../database/mongodb';
import { IndexManager } from './index-manager';

describe('IndexManager', () => {
  let mongoManager: MongoDBManager;
  let indexManager: IndexManager;

  beforeAll(async () => {
    mongoManager = new MongoDBManager();
    await mongoManager.connect();
    const db = mongoManager.getDatabase();
    indexManager = new IndexManager(db);
  });

  afterAll(async () => {
    await mongoManager.disconnect();
  });

  describe('Index Creation', () => {
    test('should ensure all indexes exist', async () => {
      // 这个测试会创建所有索引
      await indexManager.ensureAllIndexes();

      // 验证索引创建成功
      const summary = await indexManager.getIndexSummary();
      expect(summary.totalCollections).toBeGreaterThan(0);
      expect(summary.totalIndexes).toBeGreaterThan(0);
    }, 60000); // 60秒超时，因为创建索引可能需要时间

    test('should handle duplicate index creation gracefully', async () => {
      // 再次创建索引应该不会报错
      await indexManager.ensureAllIndexes();

      const summary = await indexManager.getIndexSummary();
      expect(summary.totalIndexes).toBeGreaterThan(0);
    });
  });

  describe('Index Listing', () => {
    test('should list all indexes', async () => {
      const allIndexes = await indexManager.listAllIndexes();
      expect(allIndexes).toBeDefined();
      expect(typeof allIndexes).toBe('object');
    });

    test('should return index summary', async () => {
      const summary = await indexManager.getIndexSummary();

      expect(summary).toHaveProperty('totalCollections');
      expect(summary).toHaveProperty('totalIndexes');
      expect(summary).toHaveProperty('indexesByCollection');

      expect(summary.totalCollections).toBeGreaterThan(0);
      expect(summary.totalIndexes).toBeGreaterThan(0);
      expect(typeof summary.indexesByCollection).toBe('object');
    });
  });

  describe('Critical Indexes Verification', () => {
    test('terminals collection should have required indexes', async () => {
      const allIndexes = await indexManager.listAllIndexes();
      const terminalIndexes = allIndexes['terminals'] || [];

      const indexNames = terminalIndexes.map(idx => idx.name);

      // 验证关键索引存在
      expect(indexNames).toContain('DevMac_1');
      expect(indexNames).toContain('online_1');
    });

    test('client.resultcolltions should have time-series index', async () => {
      const allIndexes = await indexManager.listAllIndexes();
      const resultIndexes = allIndexes['client.resultcolltions'] || [];

      const indexNames = resultIndexes.map(idx => idx.name).filter((name): name is string => !!name);

      // 验证时间序列复合索引存在
      expect(indexNames.some(name => name.includes('mac') && name.includes('pid') && name.includes('timeStamp')))
        .toBe(true);
    });

    test('users collection should have unique indexes', async () => {
      const allIndexes = await indexManager.listAllIndexes();
      const userIndexes = allIndexes['users'] || [];

      // 查找唯一索引
      const uniqueIndexes = userIndexes.filter(idx => idx.unique);

      // 至少应该有 userId 和 user 字段的唯一索引
      expect(uniqueIndexes.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('TTL Indexes Verification', () => {
    test('log collections should have TTL indexes', async () => {
      const allIndexes = await indexManager.listAllIndexes();

      // 检查 log.terminals 集合
      const logTerminals = allIndexes['log.terminals'] || [];
      const hasTTL = logTerminals.some(idx => idx.expireAfterSeconds !== undefined);

      expect(hasTTL).toBe(true);
    });
  });
});
