/**
 * JWT 工具单元测试
 */

import { describe, test, expect } from 'bun:test';
import type { JwtPayload } from '../../src/types/jwt';
import {
  extractUserId,
  extractUsername,
  isJwtExpired,
  isJwtNotYetValid,
  getJwtRemainingTime,
} from '../../src/types/jwt';

describe('JWT utils', () => {
  describe('extractUserId', () => {
    test('should extract userId from userId field', () => {
      const payload = { userId: 'user123' };
      expect(extractUserId(payload)).toBe('user123');
    });

    test('should extract userId from sub field', () => {
      const payload = { sub: 'user456' };
      expect(extractUserId(payload)).toBe('user456');
    });

    test('should extract userId from id field', () => {
      const payload = { id: 'user789' };
      expect(extractUserId(payload)).toBe('user789');
    });

    test('should extract userId from user_id field', () => {
      const payload = { user_id: 'user999' };
      expect(extractUserId(payload)).toBe('user999');
    });

    test('should prefer userId over other fields', () => {
      const payload = {
        userId: 'user1',
        sub: 'user2',
        id: 'user3',
        user_id: 'user4',
      };
      expect(extractUserId(payload)).toBe('user1');
    });

    test('should return undefined when no userId found', () => {
      const payload = { name: 'John' };
      expect(extractUserId(payload)).toBeUndefined();
    });

    test('should handle null and undefined', () => {
      expect(extractUserId(null)).toBeUndefined();
      expect(extractUserId(undefined)).toBeUndefined();
    });
  });

  describe('extractUsername', () => {
    test('should extract username from username field', () => {
      const payload = { username: 'john_doe' };
      expect(extractUsername(payload)).toBe('john_doe');
    });

    test('should extract username from name field', () => {
      const payload = { name: 'Jane Doe' };
      expect(extractUsername(payload)).toBe('Jane Doe');
    });

    test('should extract username from user_name field', () => {
      const payload = { user_name: 'alice_smith' };
      expect(extractUsername(payload)).toBe('alice_smith');
    });

    test('should prefer username over other fields', () => {
      const payload = {
        username: 'user1',
        name: 'user2',
        user_name: 'user3',
      };
      expect(extractUsername(payload)).toBe('user1');
    });

    test('should return undefined when no username found', () => {
      const payload = { userId: '123' };
      expect(extractUsername(payload)).toBeUndefined();
    });

    test('should handle null and undefined', () => {
      expect(extractUsername(null)).toBeUndefined();
      expect(extractUsername(undefined)).toBeUndefined();
    });
  });

  describe('isJwtExpired', () => {
    test('should return false when exp is not set', () => {
      const payload: JwtPayload = { userId: '123' };
      expect(isJwtExpired(payload)).toBe(false);
    });

    test('should return true when token is expired', () => {
      const pastTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const payload: JwtPayload = { userId: '123', exp: pastTime };
      expect(isJwtExpired(payload)).toBe(true);
    });

    test('should return false when token is not expired', () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const payload: JwtPayload = { userId: '123', exp: futureTime };
      expect(isJwtExpired(payload)).toBe(false);
    });

    test('should return true when token just expired', () => {
      const justExpired = Math.floor(Date.now() / 1000) - 1; // 1 second ago
      const payload: JwtPayload = { userId: '123', exp: justExpired };
      expect(isJwtExpired(payload)).toBe(true);
    });
  });

  describe('isJwtNotYetValid', () => {
    test('should return false when nbf is not set', () => {
      const payload: JwtPayload = { userId: '123' };
      expect(isJwtNotYetValid(payload)).toBe(false);
    });

    test('should return true when token is not yet valid', () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const payload: JwtPayload = { userId: '123', nbf: futureTime };
      expect(isJwtNotYetValid(payload)).toBe(true);
    });

    test('should return false when token is already valid', () => {
      const pastTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const payload: JwtPayload = { userId: '123', nbf: pastTime };
      expect(isJwtNotYetValid(payload)).toBe(false);
    });

    test('should return false when token just became valid', () => {
      const justValid = Math.floor(Date.now() / 1000) - 1; // 1 second ago
      const payload: JwtPayload = { userId: '123', nbf: justValid };
      expect(isJwtNotYetValid(payload)).toBe(false);
    });
  });

  describe('getJwtRemainingTime', () => {
    test('should return null when exp is not set', () => {
      const payload: JwtPayload = { userId: '123' };
      expect(getJwtRemainingTime(payload)).toBeNull();
    });

    test('should return 0 when token is expired', () => {
      const pastTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const payload: JwtPayload = { userId: '123', exp: pastTime };
      expect(getJwtRemainingTime(payload)).toBe(0);
    });

    test('should return correct remaining time', () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const payload: JwtPayload = { userId: '123', exp: futureTime };
      const remaining = getJwtRemainingTime(payload);

      expect(remaining).toBeGreaterThan(3590); // Allow for small timing differences
      expect(remaining).toBeLessThanOrEqual(3600);
    });

    test('should return remaining time close to zero', () => {
      const almostExpired = Math.floor(Date.now() / 1000) + 5; // 5 seconds from now
      const payload: JwtPayload = { userId: '123', exp: almostExpired };
      const remaining = getJwtRemainingTime(payload);

      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(5);
    });
  });

  describe('JwtPayload integration', () => {
    test('should work with complete payload', () => {
      const now = Math.floor(Date.now() / 1000);
      const payload: JwtPayload = {
        userId: 'user123',
        username: 'john_doe',
        role: 'admin',
        sub: 'user123',
        iat: now,
        exp: now + 3600,
        iss: 'uart-server',
        aud: 'uart-client',
      };

      expect(extractUserId(payload)).toBe('user123');
      expect(extractUsername(payload)).toBe('john_doe');
      expect(isJwtExpired(payload)).toBe(false);
      expect(isJwtNotYetValid(payload)).toBe(false);
      expect(getJwtRemainingTime(payload)).toBeGreaterThan(3590);
    });

    test('should handle minimal payload', () => {
      const payload: JwtPayload = {
        userId: 'user456',
      };

      expect(extractUserId(payload)).toBe('user456');
      expect(extractUsername(payload)).toBeUndefined();
      expect(isJwtExpired(payload)).toBe(false);
      expect(isJwtNotYetValid(payload)).toBe(false);
      expect(getJwtRemainingTime(payload)).toBeNull();
    });

    test('should handle payload with custom fields', () => {
      const payload: JwtPayload = {
        userId: 'user789',
        customField: 'customValue',
        permissions: ['read', 'write'],
      };

      expect(extractUserId(payload)).toBe('user789');
      expect(payload.customField).toBe('customValue');
      expect(payload.permissions).toEqual(['read', 'write']);
    });
  });
});
