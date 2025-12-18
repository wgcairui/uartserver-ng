/**
 * WebSocket 服务集成测试
 * 测试用户 WebSocket 连接、认证、订阅和权限
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import type {
  UserAuthRequest,
  UserAuthResponse,
  SubscribeDeviceRequest,
  SubscribeDeviceResponse,
  UnsubscribeDeviceRequest,
  UnsubscribeDeviceResponse,
  UserHeartbeatRequest,
  UserHeartbeatResponse,
} from '../../src/types/websocket-events';
import { mongodb } from '../../src/database/mongodb';
import { testDb } from '../helpers/test-db';
import { generateTestToken, TEST_DATA } from '../helpers/fixtures';
import { build } from '../../src/app';
import type { FastifyInstance } from 'fastify';

describe('WebSocket Service Integration', () => {
  let app: FastifyInstance;
  let serverUrl: string;

  beforeAll(async () => {
    // Connect test database
    await testDb.connect();
    if (!mongodb.isConnected()) {
      await mongodb.connect();
    }

    // Start application
    app = await build();
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    serverUrl = `http://127.0.0.1:${app.server.address()?.port}`;

    console.log('🧪 WebSocket Integration Tests Starting...');
    console.log(`  Server: ${serverUrl}`);
  });

  afterAll(async () => {
    await app.close();
    await mongodb.disconnect();
    await testDb.disconnect();
  });

  beforeEach(async () => {
    // Clear user bindings collection before each test
    await testDb.clearCollection('user.terminalBindings');
  });

  describe('Connection and Authentication', () => {
    let client: ClientSocket;

    afterEach(() => {
      if (client && client.connected) {
        client.disconnect();
      }
    });

    test('should allow anonymous connection', (done) => {
      client = ioClient(`${serverUrl}/user`, {
        transports: ['websocket'],
      });

      client.on('connect', () => {
        expect(client.connected).toBe(true);
        done();
      });

      client.on('connect_error', (error) => {
        done(error);
      });
    });

    test('should authenticate with valid JWT token', (done) => {
      const token = generateTestToken({
        userId: TEST_DATA.users.user1.userId,
        username: TEST_DATA.users.user1.username,
      });

      client = ioClient(`${serverUrl}/user`, {
        transports: ['websocket'],
        auth: { token },
      });

      client.on('connect', () => {
        expect(client.connected).toBe(true);

        // Test auth event to verify authentication
        const authRequest: UserAuthRequest = { token };
        client.emit('auth', authRequest, (response: UserAuthResponse) => {
          expect(response.success).toBe(true);
          expect(response.user?.userId).toBe(TEST_DATA.users.user1.userId);
          done();
        });
      });

      client.on('connect_error', (error) => {
        done(error);
      });
    });

    test('should reject invalid JWT token', (done) => {
      const invalidToken = 'invalid.jwt.token';

      client = ioClient(`${serverUrl}/user`, {
        transports: ['websocket'],
        auth: { token: invalidToken },
      });

      client.on('connect', () => {
        const authRequest: UserAuthRequest = { token: invalidToken };
        client.emit('auth', authRequest, (response: UserAuthResponse) => {
          expect(response.success).toBe(false);
          expect(response.message).toContain('Invalid');
          done();
        });
      });
    });

    test('should handle heartbeat', (done) => {
      client = ioClient(`${serverUrl}/user`, {
        transports: ['websocket'],
      });

      client.on('connect', () => {
        const heartbeatRequest: UserHeartbeatRequest = {
          timestamp: Date.now(),
        };

        client.emit('heartbeat', heartbeatRequest, (response: UserHeartbeatResponse) => {
          expect(response.timestamp).toBe(heartbeatRequest.timestamp);
          expect(response.serverTime).toBeGreaterThan(heartbeatRequest.timestamp - 1000);
          done();
        });
      });
    });
  });

  describe('Device Subscription with Permissions', () => {
    let client: ClientSocket;
    const userToken = generateTestToken({
      userId: TEST_DATA.users.user1.userId,
      username: TEST_DATA.users.user1.username,
    });

    afterEach(() => {
      if (client && client.connected) {
        client.disconnect();
      }
    });

    beforeEach(async () => {
      // Create user-device binding for user1 and device1
      await testDb.getCollection('user.terminalBindings').insertOne({
        userId: TEST_DATA.users.user1.userId,
        mac: TEST_DATA.devices.device1.mac,
        bindAt: new Date(),
      });
    });

    test('should allow authenticated user to subscribe to permitted device', (done) => {
      client = ioClient(`${serverUrl}/user`, {
        transports: ['websocket'],
        auth: { token: userToken },
      });

      client.on('connect', () => {
        const subscribeRequest: SubscribeDeviceRequest = {
          mac: TEST_DATA.devices.device1.mac,
          pid: 1,
        };

        client.emit('subscribe', subscribeRequest, (response: SubscribeDeviceResponse) => {
          expect(response.success).toBe(true);
          expect(response.room).toBeDefined();
          expect(response.room).toContain(TEST_DATA.devices.device1.mac);
          expect(response.room).toContain('1');
          done();
        });
      });
    });

    test('should reject anonymous user subscription', (done) => {
      client = ioClient(`${serverUrl}/user`, {
        transports: ['websocket'],
      });

      client.on('connect', () => {
        const subscribeRequest: SubscribeDeviceRequest = {
          mac: TEST_DATA.devices.device1.mac,
          pid: 1,
        };

        client.emit('subscribe', subscribeRequest, (response: SubscribeDeviceResponse) => {
          expect(response.success).toBe(false);
          expect(response.message?.toLowerCase()).toContain('permission');
          done();
        });
      });
    });

    test('should reject authenticated user without device permission', (done) => {
      client = ioClient(`${serverUrl}/user`, {
        transports: ['websocket'],
        auth: { token: userToken },
      });

      client.on('connect', () => {
        // Try to subscribe to device2 (not bound to user1)
        const subscribeRequest: SubscribeDeviceRequest = {
          mac: TEST_DATA.devices.device2.mac,
          pid: 1,
        };

        client.emit('subscribe', subscribeRequest, (response: SubscribeDeviceResponse) => {
          expect(response.success).toBe(false);
          expect(response.message?.toLowerCase()).toContain('permission');
          done();
        });
      });
    });

    test('should allow user to unsubscribe from device', (done) => {
      client = ioClient(`${serverUrl}/user`, {
        transports: ['websocket'],
        auth: { token: userToken },
      });

      client.on('connect', () => {
        const mac = TEST_DATA.devices.device1.mac;
        const pid = 1;

        // First subscribe
        const subscribeRequest: SubscribeDeviceRequest = { mac, pid };
        client.emit('subscribe', subscribeRequest, (subscribeResponse: SubscribeDeviceResponse) => {
          expect(subscribeResponse.success).toBe(true);

          // Then unsubscribe
          const unsubscribeRequest: UnsubscribeDeviceRequest = { mac, pid };
          client.emit('unsubscribe', unsubscribeRequest, (unsubscribeResponse: UnsubscribeDeviceResponse) => {
            expect(unsubscribeResponse.success).toBe(true);
            expect(unsubscribeResponse.message).toContain('Unsubscribed');
            done();
          });
        });
      });
    });

    test('should track user subscriptions', (done) => {
      client = ioClient(`${serverUrl}/user`, {
        transports: ['websocket'],
        auth: { token: userToken },
      });

      client.on('connect', () => {
        const subscribeRequest: SubscribeDeviceRequest = {
          mac: TEST_DATA.devices.device1.mac,
          pid: 1,
        };

        client.emit('subscribe', subscribeRequest, (subscribeResponse: SubscribeDeviceResponse) => {
          expect(subscribeResponse.success).toBe(true);

          // Get subscriptions list
          client.emit('getSubscriptions', (subscriptions: string[]) => {
            expect(subscriptions.length).toBeGreaterThan(0);
            expect(subscriptions[0]).toContain(TEST_DATA.devices.device1.mac);
            done();
          });
        });
      });
    });
  });

  describe('Multiple Client Connections', () => {
    let client1: ClientSocket;
    let client2: ClientSocket;

    afterEach(() => {
      if (client1 && client1.connected) client1.disconnect();
      if (client2 && client2.connected) client2.disconnect();
    });

    test('should support multiple simultaneous connections', (done) => {
      const token1 = generateTestToken({
        userId: TEST_DATA.users.user1.userId,
        username: TEST_DATA.users.user1.username,
      });

      const token2 = generateTestToken({
        userId: TEST_DATA.users.user2.userId,
        username: TEST_DATA.users.user2.username,
      });

      let connected = 0;

      const checkBothConnected = () => {
        connected++;
        if (connected === 2) {
          expect(client1.connected).toBe(true);
          expect(client2.connected).toBe(true);
          done();
        }
      };

      client1 = ioClient(`${serverUrl}/user`, {
        transports: ['websocket'],
        auth: { token: token1 },
      });

      client2 = ioClient(`${serverUrl}/user`, {
        transports: ['websocket'],
        auth: { token: token2 },
      });

      client1.on('connect', checkBothConnected);
      client2.on('connect', checkBothConnected);
    });

    test('should handle concurrent subscriptions from multiple clients', async () => {
      // Setup bindings for both users
      await testDb.getCollection('user.terminalBindings').insertMany([
        {
          userId: TEST_DATA.users.user1.userId,
          mac: TEST_DATA.devices.device1.mac,
          bindAt: new Date(),
        },
        {
          userId: TEST_DATA.users.user2.userId,
          mac: TEST_DATA.devices.device2.mac,
          bindAt: new Date(),
        },
      ]);

      const token1 = generateTestToken({
        userId: TEST_DATA.users.user1.userId,
        username: TEST_DATA.users.user1.username,
      });

      const token2 = generateTestToken({
        userId: TEST_DATA.users.user2.userId,
        username: TEST_DATA.users.user2.username,
      });

      return new Promise<void>((resolve, reject) => {
        let subscriptions = 0;

        const checkBothSubscribed = () => {
          subscriptions++;
          if (subscriptions === 2) {
            client1.disconnect();
            client2.disconnect();
            resolve();
          }
        };

        client1 = ioClient(`${serverUrl}/user`, {
          transports: ['websocket'],
          auth: { token: token1 },
        });

        client2 = ioClient(`${serverUrl}/user`, {
          transports: ['websocket'],
          auth: { token: token2 },
        });

        client1.on('connect', () => {
          client1.emit(
            'subscribe',
            { mac: TEST_DATA.devices.device1.mac, pid: 1 },
            (response: SubscribeDeviceResponse) => {
              expect(response.success).toBe(true);
              checkBothSubscribed();
            }
          );
        });

        client2.on('connect', () => {
          client2.emit(
            'subscribe',
            { mac: TEST_DATA.devices.device2.mac, pid: 1 },
            (response: SubscribeDeviceResponse) => {
              expect(response.success).toBe(true);
              checkBothSubscribed();
            }
          );
        });

        client1.on('connect_error', reject);
        client2.on('connect_error', reject);
      });
    });
  });

  describe('Disconnection Handling', () => {
    test('should clean up subscriptions on disconnect', (done) => {
      const token = generateTestToken({
        userId: TEST_DATA.users.user1.userId,
        username: TEST_DATA.users.user1.username,
      });

      // Add binding first
      testDb.getCollection('user.terminalBindings').insertOne({
        userId: TEST_DATA.users.user1.userId,
        mac: TEST_DATA.devices.device1.mac,
        bindAt: new Date(),
      }).then(() => {
        const client = ioClient(`${serverUrl}/user`, {
          transports: ['websocket'],
          auth: { token },
        });

        client.on('connect', () => {
          // Subscribe to device
          client.emit(
            'subscribe',
            { mac: TEST_DATA.devices.device1.mac, pid: 1 },
            (response: SubscribeDeviceResponse) => {
              expect(response.success).toBe(true);

              // Disconnect
              client.disconnect();

              // Verify disconnect event fired
              setTimeout(() => {
                expect(client.connected).toBe(false);
                done();
              }, 100);
            }
          );
        });
      });
    });
  });
});
