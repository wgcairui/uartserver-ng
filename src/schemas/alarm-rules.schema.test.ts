import { describe, test, expect } from 'bun:test';
import {
  AlarmRuleTypeSchema,
  AlarmLevelSchema,
  ThresholdConditionSchema,
  ConstantConditionSchema,
  CreateRuleRequestSchema,
  UpdateRuleRequestSchema,
  EnableDisableRuleRequestSchema,
  BatchOperationRequestSchema,
  ListRulesQuerySchema,
} from './alarm-rules.schema';

describe('Alarm Rules Schema Validators', () => {
  describe('AlarmRuleTypeSchema', () => {
    test('should accept valid alarm rule types', () => {
      const validTypes = ['threshold', 'constant', 'offline', 'timeout', 'custom'];

      validTypes.forEach((type) => {
        expect(() => AlarmRuleTypeSchema.parse(type)).not.toThrow();
      });
    });

    test('should reject invalid alarm rule types', () => {
      expect(() => AlarmRuleTypeSchema.parse('invalid')).toThrow();
      expect(() => AlarmRuleTypeSchema.parse('THRESHOLD')).toThrow(); // Case sensitive
      expect(() => AlarmRuleTypeSchema.parse('')).toThrow();
    });
  });

  describe('AlarmLevelSchema', () => {
    test('should accept valid alarm levels', () => {
      const validLevels = ['info', 'warning', 'error', 'critical'];

      validLevels.forEach((level) => {
        expect(() => AlarmLevelSchema.parse(level)).not.toThrow();
      });
    });

    test('should reject invalid alarm levels', () => {
      expect(() => AlarmLevelSchema.parse('invalid')).toThrow();
      expect(() => AlarmLevelSchema.parse('INFO')).toThrow(); // Case sensitive
      expect(() => AlarmLevelSchema.parse('debug')).toThrow();
    });
  });

  describe('ThresholdConditionSchema', () => {
    test('should accept valid threshold condition', () => {
      const validCondition = {
        min: 0,
        max: 100,
      };

      expect(() => ThresholdConditionSchema.parse(validCondition)).not.toThrow();
    });

    test('should accept negative thresholds', () => {
      const negativeThreshold = {
        min: -50,
        max: 50,
      };

      expect(() => ThresholdConditionSchema.parse(negativeThreshold)).not.toThrow();
    });

    test('should accept decimal values', () => {
      const decimalThreshold = {
        min: 0.5,
        max: 99.9,
      };

      expect(() => ThresholdConditionSchema.parse(decimalThreshold)).not.toThrow();
    });

    test('should reject missing required fields', () => {
      expect(() => ThresholdConditionSchema.parse({ min: 0 })).toThrow();
      expect(() => ThresholdConditionSchema.parse({ max: 100 })).toThrow();
      expect(() => ThresholdConditionSchema.parse({})).toThrow();
    });

    test('should reject non-number values', () => {
      expect(() => ThresholdConditionSchema.parse({ min: '0', max: 100 })).toThrow();
      expect(() => ThresholdConditionSchema.parse({ min: 0, max: 'max' })).toThrow();
    });
  });

  describe('ConstantConditionSchema', () => {
    test('should accept valid constant condition with array of values', () => {
      const validCondition = {
        alarmStat: ['OK', 'NORMAL', 'READY'],
      };

      expect(() => ConstantConditionSchema.parse(validCondition)).not.toThrow();
    });

    test('should accept single value in array', () => {
      const singleValue = {
        alarmStat: ['OK'],
      };

      expect(() => ConstantConditionSchema.parse(singleValue)).not.toThrow();
    });

    test('should reject empty array', () => {
      const emptyArray = {
        alarmStat: [],
      };

      expect(() => ConstantConditionSchema.parse(emptyArray)).toThrow();
    });

    test('should reject non-string values in array', () => {
      const invalidValues = {
        alarmStat: ['OK', 123, 'READY'],
      };

      expect(() => ConstantConditionSchema.parse(invalidValues)).toThrow();
    });

    test('should reject missing alarmStat field', () => {
      expect(() => ConstantConditionSchema.parse({})).toThrow();
    });
  });

  describe('CreateRuleRequestSchema', () => {
    test('should accept valid threshold rule', () => {
      const thresholdRule = {
        data: {
          name: 'Temperature High Alert',
          description: 'Alert when temperature exceeds threshold',
          type: 'threshold',
          level: 'warning',
          protocol: 'modbus',
          pid: 'temp_sensor_01',
          paramName: 'temperature',
          threshold: {
            min: 0,
            max: 100,
          },
          deduplicationWindow: 300,
          createdBy: 'admin',
        },
      };

      expect(() => CreateRuleRequestSchema.parse(thresholdRule)).not.toThrow();
    });

    test('should accept valid constant rule', () => {
      const constantRule = {
        data: {
          name: 'Device Status Check',
          type: 'constant',
          level: 'error',
          constant: {
            alarmStat: ['OFFLINE', 'ERROR', 'FAULT'],
          },
          createdBy: 'admin',
        },
      };

      expect(() => CreateRuleRequestSchema.parse(constantRule)).not.toThrow();
    });

    test('should accept valid custom rule', () => {
      const customRule = {
        data: {
          name: 'Custom Logic Rule',
          type: 'custom',
          level: 'critical',
          customScript: 'return data.value > threshold && data.status === "active";',
          createdBy: 'admin',
        },
      };

      expect(() => CreateRuleRequestSchema.parse(customRule)).not.toThrow();
    });

    test('should accept offline and timeout rules without conditions', () => {
      const offlineRule = {
        data: {
          name: 'Device Offline Alert',
          type: 'offline',
          level: 'error',
          createdBy: 'admin',
        },
      };

      const timeoutRule = {
        data: {
          name: 'Response Timeout Alert',
          type: 'timeout',
          level: 'warning',
          createdBy: 'admin',
        },
      };

      expect(() => CreateRuleRequestSchema.parse(offlineRule)).not.toThrow();
      expect(() => CreateRuleRequestSchema.parse(timeoutRule)).not.toThrow();
    });

    test('should use default deduplication window', () => {
      const rule = {
        data: {
          name: 'Test Rule',
          type: 'offline',
          level: 'info',
          createdBy: 'admin',
        },
      };

      const result = CreateRuleRequestSchema.parse(rule);
      expect(result.data.deduplicationWindow).toBe(300);
    });

    test('should accept custom deduplication window', () => {
      const rule = {
        data: {
          name: 'Test Rule',
          type: 'offline',
          level: 'info',
          deduplicationWindow: 600,
          createdBy: 'admin',
        },
      };

      const result = CreateRuleRequestSchema.parse(rule);
      expect(result.data.deduplicationWindow).toBe(600);
    });

    test('should reject threshold rule without threshold condition', () => {
      const invalidRule = {
        data: {
          name: 'Invalid Threshold Rule',
          type: 'threshold',
          level: 'warning',
          createdBy: 'admin',
        },
      };

      expect(() => CreateRuleRequestSchema.parse(invalidRule)).toThrow();
    });

    test('should reject constant rule without constant condition', () => {
      const invalidRule = {
        data: {
          name: 'Invalid Constant Rule',
          type: 'constant',
          level: 'error',
          createdBy: 'admin',
        },
      };

      expect(() => CreateRuleRequestSchema.parse(invalidRule)).toThrow();
    });

    test('should reject custom rule without customScript', () => {
      const invalidRule = {
        data: {
          name: 'Invalid Custom Rule',
          type: 'custom',
          level: 'critical',
          createdBy: 'admin',
        },
      };

      expect(() => CreateRuleRequestSchema.parse(invalidRule)).toThrow();
    });

    test('should reject rule with empty name', () => {
      const invalidRule = {
        data: {
          name: '',
          type: 'offline',
          level: 'info',
          createdBy: 'admin',
        },
      };

      expect(() => CreateRuleRequestSchema.parse(invalidRule)).toThrow();
    });

    test('should reject rule with empty createdBy', () => {
      const invalidRule = {
        data: {
          name: 'Test Rule',
          type: 'offline',
          level: 'info',
          createdBy: '',
        },
      };

      expect(() => CreateRuleRequestSchema.parse(invalidRule)).toThrow();
    });

    test('should reject negative deduplication window', () => {
      const invalidRule = {
        data: {
          name: 'Test Rule',
          type: 'offline',
          level: 'info',
          deduplicationWindow: -1,
          createdBy: 'admin',
        },
      };

      expect(() => CreateRuleRequestSchema.parse(invalidRule)).toThrow();
    });

    test('should reject zero deduplication window', () => {
      const invalidRule = {
        data: {
          name: 'Test Rule',
          type: 'offline',
          level: 'info',
          deduplicationWindow: 0,
          createdBy: 'admin',
        },
      };

      expect(() => CreateRuleRequestSchema.parse(invalidRule)).toThrow();
    });

    test('should accept pid as string or number', () => {
      const ruleWithStringPid = {
        data: {
          name: 'Test Rule',
          type: 'offline',
          level: 'info',
          pid: 'device_123',
          createdBy: 'admin',
        },
      };

      const ruleWithNumberPid = {
        data: {
          name: 'Test Rule',
          type: 'offline',
          level: 'info',
          pid: 123,
          createdBy: 'admin',
        },
      };

      expect(() => CreateRuleRequestSchema.parse(ruleWithStringPid)).not.toThrow();
      expect(() => CreateRuleRequestSchema.parse(ruleWithNumberPid)).not.toThrow();
    });
  });

  describe('UpdateRuleRequestSchema', () => {
    test('should accept partial updates', () => {
      const partialUpdate = {
        data: {
          name: 'Updated Rule Name',
          level: 'critical',
        },
      };

      expect(() => UpdateRuleRequestSchema.parse(partialUpdate)).not.toThrow();
    });

    test('should accept updating threshold condition', () => {
      const updateThreshold = {
        data: {
          threshold: {
            min: 10,
            max: 90,
          },
        },
      };

      expect(() => UpdateRuleRequestSchema.parse(updateThreshold)).not.toThrow();
    });

    test('should accept updating constant condition', () => {
      const updateConstant = {
        data: {
          constant: {
            alarmStat: ['NEW_STATUS'],
          },
        },
      };

      expect(() => UpdateRuleRequestSchema.parse(updateConstant)).not.toThrow();
    });

    test('should accept updating enabled status', () => {
      const updateEnabled = {
        data: {
          enabled: false,
        },
      };

      expect(() => UpdateRuleRequestSchema.parse(updateEnabled)).not.toThrow();
    });

    test('should accept updating updatedBy', () => {
      const updateUser = {
        data: {
          name: 'Updated Rule',
          updatedBy: 'moderator',
        },
      };

      expect(() => UpdateRuleRequestSchema.parse(updateUser)).not.toThrow();
    });

    test('should accept empty data object', () => {
      const emptyUpdate = {
        data: {},
      };

      expect(() => UpdateRuleRequestSchema.parse(emptyUpdate)).not.toThrow();
    });

    test('should reject invalid field values', () => {
      const invalidLevel = {
        data: {
          level: 'invalid',
        },
      };

      expect(() => UpdateRuleRequestSchema.parse(invalidLevel)).toThrow();
    });

    test('should reject empty name if provided', () => {
      const emptyName = {
        data: {
          name: '',
        },
      };

      expect(() => UpdateRuleRequestSchema.parse(emptyName)).toThrow();
    });
  });

  describe('EnableDisableRuleRequestSchema', () => {
    test('should use default userId "system"', () => {
      const request = {};
      const result = EnableDisableRuleRequestSchema.parse(request);

      expect(result.userId).toBe('system');
    });

    test('should accept custom userId', () => {
      const request = {
        userId: 'admin',
      };

      const result = EnableDisableRuleRequestSchema.parse(request);
      expect(result.userId).toBe('admin');
    });
  });

  describe('BatchOperationRequestSchema', () => {
    test('should accept valid batch operation', () => {
      const validRequest = {
        ids: ['rule_1', 'rule_2', 'rule_3'],
        userId: 'admin',
      };

      expect(() => BatchOperationRequestSchema.parse(validRequest)).not.toThrow();
    });

    test('should accept single ID in array', () => {
      const singleId = {
        ids: ['rule_1'],
      };

      expect(() => BatchOperationRequestSchema.parse(singleId)).not.toThrow();
    });

    test('should use default userId "system"', () => {
      const request = {
        ids: ['rule_1', 'rule_2'],
      };

      const result = BatchOperationRequestSchema.parse(request);
      expect(result.userId).toBe('system');
    });

    test('should reject empty IDs array', () => {
      const emptyIds = {
        ids: [],
      };

      expect(() => BatchOperationRequestSchema.parse(emptyIds)).toThrow();
    });

    test('should reject non-string IDs', () => {
      const invalidIds = {
        ids: ['rule_1', 123, 'rule_3'],
      };

      expect(() => BatchOperationRequestSchema.parse(invalidIds)).toThrow();
    });
  });

  describe('ListRulesQuerySchema', () => {
    test('should accept valid query with all filters', () => {
      const validQuery = {
        type: 'threshold',
        level: 'warning',
        enabled: 'true',
        protocol: 'modbus',
        limit: '50',
        page: '1',
      };

      const result = ListRulesQuerySchema.parse(validQuery);
      expect(result.type).toBe('threshold');
      expect(result.level).toBe('warning');
      expect(result.enabled).toBe(true);
      expect(result.protocol).toBe('modbus');
      expect(result.limit).toBe(50);
      expect(result.page).toBe(1);
    });

    test('should use default values', () => {
      const minimalQuery = {};
      const result = ListRulesQuerySchema.parse(minimalQuery);

      expect(result.limit).toBe(50);
      expect(result.page).toBe(1);
    });

    test('should convert string boolean to boolean', () => {
      const query1 = { enabled: 'true' };
      const result1 = ListRulesQuerySchema.parse(query1);
      expect(result1.enabled).toBe(true);

      const query2 = { enabled: 'false' };
      const result2 = ListRulesQuerySchema.parse(query2);
      expect(result2.enabled).toBe(false);
    });

    test('should accept optional filters', () => {
      const partialQuery = {
        type: 'constant',
        page: '2',
      };

      const result = ListRulesQuerySchema.parse(partialQuery);
      expect(result.type).toBe('constant');
      expect(result.level).toBeUndefined();
      expect(result.protocol).toBeUndefined();
    });

    test('should respect limit maximum of 100', () => {
      expect(() => ListRulesQuerySchema.parse({ limit: '101' })).toThrow();
      expect(() => ListRulesQuerySchema.parse({ limit: '100' })).not.toThrow();
    });

    test('should reject invalid type', () => {
      expect(() => ListRulesQuerySchema.parse({ type: 'invalid' })).toThrow();
    });

    test('should reject invalid level', () => {
      expect(() => ListRulesQuerySchema.parse({ level: 'invalid' })).toThrow();
    });

    test('should reject zero or negative pagination values', () => {
      expect(() => ListRulesQuerySchema.parse({ page: '0' })).toThrow();
      expect(() => ListRulesQuerySchema.parse({ limit: '0' })).toThrow();
      expect(() => ListRulesQuerySchema.parse({ page: '-1' })).toThrow();
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete rule lifecycle', () => {
      // 1. Create threshold rule
      const createRequest = {
        data: {
          name: 'Temperature Monitor',
          description: 'Monitor temperature sensor',
          type: 'threshold',
          level: 'warning',
          protocol: 'modbus',
          pid: 'temp_01',
          paramName: 'temperature',
          threshold: {
            min: -20,
            max: 80,
          },
          deduplicationWindow: 300,
          createdBy: 'admin',
        },
      };
      expect(() => CreateRuleRequestSchema.parse(createRequest)).not.toThrow();

      // 2. Update rule
      const updateRequest = {
        data: {
          level: 'critical',
          threshold: {
            min: -20,
            max: 100,
          },
          updatedBy: 'admin',
        },
      };
      expect(() => UpdateRuleRequestSchema.parse(updateRequest)).not.toThrow();

      // 3. Disable rule
      const disableRequest = {
        userId: 'admin',
      };
      expect(() => EnableDisableRuleRequestSchema.parse(disableRequest)).not.toThrow();

      // 4. Query rules
      const queryRequest = {
        type: 'threshold',
        level: 'critical',
        protocol: 'modbus',
        page: '1',
        limit: '20',
      };
      const queryResult = ListRulesQuerySchema.parse(queryRequest);
      expect(queryResult.type).toBe('threshold');
      expect(queryResult.page).toBe(1);
    });

    test('should validate multiple rule types correctly', () => {
      const ruleTypes = [
        {
          type: 'threshold',
          condition: { threshold: { min: 0, max: 100 } },
        },
        {
          type: 'constant',
          condition: { constant: { alarmStat: ['OK'] } },
        },
        {
          type: 'custom',
          condition: { customScript: 'return true;' },
        },
        {
          type: 'offline',
          condition: {},
        },
        {
          type: 'timeout',
          condition: {},
        },
      ];

      ruleTypes.forEach(({ type, condition }) => {
        const rule = {
          data: {
            name: `${type} rule`,
            type,
            level: 'info',
            ...condition,
            createdBy: 'admin',
          },
        };

        expect(() => CreateRuleRequestSchema.parse(rule)).not.toThrow();
      });
    });
  });
});
