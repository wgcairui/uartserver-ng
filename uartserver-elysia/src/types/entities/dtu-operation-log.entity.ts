/**
 * DTU 操作日志实体
 * 用于记录所有 DTU 远程操作的历史记录
 */

import type { ObjectId } from 'mongodb';
import type { DtuOperationType } from '../socket-events';

/**
 * DTU 操作日志文档结构
 */
export interface DtuOperationLog {
  /** MongoDB 文档 ID */
  _id?: ObjectId;

  /** DTU 设备 MAC 地址 */
  mac: string;

  /** 操作类型 */
  operation: DtuOperationType;

  /** 操作参数/内容 */
  content?: any;

  /** 操作是否成功 */
  success: boolean;

  /** 结果消息 */
  message?: string;

  /** 返回的数据 */
  data?: any;

  /** 操作人（用户 ID 或用户名） */
  operatedBy: string;

  /** 操作时间 */
  operatedAt: Date;

  /** 操作耗时（毫秒） */
  useTime: number;

  /** 设备所在 Node 节点名称 */
  nodeName?: string;

  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * 创建 DTU 操作日志的参数
 */
export interface CreateDtuOperationLogParams {
  mac: string;
  operation: DtuOperationType;
  content?: any;
  success: boolean;
  message?: string;
  data?: any;
  operatedBy: string;
  useTime: number;
  nodeName?: string;
  error?: string;
}

/**
 * DTU 操作日志查询参数
 */
export interface QueryDtuOperationLogsParams {
  /** 按 MAC 地址筛选 */
  mac?: string;

  /** 按操作类型筛选 */
  operation?: DtuOperationType;

  /** 按操作人筛选 */
  operatedBy?: string;

  /** 只查询成功的操作 */
  successOnly?: boolean;

  /** 开始时间 */
  startTime?: Date;

  /** 结束时间 */
  endTime?: Date;

  /** 分页：页码（从 1 开始） */
  page?: number;

  /** 分页：每页数量 */
  limit?: number;

  /** 排序字段 */
  sortBy?: 'operatedAt' | 'useTime';

  /** 排序方向 */
  sortOrder?: 'asc' | 'desc';
}

/**
 * DTU 操作日志查询结果
 */
export interface QueryDtuOperationLogsResult {
  /** 日志列表 */
  logs: DtuOperationLog[];

  /** 总记录数 */
  total: number;

  /** 当前页码 */
  page: number;

  /** 每页数量 */
  limit: number;

  /** 总页数 */
  totalPages: number;
}
