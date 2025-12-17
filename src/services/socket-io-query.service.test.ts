/**
 * Socket.IO Query Scheduler 测试
 * 测试查询调度、协议缓存、间隔计算等功能
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { socketIoService } from './socket-io.service';
import { protocolService } from './protocol.service';
import { terminalService } from './terminal.service';
import type { Terminal } from '../types/entities/terminal.entity';
import type { Protocol } from './protocol.service';

describe('Socket.IO Query Scheduler', () => {
  // 保存原始方法
  let originalGetProtocol: typeof protocolService.getProtocol;
  let originalGetTerminal: typeof terminalService.getTerminal;

  beforeEach(() => {
    // 保存原始方法
    originalGetProtocol = protocolService.getProtocol;
    originalGetTerminal = terminalService.getTerminal;
  });

  afterEach(() => {
    // 恢复原始方法
    protocolService.getProtocol = originalGetProtocol;
    terminalService.getTerminal = originalGetTerminal;

    // 清理服务
    socketIoService.cleanup();
  });

  describe('协议缓存管理', () => {
    test('应该能缓存协议', async () => {
      const testProtocol: Protocol = {
        Type: 485,
        ProtocolType: 'modbus',
        Protocol: 'test-protocol',
        instruct: [
          {
            name: '读取温度',
            resultType: 'hex',
            shift: false,
          },
          {
            name: '读取湿度',
            resultType: 'hex',
            shift: false,
          },
        ],
      };

      // Mock getProtocol
      protocolService.getProtocol = mock(async (protocol: string) => {
        if (protocol === 'test-protocol') {
          return testProtocol;
        }
        return null;
      });

      // 第一次调用应该从数据库加载
      const protocol1 = await (socketIoService as any).cacheProtocol('test-protocol');
      expect(protocol1).toEqual(testProtocol);
      expect(protocolService.getProtocol).toHaveBeenCalledTimes(1);

      // 第二次调用应该从缓存获取
      const protocol2 = await (socketIoService as any).cacheProtocol('test-protocol');
      expect(protocol2).toEqual(testProtocol);
      expect(protocolService.getProtocol).toHaveBeenCalledTimes(1); // 仍然是 1 次
    });

    test('应该能更新协议缓存', () => {
      const testProtocol: Protocol = {
        Type: 485,
        ProtocolType: 'modbus',
        Protocol: 'test-protocol-update',
        instruct: [
          {
            name: '测试指令',
            resultType: 'hex',
            shift: false,
          },
        ],
      };

      // 更新缓存
      socketIoService.UpdateCacheProtocol(testProtocol);

      // 验证缓存已更新
      const cached = (socketIoService as any).proMap.get('test-protocol-update');
      expect(cached).toEqual(testProtocol);
    });
  });

  describe('查询间隔计算', () => {
    test('应该为普通终端计算基础间隔（500ms）', async () => {
      const terminal: Terminal = {
        DevMac: 'AA:BB:CC:DD:EE:FF',
        name: 'Test Terminal',
        ip: '192.168.1.100',
        port: 8080,
        jw: '116.397128,39.916527',
        uart: 'UART1',
        AT: false,
        ICCID: '', // 无 ICCID
        connecting: false,
        lock: false,
        PID: 'test',
        ver: '1.0',
        Gver: '1.0',
        iotStat: 'active',
        signal: 90,
        online: true,
        disable: false,
        uptime: new Date(),
        mountNode: 'TestNode',
        mountDevs: [
          {
            Type: 'sensor',
            mountDev: 'sensor1',
            protocol: 'test-protocol',
            pid: 1,
            online: true,
            minQueryLimit: 0,
          },
        ],
        iccidInfo: {
          statu: true,
          expireDate: '2025-12-31',
          resName: 'test',
          flowUsed: 100,
          restOfFlow: 900,
          flowResource: 1000,
          version: '1.0',
          IsAutoRecharge: false,
          uptime: Date.now(),
        },
        share: false,
        remark: '',
        ownerId: 'test-owner',
      };

      // Mock 协议
      protocolService.getProtocol = mock(async () => ({
        Type: 485,
        ProtocolType: 'modbus',
        Protocol: 'test-protocol',
        instruct: [
          { name: '指令1', resultType: 'hex', shift: false },
          { name: '指令2', resultType: 'hex', shift: false },
        ],
      }));

      const interval = await (socketIoService as any).calculateQueryInterval(terminal);

      // 无 ICCID：base = 500ms，2 条指令，interval = 2 * 500 = 1000ms < 5000ms，返回 5000ms
      expect(interval).toBe(5000);
    });

    test('应该为 4G 终端计算间隔（1000ms base）', async () => {
      const terminal: Terminal = {
        DevMac: 'AA:BB:CC:DD:EE:FF',
        name: 'Test Terminal',
        ip: '192.168.1.100',
        port: 8080,
        jw: '116.397128,39.916527',
        uart: 'UART1',
        AT: true,
        ICCID: '1234567890', // 有 ICCID
        connecting: false,
        lock: false,
        PID: 'test',
        ver: '1.0',
        Gver: '1.0',
        iotStat: 'active',
        signal: 90,
        online: true,
        disable: false,
        uptime: new Date(),
        mountNode: 'TestNode',
        mountDevs: [
          {
            Type: 'sensor',
            mountDev: 'sensor1',
            protocol: 'test-protocol',
            pid: 1,
            online: true,
            minQueryLimit: 0,
          },
        ],
        iccidInfo: {
          statu: true,
          expireDate: '2025-12-31',
          resName: 'test',
          flowUsed: 100,
          restOfFlow: 900,
          flowResource: 1000 * 1024, // 1GB
          version: '1.0',
          IsAutoRecharge: false,
          uptime: Date.now(),
        },
        share: false,
        remark: '',
        ownerId: 'test-owner',
      };

      // Mock 协议（6 条指令）
      protocolService.getProtocol = mock(async () => ({
        Type: 485,
        ProtocolType: 'modbus',
        Protocol: 'test-protocol',
        instruct: Array(6)
          .fill(null)
          .map((_, i) => ({
            name: `指令${i + 1}`,
            resultType: 'hex',
            shift: false,
          })),
      }));

      const interval = await (socketIoService as any).calculateQueryInterval(terminal);

      // 有 ICCID：base = 1000ms，6 条指令，interval = 6 * 1000 = 6000ms > 5000ms
      expect(interval).toBe(6000);
    });

    test('应该为低流量 IoT 卡增加间隔', async () => {
      const terminal: Terminal = {
        DevMac: 'AA:BB:CC:DD:EE:FF',
        name: 'Test Terminal',
        ip: '192.168.1.100',
        port: 8080,
        jw: '116.397128,39.916527',
        uart: 'UART1',
        AT: true,
        ICCID: '1234567890',
        connecting: false,
        lock: false,
        PID: 'test',
        ver: '1.0',
        Gver: '1.0',
        iotStat: 'active',
        signal: 90,
        online: true,
        disable: false,
        uptime: new Date(),
        mountNode: 'TestNode',
        mountDevs: [
          {
            Type: 'sensor',
            mountDev: 'sensor1',
            protocol: 'test-protocol',
            pid: 1,
            online: true,
            minQueryLimit: 0,
          },
        ],
        iccidInfo: {
          statu: true,
          expireDate: '2025-12-31',
          resName: 'ali_1', // 阿里云 IoT 卡
          flowUsed: 100,
          restOfFlow: 100,
          flowResource: 200 * 1024, // 200MB < 512MB
          version: '1.0',
          IsAutoRecharge: false,
          uptime: Date.now(),
        },
        share: false,
        remark: '',
        ownerId: 'test-owner',
      };

      // Mock 协议
      protocolService.getProtocol = mock(async () => ({
        Type: 485,
        ProtocolType: 'modbus',
        Protocol: 'test-protocol',
        instruct: [{ name: '指令1', resultType: 'hex', shift: false }],
      }));

      const interval = await (socketIoService as any).calculateQueryInterval(terminal);

      // base = 1000 * ((512 * 1024) / (200 * 1024)) * 2 = 1000 * 2.56 * 2 = 5120ms
      // interval = 1 * 5120 = 5120ms
      expect(interval).toBeGreaterThan(5000);
    });
  });

  describe('终端缓存管理', () => {
    test('应该能设置终端挂载设备缓存', async () => {
      const terminal: Terminal = {
        DevMac: 'AA:BB:CC:DD:EE:FF',
        name: 'Test Terminal',
        ip: '192.168.1.100',
        port: 8080,
        jw: '116.397128,39.916527',
        uart: 'UART1',
        AT: false,
        ICCID: '',
        connecting: false,
        lock: false,
        PID: 'test',
        ver: '1.0',
        Gver: '1.0',
        iotStat: 'active',
        signal: 90,
        online: true,
        disable: false,
        uptime: new Date(),
        mountNode: 'TestNode',
        mountDevs: [
          {
            Type: 'sensor',
            mountDev: 'sensor1',
            protocol: 'test-protocol',
            pid: 1,
            online: true,
            minQueryLimit: 3000,
          },
          {
            Type: 'sensor',
            mountDev: 'sensor2',
            protocol: 'test-protocol',
            pid: 2,
            online: true,
            minQueryLimit: 2000,
          },
        ],
        iccidInfo: {
          statu: true,
          expireDate: '2025-12-31',
          resName: 'test',
          flowUsed: 100,
          restOfFlow: 900,
          flowResource: 1000,
          version: '1.0',
          IsAutoRecharge: false,
          uptime: Date.now(),
        },
        share: false,
        remark: '',
        ownerId: 'test-owner',
      };

      // Mock
      terminalService.getTerminal = mock(async () => terminal);
      protocolService.getProtocol = mock(async () => ({
        Type: 485,
        ProtocolType: 'modbus',
        Protocol: 'test-protocol',
        instruct: [{ name: '指令1', resultType: 'hex', shift: false }],
      }));

      // 设置缓存
      await socketIoService.setTerminalMountDevCache('AA:BB:CC:DD:EE:FF');

      // 验证缓存
      const cache1 = (socketIoService as any).queryCache.get('AA:BB:CC:DD:EE:FF1');
      expect(cache1).toBeDefined();
      expect(cache1.TerminalMac).toBe('AA:BB:CC:DD:EE:FF');
      expect(cache1.pid).toBe(1);
      expect(cache1.devs).toBe(2); // 2 个设备
      expect(cache1.Interval).toBeGreaterThanOrEqual(3000); // 考虑 minQueryLimit

      const cache2 = (socketIoService as any).queryCache.get('AA:BB:CC:DD:EE:FF2');
      expect(cache2).toBeDefined();
      expect(cache2.pid).toBe(2);
    });

    test('应该能删除终端挂载设备缓存', async () => {
      const terminal: Terminal = {
        DevMac: 'AA:BB:CC:DD:EE:FF',
        name: 'Test Terminal',
        ip: '192.168.1.100',
        port: 8080,
        jw: '116.397128,39.916527',
        uart: 'UART1',
        AT: false,
        ICCID: '',
        connecting: false,
        lock: false,
        PID: 'test',
        ver: '1.0',
        Gver: '1.0',
        iotStat: 'active',
        signal: 90,
        online: true,
        disable: false,
        uptime: new Date(),
        mountNode: 'TestNode',
        mountDevs: [
          {
            Type: 'sensor',
            mountDev: 'sensor1',
            protocol: 'test-protocol',
            pid: 1,
            online: true,
            minQueryLimit: 0,
          },
        ],
        iccidInfo: {
          statu: true,
          expireDate: '2025-12-31',
          resName: 'test',
          flowUsed: 100,
          restOfFlow: 900,
          flowResource: 1000,
          version: '1.0',
          IsAutoRecharge: false,
          uptime: Date.now(),
        },
        share: false,
        remark: '',
        ownerId: 'test-owner',
      };

      // Mock
      terminalService.getTerminal = mock(async () => terminal);
      protocolService.getProtocol = mock(async () => ({
        Type: 485,
        ProtocolType: 'modbus',
        Protocol: 'test-protocol',
        instruct: [{ name: '指令1', resultType: 'hex', shift: false }],
      }));

      // 设置缓存
      await socketIoService.setTerminalMountDevCache('AA:BB:CC:DD:EE:FF');

      // 验证缓存存在
      const cacheBefore = (socketIoService as any).queryCache.get('AA:BB:CC:DD:EE:FF1');
      expect(cacheBefore).toBeDefined();

      // 删除缓存
      socketIoService.delTerminalMountDevCache('AA:BB:CC:DD:EE:FF', 1);

      // 验证缓存已删除
      const cacheAfter = (socketIoService as any).queryCache.get('AA:BB:CC:DD:EE:FF1');
      expect(cacheAfter).toBeUndefined();
    });
  });
});
