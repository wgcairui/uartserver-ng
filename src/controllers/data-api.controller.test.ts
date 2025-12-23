/**
 * Data API Controller Tests (Phase 4.2 Day 2)
 * Schema validation tests for controller endpoints
 *
 * Note: Full integration tests with MongoDB are handled separately in E2E tests.
 * These tests verify the schema validation logic used by controller endpoints.
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
} from '../schemas/data.schema';

describe('DataApiController Schema Validation (Phase 4.2 Day 2)', () => {
  describe('GET /api/data/latest/:mac/:pid - Path Params Validation', () => {
    test('should validate MAC and PID parameters', () => {
      const params = {
        mac: '001122334455',
        pid: '123',
      };

      expect(() => MacPidParamsSchema.parse(params)).not.toThrow();
    });

    test('should reject invalid MAC address', () => {
      const params = {
        mac: 'invalid-mac',
        pid: '123',
      };

      expect(() => MacPidParamsSchema.parse(params)).toThrow();
    });

    test('should convert and validate PID', () => {
      const params = {
        mac: '001122334455',
        pid: '456',
      };

      const result = MacPidParamsSchema.parse(params);
      expect(result.pid).toBe(456);
      expect(typeof result.pid).toBe('number');
    });
  });

  describe('GET /api/data/history/:mac/:pid - Query Validation', () => {
    test('should validate complete history query', () => {
      const query = {
        name: 'temperature',
        start: '1704110400000',
        end: '1704196800000',
        aggregate: 'true',
        interval: '3600',
      };

      expect(() => HistoryDataQuerySchema.parse(query)).not.toThrow();
    });

    test('should handle missing optional fields', () => {
      const query = {
        start: '1704110400000',
        end: '1704196800000',
      };

      const result = HistoryDataQuerySchema.parse(query);
      expect(result.name).toBeUndefined();
      expect(result.aggregate).toBe(false);
    });

    test('should convert timestamps to Date objects', () => {
      const query = {
        start: '1704110400000',
        end: '1704196800000',
      };

      const result = HistoryDataQuerySchema.parse(query);
      expect(result.start).toBeInstanceOf(Date);
      expect(result.end).toBeInstanceOf(Date);
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

    test('should handle single and multiple parameter names', () => {
      const query1 = {
        name: 'temperature',
        start: '1704110400000',
        end: '1704196800000',
      };

      const query2 = {
        name: ['temperature', 'humidity'],
        start: '1704110400000',
        end: '1704196800000',
      };

      const result1 = HistoryDataQuerySchema.parse(query1);
      const result2 = HistoryDataQuerySchema.parse(query2);

      expect(result1.name).toEqual(['temperature']);
      expect(result2.name).toEqual(['temperature', 'humidity']);
    });
  });

  describe('GET /api/data/:mac/:pid/:name - Path and Query Validation', () => {
    test('should validate MAC, PID, and name parameters', () => {
      const params = {
        mac: '001122334455',
        pid: '123',
        name: 'temperature',
      };

      expect(() => MacPidNameParamsSchema.parse(params)).not.toThrow();
    });

    test('should validate query parameters', () => {
      const query = {
        start: '1704110400000',
        end: '1704196800000',
        aggregate: 'false',
      };

      expect(() => SingleParamHistoryQuerySchema.parse(query)).not.toThrow();
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

  describe('GET /api/data/raw - Query Validation', () => {
    test('should validate complete raw data query', () => {
      const query = {
        mac: '001122334455',
        pid: '123',
        start: '1704110400000',
        end: '1704196800000',
        page: '2',
        limit: '50',
      };

      expect(() => RawDataQuerySchema.parse(query)).not.toThrow();
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

    test('should reject invalid pagination parameters', () => {
      const invalidQueries = [
        {
          mac: '001122334455',
          pid: '123',
          start: '1704110400000',
          end: '1704196800000',
          page: '0',
        },
        {
          mac: '001122334455',
          pid: '123',
          start: '1704110400000',
          end: '1704196800000',
          limit: '1001',
        },
      ];

      invalidQueries.forEach((query) => {
        expect(() => RawDataQuerySchema.parse(query)).toThrow();
      });
    });

    test('should convert string numbers to integers', () => {
      const query = {
        mac: '001122334455',
        pid: '123',
        start: '1704110400000',
        end: '1704196800000',
        page: '5',
        limit: '200',
      };

      const result = RawDataQuerySchema.parse(query);
      expect(result.pid).toBe(123);
      expect(result.page).toBe(5);
      expect(result.limit).toBe(200);
      expect(typeof result.pid).toBe('number');
      expect(typeof result.page).toBe('number');
      expect(typeof result.limit).toBe('number');
    });
  });

  describe('GET /api/data/parsed - Query Validation', () => {
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

      expect(() => ParsedDataQuerySchema.parse(query)).not.toThrow();
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

    test('should use default pagination', () => {
      const query = {
        mac: '001122334455',
        pid: '123',
        start: '1704110400000',
        end: '1704196800000',
      };

      const result = ParsedDataQuerySchema.parse(query);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(100);
    });
  });

  describe('POST /api/data/:mac/:pid/refresh-timeout - Body Validation', () => {
    test('should validate valid refresh timeout', () => {
      const body = {
        data: {
          interval: 5000,
        },
      };

      expect(() => RefreshTimeoutRequestSchema.parse(body)).not.toThrow();
    });

    test('should accept optional interval', () => {
      const body = {
        data: {},
      };

      expect(() => RefreshTimeoutRequestSchema.parse(body)).not.toThrow();
    });

    test('should reject negative interval', () => {
      const body = {
        data: {
          interval: -1000,
        },
      };

      expect(() => RefreshTimeoutRequestSchema.parse(body)).toThrow();
    });

    test('should reject interval exceeding maximum', () => {
      const body = {
        data: {
          interval: 300001,
        },
      };

      expect(() => RefreshTimeoutRequestSchema.parse(body)).toThrow();
    });

    test('should accept maximum interval (5 minutes)', () => {
      const body = {
        data: {
          interval: 300000,
        },
      };

      expect(() => RefreshTimeoutRequestSchema.parse(body)).not.toThrow();
    });

    test('should accept zero interval', () => {
      const body = {
        data: {
          interval: 0,
        },
      };

      expect(() => RefreshTimeoutRequestSchema.parse(body)).not.toThrow();
    });
  });

  describe('Controller Endpoint Coverage', () => {
    test('should have schemas for all main endpoints', () => {
      // Verify that all critical schemas are defined and exported
      expect(MacPidParamsSchema).toBeDefined();
      expect(MacPidNameParamsSchema).toBeDefined();
      expect(HistoryDataQuerySchema).toBeDefined();
      expect(SingleParamHistoryQuerySchema).toBeDefined();
      expect(RawDataQuerySchema).toBeDefined();
      expect(ParsedDataQuerySchema).toBeDefined();
      expect(RefreshTimeoutRequestSchema).toBeDefined();
    });

    test('schemas should properly infer TypeScript types', () => {
      // Type inference test
      type MacPidType = typeof MacPidParamsSchema._output;
      type HistoryQueryType = typeof HistoryDataQuerySchema._output;
      type RawDataQueryType = typeof RawDataQuerySchema._output;

      // If these compile, the types are properly inferred
      const params: MacPidType = MacPidParamsSchema.parse({
        mac: '001122334455',
        pid: '123',
      });

      const historyQuery: HistoryQueryType = HistoryDataQuerySchema.parse({
        start: '1704110400000',
        end: '1704196800000',
      });

      const rawQuery: RawDataQueryType = RawDataQuerySchema.parse({
        mac: '001122334455',
        pid: '123',
        start: '1704110400000',
        end: '1704196800000',
      });

      expect(params).toBeDefined();
      expect(historyQuery).toBeDefined();
      expect(rawQuery).toBeDefined();
    });
  });

  describe('Error Messages', () => {
    test('should provide clear error messages for validation failures', () => {
      try {
        MacPidParamsSchema.parse({ mac: 'invalid', pid: '123' });
      } catch (error: any) {
        expect(error.issues).toBeDefined();
        expect(error.issues.length).toBeGreaterThan(0);
        expect(error.issues[0].message).toBeDefined();
      }
    });

    test('should include field path in error', () => {
      try {
        RawDataQuerySchema.parse({
          mac: '001122334455',
          pid: '123',
          start: '1704110400000',
          end: '1704196800000',
          limit: '2000',
        });
      } catch (error: any) {
        expect(error.issues).toBeDefined();
        expect(error.issues[0].path).toBeDefined();
      }
    });
  });
});
