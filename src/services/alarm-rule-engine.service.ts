/**
 * Alarm Rule Engine Service
 *
 * 负责告警规则的评估和触发：
 * - 阈值告警（温度 > 80℃）
 * - 范围告警（压力 < 0.5 or > 1.5）
 * - 离线告警
 * - 自定义规则（脚本执行）
 * - 告警去重
 */

import type { ParsedData, DataPoint } from './data-parsing.service';

/**
 * 告警级别
 */
export type AlarmLevel = 'info' | 'warning' | 'error' | 'critical';

/**
 * 告警规则类型
 */
export type AlarmRuleType =
  | 'threshold' // 阈值告警
  | 'range' // 范围告警
  | 'offline' // 离线告警
  | 'timeout' // 超时告警
  | 'custom'; // 自定义规则

/**
 * 告警规则定义
 */
export interface AlarmRule {
  /** 规则 ID */
  id: string;
  /** 规则名称 */
  name: string;
  /** 规则类型 */
  type: AlarmRuleType;
  /** 告警级别 */
  level: AlarmLevel;
  /** 设备 PID (可选，不填表示所有设备) */
  pid?: string;
  /** 参数名称 (用于阈值/范围告警) */
  paramName?: string;
  /** 阈值条件 */
  threshold?: {
    /** 操作符 */
    operator: '>' | '>=' | '<' | '<=' | '==' | '!=';
    /** 阈值 */
    value: number | string;
  };
  /** 范围条件 */
  range?: {
    /** 最小值 */
    min: number;
    /** 最大值 */
    max: number;
  };
  /** 自定义脚本 (返回 true 触发告警) */
  customScript?: string;
  /** 是否启用 */
  enabled: boolean;
  /** 去重时间窗口 (秒) */
  deduplicationWindow?: number;
}

/**
 * 告警对象
 */
export interface Alarm {
  /** 告警 ID */
  id: string;
  /** 规则 ID */
  ruleId: string;
  /** 规则名称 */
  ruleName: string;
  /** 告警级别 */
  level: AlarmLevel;
  /** 终端 MAC */
  mac: string;
  /** 设备 PID */
  pid: string;
  /** 参数名称 */
  paramName?: string;
  /** 当前值 */
  currentValue?: number | string;
  /** 触发条件描述 */
  conditionDesc: string;
  /** 告警消息 */
  message: string;
  /** 触发时间 */
  triggeredAt: Date;
  /** 是否已确认 */
  acknowledged: boolean;
  /** 是否已解决 */
  resolved: boolean;
}

/**
 * 告警评估结果
 */
export interface AlarmEvaluationResult {
  /** 是否触发告警 */
  triggered: boolean;
  /** 触发的告警列表 */
  alarms: Alarm[];
}

/**
 * Alarm Rule Engine Service
 */
export class AlarmRuleEngineService {
  /** 告警规则缓存 */
  private rules: Map<string, AlarmRule> = new Map();

  /** 告警去重缓存 (key: mac:pid:ruleId, value: last trigger time) */
  private deduplicationCache: Map<string, number> = new Map();

  constructor() {
    // TODO: 从数据库加载规则
    this.loadRules();
  }

  /**
   * 加载告警规则
   *
   * TODO: 从 PostgreSQL 加载规则定义
   */
  private async loadRules(): Promise<void> {
    console.log('[AlarmRuleEngine] Loading alarm rules...');

    // 临时：添加一些示例规则
    const exampleRules: AlarmRule[] = [
      {
        id: 'rule-1',
        name: '温度过高告警',
        type: 'threshold',
        level: 'warning',
        paramName: 'temperature',
        threshold: { operator: '>', value: 80 },
        enabled: true,
        deduplicationWindow: 300, // 5 分钟
      },
      {
        id: 'rule-2',
        name: '压力范围告警',
        type: 'range',
        level: 'error',
        paramName: 'pressure',
        range: { min: 0.5, max: 1.5 },
        enabled: true,
        deduplicationWindow: 300,
      },
    ];

    for (const rule of exampleRules) {
      this.rules.set(rule.id, rule);
    }

    console.log(`[AlarmRuleEngine] Loaded ${this.rules.size} rules`);
  }

  /**
   * 评估数据并检测告警
   *
   * @param data - 解析后的数据
   * @returns 告警评估结果
   */
  async evaluateData(data: ParsedData): Promise<AlarmEvaluationResult> {
    const alarms: Alarm[] = [];

    console.log(`[AlarmRuleEngine] Evaluating ${this.rules.size} rules for ${data.mac}:${data.pid}`);

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      // 检查规则是否适用于该设备
      if (rule.pid && rule.pid !== data.pid) continue;

      // 评估规则
      const alarm = await this.evaluateRule(rule, data);
      if (alarm) {
        // 检查去重
        if (this.shouldTriggerAlarm(alarm)) {
          alarms.push(alarm);
          this.recordAlarmTrigger(alarm);
        } else {
          console.log(`[AlarmRuleEngine] Alarm deduplicated: ${rule.name}`);
        }
      }
    }

    console.log(`[AlarmRuleEngine] Triggered ${alarms.length} alarms`);

    return {
      triggered: alarms.length > 0,
      alarms,
    };
  }

  /**
   * 评估单条规则
   */
  private async evaluateRule(rule: AlarmRule, data: ParsedData): Promise<Alarm | null> {
    switch (rule.type) {
      case 'threshold':
        return this.evaluateThresholdRule(rule, data);
      case 'range':
        return this.evaluateRangeRule(rule, data);
      case 'custom':
        return this.evaluateCustomRule(rule, data);
      default:
        console.warn(`[AlarmRuleEngine] Unsupported rule type: ${rule.type}`);
        return null;
    }
  }

  /**
   * 评估阈值规则
   */
  private evaluateThresholdRule(rule: AlarmRule, data: ParsedData): Alarm | null {
    if (!rule.paramName || !rule.threshold) return null;

    const dataPoint = data.dataPoints.find((p) => p.name === rule.paramName);
    if (!dataPoint || !dataPoint.isValid) return null;

    const value = dataPoint.value;
    const { operator, value: thresholdValue } = rule.threshold;

    let triggered = false;
    switch (operator) {
      case '>':
        triggered = Number(value) > Number(thresholdValue);
        break;
      case '>=':
        triggered = Number(value) >= Number(thresholdValue);
        break;
      case '<':
        triggered = Number(value) < Number(thresholdValue);
        break;
      case '<=':
        triggered = Number(value) <= Number(thresholdValue);
        break;
      case '==':
        triggered = value === thresholdValue;
        break;
      case '!=':
        triggered = value !== thresholdValue;
        break;
    }

    if (!triggered) return null;

    return {
      id: `alarm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ruleId: rule.id,
      ruleName: rule.name,
      level: rule.level,
      mac: data.mac,
      pid: data.pid,
      paramName: rule.paramName,
      currentValue: value,
      conditionDesc: `${rule.paramName} ${operator} ${thresholdValue}`,
      message: `${rule.name}: ${rule.paramName} = ${value} (阈值: ${operator} ${thresholdValue})`,
      triggeredAt: new Date(),
      acknowledged: false,
      resolved: false,
    };
  }

  /**
   * 评估范围规则
   */
  private evaluateRangeRule(rule: AlarmRule, data: ParsedData): Alarm | null {
    if (!rule.paramName || !rule.range) return null;

    const dataPoint = data.dataPoints.find((p) => p.name === rule.paramName);
    if (!dataPoint || !dataPoint.isValid) return null;

    const value = Number(dataPoint.value);
    const { min, max } = rule.range;

    const outOfRange = value < min || value > max;
    if (!outOfRange) return null;

    return {
      id: `alarm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ruleId: rule.id,
      ruleName: rule.name,
      level: rule.level,
      mac: data.mac,
      pid: data.pid,
      paramName: rule.paramName,
      currentValue: value,
      conditionDesc: `${rule.paramName} not in [${min}, ${max}]`,
      message: `${rule.name}: ${rule.paramName} = ${value} (范围: ${min} - ${max})`,
      triggeredAt: new Date(),
      acknowledged: false,
      resolved: false,
    };
  }

  /**
   * 评估自定义规则
   *
   * TODO: 实现安全的脚本执行环境
   */
  private evaluateCustomRule(rule: AlarmRule, data: ParsedData): Alarm | null {
    console.warn('[AlarmRuleEngine] Custom rule evaluation not implemented yet');
    return null;
  }

  /**
   * 检查是否应该触发告警（去重检查）
   */
  private shouldTriggerAlarm(alarm: Alarm): boolean {
    const rule = this.rules.get(alarm.ruleId);
    if (!rule || !rule.deduplicationWindow) return true;

    const key = `${alarm.mac}:${alarm.pid}:${alarm.ruleId}`;
    const lastTrigger = this.deduplicationCache.get(key);

    if (!lastTrigger) return true;

    const now = Date.now();
    const windowMs = rule.deduplicationWindow * 1000;

    return now - lastTrigger > windowMs;
  }

  /**
   * 记录告警触发时间
   */
  private recordAlarmTrigger(alarm: Alarm): void {
    const key = `${alarm.mac}:${alarm.pid}:${alarm.ruleId}`;
    this.deduplicationCache.set(key, Date.now());
  }

  /**
   * 添加规则
   */
  async addRule(rule: AlarmRule): Promise<void> {
    this.rules.set(rule.id, rule);
    console.log(`[AlarmRuleEngine] Added rule: ${rule.name}`);

    // TODO: 持久化到数据库
  }

  /**
   * 更新规则
   */
  async updateRule(ruleId: string, updates: Partial<AlarmRule>): Promise<void> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    const updatedRule = { ...rule, ...updates };
    this.rules.set(ruleId, updatedRule);

    console.log(`[AlarmRuleEngine] Updated rule: ${ruleId}`);

    // TODO: 持久化到数据库
  }

  /**
   * 删除规则
   */
  async deleteRule(ruleId: string): Promise<void> {
    this.rules.delete(ruleId);
    console.log(`[AlarmRuleEngine] Deleted rule: ${ruleId}`);

    // TODO: 从数据库删除
  }

  /**
   * 获取所有规则
   */
  async getRules(): Promise<AlarmRule[]> {
    return Array.from(this.rules.values());
  }
}
