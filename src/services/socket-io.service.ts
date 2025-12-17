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
} from '../types/socket-events';
import type { Terminal } from '../types/entities/terminal.entity';
import { nodeService } from './node.service';
import { terminalService } from './terminal.service';
import { protocolService, type Protocol } from './protocol.service';
import { logger } from '../utils/logger';
import { config } from '../config';

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

  // 心跳超时时间 (ms)
  private readonly HEARTBEAT_TIMEOUT = 60000; // 60s

  // 心跳检查间隔 (ms)
  private readonly HEARTBEAT_CHECK_INTERVAL = 30000; // 30s

  // 查询调度间隔 (ms)
  private readonly QUERY_SCHEDULER_INTERVAL = 500; // 500ms

  // 当前轮次处理过的 MAC 地址集合（用于负载均衡）
  private hundleMacs: Set<string> = new Set();

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

  await terminalService.updateMountDeviceOnlineStatus(mac, query.pid, true);
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
  content?: any
): Promise<OprateDtuResult> {
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

  const eventName = `dtu_${DevMac}_${type}_${Date.now()}`;

  return new Promise((resolve) => {
    // 设置超时定时器
    const timeoutId = setTimeout(() => {
      this.removeAllListeners(eventName);
      resolve({ ok: 0, msg: 'Node节点无响应，请检查设备状态' });
    }, 10000);

    // 监听 DTU 操作结果
    this.once(eventName, (result: OprateDtuResultRequest) => {
      // 清理超时定时器
      clearTimeout(timeoutId);

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
 * 清理服务
 */
cleanup(): void {
    this.stopHeartbeatCheck();
    this.stopQueryScheduler();
    this.nodeMap.clear();
    this.nodeNameMap.clear();
    this.terminalCache.clear();
    this.proMap.clear();
    this.CacheQueryInstruct.clear();
    this.queryCache.clear();
    this.hundleMacs.clear();
    this.removeAllListeners();
    logger.info('SocketIoService cleaned up');
  }
}

// 导出单例
export const socketIoService = new SocketIoService();
