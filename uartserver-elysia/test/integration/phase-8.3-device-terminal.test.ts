/**
 * Phase 8.3 Integration Tests
 * Device Type & Terminal Management API
 *
 * 测试覆盖:
 * 1. GET /api/device-types - 设备类型查询
 * 2. GET /api/terminals/:mac - 终端详情
 * 3. GET /api/terminals/registered - 注册设备列表
 * 4. POST /api/terminals/:mac/mount-devices - 添加挂载设备
 * 5. DELETE /api/terminals/:mac/mount-devices/:pid - 删除挂载设备
 * 6. POST /api/terminals/:mac/refresh-timeout - 刷新设备超时
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import type { App } from '../../src/index';
import { mongodb } from '../../src/database/mongodb';
import type { TerminalDocument } from '../../src/entities/mongodb/terminal.entity';
import type { DeviceTypeDocument } from '../../src/services/device-type.service';
import { MongoClient, ObjectId } from 'mongodb';

// ============================================================================
// 测试配置
// ============================================================================

const PORT = 3333;
const api = treaty<App>(`http://localhost:${PORT}`);

// 测试数据 - 使用固定的 ObjectId 以确保测试可重复运行
const testUserId = '507f1f77bcf86cd799439011'; // 固定的测试用户 ID
const testMac = 'AABBCCDDEEFF';
const testPid = 1;
const testDevModel = 'TEST-MODEL-001';

let accessToken: string;

// ============================================================================
// 测试前准备
// ============================================================================

beforeAll(async () => {
  // 直接连接到开发数据库 (因为测试使用外部开发服务器在 uart_server)
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('uart_server');

  // 清理并创建测试用户 (密码: test-password)
  const usersCollection = db.collection('users');

  // 先删除可能存在的测试用户
  await usersCollection.deleteMany({ username: 'test_device_user' });

  // 创建新的测试用户
  await usersCollection.insertOne({
    _id: new ObjectId(testUserId),
    username: 'test_device_user',
    email: 'device@test.com',
    password: '$2b$10$RkovQFLOTyXj.rBM4u3IuePfp.cYkU4UV01mCp6SjrXRkVnAxS5Yi', // bcrypt hash of 'test-password'
    devices: [testMac],
    user: 'test_device_user', // 添加 user 字段以满足唯一索引
    role: 'user',
    isActive: true, // 启用用户账户
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // 创建测试终端
  const terminalsCollection = db.collection<TerminalDocument>('terminals');
  await terminalsCollection.updateOne(
    { DevMac: testMac },
    {
      $set: {
        DevMac: testMac,
        name: 'Test Terminal',
        Type: 1,
        online: true,
        bindUsers: [testUserId],
        mountDevs: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );

  // 创建测试设备类型
  const deviceTypesCollection = db.collection<DeviceTypeDocument>('device.types');
  await deviceTypesCollection.updateOne(
    { DevModel: testDevModel },
    {
      $set: {
        Type: '485',
        DevModel: testDevModel,
        Protocols: [
          { Type: 485, Protocol: 'Modbus-RTU' },
          { Type: 485, Protocol: 'Custom-Protocol' },
        ],
      },
    },
    { upsert: true }
  );

  // 关闭连接
  await client.close();

  // 获取访问令牌
  const { data: loginData } = await api.api.auth.login.post({
    data: {
      username: 'test_device_user',
      password: 'test-password',
    },
  });

  console.log('[Test] Login response:', JSON.stringify(loginData, null, 2));
  if (loginData?.status === 'ok' && loginData.data?.accessToken) {
    accessToken = loginData.data.accessToken;
  } else {
    console.error('[Test] Login failed! Response:', loginData);
    throw new Error('Failed to get access token for tests');
  }
});

afterAll(async () => {
  // 测试数据清理已在 beforeAll 中完成
  // 不需要断开 MongoDB 连接，因为我们使用独立的客户端连接
});

// ============================================================================
// Device Type API Tests
// ============================================================================

describe('Device Type API', () => {
  test('should get all device types', async () => {
    const { data } = await api.api['device-types'].get({
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(data?.status).toBe('ok');
    expect(Array.isArray(data?.data)).toBe(true);
    expect(data?.data?.length).toBeGreaterThan(0);

    // 验证返回的设备类型包含测试数据
    const testType = data?.data?.find((dt: any) => dt.DevModel === testDevModel);
    expect(testType).toBeDefined();
    expect(testType?.Type).toBe('485');
    expect(testType?.Protocols).toBeInstanceOf(Array);
  });

  test('should filter device types by type (232)', async () => {
    const { data } = await api.api['device-types'].get({
      query: { type: '232' },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(data?.status).toBe('ok');
    expect(Array.isArray(data?.data)).toBe(true);

    // 所有返回的设备类型应该是 232
    if (data?.data && data.data.length > 0) {
      data.data.forEach((dt: any) => {
        expect(dt.Type).toBe('232');
      });
    }
  });

  test('should filter device types by type (485)', async () => {
    const { data } = await api.api['device-types'].get({
      query: { type: '485' },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(data?.status).toBe('ok');
    expect(Array.isArray(data?.data)).toBe(true);

    // 验证测试设备类型存在
    const testType = data?.data?.find((dt: any) => dt.DevModel === testDevModel);
    expect(testType).toBeDefined();
  });

  test('should require authentication', async () => {
    const { data, error } = await api.api['device-types'].get();

    // 未认证应该返回错误或被拦截
    expect(data?.status === 'error' || error !== null).toBe(true);
  });
});

// ============================================================================
// Terminal Management API Tests
// ============================================================================

describe('Terminal Management API', () => {
  describe('GET /api/terminals/:mac', () => {
    test('should get terminal details', async () => {
      const { data, error } = await api.api.terminals({ mac: testMac }).get({
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      expect(data?.status).toBe('ok');
      expect(data?.data).toBeDefined();
      expect(data?.data?.DevMac).toBe(testMac);
      expect(data?.data?.name).toBe('Test Terminal');
      expect(data?.data?.online).toBe(true);
    });

    test('should return null for unbound terminal', async () => {
      const unboundMac = 'FFFFFFFFFFFF';

      const { data } = await api.api.terminals({ mac: unboundMac }).get({
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      expect(data?.status).toBe('ok');
      expect(data?.data).toBeNull();
    });

    test('should require authentication', async () => {
      const { data, error } = await api.api.terminals({ mac: testMac }).get();

      expect(data?.status === 'error' || error !== null).toBe(true);
    });

    test('should validate MAC address format', async () => {
      const { data, error } = await api.api.terminals({ mac: 'invalid-mac' }).get({
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      // 应该返回验证错误
      expect(data?.status === 'error' || error !== null).toBe(true);
    });
  });

  describe('GET /api/terminals/registered', () => {
    test('should get all registered devices', async () => {
      const { data } = await api.api.terminals.registered.get({
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      expect(data?.status).toBe('ok');
      // 当前返回空数组 (TODO: 实现后更新)
      expect(data?.data).toBeDefined();
    });

    test('should get registered device by id', async () => {
      const { data } = await api.api.terminals.registered.get({
        query: { id: 'test-register-dev-id' },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      expect(data?.status).toBe('ok');
      // 当前返回 null (TODO: 实现后更新)
      expect(data?.data).toBeDefined();
    });

    test('should require authentication', async () => {
      const { data, error } = await api.api.terminals.registered.get();

      expect(data?.status === 'error' || error !== null).toBe(true);
    });
  });

  describe('POST /api/terminals/:mac/mount-devices', () => {
    test('should add mount device successfully', async () => {
      const { data } = await api.api.terminals({ mac: testMac })['mount-devices'].post(
        {
          data: {
            pid: testPid,
            protocol: 'Modbus-RTU',
            Type: 485,
            protocolType: 'standard',
            port: 1,
            remark: 'Test mount device',
            mountDev: 'Sensor-001',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      expect(data?.status).toBe('ok');
      expect(data?.data?.success).toBe(true);
      expect(data?.message).toContain('成功');
    });

    test('should reject duplicate PID', async () => {
      // 第二次添加相同 PID 应该失败
      const { data } = await api.api.terminals({ mac: testMac })['mount-devices'].post(
        {
          data: {
            pid: testPid,
            protocol: 'Another-Protocol',
            Type: 485,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      expect(data?.status).toBe('ok');
      expect(data?.data?.success).toBe(false);
      expect(data?.message).toContain('already exists');
    });

    test('should reject unbound terminal', async () => {
      const unboundMac = 'FFFFFFFFFFFF';

      const { data } = await api.api.terminals({ mac: unboundMac })['mount-devices'].post(
        {
          data: {
            pid: 999,
            protocol: 'Test-Protocol',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      expect(data?.status).toBe('ok');
      expect(data?.data?.success).toBe(false);
      expect(data?.message).toContain('未绑定');
    });

    test('should validate request body', async () => {
      const { data, error } = await api.api.terminals({ mac: testMac })['mount-devices'].post(
        {
          data: {
            // 缺少必需的 pid 和 protocol 字段
          } as any,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      expect(data?.status === 'error' || error !== null).toBe(true);
    });

    test('should require authentication', async () => {
      const { data, error } = await api.api.terminals({ mac: testMac })['mount-devices'].post({
        data: {
          pid: 100,
          protocol: 'Test',
        },
      });

      expect(data?.status === 'error' || error !== null).toBe(true);
    });
  });

  describe('DELETE /api/terminals/:mac/mount-devices/:pid', () => {
    test('should delete mount device successfully', async () => {
      const { data } = await api.api
        .terminals({ mac: testMac })
        ['mount-devices']({ pid: testPid.toString() })
        .delete(
          {},  // 空body作为第一个参数
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

      expect(data?.status).toBe('ok');
      expect(data?.data?.success).toBe(true);
      expect(data?.message).toContain('成功');
    });

    test('should handle non-existent PID', async () => {
      const { data } = await api.api
        .terminals({ mac: testMac })
        ['mount-devices']({ pid: '999' })
        .delete(
          {},
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

      expect(data?.status).toBe('ok');
      expect(data?.data?.success).toBe(false);
    });

    test('should reject unbound terminal', async () => {
      const unboundMac = 'FFFFFFFFFFFF';

      const { data } = await api.api
        .terminals({ mac: unboundMac })
        ['mount-devices']({ pid: '1' })
        .delete(
          {},
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

      expect(data?.status).toBe('ok');
      expect(data?.data?.success).toBe(false);
      expect(data?.message).toContain('未绑定');
    });

    test('should validate PID format', async () => {
      const { data, error } = await api.api
        .terminals({ mac: testMac })
        ['mount-devices']({ pid: 'invalid' })
        .delete({
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

      expect(data?.status === 'error' || error !== null).toBe(true);
    });

    test('should require authentication', async () => {
      const { data, error } = await api.api
        .terminals({ mac: testMac })
        ['mount-devices']({ pid: '1' })
        .delete();

      expect(data?.status === 'error' || error !== null).toBe(true);
    });
  });

  describe('POST /api/terminals/:mac/refresh-timeout', () => {
    test('should refresh device timeout successfully', async () => {
      const { data } = await api.api
        .terminals({ mac: testMac })
        ['refresh-timeout'].post(
          {
            data: {
              pid: testPid,
              interval: 30,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

      expect(data?.status).toBe('ok');
      expect(data?.data?.success).toBe(true);
      expect(data?.message).toContain('成功');
    });

    test('should refresh without interval (use default)', async () => {
      const { data } = await api.api
        .terminals({ mac: testMac })
        ['refresh-timeout'].post(
          {
            data: {
              pid: testPid,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

      expect(data?.status).toBe('ok');
      expect(data?.data?.success).toBe(true);
    });

    test('should reject unbound terminal', async () => {
      const unboundMac = 'FFFFFFFFFFFF';

      const { data } = await api.api
        .terminals({ mac: unboundMac })
        ['refresh-timeout'].post(
          {
            data: {
              pid: 1,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

      expect(data?.status).toBe('ok');
      expect(data?.data?.success).toBe(false);
      expect(data?.message).toContain('未绑定');
    });

    test('should validate interval value', async () => {
      const { data, error } = await api.api
        .terminals({ mac: testMac })
        ['refresh-timeout'].post(
          {
            data: {
              pid: testPid,
              interval: -10, // 无效的负数
            },
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

      expect(data?.status === 'error' || error !== null).toBe(true);
    });

    test('should require authentication', async () => {
      const { data, error } = await api.api
        .terminals({ mac: testMac })
        ['refresh-timeout'].post({
          data: {
            pid: 1,
          },
        });

      expect(data?.status === 'error' || error !== null).toBe(true);
    });
  });
});

// ============================================================================
// 测试总结
// ============================================================================

/**
 * 测试覆盖总结:
 *
 * 1. Device Type API (4 tests)
 *    ✅ 获取所有设备类型
 *    ✅ 按类型过滤 (232)
 *    ✅ 按类型过滤 (485)
 *    ✅ 认证验证
 *
 * 2. Get Terminal Details (4 tests)
 *    ✅ 获取终端详情
 *    ✅ 未绑定终端返回 null
 *    ✅ 认证验证
 *    ✅ MAC 地址格式验证
 *
 * 3. Get Registered Devices (3 tests)
 *    ✅ 获取所有注册设备
 *    ✅ 按 ID 查询注册设备
 *    ✅ 认证验证
 *
 * 4. Add Mount Device (5 tests)
 *    ✅ 成功添加挂载设备
 *    ✅ 拒绝重复 PID
 *    ✅ 拒绝未绑定终端
 *    ✅ 请求体验证
 *    ✅ 认证验证
 *
 * 5. Delete Mount Device (5 tests)
 *    ✅ 成功删除挂载设备
 *    ✅ 处理不存在的 PID
 *    ✅ 拒绝未绑定终端
 *    ✅ PID 格式验证
 *    ✅ 认证验证
 *
 * 6. Refresh Device Timeout (5 tests)
 *    ✅ 成功刷新设备超时
 *    ✅ 使用默认间隔
 *    ✅ 拒绝未绑定终端
 *    ✅ 间隔值验证
 *    ✅ 认证验证
 *
 * 总计: 26 个测试用例
 */
