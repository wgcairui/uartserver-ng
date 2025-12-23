/**
 * Data Entity Tests (Phase 4.2 Day 2)
 * Tests for data entity helper functions
 */

import { describe, test, expect } from 'bun:test';
import {
  createDataRecordDocument,
  createParsedDataDocument,
  createSingleDataDocument,
  validateTimeRange,
} from './data.entity';

describe('Data Entity Helper Functions', () => {
  describe('createDataRecordDocument', () => {
    test('should create data record with required fields', () => {
      const timestamp = new Date('2025-01-01T12:00:00Z');
      const record = createDataRecordDocument('001122334455', 1, 'AABBCCDD', timestamp);

      expect(record.mac).toBe('001122334455');
      expect(record.pid).toBe(1);
      expect(record.data).toBe('AABBCCDD');
      expect(record.timestamp).toBe(timestamp);
      expect(record.createdAt).toBeInstanceOf(Date);
    });

    test('should use current time if timestamp not provided', () => {
      const before = new Date();
      const record = createDataRecordDocument('001122334455', 1, 'AABBCCDD');
      const after = new Date();

      expect(record.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(record.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    test('should handle various data formats', () => {
      const record1 = createDataRecordDocument('001122334455', 1, 'AABBCCDD');
      const record2 = createDataRecordDocument('001122334455', 1, '01020304');
      const record3 = createDataRecordDocument('001122334455', 1, '{}');

      expect(record1.data).toBe('AABBCCDD');
      expect(record2.data).toBe('01020304');
      expect(record3.data).toBe('{}');
    });
  });

  describe('createParsedDataDocument', () => {
    test('should create parsed data with all fields', () => {
      const timestamp = new Date('2025-01-01T12:00:00Z');
      const parsed = createParsedDataDocument(
        '001122334455',
        1,
        'modbus',
        'temperature',
        25.5,
        '°C',
        timestamp
      );

      expect(parsed.mac).toBe('001122334455');
      expect(parsed.pid).toBe(1);
      expect(parsed.protocol).toBe('modbus');
      expect(parsed.name).toBe('temperature');
      expect(parsed.value).toBe(25.5);
      expect(parsed.unit).toBe('°C');
      expect(parsed.timestamp).toBe(timestamp);
      expect(parsed.createdAt).toBeInstanceOf(Date);
    });

    test('should create parsed data without unit', () => {
      const parsed = createParsedDataDocument(
        '001122334455',
        1,
        'modbus',
        'count',
        100
      );

      expect(parsed.name).toBe('count');
      expect(parsed.value).toBe(100);
      expect(parsed.unit).toBeUndefined();
    });

    test('should handle negative and zero values', () => {
      const parsed1 = createParsedDataDocument(
        '001122334455',
        1,
        'modbus',
        'temperature',
        -10.5,
        '°C'
      );

      const parsed2 = createParsedDataDocument(
        '001122334455',
        1,
        'modbus',
        'count',
        0
      );

      expect(parsed1.value).toBe(-10.5);
      expect(parsed2.value).toBe(0);
    });

    test('should handle floating point values', () => {
      const parsed = createParsedDataDocument(
        '001122334455',
        1,
        'modbus',
        'voltage',
        220.567,
        'V'
      );

      expect(parsed.value).toBe(220.567);
    });
  });

  describe('createSingleDataDocument', () => {
    test('should create single data with all fields', () => {
      const timestamp = new Date('2025-01-01T12:00:00Z');
      const single = createSingleDataDocument(
        '001122334455',
        1,
        'temperature',
        25.5,
        '°C',
        timestamp
      );

      expect(single.mac).toBe('001122334455');
      expect(single.pid).toBe(1);
      expect(single.name).toBe('temperature');
      expect(single.value).toBe(25.5);
      expect(single.unit).toBe('°C');
      expect(single.timestamp).toBe(timestamp);
      expect(single.updatedAt).toBeInstanceOf(Date);
    });

    test('should create single data without unit', () => {
      const single = createSingleDataDocument(
        '001122334455',
        1,
        'status',
        1
      );

      expect(single.name).toBe('status');
      expect(single.value).toBe(1);
      expect(single.unit).toBeUndefined();
    });

    test('should use current time if not provided', () => {
      const before = new Date();
      const single = createSingleDataDocument(
        '001122334455',
        1,
        'temperature',
        25.5
      );
      const after = new Date();

      expect(single.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(single.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(single.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(single.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('validateTimeRange', () => {
    test('should accept valid time ranges', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-01-02T00:00:00Z');

      const result = validateTimeRange(start, end);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('should reject when start is after end', () => {
      const start = new Date('2025-01-02T00:00:00Z');
      const end = new Date('2025-01-01T00:00:00Z');

      const result = validateTimeRange(start, end);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('早于');
    });

    test('should reject when start equals end', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-01-01T00:00:00Z');

      const result = validateTimeRange(start, end);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should reject time ranges exceeding 90 days', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-04-02T00:00:00Z'); // 91 days

      const result = validateTimeRange(start, end);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('90');
    });

    test('should accept maximum 90 days range', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-04-01T00:00:00Z'); // exactly 90 days

      const result = validateTimeRange(start, end);
      expect(result.valid).toBe(true);
    });

    test('should reject when end time is in the future', () => {
      const start = new Date();
      const end = new Date(Date.now() + 24 * 60 * 60 * 1000); // tomorrow

      const result = validateTimeRange(start, end);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('当前时间');
    });

    test('should accept custom max days', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-02-01T00:00:00Z'); // 31 days

      const result1 = validateTimeRange(start, end, 30);
      expect(result1.valid).toBe(false);

      const result2 = validateTimeRange(start, end, 40);
      expect(result2.valid).toBe(true);
    });

    test('should handle short time ranges', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-01-01T00:01:00Z'); // 1 minute

      const result = validateTimeRange(start, end);
      expect(result.valid).toBe(true);
    });
  });
});
