import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { MongoDBManager } from './mongodb';

describe('MongoDB Connection Manager', () => {
  let mongoManager: MongoDBManager;

  beforeAll(async () => {
    mongoManager = new MongoDBManager();
  });

  afterAll(async () => {
    await mongoManager.disconnect();
  });

  describe('Connection Management', () => {
    test('should connect to MongoDB successfully', async () => {
      await mongoManager.connect();
      expect(mongoManager.isConnected()).toBe(true);
    });

    test('should get database instance', () => {
      const db = mongoManager.getDatabase();
      expect(db).toBeDefined();
      expect(db.databaseName).toBe('uart_server');
    });

    test('should get client instance', () => {
      const client = mongoManager.getClient();
      expect(client).toBeDefined();
    });

    test('should handle multiple connect calls gracefully', async () => {
      await mongoManager.connect();
      await mongoManager.connect();
      expect(mongoManager.isConnected()).toBe(true);
    });
  });

  describe('Collection Access', () => {
    test('should get collection', () => {
      const collection = mongoManager.getCollection('terminals');
      expect(collection).toBeDefined();
      expect(collection.collectionName).toBe('terminals');
    });

    test('should return collections with same name', () => {
      const col1 = mongoManager.getCollection('terminals');
      const col2 = mongoManager.getCollection('terminals');
      expect(col1.collectionName).toBe(col2.collectionName);
      expect(col1.collectionName).toBe('terminals');
    });
  });

  describe('Health Check', () => {
    test('should perform health check successfully', async () => {
      const isHealthy = await mongoManager.healthCheck();
      expect(isHealthy).toBe(true);
    });
  });

  describe('Graceful Shutdown', () => {
    test('should disconnect gracefully', async () => {
      await mongoManager.disconnect();
      expect(mongoManager.isConnected()).toBe(false);
    });

    test('should handle multiple disconnect calls', async () => {
      await mongoManager.disconnect();
      await mongoManager.disconnect();
      expect(mongoManager.isConnected()).toBe(false);
    });
  });
});
