/**
 * Protocol Schema Tests (Phase 4.2 Day 3)
 *
 * 测试协议 Schema 验证逻辑
 */

import { describe, expect, test } from 'bun:test';
import {
  ProtocolNameParamsSchema,
  UserProtocolConfigQuerySchema,
  UpdateUserProtocolConfigRequestSchema,
  AlarmConditionSchema,
  validateProtocolName,
  validateRefreshInterval,
  validateParameterConfigCount,
} from './protocol.schema';

describe('ProtocolNameParamsSchema', () => {
  test('should validate protocol name', () => {
    const result = ProtocolNameParamsSchema.safeParse({ protocol: 'modbus-rtu' });
    expect(result.success).toBe(true);
  });

  test('should reject empty protocol name', () => {
    const result = ProtocolNameParamsSchema.safeParse({ protocol: '' });
    expect(result.success).toBe(false);
  });
});

describe('UserProtocolConfigQuerySchema', () => {
  test('should validate MAC address', () => {
    const result = UserProtocolConfigQuerySchema.safeParse({ mac: 'AABBCCDDEEFF' });
    expect(result.success).toBe(true);
  });

  test('should convert and validate PID', () => {
    const result = UserProtocolConfigQuerySchema.safeParse({ pid: '123' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pid).toBe(123);
      expect(typeof result.data.pid).toBe('number');
    }
  });

  test('should reject invalid MAC format', () => {
    const result = UserProtocolConfigQuerySchema.safeParse({ mac: 'invalid' });
    expect(result.success).toBe(false);
  });

  test('should reject negative PID', () => {
    const result = UserProtocolConfigQuerySchema.safeParse({ pid: '-1' });
    expect(result.success).toBe(false);
  });
});

describe('AlarmConditionSchema', () => {
  test('should validate greater than operator', () => {
    const result = AlarmConditionSchema.safeParse({
      operator: '>',
      value: 100,
    });
    expect(result.success).toBe(true);
  });

  test('should validate between operator', () => {
    const result = AlarmConditionSchema.safeParse({
      operator: 'between',
      min: 10,
      max: 100,
    });
    expect(result.success).toBe(true);
  });

  test('should reject between without min/max', () => {
    const result = AlarmConditionSchema.safeParse({
      operator: 'between',
      value: 50,
    });
    expect(result.success).toBe(false);
  });

  test('should validate outside operator', () => {
    const result = AlarmConditionSchema.safeParse({
      operator: 'outside',
      min: 10,
      max: 100,
    });
    expect(result.success).toBe(true);
  });

  test('should reject comparison operator without value', () => {
    const result = AlarmConditionSchema.safeParse({
      operator: '>',
      min: 10,
    });
    expect(result.success).toBe(false);
  });

  test('should validate all comparison operators', () => {
    const operators = ['>', '>=', '<', '<=', '==', '!='];
    for (const operator of operators) {
      const result = AlarmConditionSchema.safeParse({
        operator,
        value: 50,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('UpdateUserProtocolConfigRequestSchema', () => {
  test('should validate with MAC address', () => {
    const result = UpdateUserProtocolConfigRequestSchema.safeParse({
      data: { mac: 'AABBCCDDEEFF' },
    });
    expect(result.success).toBe(true);
  });

  test('should validate with PID', () => {
    const result = UpdateUserProtocolConfigRequestSchema.safeParse({
      data: { pid: 1 },
    });
    expect(result.success).toBe(true);
  });

  test('should validate with parameter configs', () => {
    const result = UpdateUserProtocolConfigRequestSchema.safeParse({
      data: {
        parameterConfigs: {
          temperature: {
            visible: true,
            customLabel: 'Temperature',
            customUnit: '°C',
            displayOrder: 1,
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  test('should validate color format in parameter configs', () => {
    const validResult = UpdateUserProtocolConfigRequestSchema.safeParse({
      data: {
        parameterConfigs: {
          temperature: { color: '#FF5733' },
        },
      },
    });
    expect(validResult.success).toBe(true);

    const invalidResult = UpdateUserProtocolConfigRequestSchema.safeParse({
      data: {
        parameterConfigs: {
          temperature: { color: 'invalid' },
        },
      },
    });
    expect(invalidResult.success).toBe(false);
  });

  test('should validate alarm overrides', () => {
    const result = UpdateUserProtocolConfigRequestSchema.safeParse({
      data: {
        alarmOverrides: [
          {
            paramName: 'temperature',
            enabled: true,
            level: 'warning',
            condition: {
              operator: '>',
              value: 30,
            },
            customMessage: 'Temperature too high',
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  test('should enforce alarm override limit (max 50)', () => {
    const alarmOverrides = Array(51).fill({
      paramName: 'param',
      enabled: true,
    });
    const result = UpdateUserProtocolConfigRequestSchema.safeParse({
      data: { alarmOverrides },
    });
    expect(result.success).toBe(false);
  });

  test('should validate refresh interval range', () => {
    const validResult = UpdateUserProtocolConfigRequestSchema.safeParse({
      data: { refreshInterval: 5000 },
    });
    expect(validResult.success).toBe(true);

    const tooLowResult = UpdateUserProtocolConfigRequestSchema.safeParse({
      data: { refreshInterval: 500 },
    });
    expect(tooLowResult.success).toBe(false);

    const tooHighResult = UpdateUserProtocolConfigRequestSchema.safeParse({
      data: { refreshInterval: 400000 },
    });
    expect(tooHighResult.success).toBe(false);
  });

  test('should reject invalid MAC format', () => {
    const result = UpdateUserProtocolConfigRequestSchema.safeParse({
      data: { mac: 'invalid' },
    });
    expect(result.success).toBe(false);
  });

  test('should reject negative PID', () => {
    const result = UpdateUserProtocolConfigRequestSchema.safeParse({
      data: { pid: -1 },
    });
    expect(result.success).toBe(false);
  });
});

describe('validateProtocolName', () => {
  test('should accept valid protocol name', () => {
    const result = validateProtocolName('modbus-rtu');
    expect(result.valid).toBe(true);
  });

  test('should accept protocol name with numbers', () => {
    const result = validateProtocolName('protocol-123');
    expect(result.valid).toBe(true);
  });

  test('should accept protocol name with underscores', () => {
    const result = validateProtocolName('my_protocol');
    expect(result.valid).toBe(true);
  });

  test('should reject empty protocol name', () => {
    const result = validateProtocolName('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('cannot be empty');
  });

  test('should reject protocol name exceeding 50 characters', () => {
    const longName = 'a'.repeat(51);
    const result = validateProtocolName(longName);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('cannot exceed 50 characters');
  });

  test('should reject protocol name with special characters', () => {
    const result = validateProtocolName('protocol@123');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('letters, numbers, underscores, and hyphens');
  });

  test('should reject protocol name with spaces', () => {
    const result = validateProtocolName('my protocol');
    expect(result.valid).toBe(false);
  });
});

describe('validateRefreshInterval', () => {
  test('should accept valid interval (1 second)', () => {
    const result = validateRefreshInterval(1000);
    expect(result.valid).toBe(true);
  });

  test('should accept valid interval (5 minutes)', () => {
    const result = validateRefreshInterval(300000);
    expect(result.valid).toBe(true);
  });

  test('should reject interval below 1 second', () => {
    const result = validateRefreshInterval(999);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least 1 second');
  });

  test('should reject interval above 5 minutes', () => {
    const result = validateRefreshInterval(300001);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('cannot exceed 5 minutes');
  });
});

describe('validateParameterConfigCount', () => {
  test('should accept valid count', () => {
    const result = validateParameterConfigCount(50);
    expect(result.valid).toBe(true);
  });

  test('should accept maximum count', () => {
    const result = validateParameterConfigCount(100);
    expect(result.valid).toBe(true);
  });

  test('should reject count exceeding 100', () => {
    const result = validateParameterConfigCount(101);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Maximum 100 parameters');
  });

  test('should accept zero count', () => {
    const result = validateParameterConfigCount(0);
    expect(result.valid).toBe(true);
  });
});
