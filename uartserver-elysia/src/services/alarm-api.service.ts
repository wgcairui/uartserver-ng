/**
 * Alarm API Service (Phase 4.2 Day 3)
 *
 * 告警管理服务层 - 负责告警查询、确认、统计等功能
 */

import type { Db, ObjectId } from 'mongodb';
import {
  Phase3Collections,
  type AlarmDocument,
  type UserAlarmSetupDocument,
  acknowledgeAlarm,
  resolveAlarm,
} from '../entities/mongodb';

/**
 * 告警查询选项
 */
export interface AlarmQueryOptions {
  page: number;
  limit: number;
  status?: 'active' | 'acknowledged' | 'resolved' | 'auto_resolved';
  level?: 'info' | 'warning' | 'error' | 'critical';
  mac?: string;
  pid?: number;
  protocol?: string;
  tag?: string;
  startTime?: Date;
  endTime?: Date;
  sortBy?: 'timeStamp' | 'level' | 'status' | 'mac';
  sortOrder?: 'asc' | 'desc';
}

/**
 * 分页查询结果
 */
export interface PaginatedAlarmResult {
  data: AlarmDocument[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * 告警统计结果
 */
export interface AlarmStats {
  total: number;
  byLevel: Record<string, number>;
  byStatus: Record<string, number>;
  byTag?: Record<string, number>;
}

/**
 * 告警 API 服务
 */
export class AlarmApiService {
  private collections: Phase3Collections;

  constructor(db: Db) {
    this.collections = new Phase3Collections(db);
  }

  // ============================================================================
  // 告警查询
  // ============================================================================

  /**
   * 获取告警列表（分页）
   * @param options 查询选项
   * @returns 分页的告警列表
   */
  async getAlarms(options: AlarmQueryOptions): Promise<PaginatedAlarmResult> {
    // 构建查询条件
    const query: any = {};

    if (options.status) {
      query.status = options.status;
    }

    if (options.level) {
      query.level = options.level;
    }

    if (options.mac) {
      query.mac = options.mac;
    }

    if (options.pid !== undefined) {
      query.pid = options.pid;
    }

    if (options.protocol) {
      query.protocol = options.protocol;
    }

    if (options.tag) {
      query.tag = options.tag;
    }

    // 时间范围
    if (options.startTime || options.endTime) {
      query.triggeredAt = {};
      if (options.startTime) {
        query.triggeredAt.$gte = options.startTime;
      }
      if (options.endTime) {
        query.triggeredAt.$lte = options.endTime;
      }
    }

    // 获取总数
    const total = await this.collections.alarms.countDocuments(query);

    // 构建排序
    const sort: any = {};
    sort[options.sortBy || 'timeStamp'] = options.sortOrder === 'asc' ? 1 : -1;

    // 分页查询
    const skip = (options.page - 1) * options.limit;
    const data = await this.collections.alarms
      .find(query)
      .sort(sort)
      .skip(skip)
      .limit(options.limit)
      .toArray();

    return {
      data,
      total,
      page: options.page,
      limit: options.limit,
      totalPages: Math.ceil(total / options.limit),
    };
  }

  /**
   * 获取单个告警
   * @param id 告警 ID
   * @returns 告警文档
   */
  async getAlarmById(id: ObjectId): Promise<AlarmDocument | null> {
    return await this.collections.alarms.findOne({ _id: id });
  }

  /**
   * 获取未确认告警数量
   * @param options 过滤选项
   * @returns 未确认告警数量
   */
  async getUnconfirmedCount(options?: {
    mac?: string;
    level?: string;
    since?: Date;
  }): Promise<number> {
    const query: any = {
      status: 'active',
    };

    if (options?.mac) {
      query.mac = options.mac;
    }

    if (options?.level) {
      query.level = options.level;
    }

    if (options?.since) {
      query.triggeredAt = { $gte: options.since };
    }

    return await this.collections.alarms.countDocuments(query);
  }

  /**
   * 获取告警统计信息
   * @param options 过滤选项
   * @returns 告警统计
   */
  async getAlarmStats(options?: {
    mac?: string;
    startTime?: Date;
    endTime?: Date;
  }): Promise<AlarmStats> {
    const query: any = {};

    if (options?.mac) {
      query.mac = options.mac;
    }

    if (options?.startTime || options?.endTime) {
      query.triggeredAt = {};
      if (options.startTime) {
        query.triggeredAt.$gte = options.startTime;
      }
      if (options.endTime) {
        query.triggeredAt.$lte = options.endTime;
      }
    }

    // 总数
    const total = await this.collections.alarms.countDocuments(query);

    // 按级别统计
    const byLevelPipeline = [
      { $match: query },
      { $group: { _id: '$level', count: { $sum: 1 } } },
    ];
    const byLevelResults = await this.collections.alarms
      .aggregate(byLevelPipeline)
      .toArray();
    const byLevel: Record<string, number> = {};
    for (const item of byLevelResults) {
      byLevel[item._id] = item.count;
    }

    // 按状态统计
    const byStatusPipeline = [
      { $match: query },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ];
    const byStatusResults = await this.collections.alarms
      .aggregate(byStatusPipeline)
      .toArray();
    const byStatus: Record<string, number> = {};
    for (const item of byStatusResults) {
      byStatus[item._id] = item.count;
    }

    return {
      total,
      byLevel,
      byStatus,
    };
  }

  // ============================================================================
  // 告警操作
  // ============================================================================

  /**
   * 确认告警
   * @param id 告警 ID
   * @param userId 确认用户 ID
   * @param comment 确认备注
   * @returns 是否成功
   */
  async confirmAlarm(
    id: ObjectId,
    userId: string,
    comment?: string
  ): Promise<boolean> {
    const update = acknowledgeAlarm(userId, comment);

    const result = await this.collections.alarms.updateOne(
      { _id: id, status: 'active' },
      { $set: update }
    );

    return result.modifiedCount > 0;
  }

  /**
   * 批量确认告警
   * @param ids 告警 ID 列表
   * @param userId 确认用户 ID
   * @param comment 确认备注
   * @returns 确认数量
   */
  async confirmAlarmsBatch(
    ids: ObjectId[],
    userId: string,
    comment?: string
  ): Promise<number> {
    const update = acknowledgeAlarm(userId, comment);

    const result = await this.collections.alarms.updateMany(
      { _id: { $in: ids }, status: 'active' },
      { $set: update }
    );

    return result.modifiedCount;
  }

  /**
   * 解决告警
   * @param id 告警 ID
   * @param userId 解决用户 ID
   * @param solution 解决方案
   * @returns 是否成功
   */
  async resolveAlarm(
    id: ObjectId,
    userId: string,
    solution?: string
  ): Promise<boolean> {
    const update = resolveAlarm(userId, solution);

    const result = await this.collections.alarms.updateOne(
      { _id: id, status: { $in: ['active', 'acknowledged'] } },
      { $set: update }
    );

    return result.modifiedCount > 0;
  }

  /**
   * 批量解决告警
   * @param ids 告警 ID 列表
   * @param userId 解决用户 ID
   * @param solution 解决方案
   * @returns 解决数量
   */
  async resolveAlarmsBatch(
    ids: ObjectId[],
    userId: string,
    solution?: string
  ): Promise<number> {
    const update = resolveAlarm(userId, solution);

    const result = await this.collections.alarms.updateMany(
      { _id: { $in: ids }, status: { $in: ['active', 'acknowledged'] } },
      { $set: update }
    );

    return result.modifiedCount;
  }

  // ============================================================================
  // 告警配置
  // ============================================================================

  /**
   * 获取用户告警配置
   * @param userId 用户 ID
   * @returns 告警配置
   */
  async getUserAlarmConfig(userId: string): Promise<UserAlarmSetupDocument | null> {
    return await this.collections.userAlarmSetups.findOne({ userId });
  }

  /**
   * 更新告警联系人
   * @param userId 用户 ID
   * @param contacts 联系人信息
   * @returns 是否成功
   */
  async updateAlarmContacts(
    userId: string,
    contacts: {
      emails?: string[];
      phones?: string[];
      enableEmail?: boolean;
      enableSms?: boolean;
      enablePush?: boolean;
    }
  ): Promise<boolean> {
    const update: any = {
      updatedAt: new Date(),
    };

    if (contacts.emails !== undefined) {
      update.emails = contacts.emails;
    }
    if (contacts.phones !== undefined) {
      update.phones = contacts.phones;
    }
    if (contacts.enableEmail !== undefined) {
      update.enableEmail = contacts.enableEmail;
    }
    if (contacts.enableSms !== undefined) {
      update.enableSms = contacts.enableSms;
    }
    if (contacts.enablePush !== undefined) {
      update.enablePush = contacts.enablePush;
    }

    const result = await this.collections.userAlarmSetups.updateOne(
      { userId },
      { $set: update },
      { upsert: true }
    );

    return result.matchedCount > 0 || result.upsertedCount > 0;
  }

  // ============================================================================
  // 告警检查（内部使用）
  // ============================================================================

  /**
   * 检查设备是否有活跃告警
   * @param mac 设备 MAC
   * @param pid 设备 PID
   * @returns 是否有活跃告警
   */
  async hasActiveAlarms(mac: string, pid?: number): Promise<boolean> {
    const query: any = {
      mac,
      status: 'active',
    };

    if (pid !== undefined) {
      query.pid = pid;
    }

    const count = await this.collections.alarms.countDocuments(query);
    return count > 0;
  }

  /**
   * 获取最近的告警
   * @param mac 设备 MAC
   * @param limit 数量限制
   * @returns 最近的告警列表
   */
  async getRecentAlarms(mac: string, limit: number = 10): Promise<AlarmDocument[]> {
    return await this.collections.alarms
      .find({ mac })
      .sort({ triggeredAt: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * 删除旧告警（管理员功能）
   * @param before 删除该时间之前的已解决告警
   * @returns 删除数量
   */
  async deleteOldAlarms(before: Date): Promise<number> {
    const result = await this.collections.alarms.deleteMany({
      status: { $in: ['resolved', 'auto_resolved'] },
      resolvedAt: { $lt: before },
    });

    return result.deletedCount;
  }
}
