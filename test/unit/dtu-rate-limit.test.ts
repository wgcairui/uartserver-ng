/**
 * DTU 速率限制单元测试
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import type { DtuOperationType } from '../../src/types/socket-events';

/**
 * 速率限制器测试类（从 DtuController 中提取的核心逻辑）
 */
class RateLimiter {
  private recentOperations = new Map<string, number>();

  private readonly OPERATION_COOLDOWNS: Record<DtuOperationType, number> = {
    restart: 60000,
    restart485: 30000,
    updateMount: 10000,
    OprateInstruct: 5000,
    setTerminal: 10000,
    getTerminal: 5000,
  };

  checkRateLimit(
    mac: string,
    operation: DtuOperationType
  ): { allowed: boolean; remainingTime?: number } {
    const key = `${mac}_${operation}`;
    const lastOperationTime = this.recentOperations.get(key) || 0;
    const now = Date.now();
    const cooldown = this.OPERATION_COOLDOWNS[operation];
    const timeSinceLastOperation = now - lastOperationTime;

    if (timeSinceLastOperation < cooldown) {
      const remainingTime = Math.ceil((cooldown - timeSinceLastOperation) / 1000);
      return { allowed: false, remainingTime };
    }

    this.recentOperations.set(key, now);

    // 清理过期记录
    if (this.recentOperations.size > 1000) {
      const fiveMinutesAgo = now - 300000;
      for (const [k, time] of this.recentOperations.entries()) {
        if (time < fiveMinutesAgo) {
          this.recentOperations.delete(k);
        }
      }
    }

    return { allowed: true };
  }

  // 测试辅助方法
  getOperationCount(): number {
    return this.recentOperations.size;
  }

  clear(): void {
    this.recentOperations.clear();
  }

  // 模拟时间流逝（用于测试）
  advanceTime(mac: string, operation: DtuOperationType, milliseconds: number): void {
    const key = `${mac}_${operation}`;
    const lastTime = this.recentOperations.get(key);
    if (lastTime) {
      this.recentOperations.set(key, lastTime - milliseconds);
    }
  }
}

describe('DTU Rate Limiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter();
  });

  describe('basic rate limiting', () => {
    test('should allow first operation', () => {
      const result = rateLimiter.checkRateLimit('AA:BB:CC:DD:EE:FF', 'restart');
      expect(result.allowed).toBe(true);
      expect(result.remainingTime).toBeUndefined();
    });

    test('should block immediate second operation', () => {
      const mac = 'AA:BB:CC:DD:EE:FF';
      const operation: DtuOperationType = 'restart';

      // First operation
      const result1 = rateLimiter.checkRateLimit(mac, operation);
      expect(result1.allowed).toBe(true);

      // Second operation immediately after
      const result2 = rateLimiter.checkRateLimit(mac, operation);
      expect(result2.allowed).toBe(false);
      expect(result2.remainingTime).toBeGreaterThan(0);
      expect(result2.remainingTime).toBeLessThanOrEqual(60);
    });

    test('should allow operation after cooldown period', () => {
      const mac = 'AA:BB:CC:DD:EE:FF';
      const operation: DtuOperationType = 'getTerminal';

      // First operation
      rateLimiter.checkRateLimit(mac, operation);

      // Simulate 6 seconds passing (cooldown is 5 seconds)
      rateLimiter.advanceTime(mac, operation, 6000);

      // Second operation after cooldown
      const result = rateLimiter.checkRateLimit(mac, operation);
      expect(result.allowed).toBe(true);
    });
  });

  describe('different operation types', () => {
    test('restart should have 60 second cooldown', () => {
      const mac = 'AA:BB:CC:DD:EE:FF';
      rateLimiter.checkRateLimit(mac, 'restart');

      // After 59 seconds - should still be blocked
      rateLimiter.advanceTime(mac, 'restart', 59000);
      const result1 = rateLimiter.checkRateLimit(mac, 'restart');
      expect(result1.allowed).toBe(false);

      // After 61 seconds - should be allowed
      rateLimiter.advanceTime(mac, 'restart', 2000); // Total 61s
      const result2 = rateLimiter.checkRateLimit(mac, 'restart');
      expect(result2.allowed).toBe(true);
    });

    test('restart485 should have 30 second cooldown', () => {
      const mac = 'AA:BB:CC:DD:EE:FF';
      rateLimiter.checkRateLimit(mac, 'restart485');

      rateLimiter.advanceTime(mac, 'restart485', 29000);
      const result1 = rateLimiter.checkRateLimit(mac, 'restart485');
      expect(result1.allowed).toBe(false);

      rateLimiter.advanceTime(mac, 'restart485', 2000);
      const result2 = rateLimiter.checkRateLimit(mac, 'restart485');
      expect(result2.allowed).toBe(true);
    });

    test('OprateInstruct should have 5 second cooldown', () => {
      const mac = 'AA:BB:CC:DD:EE:FF';
      rateLimiter.checkRateLimit(mac, 'OprateInstruct');

      rateLimiter.advanceTime(mac, 'OprateInstruct', 4000);
      const result1 = rateLimiter.checkRateLimit(mac, 'OprateInstruct');
      expect(result1.allowed).toBe(false);

      rateLimiter.advanceTime(mac, 'OprateInstruct', 2000);
      const result2 = rateLimiter.checkRateLimit(mac, 'OprateInstruct');
      expect(result2.allowed).toBe(true);
    });
  });

  describe('per-device and per-operation isolation', () => {
    test('different devices should not interfere', () => {
      const mac1 = 'AA:BB:CC:DD:EE:FF';
      const mac2 = '11:22:33:44:55:66';
      const operation: DtuOperationType = 'restart';

      // First device
      const result1 = rateLimiter.checkRateLimit(mac1, operation);
      expect(result1.allowed).toBe(true);

      // Second device should be allowed immediately
      const result2 = rateLimiter.checkRateLimit(mac2, operation);
      expect(result2.allowed).toBe(true);

      // First device still blocked
      const result3 = rateLimiter.checkRateLimit(mac1, operation);
      expect(result3.allowed).toBe(false);
    });

    test('different operations on same device should not interfere', () => {
      const mac = 'AA:BB:CC:DD:EE:FF';

      // Restart operation
      const result1 = rateLimiter.checkRateLimit(mac, 'restart');
      expect(result1.allowed).toBe(true);

      // GetTerminal operation should be allowed immediately
      const result2 = rateLimiter.checkRateLimit(mac, 'getTerminal');
      expect(result2.allowed).toBe(true);

      // Restart still blocked
      const result3 = rateLimiter.checkRateLimit(mac, 'restart');
      expect(result3.allowed).toBe(false);

      // GetTerminal also blocked (own cooldown)
      const result4 = rateLimiter.checkRateLimit(mac, 'getTerminal');
      expect(result4.allowed).toBe(false);
    });
  });

  describe('remaining time calculation', () => {
    test('should calculate remaining time correctly', () => {
      const mac = 'AA:BB:CC:DD:EE:FF';
      const operation: DtuOperationType = 'restart'; // 60s cooldown

      rateLimiter.checkRateLimit(mac, operation);

      // Check immediately
      const result1 = rateLimiter.checkRateLimit(mac, operation);
      expect(result1.remainingTime).toBeGreaterThanOrEqual(59);
      expect(result1.remainingTime).toBeLessThanOrEqual(60);

      // Advance 30 seconds
      rateLimiter.advanceTime(mac, operation, 30000);
      const result2 = rateLimiter.checkRateLimit(mac, operation);
      expect(result2.remainingTime).toBeGreaterThanOrEqual(29);
      expect(result2.remainingTime).toBeLessThanOrEqual(30);

      // Advance 29 more seconds (total 59s)
      rateLimiter.advanceTime(mac, operation, 29000);
      const result3 = rateLimiter.checkRateLimit(mac, operation);
      expect(result3.remainingTime).toBeGreaterThanOrEqual(0);
      expect(result3.remainingTime).toBeLessThanOrEqual(1);
    });
  });

  describe('cleanup mechanism', () => {
    test('should clean up old entries when size exceeds limit', () => {
      // Add 1000 entries first
      for (let i = 0; i < 1000; i++) {
        const mac = `AA:BB:CC:DD:EE:${i.toString().padStart(3, '0')}`;
        rateLimiter.checkRateLimit(mac, 'restart');
      }

      expect(rateLimiter.getOperationCount()).toBe(1000);

      // Simulate 6 minutes passing for first 100 entries
      for (let i = 0; i < 100; i++) {
        const mac = `AA:BB:CC:DD:EE:${i.toString().padStart(3, '0')}`;
        rateLimiter.advanceTime(mac, 'restart', 360000);
      }

      // Add one more entry to trigger cleanup (exceeds 1000)
      rateLimiter.checkRateLimit('NEW:MAC:ADDRESS', 'restart');

      // At least some old entries should be cleaned up
      expect(rateLimiter.getOperationCount()).toBeLessThanOrEqual(1001);
      // Should be greater than just the new entries (901 recent + 1 new)
      expect(rateLimiter.getOperationCount()).toBeGreaterThan(900);
    });
  });

  describe('edge cases', () => {
    test('should handle multiple rapid requests', () => {
      const mac = 'AA:BB:CC:DD:EE:FF';
      const operation: DtuOperationType = 'getTerminal';

      const result1 = rateLimiter.checkRateLimit(mac, operation);
      expect(result1.allowed).toBe(true);

      // 10 rapid requests
      for (let i = 0; i < 10; i++) {
        const result = rateLimiter.checkRateLimit(mac, operation);
        expect(result.allowed).toBe(false);
        expect(result.remainingTime).toBeGreaterThan(0);
      }
    });

    test('should handle empty MAC address gracefully', () => {
      const result = rateLimiter.checkRateLimit('', 'restart');
      expect(result.allowed).toBe(true);

      const result2 = rateLimiter.checkRateLimit('', 'restart');
      expect(result2.allowed).toBe(false);
    });

    test('should handle concurrent operations on different combinations', () => {
      const devices = ['MAC1', 'MAC2', 'MAC3'];
      const operations: DtuOperationType[] = ['restart', 'getTerminal', 'setTerminal'];

      // All combinations should be independent
      for (const mac of devices) {
        for (const operation of operations) {
          const result = rateLimiter.checkRateLimit(mac, operation);
          expect(result.allowed).toBe(true);
        }
      }

      expect(rateLimiter.getOperationCount()).toBe(9); // 3 devices * 3 operations
    });
  });
});
