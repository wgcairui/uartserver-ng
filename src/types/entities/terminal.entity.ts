/**
 * Terminal 实体定义
 * 完全兼容老系统 (midwayuartserver/src/mongo_entity/node.ts)
 */

/**
 * 挂载设备信息
 */
export interface MountDevice {
  /** 设备类型 */
  Type: string;
  /** 挂载设备 ID */
  mountDev: string;
  /** 协议名称 */
  protocol: string;
  /** 协议 PID */
  pid: number;
  /** 在线状态 */
  online?: boolean;
  /** 绑定设备 ID */
  bindDev?: string;
  /** 最后发送时间 */
  lastEmit?: Date;
  /** 最后记录时间 */
  lastRecord?: Date;
  /** 最小查询时间间隔（毫秒） */
  minQueryLimit: number;
}

/**
 * ICCID 信息（物联网卡流量信息）
 */
export interface IccidInfo {
  /** 状态 */
  statu: boolean;
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
  /** 物联卡版本 */
  version: string;
  /** 是否自动充值 */
  IsAutoRecharge: boolean;
  /** 更新时间 */
  uptime: number;
}

/**
 * 终端设备（存储在 terminals 集合）
 */
export interface Terminal {
  /** MongoDB _id */
  _id?: any;

  // ===== 基础信息 =====
  /** 设备 MAC 地址（大写） */
  DevMac: string;
  /** 设备名称 */
  name: string;
  /** 设备 IP 地址 */
  ip: string;
  /** 设备端口 */
  port: number;
  /** 经纬度（字符串格式："lon,lat"） */
  jw: string;
  /** UART 串口信息 */
  uart: string;

  // ===== AT 和 DTU 信息 =====
  /** 是否支持 AT 指令 */
  AT: boolean;
  /** SIM 卡 ICCID */
  ICCID: string;
  /** 连接状态 */
  connecting: boolean;
  /** 锁定状态 */
  lock: boolean;
  /** 协议 ID */
  PID: string;
  /** 版本号 */
  ver: string;
  /** G 版本号 */
  Gver: string;
  /** IoT 状态 */
  iotStat: string;
  /** 信号强度 */
  signal: number;

  // ===== 状态信息 =====
  /** 在线状态 */
  online: boolean;
  /** 禁用状态 */
  disable: boolean;
  /** 上线时间 */
  uptime: Date;

  // ===== 挂载信息 =====
  /** 挂载节点名称 */
  mountNode: string;
  /** 挂载的设备列表 */
  mountDevs: MountDevice[];

  // ===== ICCID 信息 =====
  /** 物联网卡信息 */
  iccidInfo: IccidInfo;

  // ===== 权限和共享 =====
  /** 是否可以共享 */
  share: boolean;
  /** 备注 */
  remark: string;
  /** 设备所有者 ID */
  ownerId: string;

  /** 最后更新时间（可选） */
  updatedAt?: Date;
}

/**
 * 注册终端（存储在 terminal.registers 集合）
 */
export interface RegisterTerminal {
  /** MongoDB _id */
  _id?: any;
  /** 设备 MAC 地址（大写） */
  DevMac: string;
  /** 绑定设备 ID */
  bindDev?: string;
  /** 挂载节点名称 */
  mountNode: string;
  /** 注册时间戳 */
  timeStamp?: number;
}

/**
 * 注册设备（存储在 dev.register 集合）
 */
export interface RegisterDevice extends MountDevice {
  /** MongoDB _id */
  _id?: any;
  /** 设备唯一 ID */
  id: string;
  /** 注册时间戳 */
  timeStamp?: number;
}

/**
 * WebSocket 终端信息（用于节点运行状态）
 */
export interface WebSocketTerminal {
  /** 设备 MAC 地址 */
  mac: string;
  /** 端口 */
  port: number;
  /** IP 地址 */
  ip: string;
  /** 经纬度 */
  jw: string;
  /** UART 信息 */
  uart: string;
  /** 是否支持 AT */
  AT: boolean;
  /** ICCID */
  ICCID: string;
  /** 连接状态 */
  connecting: boolean;
  /** 锁定状态 */
  lock: boolean;
  /** 协议 ID */
  PID: string;
  /** 版本号 */
  ver: string;
  /** G 版本号 */
  Gver: string;
  /** IoT 状态 */
  iotStat: string;
  /** 信号强度 */
  signal: number;
}

/**
 * 终端部分更新类型（用于 update 操作）
 */
export type TerminalUpdate = Partial<Omit<Terminal, '_id' | 'DevMac'>>;

/**
 * 终端查询过滤器
 */
export interface TerminalFilter {
  DevMac?: string;
  mountNode?: string;
  online?: boolean;
  disable?: boolean;
  ownerId?: string;
}
