/**
 * Terminal Entity
 *
 * 终端设备实体定义（DTU 设备）
 */

import type { ObjectId } from 'mongodb';

/**
 * 物联卡信息
 */
export interface TerminalIccidInfo {
  /** 状态 */
  status: boolean;
  /** 资源失效日期 */
  expireDate: string;
  /** 资源名称 */
  resName: string;
  /** 资源使用量，流量单位为 KB */
  flowUsed: number;
  /** 资源剩余量，流量单位为 KB */
  restOfFlow: number;
  /** 资源总量，流量单位为 KB */
  flowResource: number;
  /** 物联卡版本 (ali_1, ali_2 等) */
  version: string;
  /** 是否自动续费 */
  IsAutoRecharge: boolean;
  /** 更新时间戳 */
  uptime: number;
}

/**
 * 挂载设备信息
 */
export interface MountDevice {
  /** 设备 PID */
  pid: number;
  /** 协议 ID */
  protocol: string;
  /** 设备类型 */
  Type?: string;
  /** 挂载设备地址 */
  mountDev: string;
  /** 设备名称 */
  name?: string;
  /** 在线状态 */
  online?: boolean;
  /** 绑定设备标识 */
  bindDev?: string;
  /** 数据 ID */
  dataId?: string;
  /** 表单大小调整 */
  formResize?: number;
  /** 是否为状态设备 */
  isState?: boolean;
}

/**
 * 终端文档
 */
export interface TerminalDocument {
  _id: ObjectId;

  /** 设备 MAC 地址（唯一标识） */
  DevMac: string;

  /** 设备别名 */
  name: string;

  /** 设备 IP 地址 */
  ip?: string;

  /** 设备端口 */
  port?: number;

  /** GPS 坐标（经纬度字符串） */
  jw?: string;

  /** 串口配置 */
  uart?: string;

  /** 是否启用 AT 指令 */
  AT?: boolean;

  /** 物联卡 ICCID */
  ICCID?: string;

  /** 是否正在连接 */
  connecting?: boolean;

  /** 是否锁定 */
  lock?: boolean;

  /** 产品 ID */
  PID?: string;

  /** 版本号 */
  ver?: string;

  /** 固件版本 */
  Gver?: string;

  /** 物联卡状态 */
  iotStat?: string;

  /** 在线状态 */
  online: boolean;

  /** 是否禁用 */
  disable?: boolean;

  /** 最后上线时间 */
  uptime?: Date;

  /** 最后心跳时间 */
  lastSeen?: Date;

  /** 关联的 Node 客户端 ID */
  nodeId?: string;

  /** 挂载设备列表 */
  mountDevs?: MountDevice[];

  /** 物联卡详细信息 */
  iccidInfo?: TerminalIccidInfo;

  /** 信号强度 */
  signal?: number;

  /** 是否为共享设备 */
  share?: boolean;

  /** 备注信息 */
  remark?: string;

  /** 设备所有者用户 ID */
  ownerId?: string;

  /** 绑定用户列表 */
  bindUsers?: string[];

  /** 创建时间 */
  createdAt: Date;

  /** 更新时间 */
  updatedAt: Date;
}

/**
 * 集合名称
 */
export const TERMINAL_COLLECTION = 'terminals';

/**
 * 索引配置
 */
export const TERMINAL_INDEXES = [
  {
    name: 'terminals.DevMac_idx',
    key: { DevMac: 1 },
    unique: true,
  },
  {
    name: 'terminals.online_idx',
    key: { online: 1 },
  },
  {
    name: 'terminals.ownerId_idx',
    key: { ownerId: 1 },
  },
  {
    name: 'terminals.bindUsers_idx',
    key: { bindUsers: 1 },
  },
  {
    name: 'terminals.ICCID_idx',
    key: { ICCID: 1 },
    sparse: true,
  },
  {
    name: 'terminals.nodeId_idx',
    key: { nodeId: 1 },
    sparse: true,
  },
  {
    name: 'terminals.createdAt_idx',
    key: { createdAt: -1 },
  },
] as const;

/**
 * 创建新终端文档的辅助函数
 *
 * @param DevMac - 设备 MAC 地址
 * @param name - 设备名称
 * @param options - 可选参数
 * @returns 终端文档
 */
export function createTerminalDocument(
  DevMac: string,
  name: string,
  options?: Partial<TerminalDocument>
): Omit<TerminalDocument, '_id'> {
  const now = new Date();

  return {
    DevMac,
    name,
    online: false,
    disable: false,
    share: false,
    AT: false,
    connecting: false,
    lock: false,
    signal: 0,
    createdAt: now,
    updatedAt: now,
    ...options,
  };
}

/**
 * 验证 MAC 地址格式
 *
 * @param mac - MAC 地址字符串
 * @returns 是否有效
 */
export function isValidMacAddress(mac: string): boolean {
  // 12 位十六进制字符
  return /^[0-9A-Fa-f]{12}$/.test(mac);
}

/**
 * 格式化 MAC 地址（添加冒号分隔）
 *
 * @param mac - 原始 MAC 地址
 * @returns 格式化后的 MAC 地址
 */
export function formatMacAddress(mac: string): string {
  if (mac.length !== 12) {
    return mac;
  }
  return mac.match(/.{2}/g)?.join(':').toUpperCase() || mac;
}

/**
 * 规范化 MAC 地址（移除分隔符，转为大写）
 *
 * @param mac - MAC 地址字符串
 * @returns 规范化后的 MAC 地址
 */
export function normalizeMacAddress(mac: string): string {
  return mac.replace(/[:-]/g, '').toUpperCase();
}
