import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { createServer, Server as HTTPServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { mongodb } from '../database/mongodb';
import { socketService } from './socket.service';
import { nodeService } from './node.service';
import { terminalService } from './terminal.service';

describe('SocketService Integration Tests', () => {
  let httpServer: HTTPServer;
  let serverPort: number;
  let clientSocket: ClientSocket;

  beforeAll(async () => {
    // 连接数据库
    await mongodb.connect();

    // 清理测试数据
    await mongodb.getCollection('node.clients').deleteMany({ Name: /^test_integration_/ });
    await mongodb.getCollection('terminals').deleteMany({ DevMac: /^TEST:INTEGRATION:/ });

    // 创建测试节点
    await nodeService.upsertNode({
      Name: 'test_integration_node_1',
      IP: '127.0.0.1',
      Port: 8100,
      MaxConnections: 100,
      Connections: 0,
    });

    // 创建测试终端
    await mongodb.getCollection('terminals').insertOne({
      DevMac: 'TEST:INTEGRATION:AA:BB:CC',
      name: 'Test Integration Terminal',
      mountNode: 'test_integration_node_1',
      online: false,
      mountDevs: [],
      uptime: new Date(),
      updatedAt: new Date(),
    } as any);

    // 创建 HTTP 服务器
    httpServer = createServer();

    // 随机端口
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address();
        if (addr && typeof addr === 'object') {
          serverPort = addr.port;
        }
        resolve();
      });
    });

    // 初始化 Socket.IO
    socketService.initialize(httpServer);
  });

  afterAll(async () => {
    // 清理
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }
    await socketService.close();
    await mongodb.getCollection('node.clients').deleteMany({ Name: /^test_integration_/ });
    await mongodb.getCollection('terminals').deleteMany({ DevMac: /^TEST:INTEGRATION:/ });
    await mongodb.disconnect();

    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }
  });

  beforeEach(() => {
    // 确保每个测试前断开之前的连接
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }
  });

  describe('Node Client Connection', () => {
    test('should accept connection from registered node', async () => {
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 5000);

        clientSocket = ioClient(`http://127.0.0.1:${serverPort}/node`, {
          transports: ['websocket'],
          extraHeaders: {
            'x-real-ip': '127.0.0.1',
          },
        });

        clientSocket.on('connect', () => {
          clearTimeout(timeout);
          expect(clientSocket.connected).toBe(true);
          resolve();
        });

        clientSocket.on('connect_error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    });

    test('should receive accont event after connection', async () => {
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('accont event timeout'));
        }, 5000);

        clientSocket = ioClient(`http://127.0.0.1:${serverPort}/node`, {
          transports: ['websocket'],
          extraHeaders: {
            'x-real-ip': '127.0.0.1',
          },
        });

        clientSocket.on('accont', () => {
          clearTimeout(timeout);
          resolve();
        });

        clientSocket.on('connect_error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    });

    test('should reject connection from unregistered IP', async () => {
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          resolve(); // 超时也算成功，说明确实没连上
        }, 3000);

        const unregisteredClient = ioClient(`http://127.0.0.1:${serverPort}/node`, {
          transports: ['websocket'],
          extraHeaders: {
            'x-real-ip': '192.168.99.99', // 未注册的 IP
          },
        });

        unregisteredClient.on('connect', () => {
          clearTimeout(timeout);
          unregisteredClient.disconnect();
          reject(new Error('Should not connect with unregistered IP'));
        });

        unregisteredClient.on('disconnect', () => {
          clearTimeout(timeout);
          unregisteredClient.disconnect();
          resolve();
        });

        unregisteredClient.on('connect_error', () => {
          clearTimeout(timeout);
          unregisteredClient.disconnect();
          resolve();
        });
      });
    });

    test('should add node to online nodes list', async () => {
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 5000);

        clientSocket = ioClient(`http://127.0.0.1:${serverPort}/node`, {
          transports: ['websocket'],
          extraHeaders: {
            'x-real-ip': '127.0.0.1',
          },
        });

        clientSocket.on('connect', () => {
          clearTimeout(timeout);

          // 稍等一下让服务器处理完连接
          setTimeout(() => {
            const onlineNodes = socketService.getOnlineNodes();
            expect(onlineNodes).toContain('test_integration_node_1');

            const isOnline = socketService.isNodeOnline('test_integration_node_1');
            expect(isOnline).toBe(true);

            const context = socketService.getNodeContext('test_integration_node_1');
            expect(context).toBeDefined();
            expect(context?.nodeName).toBe('test_integration_node_1');
            expect(context?.nodeIP).toBe('127.0.0.1');

            resolve();
          }, 100);
        });

        clientSocket.on('connect_error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    });
  });

  describe('Event Communication', () => {
    test('should handle register event', async () => {
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Test timeout'));
        }, 5000);

        clientSocket = ioClient(`http://127.0.0.1:${serverPort}/node`, {
          transports: ['websocket'],
          extraHeaders: {
            'x-real-ip': '127.0.0.1',
          },
        });

        clientSocket.on('connect', async () => {
          // 等待连接完全建立
          await new Promise((r) => setTimeout(r, 100));

          // emit register event with callback
          clientSocket.timeout(3000).emit('register', (err: any, data: any) => {
            clearTimeout(timeout);
            if (err) {
              reject(err);
              return;
            }
            expect(data).toBeDefined();
            expect(data.Name).toBe('test_integration_node_1');
            expect(data.IP).toBe('127.0.0.1');
            expect(data.Port).toBe(8100);
            expect(data.MaxConnections).toBe(100);
            resolve();
          });
        });

        clientSocket.on('connect_error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    });

    test('should handle terminalOn event', async () => {
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Test timeout'));
        }, 5000);

        clientSocket = ioClient(`http://127.0.0.1:${serverPort}/node`, {
          transports: ['websocket'],
          extraHeaders: {
            'x-real-ip': '127.0.0.1',
          },
        });

        clientSocket.on('connect', async () => {
          // 等待连接完全建立
          await new Promise((r) => setTimeout(r, 100));

          // 先确保终端是离线状态
          await terminalService.updateOnlineStatus('TEST:INTEGRATION:AA:BB:CC', false);

          // 发送终端上线事件
          clientSocket.emit('terminalOn', 'TEST:INTEGRATION:AA:BB:CC', false);

          // 等待足够时间让服务器处理并更新数据库
          await new Promise((r) => setTimeout(r, 500));

          // 检查终端在线状态
          const terminal = await mongodb
            .getCollection('terminals')
            .findOne({ DevMac: 'TEST:INTEGRATION:AA:BB:CC' });

          clearTimeout(timeout);
          expect(terminal).toBeDefined();
          expect(terminal?.online).toBe(true);
          resolve();
        });

        clientSocket.on('connect_error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    });

    test('should handle terminalOff event', async () => {
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Test timeout'));
        }, 5000);

        clientSocket = ioClient(`http://127.0.0.1:${serverPort}/node`, {
          transports: ['websocket'],
          extraHeaders: {
            'x-real-ip': '127.0.0.1',
          },
        });

        clientSocket.on('connect', async () => {
          // 先设置为在线
          await terminalService.updateOnlineStatus('TEST:INTEGRATION:AA:BB:CC', true);

          // 发送终端离线事件
          clientSocket.emit('terminalOff', 'TEST:INTEGRATION:AA:BB:CC', true);

          // 等待一下让服务器处理
          await new Promise((r) => setTimeout(r, 200));

          // 检查终端离线状态
          const terminal = await mongodb
            .getCollection('terminals')
            .findOne({ DevMac: 'TEST:INTEGRATION:AA:BB:CC' });

          clearTimeout(timeout);
          expect(terminal).toBeDefined();
          expect(terminal?.online).toBe(false);
          resolve();
        });

        clientSocket.on('connect_error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    });
  });

  describe('RPC Communication', () => {
    test('should send InstructQuery to connected node', async () => {
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Test timeout'));
        }, 5000);

        clientSocket = ioClient(`http://127.0.0.1:${serverPort}/node`, {
          transports: ['websocket'],
          extraHeaders: {
            'x-real-ip': '127.0.0.1',
          },
        });

        clientSocket.on('connect', async () => {
          // 客户端监听 InstructQuery 事件
          clientSocket.on('InstructQuery', (query: any, callback: (result: any) => void) => {
            clearTimeout(timeout);

            // 验证查询数据
            expect(query).toBeDefined();
            expect(query.DevMac).toBe('AA:BB:CC:DD:EE:FF');
            expect(query.protocol).toBe('modbus');

            // 返回模拟结果
            callback({ success: true, data: 'test result' });
            resolve();
          });

          // 等待连接完全建立
          await new Promise((r) => setTimeout(r, 100));

          // 服务器发送查询
          const result = await socketService.sendInstructQuery(
            'test_integration_node_1',
            {
              DevMac: 'AA:BB:CC:DD:EE:FF',
              protocol: 'modbus',
              pid: 1,
              instruct: 'read',
            },
            3000
          );

          expect(result).toBeDefined();
          expect(result.success).toBe(true);
        });

        clientSocket.on('connect_error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    });

    test('should send DTU operation to connected node', async () => {
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Test timeout'));
        }, 5000);

        clientSocket = ioClient(`http://127.0.0.1:${serverPort}/node`, {
          transports: ['websocket'],
          extraHeaders: {
            'x-real-ip': '127.0.0.1',
          },
        });

        clientSocket.on('connect', async () => {
          // 客户端监听 OprateDTU 事件
          clientSocket.on('OprateDTU', (operation: any, callback: (result: any) => void) => {
            clearTimeout(timeout);

            // 验证操作数据
            expect(operation).toBeDefined();
            expect(operation.DevMac).toBe('AA:BB:CC:DD:EE:FF');
            expect(operation.events).toBe('restart');

            // 返回模拟结果
            callback({ success: true, message: 'restarted' });
            resolve();
          });

          // 等待连接完全建立
          await new Promise((r) => setTimeout(r, 100));

          // 服务器发送操作
          const result = await socketService.sendDTUOperation(
            'test_integration_node_1',
            {
              DevMac: 'AA:BB:CC:DD:EE:FF',
              events: 'restart',
              content: '',
            },
            3000
          );

          expect(result).toBeDefined();
          expect(result.success).toBe(true);
        });

        clientSocket.on('connect_error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    });

    test('should timeout if node does not respond', async () => {
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Test should have thrown timeout error'));
        }, 5000);

        clientSocket = ioClient(`http://127.0.0.1:${serverPort}/node`, {
          transports: ['websocket'],
          extraHeaders: {
            'x-real-ip': '127.0.0.1',
          },
        });

        clientSocket.on('connect', async () => {
          // 客户端监听但不响应
          clientSocket.on('InstructQuery', () => {
            // 不调用 callback，模拟超时
          });

          // 等待连接完全建立
          await new Promise((r) => setTimeout(r, 100));

          try {
            // 服务器发送查询，设置 1 秒超时
            await socketService.sendInstructQuery(
              'test_integration_node_1',
              {
                DevMac: 'AA:BB:CC:DD:EE:FF',
                protocol: 'modbus',
                pid: 1,
                instruct: 'read',
              },
              1000
            );
            clearTimeout(timeout);
            reject(new Error('Should have thrown timeout error'));
          } catch (error: any) {
            clearTimeout(timeout);
            expect(error.message).toContain('超时');
            resolve();
          }
        });

        clientSocket.on('connect_error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    });
  });

  describe('Disconnect Handling', () => {
    test('should remove node from online list on disconnect', async () => {
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Test timeout'));
        }, 5000);

        clientSocket = ioClient(`http://127.0.0.1:${serverPort}/node`, {
          transports: ['websocket'],
          extraHeaders: {
            'x-real-ip': '127.0.0.1',
          },
        });

        clientSocket.on('connect', async () => {
          // 确认节点在线
          await new Promise((r) => setTimeout(r, 100));
          expect(socketService.isNodeOnline('test_integration_node_1')).toBe(true);

          // 断开连接
          clientSocket.disconnect();

          // 等待服务器处理断开
          await new Promise((r) => setTimeout(r, 200));

          clearTimeout(timeout);
          expect(socketService.isNodeOnline('test_integration_node_1')).toBe(false);
          const context = socketService.getNodeContext('test_integration_node_1');
          expect(context).toBeUndefined();
          resolve();
        });

        clientSocket.on('connect_error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    });

    test('should set terminals offline on node disconnect', async () => {
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Test timeout'));
        }, 5000);

        clientSocket = ioClient(`http://127.0.0.1:${serverPort}/node`, {
          transports: ['websocket'],
          extraHeaders: {
            'x-real-ip': '127.0.0.1',
          },
        });

        clientSocket.on('connect', async () => {
          // 设置终端为在线
          await terminalService.updateOnlineStatus('TEST:INTEGRATION:AA:BB:CC', true);

          // 等待一下
          await new Promise((r) => setTimeout(r, 100));

          // 断开连接
          clientSocket.disconnect();

          // 等待服务器处理断开
          await new Promise((r) => setTimeout(r, 200));

          // 检查终端已离线
          const terminal = await mongodb
            .getCollection('terminals')
            .findOne({ DevMac: 'TEST:INTEGRATION:AA:BB:CC' });

          clearTimeout(timeout);
          expect(terminal).toBeDefined();
          expect(terminal?.online).toBe(false);
          resolve();
        });

        clientSocket.on('connect_error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    });
  });

  describe('Multiple Clients', () => {
    test('should handle multiple node connections', async () => {
      // 创建第二个测试节点
      await nodeService.upsertNode({
        Name: 'test_integration_node_2',
        IP: '127.0.0.2',
        Port: 8200,
        MaxConnections: 100,
        Connections: 0,
      });

      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Test timeout'));
        }, 5000);

        let connectedCount = 0;

        const client1 = ioClient(`http://127.0.0.1:${serverPort}/node`, {
          transports: ['websocket'],
          extraHeaders: {
            'x-real-ip': '127.0.0.1',
          },
        });

        const client2 = ioClient(`http://127.0.0.1:${serverPort}/node`, {
          transports: ['websocket'],
          extraHeaders: {
            'x-real-ip': '127.0.0.2',
          },
        });

        const checkBothConnected = async () => {
          connectedCount++;
          if (connectedCount === 2) {
            // 等待服务器处理
            await new Promise((r) => setTimeout(r, 100));

            const onlineNodes = socketService.getOnlineNodes();
            clearTimeout(timeout);
            expect(onlineNodes.length).toBeGreaterThanOrEqual(2);
            expect(onlineNodes).toContain('test_integration_node_1');
            expect(onlineNodes).toContain('test_integration_node_2');

            client1.disconnect();
            client2.disconnect();

            // 清理
            await nodeService.deleteNode('test_integration_node_2');
            resolve();
          }
        };

        client1.on('connect', checkBothConnected);
        client2.on('connect', checkBothConnected);

        client1.on('connect_error', (error) => {
          clearTimeout(timeout);
          client1.disconnect();
          client2.disconnect();
          reject(error);
        });

        client2.on('connect_error', (error) => {
          clearTimeout(timeout);
          client1.disconnect();
          client2.disconnect();
          reject(error);
        });
      });
    });
  });
});
