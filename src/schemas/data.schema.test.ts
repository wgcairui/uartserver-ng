/**
 * Data Schema Tests (Phase 4.2 Day 2)
 * Tests for data API Zod validation schemas
 */

import { describe, test, expect } from 'bun:test';
import {
  MacPidParamsSchema,
  MacPidNameParamsSchema,
  HistoryDataQuerySchema,
  SingleParamHistoryQuerySchema,
  RawDataQuerySchema,
  ParsedDataQuerySchema,
  RefreshTimeoutRequestSchema,
  validateTimeRange,
  validateAggregation,
} from './data.schema';

describe('Data Schema Validation (Phase 4.2 Day 2)', () => {
  describe('MacPidParamsSchema', () => {
    test('should validate and convert valid MAC and PID', () => {
      const params = {
        mac: '001122334455',
        pid: '123',
      };

      const result = MacPidParamsSchema.parse(params);
      expect(result.mac).toBe('001122334455');
      expect(result.pid).toBe(123);
      expect(typeof result.pid).toBe('number');
    });

    test('should accept uppercase MAC addresses', () => {
      const params = {
        mac: 'AABBCCDDEEFF',
        pid: '1',
      };

      const result = MacPidParamsSchema.parse(params);
      expect(result.mac).toBe('AABBCCDDEEFF');
    });

    test('should reject invalid MAC addresses', () => {
      const invalidMacs = [
        { mac: '00112233445', pid: '1' }, // Too short
        { mac: '0011223344556', pid: '1' }, // Too long
        { mac: '00:11:22:33:44:55', pid: '1' }, // With separators
        { mac: 'GGHHIIJJKKLL', pid: '1' }, // Invalid hex
      ];

      invalidMacs.forEach((params) => {
        expect(() => MacPidParamsSchema.parse(params)).toThrow();
      });
    });

    test('should reject non-positive PIDs', () => {
      const invalidPIDs = [
        { mac: '001122334455', pid: '0' },
        { mac: '001122334455', pid: '-1' },
        { mac: '001122334455', pid: '-100' },
      ];

      invalidPIDs.forEach((params) => {
        expect(() => MacPidParamsSchema.parse(params)).toThrow();
      });
    });

    test('should reject non-numeric PID strings', () => {
      const params = {
        mac: '001122334455',
        pid: 'abc',
      };

      expect(() => MacPidParamsSchema.parse(params)).toThrow();
    });
  });

  describe('MacPidNameParamsSchema', () => {
    test('should validate MAC, PID, and name', () => {
      const params = {
        mac: '001122334455',
        pid: '123',
        name: 'temperature',
      };

      const result = MacPidNameParamsSchema.parse(params);
      expect(result.mac).toBe('001122334455');
      expect(result.pid).toBe(123);
      expect(result.name).toBe('temperature');
    });

    test('should reject empty parameter name', () => {
      const params = {
        mac: '001122334455',
        pid: '123',
        name: '',
      };

      expect(() => MacPidNameParamsSchema.parse(params)).toThrow();
    });
  });

  describe('HistoryDataQuerySchema', () => {
    test('should validate complete query with all fields', () => {
      const query = {
        name: 'temperature',
        start: '1704110400000', // 2025-01-01 12:00:00
        end: '1704196800000', // 2025-01-02 12:00:00
        aggregate: 'true',
        interval: '3600',
      };

      const result = HistoryDataQuerySchema.parse(query);
      expect(result.name).toEqual(['temperature']);
      expect(result.start).toBeInstanceOf(Date);
      expect(result.end).toBeInstanceOf(Date);
      expect(result.aggregate).toBe(true);
      expect(result.interval).toBe(3600);
    });

    test('should convert string name to array', () => {
      const query = {
        name: 'temperature',
        start: '1704110400000',
        end: '1704196800000',
      };

      const result = HistoryDataQuerySchema.parse(query);
      expect(result.name).toEqual(['temperature']);
      expect(Array.isArray(result.name)).toBe(true);
    });

    test('should handle array of names', () => {
      const query = {
        name: ['temperature', 'humidity'],
        start: '1704110400000',
        end: '1704196800000',
      };

      const result = HistoryDataQuerySchema.parse(query);
      expect(result.name).toEqual(['temperature', 'humidity']);
    });

    test('should handle missing optional fields', () => {
      const query = {
        start: '1704110400000',
        end: '1704196800000',
      };

      const result = HistoryDataQuerySchema.parse(query);
      expect(result.name).toBeUndefined();
      expect(result.aggregate).toBe(false);
      expect(result.interval).toBeUndefined();
    });

    test('should convert aggregate string to boolean', () => {
      const query1 = {
        start: '1704110400000',
        end: '1704196800000',
        aggregate: 'true',
      };

      const query2 = {
        start: '1704110400000',
        end: '1704196800000',
        aggregate: 'false',
      };

      const result1 = HistoryDataQuerySchema.parse(query1);
      const result2 = HistoryDataQuerySchema.parse(query2);

      expect(result1.aggregate).toBe(true);
      expect(result2.aggregate).toBe(false);
    });

    test('should reject invalid timestamp formats', () => {
      const query = {
        start: 'invalid',
        end: '1704196800000',
      };

      expect(() => HistoryDataQuerySchema.parse(query)).toThrow();
    });

    test('should convert interval string to number', () => {
      const query = {
        start: '1704110400000',
        end: '1704196800000',
        interval: '7200',
      };

      const result = HistoryDataQuerySchema.parse(query);
      expect(result.interval).toBe(7200);
      expect(typeof result.interval).toBe('number');
    });
  });

  describe('RawDataQuerySchema', () => {
    test('should validate complete raw data query', () => {
      const query = {
        mac: '001122334455',
        pid: '123',
        start: '1704110400000',
        end: '1704196800000',
        page: '2',
        limit: '50',
      };

      const result = RawDataQuerySchema.parse(query);
      expect(result.mac).toBe('001122334455');
      expect(result.pid).toBe(123);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(50);
    });

    test('should use default pagination values', () => {
      const query = {
        mac: '001122334455',
        pid: '123',
        start: '1704110400000',
        end: '1704196800000',
      };

      const result = RawDataQuerySchema.parse(query);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(100);
    });

    test('should reject page less than 1', () => {
      const query = {
        mac: '001122334455',
        pid: '123',
        start: '1704110400000',
        end: '1704196800000',
        page: '0',
      };

      expect(() => RawDataQuerySchema.parse(query)).toThrow();
    });

    test('should reject limit exceeding maximum', () => {
      const query = {
        mac: '001122334455',
        pid: '123',
        start: '1704110400000',
        end: '1704196800000',
        limit: '1001',
      };

      expect(() => RawDataQuerySchema.parse(query)).toThrow();
    });

    test('should accept maximum limit (1000)', () => {
      const query = {
        mac: '001122334455',
        pid: '123',
        start: '1704110400000',
        end: '1704196800000',
        limit: '1000',
      };

      const result = RawDataQuerySchema.parse(query);
      expect(result.limit).toBe(1000);
    });
  });

  describe('ParsedDataQuerySchema', () => {
    test('should validate complete parsed data query', () => {
      const query = {
        mac: '001122334455',
        pid: '123',
        name: 'temperature',
        start: '1704110400000',
        end: '1704196800000',
        page: '1',
        limit: '100',
      };

      const result = ParsedDataQuerySchema.parse(query);
      expect(result.mac).toBe('001122334455');
      expect(result.pid).toBe(123);
      expect(result.name).toBe('temperature');
      expect(result.page).toBe(1);
      expect(result.limit).toBe(100);
    });

    test('should handle missing optional name', () => {
      const query = {
        mac: '001122334455',
        pid: '123',
        start: '1704110400000',
        end: '1704196800000',
      };

      const result = ParsedDataQuerySchema.parse(query);
      expect(result.name).toBeUndefined();
    });
  });

  describe('RefreshTimeoutRequestSchema', () => {
    test('should validate valid refresh timeout', () => {
      const request = {
        data: {
          interval: 5000,
        },
      };

      expect(() => RefreshTimeoutRequestSchema.parse(request)).not.toThrow();
    });

    test('should accept optional interval', () => {
      const request = {
        data: {},
      };

      expect(() => RefreshTimeoutRequestSchema.parse(request)).not.toThrow();
    });

    test('should reject negative interval', () => {
      const request = {
        data: {
          interval: -1000,
        },
      };

      expect(() => RefreshTimeoutRequestSchema.parse(request)).toThrow();
    });

    test('should reject interval exceeding maximum (5 minutes)', () => {
      const request = {
        data: {
          interval: 300001,
        },
      };

      expect(() => RefreshTimeoutRequestSchema.parse(request)).toThrow();
    });

    test('should accept maximum interval (5 minutes)', () => {
      const request = {
        data: {
          interval: 300000,
        },
      };

      expect(() => RefreshTimeoutRequestSchema.parse(request)).not.toThrow();
    });

    test('should accept zero interval', () => {
      const request = {
        data: {
          interval: 0,
        },
      };

      expect(() => RefreshTimeoutRequestSchema.parse(request)).not.toThrow();
    });
  });

  describe('validateTimeRange helper', () => {
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
    });

    test('should reject time ranges exceeding 90 days', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-04-02T00:00:00Z'); // 91 days

      const result = validateTimeRange(start, end);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('90 days');
    });

    test('should reject future end times', () => {
      const start = new Date();
      const end = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const result = validateTimeRange(start, end);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('future');
    });
  });

  describe('validateAggregation helper', () => {
    test('should accept non-aggregated queries', () => {
      const result = validateAggregation(false);
      expect(result.valid).toBe(true);
    });

    test('should accept valid aggregation with interval', () => {
      const result = validateAggregation(true, 3600);
      expect(result.valid).toBe(true);
    });

    test('should reject aggregation without interval', () => {
      const result = validateAggregation(true);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('interval');
    });

    test('should reject negative interval', () => {
      const result = validateAggregation(true, -60);
      expect(result.valid).toBe(false);
    });

    test('should reject zero interval', () => {
      const result = validateAggregation(true, 0);
      expect(result.valid).toBe(false);
    });

    test('should reject interval less than 60 seconds', () => {
      const result = validateAggregation(true, 30);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('60 seconds');
    });

    test('should accept minimum interval (60 seconds)', () => {
      const result = validateAggregation(true, 60);
      expect(result.valid).toBe(true);
    });

    test('should reject interval exceeding 1 day', () => {
      const result = validateAggregation(true, 86401);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('1 day');
    });

    test('should accept maximum interval (1 day)', () => {
      const result = validateAggregation(true, 86400);
      expect(result.valid).toBe(true);
    });
  });
});
