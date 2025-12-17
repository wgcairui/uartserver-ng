/**
 * Terminal Service
 * 终端设备管理服务
 */

import { mongodb } from '../database/mongodb';
import { Collection } from 'mongodb';

/**
 * 挂载设备信息
 */
export interface MountDevice {
  pid: number; // 设备 PID
  protocol: string; // 协议类型
  name?: string; // 设备名称
  Type: string; // 设备型号
  online?: boolean; // 在线状态
  mountData?: string; // 挂载数据
  bindDev?: string; // 绑定设备MAC
}

/**
 * 终端设备文档结构
 */
export interface Terminal {
  _id?: any;
  DevMac: string; // 设备 MAC 地址
  name: string; // 设备名称
  mountNode: string; // 挂载节点
  online: boolean; // 在线状态
  ICCID?: string; // SIM 卡 ICCID
  ownerId?: string; // 所有者 ID
  mountDevs?: MountDevice[]; // 挂载的设备列表
  AT?: string; // AT 指令
  UT?: Date; // 最后更新时间
  jw?: { lon: number; lat: number }; // 经纬度
  [key: string]: any; // 其他扩展字段
}

/**
 * 终端服务类
 * 提供终端设备的 CRUD 操作
 */
export class TerminalService {
  /**
   * 获取终端集合（延迟加载）
   */
  private get collection(): Collection<Terminal> {
    return mongodb.getCollection<Terminal>('terminals');
  }

  /**
   * 获取单个终端
   * @param mac - 终端 MAC 地址
   * @returns 终端对象或 null
   */
  async getTerminal(mac: string): Promise<Terminal | null> {
    const terminal = await this.collection.findOne({
      $or: [{ DevMac: mac }, { 'mountDevs.bindDev': mac }],
    });

    if (terminal) {
      this.updateTerminalOnlineStatus(terminal);
    }

    return terminal;
  }

  /**
   * 获取多个终端
   * @param macs - MAC 地址数组
   * @returns 终端数组
   */
  async getTerminals(macs: string[]): Promise<Terminal[]> {
    const terminals = await this.collection
      .find({ DevMac: { $in: macs } })
      .toArray();

    terminals.forEach(terminal => this.updateTerminalOnlineStatus(terminal));

    return terminals;
  }

  /**
   * 更新终端在线状态
   * 特殊逻辑: pesiv 协议的设备，如果终端在线，则所有挂载设备在线
   * @param terminal - 终端对象
   */
  private updateTerminalOnlineStatus(terminal: Terminal): void {
    if (!terminal.mountDevs) return;

    for (const dev of terminal.mountDevs) {
      // pesiv 协议特殊处理
      if (dev.protocol === 'pesiv' && terminal.online) {
        dev.online = true;
      }
    }
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
    return terminal?.mountDevs?.find(dev => dev.pid === pid);
  }

  /**
   * 更新终端在线状态
   * @param mac - 终端 MAC
   * @param online - 在线状态
   * @returns 是否更新成功
   */
  async updateOnlineStatus(mac: string, online: boolean): Promise<boolean> {
    const result = await this.collection.updateOne(
      { DevMac: mac },
      { $set: { online, UT: new Date() } }
    );

    return result.modifiedCount > 0;
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
    const result = await this.collection.updateOne(
      { DevMac: mac, 'mountDevs.pid': pid },
      { $set: { 'mountDevs.$.online': online, UT: new Date() } }
    );

    return result.modifiedCount > 0;
  }

  /**
   * 获取所有在线终端
   * @returns 在线终端列表
   */
  async getOnlineTerminals(): Promise<Terminal[]> {
    return await this.collection.find({ online: true }).toArray();
  }

  /**
   * 初始化终端（清空所有相关数据）
   * @param mac - 终端 MAC
   * @returns 操作耗时(ms)
   */
  async initTerminal(mac: string): Promise<number> {
    const startTime = Date.now();

    // 删除终端及相关数据
    await Promise.all([
      mongodb.getCollection('log.usebytes').deleteMany({ mac }),
      mongodb
        .getCollection('log.uartterminaldatatransfinites')
        .deleteMany({ mac }),
      this.collection.deleteOne({ DevMac: mac }),
      mongodb.getCollection('log.dtubusys').deleteMany({ mac }),
      mongodb.getCollection('client.resultcolltions').deleteMany({ mac }),
      mongodb.getCollection('client.resultsingles').deleteMany({ mac }),
      mongodb.getCollection('log.terminals').deleteMany({ TerminalMac: mac }),
    ]);

    return Date.now() - startTime;
  }

  /**
   * 创建或更新终端
   * @param terminal - 终端数据
   * @returns 是否成功
   */
  async upsertTerminal(terminal: Partial<Terminal>): Promise<boolean> {
    if (!terminal.DevMac) {
      throw new Error('DevMac 字段必填');
    }

    const result = await this.collection.updateOne(
      { DevMac: terminal.DevMac },
      { $set: { ...terminal, UT: new Date() } },
      { upsert: true }
    );

    return result.acknowledged;
  }
}

/**
 * 导出终端服务单例
 */
export const terminalService = new TerminalService();
