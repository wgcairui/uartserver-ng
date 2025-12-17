/**
 * Socket.IO Service 单元测试
 * 优化版本 - 解决超时问题，提高测试速度
 */

import { describe, test, expect, beforeEach, afterEach, mock, beforeAll, afterAll } from 'bun:test';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { socketIoService } from './socket-io.service';
import { nodeService } from './node.service';
import { terminalService } from './terminal.service';
import type { RegisterNodeResponse } from '../types/socket-events';

// 配置测试超时
const TEST_TIMEOUT = 10000; // 10s per test
const CLEANUP_WAIT = 200; // 清理等待时间

describe('SocketIoService', () => {
  let httpServer: ReturnType<typeof createServer>;
  let io: SocketIOServer;
  let clientSockets: ClientSocket[] = []; // 追踪所有客户端
  const TEST_PORT = 9999;
  const SERVER_URL = `http://localhost:${TEST_PORT}`;

  // 保存原始方法
  let originalCreateOrUpdateNode: typeof nodeService.createOrUpdateNode;
  let originalGetTerminal: typeof terminalService.getTerminal;
  let originalUpdateOnlineStatus: typeof terminalService.updateOnlineStatus;

  beforeAll(() => {
    // 保存原始方法
    originalCreateOrUpdateNode = nodeService.createOrUpdateNode;
    originalGetTerminal = terminalService.getTerminal;
    originalUpdateOnlineStatus = terminalService.updateOnlineStatus;
  });

  afterAll(() => {
    // 恢复原始方法
    nodeService.createOrUpdateNode = originalCreateOrUpdateNode;
    terminalService.getTerminal = originalGetTerminal;
    terminalService.updateOnlineStatus = originalUpdateOnlineStatus;
  });

  beforeEach(async () => {
    clientSockets = []; // 重置客户端列表

    // Mock 数据库操作（默认成功）
    nodeService.createOrUpdateNode = mock(async (node: any) => {
      return {
        _id: 'test-id',
        ...node,
      };
    });

    terminalService.getTerminal = mock(async (mac: string) => {
      return {
        DevMac: mac,
        name: 'Test Terminal',
        mountNode: 'TestNode',
        online: true,
        mountDevs: [],
        ip: '192.168.1.1',
        port: 8080,
        jw: '116.397128,39.916527',
        uart: 'UART1',
        AT: true,
        ICCID: '1234567890',
        connecting: false,
        lock: false,
        PID: 'test-pid',
        ver: '1.0',
        Gver: '1.0',
        iotStat: 'active',
        signal: 90,
        disable: false,
        uptime: new Date(),
        share: false,
        remark: '',
        ownerId: 'test-owner',
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
      };
    });

    terminalService.updateOnlineStatus = mock(async () => true);

    // 创建 HTTP 服务器和 Socket.IO 服务器
    httpServer = createServer();
    io = new SocketIOServer(httpServer, {
      cors: { origin: '*' },
      transports: ['websocket'],
      pingTimeout: 2000,
      pingInterval: 1000,
    });

    // 启动服务器
    await new Promise<void>((resolve) => {
      httpServer.listen(TEST_PORT, resolve);
    });

    // 初始化 socketIoService
    socketIoService.initialize(io);
  });

  afterEach(async () => {
    // 1. 先断开所有客户端（最重要）
    const disconnectPromises = clientSockets.map(
      (client) =>
        new Promise<void>((resolve) => {
          if (client.connected) {
            client.once('disconnect', () => resolve());
            client.disconnect();
            // 添加超时保护
            setTimeout(() => resolve(), 500);
          } else {
            resolve();
          }
        })
    );

    await Promise.all(disconnectPromises);

    // 2. 清理 socketIoService
    socketIoService.cleanup();

    // 3. 关闭 Socket.IO 服务器
    await new Promise<void>((resolve) => {
      io.close(() => resolve());
      // 添加超时保护
      setTimeout(() => resolve(), 500);
    });

    // 4. 关闭 HTTP 服务器
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
      // 添加超时保护
      setTimeout(() => resolve(), 500);
    });

    // 5. 短暂等待确保清理完成
    await new Promise((resolve) => setTimeout(resolve, CLEANUP_WAIT));
  });

  /**
   * 辅助函数：创建并连接客户端
   */
  async function createClient(auth?: any): Promise<ClientSocket> {
    const client = ioClient(`${SERVER_URL}/node`, {
      transports: ['websocket'],
      auth,
      reconnection: false, // 禁用重连，加快测试
    });

    clientSockets.push(client); // 追踪客户端

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 2000);

      client.on('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      client.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    return client;
  }

  describe('连接和认证', () => {
    test(
      '应该允许开发环境下的连接（无需 token）',
      async () => {
        const client = await createClient();
        expect(client.connected).toBe(true);
      },
      TEST_TIMEOUT
    );

    test(
      '应该在提供有效 token 时允许连接',
      async () => {
        const client = await createClient({ token: 'test-token' });
        expect(client.connected).toBe(true);
      },
      TEST_TIMEOUT
    );
  });

  describe('Node 注册', () => {
    test(
      '应该成功注册新的 Node',
      async () => {
        const client = await createClient();

        const nodeData = {
          Name: 'TestNode',
          IP: '192.168.1.100',
          Port: 8080,
          MaxConnections: 100,
        };

        const response = await new Promise<RegisterNodeResponse>((resolve) => {
          client.emit('RegisterNode', nodeData, resolve);
        });

        expect(response.success).toBe(true);
        expect(response.node).toBeDefined();
        expect(response.node?.Name).toBe(nodeData.Name);

        // 验证缓存
        const nodeInfo = socketIoService.getNodeByName('TestNode');
        expect(nodeInfo).toBeDefined();
        expect(nodeInfo?.IP).toBe(nodeData.IP);
      },
      TEST_TIMEOUT
    );

    test(
      '应该替换已存在的同名 Node',
      async () => {
        const client1 = await createClient();
        const nodeData = {
          Name: 'DuplicateNode',
          IP: '192.168.1.100',
          Port: 8080,
          MaxConnections: 100,
        };

        // 第一次注册
        await new Promise<RegisterNodeResponse>((resolve) => {
          client1.emit('RegisterNode', nodeData, resolve);
        });

        // 创建第二个客户端
        const client2 = await createClient();

        // 第二次注册（相同名称，不同 IP）
        const secondData = { ...nodeData, IP: '192.168.1.101' };
        const response = await new Promise<RegisterNodeResponse>((resolve) => {
          client2.emit('RegisterNode', secondData, resolve);
        });

        expect(response.success).toBe(true);

        // 验证新连接替换了旧连接
        const nodeInfo = socketIoService.getNodeByName('DuplicateNode');
        expect(nodeInfo?.IP).toBe('192.168.1.101');

        // 等待旧连接断开
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(client1.connected).toBe(false);
      },
      TEST_TIMEOUT
    );

    test(
      '应该处理 Node 注册失败',
      async () => {
        // Mock 失败
        nodeService.createOrUpdateNode = mock(async () => {
          throw new Error('Database error');
        });

        const client = await createClient();
        const nodeData = {
          Name: 'FailNode',
          IP: '192.168.1.100',
          Port: 8080,
          MaxConnections: 100,
        };

        const response = await new Promise<RegisterNodeResponse>((resolve) => {
          client.emit('RegisterNode', nodeData, resolve);
        });

        expect(response.success).toBe(false);
        expect(response.message).toContain('error');
      },
      TEST_TIMEOUT
    );
  });

  describe('Node 信息更新', () => {
    test(
      '应该更新 Node 连接数',
      async () => {
        const client = await createClient();

        // 先注册
        await new Promise<RegisterNodeResponse>((resolve) => {
          client.emit(
            'RegisterNode',
            {
              Name: 'UpdateTestNode',
              IP: '192.168.1.100',
              Port: 8080,
              MaxConnections: 100,
            },
            resolve
          );
        });

        // 更新信息
        const updateData = {
          Name: 'UpdateTestNode',
          Connections: 50,
          runInfo: {
            updateTime: new Date(),
            hostname: 'test-host',
            totalmem: '8GB',
            freemem: '4GB',
            loadavg: [1.0, 1.5, 2.0],
            type: 'Linux',
            uptime: '24h',
            SocketMaps: [],
          },
        };

        client.emit('UpdateNodeInfo', updateData);

        // 等待更新完成
        await new Promise((resolve) => setTimeout(resolve, 100));

        // 验证缓存已更新
        const nodeInfo = socketIoService.getNodeByName('UpdateTestNode');
        expect(nodeInfo?.Connections).toBe(50);
      },
      TEST_TIMEOUT
    );
  });

  describe('终端注册', () => {
    test(
      '应该注册终端挂载设备',
      async () => {
        const client = await createClient();

        // 先注册 Node
        await new Promise<RegisterNodeResponse>((resolve) => {
          client.emit(
            'RegisterNode',
            {
              Name: 'TerminalTestNode',
              IP: '192.168.1.100',
              Port: 8080,
              MaxConnections: 100,
            },
            resolve
          );
        });

        const updateMock = mock(async () => true);
        terminalService.updateOnlineStatus = updateMock;

        // 注册终端
        const registerData = {
          mac: 'AA:BB:CC:DD:EE:FF',
          pid: 1,
          mountDev: 'sensor1',
        };

        client.emit('TerminalMountDevRegister', registerData);

        // 等待注册完成
        await new Promise((resolve) => setTimeout(resolve, 100));

        // 验证终端在线状态被更新
        expect(updateMock).toHaveBeenCalledWith('AA:BB:CC:DD:EE:FF', true);

        // 验证缓存
        const terminalCache = socketIoService.getTerminalCache('AA:BB:CC:DD:EE:FF');
        expect(terminalCache).toBeDefined();
        expect(terminalCache?.name).toBe('Test Terminal');
      },
      TEST_TIMEOUT
    );
  });

  describe('查询结果处理', () => {
    test(
      '应该触发内部事件当收到查询结果时',
      async () => {
        const client = await createClient();

        const eventName = 'query_test_123';
        const queryResult = {
          eventName,
          mac: 'AA:BB:CC:DD:EE:FF',
          pid: 1,
          protocol: 'modbus',
          success: true,
          data: {
            result: [{ name: 'temperature', value: 25 }],
            timeStamp: Date.now(),
            pid: 1,
            mac: 'AA:BB:CC:DD:EE:FF',
            useTime: 100,
            parentId: 'test',
            hasAlarm: 0,
          },
        };

        // 监听内部事件
        const eventPromise = new Promise((resolve) => {
          socketIoService.once(eventName, resolve);
        });

        // 发送查询结果
        client.emit('queryResult', queryResult);

        // 等待事件触发
        const result = await Promise.race([
          eventPromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Event timeout')), 1000)
          ),
        ]);

        expect(result).toEqual(queryResult);
      },
      TEST_TIMEOUT
    );
  });

  describe('心跳机制', () => {
    test(
      '应该响应心跳请求',
      async () => {
        const client = await createClient();

        // 注册 Node
        await new Promise<RegisterNodeResponse>((resolve) => {
          client.emit(
            'RegisterNode',
            {
              Name: 'HeartbeatTestNode',
              IP: '192.168.1.100',
              Port: 8080,
              MaxConnections: 100,
            },
            resolve
          );
        });

        const heartbeatRequest = { timestamp: Date.now() };
        const response = await new Promise((resolve) => {
          client.emit('heartbeat', heartbeatRequest, resolve);
        });

        expect(response).toHaveProperty('timestamp');
        expect(typeof (response as any).timestamp).toBe('number');
      },
      TEST_TIMEOUT
    );

    test(
      '应该更新最后心跳时间',
      async () => {
        const client = await createClient();

        // 注册 Node
        await new Promise<RegisterNodeResponse>((resolve) => {
          client.emit(
            'RegisterNode',
            {
              Name: 'HeartbeatTimeNode',
              IP: '192.168.1.100',
              Port: 8080,
              MaxConnections: 100,
            },
            resolve
          );
        });

        const nodeInfo = socketIoService.getNodeByName('HeartbeatTimeNode');
        const beforeHeartbeat = nodeInfo?.lastHeartbeat.getTime();

        // 等待 100ms
        await new Promise((resolve) => setTimeout(resolve, 100));

        // 发送心跳
        await new Promise((resolve) => {
          client.emit('heartbeat', { timestamp: Date.now() }, resolve);
        });

        // 验证心跳时间已更新
        const afterNodeInfo = socketIoService.getNodeByName('HeartbeatTimeNode');
        const afterHeartbeat = afterNodeInfo?.lastHeartbeat.getTime();

        expect(afterHeartbeat).toBeGreaterThan(beforeHeartbeat || 0);
      },
      TEST_TIMEOUT
    );
  });

  describe('断开连接处理', () => {
    test(
      '应该清理断开连接的 Node 缓存',
      async () => {
        const client = await createClient();

        // 注册 Node
        await new Promise<RegisterNodeResponse>((resolve) => {
          client.emit(
            'RegisterNode',
            {
              Name: 'DisconnectTestNode',
              IP: '192.168.1.100',
              Port: 8080,
              MaxConnections: 100,
            },
            resolve
          );
        });

        // 验证 Node 已注册
        let nodeInfo = socketIoService.getNodeByName('DisconnectTestNode');
        expect(nodeInfo).toBeDefined();

        // 断开连接
        await new Promise<void>((resolve) => {
          client.once('disconnect', () => resolve());
          client.disconnect();
        });

        // 等待清理完成
        await new Promise((resolve) => setTimeout(resolve, 100));

        // 验证缓存已清理
        nodeInfo = socketIoService.getNodeByName('DisconnectTestNode');
        expect(nodeInfo).toBeUndefined();
      },
      TEST_TIMEOUT
    );
  });

  describe('缓存管理', () => {
    test(
      '应该返回所有在线 Node',
      async () => {
        const client1 = await createClient();
        const client2 = await createClient();

        // 注册两个 Node
        await Promise.all([
          new Promise<RegisterNodeResponse>((resolve) => {
            client1.emit(
              'RegisterNode',
              {
                Name: 'Node1',
                IP: '192.168.1.100',
                Port: 8080,
                MaxConnections: 100,
              },
              resolve
            );
          }),
          new Promise<RegisterNodeResponse>((resolve) => {
            client2.emit(
              'RegisterNode',
              {
                Name: 'Node2',
                IP: '192.168.1.101',
                Port: 8081,
                MaxConnections: 100,
              },
              resolve
            );
          }),
        ]);

        // 获取所有在线 Node
        const onlineNodes = socketIoService.getOnlineNodes();
        expect(onlineNodes.length).toBe(2);
        expect(onlineNodes.map((n) => n.Name).sort()).toEqual(['Node1', 'Node2']);
      },
      TEST_TIMEOUT
    );
  });
});
