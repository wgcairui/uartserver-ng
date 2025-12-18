/**
 * WebSocket 事件类型定义
 * 定义浏览器用户和服务器之间的 WebSocket 通信事件
 */

import type { TerminalClientResultSingle } from './entities/result.entity';

// ============================================================
// 用户客户端事件 (Client → Server)
// ============================================================

/**
 * 用户认证请求
 */
export interface UserAuthRequest {
  token: string; // JWT Token
}

/**
 * 用户认证响应
 */
export interface UserAuthResponse {
  success: boolean;
  message?: string;
  user?: {
    userId: string;
    username?: string;
  };
}

/**
 * 订阅设备请求
 */
export interface SubscribeDeviceRequest {
  mac: string; // 设备 MAC 地址
  pid: number; // 协议 ID
}

/**
 * 订阅设备响应
 */
export interface SubscribeDeviceResponse {
  success: boolean;
  message?: string;
  room?: string; // 房间名称（成功时返回）
}

/**
 * 取消订阅设备请求
 */
export interface UnsubscribeDeviceRequest {
  mac: string; // 设备 MAC 地址
  pid: number; // 协议 ID
}

/**
 * 取消订阅响应
 */
export interface UnsubscribeDeviceResponse {
  success: boolean;
  message?: string;
}

/**
 * 心跳请求
 */
export interface UserHeartbeatRequest {
  timestamp: number;
}

/**
 * 心跳响应
 */
export interface UserHeartbeatResponse {
  timestamp: number;
  serverTime: number;
}

// ============================================================
// 服务器事件 (Server → Client)
// ============================================================

/**
 * 设备数据更新推送
 */
export interface DeviceDataUpdate {
  type: 'data';
  mac: string;
  pid: number;
  data: TerminalClientResultSingle;
  timestamp: number;
}

/**
 * 设备告警推送
 */
export interface DeviceAlarmUpdate {
  type: 'alarm';
  mac: string;
  pid: number;
  alarmType: string;
  alarmLevel: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  timestamp: number;
  data?: any;
}

/**
 * 设备状态变更推送
 */
export interface DeviceStatusUpdate {
  type: 'status';
  mac: string;
  pid: number;
  online: boolean;
  timestamp: number;
  message?: string;
}

/**
 * 设备更新类型（联合类型）
 */
export type DeviceUpdate = DeviceDataUpdate | DeviceAlarmUpdate | DeviceStatusUpdate;

/**
 * 批量设备更新（性能优化）
 */
export interface BatchDeviceUpdate {
  updates: DeviceUpdate[];
  timestamp: number;
}

// ============================================================
// Socket.IO 类型化接口
// ============================================================

/**
 * 用户客户端 → 服务器事件映射
 */
export interface UserClientToServerEvents {
  auth: (data: UserAuthRequest, callback: (response: UserAuthResponse) => void) => void;

  subscribe: (
    data: SubscribeDeviceRequest,
    callback: (response: SubscribeDeviceResponse) => void
  ) => void;

  unsubscribe: (
    data: UnsubscribeDeviceRequest,
    callback: (response: UnsubscribeDeviceResponse) => void
  ) => void;

  heartbeat: (
    data: UserHeartbeatRequest,
    callback: (response: UserHeartbeatResponse) => void
  ) => void;

  getSubscriptions: (callback: (subscriptions: string[]) => void) => void;
}

/**
 * 服务器 → 用户客户端事件映射
 */
export interface ServerToUserClientEvents {
  update: (data: DeviceUpdate) => void;

  batchUpdate: (data: BatchDeviceUpdate) => void;

  disconnect: (reason: string) => void;

  error: (message: string) => void;
}

/**
 * 用户 Socket 数据 (存储在 socket.data 中)
 */
export interface UserSocketData {
  userId?: string; // 用户 ID
  username?: string; // 用户名
  authenticated: boolean; // 是否已认证
  connectedAt: Date; // 连接时间
  lastHeartbeat: Date; // 最后心跳时间
  subscriptions: Set<string>; // 订阅的房间列表 (mac_pid)
}

// ============================================================
// 内部事件和工具类型
// ============================================================

/**
 * 房间名称生成器
 */
export function getRoomName(mac: string, pid: number): string {
  return `device_${mac}_${pid}`;
}

/**
 * 解析房间名称
 */
export function parseRoomName(roomName: string): { mac: string; pid: number } | null {
  const match = roomName.match(/^device_([^_]+)_(\d+)$/);
  if (!match) {
    return null;
  }
  return {
    mac: match[1]!,
    pid: parseInt(match[2]!, 10),
  };
}

/**
 * 订阅信息
 */
export interface SubscriptionInfo {
  mac: string;
  pid: number;
  room: string;
  subscribedAt: Date;
  userId: string;
}
