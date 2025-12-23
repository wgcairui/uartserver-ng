/**
 * Terminal Entity Tests
 * Tests for terminal entity helper functions
 */

import { describe, test, expect } from 'bun:test';
import {
  isValidMacAddress,
  formatMacAddress,
  normalizeMacAddress,
  createTerminalDocument,
} from './terminal.entity';

describe('Terminal Entity Helper Functions', () => {
  describe('isValidMacAddress', () => {
    test('should accept valid 12-character MAC addresses', () => {
      const validMacs = [
        '001122334455',
        'AABBCCDDEEFF',
        'aabbccddeeff',
        '0123456789AB',
        'fFaAbBcCdDeE',
      ];

      validMacs.forEach((mac) => {
        expect(isValidMacAddress(mac)).toBe(true);
      });
    });

    test('should reject invalid MAC addresses', () => {
      const invalidMacs = [
        '',
        '00112233445',      // Too short
        '0011223344556',    // Too long
        '00:11:22:33:44:55', // With separators
        'GGHHIIJJKKLL',      // Invalid hex
        '00112233445Z',      // Invalid hex character
        '001122334 45',      // With space
      ];

      invalidMacs.forEach((mac) => {
        expect(isValidMacAddress(mac)).toBe(false);
      });
    });

    test('should be case-insensitive for hex characters', () => {
      expect(isValidMacAddress('AABBCCDDEEFF')).toBe(true);
      expect(isValidMacAddress('aabbccddeeff')).toBe(true);
      expect(isValidMacAddress('AaBbCcDdEeFf')).toBe(true);
    });
  });

  describe('formatMacAddress', () => {
    test('should format 12-character MAC with colons', () => {
      expect(formatMacAddress('001122334455')).toBe('00:11:22:33:44:55');
      expect(formatMacAddress('aabbccddeeff')).toBe('AA:BB:CC:DD:EE:FF');
      expect(formatMacAddress('0123456789ab')).toBe('01:23:45:67:89:AB');
    });

    test('should convert to uppercase', () => {
      expect(formatMacAddress('aabbccddeeff')).toBe('AA:BB:CC:DD:EE:FF');
      expect(formatMacAddress('AaBbCcDdEeFf')).toBe('AA:BB:CC:DD:EE:FF');
    });

    test('should return original string if not 12 characters', () => {
      expect(formatMacAddress('00:11:22:33:44:55')).toBe('00:11:22:33:44:55');
      expect(formatMacAddress('invalid')).toBe('invalid');
      expect(formatMacAddress('00112233445')).toBe('00112233445');
    });
  });

  describe('normalizeMacAddress', () => {
    test('should remove colons and convert to uppercase', () => {
      expect(normalizeMacAddress('00:11:22:33:44:55')).toBe('001122334455');
      expect(normalizeMacAddress('AA:BB:CC:DD:EE:FF')).toBe('AABBCCDDEEFF');
      expect(normalizeMacAddress('aa:bb:cc:dd:ee:ff')).toBe('AABBCCDDEEFF');
    });

    test('should remove dashes and convert to uppercase', () => {
      expect(normalizeMacAddress('00-11-22-33-44-55')).toBe('001122334455');
      expect(normalizeMacAddress('AA-BB-CC-DD-EE-FF')).toBe('AABBCCDDEEFF');
    });

    test('should handle mixed separators', () => {
      expect(normalizeMacAddress('00:11-22:33-44:55')).toBe('001122334455');
    });

    test('should handle already normalized MACs', () => {
      expect(normalizeMacAddress('001122334455')).toBe('001122334455');
      expect(normalizeMacAddress('AABBCCDDEEFF')).toBe('AABBCCDDEEFF');
    });

    test('should convert lowercase to uppercase', () => {
      expect(normalizeMacAddress('aabbccddeeff')).toBe('AABBCCDDEEFF');
      expect(normalizeMacAddress('AaBbCcDdEeFf')).toBe('AABBCCDDEEFF');
    });
  });

  describe('createTerminalDocument', () => {
    test('should create terminal with required fields', () => {
      const terminal = createTerminalDocument('001122334455', 'Test Terminal');

      expect(terminal.DevMac).toBe('001122334455');
      expect(terminal.name).toBe('Test Terminal');
      expect(terminal.online).toBe(false);
      expect(terminal.disable).toBe(false);
      expect(terminal.share).toBe(false);
      expect(terminal.AT).toBe(false);
      expect(terminal.connecting).toBe(false);
      expect(terminal.lock).toBe(false);
      expect(terminal.signal).toBe(0);
      expect(terminal.createdAt).toBeInstanceOf(Date);
      expect(terminal.updatedAt).toBeInstanceOf(Date);
    });

    test('should accept optional fields', () => {
      const terminal = createTerminalDocument('001122334455', 'Test Terminal', {
        ip: '192.168.1.100',
        port: 8080,
        jw: '116.404,39.915',
        online: true,
        share: true,
        ownerId: 'user123',
        remark: 'Test remark',
      });

      expect(terminal.DevMac).toBe('001122334455');
      expect(terminal.name).toBe('Test Terminal');
      expect(terminal.ip).toBe('192.168.1.100');
      expect(terminal.port).toBe(8080);
      expect(terminal.jw).toBe('116.404,39.915');
      expect(terminal.online).toBe(true);
      expect(terminal.share).toBe(true);
      expect(terminal.ownerId).toBe('user123');
      expect(terminal.remark).toBe('Test remark');
    });

    test('should override defaults with options', () => {
      const terminal = createTerminalDocument('001122334455', 'Test Terminal', {
        online: true,
        disable: true,
        share: true,
        signal: 75,
      });

      expect(terminal.online).toBe(true);
      expect(terminal.disable).toBe(true);
      expect(terminal.share).toBe(true);
      expect(terminal.signal).toBe(75);
    });

    test('should include mount devices when provided', () => {
      const terminal = createTerminalDocument('001122334455', 'Test Terminal', {
        mountDevs: [
          {
            pid: 1,
            protocol: 'modbus',
            mountDev: '01',
            name: 'Sensor 1',
            online: true,
          },
        ],
      });

      expect(terminal.mountDevs).toBeDefined();
      expect(terminal.mountDevs).toHaveLength(1);
      expect(terminal.mountDevs![0]!.pid).toBe(1);
      expect(terminal.mountDevs![0]!.protocol).toBe('modbus');
    });

    test('should set same timestamp for createdAt and updatedAt', () => {
      const terminal = createTerminalDocument('001122334455', 'Test Terminal');

      expect(terminal.createdAt.getTime()).toBe(terminal.updatedAt.getTime());
    });

    test('should include bindUsers when provided', () => {
      const terminal = createTerminalDocument('001122334455', 'Test Terminal', {
        bindUsers: ['user1', 'user2', 'user3'],
      });

      expect(terminal.bindUsers).toBeDefined();
      expect(terminal.bindUsers).toHaveLength(3);
      expect(terminal.bindUsers).toContain('user1');
      expect(terminal.bindUsers).toContain('user2');
      expect(terminal.bindUsers).toContain('user3');
    });
  });
});
