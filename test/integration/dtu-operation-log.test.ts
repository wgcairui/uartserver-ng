/**
 * DTU 操作日志服务集成测试
 * 需要真实的 MongoDB 连接
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { mongodb } from '../../src/database/mongodb';
import { dtuOperationLogService } from '../../src/services/dtu-operation-log.service';
import { generateDtuOperationLog, generateDtuOperationLogs, TEST_DATA } from '../helpers/fixtures';
import { testDb } from '../helpers/test-db';

describe('DTU Operation Log Service Integration', () => {
  beforeAll(async () => {
    // Connect both the test database and production mongodb singleton
    await testDb.connect();

    // Connect the production mongodb singleton to the test database
    // This allows the service to work with the test database
    if (!mongodb.isConnected()) {
      await mongodb.connect();
    }

    console.log('🧪 DTU Operation Log Integration Tests Starting...');
  });

  afterAll(async () => {
    await mongodb.disconnect();
    await testDb.disconnect();
  });

  beforeEach(async () => {
    // 每个测试前清空日志集合
    await testDb.clearCollection('log.dtuoperations');
  });

  describe('log()', () => {
    test('should successfully log DTU operation', async () => {
      const logData = generateDtuOperationLog({
        mac: TEST_DATA.devices.device1.mac,
        operation: 'restart',
        success: true,
        operatedBy: 'test-user',
        useTime: 1500,
      });

      await dtuOperationLogService.log(logData);

      // 验证日志已保存
      const logs = await testDb.getCollection('log.dtuoperations').find({}).toArray();
      expect(logs.length).toBe(1);
      expect(logs[0].mac).toBe(TEST_DATA.devices.device1.mac);
      expect(logs[0].operation).toBe('restart');
      expect(logs[0].success).toBe(true);
    });

    test('should handle log operation failure gracefully', async () => {
      // 尝试记录无效的日志（缺少必需字段）
      const invalidLog: any = {
        // mac 缺失
        operation: 'restart',
        success: true,
      };

      // 应该不抛出异常（日志记录失败不应影响主流程）
      // 服务内部捕获错误并记录，但不向外抛出
      let error = null;
      try {
        await dtuOperationLogService.log(invalidLog);
      } catch (e) {
        error = e;
      }

      // 不应该有错误抛出
      expect(error).toBeNull();
    });

    test('should log multiple operations in sequence', async () => {
      const logs = generateDtuOperationLogs(5, {
        mac: TEST_DATA.devices.device1.mac,
        operatedBy: 'test-user',
      });

      for (const log of logs) {
        await dtuOperationLogService.log(log);
      }

      const savedLogs = await testDb.getCollection('log.dtuoperations').find({}).toArray();
      expect(savedLogs.length).toBe(5);
    });
  });

  describe('queryLogs()', () => {
    beforeEach(async () => {
      // 使用固定的基准时间戳，确保所有日志有稳定的时间顺序
      const baseTime = Date.now();

      // 插入测试数据
      const logs = [
        ...generateDtuOperationLogs(5, {
          mac: TEST_DATA.devices.device1.mac,
          operation: 'restart',
          success: true,
          operatedBy: 'user1',
        }, baseTime - 10000), // 10-15秒前
        ...generateDtuOperationLogs(3, {
          mac: TEST_DATA.devices.device2.mac,
          operation: 'getTerminal',
          success: false,
          operatedBy: 'user2',
        }, baseTime - 5000), // 5-8秒前
        ...generateDtuOperationLogs(2, {
          mac: TEST_DATA.devices.device1.mac,
          operation: 'restart485',
          success: true,
          operatedBy: 'user1',
        }, baseTime), // 0-2秒前（最新）
      ];

      await testDb.insertTestData('log.dtuoperations', logs);
    });

    test('should query all logs with default pagination', async () => {
      const result = await dtuOperationLogService.queryLogs();

      expect(result.logs.length).toBeGreaterThan(0);
      expect(result.total).toBe(10);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    test('should filter logs by MAC address', async () => {
      const result = await dtuOperationLogService.queryLogs({
        mac: TEST_DATA.devices.device1.mac,
      });

      expect(result.total).toBe(7); // 5 restart + 2 restart485
      result.logs.forEach((log) => {
        expect(log.mac).toBe(TEST_DATA.devices.device1.mac);
      });
    });

    test('should filter logs by operation type', async () => {
      const result = await dtuOperationLogService.queryLogs({
        operation: 'restart',
      });

      expect(result.total).toBe(5);
      result.logs.forEach((log) => {
        expect(log.operation).toBe('restart');
      });
    });

    test('should filter logs by operatedBy', async () => {
      const result = await dtuOperationLogService.queryLogs({
        operatedBy: 'user1',
      });

      expect(result.total).toBe(7);
      result.logs.forEach((log) => {
        expect(log.operatedBy).toBe('user1');
      });
    });

    test('should filter logs by success status', async () => {
      const successLogs = await dtuOperationLogService.queryLogs({
        successOnly: true,
      });

      expect(successLogs.total).toBe(7);
      successLogs.logs.forEach((log) => {
        expect(log.success).toBe(true);
      });

      const failedLogs = await dtuOperationLogService.queryLogs({
        successOnly: false,
      });

      expect(failedLogs.total).toBe(3);
      failedLogs.logs.forEach((log) => {
        expect(log.success).toBe(false);
      });
    });

    test('should support pagination', async () => {
      const page1 = await dtuOperationLogService.queryLogs({
        page: 1,
        limit: 5,
      });

      expect(page1.logs.length).toBe(5);
      expect(page1.page).toBe(1);
      expect(page1.limit).toBe(5);
      expect(page1.total).toBe(10);
      expect(page1.totalPages).toBe(2);

      const page2 = await dtuOperationLogService.queryLogs({
        page: 2,
        limit: 5,
      });

      expect(page2.logs.length).toBe(5);
      expect(page2.page).toBe(2);

      // 两页数据不应重复
      const page1Ids = page1.logs.map((l) => l._id?.toString());
      const page2Ids = page2.logs.map((l) => l._id?.toString());
      const intersection = page1Ids.filter((id) => page2Ids.includes(id));
      expect(intersection.length).toBe(0);
    });

    test('should support sorting', async () => {
      const ascResult = await dtuOperationLogService.queryLogs({
        sortBy: 'operatedAt',
        sortOrder: 'asc',
      });

      const descResult = await dtuOperationLogService.queryLogs({
        sortBy: 'operatedAt',
        sortOrder: 'desc',
      });

      // 升序和降序结果应该相反
      expect(ascResult.logs[0]?._id?.toString()).toBe(
        descResult.logs[descResult.logs.length - 1]?._id?.toString()
      );
    });

    test('should filter by time range', async () => {
      const now = new Date();
      const oneSecondAgo = new Date(now.getTime() - 1000);
      const twentySecondsAgo = new Date(now.getTime() - 20000);

      const result = await dtuOperationLogService.queryLogs({
        startTime: twentySecondsAgo,
        endTime: oneSecondAgo,
      });

      // 所有日志都在范围内（因为我们的测试数据是最近20秒内生成的）
      expect(result.total).toBeGreaterThan(0);
    });
  });

  describe('getRecentOperations()', () => {
    beforeEach(async () => {
      const logs = generateDtuOperationLogs(15, {
        mac: TEST_DATA.devices.device1.mac,
        operatedBy: 'test-user',
      });

      await testDb.insertTestData('log.dtuoperations', logs);
    });

    test('should get recent operations with default limit', async () => {
      const logs = await dtuOperationLogService.getRecentOperations(TEST_DATA.devices.device1.mac);

      expect(logs.length).toBe(10); // Default limit
      logs.forEach((log) => {
        expect(log.mac).toBe(TEST_DATA.devices.device1.mac);
      });
    });

    test('should respect custom limit', async () => {
      const logs = await dtuOperationLogService.getRecentOperations(
        TEST_DATA.devices.device1.mac,
        5
      );

      expect(logs.length).toBe(5);
    });

    test('should return logs in descending order', async () => {
      const logs = await dtuOperationLogService.getRecentOperations(TEST_DATA.devices.device1.mac);

      for (let i = 1; i < logs.length; i++) {
        const prevTime = new Date(logs[i - 1]!.operatedAt).getTime();
        const currTime = new Date(logs[i]!.operatedAt).getTime();
        expect(prevTime).toBeGreaterThanOrEqual(currTime);
      }
    });

    test('should return empty array for non-existent device', async () => {
      const logs = await dtuOperationLogService.getRecentOperations('NON:EXISTENT:MAC');

      expect(logs.length).toBe(0);
    });
  });

  describe('getOperationStats()', () => {
    beforeEach(async () => {
      const baseTime = Date.now();
      const logs = [
        ...generateDtuOperationLogs(10, {
          mac: TEST_DATA.devices.device1.mac,
          operation: 'restart',
          success: true,
        }, baseTime),
        ...generateDtuOperationLogs(5, {
          mac: TEST_DATA.devices.device1.mac,
          operation: 'restart',
          success: false,
        }, baseTime),
        ...generateDtuOperationLogs(8, {
          mac: TEST_DATA.devices.device2.mac,
          operation: 'getTerminal',
          success: true,
        }, baseTime),
        ...generateDtuOperationLogs(2, {
          mac: TEST_DATA.devices.device2.mac,
          operation: 'getTerminal',
          success: false,
        }, baseTime),
      ];

      await testDb.insertTestData('log.dtuoperations', logs);
    });

    test('should get overall statistics', async () => {
      const stats = await dtuOperationLogService.getOperationStats();

      expect(stats.total).toBe(25);
      expect(stats.success).toBe(18);
      expect(stats.failed).toBe(7);
    });

    test('should get statistics by operation type', async () => {
      const stats = await dtuOperationLogService.getOperationStats();

      expect(stats.byOperation.restart).toBeDefined();
      expect(stats.byOperation.restart!.total).toBe(15);
      expect(stats.byOperation.restart!.success).toBe(10);
      expect(stats.byOperation.restart!.failed).toBe(5);

      expect(stats.byOperation.getTerminal).toBeDefined();
      expect(stats.byOperation.getTerminal!.total).toBe(10);
      expect(stats.byOperation.getTerminal!.success).toBe(8);
      expect(stats.byOperation.getTerminal!.failed).toBe(2);
    });

    test('should filter statistics by MAC', async () => {
      const stats = await dtuOperationLogService.getOperationStats(TEST_DATA.devices.device1.mac);

      // device1 有 15 个操作记录（10 成功 + 5 失败）
      expect(stats.total).toBe(15);
      expect(stats.success).toBe(10);
      expect(stats.failed).toBe(5);
    });
  });

  describe('deleteExpiredLogs()', () => {
    test('should delete logs older than specified date', async () => {
      // 插入不同时间的日志
      const now = Date.now();
      const hundredDaysAgo = now - 100 * 24 * 60 * 60 * 1000;

      const oldLogs = generateDtuOperationLogs(5, {
        mac: TEST_DATA.devices.device1.mac,
      }, hundredDaysAgo); // 100 days ago

      const recentLogs = generateDtuOperationLogs(5, {
        mac: TEST_DATA.devices.device2.mac,
      }, now); // Now

      await testDb.insertTestData('log.dtuoperations', [...oldLogs, ...recentLogs]);

      // 删除 90 天前的日志
      const cutoffDate = new Date(now - 90 * 24 * 60 * 60 * 1000);
      const deletedCount = await dtuOperationLogService.deleteExpiredLogs(cutoffDate);

      expect(deletedCount).toBe(5);

      // 验证只有最近的日志保留
      const remainingLogs = await testDb.getCollection('log.dtuoperations').find({}).toArray();
      expect(remainingLogs.length).toBe(5);
    });
  });
});
