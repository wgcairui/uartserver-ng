/**
 * Data Query Routes Integration Tests (Phase 7 Day 2)
 *
 * 数据查询路由集成测试 - 验证所有数据查询 API 端点功能
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import type { App } from '../../src/index';

// 创建测试客户端
const api = treaty<App>('localhost:3333');

// 测试数据常量
const TEST_MAC = '00:11:22:33:44:55';
const TEST_PID = 1;
const TEST_PARAM_NAME = 'temperature';

describe('Data Query Routes Integration Tests', () => {
  beforeAll(async () => {
    // 确保服务器运行
    const { data, error } = await api.health.get();
    if (error || data?.status !== 'ok') {
      throw new Error('Server is not running on localhost:3333');
    }
  });

  /**
   * 测试 1: GET /api/data/latest/:mac/:pid (获取最新数据)
   */
  describe('GET /api/data/latest/:mac/:pid', () => {
    test('应该返回设备所有参数的最新数据', async () => {
      const { data, error } = await api.api.data
        .latest({ mac: TEST_MAC, pid: TEST_PID.toString() })
        .get();

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
      expect(data?.data).toBeInstanceOf(Array);
      // 每个数据点应该有 name, value, unit, timestamp
      if (data?.data && data.data.length > 0) {
        const point = data.data[0]!;
        expect(point).toHaveProperty('name');
        expect(point).toHaveProperty('value');
        expect(point).toHaveProperty('unit');
        expect(point).toHaveProperty('timestamp');
      }
    });

    test('应该拒绝无效的 MAC 地址', async () => {
      const { data, error } = await api.api.data
        .latest({ mac: 'invalid-mac', pid: TEST_PID.toString() })
        .get();

      // Zod 验证应该拒绝无效 MAC
      expect(error).not.toBeNull();
      expect(error?.status).toBe(400);
    });

    test('应该拒绝无效的协议 ID', async () => {
      const { data, error } = await api.api.data
        .latest({ mac: TEST_MAC, pid: 'invalid' })
        .get();

      // Zod 验证应该拒绝无效 PID
      expect(error).not.toBeNull();
      expect(error?.status).toBe(400);
    });
  });

  /**
   * 测试 2: GET /api/data/latest/:mac/:pid/:name (获取指定参数最新数据)
   */
  describe('GET /api/data/latest/:mac/:pid/:name', () => {
    test('应该返回指定参数的最新数据', async () => {
      const { data, error } = await api.api.data
        .latest({
          mac: TEST_MAC,
          pid: TEST_PID.toString(),
          name: TEST_PARAM_NAME,
        })
        .get();

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
      // data 可能为 null (参数不存在) 或有数据
      if (data?.data) {
        expect(data.data).toHaveProperty('name');
        expect(data.data).toHaveProperty('value');
        expect(data.data).toHaveProperty('unit');
        expect(data.data).toHaveProperty('timestamp');
      }
    });

    test('应该拒绝空的参数名称', async () => {
      const { data, error } = await api.api.data
        .latest({
          mac: TEST_MAC,
          pid: TEST_PID.toString(),
          name: '',
        })
        .get();

      // Zod 验证应该拒绝空字符串
      expect(error).not.toBeNull();
      expect(error?.status).toBe(400);
    });
  });

  /**
   * 测试 3: GET /api/data/history (获取历史数据)
   */
  describe('GET /api/data/history', () => {
    test('应该返回历史数据', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const { data, error } = await api.api.data.history.get({
        query: {
          mac: TEST_MAC,
          pid: TEST_PID.toString(),
          start: oneHourAgo.toISOString(),
          end: now.toISOString(),
        },
      });

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
      expect(data?.data).toBeInstanceOf(Array);
    });

    test('应该支持参数名称过滤', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const { data, error } = await api.api.data.history.get({
        query: {
          mac: TEST_MAC,
          pid: TEST_PID.toString(),
          names: 'temperature,humidity',
          start: oneHourAgo.toISOString(),
          end: now.toISOString(),
        },
      });

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
    });

    test('应该拒绝无效的时间范围', async () => {
      const now = new Date();
      const future = new Date(now.getTime() + 60 * 60 * 1000);

      const { data, error } = await api.api.data.history.get({
        query: {
          mac: TEST_MAC,
          pid: TEST_PID.toString(),
          start: future.toISOString(),
          end: now.toISOString(),
        },
      });

      // 结束时间早于开始时间应该失败
      expect(error).not.toBeNull();
      expect(error?.status).toBe(400);
    });
  });

  /**
   * 测试 4: GET /api/data/aggregated (获取聚合数据)
   */
  describe('GET /api/data/aggregated', () => {
    test('应该返回聚合统计数据', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const { data, error } = await api.api.data.aggregated.get({
        query: {
          mac: TEST_MAC,
          pid: TEST_PID.toString(),
          start: oneHourAgo.toISOString(),
          end: now.toISOString(),
          interval: '3600',
        },
      });

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
      expect(data?.data).toBeInstanceOf(Array);
      // 验证聚合数据结构
      if (data?.data && data.data.length > 0) {
        const aggregated = data.data[0]!;
        expect(aggregated).toHaveProperty('name');
        expect(aggregated).toHaveProperty('avg');
        expect(aggregated).toHaveProperty('min');
        expect(aggregated).toHaveProperty('max');
        expect(aggregated).toHaveProperty('count');
        expect(aggregated).toHaveProperty('unit');
      }
    });

    test('应该支持自定义聚合间隔', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const { data, error } = await api.api.data.aggregated.get({
        query: {
          mac: TEST_MAC,
          pid: TEST_PID.toString(),
          start: oneHourAgo.toISOString(),
          end: now.toISOString(),
          interval: '600', // 10 分钟
        },
      });

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
    });
  });

  /**
   * 测试 5: GET /api/data/timeseries (获取时间序列数据)
   */
  describe('GET /api/data/timeseries', () => {
    test('应该返回时间序列聚合数据', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const { data, error } = await api.api.data.timeseries.get({
        query: {
          mac: TEST_MAC,
          pid: TEST_PID.toString(),
          start: oneHourAgo.toISOString(),
          end: now.toISOString(),
          interval: '600',
        },
      });

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
      expect(data?.data).toBeInstanceOf(Array);
      // 验证时间序列数据结构
      if (data?.data && data.data.length > 0) {
        const point = data.data[0]!;
        expect(point).toHaveProperty('timestamp');
        expect(point).toHaveProperty('name');
        expect(point).toHaveProperty('avg');
        expect(point).toHaveProperty('count');
      }
    });
  });

  /**
   * 测试 6: GET /api/data/raw (获取原始数据 - 分页)
   */
  describe('GET /api/data/raw', () => {
    test('应该返回分页的原始数据', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const { data, error } = await api.api.data.raw.get({
        query: {
          mac: TEST_MAC,
          pid: TEST_PID.toString(),
          start: oneHourAgo.toISOString(),
          end: now.toISOString(),
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

    test('应该支持自定义分页参数', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const { data, error } = await api.api.data.raw.get({
        query: {
          mac: TEST_MAC,
          pid: TEST_PID.toString(),
          start: oneHourAgo.toISOString(),
          end: now.toISOString(),
          page: '2',
          limit: '20',
        },
      });

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
      expect(data?.data?.page).toBe(2);
      expect(data?.data?.limit).toBe(20);
    });

    test('应该限制最大分页大小', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const { data, error } = await api.api.data.raw.get({
        query: {
          mac: TEST_MAC,
          pid: TEST_PID.toString(),
          start: oneHourAgo.toISOString(),
          end: now.toISOString(),
          page: '1',
          limit: '1000', // 超过最大值 500
        },
      });

      // Zod 验证应该拒绝过大的 limit
      expect(error).not.toBeNull();
      expect(error?.status).toBe(400);
    });
  });

  /**
   * 测试 7: GET /api/data/parsed (获取解析数据 - 分页)
   */
  describe('GET /api/data/parsed', () => {
    test('应该返回分页的解析数据', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const { data, error } = await api.api.data.parsed.get({
        query: {
          mac: TEST_MAC,
          pid: TEST_PID.toString(),
          start: oneHourAgo.toISOString(),
          end: now.toISOString(),
          page: '1',
          limit: '10',
        },
      });

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
      expect(data?.data).toBeDefined();
      expect(data?.data?.data).toBeInstanceOf(Array);
    });

    test('应该支持参数名称过滤', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const { data, error } = await api.api.data.parsed.get({
        query: {
          mac: TEST_MAC,
          pid: TEST_PID.toString(),
          name: TEST_PARAM_NAME,
          start: oneHourAgo.toISOString(),
          end: now.toISOString(),
          page: '1',
          limit: '10',
        },
      });

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
    });
  });

  /**
   * 测试 8: GET /api/data/statistics/:mac/:pid (获取数据统计)
   */
  describe('GET /api/data/statistics/:mac/:pid', () => {
    test('应该返回数据统计信息', async () => {
      const { data, error } = await api.api.data
        .statistics({ mac: TEST_MAC, pid: TEST_PID.toString() })
        .get();

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
      expect(data?.data).toBeDefined();
      expect(data?.data?.parameterCount).toBeTypeOf('number');
      expect(data?.data?.dataPoints).toBeTypeOf('number');
      // lastUpdateTime 可能为 null
      expect(data?.data).toHaveProperty('lastUpdateTime');
    });
  });

  /**
   * 测试 9: GET /api/data/parameters/:mac/:pid (获取可用参数)
   */
  describe('GET /api/data/parameters/:mac/:pid', () => {
    test('应该返回设备所有可用参数', async () => {
      const { data, error } = await api.api.data
        .parameters({ mac: TEST_MAC, pid: TEST_PID.toString() })
        .get();

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
      expect(data?.data).toBeDefined();
      expect(data?.data?.mac).toBe(TEST_MAC);
      expect(data?.data?.pid).toBe(TEST_PID);
      expect(data?.data?.parameters).toBeInstanceOf(Array);
    });
  });

  /**
   * 测试 10: 性能测试
   */
  describe('Performance Tests', () => {
    test('最新数据查询应该 < 50ms', async () => {
      const start = Date.now();
      await api.api.data.latest({ mac: TEST_MAC, pid: TEST_PID.toString() }).get();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(50);
    });

    test('统计查询应该 < 100ms', async () => {
      const start = Date.now();
      await api.api.data
        .statistics({ mac: TEST_MAC, pid: TEST_PID.toString() })
        .get();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    test('并发请求应该正常处理', async () => {
      const requests = Array.from({ length: 10 }, () =>
        api.api.data.latest({ mac: TEST_MAC, pid: TEST_PID.toString() }).get()
      );

      const results = await Promise.all(requests);

      expect(results.every((r) => r.error === null)).toBe(true);
      expect(results.every((r) => r.data?.status === 'ok')).toBe(true);
    });
  });

  /**
   * 测试 11: 边界条件测试
   */
  describe('Edge Cases', () => {
    test('应该处理不存在的设备', async () => {
      const { data, error } = await api.api.data
        .latest({ mac: 'FF:FF:FF:FF:FF:FF', pid: '999' })
        .get();

      // 设备不存在应该返回空数组，不应该报错
      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
      expect(data?.data).toBeInstanceOf(Array);
    });

    test('应该处理极短时间范围', async () => {
      const now = new Date();
      const oneSecondAgo = new Date(now.getTime() - 1000);

      const { data, error } = await api.api.data.history.get({
        query: {
          mac: TEST_MAC,
          pid: TEST_PID.toString(),
          start: oneSecondAgo.toISOString(),
          end: now.toISOString(),
        },
      });

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
    });
  });
});
