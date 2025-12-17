/**
 * Socket.IO Service
 * Socket.IO 服务 - 管理 Node 客户端连接和实时通信
 */

import { Server as HTTPServer } from 'http';
import { Server as IOServer, Namespace } from 'socket.io';
import {
  TypedSocket,
  TypedIOServer,
  SocketContext,
  InstructQueryData,
  DTUOperation,
  ClientToServerEvents,
  ServerToClientEvents,
} from '../types/socket.types';
import { nodeService } from './node.service';
import { terminalService } from './terminal.service';

/**
 * Socket.IO 服务类
 * 管理与 Node 客户端的 Socket.IO 连接
 */
export class SocketService {
  private io: TypedIOServer | null = null;
  private nodeNamespace: Namespace<
    ClientToServerEvents,
    ServerToClientEvents
  > | null = null;

  // Socket ID -> Node Name 映射（替代 Redis）
  private socketNodeMap = new Map<string, string>();

  // Node Name -> Socket Context 映射
  private nodeContextMap = new Map<string, SocketContext>();

  /**
   * 初始化 Socket.IO 服务器
   * @param httpServer - HTTP 服务器实例
   */
  initialize(httpServer: HTTPServer): void {
    this.io = new IOServer(httpServer, {
      cors: {
        origin: '*',
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    // 创建 /node namespace 用于 Node 客户端连接
    this.nodeNamespace = this.io.of('/node');

    // 设置连接处理
    this.nodeNamespace.on('connection', socket => {
      this.handleConnection(socket);
    });

    console.log('✅ Socket.IO 服务已初始化');
  }

  /**
   * 处理 Node 客户端连接
   * @param socket - Socket 实例
   */
  private async handleConnection(socket: TypedSocket): Promise<void> {
    const socketId = socket.id;

    // 提取真实 IP（支持 nginx 代理）
    const realIP =
      (socket.handshake.headers['x-real-ip'] as string) ||
      socket.conn.remoteAddress ||
      '';

    const ip = realIP.includes(':')
      ? realIP.split(':').reverse()[0] || ''
      : realIP;

    console.log(`🔌 新连接: Socket ID=${socketId}, IP=${ip}`);

    // 检查节点是否已注册
    const node = await nodeService.getNodeByIP(ip);

    if (!node) {
      console.warn(`⚠️  未注册的节点尝试连接: IP=${ip}`);
      // 直接断开连接（Socket.IO 会自动发送错误）
      socket.disconnect();
      return;
    }

    // 保存 Socket ID -> Node Name 映射
    this.socketNodeMap.set(socketId, node.Name);

    // 保存 Node Context
    this.nodeContextMap.set(node.Name, {
      socketId,
      nodeName: node.Name,
      nodeIP: node.IP,
      connectedAt: new Date(),
    });

    // 加入节点专属房间（用于后续定向发送）
    socket.join(node.Name);
    socket.join(node.IP);

    console.log(`✅ 节点连接成功: Name=${node.Name}, IP=${ip}`);

    // 发送账号验证成功事件
    socket.emit('accont');

    // 设置事件监听器
    this.setupEventListeners(socket, node.Name);

    // 处理断开连接
    socket.on('disconnect', () => {
      this.handleDisconnect(socketId, node.Name);
    });
  }

  /**
   * 设置事件监听器
   * @param socket - Socket 实例
   * @param nodeName - 节点名称
   */
  private setupEventListeners(socket: TypedSocket, nodeName: string): void {
    // 注册事件
    socket.on('register', async callback => {
      const node = await nodeService.getNodeByName(nodeName);
      if (node) {
        console.log(`📝 节点请求注册信息: ${nodeName}`);
        callback({
          Name: node.Name,
          IP: node.IP,
          Port: node.Port,
          MaxConnections: node.MaxConnections,
          Connections: node.Connections,
        });
      }
    });

    // 启动错误事件
    socket.on('startError', error => {
      console.error(`❌ 节点 ${nodeName} 启动失败:`, error);
    });

    // 告警事件
    socket.on('alarm', data => {
      console.warn(`⚠️  节点 ${nodeName} 告警:`, data);
      // TODO: 处理告警逻辑（发送通知等）
    });

    // 终端设备上线事件
    socket.on('terminalOn', async (mac, reline = false) => {
      console.log(
        `📡 终端上线: MAC=${Array.isArray(mac) ? mac.join(',') : mac}, Node=${nodeName}, Reline=${reline}`
      );

      // 设置终端在线状态
      const macAddr = Array.isArray(mac) ? mac[0] : mac;
      if (macAddr) {
        await terminalService.updateOnlineStatus(macAddr, true);
      }

      // TODO: 更多上线逻辑（日志、通知等）
    });

    // 终端设备离线事件
    socket.on('terminalOff', async (mac, active) => {
      console.log(`📡 终端离线: MAC=${mac}, Node=${nodeName}, Active=${active}`);

      // 设置终端离线状态
      await terminalService.updateOnlineStatus(mac, false);

      // TODO: 更多离线逻辑（日志、通知等）
    });

    // 查询结果事件
    socket.on('queryResult', data => {
      console.log(`📊 收到查询结果: MAC=${data.mac}, PID=${data.pid}`);
      // TODO: 处理查询结果
    });
  }

  /**
   * 处理断开连接
   * @param socketId - Socket ID
   * @param nodeName - 节点名称
   */
  private async handleDisconnect(
    socketId: string,
    nodeName: string
  ): Promise<void> {
    console.log(`🔌 节点断开连接: Name=${nodeName}, Socket ID=${socketId}`);

    // 清理映射
    this.socketNodeMap.delete(socketId);
    this.nodeContextMap.delete(nodeName);

    // 获取该节点下的所有终端
    const terminals = await terminalService.getOnlineTerminals();
    const nodeTerminals = terminals.filter(t => t.mountNode === nodeName);

    // 批量设置终端离线
    await Promise.all(
      nodeTerminals.map(t => terminalService.updateOnlineStatus(t.DevMac, false))
    );

    console.log(`✅ 节点 ${nodeName} 清理完成，共 ${nodeTerminals.length} 个终端离线`);
  }

  /**
   * 向指定节点发送指令查询
   * @param nodeName - 节点名称
   * @param query - 查询数据
   * @param timeout - 超时时间（毫秒）
   * @returns 查询结果
   */
  async sendInstructQuery(
    nodeName: string,
    query: InstructQueryData,
    timeout = 30000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.nodeNamespace) {
        return reject(new Error('Socket.IO 服务未初始化'));
      }

      const context = this.nodeContextMap.get(nodeName);
      if (!context) {
        return reject(new Error(`节点 ${nodeName} 未连接`));
      }

      const sockets = Array.from(this.nodeNamespace.sockets.values());
      const socket = sockets.find(s => s.id === context.socketId);

      if (!socket) {
        return reject(new Error(`节点 ${nodeName} Socket 不存在`));
      }

      // 设置超时
      const timer = setTimeout(() => {
        reject(new Error(`查询超时: ${timeout}ms`));
      }, timeout);

      // 发送查询并等待响应
      socket.emit('InstructQuery', query, (result: any) => {
        clearTimeout(timer);
        resolve(result);
      });
    });
  }

  /**
   * 向指定节点发送 DTU 操作指令
   * @param nodeName - 节点名称
   * @param operation - 操作数据
   * @param timeout - 超时时间（毫秒）
   * @returns 操作结果
   */
  async sendDTUOperation(
    nodeName: string,
    operation: DTUOperation,
    timeout = 30000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.nodeNamespace) {
        return reject(new Error('Socket.IO 服务未初始化'));
      }

      const context = this.nodeContextMap.get(nodeName);
      if (!context) {
        return reject(new Error(`节点 ${nodeName} 未连接`));
      }

      const sockets = Array.from(this.nodeNamespace.sockets.values());
      const socket = sockets.find(s => s.id === context.socketId);

      if (!socket) {
        return reject(new Error(`节点 ${nodeName} Socket 不存在`));
      }

      // 设置超时
      const timer = setTimeout(() => {
        reject(new Error(`操作超时: ${timeout}ms`));
      }, timeout);

      // 发送操作并等待响应
      socket.emit('OprateDTU', operation, (result: any) => {
        clearTimeout(timer);
        resolve(result);
      });
    });
  }

  /**
   * 获取所有在线节点
   * @returns 在线节点名称列表
   */
  getOnlineNodes(): string[] {
    return Array.from(this.nodeContextMap.keys());
  }

  /**
   * 检查节点是否在线
   * @param nodeName - 节点名称
   * @returns 是否在线
   */
  isNodeOnline(nodeName: string): boolean {
    return this.nodeContextMap.has(nodeName);
  }

  /**
   * 获取节点连接上下文
   * @param nodeName - 节点名称
   * @returns 连接上下文或 undefined
   */
  getNodeContext(nodeName: string): SocketContext | undefined {
    return this.nodeContextMap.get(nodeName);
  }

  /**
   * 关闭 Socket.IO 服务器
   */
  async close(): Promise<void> {
    if (this.io) {
      await this.io.close();
      this.socketNodeMap.clear();
      this.nodeContextMap.clear();
      console.log('✅ Socket.IO 服务已关闭');
    }
  }
}

/**
 * 导出 Socket 服务单例
 */
export const socketService = new SocketService();
