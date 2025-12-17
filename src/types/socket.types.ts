/**
 * Socket.IO 类型定义
 * 定义 Node 客户端和服务器之间的通信接口
 */

import { Socket as IOSocket, Server as IOServer } from 'socket.io';

/**
 * Node 客户端信息
 */
export interface NodeClient {
  _id?: any;
  Name: string; // 节点名称（唯一标识）
  IP: string; // 节点 IP 地址
  Port: number; // TCP 服务端口
  MaxConnections: number; // 最大连接数
  Connections: number; // 当前连接数
}

/**
 * Socket 连接上下文
 */
export interface SocketContext {
  socketId: string; // Socket ID
  nodeName: string; // 节点名称
  nodeIP: string; // 节点 IP
  connectedAt: Date; // 连接时间
}

/**
 * Node 客户端到服务器的事件
 */
export interface ClientToServerEvents {
  register: (callback: (data: NodeRegisterResponse) => void) => void;
  startError: (error: string) => void;
  alarm: (data: AlarmData) => void;
  terminalOn: (mac: string | string[], reline?: boolean) => void;
  terminalOff: (mac: string, active: boolean) => void;
  queryResult: (data: QueryResultData) => void;
}

/**
 * 服务器到 Node 客户端的事件
 */
export interface ServerToClientEvents {
  accont: () => void; // 账号验证成功
  registerSuccess: (data: NodeRegisterResponse) => void;
  InstructQuery: (
    query: InstructQueryData,
    callback: (result: InstructQueryResult) => void
  ) => void;
  OprateDTU: (
    operation: DTUOperation,
    callback: (result: OperationResult) => void
  ) => void;
}

/**
 * Node 注册响应
 */
export interface NodeRegisterResponse {
  Name: string;
  IP: string;
  Port: number;
  MaxConnections: number;
  Connections: number;
  UserID?: string; // 用户 ID（如果需要）
}

/**
 * 告警数据
 */
export interface AlarmData {
  mac: string;
  pid: number;
  msg: string;
  timestamp?: number;
}

/**
 * 查询结果数据
 */
export interface QueryResultData {
  mac: string;
  pid: number;
  result: any;
  timestamp?: number;
}

/**
 * 指令查询数据
 */
export interface InstructQueryData {
  DevMac: string; // 终端 MAC
  protocol: string; // 协议类型
  pid: number; // 设备 PID
  instruct: string; // 指令内容
  type?: number; // 指令类型
}

/**
 * 指令查询结果
 */
export interface InstructQueryResult {
  ok: boolean; // 是否成功
  msg?: string; // 错误消息
  data?: any; // 返回数据
}

/**
 * DTU 操作
 */
export interface DTUOperation {
  DevMac: string; // 终端 MAC
  events: string; // 操作事件
  content?: string; // 操作内容
}

/**
 * 操作结果
 */
export interface OperationResult {
  ok: boolean; // 是否成功
  msg?: string; // 消息
}

/**
 * Socket.IO 服务器类型（带类型的 namespace）
 */
export type TypedIOServer = IOServer<
  ClientToServerEvents,
  ServerToClientEvents
>;

/**
 * Socket.IO Socket 类型（带类型的 socket）
 */
export type TypedSocket = IOSocket<
  ClientToServerEvents,
  ServerToClientEvents
>;
