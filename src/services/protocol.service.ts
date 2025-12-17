/**
 * Protocol Service
 * 协议管理服务
 */

import { mongodb } from '../database/mongodb';
import { Collection } from 'mongodb';

/**
 * 协议指令定义
 */
export interface ProtocolInstruct {
  name: string;
  resultType: string;
  shift: boolean;
  isState?: boolean;
  isSplit?: boolean;
  pop?: number;
  resize?: number;
  [key: string]: any;
}

/**
 * 协议文档结构
 */
export interface Protocol {
  _id?: any;
  Type: number; // 协议类型 (232/485/etc)
  ProtocolType: string; // 协议名称类型
  Protocol: string; // 协议唯一标识
  instruct: ProtocolInstruct[]; // 指令列表
  Company?: string; // 厂商
  Type232?: number; // 232 类型
  scriptStart?: string; // 脚本启动代码
  scriptEnd?: string; // 脚本结束代码
}

/**
 * 协议服务类
 * 提供协议的 CRUD 操作
 */
export class ProtocolService {
  /**
   * 获取协议集合（延迟加载）
   */
  private get collection(): Collection<Protocol> {
    return mongodb.getCollection<Protocol>('device.protocols');
  }

  /**
   * 获取指定协议
   * @param protocol - 协议标识
   * @returns 协议对象或 null
   */
  async getProtocol(protocol: string): Promise<Protocol | null> {
    return await this.collection.findOne({ Protocol: protocol });
  }

  /**
   * 获取多个协议
   * @param protocols - 协议标识数组
   * @returns 协议数组
   */
  async getProtocols(protocols: string[]): Promise<Protocol[]> {
    return await this.collection
      .find({ Protocol: { $in: protocols } })
      .toArray();
  }

  /**
   * 获取所有协议
   * @returns 所有协议列表
   */
  async getAllProtocols(): Promise<Protocol[]> {
    return await this.collection.find({}).toArray();
  }

  /**
   * 创建或更新协议
   * @param protocol - 协议数据
   * @returns 更新结果
   */
  async upsertProtocol(protocol: Partial<Protocol>): Promise<boolean> {
    const { Protocol: protocolId, ProtocolType, instruct } = protocol;

    if (!protocolId || !ProtocolType || !instruct) {
      throw new Error('Protocol, ProtocolType 和 instruct 字段必填');
    }

    const result = await this.collection.updateOne(
      { Protocol: protocolId },
      { $set: protocol },
      { upsert: true }
    );

    return result.acknowledged;
  }

  /**
   * 删除协议
   * @param protocol - 协议标识
   * @returns 是否删除成功
   */
  async deleteProtocol(protocol: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ Protocol: protocol });
    return result.deletedCount > 0;
  }

  /**
   * 获取协议指令列表
   * @param protocol - 协议标识
   * @returns 指令数组
   */
  async getProtocolInstructs(protocol: string): Promise<ProtocolInstruct[]> {
    const proto = await this.getProtocol(protocol);
    return proto?.instruct || [];
  }
}

/**
 * 导出协议服务单例
 */
export const protocolService = new ProtocolService();
