/**
 * Terminal Entity Mock Helper
 * 用于生成测试用的 Terminal 实体数据
 */

import type { Terminal as TerminalData } from '../../src/types/entities/terminal.entity';
import { TerminalEntity } from '../../src/domain/terminal.entity';

/**
 * 创建标准协议的 mock 终端数据
 */
export function createStandardTerminalData(overrides?: Partial<TerminalData>): TerminalData {
  return {
    DevMac: 'AA:BB:CC:DD:EE:FF',
    name: 'Test Terminal',
    mountNode: 'node-test-01',
    online: true,
    uptime: new Date(),
    PID: 'standard',
    mountDevs: [
      {
        pid: 1,
        mountDev: 'device-001',
        protocol: 'modbus',
        bindDev: 'AA:BB:CC:DD:EE:FF',
        online: true,
      },
    ],
    ...overrides,
  } as TerminalData;
}

/**
 * 创建 pesiv 协议的 mock 终端数据
 */
export function createPesivTerminalData(overrides?: Partial<TerminalData>): TerminalData {
  return {
    DevMac: 'AA:BB:CC:DD:EE:11',
    name: 'Pesiv Terminal',
    mountNode: 'node-test-02',
    online: true,
    uptime: new Date(),
    PID: 'pesiv', // pesiv 协议标识
    mountDevs: [
      {
        pid: 1,
        mountDev: 'device-pesiv-001',
        protocol: 'pesiv',
        bindDev: 'AA:BB:CC:DD:EE:11',
        online: true,
      },
    ],
    ...overrides,
  } as TerminalData;
}

/**
 * 创建混合协议的 mock 终端数据（终端本身是标准协议，但挂载了 pesiv 设备）
 */
export function createMixedProtocolTerminalData(
  overrides?: Partial<TerminalData>
): TerminalData {
  return {
    DevMac: 'AA:BB:CC:DD:EE:22',
    name: 'Mixed Protocol Terminal',
    mountNode: 'node-test-03',
    online: true,
    uptime: new Date(),
    PID: 'standard',
    mountDevs: [
      {
        pid: 1,
        mountDev: 'device-standard-001',
        protocol: 'modbus',
        bindDev: 'AA:BB:CC:DD:EE:22',
        online: true,
      },
      {
        pid: 2,
        mountDev: 'device-pesiv-002',
        protocol: 'pesiv', // 挂载的设备包含 pesiv 协议
        bindDev: 'AA:BB:CC:DD:EE:22',
        online: true,
      },
    ],
    ...overrides,
  } as TerminalData;
}

/**
 * 创建离线终端数据
 */
export function createOfflineTerminalData(overrides?: Partial<TerminalData>): TerminalData {
  return createStandardTerminalData({
    online: false,
    mountDevs: [
      {
        pid: 1,
        mountDev: 'device-offline-001',
        protocol: 'modbus',
        bindDev: 'AA:BB:CC:DD:EE:FF',
        online: false,
      },
    ],
    ...overrides,
  });
}

/**
 * 创建 TerminalEntity 实例
 */
export function createTerminalEntity(data?: Partial<TerminalData>): TerminalEntity {
  const terminalData = createStandardTerminalData(data);
  return new TerminalEntity(terminalData);
}

/**
 * 创建 pesiv 协议的 TerminalEntity 实例
 */
export function createPesivTerminalEntity(data?: Partial<TerminalData>): TerminalEntity {
  const terminalData = createPesivTerminalData(data);
  return new TerminalEntity(terminalData);
}

/**
 * 创建离线 TerminalEntity 实例
 */
export function createOfflineTerminalEntity(data?: Partial<TerminalData>): TerminalEntity {
  const terminalData = createOfflineTerminalData(data);
  return new TerminalEntity(terminalData);
}

/**
 * Mock TerminalRepository
 */
export class MockTerminalRepository {
  private mockData = new Map<string, TerminalEntity>();

  /**
   * 添加 mock 数据
   */
  addMockData(mac: string, entity: TerminalEntity): void {
    this.mockData.set(mac, entity);
  }

  /**
   * 清除所有 mock 数据
   */
  clearMockData(): void {
    this.mockData.clear();
  }

  /**
   * 模拟 findOnlineTerminals
   */
  async findOnlineTerminals(): Promise<TerminalEntity[]> {
    return Array.from(this.mockData.values()).filter((entity) => entity.online);
  }

  /**
   * 模拟 findByMac
   */
  async findByMac(mac: string): Promise<TerminalEntity | null> {
    return this.mockData.get(mac) || null;
  }

  /**
   * 模拟 findByNode
   */
  async findByNode(nodeName: string): Promise<TerminalEntity[]> {
    return Array.from(this.mockData.values()).filter(
      (entity) => entity.mountNode === nodeName
    );
  }

  /**
   * 模拟 findByMacs
   */
  async findByMacs(macs: string[]): Promise<TerminalEntity[]> {
    return macs.map((mac) => this.mockData.get(mac)).filter((e) => e !== undefined);
  }
}
