/**
 * Terminal Service
 * 终端设备管理服务
 * 完全兼容老系统数据模型
 *
 * 注意：这是向后兼容层，内部委托给 TerminalRepository 和 TerminalEntity
 * 新代码应该直接使用 terminalRepository.findByMac() 获取实体
 */

import { terminalRepository } from '../repositories/terminal.repository';
import type {
  Terminal,
  MountDevice,
  TerminalUpdate,
  TerminalFilter,
} from '../types/entities';

/**
 * 终端服务类
 * 提供终端设备的 CRUD 操作（向后兼容 API）
 */
export class TerminalService {

  /**
   * 获取单个终端
   * @param mac - 终端 MAC 地址
   * @returns 终端对象或 null
   */
  async getTerminal(mac: string): Promise<Terminal | null> {
    const entity = await terminalRepository.findByMac(mac);
    return entity ? entity.getData() : null;
  }

  /**
   * 根据节点名称获取终端列表
   * @param nodeName - 节点名称
   * @returns 终端数组
   */
  async getTerminalsByNode(nodeName: string): Promise<Terminal[]> {
    const entities = await terminalRepository.findByNode(nodeName);
    return entities.map((e) => e.getData());
  }

  /**
   * 获取多个终端
   * @param macs - MAC 地址数组
   * @returns 终端数组
   */
  async getTerminals(macs: string[]): Promise<Terminal[]> {
    const entities = await terminalRepository.findByMacs(macs);
    return entities.map((e) => e.getData());
  }

  /**
   * 根据过滤条件查询终端
   * @param filter - 查询过滤器
   * @returns 终端数组
   */
  async findTerminals(filter: TerminalFilter): Promise<Terminal[]> {
    const entities = await terminalRepository.find(filter);
    return entities.map((e) => e.getData());
  }

  /**
   * 获取终端的挂载设备
   * @param mac - 终端 MAC
   * @param pid - 设备 PID
   * @returns 挂载设备或 undefined
   */
  async getMountDevice(
    mac: string,
    pid: number
  ): Promise<MountDevice | undefined> {
    const terminal = await this.getTerminal(mac);
    return terminal?.mountDevs?.find((dev) => dev.pid === pid);
  }

  /**
   * 更新终端在线状态
   * @param mac - 终端 MAC
   * @param online - 在线状态
   * @returns 是否更新成功
   */
  async updateOnlineStatus(mac: string, online: boolean): Promise<boolean> {
    const entity = await terminalRepository.findByMac(mac);
    if (!entity) {
      return false;
    }

    entity.setOnline(online);
    return await entity.flush();
  }

  /**
   * 更新挂载设备在线状态
   * @param mac - 终端 MAC
   * @param pid - 设备 PID
   * @param online - 在线状态
   * @returns 是否更新成功
   */
  async updateMountDeviceOnlineStatus(
    mac: string,
    pid: number,
    online: boolean
  ): Promise<boolean> {
    const entity = await terminalRepository.findByMac(mac);
    if (!entity) {
      return false;
    }

    entity.setMountDeviceOnline(pid, online);
    return await entity.flush();
  }

  /**
   * 更新挂载设备 lastEmit 时间戳（查询发送时间）
   * @param mac - 终端 MAC
   * @param pid - 设备 PID
   * @param time - 发送时间
   * @returns 是否更新成功
   */
  async updateMountDeviceLastEmit(
    mac: string,
    pid: number,
    time: Date
  ): Promise<boolean> {
    const entity = await terminalRepository.findByMac(mac);
    if (!entity) {
      return false;
    }

    entity.setMountDeviceLastEmit(pid, time);
    return await entity.flush();
  }

  /**
   * 更新挂载设备 lastRecord 时间戳（查询响应时间）
   * @param mac - 终端 MAC
   * @param pid - 设备 PID
   * @param time - 响应时间
   * @returns 是否更新成功
   */
  async updateMountDeviceLastRecord(
    mac: string,
    pid: number,
    time: Date
  ): Promise<boolean> {
    const entity = await terminalRepository.findByMac(mac);
    if (!entity) {
      return false;
    }

    entity.setMountDeviceLastRecord(pid, time);
    return await entity.flush();
  }

  /**
   * 获取所有在线终端
   * @returns 在线终端列表
   */
  async getOnlineTerminals(): Promise<Terminal[]> {
    const entities = await terminalRepository.findOnlineTerminals();
    return entities.map((e) => e.getData());
  }

  /**
   * 初始化终端（清空所有相关数据）
   * @param mac - 终端 MAC
   * @returns 操作耗时(ms)
   */
  async initTerminal(mac: string): Promise<number> {
    return await terminalRepository.initialize(mac);
  }

  /**
   * 创建或更新终端
   * @param terminal - 终端数据
   * @returns 是否成功
   */
  async upsertTerminal(terminal: TerminalUpdate & { DevMac: string }): Promise<boolean> {
    return await terminalRepository.upsert(terminal as any);
  }

  /**
   * 更新终端字段
   * @param mac - 终端 MAC
   * @param update - 要更新的字段
   * @returns 是否成功
   */
  async updateTerminal(mac: string, update: TerminalUpdate): Promise<boolean> {
    const entity = await terminalRepository.findByMac(mac);
    if (!entity) {
      return false;
    }

    entity.update(update as any);
    return await entity.flush();
  }

  /**
   * 删除终端
   * @param mac - 终端 MAC
   * @returns 是否成功
   */
  async deleteTerminal(mac: string): Promise<boolean> {
    return await terminalRepository.delete(mac);
  }

  /**
   * 更新终端 ICCID 信息
   * @param mac - 终端 MAC
   * @param iccidInfo - ICCID 信息（部分字段）
   * @returns 是否成功
   */
  async updateIccidInfo(
    mac: string,
    iccidInfo: Partial<Terminal['iccidInfo']>
  ): Promise<boolean> {
    const entity = await terminalRepository.findByMac(mac);
    if (!entity) {
      return false;
    }

    entity.updateIccidInfo(iccidInfo);
    return await entity.flush();
  }
}

/**
 * 导出终端服务单例
 */
export const terminalService = new TerminalService();
