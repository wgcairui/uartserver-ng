/**
 * Data Entity (Phase 4.2 Day 2)
 *
 * 定义设备数据相关的实体类型：
 * - 原始数据记录 (DataRecord)
 * - 解析后的数据 (ParsedData)
 * - 单例数据缓存 (SingleData)
 */

import type { ObjectId } from 'mongodb';

/**
 * 原始数据记录
 * 存储从设备接收到的原始数据
 */
export interface DataRecordDocument {
  _id: ObjectId;
  mac: string; // 设备 MAC 地址
  pid: number; // 协议 ID
  data: string; // 原始数据（十六进制字符串或其他格式）
  timestamp: Date; // 数据时间戳
  createdAt: Date; // 记录创建时间
}

/**
 * 解析后的数据记录
 * 存储根据协议解析后的结构化数据
 */
export interface ParsedDataDocument {
  _id: ObjectId;
  mac: string; // 设备 MAC 地址
  pid: number; // 协议 ID
  protocol: string; // 协议名称
  name: string; // 参数名称 (如 "temperature", "humidity")
  value: number; // 解析后的数值
  unit?: string; // 单位 (如 "°C", "%")
  timestamp: Date; // 数据时间戳
  createdAt: Date; // 记录创建时间
}

/**
 * 单例数据（最新值缓存）
 * 存储每个设备参数的最新值，用于快速查询当前状态
 */
export interface SingleDataDocument {
  _id: ObjectId;
  mac: string; // 设备 MAC 地址
  pid: number; // 协议 ID
  name: string; // 参数名称
  value: number; // 最新值
  unit?: string; // 单位
  timestamp: Date; // 数据时间戳
  updatedAt: Date; // 更新时间
}

/**
 * 聚合数据结果
 * 用于历史数据查询的聚合结果
 */
export interface AggregatedDataResult {
  name: string; // 参数名称
  avg?: number; // 平均值
  min?: number; // 最小值
  max?: number; // 最大值
  count: number; // 数据点数量
  unit?: string; // 单位
}

/**
 * 历史数据查询结果
 */
export interface HistoryDataPoint {
  timestamp: Date; // 时间戳
  name: string; // 参数名称
  value: number; // 数值
  unit?: string; // 单位
}

// ============================================================================
// 集合名称和索引配置
// ============================================================================

/**
 * 数据记录集合名称
 */
export const DATA_RECORD_COLLECTION = 'data.records';
export const PARSED_DATA_COLLECTION = 'data.parsed';
export const SINGLE_DATA_COLLECTION = 'data.single';

/**
 * 数据记录索引
 */
export const DATA_RECORD_INDEXES = [
  {
    key: { mac: 1, pid: 1, timestamp: -1 },
    name: 'data_records_mac_pid_timestamp_idx',
  },
  {
    key: { createdAt: 1 },
    name: 'data_records_createdAt_idx',
    expireAfterSeconds: 60 * 60 * 24 * 90, // 90天自动过期
  },
];

/**
 * 解析数据索引
 */
export const PARSED_DATA_INDEXES = [
  {
    key: { mac: 1, pid: 1, name: 1, timestamp: -1 },
    name: 'parsed_data_mac_pid_name_timestamp_idx',
  },
  {
    key: { mac: 1, pid: 1, timestamp: -1 },
    name: 'parsed_data_mac_pid_timestamp_idx',
  },
  {
    key: { createdAt: 1 },
    name: 'parsed_data_createdAt_idx',
    expireAfterSeconds: 60 * 60 * 24 * 90, // 90天自动过期
  },
];

/**
 * 单例数据索引
 */
export const SINGLE_DATA_INDEXES = [
  {
    key: { mac: 1, pid: 1, name: 1 },
    name: 'single_data_mac_pid_name_idx',
    unique: true, // 确保每个设备参数只有一条最新记录
  },
  {
    key: { mac: 1, pid: 1 },
    name: 'single_data_mac_pid_idx',
  },
];

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 创建数据记录文档
 */
export function createDataRecordDocument(
  mac: string,
  pid: number,
  data: string,
  timestamp: Date = new Date()
): Omit<DataRecordDocument, '_id'> {
  return {
    mac,
    pid,
    data,
    timestamp,
    createdAt: new Date(),
  };
}

/**
 * 创建解析数据文档
 */
export function createParsedDataDocument(
  mac: string,
  pid: number,
  protocol: string,
  name: string,
  value: number,
  unit?: string,
  timestamp: Date = new Date()
): Omit<ParsedDataDocument, '_id'> {
  return {
    mac,
    pid,
    protocol,
    name,
    value,
    unit,
    timestamp,
    createdAt: new Date(),
  };
}

/**
 * 创建或更新单例数据文档
 */
export function createSingleDataDocument(
  mac: string,
  pid: number,
  name: string,
  value: number,
  unit?: string,
  timestamp: Date = new Date()
): Omit<SingleDataDocument, '_id'> {
  return {
    mac,
    pid,
    name,
    value,
    unit,
    timestamp,
    updatedAt: new Date(),
  };
}

/**
 * 验证时间范围是否合理
 * @param start 开始时间
 * @param end 结束时间
 * @param maxDays 最大天数（默认 90 天）
 * @returns 验证结果和错误消息
 */
export function validateTimeRange(
  start: Date,
  end: Date,
  maxDays: number = 90
): { valid: boolean; error?: string } {
  // 检查开始时间是否在结束时间之前
  if (start >= end) {
    return {
      valid: false,
      error: '开始时间必须早于结束时间',
    };
  }

  // 检查时间范围是否过大
  const diffMs = end.getTime() - start.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays > maxDays) {
    return {
      valid: false,
      error: `时间范围不能超过 ${maxDays} 天`,
    };
  }

  // 检查结束时间是否在未来
  const now = new Date();
  if (end > now) {
    return {
      valid: false,
      error: '结束时间不能晚于当前时间',
    };
  }

  return { valid: true };
}
