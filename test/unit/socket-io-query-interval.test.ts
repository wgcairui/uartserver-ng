/**
 * Socket.IO Query Interval Calculation Unit Tests
 *
 * 测试查询间隔计算的 Bug 修复:
 * - Bug 1: 基数错误 (1000:500 -> 2000:1000)
 * - Bug 2: 只计算第一个设备的指令数量 -> 计算所有设备指令总和
 * - Bug 3: 查询判断容差过于激进 (-1000ms -> 精确匹配)
 *
 * 修复日期: 2025-12-20
 */

import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test';
import type { Terminal, MountDevice } from '../../src/entities/mongodb/terminal.entity';
import type { Protocol } from '../../src/entities/mongodb/protocol.entity';

/**
 * Mock SocketIOService for testing private methods
 */
class MockSocketIOService {
  private protocolCache: Map<string, Protocol> = new Map();

  /**
   * Mock protocol cache method
   */
  async cacheProtocol(protocolId: string): Promise<Protocol | null> {
    return this.protocolCache.get(protocolId) || null;
  }

  /**
   * Set mock protocol for testing
   */
  setMockProtocol(protocolId: string, instructCount: number): void {
    this.protocolCache.set(protocolId, {
      _id: protocolId,
      instruct: Array(instructCount).fill({ name: 'test' }),
    } as any);
  }

  /**
   * Calculate query interval (copy of fixed implementation)
   */
  async calculateQueryInterval(terminal: Terminal): Promise<number> {
    // ✅ Bug Fix 1: 正确的基数 (2000:1000)
    let base = terminal.ICCID ? 2000 : 1000;

    // Aliyun IoT card flow resource optimization (unchanged)
    if (terminal.iccidInfo) {
      const { resName, flowResource } = terminal.iccidInfo;
      if (resName === 'ali_1' && flowResource < 512 * 1024) {
        base *= ((512 * 1024) / flowResource) * 2;
      }
    }

    const mountDevs = terminal.mountDevs || [];
    if (mountDevs.length === 0) {
      return Math.max(base, 5000);
    }

    // ✅ Bug Fix 2: 计算所有设备的指令总和
    const instructCounts = await Promise.all(
      mountDevs.map(async (dev) => {
        const protocol = await this.cacheProtocol(dev.protocol);
        return protocol?.instruct?.length || 1;
      })
    );

    const totalInstructs = instructCounts.reduce((sum, count) => sum + count, 0);

    return Math.max(totalInstructs * base, 5000);
  }

  /**
   * Simulate query interval check (copy of fixed implementation)
   */
  shouldSendQuery(lastEmitTime: Date | null, intervalMs: number): boolean {
    if (!lastEmitTime) {
      return true; // No previous query, should send
    }

    const elapsed = Date.now() - lastEmitTime.getTime();

    // ✅ Bug Fix 3: 精确匹配间隔,去掉 -1000 容差
    return elapsed >= intervalMs;
  }
}

describe('Socket.IO Query Interval Calculation', () => {
  let service: MockSocketIOService;

  beforeEach(() => {
    service = new MockSocketIOService();
  });

  describe('Bug Fix 1: Base Interval Correction', () => {
    it('should use 1000ms base for non-ICCID terminals (was 500ms)', async () => {
      const terminal: Terminal = {
        Mac: 'AA:BB:CC:DD:EE:FF',
        ICCID: null, // No 4G
        mountDevs: [
          {
            pid: 1,
            protocol: 'protocol_A',
          } as MountDevice,
        ],
      } as Terminal;

      // Mock protocol with 1 instruction
      service.setMockProtocol('protocol_A', 1);

      const interval = await service.calculateQueryInterval(terminal);

      // 1 instruction * 1000ms base = 1000ms
      // But minimum is 5000ms
      expect(interval).toBe(5000);
    });

    it('should use 2000ms base for ICCID terminals (was 1000ms)', async () => {
      const terminal: Terminal = {
        Mac: 'AA:BB:CC:DD:EE:FF',
        ICCID: '1234567890', // Has 4G
        mountDevs: [
          {
            pid: 1,
            protocol: 'protocol_A',
          } as MountDevice,
        ],
      } as Terminal;

      // Mock protocol with 3 instructions
      service.setMockProtocol('protocol_A', 3);

      const interval = await service.calculateQueryInterval(terminal);

      // 3 instructions * 2000ms base = 6000ms
      expect(interval).toBe(6000);
    });

    it('should apply correct base for terminals with many instructions', async () => {
      const terminal: Terminal = {
        Mac: 'AA:BB:CC:DD:EE:FF',
        ICCID: null,
        mountDevs: [
          {
            pid: 1,
            protocol: 'protocol_A',
          } as MountDevice,
        ],
      } as Terminal;

      // Mock protocol with 5 instructions
      service.setMockProtocol('protocol_A', 5);

      const interval = await service.calculateQueryInterval(terminal);

      // 5 instructions * 1000ms base = 5000ms
      expect(interval).toBe(5000);
    });

    it('should apply 2x base for ICCID terminals with many instructions', async () => {
      const terminal: Terminal = {
        Mac: 'AA:BB:CC:DD:EE:FF',
        ICCID: '1234567890',
        mountDevs: [
          {
            pid: 1,
            protocol: 'protocol_A',
          } as MountDevice,
        ],
      } as Terminal;

      // Mock protocol with 5 instructions
      service.setMockProtocol('protocol_A', 5);

      const interval = await service.calculateQueryInterval(terminal);

      // 5 instructions * 2000ms base = 10000ms
      expect(interval).toBe(10000);
    });
  });

  describe('Bug Fix 2: All Devices Instruction Count', () => {
    it('should sum instructions from all mounted devices (was only first device)', async () => {
      const terminal: Terminal = {
        Mac: 'AA:BB:CC:DD:EE:FF',
        ICCID: null,
        mountDevs: [
          { pid: 1, protocol: 'protocol_A' } as MountDevice,
          { pid: 2, protocol: 'protocol_B' } as MountDevice,
          { pid: 3, protocol: 'protocol_C' } as MountDevice,
        ],
      } as Terminal;

      // Mock protocols with different instruction counts
      service.setMockProtocol('protocol_A', 5); // 5 instructions
      service.setMockProtocol('protocol_B', 4); // 4 instructions
      service.setMockProtocol('protocol_C', 6); // 6 instructions

      const interval = await service.calculateQueryInterval(terminal);

      // (5 + 4 + 6) = 15 instructions * 1000ms base = 15000ms
      expect(interval).toBe(15000);
    });

    it('should handle multi-device terminals with ICCID', async () => {
      const terminal: Terminal = {
        Mac: 'AA:BB:CC:DD:EE:FF',
        ICCID: '1234567890',
        mountDevs: [
          { pid: 1, protocol: 'protocol_A' } as MountDevice,
          { pid: 2, protocol: 'protocol_B' } as MountDevice,
          { pid: 3, protocol: 'protocol_C' } as MountDevice,
        ],
      } as Terminal;

      // Mock protocols with different instruction counts
      service.setMockProtocol('protocol_A', 5);
      service.setMockProtocol('protocol_B', 4);
      service.setMockProtocol('protocol_C', 6);

      const interval = await service.calculateQueryInterval(terminal);

      // (5 + 4 + 6) = 15 instructions * 2000ms base = 30000ms
      expect(interval).toBe(30000);
    });

    it('should handle single device terminal correctly', async () => {
      const terminal: Terminal = {
        Mac: 'AA:BB:CC:DD:EE:FF',
        ICCID: '1234567890',
        mountDevs: [
          { pid: 1, protocol: 'single_protocol' } as MountDevice,
        ],
      } as Terminal;

      // Mock protocol with 5 instructions
      service.setMockProtocol('single_protocol', 5);

      const interval = await service.calculateQueryInterval(terminal);

      // 5 instructions * 2000ms base = 10000ms
      expect(interval).toBe(10000);
    });

    it('should handle terminals with missing protocol (defaults to 1 instruction)', async () => {
      const terminal: Terminal = {
        Mac: 'AA:BB:CC:DD:EE:FF',
        ICCID: null,
        mountDevs: [
          { pid: 1, protocol: 'missing_protocol' } as MountDevice,
        ],
      } as Terminal;

      // Don't set mock protocol - should default to 1 instruction

      const interval = await service.calculateQueryInterval(terminal);

      // 1 instruction * 1000ms base = 1000ms -> 5000ms minimum
      expect(interval).toBe(5000);
    });

    it('should handle empty mountDevs array', async () => {
      const terminal: Terminal = {
        Mac: 'AA:BB:CC:DD:EE:FF',
        ICCID: null,
        mountDevs: [],
      } as Terminal;

      const interval = await service.calculateQueryInterval(terminal);

      // No devices -> minimum 5000ms
      expect(interval).toBe(5000);
    });
  });

  describe('Bug Fix 3: Query Judgment Tolerance', () => {
    it('should NOT trigger query before exact interval (was Interval - 1000)', () => {
      const intervalMs = 10000; // 10 seconds
      const lastEmit = new Date(Date.now() - 9500); // 9.5 seconds ago

      const shouldSend = service.shouldSendQuery(lastEmit, intervalMs);

      // 9500ms < 10000ms -> should NOT send
      expect(shouldSend).toBe(false);
    });

    it('should trigger query after exact interval', () => {
      const intervalMs = 10000; // 10 seconds
      const lastEmit = new Date(Date.now() - 10500); // 10.5 seconds ago

      const shouldSend = service.shouldSendQuery(lastEmit, intervalMs);

      // 10500ms >= 10000ms -> should send
      expect(shouldSend).toBe(true);
    });

    it('should trigger query exactly at interval', () => {
      const intervalMs = 10000; // 10 seconds
      const lastEmit = new Date(Date.now() - 10000); // Exactly 10 seconds ago

      const shouldSend = service.shouldSendQuery(lastEmit, intervalMs);

      // 10000ms >= 10000ms -> should send
      expect(shouldSend).toBe(true);
    });

    it('should trigger query if no previous emission', () => {
      const intervalMs = 10000;
      const lastEmit = null; // No previous query

      const shouldSend = service.shouldSendQuery(lastEmit, intervalMs);

      // No previous query -> should send
      expect(shouldSend).toBe(true);
    });

    it('should NOT trigger query just before interval', () => {
      const intervalMs = 5000; // 5 seconds
      const lastEmit = new Date(Date.now() - 4999); // 4.999 seconds ago

      const shouldSend = service.shouldSendQuery(lastEmit, intervalMs);

      // 4999ms < 5000ms -> should NOT send
      expect(shouldSend).toBe(false);
    });

    it('should handle very short intervals', () => {
      const intervalMs = 1000; // 1 second
      const lastEmit = new Date(Date.now() - 1001); // 1.001 seconds ago

      const shouldSend = service.shouldSendQuery(lastEmit, intervalMs);

      // 1001ms >= 1000ms -> should send
      expect(shouldSend).toBe(true);
    });
  });

  describe('Integration: Combined Bug Fixes', () => {
    it('should calculate correct interval for typical single-device terminal', async () => {
      const terminal: Terminal = {
        Mac: 'AA:BB:CC:DD:EE:FF',
        ICCID: null,
        mountDevs: [
          { pid: 1, protocol: 'protocol_A' } as MountDevice,
        ],
      } as Terminal;

      service.setMockProtocol('protocol_A', 5);

      const interval = await service.calculateQueryInterval(terminal);

      // Before fix: 5 * 500 = 2500ms
      // After fix: 5 * 1000 = 5000ms
      // Improvement: 50% reduction in query frequency
      expect(interval).toBe(5000);
    });

    it('should calculate correct interval for typical multi-device terminal', async () => {
      const terminal: Terminal = {
        Mac: 'AA:BB:CC:DD:EE:FF',
        ICCID: '1234567890',
        mountDevs: [
          { pid: 1, protocol: 'protocol_A' } as MountDevice,
          { pid: 2, protocol: 'protocol_B' } as MountDevice,
          { pid: 3, protocol: 'protocol_C' } as MountDevice,
        ],
      } as Terminal;

      service.setMockProtocol('protocol_A', 5);
      service.setMockProtocol('protocol_B', 4);
      service.setMockProtocol('protocol_C', 6);

      const interval = await service.calculateQueryInterval(terminal);

      // Before fix: 5 * 1000 = 5000ms (only first device)
      // After fix: (5+4+6) * 2000 = 30000ms
      // Improvement: 83% reduction in query frequency (6x)
      expect(interval).toBe(30000);
    });

    it('should respect minimum interval of 5000ms', async () => {
      const terminal: Terminal = {
        Mac: 'AA:BB:CC:DD:EE:FF',
        ICCID: null,
        mountDevs: [
          { pid: 1, protocol: 'protocol_A' } as MountDevice,
        ],
      } as Terminal;

      service.setMockProtocol('protocol_A', 1); // 1 instruction only

      const interval = await service.calculateQueryInterval(terminal);

      // 1 * 1000 = 1000ms -> clamped to minimum 5000ms
      expect(interval).toBe(5000);
    });
  });

  describe('Aliyun IoT Card Flow Resource Optimization', () => {
    it('should apply flow resource multiplier when flow is low', async () => {
      const terminal: Terminal = {
        Mac: 'AA:BB:CC:DD:EE:FF',
        ICCID: '1234567890',
        iccidInfo: {
          resName: 'ali_1',
          flowResource: 256 * 1024, // 256KB (low)
        },
        mountDevs: [
          { pid: 1, protocol: 'protocol_A' } as MountDevice,
        ],
      } as Terminal;

      service.setMockProtocol('protocol_A', 3);

      const interval = await service.calculateQueryInterval(terminal);

      // Base: 2000ms
      // Multiplier: ((512*1024) / (256*1024)) * 2 = 2 * 2 = 4
      // Adjusted base: 2000 * 4 = 8000ms
      // Total: 3 instructions * 8000ms = 24000ms
      expect(interval).toBe(24000);
    });

    it('should NOT apply multiplier when flow resource is sufficient', async () => {
      const terminal: Terminal = {
        Mac: 'AA:BB:CC:DD:EE:FF',
        ICCID: '1234567890',
        iccidInfo: {
          resName: 'ali_1',
          flowResource: 1024 * 1024, // 1MB (sufficient)
        },
        mountDevs: [
          { pid: 1, protocol: 'protocol_A' } as MountDevice,
        ],
      } as Terminal;

      service.setMockProtocol('protocol_A', 3);

      const interval = await service.calculateQueryInterval(terminal);

      // Flow >= 512KB -> no multiplier
      // 3 instructions * 2000ms = 6000ms
      expect(interval).toBe(6000);
    });

    it('should NOT apply multiplier for non-ali_1 cards', async () => {
      const terminal: Terminal = {
        Mac: 'AA:BB:CC:DD:EE:FF',
        ICCID: '1234567890',
        iccidInfo: {
          resName: 'ali_2', // Different provider
          flowResource: 100 * 1024, // 100KB (very low)
        },
        mountDevs: [
          { pid: 1, protocol: 'protocol_A' } as MountDevice,
        ],
      } as Terminal;

      service.setMockProtocol('protocol_A', 3);

      const interval = await service.calculateQueryInterval(terminal);

      // Not ali_1 -> no multiplier
      // 3 instructions * 2000ms = 6000ms
      expect(interval).toBe(6000);
    });
  });

  describe('Edge Cases', () => {
    it('should handle terminal with no ICCID and no iccidInfo', async () => {
      const terminal: Terminal = {
        Mac: 'AA:BB:CC:DD:EE:FF',
        ICCID: null,
        iccidInfo: undefined,
        mountDevs: [
          { pid: 1, protocol: 'protocol_A' } as MountDevice,
        ],
      } as Terminal;

      service.setMockProtocol('protocol_A', 5);

      const interval = await service.calculateQueryInterval(terminal);

      // 5 * 1000 = 5000ms
      expect(interval).toBe(5000);
    });

    it('should handle very large instruction counts', async () => {
      const terminal: Terminal = {
        Mac: 'AA:BB:CC:DD:EE:FF',
        ICCID: null,
        mountDevs: [
          { pid: 1, protocol: 'protocol_A' } as MountDevice,
          { pid: 2, protocol: 'protocol_B' } as MountDevice,
        ],
      } as Terminal;

      service.setMockProtocol('protocol_A', 50);
      service.setMockProtocol('protocol_B', 50);

      const interval = await service.calculateQueryInterval(terminal);

      // (50 + 50) = 100 instructions * 1000ms = 100000ms (100 seconds)
      expect(interval).toBe(100000);
    });

    it('should handle query check with future timestamp (clock skew)', () => {
      const intervalMs = 10000;
      const lastEmit = new Date(Date.now() + 5000); // 5 seconds in the future

      const shouldSend = service.shouldSendQuery(lastEmit, intervalMs);

      // Elapsed would be negative -> should NOT send
      expect(shouldSend).toBe(false);
    });
  });
});
