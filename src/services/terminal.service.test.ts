import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mongodb } from '../database/mongodb';
import { terminalService } from './terminal.service';
import type { Terminal, MountDevice } from '../types/entities';

describe('TerminalService', () => {
  const testMac = 'AA:BB:CC:DD:EE:FF';

  beforeAll(async () => {
    await mongodb.connect();
    // 清理测试数据
    await mongodb.getCollection('terminals').deleteMany({ DevMac: /^test_/ });
    await mongodb.getCollection('terminals').deleteOne({ DevMac: testMac });
  });

  afterAll(async () => {
    // 清理测试数据
    await mongodb.getCollection('terminals').deleteMany({ DevMac: /^test_/ });
    await mongodb.getCollection('terminals').deleteOne({ DevMac: testMac });
    await mongodb.disconnect();
  });

  describe('getTerminal', () => {
    test('should return null for non-existent terminal', async () => {
      const result = await terminalService.getTerminal('non_existent_mac');
      expect(result).toBeNull();
    });

    test('should return terminal when it exists', async () => {
      const testTerminal: Partial<Terminal> & { DevMac: string } = {
        DevMac: 'test_terminal_001',
        name: 'Test Terminal',
        mountNode: 'node1',
        online: true,
        mountDevs: [
          {
            pid: 1,
            protocol: 'modbus',
            Type: 'sensor',
            mountDev: 'test_device',
            minQueryLimit: 5000,
            online: true,
          },
        ],
      };

      await terminalService.upsertTerminal(testTerminal);
      const result = await terminalService.getTerminal('test_terminal_001');

      expect(result).toBeDefined();
      expect(result?.DevMac).toBe('test_terminal_001');
      expect(result?.name).toBe('Test Terminal');
    });

    test('should update pesiv protocol device online status', async () => {
      const terminal: Partial<Terminal> & { DevMac: string } = {
        DevMac: 'test_pesiv_terminal',
        name: 'Pesiv Test',
        mountNode: 'node1',
        online: true,
        mountDevs: [
          {
            pid: 1,
            protocol: 'pesiv',
            Type: 'device',
            mountDev: 'pesiv_device',
            minQueryLimit: 5000,
            online: false,
          },
        ],
      };

      await terminalService.upsertTerminal(terminal);
      const result = await terminalService.getTerminal('test_pesiv_terminal');

      // pesiv 协议设备应该被设置为在线
      expect(result?.mountDevs?.[0]?.online).toBe(true);
    });
  });

  describe('getTerminals', () => {
    test('should return multiple terminals', async () => {
      await terminalService.upsertTerminal({
        DevMac: 'test_multi_1',
        name: 'Multi 1',
        mountNode: 'node1',
        online: true,
      });

      await terminalService.upsertTerminal({
        DevMac: 'test_multi_2',
        name: 'Multi 2',
        mountNode: 'node1',
        online: false,
      });

      const results = await terminalService.getTerminals([
        'test_multi_1',
        'test_multi_2',
      ]);

      expect(results).toHaveLength(2);
    });
  });

  describe('getMountDevice', () => {
    test('should return mount device when exists', async () => {
      const mountDevs: MountDevice[] = [
        {
          pid: 1,
          protocol: 'modbus',
          Type: 'sensor',
          mountDev: 'sensor_001',
          minQueryLimit: 5000,
        },
        {
          pid: 2,
          protocol: 'dlt645',
          Type: 'meter',
          mountDev: 'meter_001',
          minQueryLimit: 5000,
        },
      ];

      await terminalService.upsertTerminal({
        DevMac: 'test_mount_terminal',
        name: 'Mount Test',
        mountNode: 'node1',
        online: true,
        mountDevs,
      });

      const result = await terminalService.getMountDevice(
        'test_mount_terminal',
        2
      );

      expect(result).toBeDefined();
      expect(result?.pid).toBe(2);
      expect(result?.protocol).toBe('dlt645');
    });

    test('should return undefined for non-existent mount device', async () => {
      const result = await terminalService.getMountDevice(
        'test_mount_terminal',
        999
      );
      expect(result).toBeUndefined();
    });
  });

  describe('updateOnlineStatus', () => {
    test('should update terminal online status', async () => {
      await terminalService.upsertTerminal({
        DevMac: 'test_online_terminal',
        name: 'Online Test',
        mountNode: 'node1',
        online: false,
      });

      const updated = await terminalService.updateOnlineStatus(
        'test_online_terminal',
        true
      );
      expect(updated).toBe(true);

      const terminal = await terminalService.getTerminal(
        'test_online_terminal'
      );
      expect(terminal?.online).toBe(true);
    });
  });

  describe('updateMountDeviceOnlineStatus', () => {
    test('should update mount device online status', async () => {
      await terminalService.upsertTerminal({
        DevMac: 'test_mount_status',
        name: 'Mount Status Test',
        mountNode: 'node1',
        online: true,
        mountDevs: [
          {
            pid: 1,
            protocol: 'modbus',
            Type: 'sensor',
            mountDev: 'test_device',
            minQueryLimit: 5000,
            online: false,
          },
        ],
      });

      const updated = await terminalService.updateMountDeviceOnlineStatus(
        'test_mount_status',
        1,
        true
      );
      expect(updated).toBe(true);

      const device = await terminalService.getMountDevice('test_mount_status', 1);
      expect(device?.online).toBe(true);
    });
  });

  describe('getOnlineTerminals', () => {
    test('should return only online terminals', async () => {
      await terminalService.upsertTerminal({
        DevMac: 'test_online_1',
        name: 'Online 1',
        mountNode: 'node1',
        online: true,
      });

      await terminalService.upsertTerminal({
        DevMac: 'test_offline_1',
        name: 'Offline 1',
        mountNode: 'node1',
        online: false,
      });

      const onlineTerminals = await terminalService.getOnlineTerminals();

      // 应该至少包含我们创建的在线终端
      const testOnline = onlineTerminals.find(t => t.DevMac === 'test_online_1');
      expect(testOnline).toBeDefined();

      // 不应该包含离线终端
      const testOffline = onlineTerminals.find(
        t => t.DevMac === 'test_offline_1'
      );
      expect(testOffline).toBeUndefined();
    });
  });

  describe('upsertTerminal', () => {
    test('should create new terminal', async () => {
      const newTerminal: Partial<Terminal> & { DevMac: string } = {
        DevMac: 'test_new_terminal',
        name: 'New Terminal',
        mountNode: 'node1',
        online: true,
      };

      const result = await terminalService.upsertTerminal(newTerminal);
      expect(result).toBe(true);

      const saved = await terminalService.getTerminal('test_new_terminal');
      expect(saved?.name).toBe('New Terminal');
    });

    test('should update existing terminal', async () => {
      await terminalService.upsertTerminal({
        DevMac: 'test_update_terminal',
        name: 'Original Name',
        mountNode: 'node1',
        online: false,
      });

      await terminalService.upsertTerminal({
        DevMac: 'test_update_terminal',
        name: 'Updated Name',
        online: true,
      });

      const updated = await terminalService.getTerminal(
        'test_update_terminal'
      );
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.online).toBe(true);
    });

    test('should throw error for missing DevMac', async () => {
      expect(
        async () =>
          await terminalService.upsertTerminal({
            name: 'No MAC',
          } as Terminal)
      ).toThrow();
    });
  });
});
