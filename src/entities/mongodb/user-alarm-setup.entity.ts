/**
 * User Alarm Setup Entity (MongoDB)
 *
 * 用户告警设置实体 - 对齐 midwayuartserver 数据模型
 * Collection: user.alarmsetups (与现有项目保持一致)
 */

import type { ObjectId } from 'mongodb';

/**
 * 阈值告警设置 (对齐现有 Uart.Threshold)
 */
export interface Threshold {
  /** 参数名称 */
  name: string;
  /** 最小值 */
  min: number;
  /** 最大值 */
  max: number;
}

/**
 * 常量告警状态设置 (对齐现有 Uart.ConstantAlarmStat)
 */
export interface ConstantAlarmStat {
  /** 参数名称 */
  name: string;
  /** 告警状态值列表 (不在此列表中的值将触发告警) */
  alarmStat: string[];
}

/**
 * 协议常量设置 (对齐现有 DevConstant 结构)
 */
export interface DevConstant {
  /** 协议名称 */
  Protocol: string;
  /** 显示标签 */
  ShowTag?: string[];
  /** 阈值告警配置 */
  Threshold?: Threshold[];
  /** 常量告警配置 */
  AlarmStat?: ConstantAlarmStat[];
}

/**
 * 用户告警设置文档 (对齐现有 UserAlarmSetup)
 */
export interface UserAlarmSetupDocument {
  /** MongoDB _id */
  _id?: ObjectId;

  /** 用户名 (对齐现有 user 字段) */
  user: string;

  /** 告警电话列表 */
  tels: string[];

  /** 告警邮箱列表 */
  mails: string[];

  /** 告警微信列表 (OpenID) */
  wxs: string[];

  /** 协议设置 */
  ProtocolSetup: DevConstant[];

  /** 创建时间 */
  createdAt?: Date;

  /** 更新时间 */
  updatedAt?: Date;
}

/**
 * 用户告警设置集合名称 (对齐现有集合名)
 */
export const USER_ALARM_SETUP_COLLECTION = 'user.alarmsetups';

/**
 * 用户告警设置索引定义
 */
export const USER_ALARM_SETUP_INDEXES = [
  // 用户查询索引 (唯一)
  { key: { user: 1 }, name: 'user_idx', unique: true },

  // 协议查询索引
  { key: { 'ProtocolSetup.Protocol': 1 }, name: 'protocol_idx' },
];

/**
 * 创建用户告警设置的辅助函数
 */
export function createUserAlarmSetup(user: string): UserAlarmSetupDocument {
  const now = new Date();
  return {
    user,
    tels: [],
    mails: [],
    wxs: [],
    ProtocolSetup: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 添加协议设置的辅助函数
 */
export function addProtocolSetup(protocol: string): DevConstant {
  return {
    Protocol: protocol,
    ShowTag: [],
    Threshold: [],
    AlarmStat: [],
  };
}

/**
 * 添加阈值设置的辅助函数
 */
export function addThreshold(name: string, min: number, max: number): Threshold {
  return { name, min, max };
}

/**
 * 添加常量告警设置的辅助函数
 */
export function addConstantAlarmStat(name: string, alarmStat: string[]): ConstantAlarmStat {
  return { name, alarmStat };
}
