/**
 * User Routes Integration Tests (Phase 7 Day 3)
 *
 * 用户路由集成测试 - 验证所有用户 API 端点功能
 *
 * 注意: 当前测试使用临时 userId = 'system'
 * TODO: 添加 JWT 认证后更新测试
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import type { App } from '../../src/index';

// 创建测试客户端
const api = treaty<App>('localhost:3333');

// 测试数据常量
const TEST_USER_ID = '507f1f77bcf86cd799439011';
const TEST_MAC = '00:11:22:33:44:55';
const TEST_DEVICE_NAME = 'Test Device';

describe('User Routes Integration Tests', () => {
  beforeAll(async () => {
    // 确保服务器运行
    const { data, error } = await api.health.get();
    if (error || data?.status !== 'ok') {
      throw new Error('Server is not running on localhost:3333');
    }
  });

  /**
   * 测试 1: GET /api/users/me (获取当前用户信息)
   */
  describe('GET /api/users/me', () => {
    test('应该返回当前用户信息', async () => {
      const { data, error } = await api.api.users.me.get();

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
      expect(data?.data).toBeDefined();

      // 验证用户信息结构
      if (data?.data) {
        expect(data.data).toHaveProperty('_id');
        expect(data.data).toHaveProperty('user');
        expect(data.data).toHaveProperty('role');
        expect(data.data).toHaveProperty('isActive');
      }
    });

    test('用户信息不应包含敏感字段', async () => {
      const { data, error } = await api.api.users.me.get();

      expect(error).toBeNull();
      expect(data?.data).toBeDefined();

      // 不应包含 password 和 refreshToken
      if (data?.data) {
        expect(data.data).not.toHaveProperty('password');
        expect(data.data).not.toHaveProperty('refreshToken');
      }
    });
  });

  /**
   * 测试 2: GET /api/users/:id (获取指定用户信息 - 管理员)
   */
  describe('GET /api/users/:id', () => {
    test('应该接受有效的用户 ID', async () => {
      const { data, error } = await api.api.users({ id: TEST_USER_ID }).get();

      // 即使用户不存在，应该通过验证
      expect(error).toBeNull();
      expect(data?.status).toMatch(/^(ok|error)$/);
    });

    test('应该拒绝无效的用户 ID', async () => {
      const { data, error } = await api.api.users({ id: 'invalid-id' }).get();

      // Zod 验证应该拒绝无效 ID
      expect(error).not.toBeNull();
      expect(error?.status).toBe(400);
    });
  });

  /**
   * 测试 3: GET /api/users/devices (获取用户绑定设备)
   */
  describe('GET /api/users/devices', () => {
    test('应该返回用户绑定的设备列表', async () => {
      const { data, error } = await api.api.users.devices.get();

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
      expect(data?.data).toBeDefined();
      expect(data?.data?.devices).toBeInstanceOf(Array);

      // 验证设备信息结构
      if (data?.data?.devices && data.data.devices.length > 0) {
        const device = data.data.devices[0]!;
        expect(device).toHaveProperty('DevMac');
        expect(device).toHaveProperty('name');
        expect(device).toHaveProperty('online');
      }
    });
  });

  /**
   * 测试 4: POST /api/users/devices (添加设备绑定)
   */
  describe('POST /api/users/devices', () => {
    test('应该接受有效的 MAC 地址', async () => {
      const { data, error } = await api.api.users.devices.post({
        data: {
          mac: TEST_MAC,
        },
      });

      // 即使设备不存在，应该通过验证
      expect(error).toBeNull();
      expect(data?.status).toMatch(/^(ok|error)$/);
    });

    test('应该拒绝无效的 MAC 地址', async () => {
      const { data, error } = await api.api.users.devices.post({
        data: {
          mac: 'invalid-mac',
        } as any,
      });

      // Zod 验证应该拒绝无效 MAC
      expect(error).not.toBeNull();
      expect(error?.status).toBe(400);
    });
  });

  /**
   * 测试 5: DELETE /api/users/devices/:mac (删除设备绑定)
   */
  describe('DELETE /api/users/devices/:mac', () => {
    test('应该接受有效的 MAC 地址', async () => {
      const { data, error } = await api.api.users.devices({ mac: TEST_MAC }).delete();

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
      expect(data?.data?.success).toBeTypeOf('boolean');
    });

    test('应该拒绝无效的 MAC 地址', async () => {
      const { data, error } = await api.api.users
        .devices({ mac: 'invalid-mac' })
        .delete();

      // Zod 验证应该拒绝无效 MAC
      expect(error).not.toBeNull();
      expect(error?.status).toBe(400);
    });
  });

  /**
   * 测试 6: GET /api/users/devices/:mac/check (检查设备绑定)
   */
  describe('GET /api/users/devices/:mac/check', () => {
    test('应该返回设备绑定状态', async () => {
      const { data, error } = await api.api.users
        .devices({ mac: TEST_MAC })
        .check.get();

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
      expect(data?.data).toBeDefined();
      expect(data?.data?.mac).toBe(TEST_MAC);
      expect(data?.data?.isBound).toBeTypeOf('boolean');
    });
  });

  /**
   * 测试 7: POST /api/users/devices/batch-check (批量检查设备绑定)
   */
  describe('POST /api/users/devices/batch-check', () => {
    test('应该返回批量设备绑定状态', async () => {
      const testMacs = ['00:11:22:33:44:55', 'AA:BB:CC:DD:EE:FF'];

      const { data, error } = await api.api.users.devices['batch-check'].post({
        data: {
          macs: testMacs,
        },
      });

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
      expect(data?.data).toBeDefined();
      expect(data?.data?.bindings).toBeTypeOf('object');

      // 验证每个 MAC 都有绑定状态
      if (data?.data?.bindings) {
        for (const mac of testMacs) {
          expect(data.data.bindings).toHaveProperty(mac);
          expect(typeof data.data.bindings[mac]).toBe('boolean');
        }
      }
    });

    test('应该拒绝空的 MAC 数组', async () => {
      const { data, error } = await api.api.users.devices['batch-check'].post({
        data: {
          macs: [],
        } as any,
      });

      // Zod 验证应该拒绝空数组
      expect(error).not.toBeNull();
      expect(error?.status).toBe(400);
    });

    test('应该拒绝超过 100 个设备', async () => {
      const tooManyMacs = Array.from({ length: 101 }, (_, i) =>
        `00:11:22:33:44:${i.toString(16).padStart(2, '0')}`
      );

      const { data, error } = await api.api.users.devices['batch-check'].post({
        data: {
          macs: tooManyMacs,
        } as any,
      });

      // Zod 验证应该拒绝过多设备
      expect(error).not.toBeNull();
      expect(error?.status).toBe(400);
    });
  });

  /**
   * 测试 8: PUT /api/users/me (更新用户信息)
   */
  describe('PUT /api/users/me', () => {
    test('应该接受有效的用户信息更新', async () => {
      const { data, error } = await api.api.users.me.put({
        data: {
          name: 'Updated Name',
          email: 'updated@example.com',
        },
      });

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
      expect(data?.data?.success).toBeTypeOf('boolean');
    });

    test('应该拒绝无效的邮箱地址', async () => {
      const { data, error } = await api.api.users.me.put({
        data: {
          email: 'invalid-email',
        } as any,
      });

      // Zod 验证应该拒绝无效邮箱
      expect(error).not.toBeNull();
      expect(error?.status).toBe(400);
    });

    test('应该拒绝无效的手机号码', async () => {
      const { data, error } = await api.api.users.me.put({
        data: {
          tel: '12345',
        } as any,
      });

      // Zod 验证应该拒绝无效手机号
      expect(error).not.toBeNull();
      expect(error?.status).toBe(400);
    });
  });

  /**
   * 测试 9: PUT /api/users/me/password (修改密码)
   */
  describe('PUT /api/users/me/password', () => {
    test('应该接受有效的密码格式', async () => {
      const { data, error } = await api.api.users.me.password.put({
        data: {
          oldPassword: 'OldPass123',
          newPassword: 'NewPass123',
        },
      });

      // 即使旧密码不正确，应该通过验证
      expect(error).toBeNull();
      expect(data?.status).toMatch(/^(ok|error)$/);
    });

    test('应该拒绝过短的密码', async () => {
      const { data, error } = await api.api.users.me.password.put({
        data: {
          oldPassword: 'OldPass123',
          newPassword: '12345',
        } as any,
      });

      // Zod 验证应该拒绝过短密码
      expect(error).not.toBeNull();
      expect(error?.status).toBe(400);
    });

    test('应该拒绝不符合强度要求的密码', async () => {
      const { data, error } = await api.api.users.me.password.put({
        data: {
          oldPassword: 'OldPass123',
          newPassword: 'weakpassword', // 没有大写字母和数字
        } as any,
      });

      // Zod 验证应该拒绝弱密码
      expect(error).not.toBeNull();
      expect(error?.status).toBe(400);
    });
  });

  /**
   * 测试 10: PUT /api/users/devices/:mac/name (修改设备别名)
   */
  describe('PUT /api/users/devices/:mac/name', () => {
    test('应该接受有效的设备名称', async () => {
      const { data, error } = await api.api.users
        .devices({ mac: TEST_MAC })
        .name.put({
          data: {
            name: TEST_DEVICE_NAME,
          },
        });

      // 即使设备不存在，应该通过验证
      expect(error).toBeNull();
      expect(data?.status).toMatch(/^(ok|error)$/);
    });

    test('应该拒绝空的设备名称', async () => {
      const { data, error } = await api.api.users
        .devices({ mac: TEST_MAC })
        .name.put({
          data: {
            name: '',
          } as any,
        });

      // Zod 验证应该拒绝空字符串
      expect(error).not.toBeNull();
      expect(error?.status).toBe(400);
    });
  });

  /**
   * 测试 11: GET /api/users/devices/:mac/online (检查设备在线状态)
   */
  describe('GET /api/users/devices/:mac/online', () => {
    test('应该返回设备在线状态', async () => {
      const { data, error } = await api.api.users
        .devices({ mac: TEST_MAC })
        .online.get();

      // 即使设备不存在或无权限，应该返回响应
      expect(error).toBeNull();
      expect(data?.status).toMatch(/^(ok|error)$/);

      if (data?.status === 'ok' && data.data) {
        expect(data.data.mac).toBe(TEST_MAC);
        expect(data.data.online).toBeTypeOf('boolean');
      }
    });
  });

  /**
   * 测试 12: GET /api/users/statistics (获取用户统计 - 管理员)
   */
  describe('GET /api/users/statistics', () => {
    test('应该返回用户统计信息', async () => {
      const { data, error } = await api.api.users.statistics.get();

      expect(error).toBeNull();
      expect(data?.status).toBe('ok');
      expect(data?.data).toBeDefined();

      // 验证统计数据结构
      if (data?.data) {
        expect(data.data.totalUsers).toBeTypeOf('number');
        expect(data.data.activeUsers).toBeTypeOf('number');
        expect(data.data.totalDevices).toBeTypeOf('number');
        expect(data.data.onlineDevices).toBeTypeOf('number');
      }
    });
  });

  /**
   * 测试 13: 性能测试
   */
  describe('Performance Tests', () => {
    test('获取当前用户信息应该 < 50ms', async () => {
      const start = Date.now();
      await api.api.users.me.get();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(50);
    });

    test('获取用户设备列表应该 < 100ms', async () => {
      const start = Date.now();
      await api.api.users.devices.get();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    test('批量检查设备绑定应该 < 200ms (10个设备)', async () => {
      const testMacs = Array.from(
        { length: 10 },
        (_, i) => `00:11:22:33:44:${i.toString(16).padStart(2, '0')}`
      );

      const start = Date.now();
      await api.api.users.devices['batch-check'].post({
        data: { macs: testMacs },
      });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(200);
    });

    test('并发请求应该正常处理', async () => {
      const requests = Array.from({ length: 10 }, () => api.api.users.me.get());

      const results = await Promise.all(requests);

      expect(results.every((r) => r.error === null)).toBe(true);
      expect(results.every((r) => r.data?.status === 'ok')).toBe(true);
    });
  });

  /**
   * 测试 14: 边界条件测试
   */
  describe('Edge Cases', () => {
    test('应该处理不存在的用户', async () => {
      const nonExistentId = '507f1f77bcf86cd799439099';
      const { data, error } = await api.api.users({ id: nonExistentId }).get();

      expect(error).toBeNull();
      // 应该返回错误状态
      expect(data?.status).toBe('error');
      expect(data?.message).toBeDefined();
    });

    test('应该处理非常长的设备名称', async () => {
      const longName = 'A'.repeat(100); // 超过 50 字符限制

      const { data, error } = await api.api.users
        .devices({ mac: TEST_MAC })
        .name.put({
          data: {
            name: longName,
          } as any,
        });

      // Zod 验证应该拒绝过长名称
      expect(error).not.toBeNull();
      expect(error?.status).toBe(400);
    });
  });
});
