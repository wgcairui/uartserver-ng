/**
 * Socket.IO 服务
 * 管理与 Node 客户端的实时通信
 */

import { EventEmitter } from 'eventemitter3';
import type { Server as SocketIOServer, Socket } from 'socket.io';
import type {
  NodeClientToServerEvents,
  ServerToNodeClientEvents,
  InterServerEvents,
  SocketData,
  RegisterNodeRequest,
  RegisterNodeResponse,
  UpdateNodeInfoRequest,
  TerminalMountDevRegisterRequest,
  QueryResultRequest,
  OprateDtuResultRequest,
  HeartbeatRequest,
  HeartbeatResponse,
} from '../types/socket-events';
import type { Terminal } from '../types/entities/terminal.entity';
import { nodeService } from './node.service';
import { terminalService } from './terminal.service';
import { logger } from '../utils/logger';

/**
 * Node Socket 信息 (缓存在内存中)
 */
interface NodeSocketInfo {
  socketId: string;
  Name: string;
  IP: string;
  Port: number;
  MaxConnections: number;
  Connections: number;
  connectedAt: Date;
  lastHeartbeat: Date;
}

/**
 * 终端缓存信息
 */
interface TerminalCacheInfo {
  mac: string;
  name: string;
  mountNode: string;
  socketId: string; // 所属 Node 的 Socket ID
  online: boolean;
  mountDevs: Array<{
    pid: number;
    protocol: string;
    Type: string;
    online: boolean;
    minQueryLimit: number;
    lastEmit?: Date;
  }>;
  lastUpdate: Date;
}

/**
 * Socket.IO 服务类
 */
class SocketIoService extends EventEmitter {
  private io?: SocketIOServer<
    NodeClientToServerEvents,
    ServerToNodeClientEvents,
    InterServerEvents,
    SocketData
  >;

  // Node 客户端缓存: socketId → NodeSocketInfo
  private nodeMap: Map<string, NodeSocketInfo> = new Map();

  // Node 名称到 Socket ID 的映射: nodeName → socketId
  private nodeNameMap: Map<string, string> = new Map();

  // 终端缓存: mac → TerminalCacheInfo
  private terminalCache: Map<string, TerminalCacheInfo> = new Map();

  // 心跳定时器
  private heartbeatInterval?: NodeJS.Timeout;

  // 心跳超时时间 (ms)
  private readonly HEARTBEAT_TIMEOUT = 60000; // 60s

  // 心跳检查间隔 (ms)
  private readonly HEARTBEAT_CHECK_INTERVAL = 30000; // 30s

  /**
   * 初始化 Socket.IO 服务
   */
  initialize(io: SocketIOServer): void {
    this.io = io;
    logger.info('SocketIoService initialized');

    // 配置 /node namespace
    this.setupNodeNamespace();

    // 启动心跳检查
    this.startHeartbeatCheck();
  }

  /**
   * 配置 /node namespace (Node 客户端连接)
   */
  private setupNodeNamespace(): void {
    if (!this.io) {
      throw new Error('Socket.IO server not initialized');
    }

    const nodeNamespace = this.io.of('/node');

    // 连接中间件 - 认证
    nodeNamespace.use(async (socket, next) => {
      try {
        await this.authenticateConnection(socket);
        next();
      } catch (error) {
        logger.warn('Socket authentication failed:', error);
        next(new Error('Authentication failed'));
      }
    });

    // 连接事件
    nodeNamespace.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    logger.info('/node namespace configured');
  }

  /**
   * 认证连接
   *
   * 这里需要实现连接认证逻辑。考虑以下安全策略:
   * 1. 是否需要验证 Node 客户端的凭证 (token/secret)?
   * 2. 是否需要限制来源 IP?
   * 3. 是否需要检查 Node 名称是否已注册?
   * 4. 认证失败时的处理策略?
   *
   * TODO: 实现认证逻辑
   */
  private async authenticateConnection(
    socket: Socket<
      NodeClientToServerEvents,
      ServerToNodeClientEvents,
      InterServerEvents,
      SocketData
    >
  ): Promise<void> {
    // 初始化 socket.data
    socket.data.authenticated = false;
    socket.data.connectedAt = new Date();
    socket.data.lastHeartbeat = new Date();

    // TODO: 实现认证逻辑
    // 提示: 可以从 socket.handshake.auth 或 socket.handshake.query 中获取认证信息
    // 示例:
    // const { token, nodeName } = socket.handshake.auth;
    // if (!token || !this.verifyToken(token)) {
    //   throw new Error('Invalid token');
    // }

    // 暂时允许所有连接 (开发环境)
    socket.data.authenticated = true;

    logger.info(`Socket authenticated: ${socket.id}`);
  }

  /**
   * 处理连接
   */
  private handleConnection(
    socket: Socket<
      NodeClientToServerEvents,
      ServerToNodeClientEvents,
      InterServerEvents,
      SocketData
    >
  ): void {
    logger.info(`Node client connected: ${socket.id} from ${socket.handshake.address}`);

    // 注册事件处理器
    this.registerEventHandlers(socket);

    // 断开连接事件
    socket.on('disconnect', (reason) => {
      this.handleDisconnect(socket, reason);
    });
  }

  /**
   * 注册事件处理器
   */
  private registerEventHandlers(
    socket: Socket<
      NodeClientToServerEvents,
      ServerToNodeClientEvents,
      InterServerEvents,
      SocketData
    >
  ): void {
    // Node 注册
    socket.on('RegisterNode', async (data, callback) => {
      await this.handleRegisterNode(socket, data, callback);
    });

    // Node 信息更新
    socket.on('UpdateNodeInfo', async (data) => {
      await this.handleUpdateNodeInfo(socket, data);
    });

    // 终端挂载设备注册
    socket.on('TerminalMountDevRegister', async (data) => {
      await this.handleTerminalMountDevRegister(socket, data);
    });

    // 查询结果
    socket.on('queryResult', (data) => {
      this.handleQueryResult(socket, data);
    });

    // DTU 操作结果
    socket.on('OprateDTUResult', (data) => {
      this.handleOprateDtuResult(socket, data);
    });

    // 心跳
    socket.on('heartbeat', (data, callback) => {
      this.handleHeartbeat(socket, data, callback);
    });
  }

  /**
   * 处理 Node 注册
   */
  private async handleRegisterNode(
    socket: Socket<
      NodeClientToServerEvents,
      ServerToNodeClientEvents,
      InterServerEvents,
      SocketData
    >,
    data: RegisterNodeRequest,
    callback: (response: RegisterNodeResponse) => void
  ): Promise<void> {
    try {
      logger.info(`Node registering: ${data.Name} (${data.IP}:${data.Port})`);

      // 检查是否已存在同名 Node
      const existingSocketId = this.nodeNameMap.get(data.Name);
      if (existingSocketId && existingSocketId !== socket.id) {
        // 断开旧连接
        const oldSocket = this.io?.of('/node').sockets.get(existingSocketId);
        if (oldSocket) {
          logger.warn(`Disconnecting old Node connection: ${existingSocketId}`);
          oldSocket.disconnect(true);
        }
        this.nodeMap.delete(existingSocketId);
      }

      // 保存到数据库
      const node = await nodeService.createOrUpdateNode({
        Name: data.Name,
        IP: data.IP,
        Port: data.Port,
        MaxConnections: data.MaxConnections,
        Connections: 0,
      });

      // 更新缓存
      const nodeInfo: NodeSocketInfo = {
        socketId: socket.id,
        Name: data.Name,
        IP: data.IP,
        Port: data.Port,
        MaxConnections: data.MaxConnections,
        Connections: 0,
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
      };

      this.nodeMap.set(socket.id, nodeInfo);
      this.nodeNameMap.set(data.Name, socket.id);

      // 更新 socket.data
      socket.data.nodeName = data.Name;
      socket.data.nodeIP = data.IP;

      logger.info(`Node registered successfully: ${data.Name}`);

      callback({
        success: true,
        message: 'Node registered successfully',
        node,
      });
    } catch (error) {
      logger.error('Failed to register Node:', error);
      callback({
        success: false,
        message: error instanceof Error ? error.message : 'Registration failed',
      });
    }
  }

  /**
   * 处理 Node 信息更新
   */
  private async handleUpdateNodeInfo(
    socket: Socket<
      NodeClientToServerEvents,
      ServerToNodeClientEvents,
      InterServerEvents,
      SocketData
    >,
    data: UpdateNodeInfoRequest
  ): Promise<void> {
    try {
      const nodeInfo = this.nodeMap.get(socket.id);
      if (!nodeInfo) {
        logger.warn(`Node not found in cache: ${socket.id}`);
        return;
      }

      // 更新缓存
      nodeInfo.Connections = data.Connections;
      nodeInfo.lastHeartbeat = new Date();

      // 保存到数据库 (NodeRunInfo)
      // TODO: 实现 NodeRunInfo 存储逻辑

      logger.debug(`Node info updated: ${data.Name}, Connections: ${data.Connections}`);
    } catch (error) {
      logger.error('Failed to update Node info:', error);
    }
  }

  /**
   * 处理终端挂载设备注册
   */
  private async handleTerminalMountDevRegister(
    socket: Socket<
      NodeClientToServerEvents,
      ServerToNodeClientEvents,
      InterServerEvents,
      SocketData
    >,
    data: TerminalMountDevRegisterRequest
  ): Promise<void> {
    try {
      const nodeInfo = this.nodeMap.get(socket.id);
      if (!nodeInfo) {
        logger.warn(`Node not found for terminal registration: ${socket.id}`);
        return;
      }

      // 从数据库获取终端信息
      const terminal = await terminalService.getTerminal(data.mac);
      if (!terminal) {
        logger.warn(`Terminal not found: ${data.mac}`);
        return;
      }

      // 更新终端在线状态
      await terminalService.updateOnlineStatus(data.mac, true);

      // 更新缓存
      await this.updateTerminalCache(terminal, socket.id);

      logger.info(`Terminal registered: ${data.mac} on Node ${nodeInfo.Name}`);
    } catch (error) {
      logger.error('Failed to register terminal:', error);
    }
  }

  /**
   * 更新终端缓存
   */
  private async updateTerminalCache(
    terminal: Terminal,
    socketId: string
  ): Promise<void> {
    const cacheInfo: TerminalCacheInfo = {
      mac: terminal.DevMac,
      name: terminal.name,
      mountNode: terminal.mountNode,
      socketId,
      online: terminal.online,
      mountDevs: terminal.mountDevs.map((dev) => ({
        pid: dev.pid,
        protocol: dev.protocol,
        Type: dev.Type,
        online: dev.online ?? true,
        minQueryLimit: dev.minQueryLimit,
        lastEmit: dev.lastEmit,
      })),
      lastUpdate: new Date(),
    };

    this.terminalCache.set(terminal.DevMac, cacheInfo);
  }

  /**
   * 处理查询结果
   */
  private handleQueryResult(
    _socket: Socket<
      NodeClientToServerEvents,
      ServerToNodeClientEvents,
      InterServerEvents,
      SocketData
    >,
    data: QueryResultRequest
  ): void {
    // 触发内部事件 (用于 Promise 解析)
    this.emit(data.eventName, data);

    logger.debug(
      `Query result received: ${data.mac}:${data.pid}, success: ${data.success}`
    );
  }

  /**
   * 处理 DTU 操作结果
   */
  private handleOprateDtuResult(
    _socket: Socket<
      NodeClientToServerEvents,
      ServerToNodeClientEvents,
      InterServerEvents,
      SocketData
    >,
    data: OprateDtuResultRequest
  ): void {
    // 触发内部事件 (用于 Promise 解析)
    this.emit(data.eventName, data);

    logger.debug(`DTU operation result: ${data.mac}, type: ${data.type}, success: ${data.success}`);
  }

  /**
   * 处理心跳
   */
  private handleHeartbeat(
    socket: Socket<
      NodeClientToServerEvents,
      ServerToNodeClientEvents,
      InterServerEvents,
      SocketData
    >,
    _data: HeartbeatRequest,
    callback: (response: HeartbeatResponse) => void
  ): void {
    // 更新心跳时间
    socket.data.lastHeartbeat = new Date();

    const nodeInfo = this.nodeMap.get(socket.id);
    if (nodeInfo) {
      nodeInfo.lastHeartbeat = new Date();
    }

    callback({ timestamp: Date.now() });

    logger.debug(`Heartbeat received from ${socket.data.nodeName || socket.id}`);
  }

  /**
   * 处理断开连接
   */
  private handleDisconnect(
    socket: Socket<
      NodeClientToServerEvents,
      ServerToNodeClientEvents,
      InterServerEvents,
      SocketData
    >,
    reason: string
  ): void {
    logger.info(`Node client disconnected: ${socket.id}, reason: ${reason}`);

    const nodeInfo = this.nodeMap.get(socket.id);
    if (nodeInfo) {
      // 清理缓存
      this.nodeMap.delete(socket.id);
      this.nodeNameMap.delete(nodeInfo.Name);

      // 将该 Node 上的所有终端标记为离线
      this.markTerminalsOffline(socket.id);

      logger.info(`Node ${nodeInfo.Name} cleaned up`);
    }
  }

  /**
   * 将 Node 上的所有终端标记为离线
   */
  private async markTerminalsOffline(socketId: string): Promise<void> {
    const terminals = Array.from(this.terminalCache.values()).filter(
      (t) => t.socketId === socketId
    );

    for (const terminal of terminals) {
      try {
        await terminalService.updateOnlineStatus(terminal.mac, false);
        this.terminalCache.delete(terminal.mac);
        logger.debug(`Terminal ${terminal.mac} marked offline`);
      } catch (error) {
        logger.error(`Failed to mark terminal offline: ${terminal.mac}`, error);
      }
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
      this.checkHeartbeats();
    }, this.HEARTBEAT_CHECK_INTERVAL);

    logger.info('Heartbeat check started');
  }

  /**
   * 检查心跳超时
   */
  private checkHeartbeats(): void {
    const now = Date.now();

    for (const [socketId, nodeInfo] of this.nodeMap.entries()) {
      const lastHeartbeat = nodeInfo.lastHeartbeat.getTime();
      const elapsed = now - lastHeartbeat;

      if (elapsed > this.HEARTBEAT_TIMEOUT) {
        logger.warn(
          `Node ${nodeInfo.Name} heartbeat timeout (${elapsed}ms), disconnecting...`
        );

        // 断开连接
        const socket = this.io?.of('/node').sockets.get(socketId);
        if (socket) {
          socket.disconnect(true);
        }
      }
    }
  }

  /**
   * 停止心跳检查
   */
  private stopHeartbeatCheck(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  /**
   * 获取所有在线 Node
   */
  getOnlineNodes(): NodeSocketInfo[] {
    return Array.from(this.nodeMap.values());
  }

  /**
   * 根据名称获取 Node
   */
  getNodeByName(name: string): NodeSocketInfo | undefined {
    const socketId = this.nodeNameMap.get(name);
    return socketId ? this.nodeMap.get(socketId) : undefined;
  }

  /**
   * 获取终端缓存
   */
  getTerminalCache(mac: string): TerminalCacheInfo | undefined {
    return this.terminalCache.get(mac);
  }

  /**
   * 获取所有缓存的终端
   */
  getAllCachedTerminals(): TerminalCacheInfo[] {
    return Array.from(this.terminalCache.values());
  }

  /**
   * 清理服务
   */
  cleanup(): void {
    this.stopHeartbeatCheck();
    this.nodeMap.clear();
    this.nodeNameMap.clear();
    this.terminalCache.clear();
    this.removeAllListeners();
    logger.info('SocketIoService cleaned up');
  }
}

// 导出单例
export const socketIoService = new SocketIoService();
