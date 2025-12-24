/**
 * Alarm Routes Integration Tests (Phase 7)
 *
 * 告警路由集成测试 - 验证所有告警 API 端点功能
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import type { App } from '../../src/index';

// 创建测试客户端
const api = treaty<App>('localhost:3333');

describe('Alarm Routes Integration Tests', () => {
  beforeAll(async () => {
    // 确保服务器运行
    const { data, error } = await api.health.get();
    if (error || data?.status !== 'ok') {
      throw new Error('Server is not running on localhost:3333');
    }
  });

  /**
   * 测试 1: GET /api/alarms (获取告警列表)
   */
  describe('GET /api/alarms', () => {
    test('应该返回分页的告警列表', async () => {
      const { data, error } = await api.api.alarms.get({
        query: {
          page: '1',
          limit: '10',
        },
      });

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
      expect(data?.data).toBeDefined();
      expect(data?.data?.data).toBeInstanceOf(Array);
      expect(data?.data?.page).toBe(1);
      expect(data?.data?.limit).toBe(10);
      expect(data?.data?.total).toBeTypeOf('number');
      expect(data?.data?.totalPages).toBeTypeOf('number');
    });

    test('应该支持状态过滤', async () => {
      const { data, error } = await api.api.alarms.get({
        query: {
          page: '1',
          limit: '5',
          status: 'active',
        },
      });

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
      expect(data?.data?.limit).toBe(5);
    });

    test('应该支持级别过滤', async () => {
      const { data, error } = await api.api.alarms.get({
        query: {
          page: '1',
          limit: '5',
          level: 'critical',
        },
      });

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
    });

    test('应该支持排序', async () => {
      const { data, error } = await api.api.alarms.get({
        query: {
          page: '1',
          limit: '5',
          sortBy: 'timeStamp',
          sortOrder: 'desc',
        },
      });

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
    });
  });

  /**
   * 测试 2: GET /api/alarms/stats (获取告警统计)
   */
  describe('GET /api/alarms/stats', () => {
    test('应该返回告警统计信息', async () => {
      const { data, error } = await api.api.alarms.stats.get();

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
      expect(data?.data).toBeDefined();
      expect(data?.data?.total).toBeTypeOf('number');
      expect(data?.data?.byLevel).toBeDefined();
      expect(data?.data?.byStatus).toBeDefined();
    });

    test('应该支持 MAC 过滤', async () => {
      const testMac = '00:11:22:33:44:55';
      const { data, error } = await api.api.alarms.stats.get({
        query: {
          mac: testMac,
        },
      });

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
    });
  });

  /**
   * 测试 3: GET /api/alarms/unconfirmed/count (获取未确认告警数量)
   */
  describe('GET /api/alarms/unconfirmed/count', () => {
    test('应该返回未确认告警数量', async () => {
      const { data, error } = await api.api.alarms.unconfirmed.count.get();

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
      expect(data?.data).toBeDefined();
      expect(data?.data?.count).toBeTypeOf('number');
      expect(data?.data?.count).toBeGreaterThanOrEqual(0);
    });

    test('应该支持级别过滤', async () => {
      const { data, error } = await api.api.alarms.unconfirmed.count.get({
        query: {
          level: 'critical',
        },
      });

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
    });
  });

  /**
   * 测试 4: POST /api/alarms/confirm (确认告警)
   */
  describe('POST /api/alarms/confirm', () => {
    test('应该拒绝无效的告警 ID', async () => {
      const { data, error } = await api.api.alarms.confirm.post({
        data: {
          id: 'invalid-id',
          comment: 'test',
        } as any,
      });

      // Zod 验证应该拒绝无效 ID
      expect(error).not.toBeNull();
      expect(error?.status).toBe(400); // Validation error
    });

    test('应该接受有效的告警 ID 格式', async () => {
      // 使用一个有效的 ObjectId 格式（即使告警不存在）
      const validObjectId = '507f1f77bcf86cd799439011';

      const { data, error } = await api.api.alarms.confirm.post({
        data: {
          id: validObjectId,
          comment: '已确认',
        },
      });

      // 即使告警不存在，应该通过验证并返回错误消息
      expect(error).toBeNull();
      expect(data?.status).toMatch(/^(ok|error)$/);
    });
  });

  /**
   * 测试 5: POST /api/alarms/confirm/batch (批量确认告警)
   */
  describe('POST /api/alarms/confirm/batch', () => {
    test('应该拒绝空的 ID 数组', async () => {
      const { data, error } = await api.api.alarms.confirm.batch.post({
        data: {
          ids: [],
        } as any,
      });

      // Zod 验证应该拒绝空数组
      expect(error).not.toBeNull();
      expect(error?.status).toBe(400);
    });

    test('应该接受有效的 ID 数组', async () => {
      const validObjectIds = [
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
      ];

      const { data, error } = await api.api.alarms.confirm.batch.post({
        data: {
          ids: validObjectIds,
          comment: '批量确认',
        },
      });

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
      expect(data?.data?.confirmedCount).toBeTypeOf('number');
    });
  });

  /**
   * 测试 6: POST /api/alarms/resolve (解决告警)
   */
  describe('POST /api/alarms/resolve', () => {
    test('应该接受有效的解决请求', async () => {
      const validObjectId = '507f1f77bcf86cd799439011';

      const { data, error } = await api.api.alarms.resolve.post({
        data: {
          id: validObjectId,
          solution: '问题已修复',
        },
      });

      expect(error).toBeNull();
      expect(data?.status).toMatch(/^(ok|error)$/);
    });
  });

  /**
   * 测试 7: POST /api/alarms/resolve/batch (批量解决告警)
   */
  describe('POST /api/alarms/resolve/batch', () => {
    test('应该接受有效的批量解决请求', async () => {
      const validObjectIds = [
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
      ];

      const { data, error } = await api.api.alarms.resolve.batch.post({
        data: {
          ids: validObjectIds,
          solution: '批量处理完成',
        },
      });

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
      expect(data?.data?.resolvedCount).toBeTypeOf('number');
    });
  });

  /**
   * 测试 8: GET /api/alarms/config/user (获取用户告警配置)
   */
  describe('GET /api/alarms/config/user', () => {
    test('应该返回用户告警配置', async () => {
      const { data, error } = await api.api.alarms.config.user.get();

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
      // 配置可能为 null（如果用户没有设置）
      expect(data).toBeDefined();
    });
  });

  /**
   * 测试 9: PUT /api/alarms/config/contacts (更新告警联系人)
   */
  describe('PUT /api/alarms/config/contacts', () => {
    test('应该接受有效的联系人信息', async () => {
      const { data, error } = await api.api.alarms.config.contacts.put({
        data: {
          emails: ['test@example.com'],
          phones: ['13800138000'],
          enableEmail: true,
          enableSms: false,
        },
      });

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
      expect(data?.data?.success).toBe(true);
    });

    test('应该拒绝无效的邮箱地址', async () => {
      const { data, error } = await api.api.alarms.config.contacts.put({
        data: {
          emails: ['invalid-email'],
        } as any,
      });

      // Zod 验证应该拒绝无效邮箱
      expect(error).not.toBeNull();
      expect(error?.status).toBe(400);
    });

    test('应该拒绝无效的手机号码', async () => {
      const { data, error } = await api.api.alarms.config.contacts.put({
        data: {
          phones: ['123'],  // 无效的手机号码
        } as any,
      });

      // Zod 验证应该拒绝无效手机号
      expect(error).not.toBeNull();
      expect(error?.status).toBe(400);
    });
  });

  /**
   * 测试 10: 性能测试
   */
  describe('Performance Tests', () => {
    test('告警列表查询应该 < 100ms', async () => {
      const start = Date.now();
      await api.api.alarms.get({
        query: {
          page: '1',
          limit: '20',
        },
      });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    test('告警统计查询应该 < 100ms', async () => {
      const start = Date.now();
      await api.api.alarms.stats.get();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    test('并发请求应该正常处理', async () => {
      const requests = Array.from({ length: 10 }, () =>
        api.api.alarms.stats.get()
      );

      const results = await Promise.all(requests);

      expect(results.every((r) => r.error === null)).toBe(true);
      expect(results.every((r) => r.data?.status === 'ok')).toBe(true);
    });
  });
});
