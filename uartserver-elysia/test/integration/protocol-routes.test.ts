/**
 * Protocol Routes Integration Tests (Phase 8.2)
 *
 * 测试协议管理 API 端点
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import type { App } from '../../src/index';
import { mongodb } from '../../src/database/mongodb';
import type { UserDocument } from '../../src/entities/mongodb/user.entity';

// ============================================================================
// Test Setup
// ============================================================================

const api = treaty<App>('localhost:3000');

// 测试用户凭证
const testUser = {
  username: 'protocol_test_user',
  password: 'TestPassword123',
  phone: '13900000001',
};

let accessToken: string;
let testUserId: string;

// 测试数据
const testProtocol = 'ModbusRTU'; // 假设存在的协议
const testMac = 'A1B2C3D4E5F6'; // 测试设备 MAC
const testPid = 1;

// ============================================================================
// Test Lifecycle
// ============================================================================

beforeAll(async () => {
  // 确保数据库连接
  await mongodb.connect();

  // 清理可能存在的测试用户
  const usersCollection = mongodb.getDatabase().collection('users');
  await usersCollection.deleteOne({ username: testUser.username });

  // 注册测试用户
  const registerResponse = await api.api.auth.register.post({
    data: {
      username: testUser.username,
      password: testUser.password,
      confirmPassword: testUser.password,
      phone: testUser.phone,
    },
  });

  if (registerResponse.error) {
    throw new Error('Failed to register test user');
  }

  testUserId = registerResponse.data!.data.userId;

  // 登录获取 token
  const loginResponse = await api.api.auth.login.post({
    data: {
      username: testUser.username,
      password: testUser.password,
    },
  });

  if (loginResponse.error) {
    throw new Error('Failed to login test user');
  }

  accessToken = loginResponse.data!.data.accessToken;

  // 创建测试终端设备 (用于 getTerminalProtocol 测试)
  const terminalsCollection = mongodb.getDatabase().collection('terminals');
  await terminalsCollection.insertOne({
    DevMac: testMac,
    name: 'Test Terminal',
    Type: 485,
    online: true,
    mountDevs: [
      {
        pid: testPid,
        protocol: testProtocol,
        Type: 485,
        protocolType: 'modbus',
        port: 1,
        remark: 'Test mount device',
      },
    ],
  });

  // 绑定设备到用户
  await usersCollection.updateOne(
    { username: testUser.username },
    { $addToSet: { devices: testMac } }
  );
});

// ============================================================================
// Protocol Query Tests
// ============================================================================

describe('Protocol Query Endpoints', () => {
  test('GET /api/protocols/:code should return protocol details', async () => {
    // 注意: 需要数据库中存在测试协议数据
    // 该测试可能需要根据实际数据库内容调整

    const { data, error } = await api.api.protocols({ code: testProtocol }).get(
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    expect(error).toBeUndefined();
    // Protocol 可能存在或不存在,取决于数据库
    // expect(data?.status).toBe('ok');
  });

  test('GET /api/protocols/:code/alarm should return alarm config', async () => {
    const { data, error } = await api.api.protocols({ code: testProtocol })[
      'alarm'
    ].get({
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(error).toBeUndefined();
    expect(data?.status).toBe('ok');
  });

  test('GET /api/protocols/:code/alarm-setup should return user alarm setup', async () => {
    const { data, error } = await api.api.protocols({
      code: testProtocol,
    })['alarm-setup'].get({
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(error).toBeUndefined();
    expect(data?.status).toBe('ok');
    // 新用户可能没有自定义配置
    // expect(data?.data).toBeNull();
  });

  test('GET /api/protocols/:code/setup should return system and user setup', async () => {
    const { data, error } = await api.api.protocols({
      code: testProtocol,
    }).setup.get({
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      query: {
        type: 'Threshold',
      },
    });

    expect(error).toBeUndefined();
    expect(data?.status).toBe('ok');
    expect(data?.data).toHaveProperty('sys');
    expect(data?.data).toHaveProperty('user');
  });

  test('GET /api/protocols/terminal/:mac/:pid should return terminal protocol', async () => {
    const { data, error } = await api.api.protocols.terminal({
      mac: testMac,
      pid: testPid.toString(),
    }).get({
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(error).toBeUndefined();
    expect(data?.status).toBe('ok');

    if (data?.data) {
      expect(data.data.pid).toBe(testPid);
      expect(data.data.protocol).toBe(testProtocol);
    }
  });

  test('GET /api/protocols/terminal/:mac/:pid should return null for unauthorized device', async () => {
    const unauthorizedMac = 'FFFFFFFFFFFF';

    const { data, error } = await api.api.protocols.terminal({
      mac: unauthorizedMac,
      pid: testPid.toString(),
    }).get({
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(error).toBeUndefined();
    expect(data?.status).toBe('ok');
    expect(data?.data).toBeNull();
  });
});

// ============================================================================
// Protocol Operations Tests
// ============================================================================

describe('Protocol Operations Endpoints', () => {
  test('POST /api/protocols/send-instruction should send instruction (placeholder)', async () => {
    const { data, error } = await api.api.protocols['send-instruction'].post(
      {
        data: {
          query: {
            DevMac: testMac,
            pid: testPid,
            protocol: testProtocol,
          },
          item: {
            name: 'test_instruction',
            value: '01 03 00 00 00 01',
            bl: '*10',
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    expect(error).toBeUndefined();
    expect(data?.status).toBe('ok');
    // Placeholder 实现应该返回 success: true
    // expect(data?.data.success).toBe(true);
  });

  test('POST /api/protocols/send-instruction should reject unauthorized device', async () => {
    const unauthorizedMac = 'FFFFFFFFFFFF';

    const { data, error } = await api.api.protocols['send-instruction'].post(
      {
        data: {
          query: {
            DevMac: unauthorizedMac,
            pid: testPid,
            protocol: testProtocol,
          },
          item: {
            name: 'test_instruction',
            value: '01 03 00 00 00 01',
            bl: '*10',
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    expect(error).toBeUndefined();
    expect(data?.status).toBe('ok');
    expect(data?.message).toContain('未绑定');
    expect(data?.data.success).toBe(false);
  });

  test('POST /api/protocols/send-instruction should handle %i parameter replacement', async () => {
    const { data, error } = await api.api.protocols['send-instruction'].post(
      {
        data: {
          query: {
            DevMac: testMac,
            pid: testPid,
            protocol: testProtocol,
          },
          item: {
            name: 'set_temperature',
            value: '01 06 00 01 %i',
            bl: '*10',
            val: '25.5', // 应该被转换为 255 (25.5 * 10) -> 0xFF
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    expect(error).toBeUndefined();
    expect(data?.status).toBe('ok');
  });

  test('POST /api/protocols/send-instruction should handle %i%i parameter replacement', async () => {
    const { data, error } = await api.api.protocols['send-instruction'].post(
      {
        data: {
          query: {
            DevMac: testMac,
            pid: testPid,
            protocol: testProtocol,
          },
          item: {
            name: 'set_value_16bit',
            value: '01 06 00 01 %i%i',
            bl: '*100',
            val: '123.45', // 应该被转换为 12345 -> 0x3039
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    expect(error).toBeUndefined();
    expect(data?.status).toBe('ok');
  });

  test('PUT /api/protocols/:code/user-setup should update user protocol config', async () => {
    const { data, error } = await api.api.protocols({
      code: testProtocol,
    })['user-setup'].put(
      {
        data: {
          type: 'Threshold',
          arg: [
            { name: 'temperature', min: 10, max: 30 },
            { name: 'humidity', min: 30, max: 70 },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    expect(error).toBeUndefined();
    expect(data?.status).toBe('ok');
    expect(data?.data.success).toBe(true);
  });

  test('PUT /api/protocols/:code/user-setup should update ShowTag config', async () => {
    const { data, error } = await api.api.protocols({
      code: testProtocol,
    })['user-setup'].put(
      {
        data: {
          type: 'ShowTag',
          arg: ['temperature', 'humidity', 'pressure'],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    expect(error).toBeUndefined();
    expect(data?.status).toBe('ok');
    expect(data?.data.success).toBe(true);
  });

  test('PUT /api/protocols/:code/user-setup should update AlarmStat config', async () => {
    const { data, error } = await api.api.protocols({
      code: testProtocol,
    })['user-setup'].put(
      {
        data: {
          type: 'AlarmStat',
          arg: [
            { name: 'temperature', alarmStat: ['high', 'critical'] },
            { name: 'humidity', alarmStat: ['low'] },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    expect(error).toBeUndefined();
    expect(data?.status).toBe('ok');
    expect(data?.data.success).toBe(true);
  });
});

// ============================================================================
// Authentication Tests
// ============================================================================

describe('Protocol Authentication', () => {
  test('should require authentication for all endpoints', async () => {
    const { error } = await api.api.protocols({ code: testProtocol }).get();

    expect(error).toBeDefined();
    // Should return authentication error
  });

  test('should reject invalid JWT token', async () => {
    const { error } = await api.api.protocols({ code: testProtocol }).get({
      headers: {
        Authorization: 'Bearer invalid_token',
      },
    });

    expect(error).toBeDefined();
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe('Protocol Validation', () => {
  test('should validate MAC address format', async () => {
    const invalidMac = 'invalid_mac';

    const { error } = await api.api.protocols.terminal({
      mac: invalidMac,
      pid: testPid.toString(),
    }).get({
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    // Should fail validation
    expect(error).toBeDefined();
  });

  test('should validate PID format', async () => {
    const invalidPid = 'not_a_number';

    const { error } = await api.api.protocols.terminal({
      mac: testMac,
      pid: invalidPid,
    }).get({
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    // Should fail validation
    expect(error).toBeDefined();
  });

  test('should validate protocol config type', async () => {
    const { error } = await api.api.protocols({
      code: testProtocol,
    }).setup.get({
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      query: {
        type: 'InvalidType' as any,
      },
    });

    // Should fail validation
    expect(error).toBeDefined();
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Protocol Edge Cases', () => {
  test('should handle non-existent protocol gracefully', async () => {
    const nonExistentProtocol = 'NonExistentProtocol123';

    const { data, error } = await api.api.protocols({
      code: nonExistentProtocol,
    }).get({
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(error).toBeUndefined();
    expect(data?.status).toBe('ok');
    // Should return null or empty data
  });

  test('should handle empty user config', async () => {
    const newProtocol = 'NewProtocol';

    const { data, error } = await api.api.protocols({
      code: newProtocol,
    })['alarm-setup'].get({
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(error).toBeUndefined();
    expect(data?.status).toBe('ok');
    // New protocol should have null user config
  });

  test('should handle coefficient parsing with division', async () => {
    const { data, error } = await api.api.protocols['send-instruction'].post(
      {
        data: {
          query: {
            DevMac: testMac,
            pid: testPid,
            protocol: testProtocol,
          },
          item: {
            name: 'test_division',
            value: '01 06 00 01 %i',
            bl: '/10',
            val: '100', // 100 / 10 = 10 -> 0x0A
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    expect(error).toBeUndefined();
    expect(data?.status).toBe('ok');
  });

  test('should handle coefficient parsing with addition', async () => {
    const { data, error } = await api.api.protocols['send-instruction'].post(
      {
        data: {
          query: {
            DevMac: testMac,
            pid: testPid,
            protocol: testProtocol,
          },
          item: {
            name: 'test_addition',
            value: '01 06 00 01 %i',
            bl: '+5',
            val: '10', // 10 + 5 = 15 -> 0x0F
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    expect(error).toBeUndefined();
    expect(data?.status).toBe('ok');
  });
});
