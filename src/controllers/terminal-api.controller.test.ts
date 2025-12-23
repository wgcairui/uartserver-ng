/**
 * Terminal API Controller Tests (Phase 4.2)
 * Schema validation tests for controller endpoints
 *
 * Note: Full integration tests with MongoDB are handled separately in E2E tests.
 * These tests verify the schema validation logic used by controller endpoints.
 */

import { describe, test, expect } from 'bun:test';
import {
  UpdateTerminalRequestSchema,
  AddMountDeviceRequestSchema,
  TerminalQuerySchema,
  MacPidParamsSchema,
} from '../schemas/terminal.schema';

describe('TerminalApiController Schema Validation (Phase 4.2)', () => {
  describe('GET /api/terminals - Query Validation', () => {
    test('should validate query parameters with TerminalQuerySchema', () => {
      const validQuery = {
        page: '2',
        limit: '25',
        online: 'true',
        keyword: 'test',
      };

      expect(() => TerminalQuerySchema.parse(validQuery)).not.toThrow();
    });

    test('should reject invalid page parameter', () => {
      const invalidQuery = { page: '0' };
      expect(() => TerminalQuerySchema.parse(invalidQuery)).toThrow();
    });

    test('should reject invalid limit parameter', () => {
      const invalidQuery = { limit: '101' };
      expect(() => TerminalQuerySchema.parse(invalidQuery)).toThrow();
    });

    test('should use default values for missing parameters', () => {
      const result = TerminalQuerySchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    test('should convert boolean strings to booleans', () => {
      const result = TerminalQuerySchema.parse({
        online: 'true',
        share: 'false',
      });

      expect(result.online).toBe(true);
      expect(result.share).toBe(false);
      expect(typeof result.online).toBe('boolean');
      expect(typeof result.share).toBe('boolean');
    });
  });

  describe('PUT /api/terminals/:mac - Update Validation', () => {
    test('should validate terminal update payload', () => {
      const validPayload = {
        data: {
          name: 'Updated Terminal',
          jw: '116.404,39.915',
          remark: 'Test remark',
          share: true,
        },
      };

      expect(() => UpdateTerminalRequestSchema.parse(validPayload)).not.toThrow();
    });

    test('should accept partial updates', () => {
      const partialUpdates = [
        { data: { name: 'New Name' } },
        { data: { jw: '120.123,30.456' } },
        { data: { share: false } },
      ];

      partialUpdates.forEach((update) => {
        expect(() => UpdateTerminalRequestSchema.parse(update)).not.toThrow();
      });
    });

    test('should reject empty name', () => {
      const invalid = { data: { name: '' } };
      expect(() => UpdateTerminalRequestSchema.parse(invalid)).toThrow();
    });

    test('should reject invalid GPS coordinates', () => {
      const invalid = { data: { jw: 'invalid-coords' } };
      expect(() => UpdateTerminalRequestSchema.parse(invalid)).toThrow();
    });

    test('should reject name exceeding 50 characters', () => {
      const invalid = { data: { name: 'A'.repeat(51) } };
      expect(() => UpdateTerminalRequestSchema.parse(invalid)).toThrow();
    });

    test('should reject remark exceeding 200 characters', () => {
      const invalid = { data: { remark: 'A'.repeat(201) } };
      expect(() => UpdateTerminalRequestSchema.parse(invalid)).toThrow();
    });
  });

  describe('POST /api/terminals/:mac/devices - Add Mount Device Validation', () => {
    test('should validate mount device payload', () => {
      const validPayload = {
        data: {
          pid: 1,
          protocol: 'modbus',
          mountDev: '01',
          name: 'Temperature Sensor',
        },
      };

      expect(() => AddMountDeviceRequestSchema.parse(validPayload)).not.toThrow();
    });

    test('should reject zero PID', () => {
      const invalid = {
        data: {
          pid: 0,
          protocol: 'modbus',
          mountDev: '01',
        },
      };

      expect(() => AddMountDeviceRequestSchema.parse(invalid)).toThrow();
    });

    test('should reject negative PID', () => {
      const invalid = {
        data: {
          pid: -1,
          protocol: 'modbus',
          mountDev: '01',
        },
      };

      expect(() => AddMountDeviceRequestSchema.parse(invalid)).toThrow();
    });

    test('should reject empty protocol', () => {
      const invalid = {
        data: {
          pid: 1,
          protocol: '',
          mountDev: '01',
        },
      };

      expect(() => AddMountDeviceRequestSchema.parse(invalid)).toThrow();
    });

    test('should reject empty mountDev', () => {
      const invalid = {
        data: {
          pid: 1,
          protocol: 'modbus',
          mountDev: '',
        },
      };

      expect(() => AddMountDeviceRequestSchema.parse(invalid)).toThrow();
    });

    test('should reject device name exceeding 50 characters', () => {
      const invalid = {
        data: {
          pid: 1,
          protocol: 'modbus',
          mountDev: '01',
          name: 'A'.repeat(51),
        },
      };

      expect(() => AddMountDeviceRequestSchema.parse(invalid)).toThrow();
    });

    test('should accept optional fields', () => {
      const valid = {
        data: {
          pid: 1,
          protocol: 'modbus',
          mountDev: '01',
          Type: 'sensor',
          formResize: 100,
          isState: true,
        },
      };

      expect(() => AddMountDeviceRequestSchema.parse(valid)).not.toThrow();
    });
  });

  describe('DELETE /api/terminals/:mac/devices/:pid - Path Params Validation', () => {
    test('should validate and convert PID from string to number', () => {
      const params = {
        mac: '001122334455',
        pid: '123',
      };

      const result = MacPidParamsSchema.parse(params);
      expect(result.pid).toBe(123);
      expect(typeof result.pid).toBe('number');
    });

    test('should reject negative PID', () => {
      const params = {
        mac: '001122334455',
        pid: '-1',
      };

      expect(() => MacPidParamsSchema.parse(params)).toThrow();
    });

    test('should reject zero PID', () => {
      const params = {
        mac: '001122334455',
        pid: '0',
      };

      expect(() => MacPidParamsSchema.parse(params)).toThrow();
    });

    test('should reject non-numeric PID', () => {
      const params = {
        mac: '001122334455',
        pid: 'abc',
      };

      expect(() => MacPidParamsSchema.parse(params)).toThrow();
    });
  });

  describe('Controller Endpoint Coverage', () => {
    test('should have schemas for all main endpoints', () => {
      // Verify that all critical schemas are defined and exported
      expect(UpdateTerminalRequestSchema).toBeDefined();
      expect(AddMountDeviceRequestSchema).toBeDefined();
      expect(TerminalQuerySchema).toBeDefined();
      expect(MacPidParamsSchema).toBeDefined();
    });

    test('schemas should properly infer TypeScript types', () => {
      // Type inference test
      type QueryType = typeof TerminalQuerySchema._output;
      type UpdateType = typeof UpdateTerminalRequestSchema._output;
      type AddDeviceType = typeof AddMountDeviceRequestSchema._output;

      // If these compile, the types are properly inferred
      const query: QueryType = TerminalQuerySchema.parse({ page: '1' });
      const update: UpdateType = UpdateTerminalRequestSchema.parse({ data: {} });
      const addDevice: AddDeviceType = AddMountDeviceRequestSchema.parse({
        data: { pid: 1, protocol: 'test', mountDev: '01' },
      });

      expect(query).toBeDefined();
      expect(update).toBeDefined();
      expect(addDevice).toBeDefined();
    });
  });

  describe('Error Messages', () => {
    test('should provide clear error messages for validation failures', () => {
      try {
        TerminalQuerySchema.parse({ page: '0' });
      } catch (error: any) {
        expect(error.issues).toBeDefined();
        expect(error.issues.length).toBeGreaterThan(0);
        expect(error.issues[0].message).toBeDefined();
      }
    });

    test('should include field path in error', () => {
      try {
        UpdateTerminalRequestSchema.parse({ data: { name: '' } });
      } catch (error: any) {
        expect(error.issues).toBeDefined();
        expect(error.issues[0].path).toBeDefined();
      }
    });
  });
});
