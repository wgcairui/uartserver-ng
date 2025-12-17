/**
 * Node 实体定义
 * 完全兼容老系统 (midwayuartserver/src/mongo_entity/node.ts)
 */

import { WebSocketTerminal } from './terminal.entity';

/**
 * 节点客户端（存储在 node.clients 集合）
 */
export interface NodeClient {
  /** MongoDB _id */
  _id?: any;
  /** 节点名称 */
  Name: string;
  /** 节点 IP 地址 */
  IP: string;
  /** 节点端口 */
  Port: number;
  /** 最大连接数 */
  MaxConnections: number;
  /** 当前连接数（可选，用于更新） */
  Connections?: number;
}

/**
 * 节点运行信息（存储在 node.runinfos 集合）
 */
export interface NodeRunInfo {
  /** MongoDB _id */
  _id?: any;
  /** 更新时间 */
  updateTime: Date;
  /** 主机名 */
  hostname: string;
  /** 总内存 */
  totalmem: string;
  /** 空闲内存 */
  freemem: string;
  /** 负载平均值 */
  loadavg: number[];
  /** 系统类型 */
  type: string;
  /** 运行时间 */
  uptime: string;
  /** 节点名称 */
  NodeName: string;
  /** 连接数 */
  Connections: number;
  /** Socket 映射表 */
  SocketMaps: WebSocketTerminal[];
}

/**
 * Node 客户端部分更新类型
 */
export type NodeClientUpdate = Partial<Omit<NodeClient, '_id' | 'Name'>>;

/**
 * Node 客户端查询过滤器
 */
export interface NodeClientFilter {
  Name?: string;
  IP?: string;
}
