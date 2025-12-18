/**
 * Socket.IO 事件类型定义
 * 定义 Node 客户端和服务器之间的所有通信事件
 */

import type { NodeClient, NodeRunInfo } from './entities/node.entity';
import type { TerminalClientResult } from './entities/result.entity';

// ============================================================
// Node 客户端事件 (Client → Server)
// ============================================================

/**
 * Node 客户端注册请求
 */
export interface RegisterNodeRequest {
  Name: string; // Node 名称
  IP: string; // Node IP 地址
  Port: number; // Node 端口
  MaxConnections: number; // 最大连接数
}

/**
 * Node 运行信息更新
 */
export interface UpdateNodeInfoRequest {
  Name: string; // Node 名称
  Connections: number; // 当前连接数
  runInfo: Omit<NodeRunInfo, '_id' | 'NodeName' | 'Connections'>; // 运行信息
}

/**
 * 终端挂载设备注册
 */
export interface TerminalMountDevRegisterRequest {
  mac: string; // 终端 MAC 地址
  pid: number; // 设备 PID
  mountDev: string; // 挂载设备名称
}

/**
 * 查询指令结果
 */
export interface QueryResultRequest {
  eventName: string; // 事件名称 (用于匹配请求)
  mac: string; // 终端 MAC
  pid: number; // 设备 PID
  protocol: string; // 协议名称
  success: boolean; // 查询是否成功
  data?: TerminalClientResult; // 查询结果数据
  error?: string; // 错误信息
  useTime?: number; // 查询耗时 (ms)
}

/**
 * DTU 操作结果
 */
export interface OprateDtuResultRequest {
  eventName: string; // 事件名称 (用于匹配请求)
  mac: string; // 终端 MAC
  type: DtuOperationType; // 操作类型
  success: boolean; // 操作是否成功
  message?: string; // 结果消息
  data?: any; // 返回数据
}

/**
 * 心跳响应
 */
export interface HeartbeatResponse {
  timestamp: number; // 时间戳
}

// ============================================================
// 服务器事件 (Server → Client)
// ============================================================

/**
 * Node 注册成功响应
 */
export interface RegisterNodeResponse {
  success: boolean;
  message?: string;
  node?: NodeClient;
}

/**
 * 查询指令请求
 */
export interface InstructQueryRequest {
  eventName: string; // 事件名称 (用于匹配响应)
  mac: string; // 终端 MAC
  pid: number; // 设备 PID
  protocol: string; // 协议名称
  DevMac: string; // 设备 MAC (可能与 mac 不同)
  content: string; // 查询指令内容
  Interval: number; // 查询间隔 (ms)
}

/**
 * DTU 操作请求
 */
export interface OprateDtuRequest {
  eventName: string; // 事件名称 (用于匹配响应)
  mac: string; // 终端 MAC
  type: DtuOperationType; // 操作类型
  content?: any; // 操作参数
}

/**
 * DTU 操作类型
 */
export type DtuOperationType =
  | 'restart' // 重启 DTU
  | 'restart485' // 重启 485 接口
  | 'updateMount' // 更新挂载设备配置
  | 'OprateInstruct' // 透传自定义指令
  | 'setTerminal' // 设置终端参数
  | 'getTerminal'; // 获取终端信息

/**
 * 心跳请求
 */
export interface HeartbeatRequest {
  timestamp: number; // 时间戳
}

/**
 * 终端上线事件
 */
export interface TerminalOnlineRequest {
  mac: string | string[]; // 终端 MAC 地址（单个或批量）
  reline?: boolean; // 是否为重连
}

/**
 * 终端下线事件
 */
export interface TerminalOfflineRequest {
  mac: string; // 终端 MAC 地址
  active: boolean; // 是否为主动断开
}

/**
 * 指令超时事件
 */
export interface InstructTimeOutRequest {
  mac: string; // 终端 MAC
  pid: number; // 设备 PID
  instruct: string[]; // 超时的指令列表
}

/**
 * 设备查询超时事件
 */
export interface TerminalMountDevTimeOutRequest {
  mac: string; // 终端 MAC
  pid: number; // 设备 PID
  timeOut: number; // 超时次数
}

/**
 * 设备忙碌状态事件
 */
export interface BusyStatusRequest {
  mac: string; // 终端 MAC
  busy: boolean; // 是否忙碌
  n: number; // 排队数量
}

/**
 * 节点就绪事件（无参数，使用 callback 返回节点名称）
 */
export type NodeReadyCallback = (nodeName: string) => void;

/**
 * 节点启动失败事件
 */
export interface StartErrorRequest {
  error: string; // 错误信息
}

/**
 * 告警事件
 */
export interface AlarmRequest {
  mac: string; // 终端 MAC
  alarm: any; // 告警数据
}

// ============================================================
// Socket.IO 类型化接口
// ============================================================

/**
 * Node 客户端 → 服务器事件映射
 */
export interface NodeClientToServerEvents {
  RegisterNode: (
    data: RegisterNodeRequest,
    callback: (response: RegisterNodeResponse) => void
  ) => void;

  UpdateNodeInfo: (data: UpdateNodeInfoRequest) => void;

  TerminalMountDevRegister: (data: TerminalMountDevRegisterRequest) => void;

  queryResult: (data: QueryResultRequest) => void;

  OprateDTUResult: (data: OprateDtuResultRequest) => void;

  heartbeat: (
    data: HeartbeatRequest,
    callback: (response: HeartbeatResponse) => void
  ) => void;

  // 终端生命周期事件
  terminalOn: (data: TerminalOnlineRequest) => void;

  terminalOff: (data: TerminalOfflineRequest) => void;

  instructTimeOut: (data: InstructTimeOutRequest) => void;

  terminalMountDevTimeOut: (data: TerminalMountDevTimeOutRequest) => void;

  busy: (data: BusyStatusRequest) => void;

  ready: (callback: NodeReadyCallback) => void;

  // 错误和告警事件
  startError: (data: StartErrorRequest) => void;

  alarm: (data: AlarmRequest) => void;
}

/**
 * 服务器 → Node 客户端事件映射
 */
export interface ServerToNodeClientEvents {
  InstructQuery: (data: InstructQueryRequest) => void;

  OprateDTU: (data: OprateDtuRequest) => void;

  heartbeat: (data: HeartbeatRequest) => void;

  disconnect: (reason: string) => void;
}

/**
 * Socket 间通信事件 (Server-to-Server)
 */
export interface InterServerEvents {
  ping: () => void;
}

/**
 * Socket 数据 (存储在 socket.data 中)
 */
export interface SocketData {
  nodeName?: string; // Node 名称
  nodeIP?: string; // Node IP
  authenticated: boolean; // 是否已认证
  connectedAt: Date; // 连接时间
  lastHeartbeat: Date; // 最后心跳时间
}

// ============================================================
// 内部事件 (用于 EventEmitter)
// ============================================================

/**
 * 查询请求内部事件
 */
export interface InternalQueryEvent {
  mac: string;
  pid: number;
  protocol: string;
  timestamp: number;
}

/**
 * DTU 操作内部事件
 */
export interface InternalDtuOperationEvent {
  mac: string;
  type: DtuOperationType;
  timestamp: number;
}
