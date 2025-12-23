/**
 * Terminal Schema Tests (Phase 4.2)
 * Tests for terminal API Zod validation schemas
 */

import { describe, test, expect } from 'bun:test';
import { z } from 'zod';
import {
  UpdateTerminalRequestSchema,
  AddMountDeviceRequestSchema,
  MacPidParamsSchema,
  TerminalQuerySchema,
  GpsCoordinatesSchema,
  RefreshTimeoutRequestSchema,
  MacListSchema,
  validateMacAddress,
} from './terminal.schema';

describe('Terminal Schema Validation (Phase 4.2)', () => {
  describe('UpdateTerminalRequestSchema', () => {
    test('should accept valid terminal update data', () => {
      const valid = {
        data: {
          name: 'Updated Terminal',
          jw: '116.404,39.915',
          remark: 'Updated remark',
          share: true,
        },
      };

      expect(() => UpdateTerminalRequestSchema.parse(valid)).not.toThrow();
    });

    test('should accept partial updates', () => {
      const partialUpdates = [
        { data: { name: 'New Name' } },
        { data: { jw: '120.123,30.456' } },
        { data: { remark: 'New remark' } },
        { data: { share: false } },
      ];

      partialUpdates.forEach((update) => {
        expect(() => UpdateTerminalRequestSchema.parse(update)).not.toThrow();
      });
    });

    test('should reject empty name', () => {
      const invalid = {
        data: {
          name: '',
        },
      };

      expect(() => UpdateTerminalRequestSchema.parse(invalid)).toThrow();
    });

    test('should reject name longer than 50 characters', () => {
      const invalid = {
        data: {
          name: 'A'.repeat(51),
        },
      };

      expect(() => UpdateTerminalRequestSchema.parse(invalid)).toThrow();
    });

    test('should reject invalid GPS coordinates', () => {
      const invalidCoords = [
        { data: { jw: 'invalid' } },
        { data: { jw: '116.404' } }, // Missing latitude
        { data: { jw: '116.404,' } }, // Missing latitude value
        { data: { jw: ',39.915' } }, // Missing longitude
        { data: { jw: '116.404 39.915' } }, // Wrong separator
      ];

      invalidCoords.forEach((invalid) => {
        expect(() => UpdateTerminalRequestSchema.parse(invalid)).toThrow();
      });
    });

    test('should accept valid GPS coordinates', () => {
      const validCoords = [
        { data: { jw: '116.404,39.915' } },
        { data: { jw: '-122.419,37.774' } },
        { data: { jw: '0,0' } },
        { data: { jw: '-180,-90' } },
        { data: { jw: '180,90' } },
      ];

      validCoords.forEach((valid) => {
        expect(() => UpdateTerminalRequestSchema.parse(valid)).not.toThrow();
      });
    });

    test('should reject remark longer than 200 characters', () => {
      const invalid = {
        data: {
          remark: 'A'.repeat(201),
        },
      };

      expect(() => UpdateTerminalRequestSchema.parse(invalid)).toThrow();
    });

    test('should accept empty object (no updates)', () => {
      const empty = { data: {} };
      expect(() => UpdateTerminalRequestSchema.parse(empty)).not.toThrow();
    });
  });

  describe('AddMountDeviceRequestSchema', () => {
    test('should accept valid mount device data', () => {
      const valid = {
        data: {
          pid: 1,
          protocol: 'modbus',
          mountDev: '01',
          name: 'Sensor 1',
        },
      };

      expect(() => AddMountDeviceRequestSchema.parse(valid)).not.toThrow();
    });

    test('should reject non-positive PID', () => {
      const invalidPIDs = [
        { data: { pid: 0, protocol: 'modbus', mountDev: '01' } },
        { data: { pid: -1, protocol: 'modbus', mountDev: '01' } },
        { data: { pid: -100, protocol: 'modbus', mountDev: '01' } },
      ];

      invalidPIDs.forEach((invalid) => {
        expect(() => AddMountDeviceRequestSchema.parse(invalid)).toThrow();
      });
    });

    test('should reject non-integer PID', () => {
      const invalid = {
        data: {
          pid: 1.5,
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

    test('should accept optional fields', () => {
      const valid = {
        data: {
          pid: 1,
          protocol: 'modbus',
          mountDev: '01',
          Type: 'sensor',
          name: 'Temperature Sensor',
          formResize: 100,
          isState: true,
        },
      };

      expect(() => AddMountDeviceRequestSchema.parse(valid)).not.toThrow();
    });

    test('should reject name longer than 50 characters', () => {
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
  });

  describe('MacPidParamsSchema', () => {
    test('should parse valid MAC and PID', () => {
      const valid = {
        mac: '00:11:22:33:44:55',
        pid: '123',
      };

      const result = MacPidParamsSchema.parse(valid);
      expect(result.mac).toBe('00:11:22:33:44:55');
      expect(result.pid).toBe(123);
      expect(typeof result.pid).toBe('number');
    });

    test('should convert string PID to number', () => {
      const valid = {
        mac: 'AABBCCDDEEFF',
        pid: '42',
      };

      const result = MacPidParamsSchema.parse(valid);
      expect(result.pid).toBe(42);
      expect(typeof result.pid).toBe('number');
    });

    test('should reject negative PID', () => {
      const invalid = {
        mac: '00:11:22:33:44:55',
        pid: '-1',
      };

      expect(() => MacPidParamsSchema.parse(invalid)).toThrow();
    });

    test('should reject zero PID', () => {
      const invalid = {
        mac: '00:11:22:33:44:55',
        pid: '0',
      };

      expect(() => MacPidParamsSchema.parse(invalid)).toThrow();
    });

    test('should reject invalid PID string', () => {
      const invalid = {
        mac: '00:11:22:33:44:55',
        pid: 'abc',
      };

      expect(() => MacPidParamsSchema.parse(invalid)).toThrow();
    });
  });

  describe('TerminalQuerySchema', () => {
    test('should accept valid query parameters', () => {
      const valid = {
        page: '2',
        limit: '50',
        online: 'true',
        share: 'false',
        keyword: 'test',
      };

      const result = TerminalQuerySchema.parse(valid);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(50);
      expect(result.online).toBe(true);
      expect(result.share).toBe(false);
      expect(result.keyword).toBe('test');
    });

    test('should use default values when undefined', () => {
      const empty = {};
      const result = TerminalQuerySchema.parse(empty);

      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    test('should convert string boolean to actual boolean', () => {
      const withBooleans = {
        online: 'true',
        share: 'false',
      };

      const result = TerminalQuerySchema.parse(withBooleans);
      expect(result.online).toBe(true);
      expect(result.share).toBe(false);
      expect(typeof result.online).toBe('boolean');
      expect(typeof result.share).toBe('boolean');
    });

    test('should handle partial query parameters', () => {
      const partials = [
        { keyword: 'test' },
        { page: '3' },
        { limit: '25' },
        { online: 'true' },
      ];

      partials.forEach((partial) => {
        expect(() => TerminalQuerySchema.parse(partial)).not.toThrow();
      });
    });

    test('should reject invalid page number', () => {
      const invalid = { page: '0' };
      expect(() => TerminalQuerySchema.parse(invalid)).toThrow();
    });

    test('should reject limit exceeding maximum', () => {
      const invalid = { limit: '101' };
      expect(() => TerminalQuerySchema.parse(invalid)).toThrow();
    });
  });

  describe('GpsCoordinatesSchema', () => {
    test('should accept valid GPS coordinates', () => {
      const validCoords = [
        { data: { jw: '116.404,39.915' } },
        { data: { jw: '-122.419,37.774' } },
        { data: { jw: '0,0' } },
      ];

      validCoords.forEach((valid) => {
        expect(() => GpsCoordinatesSchema.parse(valid)).not.toThrow();
      });
    });

    test('should reject invalid GPS format', () => {
      const invalidCoords = [
        { data: { jw: 'invalid' } },
        { data: { jw: '116.404' } },
        { data: { jw: ',39.915' } },
        { data: { jw: '116.404,39.915,50' } }, // Extra value
      ];

      invalidCoords.forEach((invalid) => {
        expect(() => GpsCoordinatesSchema.parse(invalid)).toThrow();
      });
    });
  });

  describe('RefreshTimeoutRequestSchema', () => {
    test('should accept valid refresh interval', () => {
      const valid = {
        data: {
          interval: 5000,
        },
      };

      expect(() => RefreshTimeoutRequestSchema.parse(valid)).not.toThrow();
    });

    test('should reject negative interval', () => {
      const invalid = {
        data: {
          interval: -1000,
        },
      };

      expect(() => RefreshTimeoutRequestSchema.parse(invalid)).toThrow();
    });

    test('should reject interval exceeding maximum (5 minutes)', () => {
      const invalid = {
        data: {
          interval: 300001, // 5 minutes + 1ms
        },
      };

      expect(() => RefreshTimeoutRequestSchema.parse(invalid)).toThrow();
    });

    test('should accept maximum interval (5 minutes)', () => {
      const valid = {
        data: {
          interval: 300000, // Exactly 5 minutes
        },
      };

      expect(() => RefreshTimeoutRequestSchema.parse(valid)).not.toThrow();
    });

    test('should accept optional interval', () => {
      const valid = { data: {} };
      expect(() => RefreshTimeoutRequestSchema.parse(valid)).not.toThrow();
    });
  });

  describe('MacListSchema', () => {
    test('should accept valid MAC list', () => {
      const valid = {
        data: {
          macs: [
            '00:11:22:33:44:55',
            'AA:BB:CC:DD:EE:FF',
            'AABBCCDDEEFF',
          ],
        },
      };

      expect(() => MacListSchema.parse(valid)).not.toThrow();
    });

    test('should reject empty MAC list', () => {
      const invalid = {
        data: {
          macs: [],
        },
      };

      expect(() => MacListSchema.parse(invalid)).toThrow();
    });

    test('should reject MAC list exceeding maximum (100)', () => {
      const invalid = {
        data: {
          macs: Array(101).fill('001122334455'),
        },
      };

      expect(() => MacListSchema.parse(invalid)).toThrow();
    });

    test('should accept maximum MAC list (100)', () => {
      const valid = {
        data: {
          macs: Array(100).fill('001122334455'),
        },
      };

      expect(() => MacListSchema.parse(valid)).not.toThrow();
    });

    test('should reject list with invalid MAC addresses', () => {
      const invalid = {
        data: {
          macs: [
            '00:11:22:33:44:55',
            'invalid-mac',
            'AABBCCDDEEFF',
          ],
        },
      };

      expect(() => MacListSchema.parse(invalid)).toThrow();
    });
  });

  describe('validateMacAddress helper', () => {
    test('should validate correct MAC addresses', () => {
      const result1 = validateMacAddress('00:11:22:33:44:55');
      expect(result1.valid).toBe(true);
      expect(result1.error).toBeUndefined();

      const result2 = validateMacAddress('AABBCCDDEEFF');
      expect(result2.valid).toBe(true);
      expect(result2.error).toBeUndefined();
    });

    test('should return error for invalid MAC addresses', () => {
      const result = validateMacAddress('invalid-mac');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('MAC');
    });

    test('should return error for empty string', () => {
      const result = validateMacAddress('');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
