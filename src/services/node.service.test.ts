import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mongodb } from '../database/mongodb';
import { nodeService, NodeService } from './node.service';

describe('NodeService', () => {
  beforeAll(async () => {
    await mongodb.connect();
    // 清理测试数据
    await mongodb.getCollection('node.clients').deleteMany({ Name: /^test_/ });
  });

  afterAll(async () => {
    // 清理测试数据
    await mongodb.getCollection('node.clients').deleteMany({ Name: /^test_/ });
    await mongodb.disconnect();
  });

  describe('getNodeByName', () => {
    test('should return null for non-existent node', async () => {
      const result = await nodeService.getNodeByName('non_existent_node');
      expect(result).toBeNull();
    });

    test('should return node when it exists', async () => {
      await nodeService.upsertNode({
        Name: 'test_node_001',
        IP: '192.168.1.100',
        Port: 8000,
        MaxConnections: 100,
        Connections: 0,
      });

      const result = await nodeService.getNodeByName('test_node_001');
      expect(result).toBeDefined();
      expect(result?.Name).toBe('test_node_001');
      expect(result?.IP).toBe('192.168.1.100');
      expect(result?.Port).toBe(8000);
    });
  });

  describe('getNodeByIP', () => {
    test('should return null for non-existent IP', async () => {
      const result = await nodeService.getNodeByIP('192.168.1.200');
      expect(result).toBeNull();
    });

    test('should return node when IP exists', async () => {
      await nodeService.upsertNode({
        Name: 'test_node_002',
        IP: '192.168.1.101',
        Port: 8001,
        MaxConnections: 100,
        Connections: 0,
      });

      const result = await nodeService.getNodeByIP('192.168.1.101');
      expect(result).toBeDefined();
      expect(result?.Name).toBe('test_node_002');
    });
  });

  describe('getAllNodes', () => {
    test('should return all nodes', async () => {
      await nodeService.upsertNode({
        Name: 'test_node_003',
        IP: '192.168.1.102',
        Port: 8002,
        MaxConnections: 100,
        Connections: 0,
      });

      await nodeService.upsertNode({
        Name: 'test_node_004',
        IP: '192.168.1.103',
        Port: 8003,
        MaxConnections: 100,
        Connections: 0,
      });

      const results = await nodeService.getAllNodes();
      const testNodes = results.filter(n => n.Name.startsWith('test_'));

      expect(testNodes.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('upsertNode', () => {
    test('should create new node', async () => {
      const result = await nodeService.upsertNode({
        Name: 'test_node_005',
        IP: '192.168.1.104',
        Port: 8004,
        MaxConnections: 50,
        Connections: 0,
      });

      expect(result).toBe(true);

      const saved = await nodeService.getNodeByName('test_node_005');
      expect(saved?.MaxConnections).toBe(50);
    });

    test('should update existing node', async () => {
      await nodeService.upsertNode({
        Name: 'test_node_006',
        IP: '192.168.1.105',
        Port: 8005,
        MaxConnections: 100,
        Connections: 0,
      });

      await nodeService.upsertNode({
        Name: 'test_node_006',
        IP: '192.168.1.105',
        Port: 9000,
        MaxConnections: 200,
        Connections: 5,
      });

      const updated = await nodeService.getNodeByName('test_node_006');
      expect(updated?.Port).toBe(9000);
      expect(updated?.MaxConnections).toBe(200);
      expect(updated?.Connections).toBe(5);
    });

    test('should throw error for missing Name', async () => {
      expect(
        async () =>
          await nodeService.upsertNode({
            IP: '192.168.1.106',
            Port: 8006,
          } as any)
      ).toThrow();
    });
  });

  describe('deleteNode', () => {
    test('should delete existing node', async () => {
      await nodeService.upsertNode({
        Name: 'test_node_007',
        IP: '192.168.1.107',
        Port: 8007,
        MaxConnections: 100,
        Connections: 0,
      });

      const deleted = await nodeService.deleteNode('test_node_007');
      expect(deleted).toBe(true);

      const result = await nodeService.getNodeByName('test_node_007');
      expect(result).toBeNull();
    });

    test('should return false for non-existent node', async () => {
      const deleted = await nodeService.deleteNode('non_existent_node');
      expect(deleted).toBe(false);
    });
  });

  describe('updateConnections', () => {
    test('should update connection count', async () => {
      await nodeService.upsertNode({
        Name: 'test_node_008',
        IP: '192.168.1.108',
        Port: 8008,
        MaxConnections: 100,
        Connections: 0,
      });

      const updated = await nodeService.updateConnections('test_node_008', 10);
      expect(updated).toBe(true);

      const node = await nodeService.getNodeByName('test_node_008');
      expect(node?.Connections).toBe(10);
    });
  });

  describe('incrementConnections', () => {
    test('should increment connection count', async () => {
      await nodeService.upsertNode({
        Name: 'test_node_009',
        IP: '192.168.1.109',
        Port: 8009,
        MaxConnections: 100,
        Connections: 5,
      });

      const newCount = await nodeService.incrementConnections('test_node_009');
      expect(newCount).toBe(6);

      const node = await nodeService.getNodeByName('test_node_009');
      expect(node?.Connections).toBe(6);
    });
  });

  describe('decrementConnections', () => {
    test('should decrement connection count', async () => {
      await nodeService.upsertNode({
        Name: 'test_node_010',
        IP: '192.168.1.110',
        Port: 8010,
        MaxConnections: 100,
        Connections: 5,
      });

      const newCount = await nodeService.decrementConnections('test_node_010');
      expect(newCount).toBe(4);

      const node = await nodeService.getNodeByName('test_node_010');
      expect(node?.Connections).toBe(4);
    });
  });
});
