/**
 * WebSocket 服务
 * 管理与浏览器用户的实时通信
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import type {
  UserClientToServerEvents,
  ServerToUserClientEvents,
  UserSocketData,
  UserAuthRequest,
  UserAuthResponse,
  SubscribeDeviceRequest,
  SubscribeDeviceResponse,
  UnsubscribeDeviceRequest,
  UnsubscribeDeviceResponse,
  UserHeartbeatRequest,
  DeviceUpdate,
  BatchDeviceUpdate,
  SubscriptionInfo,
} from '../types/websocket-events';
import { getRoomName, parseRoomName } from '../types/websocket-events';
import type { JwtPayload } from '../types/jwt';
import { extractUserId, extractUsername } from '../types/jwt';
import { mongodb } from '../database/mongodb';
import { logger } from '../utils/logger';
import { config } from '../config';

/**
 * 用户 Socket 类型
 */
type UserSocket = Socket<UserClientToServerEvents, ServerToUserClientEvents, {}, UserSocketData>;

/**
 * WebSocket 服务类
 * 处理浏览器用户的 WebSocket 连接和实时数据推送
 */
export class WebSocketService {
  private io: SocketIOServer | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  // 订阅信息缓存 (room → Set<userId>)
  private roomSubscribers = new Map<string, Set<string>>();

  // 用户订阅缓存 (userId → Set<room>)
  private userSubscriptions = new Map<string, Set<string>>();

  /**
   * 初始化 WebSocket 服务
   */
  async initialize(io: SocketIOServer): Promise<void> {
    this.io = io;

    // 配置 /user 命名空间
    const userNamespace = io.of('/user');

    // 连接中间件 - JWT 认证（可选）
    userNamespace.use(async (socket: UserSocket, next) => {
      try {
        // 初始化 socket.data
        socket.data.authenticated = false;
        socket.data.connectedAt = new Date();
        socket.data.lastHeartbeat = new Date();
        socket.data.subscriptions = new Set();

        // 如果提供了 token，尝试验证
        const token = socket.handshake.auth.token || socket.handshake.query.token;
        if (token && typeof token === 'string') {
          const decoded = await this.verifyToken(token);
          if (decoded) {
            socket.data.userId = decoded.userId;
            socket.data.username = decoded.username;
            socket.data.authenticated = true;
          }
        }

        next();
      } catch (error) {
        logger.error('WebSocket connection middleware error:', error);
        next(new Error('Authentication failed'));
      }
    });

    // 连接事件
    userNamespace.on('connection', (socket: UserSocket) => {
      this.handleConnection(socket);
    });

    // 启动心跳检查（每 30 秒）
    this.startHeartbeatCheck();

    logger.info('WebSocket service initialized on /user namespace');
  }

  /**
   * 处理用户连接
   */
  private handleConnection(socket: UserSocket): void {
    const userId = socket.data.userId || 'anonymous';
    logger.info(`User connected: ${userId} (${socket.id})`);

    // 认证事件
    socket.on('auth', async (data: UserAuthRequest, callback) => {
      try {
        const result = await this.handleAuth(socket, data);
        callback(result);
      } catch (error) {
        callback({
          success: false,
          message: error instanceof Error ? error.message : 'Authentication failed',
        });
      }
    });

    // 订阅事件
    socket.on('subscribe', async (data: SubscribeDeviceRequest, callback) => {
      try {
        const result = await this.handleSubscribe(socket, data);
        callback(result);
      } catch (error) {
        callback({
          success: false,
          message: error instanceof Error ? error.message : 'Subscription failed',
        });
      }
    });

    // 取消订阅事件
    socket.on('unsubscribe', async (data: UnsubscribeDeviceRequest, callback) => {
      try {
        const result = await this.handleUnsubscribe(socket, data);
        callback(result);
      } catch (error) {
        callback({
          success: false,
          message: error instanceof Error ? error.message : 'Unsubscribe failed',
        });
      }
    });

    // 心跳事件
    socket.on('heartbeat', (data: UserHeartbeatRequest, callback) => {
      socket.data.lastHeartbeat = new Date();
      callback({
        timestamp: data.timestamp,
        serverTime: Date.now(),
      });
    });

    // 获取订阅列表
    socket.on('getSubscriptions', (callback) => {
      callback(Array.from(socket.data.subscriptions));
    });

    // 断开连接
    socket.on('disconnect', (reason) => {
      this.handleDisconnect(socket, reason);
    });
  }

  /**
   * 处理认证
   */
  private async handleAuth(
    socket: UserSocket,
    data: UserAuthRequest
  ): Promise<UserAuthResponse> {
    try {
      const decoded = await this.verifyToken(data.token);
      if (!decoded) {
        return {
          success: false,
          message: 'Invalid token',
        };
      }

      // 更新 socket 数据
      socket.data.userId = decoded.userId;
      socket.data.username = decoded.username;
      socket.data.authenticated = true;

      logger.info(`User authenticated: ${decoded.userId}`);

      return {
        success: true,
        user: {
          userId: decoded.userId,
          username: decoded.username,
        },
      };
    } catch (error) {
      logger.error('Authentication error:', error);
      return {
        success: false,
        message: 'Authentication failed',
      };
    }
  }

  /**
   * 检查用户是否有权限访问设备
   * @param userId - 用户 ID（可能为 undefined，表示匿名用户）
   * @param mac - 设备 MAC 地址
   * @param pid - 协议 ID
   * @returns 是否有权限
   */
  private async checkDevicePermission(
    userId: string | undefined,
    mac: string,
    pid: number
  ): Promise<boolean> {
    try {
      // 匿名用户无权限
      if (!userId) {
        logger.debug(`Anonymous user attempted to access device ${mac}/${pid}`);
        return false;
      }

      // 检查用户是否绑定了该设备
      // 注意：这里假设存在 user.terminalBindings 集合，结构为 { userId, mac }
      // 如果你的数据模型不同，请相应调整查询逻辑
      const binding = await mongodb
        .getCollection('user.terminalBindings')
        .findOne({ userId, mac });

      if (binding) {
        logger.debug(`User ${userId} has permission for device ${mac}/${pid}`);
        return true;
      }

      // TODO: 可以添加额外的权限检查逻辑
      // 例如：管理员用户可以访问所有设备
      // 例如：检查用户所属组织是否拥有该设备

      logger.debug(`User ${userId} does not have permission for device ${mac}/${pid}`);
      return false;
    } catch (error) {
      logger.error('Error checking device permission:', error);
      return false; // 出错时默认拒绝访问
    }
  }

  /**
   * 处理订阅
   */
  private async handleSubscribe(
    socket: UserSocket,
    data: SubscribeDeviceRequest
  ): Promise<SubscribeDeviceResponse> {
    try {
      const { mac, pid } = data;

      // 验证输入
      if (!mac || typeof mac !== 'string') {
        return {
          success: false,
          message: 'Invalid MAC address',
        };
      }

      if (typeof pid !== 'number' || pid < 0) {
        return {
          success: false,
          message: 'Invalid PID',
        };
      }

      // 验证用户权限
      const hasPermission = await this.checkDevicePermission(socket.data.userId, mac, pid);
      if (!hasPermission) {
        logger.warn(
          `User ${socket.data.userId || socket.id} attempted to subscribe to device ${mac}/${pid} without permission`
        );
        return {
          success: false,
          message: 'Permission denied: You do not have access to this device',
        };
      }

      const room = getRoomName(mac, pid);

      // 加入房间
      await socket.join(room);
      socket.data.subscriptions.add(room);

      // 更新缓存
      if (!this.roomSubscribers.has(room)) {
        this.roomSubscribers.set(room, new Set());
      }
      this.roomSubscribers.get(room)!.add(socket.data.userId || socket.id);

      const userId = socket.data.userId || socket.id;
      if (!this.userSubscriptions.has(userId)) {
        this.userSubscriptions.set(userId, new Set());
      }
      this.userSubscriptions.get(userId)!.add(room);

      logger.info(`User ${userId} subscribed to ${room}`);

      return {
        success: true,
        message: 'Subscribed successfully',
        room,
      };
    } catch (error) {
      logger.error('Subscribe error:', error);
      return {
        success: false,
        message: 'Subscription failed',
      };
    }
  }

  /**
   * 处理取消订阅
   */
  private async handleUnsubscribe(
    socket: UserSocket,
    data: UnsubscribeDeviceRequest
  ): Promise<UnsubscribeDeviceResponse> {
    try {
      const { mac, pid } = data;
      const room = getRoomName(mac, pid);

      // 离开房间
      await socket.leave(room);
      socket.data.subscriptions.delete(room);

      // 更新缓存
      const userId = socket.data.userId || socket.id;
      this.roomSubscribers.get(room)?.delete(userId);
      this.userSubscriptions.get(userId)?.delete(room);

      // 清理空房间
      if (this.roomSubscribers.get(room)?.size === 0) {
        this.roomSubscribers.delete(room);
      }

      logger.info(`User ${userId} unsubscribed from ${room}`);

      return {
        success: true,
        message: 'Unsubscribed successfully',
      };
    } catch (error) {
      logger.error('Unsubscribe error:', error);
      return {
        success: false,
        message: 'Unsubscribe failed',
      };
    }
  }

  /**
   * 处理断开连接
   */
  private handleDisconnect(socket: UserSocket, reason: string): void {
    const userId = socket.data.userId || socket.id;
    logger.info(`User disconnected: ${userId}, reason: ${reason}`);

    // 清理订阅缓存
    for (const room of socket.data.subscriptions) {
      this.roomSubscribers.get(room)?.delete(userId);
      if (this.roomSubscribers.get(room)?.size === 0) {
        this.roomSubscribers.delete(room);
      }
    }

    this.userSubscriptions.delete(userId);
  }

  /**
   * 推送设备更新到房间
   */
  pushToRoom(room: string, update: DeviceUpdate): void {
    if (!this.io) {
      logger.warn('WebSocket service not initialized');
      return;
    }

    const userNamespace = this.io.of('/user');
    userNamespace.to(room).emit('update', update);

    logger.debug(`Pushed update to room ${room}`, {
      type: update.type,
      subscriberCount: this.roomSubscribers.get(room)?.size || 0,
    });
  }

  /**
   * 批量推送（性能优化）
   */
  pushBatchToRoom(room: string, updates: DeviceUpdate[]): void {
    if (!this.io) {
      logger.warn('WebSocket service not initialized');
      return;
    }

    if (updates.length === 0) {
      return;
    }

    const userNamespace = this.io.of('/user');
    const batch: BatchDeviceUpdate = {
      updates,
      timestamp: Date.now(),
    };

    userNamespace.to(room).emit('batchUpdate', batch);

    logger.debug(`Pushed batch update to room ${room}`, {
      count: updates.length,
      subscriberCount: this.roomSubscribers.get(room)?.size || 0,
    });
  }

  /**
   * 验证 JWT Token
   */
  private async verifyToken(
    token: string
  ): Promise<{ userId: string; username?: string } | null> {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET) as JwtPayload;

      const userId = extractUserId(decoded);
      if (!userId) {
        logger.warn('JWT token does not contain userId field');
        return null;
      }

      return {
        userId,
        username: extractUsername(decoded),
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        logger.warn('JWT token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('Invalid JWT token:', error.message);
      } else {
        logger.error('Token verification failed:', error);
      }
      return null;
    }
  }

  /**
   * 启动心跳检查
   */
  private startHeartbeatCheck(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (!this.io) return;

      const userNamespace = this.io.of('/user');
      const now = Date.now();
      const timeout = 60000; // 60 秒超时

      userNamespace.fetchSockets().then((sockets) => {
        for (const socket of sockets as UserSocket[]) {
          const lastHeartbeat = socket.data.lastHeartbeat?.getTime() || 0;
          if (now - lastHeartbeat > timeout) {
            logger.warn(`User ${socket.data.userId || socket.id} heartbeat timeout, disconnecting`);
            socket.disconnect(true);
          }
        }
      });
    }, 30000); // 每 30 秒检查一次
  }

  /**
   * 获取房间订阅者数量
   */
  getRoomSubscriberCount(mac: string, pid: number): number {
    const room = getRoomName(mac, pid);
    return this.roomSubscribers.get(room)?.size || 0;
  }

  /**
   * 获取所有活跃订阅
   */
  getAllSubscriptions(): SubscriptionInfo[] {
    const subscriptions: SubscriptionInfo[] = [];

    for (const [room, subscribers] of this.roomSubscribers.entries()) {
      const parsed = parseRoomName(room);
      if (!parsed) continue;

      for (const userId of subscribers) {
        subscriptions.push({
          mac: parsed.mac,
          pid: parsed.pid,
          room,
          subscribedAt: new Date(), // TODO: 记录实际订阅时间
          userId,
        });
      }
    }

    return subscriptions;
  }

  /**
   * 停止服务
   */
  async shutdown(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    this.roomSubscribers.clear();
    this.userSubscriptions.clear();

    logger.info('WebSocket service shutdown');
  }
}

export const webSocketService = new WebSocketService();
