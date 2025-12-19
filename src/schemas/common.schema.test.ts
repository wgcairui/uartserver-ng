import { describe, test, expect } from 'bun:test';
import {
  MacAddressSchema,
  stringToBoolean,
  stringToPositiveInt,
  stringToDate,
} from './common.schema';
import { z } from 'zod';

describe('Common Schema Validators', () => {
  describe('MacAddressSchema', () => {
    test('should accept valid MAC addresses', () => {
      const validMacs = [
        '00:11:22:33:44:55',
        'AA:BB:CC:DD:EE:FF',
        'aA:bB:cC:dD:eE:fF',
        '01:23:45:67:89:AB',
      ];

      validMacs.forEach((mac) => {
        expect(() => MacAddressSchema.parse(mac)).not.toThrow();
      });
    });

    test('should reject invalid MAC addresses', () => {
      const invalidMacs = [
        '',
        '00:11:22:33:44', // Too short
        '00:11:22:33:44:55:66', // Too long
        '00-11-22-33-44-55', // Wrong separator
        'GG:HH:II:JJ:KK:LL', // Invalid hex
        '00:11:22:33:44:ZZ', // Invalid hex at end
        '00:11:22:33:44:5', // Incomplete byte
      ];

      invalidMacs.forEach((mac) => {
        expect(() => MacAddressSchema.parse(mac)).toThrow();
      });
    });

    test('should have appropriate error message', () => {
      try {
        MacAddressSchema.parse('invalid-mac');
      } catch (error) {
        expect(error).toBeInstanceOf(z.ZodError);
        if (error instanceof z.ZodError) {
          expect(error.issues[0]?.message).toContain('MAC');
        }
      }
    });

    describe('Edge Cases', () => {
      test('should handle compact format (12 hex digits)', () => {
        const validCompact = [
          '001122334455',
          'AABBCCDDEEFF',
          'aabbccddeeff',
          '0123456789AB',
          'fFaAbBcCdDeE', // Mixed case
        ];

        validCompact.forEach((mac) => {
          expect(() => MacAddressSchema.parse(mac)).not.toThrow();
        });
      });

      test('should reject compact format with wrong length', () => {
        const invalidCompact = [
          '00112233445',     // 11 digits
          '0011223344556',   // 13 digits
          '00112233445566',  // 14 digits
        ];

        invalidCompact.forEach((mac) => {
          expect(() => MacAddressSchema.parse(mac)).toThrow();
        });
      });

      test('should reject MACs with whitespace', () => {
        const withWhitespace = [
          ' 00:11:22:33:44:55',
          '00:11:22:33:44:55 ',
          ' 00:11:22:33:44:55 ',
          '00:11: 22:33:44:55', // Space in middle
          '00: 11:22:33:44:55',
        ];

        withWhitespace.forEach((mac) => {
          expect(() => MacAddressSchema.parse(mac)).toThrow();
        });
      });

      test('should handle all valid hex characters', () => {
        // Test all hex digits 0-9, A-F
        expect(() => MacAddressSchema.parse('00:11:22:33:44:55')).not.toThrow();
        expect(() => MacAddressSchema.parse('66:77:88:99:AA:BB')).not.toThrow();
        expect(() => MacAddressSchema.parse('CC:DD:EE:FF:00:11')).not.toThrow();
      });

      test('should reject invalid hex characters', () => {
        const invalidHex = [
          'GG:11:22:33:44:55', // G is invalid
          '00:HH:22:33:44:55', // H is invalid
          '00:11:ZZ:33:44:55', // Z is invalid
          '00:11:22:33:44:5G', // G at end
        ];

        invalidHex.forEach((mac) => {
          expect(() => MacAddressSchema.parse(mac)).toThrow();
        });
      });

      test('should reject MACs with incorrect separators', () => {
        const wrongSeparators = [
          '00-11-22-33-44-55', // Dash instead of colon
          '00.11.22.33.44.55', // Dot instead of colon
          '00 11 22 33 44 55', // Space instead of colon
          '00:11-22:33:44:55', // Mixed separators
        ];

        wrongSeparators.forEach((mac) => {
          expect(() => MacAddressSchema.parse(mac)).toThrow();
        });
      });

      test('should handle mixed case correctly', () => {
        const mixedCase = [
          'aA:bB:cC:dD:eE:fF',
          'Aa:Bb:Cc:Dd:Ee:Ff',
          '0a:1B:2c:3D:4e:5F',
        ];

        mixedCase.forEach((mac) => {
          expect(() => MacAddressSchema.parse(mac)).not.toThrow();
        });
      });
    });
  });

  describe('stringToBoolean', () => {
    test('should convert "true" string to boolean true', () => {
      const schema = z.object({ flag: stringToBoolean() });
      const result = schema.parse({ flag: 'true' });
      expect(result.flag).toBe(true);
      expect(typeof result.flag).toBe('boolean');
    });

    test('should convert "false" string to boolean false', () => {
      const schema = z.object({ flag: stringToBoolean() });
      const result = schema.parse({ flag: 'false' });
      expect(result.flag).toBe(false);
      expect(typeof result.flag).toBe('boolean');
    });

    test('should handle undefined as optional', () => {
      const schema = z.object({ flag: stringToBoolean() });
      const result = schema.parse({ flag: undefined });
      expect(result.flag).toBeUndefined();
    });

    test('should convert invalid string values to undefined', () => {
      const schema = z.object({ flag: stringToBoolean() });

      // Invalid strings should become undefined (not throw)
      const result1 = schema.parse({ flag: 'yes' });
      expect(result1.flag).toBeUndefined();

      const result2 = schema.parse({ flag: '1' });
      expect(result2.flag).toBeUndefined();

      const result3 = schema.parse({ flag: 'invalid' });
      expect(result3.flag).toBeUndefined();
    });

    test('should only accept string type (reject boolean directly)', () => {
      const schema = z.object({ flag: stringToBoolean() });

      // These should throw because the function expects strings, not booleans
      expect(() => schema.parse({ flag: true })).toThrow();
      expect(() => schema.parse({ flag: false })).toThrow();
    });

    describe('Edge Cases', () => {
      test('should handle strings with whitespace', () => {
        const schema = z.object({ flag: stringToBoolean() });

        // Whitespace should make the value invalid (not trimmed)
        expect(schema.parse({ flag: ' true' }).flag).toBeUndefined();
        expect(schema.parse({ flag: 'true ' }).flag).toBeUndefined();
        expect(schema.parse({ flag: ' true ' }).flag).toBeUndefined();
        expect(schema.parse({ flag: '  false  ' }).flag).toBeUndefined();
      });

      test('should be case-sensitive', () => {
        const schema = z.object({ flag: stringToBoolean() });

        // Case variations should return undefined
        expect(schema.parse({ flag: 'True' }).flag).toBeUndefined();
        expect(schema.parse({ flag: 'TRUE' }).flag).toBeUndefined();
        expect(schema.parse({ flag: 'False' }).flag).toBeUndefined();
        expect(schema.parse({ flag: 'FALSE' }).flag).toBeUndefined();
        expect(schema.parse({ flag: 'TrUe' }).flag).toBeUndefined();
      });

      test('should handle numeric string representations', () => {
        const schema = z.object({ flag: stringToBoolean() });

        // Numeric strings should return undefined
        expect(schema.parse({ flag: '0' }).flag).toBeUndefined();
        expect(schema.parse({ flag: '1' }).flag).toBeUndefined();
        expect(schema.parse({ flag: 'yes' }).flag).toBeUndefined();
        expect(schema.parse({ flag: 'no' }).flag).toBeUndefined();
      });

      test('should handle empty and whitespace-only strings', () => {
        const schema = z.object({ flag: stringToBoolean() });

        // Empty and whitespace strings should return undefined
        expect(schema.parse({ flag: '' }).flag).toBeUndefined();
        expect(schema.parse({ flag: '   ' }).flag).toBeUndefined();
        expect(schema.parse({ flag: '\t' }).flag).toBeUndefined();
        expect(schema.parse({ flag: '\n' }).flag).toBeUndefined();
      });
    });
  });

  describe('stringToPositiveInt', () => {
    test('should convert numeric string to positive integer', () => {
      const schema = z.object({ count: stringToPositiveInt('1') });

      const result = schema.parse({ count: '42' });
      expect(result.count).toBe(42);
      expect(typeof result.count).toBe('number');
    });

    test('should only accept string type (reject numbers directly)', () => {
      const schema = z.object({ count: stringToPositiveInt('10') });

      // Should throw because the function expects strings, not numbers
      expect(() => schema.parse({ count: 42 })).toThrow();
    });

    test('should use default value when undefined', () => {
      const schema = z.object({ count: stringToPositiveInt('10') });

      const result = schema.parse({ count: undefined });
      expect(result.count).toBe(10);
    });

    test('should respect maximum limit', () => {
      const schema = z.object({ count: stringToPositiveInt('10', 100) });

      // Within limit
      expect(() => schema.parse({ count: '50' })).not.toThrow();
      expect(() => schema.parse({ count: '100' })).not.toThrow();

      // Exceeds limit
      expect(() => schema.parse({ count: '101' })).toThrow();
      expect(() => schema.parse({ count: '1000' })).toThrow();
    });

    test('should reject zero and negative numbers', () => {
      const schema = z.object({ count: stringToPositiveInt('10') });

      expect(() => schema.parse({ count: '0' })).toThrow();
      expect(() => schema.parse({ count: '-1' })).toThrow();
      expect(() => schema.parse({ count: '-100' })).toThrow();
    });

    test('should truncate decimal values (parseInt behavior)', () => {
      const schema = z.object({ count: stringToPositiveInt('10') });

      // parseInt truncates decimals, doesn't throw
      const result1 = schema.parse({ count: '3.14' });
      expect(result1.count).toBe(3);

      const result2 = schema.parse({ count: '1.9' });
      expect(result2.count).toBe(1);
    });

    test('should reject invalid strings', () => {
      const schema = z.object({ count: stringToPositiveInt('10') });

      expect(() => schema.parse({ count: 'abc' })).toThrow();
      expect(() => schema.parse({ count: '' })).toThrow();
      expect(() => schema.parse({ count: 'NaN' })).toThrow();
    });
  });

  describe('stringToDate', () => {
    test('should convert ISO date string to Date object', () => {
      const schema = z.object({ timestamp: stringToDate() });

      const isoString = '2024-12-19T10:00:00.000Z';
      const result = schema.parse({ timestamp: isoString });

      expect(result.timestamp).toBeInstanceOf(Date);
      if (result.timestamp) {
        expect(result.timestamp.toISOString()).toBe(isoString);
      }
    });

    test('should only accept string type (reject Date objects directly)', () => {
      const schema = z.object({ timestamp: stringToDate() });

      const date = new Date('2024-12-19T10:00:00.000Z');
      // Should throw because the function expects strings, not Date objects
      expect(() => schema.parse({ timestamp: date })).toThrow();
    });

    test('should only accept string type (reject numbers directly)', () => {
      const schema = z.object({ timestamp: stringToDate() });

      const timestamp = 1734601200000; // 2024-12-19T10:00:00.000Z
      // Should throw because the function expects strings, not numbers
      expect(() => schema.parse({ timestamp })).toThrow();
    });

    test('should handle various date string formats', () => {
      const schema = z.object({ timestamp: stringToDate() });

      const formats = [
        '2024-12-19',
        '2024-12-19T10:00:00',
        '2024-12-19T10:00:00.000Z',
        '2024-12-19T10:00:00+08:00',
      ];

      formats.forEach((dateStr) => {
        const result = schema.parse({ timestamp: dateStr });
        expect(result.timestamp).toBeInstanceOf(Date);
        if (result.timestamp) {
          expect(result.timestamp.toString()).not.toBe('Invalid Date');
        }
      });
    });

    test('should handle undefined as optional', () => {
      const schema = z.object({ timestamp: stringToDate() });

      const result = schema.parse({ timestamp: undefined });
      expect(result.timestamp).toBeUndefined();
    });

    test('should reject invalid date strings', () => {
      const schema = z.object({ timestamp: stringToDate() });

      expect(() => schema.parse({ timestamp: 'not-a-date' })).toThrow();
      expect(() => schema.parse({ timestamp: 'abc' })).toThrow();
    });

    test('should convert empty string to undefined', () => {
      const schema = z.object({ timestamp: stringToDate() });

      // Empty string becomes undefined (not throw) due to optional transform
      const result = schema.parse({ timestamp: '' });
      expect(result.timestamp).toBeUndefined();
    });

    test('should reject invalid dates', () => {
      const schema = z.object({ timestamp: stringToDate() });

      // Invalid date that parses but creates Invalid Date
      expect(() => schema.parse({ timestamp: '2024-13-45' })).toThrow();
    });
  });

  describe('Integration Tests', () => {
    test('should work together in complex schema', () => {
      const ComplexSchema = z.object({
        mac: MacAddressSchema,
        enabled: stringToBoolean(),
        page: stringToPositiveInt('1'),
        limit: stringToPositiveInt('20', 100),
        startTime: stringToDate(),
      });

      const validData = {
        mac: 'AA:BB:CC:DD:EE:FF',
        enabled: 'true',
        page: '2',
        limit: '50',
        startTime: '2024-12-19T10:00:00.000Z',
      };

      const result = ComplexSchema.parse(validData);

      expect(result.mac).toBe('AA:BB:CC:DD:EE:FF');
      expect(result.enabled).toBe(true);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(50);
      expect(result.startTime).toBeInstanceOf(Date);
    });

    test('should handle query string format with defaults', () => {
      const QuerySchema = z.object({
        mac: MacAddressSchema,
        enabled: stringToBoolean(),
        page: stringToPositiveInt('1'),
        limit: stringToPositiveInt('20', 100),
        startTime: stringToDate(),
      });

      // All strings (as they come from query parameters) with some undefined
      const queryData = {
        mac: '00:11:22:33:44:55',
        enabled: 'true', // string
        page: '3', // string
        limit: undefined, // will use default
        startTime: '2024-12-19T10:00:00.000Z', // string
      };

      const result = QuerySchema.parse(queryData);

      expect(result.mac).toBe('00:11:22:33:44:55');
      expect(result.enabled).toBe(true);
      expect(result.page).toBe(3);
      expect(result.limit).toBe(20); // default value
      expect(result.startTime).toBeInstanceOf(Date);
    });
  });
});
