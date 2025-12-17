/**
 * Node Client Service
 * Node 客户端管理服务 - 管理远程 UART 服务器节点的注册和配置
 */

import { mongodb } from '../database/mongodb';
import { Collection } from 'mongodb';
import { NodeClient } from '../types/socket.types';

/**
 * Node 客户端服务类
 * 提供 Node 客户端的 CRUD 操作
 */
export class NodeService {
  /**
   * 获取 Node 集合（延迟加载）
   */
  private get collection(): Collection<NodeClient> {
    return mongodb.getCollection<NodeClient>('node.clients');
  }

  /**
   * 根据节点名称获取 Node 客户端
   * @param name - 节点名称
   * @returns Node 客户端或 null
   */
  async getNodeByName(name: string): Promise<NodeClient | null> {
    return await this.collection.findOne({ Name: name });
  }

  /**
   * 根据 IP 地址获取 Node 客户端
   * @param ip - IP 地址
   * @returns Node 客户端或 null
   */
  async getNodeByIP(ip: string): Promise<NodeClient | null> {
    return await this.collection.findOne({ IP: ip });
  }

  /**
   * 获取所有 Node 客户端
   * @returns Node 客户端列表
   */
  async getAllNodes(): Promise<NodeClient[]> {
    return await this.collection.find({}).toArray();
  }

  /**
   * 创建或更新 Node 客户端
   * @param node - Node 客户端数据
   * @returns 是否成功
   */
  async upsertNode(node: Partial<NodeClient>): Promise<boolean> {
    if (!node.Name) {
      throw new Error('Name 字段必填');
    }

    const result = await this.collection.updateOne(
      { Name: node.Name },
      { $set: node },
      { upsert: true }
    );

    return result.acknowledged;
  }

  /**
   * 删除 Node 客户端
   * @param name - 节点名称
   * @returns 是否成功
   */
  async deleteNode(name: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ Name: name });
    return result.deletedCount > 0;
  }

  /**
   * 更新 Node 连接数
   * @param name - 节点名称
   * @param connections - 新的连接数
   * @returns 是否成功
   */
  async updateConnections(
    name: string,
    connections: number
  ): Promise<boolean> {
    const result = await this.collection.updateOne(
      { Name: name },
      { $set: { Connections: connections } }
    );

    return result.modifiedCount > 0;
  }

  /**
   * 增加 Node 连接数
   * @param name - 节点名称
   * @returns 新的连接数
   */
  async incrementConnections(name: string): Promise<number> {
    const result = await this.collection.findOneAndUpdate(
      { Name: name },
      { $inc: { Connections: 1 } },
      { returnDocument: 'after' }
    );

    return result?.Connections || 0;
  }

  /**
   * 减少 Node 连接数
   * @param name - 节点名称
   * @returns 新的连接数
   */
  async decrementConnections(name: string): Promise<number> {
    const result = await this.collection.findOneAndUpdate(
      { Name: name },
      { $inc: { Connections: -1 } },
      { returnDocument: 'after' }
    );

    return result?.Connections || 0;
  }
}

/**
 * 导出 Node 服务单例
 */
export const nodeService = new NodeService();
