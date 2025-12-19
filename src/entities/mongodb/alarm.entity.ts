/**
 * Alarm Entity (MongoDB)
 *
 * 告警记录实体 - 对齐 midwayuartserver UartTerminalDataTransfinite 模式
 * Collection: alarms
 *
 * Phase 3: 新增持久化告警存储,扩展现有 log.uartterminaldatatransfinites 功能
 */

import type { ObjectId } from 'mongodb';

/**
 * 告警级别 (扩展现有系统)
 */
export type AlarmLevel = 'info' | 'warning' | 'error' | 'critical';

/**
 * 告警状态 (对齐现有 isOk 模式,扩展更多状态)
 */
export type AlarmStatus = 'active' | 'acknowledged' | 'resolved' | 'auto_resolved';

/**
 * 告警标签 (对齐现有 tag 字段)
 */
export type AlarmTag = 'Threshold' | 'AlarmStat' | 'ups' | 'timeout' | 'offline' | 'custom';

/**
 * 告警文档 (扩展现有 UartTerminalDataTransfinite)
 */
export interface AlarmDocument {
  /** MongoDB _id */
  _id?: ObjectId;

  /** 父级 ID (对齐现有 parentId,用于关联规则) */
  parentId?: string;

  /** 告警类型 (对齐现有 type 字段) */
  type: string;

  /** 告警级别 (Phase 3 新增) */
  level: AlarmLevel;

  /** 告警标签 (对齐现有 tag 字段) */
  tag: AlarmTag;

  /** 终端 MAC 地址 (对齐现有 mac) */
  mac: string;

  /** 设备名称 (对齐现有 devName) */
  devName?: string;

  /** 设备 PID (对齐现有 pid) */
  pid: number | string;

  /** 协议名称 (对齐现有 protocol) */
  protocol: string;

  /** 参数名称 (Phase 3 新增) */
  paramName?: string;

  /** 当前值 (Phase 3 新增) */
  currentValue?: number | string | boolean;

  /** 告警消息 (对齐现有 msg) */
  msg: string;

  /** 告警状态 (扩展现有 isOk) */
  status: AlarmStatus;

  /** 时间戳 (对齐现有 timeStamp) */
  timeStamp: number;

  /** 触发时间 (Phase 3 新增,Date 类型便于查询) */
  triggeredAt: Date;

  /** 确认时间 (Phase 3 新增) */
  acknowledgedAt?: Date;

  /** 确认人用户 ID */
  acknowledgedBy?: string;

  /** 确认备注 */
  acknowledgeComment?: string;

  /** 解决时间 */
  resolvedAt?: Date;

  /** 解决人用户 ID */
  resolvedBy?: string;

  /** 解决方案描述 */
  resolutionNote?: string;

  /** 自动解决标志 */
  autoResolved?: boolean;

  /** 通知发送次数 (Phase 3 新增) */
  notificationCount?: number;

  /** 最后通知时间 */
  lastNotifiedAt?: Date;

  /** 创建时间 */
  createdAt: Date;

  /** 更新时间 */
  updatedAt: Date;
}

/**
 * 告警集合名称
 */
export const ALARM_COLLECTION = 'alarms';

/**
 * 告警索引定义
 */
export const ALARM_INDEXES = [
  // 状态查询索引 (对齐现有 isOk 查询模式)
  { key: { status: 1, timeStamp: -1 }, name: 'status_time_idx' },

  // 设备查询索引 (对齐现有 mac + pid 查询)
  { key: { mac: 1, pid: 1, timeStamp: -1 }, name: 'device_time_idx' },

  // 协议查询索引
  { key: { protocol: 1, timeStamp: -1 }, name: 'protocol_time_idx' },

  // 标签查询索引 (对齐现有 tag 字段)
  { key: { tag: 1, timeStamp: -1 }, name: 'tag_time_idx' },

  // 级别查询索引
  { key: { level: 1, status: 1, timeStamp: -1 }, name: 'level_status_time_idx' },

  // 时间范围查询索引
  { key: { timeStamp: -1 }, name: 'timestamp_idx' },
  { key: { triggeredAt: -1 }, name: 'triggered_at_idx' },
  { key: { resolvedAt: -1 }, name: 'resolved_at_idx', sparse: true },

  // 用户操作索引
  { key: { acknowledgedBy: 1, acknowledgedAt: -1 }, name: 'ack_user_idx', sparse: true },
  { key: { resolvedBy: 1, resolvedAt: -1 }, name: 'resolve_user_idx', sparse: true },

  // TTL 索引 - 自动删除 90 天前的已解决告警
  {
    key: { resolvedAt: 1 },
    name: 'ttl_resolved_idx',
    expireAfterSeconds: 90 * 24 * 60 * 60, // 90 天
    partialFilterExpression: { status: { $in: ['resolved', 'auto_resolved'] } },
  },
];

/**
 * 创建告警的辅助函数 (对齐现有 UartTerminalDataTransfinite 字段)
 */
export function createAlarm(
  alarm: Omit<AlarmDocument, '_id' | 'status' | 'createdAt' | 'updatedAt' | 'notificationCount'>
): AlarmDocument {
  const now = new Date();
  return {
    ...alarm,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    notificationCount: 0,
  };
}

/**
 * 确认告警的辅助函数 (对齐现有 isOk = true 操作)
 */
export function acknowledgeAlarm(userId: string, comment?: string) {
  const now = new Date();
  return {
    status: 'acknowledged' as AlarmStatus,
    acknowledgedAt: now,
    acknowledgedBy: userId,
    acknowledgeComment: comment,
    updatedAt: now,
  };
}

/**
 * 解决告警的辅助函数
 */
export function resolveAlarm(userId: string, solution?: string, autoResolved = false) {
  const now = new Date();
  return {
    status: (autoResolved ? 'auto_resolved' : 'resolved') as AlarmStatus,
    resolvedAt: now,
    resolvedBy: userId,
    resolutionNote: solution,
    autoResolved,
    updatedAt: now,
  };
}

/**
 * 记录通知发送的辅助函数
 */
export function recordNotification() {
  return {
    lastNotifiedAt: new Date(),
    $inc: { notificationCount: 1 },
  };
}
