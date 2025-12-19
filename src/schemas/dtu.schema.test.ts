import { describe, test, expect } from 'bun:test';
import {
  DtuOperationTypeSchema,
  MountDeviceConfigSchema,
  MountContentSchema,
  InstructContentSchema,
  TerminalParamsSchema,
  RestartDtuRequestSchema,
  Restart485RequestSchema,
  UpdateMountRequestSchema,
  OperateInstructRequestSchema,
  SetTerminalRequestSchema,
  GetTerminalRequestSchema,
  GetDtuLogsQuerySchema,
  GetDtuStatsQuerySchema,
  GetRecentOperationsParamsSchema,
  GetRecentOperationsQuerySchema,
} from './dtu.schema';

describe('DTU Schema Validators', () => {
  describe('DtuOperationTypeSchema', () => {
    test('should accept valid operation types', () => {
      const validTypes = [
        'restart',
        'restart485',
        'updateMount',
        'OprateInstruct',
        'setTerminal',
        'getTerminal',
      ];

      validTypes.forEach((type) => {
        expect(() => DtuOperationTypeSchema.parse(type)).not.toThrow();
      });
    });

    test('should reject invalid operation types', () => {
      expect(() => DtuOperationTypeSchema.parse('invalid')).toThrow();
      expect(() => DtuOperationTypeSchema.parse('Restart')).toThrow(); // Case sensitive
      expect(() => DtuOperationTypeSchema.parse('')).toThrow();
    });
  });

  describe('MountDeviceConfigSchema', () => {
    test('should accept valid device config', () => {
      const validConfig = {
        pid: 'device123',
        port: 1,
        protocol: 'modbus',
        deviceId: 'dev001',
        name: 'Temperature Sensor',
      };

      expect(() => MountDeviceConfigSchema.parse(validConfig)).not.toThrow();
    });

    test('should accept minimal required fields', () => {
      const minimalConfig = {
        pid: 'device123',
        port: 1,
        protocol: 'modbus',
      };

      expect(() => MountDeviceConfigSchema.parse(minimalConfig)).not.toThrow();
    });

    test('should accept additional dynamic fields (passthrough)', () => {
      const configWithExtra = {
        pid: 'device123',
        port: 1,
        protocol: 'modbus',
        customField: 'custom value',
        anotherField: 42,
      };

      const result = MountDeviceConfigSchema.parse(configWithExtra);
      expect(result.customField).toBe('custom value');
      expect(result.anotherField).toBe(42);
    });

    test('should validate port range', () => {
      // Valid ports
      expect(() =>
        MountDeviceConfigSchema.parse({ pid: 'dev', port: 1, protocol: 'modbus' })
      ).not.toThrow();
      expect(() =>
        MountDeviceConfigSchema.parse({ pid: 'dev', port: 255, protocol: 'modbus' })
      ).not.toThrow();

      // Invalid ports
      expect(() =>
        MountDeviceConfigSchema.parse({ pid: 'dev', port: 0, protocol: 'modbus' })
      ).toThrow();
      expect(() =>
        MountDeviceConfigSchema.parse({ pid: 'dev', port: 256, protocol: 'modbus' })
      ).toThrow();
      expect(() =>
        MountDeviceConfigSchema.parse({ pid: 'dev', port: -1, protocol: 'modbus' })
      ).toThrow();
    });

    test('should require non-empty strings', () => {
      expect(() =>
        MountDeviceConfigSchema.parse({ pid: '', port: 1, protocol: 'modbus' })
      ).toThrow();
      expect(() =>
        MountDeviceConfigSchema.parse({ pid: 'dev', port: 1, protocol: '' })
      ).toThrow();
    });
  });

  describe('MountContentSchema', () => {
    test('should accept single device config', () => {
      const singleDevice = {
        pid: 'device123',
        port: 1,
        protocol: 'modbus',
      };

      expect(() => MountContentSchema.parse(singleDevice)).not.toThrow();
    });

    test('should accept array of device configs', () => {
      const multipleDevices = [
        { pid: 'device1', port: 1, protocol: 'modbus' },
        { pid: 'device2', port: 2, protocol: 'mqtt' },
        { pid: 'device3', port: 3, protocol: 'http' },
      ];

      expect(() => MountContentSchema.parse(multipleDevices)).not.toThrow();
    });

    test('should reject invalid single device', () => {
      const invalidDevice = {
        pid: 'device123',
        port: 999, // Out of range
        protocol: 'modbus',
      };

      expect(() => MountContentSchema.parse(invalidDevice)).toThrow();
    });

    test('should reject array with invalid device', () => {
      const devicesWithInvalid = [
        { pid: 'device1', port: 1, protocol: 'modbus' },
        { pid: '', port: 2, protocol: 'mqtt' }, // Invalid: empty pid
      ];

      expect(() => MountContentSchema.parse(devicesWithInvalid)).toThrow();
    });
  });

  describe('InstructContentSchema', () => {
    test('should accept valid instruct content', () => {
      const validInstruct = {
        DevID: 'device001',
        protocol: 'modbus',
        instruct: 'READ_HOLDING_REGISTER',
        content: '0x03',
        params: {
          address: '0x0000',
          count: 10,
        },
      };

      expect(() => InstructContentSchema.parse(validInstruct)).not.toThrow();
    });

    test('should accept minimal required fields', () => {
      const minimalInstruct = {
        DevID: 'device001',
        protocol: 'modbus',
        instruct: 'READ',
      };

      expect(() => InstructContentSchema.parse(minimalInstruct)).not.toThrow();
    });

    test('should accept params with various types', () => {
      const instructWithParams = {
        DevID: 'device001',
        protocol: 'modbus',
        instruct: 'WRITE',
        params: {
          stringParam: 'value',
          numberParam: 42,
          boolParam: true,
          nullParam: null,
        },
      };

      const result = InstructContentSchema.parse(instructWithParams);
      expect(result.params?.stringParam).toBe('value');
      expect(result.params?.numberParam).toBe(42);
      expect(result.params?.boolParam).toBe(true);
      expect(result.params?.nullParam).toBe(null);
    });

    test('should allow additional fields (passthrough)', () => {
      const instructWithExtra = {
        DevID: 'device001',
        protocol: 'modbus',
        instruct: 'READ',
        customField: 'custom',
      };

      const result = InstructContentSchema.parse(instructWithExtra);
      expect(result.customField).toBe('custom');
    });

    test('should reject empty required fields', () => {
      expect(() =>
        InstructContentSchema.parse({ DevID: '', protocol: 'modbus', instruct: 'READ' })
      ).toThrow();
      expect(() =>
        InstructContentSchema.parse({ DevID: 'dev', protocol: '', instruct: 'READ' })
      ).toThrow();
      expect(() =>
        InstructContentSchema.parse({ DevID: 'dev', protocol: 'modbus', instruct: '' })
      ).toThrow();
    });
  });

  describe('TerminalParamsSchema', () => {
    test('should accept valid terminal params', () => {
      const validParams = {
        IP: '192.168.1.1',
        Port: 8080,
        host: 'example.com',
        port: 443,
        interval: 5000,
      };

      expect(() => TerminalParamsSchema.parse(validParams)).not.toThrow();
    });

    test('should accept partial params', () => {
      const partialParams = {
        IP: '192.168.1.1',
        Port: 8080,
      };

      expect(() => TerminalParamsSchema.parse(partialParams)).not.toThrow();
    });

    test('should accept empty object', () => {
      expect(() => TerminalParamsSchema.parse({})).not.toThrow();
    });

    test('should allow additional fields (passthrough)', () => {
      const paramsWithExtra = {
        IP: '192.168.1.1',
        customSetting: 'value',
        anotherParam: 123,
      };

      const result = TerminalParamsSchema.parse(paramsWithExtra);
      expect(result.customSetting).toBe('value');
      expect(result.anotherParam).toBe(123);
    });

    test('should validate positive integers', () => {
      expect(() => TerminalParamsSchema.parse({ Port: 0 })).toThrow();
      expect(() => TerminalParamsSchema.parse({ Port: -1 })).toThrow();
      expect(() => TerminalParamsSchema.parse({ interval: 0 })).toThrow();
    });
  });

  describe('Request Schemas', () => {
    describe('RestartDtuRequestSchema', () => {
      test('should accept valid MAC address', () => {
        const validRequest = { mac: 'AA:BB:CC:DD:EE:FF' };
        expect(() => RestartDtuRequestSchema.parse(validRequest)).not.toThrow();
      });

      test('should reject invalid MAC address', () => {
        expect(() => RestartDtuRequestSchema.parse({ mac: 'invalid' })).toThrow();
      });
    });

    describe('Restart485RequestSchema', () => {
      test('should accept valid MAC address', () => {
        const validRequest = { mac: '00:11:22:33:44:55' };
        expect(() => Restart485RequestSchema.parse(validRequest)).not.toThrow();
      });
    });

    describe('UpdateMountRequestSchema', () => {
      test('should accept valid update mount request with single device', () => {
        const validRequest = {
          mac: 'AA:BB:CC:DD:EE:FF',
          content: {
            pid: 'device123',
            port: 1,
            protocol: 'modbus',
          },
        };

        expect(() => UpdateMountRequestSchema.parse(validRequest)).not.toThrow();
      });

      test('should accept valid update mount request with device array', () => {
        const validRequest = {
          mac: 'AA:BB:CC:DD:EE:FF',
          content: [
            { pid: 'device1', port: 1, protocol: 'modbus' },
            { pid: 'device2', port: 2, protocol: 'mqtt' },
          ],
        };

        expect(() => UpdateMountRequestSchema.parse(validRequest)).not.toThrow();
      });

      test('should reject invalid MAC or content', () => {
        expect(() =>
          UpdateMountRequestSchema.parse({
            mac: 'invalid',
            content: { pid: 'dev', port: 1, protocol: 'modbus' },
          })
        ).toThrow();

        expect(() =>
          UpdateMountRequestSchema.parse({
            mac: 'AA:BB:CC:DD:EE:FF',
            content: { pid: '', port: 1, protocol: 'modbus' },
          })
        ).toThrow();
      });
    });

    describe('OperateInstructRequestSchema', () => {
      test('should accept valid operate request', () => {
        const validRequest = {
          mac: 'AA:BB:CC:DD:EE:FF',
          content: {
            DevID: 'device001',
            protocol: 'modbus',
            instruct: 'READ',
          },
        };

        expect(() => OperateInstructRequestSchema.parse(validRequest)).not.toThrow();
      });
    });

    describe('SetTerminalRequestSchema', () => {
      test('should accept valid set terminal request', () => {
        const validRequest = {
          mac: 'AA:BB:CC:DD:EE:FF',
          content: {
            IP: '192.168.1.1',
            Port: 8080,
          },
        };

        expect(() => SetTerminalRequestSchema.parse(validRequest)).not.toThrow();
      });
    });

    describe('GetTerminalRequestSchema', () => {
      test('should accept valid get terminal request', () => {
        const validRequest = { mac: 'AA:BB:CC:DD:EE:FF' };
        expect(() => GetTerminalRequestSchema.parse(validRequest)).not.toThrow();
      });
    });
  });

  describe('Query Schemas', () => {
    describe('GetDtuLogsQuerySchema', () => {
      test('should accept valid query with all fields', () => {
        const validQuery = {
          mac: 'AA:BB:CC:DD:EE:FF',
          operation: 'restart',
          operatedBy: 'admin',
          successOnly: 'true',
          startTime: '2024-01-01T00:00:00.000Z',
          endTime: '2024-12-31T23:59:59.999Z',
          page: '1',
          limit: '50',
          sortBy: 'operatedAt',
          sortOrder: 'desc',
        };

        const result = GetDtuLogsQuerySchema.parse(validQuery);
        expect(result.successOnly).toBe(true);
        expect(result.page).toBe(1);
        expect(result.limit).toBe(50);
        expect(result.startTime).toBeInstanceOf(Date);
        expect(result.endTime).toBeInstanceOf(Date);
      });

      test('should use default values', () => {
        const minimalQuery = {};
        const result = GetDtuLogsQuerySchema.parse(minimalQuery);

        expect(result.page).toBe(1);
        expect(result.limit).toBe(50);
        expect(result.sortBy).toBe('operatedAt');
        expect(result.sortOrder).toBe('desc');
      });

      test('should respect limit maximum', () => {
        expect(() => GetDtuLogsQuerySchema.parse({ limit: '101' })).toThrow();
        expect(() => GetDtuLogsQuerySchema.parse({ limit: '100' })).not.toThrow();
      });

      test('should validate operation type', () => {
        expect(() =>
          GetDtuLogsQuerySchema.parse({ operation: 'restart' })
        ).not.toThrow();
        expect(() => GetDtuLogsQuerySchema.parse({ operation: 'invalid' })).toThrow();
      });

      test('should validate sortBy and sortOrder enums', () => {
        expect(() =>
          GetDtuLogsQuerySchema.parse({ sortBy: 'operatedAt' })
        ).not.toThrow();
        expect(() => GetDtuLogsQuerySchema.parse({ sortBy: 'useTime' })).not.toThrow();
        expect(() => GetDtuLogsQuerySchema.parse({ sortBy: 'invalid' })).toThrow();

        expect(() => GetDtuLogsQuerySchema.parse({ sortOrder: 'asc' })).not.toThrow();
        expect(() => GetDtuLogsQuerySchema.parse({ sortOrder: 'desc' })).not.toThrow();
        expect(() => GetDtuLogsQuerySchema.parse({ sortOrder: 'invalid' })).toThrow();
      });
    });

    describe('GetDtuStatsQuerySchema', () => {
      test('should accept valid stats query', () => {
        const validQuery = {
          mac: 'AA:BB:CC:DD:EE:FF',
          startTime: '2024-01-01T00:00:00.000Z',
          endTime: '2024-12-31T23:59:59.999Z',
        };

        const result = GetDtuStatsQuerySchema.parse(validQuery);
        expect(result.startTime).toBeInstanceOf(Date);
        expect(result.endTime).toBeInstanceOf(Date);
      });

      test('should accept optional fields', () => {
        const minimalQuery = {};
        expect(() => GetDtuStatsQuerySchema.parse(minimalQuery)).not.toThrow();
      });
    });

    describe('GetRecentOperationsParamsSchema', () => {
      test('should accept valid MAC in params', () => {
        const validParams = { mac: 'AA:BB:CC:DD:EE:FF' };
        expect(() => GetRecentOperationsParamsSchema.parse(validParams)).not.toThrow();
      });

      test('should reject invalid MAC', () => {
        expect(() => GetRecentOperationsParamsSchema.parse({ mac: 'invalid' })).toThrow();
      });
    });

    describe('GetRecentOperationsQuerySchema', () => {
      test('should use default limit', () => {
        const result = GetRecentOperationsQuerySchema.parse({});
        expect(result.limit).toBe(10);
      });

      test('should accept custom limit', () => {
        const result = GetRecentOperationsQuerySchema.parse({ limit: '25' });
        expect(result.limit).toBe(25);
      });

      test('should respect maximum limit', () => {
        expect(() => GetRecentOperationsQuerySchema.parse({ limit: '101' })).toThrow();
        expect(() => GetRecentOperationsQuerySchema.parse({ limit: '100' })).not.toThrow();
      });
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete DTU operation workflow', () => {
      // 1. Restart DTU
      const restartRequest = { mac: 'AA:BB:CC:DD:EE:FF' };
      expect(() => RestartDtuRequestSchema.parse(restartRequest)).not.toThrow();

      // 2. Update mount with devices
      const updateRequest = {
        mac: 'AA:BB:CC:DD:EE:FF',
        content: [
          { pid: 'temp_sensor', port: 1, protocol: 'modbus', name: 'Temperature' },
          { pid: 'pressure_sensor', port: 2, protocol: 'modbus', name: 'Pressure' },
        ],
      };
      expect(() => UpdateMountRequestSchema.parse(updateRequest)).not.toThrow();

      // 3. Send instruct
      const instructRequest = {
        mac: 'AA:BB:CC:DD:EE:FF',
        content: {
          DevID: 'temp_sensor',
          protocol: 'modbus',
          instruct: 'READ_REGISTER',
          params: { address: '0x0000', count: 10 },
        },
      };
      expect(() => OperateInstructRequestSchema.parse(instructRequest)).not.toThrow();

      // 4. Query logs
      const logsQuery = {
        mac: 'AA:BB:CC:DD:EE:FF',
        operation: 'OprateInstruct',
        page: '1',
        limit: '20',
      };
      const logsResult = GetDtuLogsQuerySchema.parse(logsQuery);
      expect(logsResult.page).toBe(1);
      expect(logsResult.limit).toBe(20);
    });
  });
});
