/**
 * Socket.IO 服务
 * 管理与 Node 客户端的实时通信
 */

import { EventEmitter } from 'eventemitter3';
import type { Server as SocketIOServer, Socket } from 'socket.io';
import { crc16modbus } from 'crc';
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
  InstructQueryRequest,
  OprateDtuRequest,
  DtuOperationType,
  TerminalOnlineRequest,
  TerminalOfflineRequest,
  InstructTimeOutRequest,
  TerminalMountDevTimeOutRequest,
  BusyStatusRequest,
  NodeReadyCallback,
  StartErrorRequest,
  AlarmRequest,
} from '../types/socket-events';
import type { Terminal } from '../types/entities/terminal.entity';
import { nodeService } from './node.service';
import { terminalService } from './terminal.service';
import { protocolService, type Protocol } from './protocol.service';
import { resultService } from './result.service';
import { dtuOperationLogService } from './dtu-operation-log.service';
import { socketUserService } from './socket-user.service';
import { logger } from '../utils/logger';
import { config } from '../config';
import { terminalCache } from '../repositories/terminal-cache';

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
 * 挂载设备查询缓存信息（扩展）
 */
interface MountDevQueryCache {
  TerminalMac: string; // 终端 MAC
  mountNode: string; // 挂载节点
  protocol: string; // 协议名称
  pid: number; // 设备 PID
  Type: string; // 设备类型
  mountDev: string; // 挂载设备 ID
  Interval: number; // 查询间隔 (ms)
  minQueryLimit: number; // 最小查询限制 (ms)
  devs: number; // 同一终端下的设备数量
  bye: number; // 跳过权重（用于负载均衡）
  online: boolean; // 在线状态
  lastEmit?: Date; // 最后发送时间
  lastRecord?: Date; // 最后记录时间
}

/**
 * 指令查询结果
 */
export interface InstructQueryResult {
  ok: number; // 1 成功，0 失败
  msg?: string; // 消息
  data?: any; // 结果数据
  useTime?: number; // 耗时 (ms)
}

/**
 * DTU 操作结果
 */
export interface OprateDtuResult {
  ok: number; // 1 成功，0 失败
  msg?: string; // 消息
  data?: any; // 结果数据
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

  // 协议缓存: protocol → Protocol
  private proMap: Map<string, Protocol> = new Map();

  // 指令缓存: (protocol + pid + instructName) → 生成的指令内容
  private CacheQueryInstruct: Map<string, string> = new Map();

  // 查询缓存: (mac + pid) → MountDevQueryCache
  private queryCache: Map<string, MountDevQueryCache> = new Map();

  // 心跳定时器
  private heartbeatInterval?: NodeJS.Timeout;

  // 查询调度定时器
  private querySchedulerInterval?: NodeJS.Timeout;

  // 定时任务定时器
  private nodeInfoInterval?: NodeJS.Timeout;
  private clearCacheInterval?: NodeJS.Timeout;
  private clearNodeMapInterval?: NodeJS.Timeout;

  // 心跳超时时间 (ms)
  private readonly HEARTBEAT_TIMEOUT = 60000; // 60s

  // 心跳检查间隔 (ms)
  private readonly HEARTBEAT_CHECK_INTERVAL = 30000; // 30s

  // 查询调度间隔 (ms)
  private readonly QUERY_SCHEDULER_INTERVAL = 500; // 500ms

  // 定时任务间隔 (ms)
  private readonly NODE_INFO_INTERVAL = 60000; // 1分钟
  private readonly CLEAR_CACHE_INTERVAL = 600000; // 10分钟
  private readonly CLEAR_NODEMAP_INTERVAL = 3600000; // 1小时

  // 当前轮次处理过的 MAC 地址集合（用于负载均衡）
  private hundleMacs: Set<string> = new Set();

  // 设备忙碌状态缓存
  private busyDevices: Set<string> = new Set();

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

    // 启动查询调度循环
    this.startQueryScheduler();

    // 启动定时任务
    this.startScheduledTasks();
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
   * 实现基于配置的灵活认证策略:
   * - 开发环境: 跳过认证（快速测试）
   * - 生产环境: 必须提供正确的 NODE_SECRET
   * - 支持从 socket.handshake.auth 或 query 中获取 token
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

    // 获取 Node Secret 配置
    const nodeSecret = config.NODE_SECRET;
    const isDevelopment = config.NODE_ENV === 'development';

    // 开发环境或未配置 secret 时跳过认证
    if (isDevelopment || nodeSecret.includes('change-this')) {
      socket.data.authenticated = true;
      logger.info(`Socket authenticated (dev mode): ${socket.id} from ${socket.handshake.address}`);
      return;
    }

    // 生产环境：验证 token
    // 尝试从 auth 或 query 中获取 token
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      logger.warn(`Authentication failed: No token provided from ${socket.handshake.address}`);
      throw new Error('Authentication token required');
    }

    // 验证 token
    if (token !== nodeSecret) {
      logger.warn(`Authentication failed: Invalid token from ${socket.handshake.address}`);
      throw new Error('Invalid authentication token');
    }

    // 认证成功
    socket.data.authenticated = true;
    logger.info(`Socket authenticated: ${socket.id} from ${socket.handshake.address}`);
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

    // 终端生命周期事件
    socket.on('terminalOn', async (data) => {
      await this.handleTerminalOnline(socket, data);
    });

    socket.on('terminalOff', async (data) => {
      await this.handleTerminalOffline(socket, data);
    });

    socket.on('instructTimeOut', async (data) => {
      await this.handleInstructTimeOut(socket, data);
    });

    socket.on('terminalMountDevTimeOut', async (data) => {
      await this.handleTerminalMountDevTimeOut(socket, data);
    });

    socket.on('busy', async (data) => {
      await this.handleBusy(socket, data);
    });

    socket.on('ready', async (callback) => {
      await this.handleReady(socket, callback);
    });

    // 错误和告警事件
    socket.on('startError', async (data) => {
      await this.handleStartError(socket, data);
    });

    socket.on('alarm', async (data) => {
      await this.handleAlarm(socket, data);
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
  private async handleQueryResult(
    socket: Socket<
      NodeClientToServerEvents,
      ServerToNodeClientEvents,
      InterServerEvents,
      SocketData
    >,
    data: QueryResultRequest
  ): Promise<void> {
    // 触发内部事件 (用于 Promise 解析)
    this.emit(data.eventName, data);

    logger.debug(
      `Query result received: ${data.mac}/${data.pid}, success: ${data.success}, useTime: ${data.useTime}ms`
    );

    // 处理成功的查询结果
    if (data.success && data.data) {
      try {
        // 获取查询间隔（从 queryCache 或使用默认值）
        const queryCacheKey = `${data.mac}${data.pid}`;
        const queryCache = this.queryCache.get(queryCacheKey);
        const interval = queryCache?.Interval ?? 5000; // 默认 5000ms

        // 1. 存储结果到 MongoDB（必须先完成）
        await resultService.saveQueryResult({
          mac: data.mac,
          pid: data.pid,
          result: data.data.result,
          timeStamp: data.data.timeStamp,
          useTime: data.data.useTime,
          parentId: data.data.parentId,
          hasAlarm: data.data.hasAlarm,
          Interval: interval,
        });

        // 2-3. 并行更新时间戳和在线状态（可以同时执行）
        const [recordUpdated, statusUpdated] = await Promise.all([
          terminalService.updateMountDeviceLastRecord(data.mac, data.pid, new Date()),
          terminalService.updateMountDeviceOnlineStatus(data.mac, data.pid, true),
        ]);

        // 检查更新结果并记录警告
        if (!recordUpdated) {
          logger.warn(`Failed to update lastRecord for ${data.mac}/${data.pid} - device may not exist`);
        }
        if (!statusUpdated) {
          logger.warn(`Failed to update online status for ${data.mac}/${data.pid} - device may not exist`);
        }

        logger.debug(`Result stored successfully: ${data.mac}/${data.pid}, ${data.data.result.length} items`);

        // 发送确认事件回客户端 (用于性能测试等场景)
        socket.emit(data.eventName, {
          success: true,
          mac: data.mac,
          pid: data.pid,
        });
      } catch (error) {
        logger.error(`Failed to process query result for ${data.mac}/${data.pid}:`, error);
        // 发送失败事件回客户端
        socket.emit(data.eventName, {
          success: false,
          mac: data.mac,
          pid: data.pid,
          error: String(error),
        });
      }
    } else {
      // 查询失败处理
      logger.warn(`Query failed: ${data.mac}/${data.pid}, error: ${data.error || 'unknown'}`);

      // 发送失败确认回客户端
      socket.emit(data.eventName, {
        success: false,
        mac: data.mac,
        pid: data.pid,
        error: data.error || 'unknown',
      });

      // 如果查询失败，可能需要标记设备离线（可选，根据业务逻辑）
      // await terminalService.updateMountDeviceOnlineStatus(data.mac, data.pid, false);
    }
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
   * 处理终端上线
   */
  private async handleTerminalOnline(
    socket: Socket<
      NodeClientToServerEvents,
      ServerToNodeClientEvents,
      InterServerEvents,
      SocketData
    >,
    data: TerminalOnlineRequest
  ): Promise<void> {
    try {
      const nodeInfo = this.nodeMap.get(socket.id);
      if (!nodeInfo) {
        logger.warn(`Node not found for terminal online: ${socket.id}`);
        return;
      }

      const macs = Array.isArray(data.mac) ? data.mac : [data.mac];

      for (const mac of macs) {
        // 更新终端在线状态
        await terminalService.updateOnlineStatus(mac, true);

        // 更新缓存
        const terminal = await terminalService.getTerminal(mac);
        if (terminal) {
          await this.updateTerminalCache(terminal, socket.id);
          logger.info(`Terminal online: ${mac} on Node ${nodeInfo.Name}${data.reline ? ' (reconnect)' : ''}`);
        }

        // 通知 Repository 缓存：终端上线，设置永久 TTL
        terminalCache.onTerminalOnline(mac);

        // 移除忙碌状态
        this.busyDevices.delete(mac);

        // 刷新查询缓存
        await this.setTerminalMountDevCache(mac);

        // 推送设备上线通知给订阅用户
        await socketUserService.sendMacUpdate(mac, {
          type: 'online',
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      logger.error('Failed to handle terminal online:', error);
    }
  }

  /**
   * 处理终端下线
   */
  private async handleTerminalOffline(
    socket: Socket<
      NodeClientToServerEvents,
      ServerToNodeClientEvents,
      InterServerEvents,
      SocketData
    >,
    data: TerminalOfflineRequest
  ): Promise<void> {
    try {
      const nodeInfo = this.nodeMap.get(socket.id);
      if (!nodeInfo) {
        logger.warn(`Node not found for terminal offline: ${socket.id}`);
        return;
      }

      // 更新终端在线状态
      await terminalService.updateOnlineStatus(data.mac, false);

      // 从缓存中移除
      this.terminalCache.delete(data.mac);

      // 通知 Repository 缓存：终端下线，设置 TTL
      terminalCache.onTerminalOffline(data.mac);

      // 删除查询缓存
      const terminal = await terminalService.getTerminal(data.mac);
      if (terminal?.mountDevs) {
        for (const dev of terminal.mountDevs) {
          this.delTerminalMountDevCache(data.mac, dev.pid);
        }
      }

      // 移除忙碌状态
      this.busyDevices.delete(data.mac);

      logger.info(`Terminal offline: ${data.mac} from Node ${nodeInfo.Name}, active: ${data.active}`);

      // 推送设备下线通知给订阅用户
      await socketUserService.sendMacUpdate(data.mac, {
        type: 'offline',
        timestamp: Date.now(),
        data: { active: data.active },
      });
    } catch (error) {
      logger.error('Failed to handle terminal offline:', error);
    }
  }

  /**
   * 处理指令超时
   */
  private async handleInstructTimeOut(
    socket: Socket<
      NodeClientToServerEvents,
      ServerToNodeClientEvents,
      InterServerEvents,
      SocketData
    >,
    data: InstructTimeOutRequest
  ): Promise<void> {
    try {
      const nodeInfo = this.nodeMap.get(socket.id);
      if (!nodeInfo) {
        logger.warn(`Node not found for instruct timeout: ${socket.id}`);
        return;
      }

      // 更新设备在线状态（部分超时仍然在线）
      await terminalService.updateMountDeviceOnlineStatus(data.mac, data.pid, true);

      logger.warn(
        `Instruct timeout: ${data.mac}/${data.pid}, instructions: ${data.instruct.join(', ')}, Node: ${nodeInfo.Name}`
      );

      // 发送指令超时告警给用户
      await socketUserService.sendMacAlarm(data.mac, data.pid, {
        type: 'timeout',
        level: 'warning',
        message: `设备指令超时: ${data.instruct.join(', ')}`,
        data: {
          instruct: data.instruct,
          node: nodeInfo.Name,
        },
      });
    } catch (error) {
      logger.error('Failed to handle instruct timeout:', error);
    }
  }

  /**
   * 处理设备查询超时
   */
  private async handleTerminalMountDevTimeOut(
    socket: Socket<
      NodeClientToServerEvents,
      ServerToNodeClientEvents,
      InterServerEvents,
      SocketData
    >,
    data: TerminalMountDevTimeOutRequest
  ): Promise<void> {
    try {
      const nodeInfo = this.nodeMap.get(socket.id);
      if (!nodeInfo) {
        logger.warn(`Node not found for terminal mount dev timeout: ${socket.id}`);
        return;
      }

      // 如果超时次数 > 10，标记设备离线
      if (data.timeOut > 10) {
        await terminalService.updateMountDeviceOnlineStatus(data.mac, data.pid, false);

        logger.warn(
          `Terminal mount device timeout (${data.timeOut} times): ${data.mac}/${data.pid}, Node: ${nodeInfo.Name}`
        );

        // 发送设备查询超时告警给用户
        await socketUserService.sendMacAlarm(data.mac, data.pid, {
          type: 'timeout',
          level: 'error',
          message: `设备查询连续超时 ${data.timeOut} 次，已标记为离线`,
          data: {
            timeOut: data.timeOut,
            node: nodeInfo.Name,
          },
        });
      }
    } catch (error) {
      logger.error('Failed to handle terminal mount dev timeout:', error);
    }
  }

  /**
   * 处理设备忙碌状态
   */
  private async handleBusy(
    _socket: Socket<
      NodeClientToServerEvents,
      ServerToNodeClientEvents,
      InterServerEvents,
      SocketData
    >,
    data: BusyStatusRequest
  ): Promise<void> {
    try {
      if (data.busy) {
        this.busyDevices.add(data.mac);
        logger.debug(`Device ${data.mac} is busy, queue: ${data.n}`);
      } else {
        this.busyDevices.delete(data.mac);
        logger.debug(`Device ${data.mac} is idle`);
      }

      // TODO: 可选 - 保存设备忙碌日志到数据库
      // await logDevBusyService.save({
      //   mac: data.mac,
      //   stat: data.busy,
      //   n: data.n,
      //   timeStamp: Date.now(),
      // });
    } catch (error) {
      logger.error('Failed to handle busy status:', error);
    }
  }

  /**
   * 处理节点就绪事件
   */
  private async handleReady(
    socket: Socket<
      NodeClientToServerEvents,
      ServerToNodeClientEvents,
      InterServerEvents,
      SocketData
    >,
    callback: NodeReadyCallback
  ): Promise<void> {
    try {
      const nodeInfo = this.nodeMap.get(socket.id);
      if (!nodeInfo) {
        logger.warn(`Node not found for ready event: ${socket.id}`);
        return;
      }

      // 刷新该节点的所有终端缓存
      const terminals = await terminalService.getTerminalsByNode(nodeInfo.Name);

      for (const terminal of terminals) {
        await this.setTerminalMountDevCache(terminal.DevMac);
      }

      logger.info(`Node ready: ${nodeInfo.Name}, terminals: ${terminals.length}`);

      // 返回节点名称
      callback(nodeInfo.Name);
    } catch (error) {
      logger.error('Failed to handle ready event:', error);
    }
  }

  /**
   * 处理节点启动失败事件
   */
  private async handleStartError(
    socket: Socket<
      NodeClientToServerEvents,
      ServerToNodeClientEvents,
      InterServerEvents,
      SocketData
    >,
    data: StartErrorRequest
  ): Promise<void> {
    try {
      const nodeInfo = this.nodeMap.get(socket.id);
      if (!nodeInfo) {
        logger.warn(`Node not found for start error: ${socket.id}`);
        return;
      }

      logger.error(`Node ${nodeInfo.Name} start error: ${data.error}`);

      // TODO: 记录到节点日志
      // await logNodeService.save({
      //   type: 'TcpServer启动失败',
      //   ID: socket.id,
      //   IP: nodeInfo.IP,
      //   Name: nodeInfo.Name,
      //   error: data.error,
      // });
    } catch (error) {
      logger.error('Failed to handle start error:', error);
    }
  }

  /**
   * 处理告警事件
   */
  private async handleAlarm(
    socket: Socket<
      NodeClientToServerEvents,
      ServerToNodeClientEvents,
      InterServerEvents,
      SocketData
    >,
    data: AlarmRequest
  ): Promise<void> {
    try {
      const nodeInfo = this.nodeMap.get(socket.id);
      if (!nodeInfo) {
        logger.warn(`Node not found for alarm: ${socket.id}`);
        return;
      }

      logger.warn(`Alarm from ${nodeInfo.Name}: ${JSON.stringify(data)}`);

      // TODO: 处理告警，发送给用户
      // await this.sendUserAlarm(data.mac, 0, data.alarm);
    } catch (error) {
      logger.error('Failed to handle alarm:', error);
    }
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

  // ============================================================
  // 查询调度系统
  // ============================================================

  /**
   * 启动查询调度循环
   */
  private startQueryScheduler(): void {
    if (this.querySchedulerInterval) {
      return; // 已经启动
    }

    this.querySchedulerInterval = setInterval(() => {
      this.runQueryScheduler();
    }, this.QUERY_SCHEDULER_INTERVAL);

    logger.info('Query scheduler started');
  }

  /**
   * 停止查询调度循环
   */
  private stopQueryScheduler(): void {
    if (this.querySchedulerInterval) {
      clearInterval(this.querySchedulerInterval);
      this.querySchedulerInterval = undefined;
      logger.info('Query scheduler stopped');
    }
  }

  /**
   * 启动定时任务
   */
  private startScheduledTasks(): void {
    // 1. nodeInfo 定时任务 - 每分钟
    if (!this.nodeInfoInterval) {
      this.nodeInfoInterval = setInterval(() => {
        this.nodeInfo();
      }, this.NODE_INFO_INTERVAL);
      logger.info('NodeInfo task started (interval: 1 minute)');
    }

    // 2. clear_Cache 定时任务 - 每10分钟
    if (!this.clearCacheInterval) {
      this.clearCacheInterval = setInterval(() => {
        this.clear_Cache();
      }, this.CLEAR_CACHE_INTERVAL);
      logger.info('ClearCache task started (interval: 10 minutes)');
    }

    // 3. clear_nodeMap 定时任务 - 每小时
    if (!this.clearNodeMapInterval) {
      this.clearNodeMapInterval = setInterval(() => {
        this.clear_nodeMap();
      }, this.CLEAR_NODEMAP_INTERVAL);
      logger.info('ClearNodeMap task started (interval: 1 hour)');
    }
  }

  /**
   * 停止定时任务
   */
  private stopScheduledTasks(): void {
    if (this.nodeInfoInterval) {
      clearInterval(this.nodeInfoInterval);
      this.nodeInfoInterval = undefined;
      logger.info('NodeInfo task stopped');
    }

    if (this.clearCacheInterval) {
      clearInterval(this.clearCacheInterval);
      this.clearCacheInterval = undefined;
      logger.info('ClearCache task stopped');
    }

    if (this.clearNodeMapInterval) {
      clearInterval(this.clearNodeMapInterval);
      this.clearNodeMapInterval = undefined;
      logger.info('ClearNodeMap task stopped');
    }
  }

  /**
   * 执行一轮查询调度
   * 遍历所有缓存的挂载设备，按权重和间隔发送查询指令
   */
  private async runQueryScheduler(): Promise<void> {
    // 清空本轮已处理的 MAC 集合
    this.hundleMacs.clear();

    // 获取所有查询缓存，按权重排序（bye 越大越优先）
    const queries = Array.from(this.queryCache.values()).sort((a, b) => b.bye - a.bye);

    for (const query of queries) {
      try {
        await this.sendQueryInstruct(query);
      } catch (error) {
        logger.error(`Failed to send query for ${query.TerminalMac}/${query.pid}:`, error);
      }
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
 * 发送查询指令
 * @param query - 查询缓存信息
 */
private async sendQueryInstruct(query: MountDevQueryCache): Promise<void> {
  const mac = query.TerminalMac;

  // 负载均衡：如果同一个 DTU 的设备在这轮已被处理，增加权重，下轮优先处理
  if (query.devs > 1) {
    if (this.hundleMacs.has(mac)) {
      query.bye += 1;
      return;
    }
    this.hundleMacs.add(mac);

    // 获取终端信息，检查设备是否可以查询
    const terminal = await terminalService.getTerminal(mac);
    if (!terminal) {
      return;
    }

    // 查找当前设备
    const currentDev = terminal.mountDevs?.find((dev) => dev.pid === query.pid);
    if (!currentDev) {
      return;
    }

    // 检查查询间隔
    if (currentDev.lastEmit) {
      const elapsed = Date.now() - currentDev.lastEmit.getTime();
      if (elapsed < query.Interval - 1000) {
        return;
      }

      // 检查是否有未返回的查询
      if (
        currentDev.lastRecord &&
        currentDev.lastRecord < currentDev.lastEmit &&
        currentDev.lastEmit.getTime() - currentDev.lastRecord.getTime() < 30000 &&
        Date.now() - currentDev.lastEmit.getTime() < 60000
      ) {
        logger.debug(`Query ${mac}/${query.pid} waiting for previous result, skip`);
        query.bye += 1;
        return;
      }
    }

    // 检查兄弟设备是否正在占用通道
    for (const dev of terminal.mountDevs || []) {
      if (dev.pid !== query.pid) {
        if (
          dev.lastEmit &&
          Date.now() - dev.lastEmit.getTime() < 10000 &&
          dev.lastRecord &&
          dev.lastRecord < dev.lastEmit &&
          Date.now() - dev.lastRecord.getTime() < 60000
        ) {
          logger.debug(`Query ${mac}/${query.pid} channel busy by sibling ${dev.pid}`);
          query.bye += 1;
          return;
        }
      }
    }
  }

  // 获取协议
  const protocol = await this.cacheProtocol(query.protocol);
  if (!protocol) {
    logger.warn(`Protocol ${query.protocol} not found for ${mac}/${query.pid}`);
    return;
  }

  // 生成查询指令内容
  const content = this.generateQueryInstructs(protocol, query.pid);

  // 发送查询指令到 Node 客户端
  const socketId = this.nodeNameMap.get(query.mountNode);
  if (!socketId) {
    return;
  }

  const socket = this.io?.of('/node').sockets.get(socketId);
  if (!socket) {
    return;
  }

  // 构建查询对象
  const queryRequest: InstructQueryRequest = {
    eventName: `query_${mac}_${query.pid}_${Date.now()}`,
    mac,
    pid: query.pid,
    protocol: query.protocol,
    DevMac: mac,
    content: content.join(','),
    Interval: query.Interval,
  };

  socket.emit('InstructQuery', queryRequest);
  query.bye = 0;

  // 更新 lastEmit 时间戳并检查结果
  const [emitUpdated, statusUpdated] = await Promise.all([
    terminalService.updateMountDeviceLastEmit(mac, query.pid, new Date()),
    terminalService.updateMountDeviceOnlineStatus(mac, query.pid, true),
  ]);

  if (!emitUpdated) {
    logger.warn(`Failed to update lastEmit for ${mac}/${query.pid} - device may not exist`);
  }
  if (!statusUpdated) {
    logger.warn(`Failed to update online status for ${mac}/${query.pid} - device may not exist`);
  }

  logger.debug(`Query sent: ${mac}/${query.pid}`);
}

/**
 * 生成查询指令
 */
private generateQueryInstructs(protocol: Protocol, pid: number): string[] {
  const content: string[] = [];

  for (const instruct of protocol.instruct) {
    const cacheKey = `${protocol.Protocol}_${pid}_${instruct.name}`;

    if (this.CacheQueryInstruct.has(cacheKey)) {
      content.push(this.CacheQueryInstruct.get(cacheKey)!);
      continue;
    }

    let instructContent = '';

    switch (instruct.resultType) {
      case 'utf8':
        if (protocol.Type === 232) {
          instructContent = instruct.name;
        }
        break;
      default:
        if (instruct.noStandard && instruct.scriptStart) {
          instructContent = this.executeScript(instruct.scriptStart, pid, instruct.name);
        } else {
          instructContent = this.crc16modbusCalculate(pid, instruct.name);
        }
        break;
    }

    this.CacheQueryInstruct.set(cacheKey, instructContent);
    content.push(instructContent);
  }

  return content;
}

/**
 * 执行协议脚本生成指令
 * 
 * SECURITY NOTE: Uses Function constructor for dynamic code execution
 * - Source: Database protocol definitions (admin-configured, not user input)
 * - Access: Only system administrators can configure protocols
 * - Purpose: Support custom instruction generation for non-standard industrial protocols
 */
private executeScript(script: string, pid: number, instructName: string): string {
  try {
    const fn = Function('pid', 'instruct', script);
    return fn(pid, instructName);
  } catch (error) {
    logger.error(`Script execution failed for ${pid}/${instructName}:`, error);
    return '';
  }
}

/**
 * Modbus CRC16 校验
 * 使用标准 Modbus CRC16 算法计算校验码并追加到指令末尾
 * @param pid - 设备 PID（从站地址）
 * @param instruct - 指令内容（16进制字符串）
 * @returns 带 CRC 校验的完整指令
 */
private crc16modbusCalculate(pid: number, instruct: string): string {
  // 1. 构建完整指令：从站地址 + 指令内容
  const pidHex = pid.toString(16).padStart(2, '0');
  const fullInstruct = pidHex + instruct;

  // 2. 将16进制字符串转为 Buffer
  const buffer = Buffer.from(fullInstruct, 'hex');

  // 3. 计算 CRC16 Modbus 校验码
  const crc = crc16modbus(buffer);

  // 4. CRC 是小端序，需要转换字节序
  const crcLow = (crc & 0xFF).toString(16).padStart(2, '0');
  const crcHigh = ((crc >> 8) & 0xFF).toString(16).padStart(2, '0');

  // 5. 追加 CRC 到指令末尾（低字节在前）
  return fullInstruct + crcLow + crcHigh;
}

/**
 * 缓存协议
 */
private async cacheProtocol(protocolName: string): Promise<Protocol | null> {
  if (this.proMap.has(protocolName)) {
    return this.proMap.get(protocolName)!;
  }

  const protocol = await protocolService.getProtocol(protocolName);
  if (protocol) {
    this.proMap.set(protocolName, protocol);
  }

  return protocol;
}

/**
 * 更新协议缓存
 */
UpdateCacheProtocol(protocol: Protocol): void {
  this.proMap.set(protocol.Protocol, protocol);

  const keysToDelete: string[] = [];
  for (const key of this.CacheQueryInstruct.keys()) {
    if (key.startsWith(`${protocol.Protocol}_`)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach((key) => this.CacheQueryInstruct.delete(key));

  logger.info(`Protocol cache updated: ${protocol.Protocol}`);
}

/**
 * 指令查询（用户操作设备）
 */
async InstructQuery(
  DevMac: string,
  protocol: string,
  pid: number,
  content: string
): Promise<InstructQueryResult> {
  const terminal = await terminalService.getTerminal(DevMac);
  if (!terminal) {
    throw new Error('设备不存在');
  }

  const socketId = this.nodeNameMap.get(terminal.mountNode);
  if (!socketId) {
    return { ok: 0, msg: '设备所在节点离线' };
  }

  const socket = this.io?.of('/node').sockets.get(socketId);
  if (!socket) {
    return { ok: 0, msg: '设备所在节点离线' };
  }

  const eventName = `instruct_${DevMac}_${pid}_${Date.now()}`;
  const Interval = 20000;

  const protocolObj = await protocolService.getProtocol(protocol);
  if (!protocolObj) {
    throw new Error('协议不存在');
  }

  let processedContent = content;
  if (protocolObj.Type === 485) {
    const instructs = protocolObj.instruct;
    if (instructs?.[0]?.noStandard && instructs[0].scriptStart) {
      processedContent = this.executeScript(instructs[0].scriptStart, pid, content);
    } else {
      processedContent = this.crc16modbusCalculate(pid, content);
    }
  }

  return new Promise((resolve) => {
    // 设置超时定时器
    const timeoutId = setTimeout(() => {
      this.removeAllListeners(eventName);
      resolve({ ok: 0, msg: 'Node节点无响应，请检查设备状态' });
    }, Interval * 2);

    // 监听查询结果
    this.once(eventName, (result: QueryResultRequest) => {
      // 清理超时定时器
      clearTimeout(timeoutId);

      if (result.success) {
        terminalService.updateMountDeviceOnlineStatus(DevMac, pid, true);
      }
      resolve({
        ok: result.success ? 1 : 0,
        msg: result.error || '查询成功',
        data: result.data,
        useTime: result.useTime,
      });
    });

    // 发送查询请求
    const request: InstructQueryRequest = {
      eventName,
      mac: DevMac,
      pid,
      protocol,
      DevMac,
      content: processedContent,
      Interval,
    };

    socket.emit('InstructQuery', request);
  });
}

/**
 * DTU 操作
 */
async OprateDTU(
  DevMac: string,
  type: DtuOperationType,
  content?: any,
  operatedBy: string = 'system'
): Promise<OprateDtuResult> {
  const startTime = Date.now();
  const terminal = await terminalService.getTerminal(DevMac);

  if (!terminal) {
    // 记录失败日志
    await dtuOperationLogService.log({
      mac: DevMac,
      operation: type,
      content,
      success: false,
      message: '设备不存在',
      operatedBy,
      useTime: Date.now() - startTime,
      error: '设备不存在',
    });
    throw new Error('设备不存在');
  }

  const socketId = this.nodeNameMap.get(terminal.mountNode);
  if (!socketId) {
    // 记录失败日志
    await dtuOperationLogService.log({
      mac: DevMac,
      operation: type,
      content,
      success: false,
      message: '设备所在节点离线',
      operatedBy,
      useTime: Date.now() - startTime,
      nodeName: terminal.mountNode,
      error: '节点离线',
    });
    return { ok: 0, msg: '设备所在节点离线' };
  }

  const socket = this.io?.of('/node').sockets.get(socketId);
  if (!socket) {
    // 记录失败日志
    await dtuOperationLogService.log({
      mac: DevMac,
      operation: type,
      content,
      success: false,
      message: '设备所在节点离线',
      operatedBy,
      useTime: Date.now() - startTime,
      nodeName: terminal.mountNode,
      error: 'Socket不存在',
    });
    return { ok: 0, msg: '设备所在节点离线' };
  }

  const eventName = `dtu_${DevMac}_${type}_${Date.now()}`;

  return new Promise((resolve) => {
    // 设置超时定时器
    const timeoutId = setTimeout(async () => {
      this.removeAllListeners(eventName);

      // 记录超时日志
      await dtuOperationLogService.log({
        mac: DevMac,
        operation: type,
        content,
        success: false,
        message: 'Node节点无响应，请检查设备状态',
        operatedBy,
        useTime: Date.now() - startTime,
        nodeName: terminal.mountNode,
        error: '操作超时',
      });

      resolve({ ok: 0, msg: 'Node节点无响应，请检查设备状态' });
    }, 10000);

    // 监听 DTU 操作结果
    this.once(eventName, async (result: OprateDtuResultRequest) => {
      // 清理超时定时器
      clearTimeout(timeoutId);

      const useTime = Date.now() - startTime;

      // 记录操作日志
      await dtuOperationLogService.log({
        mac: DevMac,
        operation: type,
        content,
        success: result.success,
        message: result.message,
        data: result.data,
        operatedBy,
        useTime,
        nodeName: terminal.mountNode,
        error: result.success ? undefined : result.message,
      });

      resolve({
        ok: result.success ? 1 : 0,
        msg: result.message || 'DTU操作成功',
        data: result.data,
      });
    });

    // 发送 DTU 操作请求
    const request: OprateDtuRequest = {
      eventName,
      mac: DevMac,
      type,
      content,
    };

    socket.emit('OprateDTU', request);
  });
}

// ============================================================
// 缓存管理方法
// ============================================================

/**
 * 计算查询间隔
 * @param terminal - 终端对象
 * @returns 查询间隔 (ms)
 */
private async calculateQueryInterval(terminal: Terminal): Promise<number> {
  // 基础间隔：如果有 ICCID 使用 1000ms（4G），否则 500ms
  let base = terminal.ICCID ? 1000 : 500;

  // 如果是阿里云 IoT 卡且流量资源小于 512MB，增加间隔以节省流量
  if (terminal.iccidInfo) {
    const { resName, flowResource } = terminal.iccidInfo;
    if (resName === 'ali_1' && flowResource < 512 * 1024) {
      // flowResource 单位是 KB
      base *= ((512 * 1024) / flowResource) * 2;
    }
  }

  // 获取协议指令数量
  const mountDevs = terminal.mountDevs || [];
  if (mountDevs.length === 0) {
    return Math.max(base, 5000);
  }

  // 使用第一个设备的协议计算指令数量
  const firstDev = mountDevs[0];
  if (!firstDev) {
    return Math.max(base, 5000);
  }

  const protocol = await this.cacheProtocol(firstDev.protocol);
  const instructCount = protocol?.instruct?.length || 1;

  // 查询间隔 = 指令数量 * 基础间隔，最小 5 秒
  return Math.max(instructCount * base, 5000);
}

/**
 * 设置终端挂载设备缓存
 * @param mac - 终端 MAC
 * @param interval - 可选的查询间隔
 */
async setTerminalMountDevCache(mac: string, interval?: number): Promise<void> {
  const terminal = await terminalService.getTerminal(mac);
  if (!terminal || !terminal.mountDevs || terminal.mountNode === 'test') {
    return;
  }

  const queryInterval = interval || (await this.calculateQueryInterval(terminal));

  for (const mountDev of terminal.mountDevs) {
    const cacheKey = `${terminal.DevMac}${mountDev.pid}`;
    const effectiveInterval = Math.max(queryInterval, mountDev.minQueryLimit || 0);

    this.queryCache.set(cacheKey, {
      TerminalMac: terminal.DevMac,
      mountNode: terminal.mountNode,
      protocol: mountDev.protocol,
      pid: mountDev.pid,
      Type: mountDev.Type,
      mountDev: mountDev.mountDev,
      Interval: effectiveInterval,
      minQueryLimit: mountDev.minQueryLimit,
      devs: terminal.mountDevs.length,
      bye: 0,
      online: mountDev.online || false,
      lastEmit: mountDev.lastEmit,
      lastRecord: mountDev.lastRecord,
    });
  }

  logger.info(`Terminal cache set: ${mac}, devices: ${terminal.mountDevs.length}, interval: ${queryInterval}ms`);
}

/**
 * 删除终端挂载设备缓存
 * @param mac - 终端 MAC
 * @param pid - 设备 PID
 */
delTerminalMountDevCache(mac: string, pid: number): void {
  const cacheKey = `${mac}${pid}`;
  this.queryCache.delete(cacheKey);
  logger.debug(`Query cache deleted: ${cacheKey}`);
}

/**
 * 根据节点名称删除缓存
 * @param nodeName - 节点名称
 */
delNodeCache(nodeName: string): void {
  const keysToDelete: string[] = [];

  for (const [key, query] of this.queryCache.entries()) {
    if (query.mountNode === nodeName) {
      keysToDelete.push(key);
    }
  }

  keysToDelete.forEach((key) => this.queryCache.delete(key));
  logger.info(`Node cache cleared: ${nodeName}, devices: ${keysToDelete.length}`);
}

/**
 * 检查设备是否忙碌
 */
isDeviceBusy(mac: string): boolean {
  return this.busyDevices.has(mac);
}

/**
 * 获取所有忙碌设备
 */
getBusyDevices(): string[] {
  return Array.from(this.busyDevices);
}

/**
 * 发送消息到指定节点并等待响应
 * @param nodeName - 节点名称
 * @param eventName - 事件名称
 * @param data - 发送的数据
 * @param timeout - 超时时间(ms)，默认 10000
 * @returns Promise<T> - 节点返回的数据
 */
async sendMessagetoNode<T = unknown>(
  nodeName: string,
  eventName: string,
  data: unknown = {},
  timeout = 10000
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    // 生成唯一的响应事件名称
    const resultEventName = `${eventName}_result_${Date.now()}`;

    // 获取节点 Socket
    const nodeSocket = this.nodeNameMap.get(nodeName);
    if (!nodeSocket) {
      reject(new Error(`Node not found: ${nodeName}`));
      return;
    }

    // 设置超时
    const timer = setTimeout(() => {
      this.off(resultEventName); // 清理事件监听器
      reject(new Error(`Message timeout: ${nodeName} - ${eventName}`));
    }, timeout);

    // 监听响应事件（一次性）
    this.once(resultEventName, (result: T) => {
      clearTimeout(timer);
      resolve(result);
    });

    // 发送消息到节点
    nodeSocket.emit(eventName as any, {
      ...data,
      resultEventName, // 告知节点响应事件名称
    });

    logger.debug(`Message sent to node: ${nodeName}, event: ${eventName}`);
  });
}

/**
 * 重启指定节点
 * @param nodeName - 节点名称
 */
async nodeRestart(nodeName: string): Promise<void> {
  await this.sendMessagetoNode(nodeName, 'restart');
  logger.info(`Node restart requested: ${nodeName}`);
}

/**
 * 向所有节点发送状态查询
 * 定时任务：每分钟执行一次
 */
async nodeInfo(): Promise<void> {
  try {
    const nodes = await nodeService.getAllNodes();
    for (const node of nodes) {
      const nodeSocket = this.nodeNameMap.get(node.Name);
      if (nodeSocket) {
        nodeSocket.emit('nodeInfo' as any, node.Name);
      }
    }
    logger.debug(`NodeInfo sent to ${nodes.length} nodes`);
  } catch (error) {
    logger.error('Failed to send nodeInfo:', error);
  }
}

/**
 * 清理节点映射缓存
 * 定时任务：每小时执行一次
 * 清理前先发送 nodeInfo 确保节点重新注册
 */
async clear_nodeMap(): Promise<void> {
  try {
    // 先发送 nodeInfo 让节点重新注册
    await this.nodeInfo();

    // 清理缓存
    this.nodeMap.clear();
    this.hundleMacs.clear();

    logger.info('NodeMap cache cleared');
  } catch (error) {
    logger.error('Failed to clear nodeMap:', error);
  }
}

/**
 * 刷新终端查询缓存
 * 定时任务：每10分钟执行一次
 * 重新加载所有节点的终端配置到缓存
 */
async clear_Cache(): Promise<void> {
  try {
    const cacheSize = this.queryCache.size;
    logger.info(`Refreshing query cache, current size: ${cacheSize}`);

    // 获取所有活跃节点
    const nodes = await nodeService.getActiveNodes();

    // 并发刷新所有节点的缓存
    await Promise.all(
      nodes
        .filter((node) => !['pwsiv', 'besiv-1'].includes(node.Name)) // 排除特殊节点
        .map(async (node) => {
          const terminals = await terminalService.getTerminalsByNode(node.Name);
          for (const terminal of terminals) {
            await this.setTerminalMountDevCache(terminal.DevMac);
          }
        })
    );

    logger.info(`Query cache refreshed, new size: ${this.queryCache.size}`);
  } catch (error) {
    logger.error('Failed to refresh query cache:', error);
  }
}

/**
 * 清理服务
 */
cleanup(): void {
    this.stopHeartbeatCheck();
    this.stopQueryScheduler();
    this.stopScheduledTasks();
    this.nodeMap.clear();
    this.nodeNameMap.clear();
    this.terminalCache.clear();
    this.proMap.clear();
    this.CacheQueryInstruct.clear();
    this.queryCache.clear();
    this.hundleMacs.clear();
    this.busyDevices.clear();
    this.removeAllListeners();
    logger.info('SocketIoService cleaned up');
  }
}

// 导出单例
export const socketIoService = new SocketIoService();
