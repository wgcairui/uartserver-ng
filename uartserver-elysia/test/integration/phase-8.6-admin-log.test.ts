/**
 * Phase 8.6 - Admin Log Routes Tests
 *
 * 管理员日志查询 API 集成测试
 * 测试所有19个日志端点和管理员权限控制
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import type { App } from '../../src/index';
import { mongodb } from '../../src/database/mongodb';

// ============================================================================
// Test Setup
// ============================================================================

const api = treaty<App>('localhost:3333');

// Test users
const timestamp = Date.now();
const adminUser = {
  username: `admin_${timestamp}`,
  password: 'Admin123456',
  email: `admin_${timestamp}@example.com`,
  role: 'admin',
};

const regularUser = {
  username: `user_${timestamp}`,
  password: 'User123456',
  email: `user_${timestamp}@example.com`,
  role: 'user',
};

let adminToken = '';
let userToken = '';

// ============================================================================
// Setup - 创建管理员和普通用户
// ============================================================================

beforeAll(async () => {
  // 等待服务器就绪
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // 确保 MongoDB 连接
  if (!mongodb.isConnected()) {
    await mongodb.connect();
  }

  // 1. 注册管理员用户
  const { data: adminRegisterData } = await api.api.auth.register.post({
    data: {
      username: adminUser.username,
      password: adminUser.password,
      confirmPassword: adminUser.password,
      email: adminUser.email,
    },
  });

  if (adminRegisterData?.status !== 'ok') {
    console.error('[Test Setup] Admin registration error:', adminRegisterData?.message);
  }

  // 1.1 手动设置管理员角色 (直接修改数据库)
  // 注意: 需要连接到与服务器相同的数据库
  const testDb = mongodb.getDatabase();
  console.log('[Test Setup] Test DB name:', testDb.databaseName);

  // 检查用户是否存在于测试数据库中
  const testUsersCollection = testDb.collection('users');
  const userInTestDb = await testUsersCollection.findOne({ username: adminUser.username });
  console.log('[Test Setup] User in test DB:', userInTestDb ? 'Found' : 'NOT FOUND');

  // 连接到服务器使用的数据库 (uart_server)
  const serverDb = mongodb.getClient().db('uart_server');
  const usersCollection = serverDb.collection('users');

  // 检查用户是否存在于服务器数据库中
  const userInServerDb = await usersCollection.findOne({ username: adminUser.username });
  console.log('[Test Setup] User in server DB (uart_server):', userInServerDb ? 'Found' : 'NOT FOUND');

  if (!userInServerDb) {
    console.error('[Test Setup] ERROR: User not found in server database!');
    throw new Error('User not found in database');
  }

  const updateResult = await usersCollection.updateOne(
    { username: adminUser.username },
    { $set: { role: 'admin' } }
  );

  console.log('[Test Setup] Admin role set for user:', adminUser.username);
  console.log('[Test Setup] Update matched:', updateResult.matchedCount, 'modified:', updateResult.modifiedCount);

  // 等待数据库写入完成
  await new Promise((resolve) => setTimeout(resolve, 500));

  // 1.2 重新登录获取包含admin角色的新token
  const { data: adminReLoginData } = await api.api.auth.login.post({
    data: {
      username: adminUser.username,
      password: adminUser.password,
    },
  });

  if (adminReLoginData?.status === 'ok') {
    adminToken = adminReLoginData.data!.accessToken;
    const user = adminReLoginData.data!.user;
    console.log('[Test Setup] Admin re-logged in with new token');
    console.log('[Test Setup] User role from login:', user.role);
  }

  // 2. 注册普通用户
  const { data: userRegisterData } = await api.api.auth.register.post({
    data: {
      username: regularUser.username,
      password: regularUser.password,
      confirmPassword: regularUser.password,
      email: regularUser.email,
    },
  });

  if (userRegisterData?.status !== 'ok') {
    console.error('[Test Setup] User registration error:', userRegisterData?.message);
  }

  // 3. 普通用户登录
  const { data: userLoginData } = await api.api.auth.login.post({
    data: {
      username: regularUser.username,
      password: regularUser.password,
    },
  });

  if (userLoginData?.status === 'ok') {
    userToken = userLoginData.data!.accessToken;
  } else {
    console.error('[Test Setup] User login error:', userLoginData?.message);
  }

  console.log('[Test Setup] Admin and regular user ready');
  console.log('[Test Setup] Admin token:', adminToken ? 'OK' : 'MISSING');
  console.log('[Test Setup] User token:', userToken ? 'OK' : 'MISSING');
});

// ============================================================================
// Test Suite: Admin Log Routes
// ============================================================================

describe('Phase 8.6 - Admin Log Routes', () => {
  // ==========================================================================
  // 权限测试 - 验证管理员专用访问
  // ==========================================================================

  describe('Admin Access Control', () => {
    test('should deny access without authentication', async () => {
      const { data } = await api.api.admin.logs['wechat-events'].get();

      expect(data?.status).toBe('error');
      expect(data?.message).toContain('Unauthorized');
    });

    test('should deny access for regular users', async () => {
      const { data } = await api.api.admin.logs['wechat-events'].get({
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      expect(data?.status).toBe('error');
      expect(data?.message).toContain('Admin access required');
    });

    test('should allow access for admin users', async () => {
      const { data } = await api.api.admin.logs['wechat-events'].get({
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      // Debug: 打印错误信息
      if (data?.status !== 'ok') {
        console.log('[Test Debug] Error:', data?.message);
        console.log('[Test Debug] Admin token:', adminToken?.substring(0, 50));
      }

      // 管理员应该可以访问 (即使数据为空)
      expect(data?.status).toBe('ok');
      expect(data?.data).toBeDefined();
    });
  });

  // ==========================================================================
  // 微信事件日志
  // ==========================================================================

  describe('GET /api/admin/logs/wechat-events', () => {
    test('should return wechat event logs for admin', async () => {
      const { data } = await api.api.admin.logs['wechat-events'].get({
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(data?.status).toBe('ok');
      expect(Array.isArray(data?.data)).toBe(true);
    });
  });

  // ==========================================================================
  // 短信发送日志
  // ==========================================================================

  describe('GET /api/admin/logs/sms-sends', () => {
    test('should return SMS send logs with date range', async () => {
      const start = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7天前
      const end = Date.now();

      const { data } = await api.api.admin.logs['sms-sends'].get({
        query: {
          start: start.toString(),
          end: end.toString(),
        },
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(data?.status).toBe('ok');
      expect(Array.isArray(data?.data)).toBe(true);
    });
  });

  // ==========================================================================
  // 短信发送统计
  // ==========================================================================

  describe('GET /api/admin/logs/sms-count', () => {
    test('should return SMS send count statistics', async () => {
      const { data } = await api.api.admin.logs['sms-count'].get({
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(data?.status).toBe('ok');
      expect(Array.isArray(data?.data)).toBe(true);
    });
  });

  // ==========================================================================
  // 用户登录日志
  // ==========================================================================

  describe('GET /api/admin/logs/user-logins', () => {
    test('should return user login logs', async () => {
      const start = Date.now() - 24 * 60 * 60 * 1000; // 24小时前
      const end = Date.now();

      const { data } = await api.api.admin.logs['user-logins'].get({
        query: {
          start: start.toString(),
          end: end.toString(),
        },
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(data?.status).toBe('ok');
      expect(Array.isArray(data?.data)).toBe(true);

      // 应该至少包含我们测试用户的登录记录
      console.log('[Test Info] User login logs count:', data?.data?.length || 0);
    });

    test('should return login logs without date range (default 30 days)', async () => {
      const { data } = await api.api.admin.logs['user-logins'].get({
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(data?.status).toBe('ok');
      expect(Array.isArray(data?.data)).toBe(true);
    });
  });

  // ==========================================================================
  // 设备流量日志 (需要MAC地址)
  // ==========================================================================

  describe('GET /api/admin/logs/device-bytes/:mac', () => {
    test('should return device bytes logs for specific MAC', async () => {
      const testMac = '123456789012'; // 测试MAC地址

      const { data } = await api.api.admin.logs['device-bytes']({ mac: testMac }).get({
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(data?.status).toBe('ok');
      expect(Array.isArray(data?.data)).toBe(true);
    });

    test('should reject invalid MAC address format', async () => {
      const invalidMac = '123'; // 太短

      const { error } = await api.api.admin.logs['device-bytes']({ mac: invalidMac }).get({
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      // Elysia 应该验证失败
      expect(error).toBeDefined();
    });
  });

  // ==========================================================================
  // 设备繁忙日志
  // ==========================================================================

  describe('GET /api/admin/logs/device-busy', () => {
    test('should return device busy logs with MAC and date range', async () => {
      const testMac = '123456789012';
      const start = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const end = Date.now();

      const { data } = await api.api.admin.logs['device-busy'].get({
        query: {
          mac: testMac,
          start: start.toString(),
          end: end.toString(),
        },
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(data?.status).toBe('ok');
      expect(Array.isArray(data?.data)).toBe(true);
    });
  });

  // ==========================================================================
  // 终端聚合日志
  // ==========================================================================

  describe('GET /api/admin/logs/terminal-aggregated', () => {
    test('should return aggregated terminal logs', async () => {
      const testMac = '123456789012';
      const start = Date.now() - 24 * 60 * 60 * 1000;
      const end = Date.now();

      const { data } = await api.api.admin.logs['terminal-aggregated'].get({
        query: {
          mac: testMac,
          start: start.toString(),
          end: end.toString(),
        },
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(data?.status).toBe('ok');
      expect(Array.isArray(data?.data)).toBe(true);
    });
  });

  // ==========================================================================
  // 用户聚合日志
  // ==========================================================================

  describe('GET /api/admin/logs/user-aggregated', () => {
    test('should return aggregated user logs', async () => {
      const start = Date.now() - 24 * 60 * 60 * 1000;
      const end = Date.now();

      const { data } = await api.api.admin.logs['user-aggregated'].get({
        query: {
          user: adminUser.username,
          start: start.toString(),
          end: end.toString(),
        },
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(data?.status).toBe('ok');
      expect(Array.isArray(data?.data)).toBe(true);

      // 应该包含登录和请求记录
      console.log('[Test Info] User aggregated logs count:', data?.data?.length || 0);
    });
  });

  // ==========================================================================
  // 节点日志
  // ==========================================================================

  describe('GET /api/admin/logs/nodes', () => {
    test('should return node logs', async () => {
      const start = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const end = Date.now();

      const { data } = await api.api.admin.logs.nodes.get({
        query: {
          start: start.toString(),
          end: end.toString(),
        },
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(data?.status).toBe('ok');
      expect(Array.isArray(data?.data)).toBe(true);
    });
  });

  // ==========================================================================
  // 终端日志
  // ==========================================================================

  describe('GET /api/admin/logs/terminals', () => {
    test('should return terminal logs', async () => {
      const { data } = await api.api.admin.logs.terminals.get({
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(data?.status).toBe('ok');
      expect(Array.isArray(data?.data)).toBe(true);
    });
  });

  // ==========================================================================
  // 邮件发送日志
  // ==========================================================================

  describe('GET /api/admin/logs/mail-sends', () => {
    test('should return mail send logs', async () => {
      const { data } = await api.api.admin.logs['mail-sends'].get({
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(data?.status).toBe('ok');
      expect(Array.isArray(data?.data)).toBe(true);
    });
  });

  // ==========================================================================
  // 设备告警日志
  // ==========================================================================

  describe('GET /api/admin/logs/device-alarms', () => {
    test('should return device alarm logs', async () => {
      const { data } = await api.api.admin.logs['device-alarms'].get({
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(data?.status).toBe('ok');
      expect(Array.isArray(data?.data)).toBe(true);
    });
  });

  // ==========================================================================
  // 用户请求日志
  // ==========================================================================

  describe('GET /api/admin/logs/user-requests', () => {
    test('should return user request logs', async () => {
      const { data } = await api.api.admin.logs['user-requests'].get({
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(data?.status).toBe('ok');
      expect(Array.isArray(data?.data)).toBe(true);
    });
  });

  // ==========================================================================
  // 微信订阅消息日志
  // ==========================================================================

  describe('GET /api/admin/logs/wechat-subscribes', () => {
    test('should return wechat subscribe logs', async () => {
      const { data } = await api.api.admin.logs['wechat-subscribes'].get({
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(data?.status).toBe('ok');
      expect(Array.isArray(data?.data)).toBe(true);
    });
  });

  // ==========================================================================
  // 内部消息日志
  // ==========================================================================

  describe('GET /api/admin/logs/inner-messages', () => {
    test('should return inner message logs', async () => {
      const { data } = await api.api.admin.logs['inner-messages'].get({
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(data?.status).toBe('ok');
      expect(Array.isArray(data?.data)).toBe(true);
    });
  });

  // ==========================================================================
  // Bull 队列日志
  // ==========================================================================

  describe('GET /api/admin/logs/bull-queue', () => {
    test('should return bull queue logs', async () => {
      const { data } = await api.api.admin.logs['bull-queue'].get({
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(data?.status).toBe('ok');
      expect(Array.isArray(data?.data)).toBe(true);
    });
  });

  // ==========================================================================
  // 设备使用时间
  // ==========================================================================

  describe('GET /api/admin/logs/device-use-time', () => {
    test('should return device use time logs', async () => {
      const testMac = '123456789012';

      const { data } = await api.api.admin.logs['device-use-time'].get({
        query: {
          mac: testMac,
        },
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(data?.status).toBe('ok');
      expect(Array.isArray(data?.data)).toBe(true);
    });
  });

  // ==========================================================================
  // 数据清理记录
  // ==========================================================================

  describe('GET /api/admin/logs/data-clean', () => {
    test('should return data clean logs', async () => {
      const { data } = await api.api.admin.logs['data-clean'].get({
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(data?.status).toBe('ok');
      expect(Array.isArray(data?.data)).toBe(true);
    });
  });

  // ==========================================================================
  // 用户告警信息
  // ==========================================================================

  describe('GET /api/admin/logs/user-alarms', () => {
    test('should return user alarm logs', async () => {
      const start = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const end = Date.now();

      const { data } = await api.api.admin.logs['user-alarms'].get({
        query: {
          user: adminUser.username,
          start: start.toString(),
          end: end.toString(),
        },
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(data?.status).toBe('ok');
      expect(Array.isArray(data?.data)).toBe(true);
    });

    test('should require all query parameters', async () => {
      const { error } = await api.api.admin.logs['user-alarms'].get({
        query: {
          user: adminUser.username,
          // Missing start and end
        },
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      // Should fail validation
      expect(error).toBeDefined();
    });
  });
});
