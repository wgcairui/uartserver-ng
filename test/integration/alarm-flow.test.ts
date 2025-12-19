/**
 * 告警流程集成测试
 *
 * 测试完整的告警触发和推送流程，包括：
 * 1. 数据告警（argument alarm）- 设备数据超阈值
 * 2. 超时告警（timeout alarm）- 查询超时
 * 3. 离线告警（offline alarm）- 设备离线
 * 4. 告警推送 - WebSocket 和用户推送
 * 5. 告警去重 - 短时间内重复告警
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import type { FastifyInstance } from 'fastify';
import { mongodb } from '../../src/database/mongodb';
import { testDb } from '../helpers/test-db';
import { build } from '../../src/app';
import jwt from 'jsonwebtoken';

describe('Alarm Flow Integration Tests', () => {
  let app: FastifyInstance;
  let serverUrl: string;
  let nodeClient: ClientSocket;
  let userClient: ClientSocket;

  const TEST_MAC = 'AA:BB:CC:DD:EE:FF';
  const TEST_PID = 1;
  const TEST_NODE_NAME = 'alarm-test-node';
  const TEST_USER_ID = 'test-user-001';
  const JWT_SECRET = 'your-super-secret-jwt-key-change-this-in-production';

  /**
   * 生成测试用的 JWT token
   */
  function generateTestToken(userId: string, username?: string): string {
    return jwt.sign(
      {
        userId,
        user: userId,
        username: username || `user-${userId}`,
      },
      JWT_SECRET,
      {
        expiresIn: '1h',
      }
    );
  }

  beforeAll(async () => {
    console.log('🚀 设置告警流程测试环境...');

    // 连接数据库
    await testDb.connect();
    if (!mongodb.isConnected()) {
      await mongodb.connect();
    }

    // 启动应用
    app = await build();
    await app.listen({ port: 0, host: '127.0.0.1' });
    serverUrl = `http://127.0.0.1:${(app.server.address() as any)?.port}`;

    console.log(`  ✓ 服务器启动: ${serverUrl}`);

    // 清理旧数据
    await cleanupTestData();

    // 创建测试终端数据
    await createTestTerminal();

    console.log('✅ 告警流程测试环境准备完成\n');
  }, 30000);

  afterAll(async () => {
    console.log('\n🧹 清理测试环境...');

    if (nodeClient?.connected) {
      nodeClient.disconnect();
    }
    if (userClient?.connected) {
      userClient.disconnect();
    }

    await cleanupTestData();
    await app.close();
    await mongodb.disconnect();
    await testDb.disconnect();

    console.log('✅ 清理完成');
  }, 30000);

  beforeEach(() => {
    // 每个测试前确保客户端断开连接
    if (nodeClient?.connected) {
      nodeClient.disconnect();
    }
    if (userClient?.connected) {
      userClient.disconnect();
    }
  });

  /**
   * 测试 1: 数据告警触发和推送
   *
   * 场景：设备查询结果包含告警数据 → 触发告警 → 推送给订阅用户
   */
  test('should trigger and push data alarm when device data has alarm', async () => {
    console.log('\n📊 测试数据告警流程...');

    // 1. 连接 Node 客户端并注册
    nodeClient = await connectAndRegisterNode();

    // 2. 连接用户客户端并订阅设备
    userClient = await connectAndSubscribeUser();

    // 3. 设置告警监听器（监听 update 事件，过滤 type=alarm）
    const alarmReceived = new Promise<any>((resolve) => {
      userClient.on('update', (data: any) => {
        if (data.type === 'alarm') {
          console.log('  ✓ 用户收到告警:', data);
          userClient.off('update'); // 移除监听器
          resolve(data);
        }
      });
    });

    // 4. 模拟 Node 客户端发送包含告警的查询结果
    const queryEventName = `queryResult_${TEST_MAC}_${TEST_PID}`;

    nodeClient.emit('queryResult', {
      eventName: queryEventName,
      mac: TEST_MAC,
      pid: TEST_PID,
      protocol: 'modbus',
      success: true,
      useTime: 50,
      data: {
        mac: TEST_MAC,
        pid: TEST_PID,
        result: [
          {
            name: 'temperature',
            value: '85.5',
            parseValue: '85.5',
            alarm: true,  // 告警标记
            unit: '°C'
          },
          {
            name: 'humidity',
            value: '60',
            parseValue: '60',
            alarm: false,
            unit: '%'
          },
        ],
        timeStamp: Date.now(),
        useTime: 50,
        parentId: '',
        hasAlarm: 1,  // 有告警
      },
    });

    // 5. 等待告警推送
    const alarm = await alarmReceived;

    // 6. 验证告警数据
    expect(alarm).toBeDefined();
    expect(alarm.type).toBe('alarm');
    expect(alarm.mac).toBe(TEST_MAC);
    expect(alarm.pid).toBe(TEST_PID);
    expect(alarm.alarmType).toBe('data_alarm');
    expect(alarm.alarmLevel).toBe('warning');
    expect(alarm.data).toBeArrayOfSize(1);  // 只有一个告警项
    expect(alarm.data[0].name).toBe('temperature');
    expect(alarm.data[0].alarm).toBe(true);

    console.log('  ✅ 数据告警测试通过\n');
  }, 10000);

  /**
   * 测试 2: 无告警数据不应触发告警
   *
   * 场景：设备查询结果正常（无告警）→ 不触发告警推送
   */
  test('should not trigger alarm when device data is normal', async () => {
    console.log('\n📊 测试正常数据不触发告警...');

    nodeClient = await connectAndRegisterNode();
    userClient = await connectAndSubscribeUser();

    // 设置告警监听器（不应该被触发）
    let alarmReceived = false;
    userClient.on('update', (data: any) => {
      if (data.type === 'alarm') {
        alarmReceived = true;
      }
    });

    // 设置数据更新监听器（应该被触发）
    const dataReceived = new Promise<any>((resolve) => {
      userClient.on('update', (data: any) => {
        if (data.type === 'data') {
          console.log('  ✓ 用户收到数据更新:', data.type);
          userClient.off('update'); // 移除监听器
          resolve(data);
        }
      });
    });

    // 模拟正常查询结果（无告警）
    const queryEventName = `queryResult_${TEST_MAC}_${TEST_PID}`;

    nodeClient.emit('queryResult', {
      eventName: queryEventName,
      mac: TEST_MAC,
      pid: TEST_PID,
      protocol: 'modbus',
      success: true,
      useTime: 45,
      data: {
        mac: TEST_MAC,
        pid: TEST_PID,
        result: [
          {
            name: 'temperature',
            value: '25.5',
            parseValue: '25.5',
            alarm: false,
            unit: '°C'
          },
          {
            name: 'humidity',
            value: '60',
            parseValue: '60',
            alarm: false,
            unit: '%'
          },
        ],
        timeStamp: Date.now(),
        useTime: 45,
        parentId: '',
        hasAlarm: 0,  // 无告警
      },
    });

    // 等待数据推送
    await dataReceived;

    // 等待一小段时间确保告警不会被触发
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 验证告警未被触发
    expect(alarmReceived).toBe(false);

    console.log('  ✅ 正常数据不触发告警测试通过\n');
  }, 10000);

  /**
   * 测试 3: 多个告警项的处理
   *
   * 场景：设备查询结果包含多个告警项 → 正确过滤和推送所有告警项
   */
  test('should handle multiple alarm items correctly', async () => {
    console.log('\n📊 测试多告警项处理...');

    nodeClient = await connectAndRegisterNode();
    userClient = await connectAndSubscribeUser();

    const alarmReceived = new Promise<any>((resolve) => {
      userClient.on('update', (data: any) => {
        if (data.type === 'alarm') {
          userClient.off('update'); // 移除监听器
          resolve(data);
        }
      });
    });

    // 模拟包含多个告警项的查询结果
    const queryEventName = `queryResult_${TEST_MAC}_${TEST_PID}`;

    nodeClient.emit('queryResult', {
      eventName: queryEventName,
      mac: TEST_MAC,
      pid: TEST_PID,
      protocol: 'modbus',
      success: true,
      useTime: 50,
      data: {
        mac: TEST_MAC,
        pid: TEST_PID,
        result: [
          { name: 'temperature', value: '85.5', parseValue: '85.5', alarm: true },
          { name: 'pressure', value: '150', parseValue: '150', alarm: true },
          { name: 'humidity', value: '60', parseValue: '60', alarm: false },
          { name: 'voltage', value: '220', parseValue: '220', alarm: true },
        ],
        timeStamp: Date.now(),
        useTime: 50,
        parentId: '',
        hasAlarm: 3,
      },
    });

    const alarm = await alarmReceived;

    // 验证告警数据包含所有告警项
    expect(alarm.data).toBeArrayOfSize(3);
    expect(alarm.data.every((item: any) => item.alarm === true)).toBe(true);

    const alarmNames = alarm.data.map((item: any) => item.name);
    expect(alarmNames).toContain('temperature');
    expect(alarmNames).toContain('pressure');
    expect(alarmNames).toContain('voltage');
    expect(alarmNames).not.toContain('humidity');  // 正常数据不应包含

    console.log('  ✅ 多告警项处理测试通过\n');
  }, 10000);

  /**
   * 测试 4: WebSocket 房间推送
   *
   * 场景：多个用户订阅同一设备 → 所有用户都收到告警
   */
  test('should push alarm to all subscribers in room', async () => {
    console.log('\n📊 测试 WebSocket 房间告警推送...');

    nodeClient = await connectAndRegisterNode();

    // 连接两个用户客户端
    const user1Client = await connectAndSubscribeUser('user-001');
    const user2Client = await connectAndSubscribeUser('user-002');

    // 两个用户都设置告警监听器
    const alarm1Received = new Promise<any>((resolve) => {
      user1Client.on('update', (data: any) => {
        if (data.type === 'alarm') {
          console.log('  ✓ 用户 1 收到告警');
          user1Client.off('update');
          resolve(data);
        }
      });
    });

    const alarm2Received = new Promise<any>((resolve) => {
      user2Client.on('update', (data: any) => {
        if (data.type === 'alarm') {
          console.log('  ✓ 用户 2 收到告警');
          user2Client.off('update');
          resolve(data);
        }
      });
    });

    // 发送告警数据
    const queryEventName = `queryResult_${TEST_MAC}_${TEST_PID}`;

    nodeClient.emit('queryResult', {
      eventName: queryEventName,
      mac: TEST_MAC,
      pid: TEST_PID,
      protocol: 'modbus',
      success: true,
      useTime: 50,
      data: {
        mac: TEST_MAC,
        pid: TEST_PID,
        result: [
          { name: 'temperature', value: '90', parseValue: '90', alarm: true },
        ],
        timeStamp: Date.now(),
        useTime: 50,
        parentId: '',
        hasAlarm: 1,
      },
    });

    // 等待两个用户都收到告警
    const [alarm1, alarm2] = await Promise.all([alarm1Received, alarm2Received]);

    // 验证两个用户收到相同的告警
    expect(alarm1).toBeDefined();
    expect(alarm2).toBeDefined();
    expect(alarm1.mac).toBe(TEST_MAC);
    expect(alarm2.mac).toBe(TEST_MAC);

    // 清理
    user1Client.disconnect();
    user2Client.disconnect();

    console.log('  ✅ WebSocket 房间推送测试通过\n');
  }, 15000);

  /**
   * 测试 5: 未订阅用户不应收到告警
   *
   * 场景：用户未订阅设备 → 不应收到该设备的告警
   */
  test('should not push alarm to unsubscribed users', async () => {
    console.log('\n📊 测试未订阅用户不收到告警...');

    nodeClient = await connectAndRegisterNode();

    // 用户连接但不订阅设备
    userClient = ioClient(`${serverUrl}/user`, {
      transports: ['websocket'],
      auth: { token: 'dev-mode' },
    });

    await new Promise<void>((resolve) => {
      userClient.on('connect', () => {
        console.log('  ✓ 用户客户端已连接（未订阅）');
        resolve();
      });
    });

    // 设置告警监听器（不应该被触发）
    let alarmReceived = false;
    userClient.on('update', (data: any) => {
      if (data.type === 'alarm') {
        alarmReceived = true;
      }
    });

    // 发送告警数据
    const queryEventName = `queryResult_${TEST_MAC}_${TEST_PID}`;

    nodeClient.emit('queryResult', {
      eventName: queryEventName,
      mac: TEST_MAC,
      pid: TEST_PID,
      protocol: 'modbus',
      success: true,
      useTime: 50,
      data: {
        mac: TEST_MAC,
        pid: TEST_PID,
        result: [
          { name: 'temperature', value: '95', parseValue: '95', alarm: true },
        ],
        timeStamp: Date.now(),
        useTime: 50,
        parentId: '',
        hasAlarm: 1,
      },
    });

    // 等待一段时间确保告警不会被推送
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 验证告警未被触发
    expect(alarmReceived).toBe(false);

    console.log('  ✅ 未订阅用户不收到告警测试通过\n');
  }, 10000);

  // ========== 辅助函数 ==========

  /**
   * 连接并注册 Node 客户端
   */
  async function connectAndRegisterNode(): Promise<ClientSocket> {
    const client = ioClient(`${serverUrl}/node`, {
      transports: ['websocket'],
    });

    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => {
        console.log('  ✓ Node 客户端已连接');

        client.emit(
          'RegisterNode',
          {
            Name: TEST_NODE_NAME,
            IP: '127.0.0.1',
            Port: 20000,
            MaxConnections: 100,
          },
          (response: any) => {
            if (response.success) {
              console.log('  ✓ Node 注册成功');

              // 注册测试终端
              client.emit('TerminalMountDevRegister', {
                mac: TEST_MAC,
                pid: TEST_PID,
                mountDev: 'test-device',
              });

              setTimeout(resolve, 200);
            } else {
              reject(new Error('Node registration failed'));
            }
          }
        );
      });

      client.on('connect_error', reject);
    });

    return client;
  }

  /**
   * 连接用户客户端并订阅设备
   */
  async function connectAndSubscribeUser(userId: string = TEST_USER_ID): Promise<ClientSocket> {
    // 生成有效的 JWT token
    const token = generateTestToken(userId);

    const client = ioClient(`${serverUrl}/user`, {
      transports: ['websocket'],
      auth: {
        token: token  // 使用生成的 JWT token
      },
    });

    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => {
        console.log(`  ✓ 用户客户端已连接 (${userId})`);

        // 订阅设备
        client.emit('subscribe', {
          mac: TEST_MAC,
          pid: TEST_PID,
        }, (subscribeResponse: any) => {
          if (subscribeResponse && subscribeResponse.success) {
            console.log(`  ✓ 用户已订阅设备 ${TEST_MAC}/${TEST_PID}`);
            resolve();
          } else {
            console.log(`  ⚠️ 订阅失败:`, subscribeResponse?.message || subscribeResponse);
            reject(new Error(`Failed to subscribe: ${subscribeResponse?.message || 'Unknown error'}`));
          }
        });
      });

      client.on('connect_error', (err) => {
        console.log(`  ❌ 连接失败:`, err.message);
        reject(err);
      });
    });

    return client;
  }

  /**
   * 创建测试终端数据
   */
  async function createTestTerminal(): Promise<void> {
    const db = testDb.getDb();

    // 创建终端
    await db.collection('terminals').insertOne({
      mac: TEST_MAC,
      DevMac: TEST_MAC,
      name: 'alarm-test-terminal',
      mountNode: TEST_NODE_NAME,
      online: true,
      mountDevs: [
        {
          pid: TEST_PID,
          mountDev: 'test-device',
          online: true,
        },
      ],
      AT: new Date(),
      UT: new Date(),
    });

    // 创建用户绑定记录（允许测试用户访问该设备）
    await db.collection('user.terminalBindings').insertOne({
      userId: TEST_USER_ID,
      mac: TEST_MAC,
      bindAt: new Date(),
    });

    await db.collection('user.terminalBindings').insertOne({
      userId: 'user-001',
      mac: TEST_MAC,
      bindAt: new Date(),
    });

    await db.collection('user.terminalBindings').insertOne({
      userId: 'user-002',
      mac: TEST_MAC,
      bindAt: new Date(),
    });

    console.log(`  ✓ 创建测试终端: ${TEST_MAC}`);
    console.log(`  ✓ 创建用户绑定记录`);
  }

  /**
   * 清理测试数据
   */
  async function cleanupTestData(): Promise<void> {
    const db = testDb.getDb();

    await db.collection('terminals').deleteMany({ mac: TEST_MAC });
    await db.collection('client.resultcolltions').deleteMany({ mac: TEST_MAC });
    await db.collection('client.resultsingles').deleteMany({ mac: TEST_MAC });
    await db.collection('user.terminalBindings').deleteMany({ mac: TEST_MAC });

    console.log('  ✓ 清理测试数据完成');
  }
});
