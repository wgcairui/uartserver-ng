/**
 * Data API Service (Phase 4.2 Day 2)
 *
 * 数据查询服务层 - 负责设备数据的查询和管理
 */

import type { Db } from 'mongodb';
import {
  Phase3Collections,
  type DataRecordDocument,
  type ParsedDataDocument,
  type SingleDataDocument,
  type HistoryDataPoint,
  type AggregatedDataResult,
  validateTimeRange as entityValidateTimeRange,
} from '../entities/mongodb';

/**
 * 历史数据查询选项
 */
export interface HistoryDataOptions {
  mac: string;
  pid: number;
  names?: string[]; // 参数名称列表（可选）
  start: Date;
  end: Date;
  aggregate?: boolean; // 是否聚合
  interval?: number; // 聚合间隔（秒）
}

/**
 * 分页查询选项
 */
export interface PaginationOptions {
  page: number;
  limit: number;
}

/**
 * 分页查询结果
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * 数据 API 服务
 */
export class DataApiService {
  private collections: Phase3Collections;

  constructor(db: Db) {
    this.collections = new Phase3Collections(db);
  }

  // ============================================================================
  // 最新数据查询
  // ============================================================================

  /**
   * 获取设备的最新数据（所有参数）
   * @param mac 设备 MAC 地址
   * @param pid 协议 ID
   * @returns 最新数据列表
   */
  async getLatestData(mac: string, pid: number): Promise<SingleDataDocument[]> {
    return await this.collections.singleData.find({ mac, pid }).toArray();
  }

  /**
   * 获取设备指定参数的最新数据
   * @param mac 设备 MAC 地址
   * @param pid 协议 ID
   * @param name 参数名称
   * @returns 最新数据
   */
  async getLatestDataByName(
    mac: string,
    pid: number,
    name: string
  ): Promise<SingleDataDocument | null> {
    return await this.collections.singleData.findOne({ mac, pid, name });
  }

  /**
   * 批量获取多个设备的最新数据
   * @param devices 设备列表 [{ mac, pid }]
   * @returns 按设备分组的最新数据
   */
  async getBatchLatestData(
    devices: Array<{ mac: string; pid: number }>
  ): Promise<Record<string, SingleDataDocument[]>> {
    const result: Record<string, SingleDataDocument[]> = {};

    // 构建查询条件
    const conditions = devices.map((d) => ({ mac: d.mac, pid: d.pid }));

    // 批量查询
    const allData = await this.collections.singleData.find({ $or: conditions }).toArray();

    // 按设备分组
    for (const device of devices) {
      const key = `${device.mac}_${device.pid}`;
      result[key] = allData.filter((d) => d.mac === device.mac && d.pid === device.pid);
    }

    return result;
  }

  // ============================================================================
  // 历史数据查询
  // ============================================================================

  /**
   * 获取历史数据（不聚合）
   * @param options 查询选项
   * @returns 历史数据点列表
   */
  async getHistoryData(options: HistoryDataOptions): Promise<HistoryDataPoint[]> {
    const { mac, pid, names, start, end } = options;

    // 验证时间范围
    const validation = entityValidateTimeRange(start, end);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // 构建查询条件
    const query: any = {
      mac,
      pid,
      timestamp: { $gte: start, $lte: end },
    };

    // 如果指定了参数名称，添加到查询条件
    if (names && names.length > 0) {
      query.name = { $in: names };
    }

    // 查询并按时间排序
    const data = await this.collections.parsedData
      .find(query)
      .sort({ timestamp: 1 })
      .toArray();

    // 转换为 HistoryDataPoint 格式
    return data.map((d) => ({
      timestamp: d.timestamp,
      name: d.name,
      value: d.value,
      unit: d.unit,
    }));
  }

  /**
   * 获取历史数据（聚合）
   * @param options 查询选项
   * @returns 聚合后的数据结果
   */
  async getAggregatedHistoryData(
    options: HistoryDataOptions
  ): Promise<AggregatedDataResult[]> {
    const { mac, pid, names, start, end, interval = 3600 } = options;

    // 验证时间范围
    const validation = entityValidateTimeRange(start, end);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // 构建查询条件
    const matchStage: any = {
      mac,
      pid,
      timestamp: { $gte: start, $lte: end },
    };

    if (names && names.length > 0) {
      matchStage.name = { $in: names };
    }

    // 聚合查询
    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$name',
          avg: { $avg: '$value' },
          min: { $min: '$value' },
          max: { $max: '$value' },
          count: { $sum: 1 },
          unit: { $first: '$unit' },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const results = await this.collections.parsedData.aggregate(pipeline).toArray();

    return results.map((r) => ({
      name: r._id,
      avg: r.avg,
      min: r.min,
      max: r.max,
      count: r.count,
      unit: r.unit,
    }));
  }

  /**
   * 获取时间序列聚合数据（按时间间隔分组）
   * @param options 查询选项
   * @returns 按时间间隔聚合的数据
   */
  async getTimeSeriesAggregatedData(
    options: HistoryDataOptions
  ): Promise<Array<{ timestamp: Date; name: string; avg: number; count: number }>> {
    const { mac, pid, names, start, end, interval = 3600 } = options;

    // 验证时间范围
    const validation = entityValidateTimeRange(start, end);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // 构建查询条件
    const matchStage: any = {
      mac,
      pid,
      timestamp: { $gte: start, $lte: end },
    };

    if (names && names.length > 0) {
      matchStage.name = { $in: names };
    }

    // 计算时间分组间隔（毫秒）
    const intervalMs = interval * 1000;

    // 聚合查询
    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: {
            name: '$name',
            // 按时间间隔分组
            timeSlot: {
              $subtract: [
                { $toLong: '$timestamp' },
                { $mod: [{ $toLong: '$timestamp' }, intervalMs] },
              ],
            },
          },
          avg: { $avg: '$value' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.timeSlot': 1, '_id.name': 1 } },
    ];

    const results = await this.collections.parsedData.aggregate(pipeline).toArray();

    return results.map((r) => ({
      timestamp: new Date(r._id.timeSlot),
      name: r._id.name,
      avg: r.avg,
      count: r.count,
    }));
  }

  // ============================================================================
  // 原始数据查询
  // ============================================================================

  /**
   * 获取原始数据（分页）
   * @param mac 设备 MAC 地址
   * @param pid 协议 ID
   * @param start 开始时间
   * @param end 结束时间
   * @param pagination 分页选项
   * @returns 分页的原始数据
   */
  async getRawData(
    mac: string,
    pid: number,
    start: Date,
    end: Date,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<DataRecordDocument>> {
    // 验证时间范围
    const validation = entityValidateTimeRange(start, end);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const query = {
      mac,
      pid,
      timestamp: { $gte: start, $lte: end },
    };

    // 获取总数
    const total = await this.collections.dataRecords.countDocuments(query);

    // 分页查询
    const skip = (pagination.page - 1) * pagination.limit;
    const data = await this.collections.dataRecords
      .find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(pagination.limit)
      .toArray();

    return {
      data,
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit),
    };
  }

  // ============================================================================
  // 解析数据查询
  // ============================================================================

  /**
   * 获取解析数据（分页）
   * @param mac 设备 MAC 地址
   * @param pid 协议 ID
   * @param start 开始时间
   * @param end 结束时间
   * @param name 参数名称（可选）
   * @param pagination 分页选项
   * @returns 分页的解析数据
   */
  async getParsedData(
    mac: string,
    pid: number,
    start: Date,
    end: Date,
    name: string | undefined,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<ParsedDataDocument>> {
    // 验证时间范围
    const validation = entityValidateTimeRange(start, end);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const query: any = {
      mac,
      pid,
      timestamp: { $gte: start, $lte: end },
    };

    if (name) {
      query.name = name;
    }

    // 获取总数
    const total = await this.collections.parsedData.countDocuments(query);

    // 分页查询
    const skip = (pagination.page - 1) * pagination.limit;
    const data = await this.collections.parsedData
      .find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(pagination.limit)
      .toArray();

    return {
      data,
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit),
    };
  }

  // ============================================================================
  // 数据统计
  // ============================================================================

  /**
   * 获取设备数据统计信息
   * @param mac 设备 MAC 地址
   * @param pid 协议 ID
   * @returns 统计信息
   */
  async getDataStatistics(
    mac: string,
    pid: number
  ): Promise<{
    parameterCount: number;
    lastUpdateTime: Date | null;
    dataPoints: number;
  }> {
    // 获取参数数量
    const parameterCount = await this.collections.singleData.countDocuments({ mac, pid });

    // 获取最后更新时间
    const latest = await this.collections.singleData
      .find({ mac, pid })
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();

    const lastUpdateTime = latest.length > 0 ? latest[0]!.timestamp : null;

    // 获取数据点总数（过去 24 小时）
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dataPoints = await this.collections.parsedData.countDocuments({
      mac,
      pid,
      timestamp: { $gte: oneDayAgo },
    });

    return {
      parameterCount,
      lastUpdateTime,
      dataPoints,
    };
  }

  // ============================================================================
  // 数据可用性检查
  // ============================================================================

  /**
   * 检查设备是否有数据
   * @param mac 设备 MAC 地址
   * @param pid 协议 ID
   * @returns 是否有数据
   */
  async hasData(mac: string, pid: number): Promise<boolean> {
    const count = await this.collections.singleData.countDocuments({ mac, pid });
    return count > 0;
  }

  /**
   * 获取设备所有可用的参数名称
   * @param mac 设备 MAC 地址
   * @param pid 协议 ID
   * @returns 参数名称列表
   */
  async getAvailableParameters(mac: string, pid: number): Promise<string[]> {
    const data = await this.collections.singleData.find({ mac, pid }).toArray();
    return data.map((d) => d.name);
  }

  // ============================================================================
  // 数据清理（管理员功能）
  // ============================================================================

  /**
   * 删除设备的历史数据
   * @param mac 设备 MAC 地址
   * @param pid 协议 ID
   * @param before 删除该时间之前的数据
   * @returns 删除的记录数
   */
  async deleteHistoricalData(
    mac: string,
    pid: number,
    before: Date
  ): Promise<{ rawDeleted: number; parsedDeleted: number }> {
    const query = {
      mac,
      pid,
      timestamp: { $lt: before },
    };

    const rawResult = await this.collections.dataRecords.deleteMany(query);
    const parsedResult = await this.collections.parsedData.deleteMany(query);

    return {
      rawDeleted: rawResult.deletedCount,
      parsedDeleted: parsedResult.deletedCount,
    };
  }
}
