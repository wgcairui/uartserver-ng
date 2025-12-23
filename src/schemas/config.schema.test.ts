/**
 * Config Schema Tests (Phase 4.2 Day 4)
 *
 * 测试用户配置 Schema 验证逻辑
 */

import { describe, expect, test } from 'bun:test';
import {
  LayoutIdParamsSchema,
  LayoutBindSchema,
  LayoutItemSchema,
  UpdateUserLayoutRequestSchema,
  AggregationIdParamsSchema,
  AggregationDeviceSchema,
  UpdateUserAggregationRequestSchema,
  validateLayoutItemCount,
  validateAggregationDeviceCount,
  validateLayoutCoordinates,
  validateColor,
} from './config.schema';

// ============================================================================
// 布局 Schema 测试
// ============================================================================

describe('LayoutIdParamsSchema', () => {
  test('should validate layout ID', () => {
    const result = LayoutIdParamsSchema.safeParse({ id: 'dashboard-1' });
    expect(result.success).toBe(true);
  });

  test('should reject empty layout ID', () => {
    const result = LayoutIdParamsSchema.safeParse({ id: '' });
    expect(result.success).toBe(false);
  });
});

describe('LayoutBindSchema', () => {
  test('should validate valid bind', () => {
    const result = LayoutBindSchema.safeParse({
      mac: 'AABBCCDDEEFF',
      pid: 1,
      name: 'temperature',
    });
    expect(result.success).toBe(true);
  });

  test('should reject invalid MAC format', () => {
    const result = LayoutBindSchema.safeParse({
      mac: 'invalid',
      pid: 1,
      name: 'temperature',
    });
    expect(result.success).toBe(false);
  });

  test('should reject MAC with special characters', () => {
    const result = LayoutBindSchema.safeParse({
      mac: 'AA:BB:CC:DD:EE:FF',
      pid: 1,
      name: 'temperature',
    });
    expect(result.success).toBe(false);
  });

  test('should reject negative PID', () => {
    const result = LayoutBindSchema.safeParse({
      mac: 'AABBCCDDEEFF',
      pid: -1,
      name: 'temperature',
    });
    expect(result.success).toBe(false);
  });

  test('should reject empty parameter name', () => {
    const result = LayoutBindSchema.safeParse({
      mac: 'AABBCCDDEEFF',
      pid: 1,
      name: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('LayoutItemSchema', () => {
  test('should validate valid layout item', () => {
    const result = LayoutItemSchema.safeParse({
      x: 100,
      y: 200,
      id: 'widget-1',
      name: 'Temperature Widget',
      color: '#FF5733',
      bind: {
        mac: 'AABBCCDDEEFF',
        pid: 1,
        name: 'temperature',
      },
    });
    expect(result.success).toBe(true);
  });

  test('should reject negative coordinates', () => {
    const invalidX = LayoutItemSchema.safeParse({
      x: -10,
      y: 200,
      id: 'widget-1',
      name: 'Widget',
      color: '#FF5733',
      bind: { mac: 'AABBCCDDEEFF', pid: 1, name: 'temp' },
    });
    expect(invalidX.success).toBe(false);

    const invalidY = LayoutItemSchema.safeParse({
      x: 100,
      y: -20,
      id: 'widget-1',
      name: 'Widget',
      color: '#FF5733',
      bind: { mac: 'AABBCCDDEEFF', pid: 1, name: 'temp' },
    });
    expect(invalidY.success).toBe(false);
  });

  test('should validate color format', () => {
    const validColors = ['#000000', '#FFFFFF', '#FF5733', '#00ff00'];
    for (const color of validColors) {
      const result = LayoutItemSchema.safeParse({
        x: 0,
        y: 0,
        id: 'widget-1',
        name: 'Widget',
        color,
        bind: { mac: 'AABBCCDDEEFF', pid: 1, name: 'temp' },
      });
      expect(result.success).toBe(true);
    }
  });

  test('should reject invalid color formats', () => {
    const invalidColors = ['red', '#FFF', '#GGGGGG', 'rgb(255,0,0)', '#FF57331'];
    for (const color of invalidColors) {
      const result = LayoutItemSchema.safeParse({
        x: 0,
        y: 0,
        id: 'widget-1',
        name: 'Widget',
        color,
        bind: { mac: 'AABBCCDDEEFF', pid: 1, name: 'temp' },
      });
      expect(result.success).toBe(false);
    }
  });

  test('should reject empty item ID', () => {
    const result = LayoutItemSchema.safeParse({
      x: 0,
      y: 0,
      id: '',
      name: 'Widget',
      color: '#FF5733',
      bind: { mac: 'AABBCCDDEEFF', pid: 1, name: 'temp' },
    });
    expect(result.success).toBe(false);
  });

  test('should reject empty item name', () => {
    const result = LayoutItemSchema.safeParse({
      x: 0,
      y: 0,
      id: 'widget-1',
      name: '',
      color: '#FF5733',
      bind: { mac: 'AABBCCDDEEFF', pid: 1, name: 'temp' },
    });
    expect(result.success).toBe(false);
  });
});

describe('UpdateUserLayoutRequestSchema', () => {
  test('should validate valid layout update', () => {
    const result = UpdateUserLayoutRequestSchema.safeParse({
      data: {
        type: 'dashboard',
        bg: 'background.png',
        Layout: [
          {
            x: 100,
            y: 200,
            id: 'widget-1',
            name: 'Temperature',
            color: '#FF5733',
            bind: { mac: 'AABBCCDDEEFF', pid: 1, name: 'temp' },
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  test('should validate without background', () => {
    const result = UpdateUserLayoutRequestSchema.safeParse({
      data: {
        type: 'dashboard',
        Layout: [],
      },
    });
    expect(result.success).toBe(true);
  });

  test('should reject empty layout type', () => {
    const result = UpdateUserLayoutRequestSchema.safeParse({
      data: {
        type: '',
        Layout: [],
      },
    });
    expect(result.success).toBe(false);
  });

  test('should reject type exceeding 50 characters', () => {
    const longType = 'a'.repeat(51);
    const result = UpdateUserLayoutRequestSchema.safeParse({
      data: {
        type: longType,
        Layout: [],
      },
    });
    expect(result.success).toBe(false);
  });

  test('should reject background exceeding 200 characters', () => {
    const longBg = 'a'.repeat(201);
    const result = UpdateUserLayoutRequestSchema.safeParse({
      data: {
        type: 'dashboard',
        bg: longBg,
        Layout: [],
      },
    });
    expect(result.success).toBe(false);
  });

  test('should enforce maximum 50 layout items', () => {
    const items = Array(51).fill({
      x: 0,
      y: 0,
      id: 'widget',
      name: 'Widget',
      color: '#FF5733',
      bind: { mac: 'AABBCCDDEEFF', pid: 1, name: 'temp' },
    });
    const result = UpdateUserLayoutRequestSchema.safeParse({
      data: {
        type: 'dashboard',
        Layout: items,
      },
    });
    expect(result.success).toBe(false);
  });

  test('should accept 50 layout items (boundary)', () => {
    const items = Array(50).fill({
      x: 0,
      y: 0,
      id: 'widget',
      name: 'Widget',
      color: '#FF5733',
      bind: { mac: 'AABBCCDDEEFF', pid: 1, name: 'temp' },
    });
    const result = UpdateUserLayoutRequestSchema.safeParse({
      data: {
        type: 'dashboard',
        Layout: items,
      },
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// 聚合 Schema 测试
// ============================================================================

describe('AggregationIdParamsSchema', () => {
  test('should validate aggregation ID', () => {
    const result = AggregationIdParamsSchema.safeParse({ id: 'group-1' });
    expect(result.success).toBe(true);
  });

  test('should reject empty aggregation ID', () => {
    const result = AggregationIdParamsSchema.safeParse({ id: '' });
    expect(result.success).toBe(false);
  });
});

describe('AggregationDeviceSchema', () => {
  test('should validate valid device', () => {
    const result = AggregationDeviceSchema.safeParse({
      DevMac: 'AABBCCDDEEFF',
      name: 'Temperature Sensor',
      Type: 'sensor',
      mountDev: 'DTUAABBCC',
      protocol: 'modbus-rtu',
      pid: 1,
    });
    expect(result.success).toBe(true);
  });

  test('should use default PID of 0', () => {
    const result = AggregationDeviceSchema.safeParse({
      DevMac: 'AABBCCDDEEFF',
      name: 'Device',
      Type: 'sensor',
      mountDev: 'DTU',
      protocol: 'modbus',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pid).toBe(0);
    }
  });

  test('should reject invalid MAC format', () => {
    const result = AggregationDeviceSchema.safeParse({
      DevMac: 'invalid',
      name: 'Device',
      Type: 'sensor',
      mountDev: 'DTU',
      protocol: 'modbus',
    });
    expect(result.success).toBe(false);
  });

  test('should reject empty device name', () => {
    const result = AggregationDeviceSchema.safeParse({
      DevMac: 'AABBCCDDEEFF',
      name: '',
      Type: 'sensor',
      mountDev: 'DTU',
      protocol: 'modbus',
    });
    expect(result.success).toBe(false);
  });

  test('should reject negative PID', () => {
    const result = AggregationDeviceSchema.safeParse({
      DevMac: 'AABBCCDDEEFF',
      name: 'Device',
      Type: 'sensor',
      mountDev: 'DTU',
      protocol: 'modbus',
      pid: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe('UpdateUserAggregationRequestSchema', () => {
  test('should validate valid aggregation update', () => {
    const result = UpdateUserAggregationRequestSchema.safeParse({
      data: {
        name: 'My Device Group',
        aggregations: [
          {
            DevMac: 'AABBCCDDEEFF',
            name: 'Device 1',
            Type: 'sensor',
            mountDev: 'DTU1',
            protocol: 'modbus',
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  test('should reject empty aggregation name', () => {
    const result = UpdateUserAggregationRequestSchema.safeParse({
      data: {
        name: '',
        aggregations: [],
      },
    });
    expect(result.success).toBe(false);
  });

  test('should reject name exceeding 100 characters', () => {
    const longName = 'a'.repeat(101);
    const result = UpdateUserAggregationRequestSchema.safeParse({
      data: {
        name: longName,
        aggregations: [],
      },
    });
    expect(result.success).toBe(false);
  });

  test('should enforce maximum 100 devices', () => {
    const devices = Array(101).fill({
      DevMac: 'AABBCCDDEEFF',
      name: 'Device',
      Type: 'sensor',
      mountDev: 'DTU',
      protocol: 'modbus',
    });
    const result = UpdateUserAggregationRequestSchema.safeParse({
      data: {
        name: 'Group',
        aggregations: devices,
      },
    });
    expect(result.success).toBe(false);
  });

  test('should accept 100 devices (boundary)', () => {
    const devices = Array(100).fill({
      DevMac: 'AABBCCDDEEFF',
      name: 'Device',
      Type: 'sensor',
      mountDev: 'DTU',
      protocol: 'modbus',
    });
    const result = UpdateUserAggregationRequestSchema.safeParse({
      data: {
        name: 'Group',
        aggregations: devices,
      },
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// 验证辅助函数测试
// ============================================================================

describe('validateLayoutItemCount', () => {
  test('should accept valid count', () => {
    const result = validateLayoutItemCount(25);
    expect(result.valid).toBe(true);
  });

  test('should accept maximum count', () => {
    const result = validateLayoutItemCount(50);
    expect(result.valid).toBe(true);
  });

  test('should reject count exceeding 50', () => {
    const result = validateLayoutItemCount(51);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Maximum 50 layout items');
  });

  test('should accept zero count', () => {
    const result = validateLayoutItemCount(0);
    expect(result.valid).toBe(true);
  });
});

describe('validateAggregationDeviceCount', () => {
  test('should accept valid count', () => {
    const result = validateAggregationDeviceCount(50);
    expect(result.valid).toBe(true);
  });

  test('should accept maximum count', () => {
    const result = validateAggregationDeviceCount(100);
    expect(result.valid).toBe(true);
  });

  test('should reject count exceeding 100', () => {
    const result = validateAggregationDeviceCount(101);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Maximum 100 devices');
  });

  test('should accept zero count', () => {
    const result = validateAggregationDeviceCount(0);
    expect(result.valid).toBe(true);
  });
});

describe('validateLayoutCoordinates', () => {
  test('should accept valid coordinates', () => {
    const result = validateLayoutCoordinates(100, 200);
    expect(result.valid).toBe(true);
  });

  test('should accept coordinates at maximum bounds', () => {
    const result = validateLayoutCoordinates(1920, 1080);
    expect(result.valid).toBe(true);
  });

  test('should reject negative x coordinate', () => {
    const result = validateLayoutCoordinates(-10, 100);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('non-negative');
  });

  test('should reject negative y coordinate', () => {
    const result = validateLayoutCoordinates(100, -10);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('non-negative');
  });

  test('should reject x exceeding max bounds', () => {
    const result = validateLayoutCoordinates(2000, 100);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceed maximum bounds');
  });

  test('should reject y exceeding max bounds', () => {
    const result = validateLayoutCoordinates(100, 1200);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceed maximum bounds');
  });

  test('should accept custom max bounds', () => {
    const result = validateLayoutCoordinates(3000, 2000, 3840, 2160);
    expect(result.valid).toBe(true);
  });

  test('should reject coordinates exceeding custom max bounds', () => {
    const result = validateLayoutCoordinates(4000, 2000, 3840, 2160);
    expect(result.valid).toBe(false);
  });
});

describe('validateColor', () => {
  test('should accept valid hex colors', () => {
    const validColors = ['#000000', '#FFFFFF', '#FF5733', '#00ff00', '#AbCdEf'];
    for (const color of validColors) {
      const result = validateColor(color);
      expect(result.valid).toBe(true);
    }
  });

  test('should reject invalid formats', () => {
    const invalidColors = [
      'red',
      '#FFF',
      '#GGGGGG',
      'rgb(255,0,0)',
      '#FF57331',
      'FF5733',
      '#FF-5733',
    ];
    for (const color of invalidColors) {
      const result = validateColor(color);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid color format');
    }
  });

  test('should reject empty color', () => {
    const result = validateColor('');
    expect(result.valid).toBe(false);
  });
});
