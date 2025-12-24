/**
 * Alarm Rule Entity (MongoDB)
 *
 * 告警规则实体 - 扩展现有 ProtocolSetup 模式
 * Collection: alarm.rules
 *
 * Phase 3: 新增规则引擎,基于现有 Threshold 和 AlarmStat 模式
 */

import type { ObjectId } from 'mongodb';
import type { AlarmLevel } from './alarm.entity';

/**
 * 规则类型
 */
export type AlarmRuleType = 'threshold' | 'constant' | 'offline' | 'timeout' | 'custom';

/**
 * 阈值条件 (对齐现有 Uart.Threshold)
 */
export interface ThresholdCondition {
  /** 最小值 */
  min: number;
  /** 最大值 */
  max: number;
}

/**
 * 常量条件 (对齐现有 Uart.ConstantAlarmStat)
 */
export interface ConstantCondition {
  /** 告警状态值列表 (不在此列表中的值将触发告警) */
  alarmStat: string[];
}

/**
 * 范围条件
 */
export interface RangeCondition {
  /** 操作符 */
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  /** 目标值 */
  value: number | string;
}

/**
 * 告警规则文档
 */
export interface AlarmRuleDocument {
  /** MongoDB _id */
  _id?: ObjectId;

  /** 规则名称 */
  name: string;

  /** 规则描述 */
  description?: string;

  /** 规则类型 */
  type: AlarmRuleType;

  /** 告警级别 */
  level: AlarmLevel;

  /** 目标协议 (对齐现有 Protocol) */
  protocol?: string;

  /** 目标设备 PID (可选,为空则对所有设备生效) */
  pid?: string | number;

  /** 参数名称 (对应 Threshold.name 或 AlarmStat.name) */
  paramName?: string;

  /** 阈值条件 (对应 Threshold) */
  threshold?: ThresholdCondition;

  /** 常量条件 (对应 AlarmStat) */
  constant?: ConstantCondition;

  /** 范围条件 */
  range?: RangeCondition;

  /** 自定义脚本条件 (JavaScript 表达式) */
  customScript?: string;

  /** 是否启用 */
  enabled: boolean;

  /** 去重窗口 (秒) - 同一规则在此窗口内只触发一次告警 */
  deduplicationWindow: number;

  /** 最后触发时间 */
  lastTriggeredAt?: Date;

  /** 触发次数 */
  triggerCount?: number;

  /** 创建人用户 ID */
  createdBy: string;

  /** 更新人用户 ID */
  updatedBy?: string;

  /** 创建时间 */
  createdAt: Date;

  /** 更新时间 */
  updatedAt: Date;
}

/**
 * 告警规则集合名称
 */
export const ALARM_RULE_COLLECTION = 'alarm.rules';

/**
 * 告警规则索引定义
 */
export const ALARM_RULE_INDEXES = [
  // 启用状态和类型索引
  { key: { enabled: 1, type: 1 }, name: 'enabled_type_idx' },

  // 协议查询索引 (对齐现有 ProtocolSetup.Protocol)
  { key: { protocol: 1, enabled: 1 }, name: 'protocol_enabled_idx' },

  // 设备查询索引
  { key: { pid: 1, enabled: 1 }, name: 'pid_enabled_idx', sparse: true },

  // 参数查询索引 (对齐现有 Threshold.name / AlarmStat.name)
  { key: { paramName: 1, enabled: 1 }, name: 'param_enabled_idx', sparse: true },

  // 级别查询索引
  { key: { level: 1, enabled: 1 }, name: 'level_enabled_idx' },

  // 用户规则索引
  { key: { createdBy: 1, enabled: 1 }, name: 'user_rules_idx' },

  // 触发时间索引
  { key: { lastTriggeredAt: -1 }, name: 'last_triggered_idx', sparse: true },
];

/**
 * 创建告警规则的辅助函数
 */
export function createAlarmRule(
  rule: Omit<
    AlarmRuleDocument,
    '_id' | 'enabled' | 'triggerCount' | 'deduplicationWindow' | 'createdAt' | 'updatedAt'
  >
): AlarmRuleDocument {
  const now = new Date();
  return {
    ...rule,
    enabled: true,
    deduplicationWindow: 300, // 默认 5 分钟
    triggerCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 创建阈值规则的辅助函数 (对齐现有 Threshold)
 */
export function createThresholdRule(
  name: string,
  protocol: string,
  paramName: string,
  min: number,
  max: number,
  level: AlarmLevel,
  createdBy: string
): AlarmRuleDocument {
  return createAlarmRule({
    name,
    protocol,
    paramName,
    type: 'threshold',
    level,
    threshold: { min, max },
    createdBy,
  });
}

/**
 * 创建常量规则的辅助函数 (对齐现有 AlarmStat)
 */
export function createConstantRule(
  name: string,
  protocol: string,
  paramName: string,
  alarmStat: string[],
  level: AlarmLevel,
  createdBy: string
): AlarmRuleDocument {
  return createAlarmRule({
    name,
    protocol,
    paramName,
    type: 'constant',
    level,
    constant: { alarmStat },
    createdBy,
  });
}

/**
 * 更新规则触发记录的辅助函数
 */
export function updateRuleTrigger() {
  return {
    lastTriggeredAt: new Date(),
    $inc: { triggerCount: 1 },
    updatedAt: new Date(),
  };
}

/**
 * 启用/禁用规则的辅助函数
 */
export function toggleRule(enabled: boolean, userId: string) {
  return {
    enabled,
    updatedBy: userId,
    updatedAt: new Date(),
  };
}
