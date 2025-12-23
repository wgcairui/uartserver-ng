/**
 * Terminal API Service
 *
 * Phase 4.2 API 网关的终端服务
 * 直接使用 MongoDB Phase3Collections，为 REST API 提供业务逻辑
 */

import { Db, ObjectId } from 'mongodb';
import type {
  TerminalDocument,
  MountDevice,
} from '../entities/mongodb/terminal.entity';
import { Phase3Collections } from '../entities/mongodb';

/**
 * 终端列表查询选项
 */
export interface TerminalListOptions {
  online?: boolean;
  share?: boolean;
  keyword?: string;
  page?: number;
  limit?: number;
}

/**
 * 终端 API 服务类
 *
 * 提供 Phase 4.2 REST API 所需的终端管理功能
 */
export class TerminalApiService {
  private collections: Phase3Collections;

  constructor(db: Db) {
    this.collections = new Phase3Collections(db);
  }

  // ==================== 查询方法 ====================

  /**
   * 获取终端列表（支持过滤和分页）
   *
   * @param macs - MAC 地址数组（用户绑定的设备）
   * @param options - 查询选项
   * @returns 终端列表和总数
   */
  async getTerminals(
    macs: string[],
    options: TerminalListOptions = {}
  ): Promise<{ terminals: TerminalDocument[]; total: number }> {
    const { online, share, keyword, page = 1, limit = 50 } = options;

    // 构建查询条件
    const filter: any = {
      DevMac: { $in: macs },
    };

    if (online !== undefined) {
      filter.online = online;
    }

    if (share !== undefined) {
      filter.share = share;
    }

    if (keyword) {
      filter.$or = [
        { DevMac: { $regex: keyword, $options: 'i' } },
        { name: { $regex: keyword, $options: 'i' } },
      ];
    }

    // 计算分页
    const skip = (page - 1) * limit;

    // 并行查询数据和总数
    const [terminals, total] = await Promise.all([
      this.collections.terminals
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      this.collections.terminals.countDocuments(filter),
    ]);

    return { terminals, total };
  }

  /**
   * 获取单个终端
   *
   * @param mac - 终端 MAC 地址
   * @returns 终端文档或 null
   */
  async getTerminal(mac: string): Promise<TerminalDocument | null> {
    return await this.collections.terminals.findOne({ DevMac: mac });
  }

  /**
   * 获取多个终端（批量查询）
   *
   * @param macs - MAC 地址数组
   * @returns 终端数组
   */
  async getTerminalsByMacs(macs: string[]): Promise<TerminalDocument[]> {
    return await this.collections.terminals
      .find({ DevMac: { $in: macs } })
      .toArray();
  }

  /**
   * 检查终端是否存在
   *
   * @param mac - 终端 MAC 地址
   * @returns 是否存在
   */
  async exists(mac: string): Promise<boolean> {
    const count = await this.collections.terminals.countDocuments({
      DevMac: mac,
    });
    return count > 0;
  }

  // ==================== 更新方法 ====================

  /**
   * 更新终端信息
   *
   * @param mac - 终端 MAC 地址
   * @param updates - 要更新的字段
   * @returns 是否成功
   */
  async updateTerminal(
    mac: string,
    updates: Partial<TerminalDocument>
  ): Promise<boolean> {
    const result = await this.collections.terminals.updateOne(
      { DevMac: mac },
      {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      }
    );

    return result.modifiedCount > 0;
  }

  /**
   * 更新终端在线状态
   *
   * @param mac - 终端 MAC 地址
   * @param online - 在线状态
   * @returns 是否成功
   */
  async updateOnlineStatus(mac: string, online: boolean): Promise<boolean> {
    const updateData: any = {
      online,
      updatedAt: new Date(),
    };

    if (online) {
      updateData.lastSeen = new Date();
    }

    const result = await this.collections.terminals.updateOne(
      { DevMac: mac },
      { $set: updateData }
    );

    return result.modifiedCount > 0;
  }

  // ==================== 绑定管理 ====================

  /**
   * 检查终端是否被绑定
   *
   * @param mac - 终端 MAC 地址
   * @returns 是否已被绑定
   */
  async isBound(mac: string): Promise<boolean> {
    const terminal = await this.collections.terminals.findOne(
      { DevMac: mac },
      { projection: { bindUsers: 1 } }
    );

    return (terminal?.bindUsers?.length || 0) > 0;
  }

  /**
   * 设置终端所有者
   *
   * @param mac - 终端 MAC 地址
   * @param userId - 用户 ID
   * @returns 是否成功
   */
  async setTerminalOwner(mac: string, userId: string): Promise<boolean> {
    const result = await this.collections.terminals.updateOne(
      { DevMac: mac },
      {
        $set: {
          ownerId: userId,
          updatedAt: new Date(),
        },
      }
    );

    return result.modifiedCount > 0;
  }

  /**
   * 绑定终端到用户
   *
   * @param userId - 用户 ID
   * @param mac - 终端 MAC 地址
   * @returns 是否成功
   */
  async bindTerminal(userId: string, mac: string): Promise<boolean> {
    // 添加用户到终端的 bindUsers 列表
    const terminalResult = await this.collections.terminals.updateOne(
      { DevMac: mac },
      {
        $addToSet: { bindUsers: userId },
        $set: { updatedAt: new Date() },
      }
    );

    // 添加终端到用户的 devices 列表
    const userResult = await this.collections.users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $addToSet: { devices: mac },
        $set: { updatedAt: new Date() },
      }
    );

    return terminalResult.modifiedCount > 0 && userResult.modifiedCount > 0;
  }

  /**
   * 解绑终端与用户
   *
   * @param userId - 用户 ID
   * @param mac - 终端 MAC 地址
   * @returns 是否成功
   */
  async unbindTerminal(userId: string, mac: string): Promise<boolean> {
    // 从终端的 bindUsers 列表移除用户
    const terminalResult = await this.collections.terminals.updateOne(
      { DevMac: mac },
      {
        $pull: { bindUsers: userId },
        $set: { updatedAt: new Date() },
      }
    );

    // 从用户的 devices 列表移除终端
    const userResult = await this.collections.users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $pull: { devices: mac },
        $set: { updatedAt: new Date() },
      }
    );

    return terminalResult.modifiedCount > 0 || userResult.modifiedCount > 0;
  }

  // ==================== 挂载设备管理 ====================

  /**
   * 添加挂载设备
   *
   * @param mac - 终端 MAC 地址
   * @param mountDev - 挂载设备信息
   * @returns 是否成功
   */
  async addMountDevice(mac: string, mountDev: MountDevice): Promise<boolean> {
    // 检查 PID 是否已存在
    const terminal = await this.getTerminal(mac);
    if (!terminal) {
      return false;
    }

    const existingDev = terminal.mountDevs?.find(
      (dev) => dev.pid === mountDev.pid
    );
    if (existingDev) {
      throw new Error(`PID ${mountDev.pid} already exists`);
    }

    // 添加挂载设备
    const result = await this.collections.terminals.updateOne(
      { DevMac: mac },
      {
        $push: { mountDevs: mountDev },
        $set: { updatedAt: new Date() },
      }
    );

    return result.modifiedCount > 0;
  }

  /**
   * 删除挂载设备
   *
   * @param mac - 终端 MAC 地址
   * @param pid - 设备 PID
   * @returns 是否成功
   */
  async removeMountDevice(mac: string, pid: number): Promise<boolean> {
    const result = await this.collections.terminals.updateOne(
      { DevMac: mac },
      {
        $pull: { mountDevs: { pid } as any },
        $set: { updatedAt: new Date() },
      }
    );

    return result.modifiedCount > 0;
  }

  /**
   * 获取挂载设备
   *
   * @param mac - 终端 MAC 地址
   * @param pid - 设备 PID
   * @returns 挂载设备或 null
   */
  async getMountDevice(
    mac: string,
    pid: number
  ): Promise<MountDevice | null> {
    const terminal = await this.collections.terminals.findOne(
      { DevMac: mac, 'mountDevs.pid': pid },
      { projection: { mountDevs: 1 } }
    );

    if (!terminal?.mountDevs) {
      return null;
    }

    return terminal.mountDevs.find((dev) => dev.pid === pid) || null;
  }

  /**
   * 更新挂载设备信息
   *
   * @param mac - 终端 MAC 地址
   * @param pid - 设备 PID
   * @param updates - 要更新的字段
   * @returns 是否成功
   */
  async updateMountDevice(
    mac: string,
    pid: number,
    updates: Partial<MountDevice>
  ): Promise<boolean> {
    // 构建更新操作
    const setFields: any = {
      updatedAt: new Date(),
    };

    for (const [key, value] of Object.entries(updates)) {
      setFields[`mountDevs.$.${key}`] = value;
    }

    const result = await this.collections.terminals.updateOne(
      { DevMac: mac, 'mountDevs.pid': pid },
      { $set: setFields }
    );

    return result.modifiedCount > 0;
  }

  /**
   * 设置挂载设备在线状态
   *
   * @param mac - 终端 MAC 地址
   * @param pid - 设备 PID
   * @param online - 在线状态
   * @returns 是否成功
   */
  async setDeviceOnline(
    mac: string,
    pid: number,
    online: boolean
  ): Promise<boolean> {
    return await this.updateMountDevice(mac, pid, { online });
  }

  // ==================== 统计方法 ====================

  /**
   * 获取终端统计信息
   *
   * @param macs - MAC 地址数组（可选，限制范围）
   * @returns 统计信息
   */
  async getTerminalStats(macs?: string[]): Promise<{
    total: number;
    online: number;
    offline: number;
    shared: number;
  }> {
    const baseFilter: any = macs ? { DevMac: { $in: macs } } : {};

    const [total, online, shared] = await Promise.all([
      this.collections.terminals.countDocuments(baseFilter),
      this.collections.terminals.countDocuments({
        ...baseFilter,
        online: true,
      }),
      this.collections.terminals.countDocuments({
        ...baseFilter,
        share: true,
      }),
    ]);

    return {
      total,
      online,
      offline: total - online,
      shared,
    };
  }

  /**
   * 获取在线终端列表
   *
   * @param macs - MAC 地址数组（可选）
   * @returns 在线终端列表
   */
  async getOnlineTerminals(macs?: string[]): Promise<TerminalDocument[]> {
    const filter: any = { online: true };
    if (macs) {
      filter.DevMac = { $in: macs };
    }

    return await this.collections.terminals.find(filter).toArray();
  }

  // ==================== 批量操作 ====================

  /**
   * 批量更新终端状态
   *
   * @param macs - MAC 地址数组
   * @param updates - 要更新的字段
   * @returns 更新数量
   */
  async batchUpdateTerminals(
    macs: string[],
    updates: Partial<TerminalDocument>
  ): Promise<number> {
    const result = await this.collections.terminals.updateMany(
      { DevMac: { $in: macs } },
      {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      }
    );

    return result.modifiedCount;
  }

  /**
   * 批量设置终端离线
   *
   * @param macs - MAC 地址数组
   * @returns 更新数量
   */
  async batchSetOffline(macs: string[]): Promise<number> {
    return await this.batchUpdateTerminals(macs, { online: false });
  }
}
