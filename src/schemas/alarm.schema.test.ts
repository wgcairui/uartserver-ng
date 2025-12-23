/**
 * Alarm Schema Tests (Phase 4.2 Day 3)
 *
 * 测试告警 Schema 验证逻辑
 */

import { describe, expect, test } from 'bun:test';
import {
  AlarmQuerySchema,
  AlarmIdParamsSchema,
  ConfirmAlarmRequestSchema,
  UnconfirmedCountQuerySchema,
  UpdateAlarmContactsRequestSchema,
  BatchAlarmOperationRequestSchema,
  AlarmStatsQuerySchema,
  validateAlarmTimeRange,
  validateContactInfo,
} from './alarm.schema';

describe('AlarmQuerySchema', () => {
  test('should validate with default values', () => {
    const result = AlarmQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(50);
      expect(result.data.sortBy).toBe('timeStamp');
      expect(result.data.sortOrder).toBe('desc');
    }
  });

  test('should convert string page to number', () => {
    const result = AlarmQuerySchema.safeParse({ page: '5' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(5);
      expect(typeof result.data.page).toBe('number');
    }
  });

  test('should validate status enum', () => {
    const validStatuses = ['active', 'acknowledged', 'resolved', 'auto_resolved'];
    for (const status of validStatuses) {
      const result = AlarmQuerySchema.safeParse({ status });
      expect(result.success).toBe(true);
    }

    const invalidResult = AlarmQuerySchema.safeParse({ status: 'invalid' });
    expect(invalidResult.success).toBe(false);
  });

  test('should validate level enum', () => {
    const validLevels = ['info', 'warning', 'error', 'critical'];
    for (const level of validLevels) {
      const result = AlarmQuerySchema.safeParse({ level });
      expect(result.success).toBe(true);
    }

    const invalidResult = AlarmQuerySchema.safeParse({ level: 'invalid' });
    expect(invalidResult.success).toBe(false);
  });

  test('should validate MAC address format', () => {
    const validResult = AlarmQuerySchema.safeParse({ mac: '0123456789AB' });
    expect(validResult.success).toBe(true);

    const invalidResult = AlarmQuerySchema.safeParse({ mac: 'invalid' });
    expect(invalidResult.success).toBe(false);
  });

  test('should convert and validate PID', () => {
    const result = AlarmQuerySchema.safeParse({ pid: '123' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pid).toBe(123);
      expect(typeof result.data.pid).toBe('number');
    }

    const invalidResult = AlarmQuerySchema.safeParse({ pid: '-1' });
    expect(invalidResult.success).toBe(false);
  });

  test('should validate tag enum', () => {
    const validTags = ['Threshold', 'AlarmStat', 'ups', 'timeout', 'offline', 'custom'];
    for (const tag of validTags) {
      const result = AlarmQuerySchema.safeParse({ tag });
      expect(result.success).toBe(true);
    }
  });

  test('should convert timestamp strings to Date', () => {
    const timestamp = Date.now();
    const result = AlarmQuerySchema.safeParse({
      startTime: timestamp.toString(),
      endTime: (timestamp + 3600000).toString(),
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startTime).toBeInstanceOf(Date);
      expect(result.data.endTime).toBeInstanceOf(Date);
    }
  });

  test('should enforce limit constraints', () => {
    const validResult = AlarmQuerySchema.safeParse({ limit: '100' });
    expect(validResult.success).toBe(true);

    const invalidResult = AlarmQuerySchema.safeParse({ limit: '101' });
    expect(invalidResult.success).toBe(false);
  });
});

describe('AlarmIdParamsSchema', () => {
  test('should validate alarm ID', () => {
    const result = AlarmIdParamsSchema.safeParse({ id: '507f1f77bcf86cd799439011' });
    expect(result.success).toBe(true);
  });

  test('should reject empty ID', () => {
    const result = AlarmIdParamsSchema.safeParse({ id: '' });
    expect(result.success).toBe(false);
  });
});

describe('ConfirmAlarmRequestSchema', () => {
  test('should validate with comment', () => {
    const result = ConfirmAlarmRequestSchema.safeParse({
      data: { comment: 'Alarm confirmed by operator' },
    });
    expect(result.success).toBe(true);
  });

  test('should validate without comment', () => {
    const result = ConfirmAlarmRequestSchema.safeParse({ data: {} });
    expect(result.success).toBe(true);
  });

  test('should reject comment exceeding 500 characters', () => {
    const longComment = 'a'.repeat(501);
    const result = ConfirmAlarmRequestSchema.safeParse({
      data: { comment: longComment },
    });
    expect(result.success).toBe(false);
  });
});

describe('UnconfirmedCountQuerySchema', () => {
  test('should validate with MAC filter', () => {
    const result = UnconfirmedCountQuerySchema.safeParse({ mac: 'AABBCCDDEEFF' });
    expect(result.success).toBe(true);
  });

  test('should validate with level filter', () => {
    const result = UnconfirmedCountQuerySchema.safeParse({ level: 'critical' });
    expect(result.success).toBe(true);
  });

  test('should convert since timestamp', () => {
    const timestamp = Date.now();
    const result = UnconfirmedCountQuerySchema.safeParse({ since: timestamp.toString() });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.since).toBeInstanceOf(Date);
    }
  });

  test('should validate without filters', () => {
    const result = UnconfirmedCountQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('UpdateAlarmContactsRequestSchema', () => {
  test('should validate with emails', () => {
    const result = UpdateAlarmContactsRequestSchema.safeParse({
      data: {
        emails: ['user@example.com', 'admin@example.com'],
        enableEmail: true,
      },
    });
    expect(result.success).toBe(true);
  });

  test('should validate with phones', () => {
    const result = UpdateAlarmContactsRequestSchema.safeParse({
      data: {
        phones: ['13812345678', '13987654321'],
        enableSms: true,
      },
    });
    expect(result.success).toBe(true);
  });

  test('should reject invalid email format', () => {
    const result = UpdateAlarmContactsRequestSchema.safeParse({
      data: { emails: ['invalid-email'] },
    });
    expect(result.success).toBe(false);
  });

  test('should reject invalid phone format', () => {
    const result = UpdateAlarmContactsRequestSchema.safeParse({
      data: { phones: ['12345'] },
    });
    expect(result.success).toBe(false);
  });

  test('should enforce email limit (max 10)', () => {
    const emails = Array(11).fill('user@example.com');
    const result = UpdateAlarmContactsRequestSchema.safeParse({
      data: { emails },
    });
    expect(result.success).toBe(false);
  });

  test('should enforce phone limit (max 5)', () => {
    const phones = Array(6).fill('13812345678');
    const result = UpdateAlarmContactsRequestSchema.safeParse({
      data: { phones },
    });
    expect(result.success).toBe(false);
  });
});

describe('BatchAlarmOperationRequestSchema', () => {
  test('should validate confirm operation', () => {
    const result = BatchAlarmOperationRequestSchema.safeParse({
      data: {
        alarmIds: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
        operation: 'confirm',
      },
    });
    expect(result.success).toBe(true);
  });

  test('should validate resolve operation', () => {
    const result = BatchAlarmOperationRequestSchema.safeParse({
      data: {
        alarmIds: ['507f1f77bcf86cd799439011'],
        operation: 'resolve',
        comment: 'Issue resolved',
      },
    });
    expect(result.success).toBe(true);
  });

  test('should require at least one alarm ID', () => {
    const result = BatchAlarmOperationRequestSchema.safeParse({
      data: { alarmIds: [], operation: 'confirm' },
    });
    expect(result.success).toBe(false);
  });

  test('should enforce alarm ID limit (max 100)', () => {
    const alarmIds = Array(101).fill('507f1f77bcf86cd799439011');
    const result = BatchAlarmOperationRequestSchema.safeParse({
      data: { alarmIds, operation: 'confirm' },
    });
    expect(result.success).toBe(false);
  });
});

describe('AlarmStatsQuerySchema', () => {
  test('should validate with default period', () => {
    const result = AlarmStatsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.period).toBe('day');
    }
  });

  test('should validate period enum', () => {
    const validPeriods = ['hour', 'day', 'week', 'month'];
    for (const period of validPeriods) {
      const result = AlarmStatsQuerySchema.safeParse({ period });
      expect(result.success).toBe(true);
    }
  });

  test('should validate groupBy enum', () => {
    const validGroupBy = ['level', 'tag', 'protocol', 'mac'];
    for (const groupBy of validGroupBy) {
      const result = AlarmStatsQuerySchema.safeParse({ groupBy });
      expect(result.success).toBe(true);
    }
  });
});

describe('validateAlarmTimeRange', () => {
  test('should accept valid time range', () => {
    const start = new Date('2025-01-01');
    const end = new Date('2025-01-02');
    const result = validateAlarmTimeRange(start, end);
    expect(result.valid).toBe(true);
  });

  test('should reject start time after end time', () => {
    const start = new Date('2025-01-02');
    const end = new Date('2025-01-01');
    const result = validateAlarmTimeRange(start, end);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Start time must be before end time');
  });

  test('should reject range exceeding 180 days', () => {
    const start = new Date('2025-01-01');
    const end = new Date('2025-08-01'); // >180 days
    const result = validateAlarmTimeRange(start, end);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('cannot exceed 180 days');
  });

  test('should accept undefined dates', () => {
    const result = validateAlarmTimeRange(undefined, undefined);
    expect(result.valid).toBe(true);
  });
});

describe('validateContactInfo', () => {
  test('should accept emails only', () => {
    const result = validateContactInfo(['user@example.com'], undefined);
    expect(result.valid).toBe(true);
  });

  test('should accept phones only', () => {
    const result = validateContactInfo(undefined, ['13812345678']);
    expect(result.valid).toBe(true);
  });

  test('should accept both emails and phones', () => {
    const result = validateContactInfo(['user@example.com'], ['13812345678']);
    expect(result.valid).toBe(true);
  });

  test('should reject no contacts', () => {
    const result = validateContactInfo(undefined, undefined);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('At least one contact method');
  });

  test('should reject empty arrays', () => {
    const result = validateContactInfo([], []);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('At least one contact');
  });
});
