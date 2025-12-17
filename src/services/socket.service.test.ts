import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mongodb } from '../database/mongodb';
import { socketService } from './socket.service';
import { nodeService } from './node.service';
import { createServer } from 'http';

describe('SocketService', () => {
  let httpServer: ReturnType<typeof createServer>;

  beforeAll(async () => {
    await mongodb.connect();

    // 创建测试用的 HTTP 服务器
    httpServer = createServer();

    // 清理测试数据
    await mongodb.getCollection('node.clients').deleteMany({ Name: /^test_/ });

    // 创建测试节点
    await nodeService.upsertNode({
      Name: 'test_socket_node',
      IP: '127.0.0.1',
      Port: 8000,
      MaxConnections: 100,
      Connections: 0,
    });
  });

  afterAll(async () => {
    // 清理
    await socketService.close();
    await mongodb.getCollection('node.clients').deleteMany({ Name: /^test_/ });
    await mongodb.disconnect();

    if (httpServer) {
      httpServer.close();
    }
  });

  describe('initialize', () => {
    test('should initialize Socket.IO server', () => {
      // 初始化 Socket.IO
      socketService.initialize(httpServer);

      // 验证初始化成功
      expect(socketService).toBeDefined();
    });
  });

  describe('getOnlineNodes', () => {
    test('should return empty array when no nodes are connected', () => {
      const onlineNodes = socketService.getOnlineNodes();
      expect(onlineNodes).toBeInstanceOf(Array);
      expect(onlineNodes.length).toBe(0);
    });
  });

  describe('isNodeOnline', () => {
    test('should return false for non-connected node', () => {
      const isOnline = socketService.isNodeOnline('test_socket_node');
      expect(isOnline).toBe(false);
    });
  });

  describe('getNodeContext', () => {
    test('should return undefined for non-connected node', () => {
      const context = socketService.getNodeContext('test_socket_node');
      expect(context).toBeUndefined();
    });
  });

  describe('sendInstructQuery', () => {
    test('should reject when node is not connected', async () => {
      const query = {
        DevMac: 'AA:BB:CC:DD:EE:FF',
        protocol: 'modbus',
        pid: 1,
        instruct: 'read',
      };

      try {
        await socketService.sendInstructQuery('non_existent_node', query, 1000);
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain('未连接');
      }
    });
  });

  describe('sendDTUOperation', () => {
    test('should reject when node is not connected', async () => {
      const operation = {
        DevMac: 'AA:BB:CC:DD:EE:FF',
        events: 'restart',
        content: '',
      };

      try {
        await socketService.sendDTUOperation('non_existent_node', operation, 1000);
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain('未连接');
      }
    });
  });

  describe('close', () => {
    test('should close Socket.IO server gracefully', async () => {
      await socketService.close();

      const onlineNodes = socketService.getOnlineNodes();
      expect(onlineNodes.length).toBe(0);
    });
  });
});
