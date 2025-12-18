/**
 * 测试数据 Fixtures
 * 生成测试用的模拟数据
 */

import jwt from 'jsonwebtoken';
import type { DtuOperationLog } from '../../src/types/entities/dtu-operation-log.entity';
import type { DtuOperationType } from '../../src/types/socket-events';

/**
 * 生成测试 JWT Token
 */
export function generateTestToken(payload: {
  userId: string;
  username?: string;
  expiresIn?: string;
}): string {
  const secret = process.env.JWT_SECRET || 'test-secret-key';
  return jwt.sign(
    {
      userId: payload.userId,
      username: payload.username || 'testuser',
    },
    secret,
    {
      expiresIn: payload.expiresIn || '1h',
    }
  ) as string;
}

/**
 * 生成测试 DTU 操作日志
 */
export function generateDtuOperationLog(overrides?: Partial<DtuOperationLog>): Omit<DtuOperationLog, '_id'> {
  return {
    mac: overrides?.mac || 'AA:BB:CC:DD:EE:FF',
    operation: overrides?.operation || 'restart',
    content: overrides?.content,
    success: overrides?.success !== undefined ? overrides.success : true,
    message: overrides?.message || 'Operation successful',
    data: overrides?.data,
    operatedBy: overrides?.operatedBy || 'test-user',
    operatedAt: overrides?.operatedAt || new Date(),
    useTime: overrides?.useTime || 1000,
    nodeName: overrides?.nodeName || 'test-node',
    error: overrides?.error,
  };
}

/**
 * 生成多个测试日志
 * @param count - 生成数量
 * @param overrides - 覆盖字段
 * @param baseTimestamp - 基准时间戳（可选，默认为当前时间）
 */
export function generateDtuOperationLogs(
  count: number,
  overrides?: Partial<DtuOperationLog>,
  baseTimestamp?: number
): Omit<DtuOperationLog, '_id'>[] {
  const base = baseTimestamp || Date.now();
  return Array.from({ length: count }, (_, i) =>
    generateDtuOperationLog({
      ...overrides,
      operatedAt: new Date(base - (count - i - 1) * 1000), // 递增时间（从旧到新）
    })
  );
}

/**
 * 生成测试用户设备绑定
 */
export function generateUserTerminalBinding(userId: string, mac: string) {
  return {
    userId,
    mac,
    bindAt: new Date(),
  };
}

/**
 * 常用测试数据
 */
export const TEST_DATA = {
  // 测试用户
  users: {
    admin: {
      userId: 'test-admin-001',
      username: 'admin',
      token: '',
    },
    user1: {
      userId: 'test-user-001',
      username: 'user1',
      token: '',
    },
    user2: {
      userId: 'test-user-002',
      username: 'user2',
      token: '',
    },
  },

  // 测试设备
  devices: {
    device1: {
      mac: 'AA:BB:CC:DD:EE:01',
      name: 'Test Device 1',
    },
    device2: {
      mac: 'AA:BB:CC:DD:EE:02',
      name: 'Test Device 2',
    },
    device3: {
      mac: 'AA:BB:CC:DD:EE:03',
      name: 'Test Device 3',
    },
  },

  // 测试操作类型
  operations: ['restart', 'restart485', 'updateMount', 'OprateInstruct', 'setTerminal', 'getTerminal'] as DtuOperationType[],
};

/**
 * 初始化测试用户 token
 */
export function initializeTestTokens(): void {
  TEST_DATA.users.admin.token = generateTestToken({
    userId: TEST_DATA.users.admin.userId,
    username: TEST_DATA.users.admin.username,
  });

  TEST_DATA.users.user1.token = generateTestToken({
    userId: TEST_DATA.users.user1.userId,
    username: TEST_DATA.users.user1.username,
  });

  TEST_DATA.users.user2.token = generateTestToken({
    userId: TEST_DATA.users.user2.userId,
    username: TEST_DATA.users.user2.username,
  });
}
