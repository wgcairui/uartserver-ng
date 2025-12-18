/**
 * Terminal 领域实体
 * 封装终端的业务逻辑，使用 DDD（领域驱动设计）模式
 */

import type { Terminal as TerminalData, MountDevice } from '../types/entities/terminal.entity';
import { mongodb } from '../database/mongodb';
import { logger } from '../utils/logger';

/**
 * Terminal 实体类
 * 包含业务逻辑和状态管理，支持"获取 → 操作 → flush"模式
 */
export class TerminalEntity {
  private data: TerminalData;
  private changes: Partial<TerminalData> = {};
  private mountDevChanges: Map<number, Partial<MountDevice>> = new Map();
  private isDirty = false;

  constructor(data: TerminalData) {
    this.data = { ...data };
  }

  /**
   * 获取原始数据（只读）
   */
  getData(): Readonly<TerminalData> {
    return this.data;
  }

  /**
   * 获取 MAC 地址
   */
  get mac(): string {
    return this.data.DevMac;
  }

  /**
   * 获取设备名称
   */
  get name(): string {
    return this.data.name;
  }

  /**
   * 获取在线状态
   */
  get online(): boolean {
    return this.data.online;
  }

  /**
   * 获取挂载节点
   */
  get mountNode(): string {
    return this.data.mountNode;
  }

  /**
   * 获取挂载设备列表（只读）
   */
  get mountDevs(): readonly MountDevice[] {
    return this.data.mountDevs || [];
  }

  /**
   * 更新终端在线状态
   * @param online - 在线状态
   */
  setOnline(online: boolean): this {
    if (this.data.online !== online) {
      this.data.online = online;
      this.changes.online = online;
      this.changes.uptime = new Date();
      this.isDirty = true;
      logger.debug(`Terminal ${this.mac} online status changed to ${online}`);
    }
    return this;
  }

  /**
   * 更新挂载设备在线状态
   * @param pid - 设备 PID
   * @param online - 在线状态
   */
  setMountDeviceOnline(pid: number, online: boolean): this {
    const mountDev = this.data.mountDevs?.find((d) => d.pid === pid);
    if (!mountDev) {
      logger.warn(`Mount device not found: ${this.mac}/${pid}`);
      return this;
    }

    if (mountDev.online !== online) {
      mountDev.online = online;
      mountDev.lastRecord = new Date();

      // 记录变更
      const existingChanges = this.mountDevChanges.get(pid) || {};
      this.mountDevChanges.set(pid, {
        ...existingChanges,
        online,
        lastRecord: new Date(),
      });

      this.changes.uptime = new Date();
      this.isDirty = true;
      logger.debug(`Mount device ${this.mac}/${pid} online status changed to ${online}`);
    }
    return this;
  }

  /**
   * 更新挂载设备最后发送时间
   * @param pid - 设备 PID
   * @param time - 发送时间
   */
  setMountDeviceLastEmit(pid: number, time: Date = new Date()): this {
    const mountDev = this.data.mountDevs?.find((d) => d.pid === pid);
    if (!mountDev) {
      logger.warn(`Mount device not found: ${this.mac}/${pid}`);
      return this;
    }

    mountDev.lastEmit = time;

    // 记录变更
    const existingChanges = this.mountDevChanges.get(pid) || {};
    this.mountDevChanges.set(pid, {
      ...existingChanges,
      lastEmit: time,
    });

    this.isDirty = true;
    return this;
  }

  /**
   * 更新挂载设备最后记录时间
   * @param pid - 设备 PID
   * @param time - 记录时间
   */
  setMountDeviceLastRecord(pid: number, time: Date = new Date()): this {
    const mountDev = this.data.mountDevs?.find((d) => d.pid === pid);
    if (!mountDev) {
      logger.warn(`Mount device not found: ${this.mac}/${pid}`);
      return this;
    }

    mountDev.lastRecord = time;

    // 记录变更
    const existingChanges = this.mountDevChanges.get(pid) || {};
    this.mountDevChanges.set(pid, {
      ...existingChanges,
      lastRecord: time,
    });

    this.isDirty = true;
    return this;
  }

  /**
   * 更新 ICCID 信息
   * @param iccidInfo - ICCID 信息（部分字段）
   */
  updateIccidInfo(iccidInfo: Partial<TerminalData['iccidInfo']>): this {
    if (!this.changes.iccidInfo) {
      this.changes.iccidInfo = { ...this.data.iccidInfo };
    }

    Object.assign(this.changes.iccidInfo, iccidInfo);
    this.changes.updatedAt = new Date();
    this.isDirty = true;

    logger.debug(`Terminal ${this.mac} ICCID info updated`);
    return this;
  }

  /**
   * 批量更新终端字段
   * @param updates - 要更新的字段
   */
  update(updates: Partial<TerminalData>): this {
    Object.assign(this.data, updates);
    Object.assign(this.changes, updates);
    this.changes.updatedAt = new Date();
    this.isDirty = true;

    logger.debug(`Terminal ${this.mac} updated with ${Object.keys(updates).length} fields`);
    return this;
  }

  /**
   * 获取指定的挂载设备
   * @param pid - 设备 PID
   */
  getMountDevice(pid: number): MountDevice | undefined {
    return this.data.mountDevs?.find((d) => d.pid === pid);
  }

  /**
   * 检查设备是否有变更
   */
  hasPendingChanges(): boolean {
    return this.isDirty;
  }

  /**
   * 获取变更内容（用于调试）
   */
  getChanges(): { terminal: Partial<TerminalData>; mountDevs: Map<number, Partial<MountDevice>> } {
    return {
      terminal: this.changes,
      mountDevs: this.mountDevChanges,
    };
  }

  /**
   * 持久化变更到数据库
   * @returns 是否成功
   */
  async flush(): Promise<boolean> {
    if (!this.isDirty) {
      logger.debug(`Terminal ${this.mac} has no pending changes, skipping flush`);
      return true;
    }

    try {
      const collection = mongodb.getCollection<TerminalData>('terminals');

      // 构建更新操作
      const updateOps: Record<string, any> = {};

      // 1. 终端级别的变更
      if (Object.keys(this.changes).length > 0) {
        Object.entries(this.changes).forEach(([key, value]) => {
          if (key !== 'iccidInfo') {
            updateOps[key] = value;
          }
        });

        // 特殊处理 iccidInfo（嵌套对象）
        if (this.changes.iccidInfo) {
          Object.entries(this.changes.iccidInfo).forEach(([key, value]) => {
            updateOps[`iccidInfo.${key}`] = value;
          });
        }
      }

      // 2. 挂载设备级别的变更
      if (this.mountDevChanges.size > 0) {
        for (const [pid, changes] of this.mountDevChanges.entries()) {
          const index = this.data.mountDevs?.findIndex((d) => d.pid === pid);
          if (index !== undefined && index >= 0) {
            Object.entries(changes).forEach(([key, value]) => {
              updateOps[`mountDevs.${index}.${key}`] = value;
            });
          }
        }
      }

      // 执行数据库更新
      if (Object.keys(updateOps).length > 0) {
        const result = await collection.updateOne(
          { DevMac: this.mac },
          { $set: updateOps }
        );

        if (result.modifiedCount > 0 || result.matchedCount > 0) {
          logger.debug(`Terminal ${this.mac} flushed to database, ${Object.keys(updateOps).length} fields updated`);

          // 清空变更跟踪
          this.changes = {};
          this.mountDevChanges.clear();
          this.isDirty = false;

          return true;
        } else {
          logger.warn(`Terminal ${this.mac} flush failed: no documents matched or modified`);
          return false;
        }
      } else {
        // 没有实际变更
        this.isDirty = false;
        return true;
      }
    } catch (error) {
      logger.error(`Failed to flush terminal ${this.mac}:`, error);
      return false;
    }
  }

  /**
   * 重置变更跟踪（不推荐使用，除非确定要丢弃变更）
   */
  reset(): void {
    this.changes = {};
    this.mountDevChanges.clear();
    this.isDirty = false;
    logger.debug(`Terminal ${this.mac} changes reset`);
  }

  /**
   * 特殊逻辑：更新在线状态（pesiv 协议设备）
   * pesiv 协议的设备，如果终端在线，则所有挂载设备在线
   */
  updateOnlineStatusForPesiv(): this {
    if (!this.data.mountDevs || !this.data.online) {
      return this;
    }

    let hasChanges = false;
    for (const dev of this.data.mountDevs) {
      if (dev.protocol === 'pesiv' && !dev.online) {
        dev.online = true;

        // 记录变更
        const existingChanges = this.mountDevChanges.get(dev.pid) || {};
        this.mountDevChanges.set(dev.pid, {
          ...existingChanges,
          online: true,
        });

        hasChanges = true;
      }
    }

    if (hasChanges) {
      this.isDirty = true;
      logger.debug(`Terminal ${this.mac} pesiv devices forced online`);
    }

    return this;
  }
}
