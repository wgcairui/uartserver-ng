/**
 * Alarm Rule Engine Service
 *
 * 负责告警规则的评估和触发：
 * - 阈值告警（temperature > 80℃） - 对齐现有 Threshold
 * - 常量告警（status not in normalValues） - 对齐现有 AlarmStat
 * - 离线告警
 * - 自定义规则（脚本执行）
 * - 告警去重
 *
 * 使用 MongoDB 实体持久化数据
 */

import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { ParsedData } from './data-parsing.service';
import {
  Phase3Collections,
  type AlarmRuleDocument,
  type AlarmDocument,
  createAlarm,
  updateRuleTrigger,
} from '../entities/mongodb';

/**
 * 告警评估结果
 */
export interface AlarmEvaluationResult {
  /** 是否触发告警 */
  triggered: boolean;
  /** 触发的告警列表 */
  alarms: AlarmDocument[];
}

/**
 * Alarm Rule Engine Service
 */
export class AlarmRuleEngineService {
  /** MongoDB 集合访问器 */
  private collections: Phase3Collections;

  /** 告警规则缓存 */
  private rulesCache: Map<string, AlarmRuleDocument> = new Map();

  /** 告警去重缓存 (key: mac:pid:ruleId, value: last trigger time) */
  private deduplicationCache: Map<string, number> = new Map();

  constructor(db: Db) {
    this.collections = new Phase3Collections(db);

    // 加载规则
    this.loadRules().catch(error => {
      console.error('[AlarmRuleEngine] Failed to load rules:', error);
    });
  }

  /**
   * 从 MongoDB 加载告警规则
   */
  private async loadRules(): Promise<void> {
    console.log('[AlarmRuleEngine] Loading alarm rules from MongoDB...');

    try {
      const rules = await this.collections.alarmRules
        .find({ enabled: true })
        .toArray();

      this.rulesCache.clear();
      for (const rule of rules) {
        if (rule._id) {
          this.rulesCache.set(rule._id.toString(), rule);
        }
      }

      console.log(`[AlarmRuleEngine] Loaded ${this.rulesCache.size} enabled rules`);
    } catch (error) {
      console.error('[AlarmRuleEngine] Error loading rules:', error);
      throw error;
    }
  }

  /**
   * 评估数据并检测告警
   *
   * @param data - 解析后的数据
   * @returns 告警评估结果
   */
  async evaluateData(data: ParsedData): Promise<AlarmEvaluationResult> {
    const alarms: AlarmDocument[] = [];

    console.log(`[AlarmRuleEngine] Evaluating ${this.rulesCache.size} rules for ${data.mac}:${data.pid}`);

    for (const rule of this.rulesCache.values()) {
      if (!rule.enabled) continue;

      // 检查规则是否适用于该协议
      if (rule.protocol && rule.protocol !== data.protocol) continue;

      // 检查规则是否适用于该设备
      if (rule.pid && rule.pid !== data.pid) continue;

      // 评估规则
      const alarm = await this.evaluateRule(rule, data);
      if (alarm) {
        // 检查去重
        if (this.shouldTriggerAlarm(alarm, rule)) {
          alarms.push(alarm);
          this.recordAlarmTrigger(alarm, rule);

          // 持久化告警到 MongoDB
          await this.persistAlarm(alarm);

          // 更新规则触发统计
          await this.updateRuleTriggerStats(rule._id!);
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
  private async evaluateRule(rule: AlarmRuleDocument, data: ParsedData): Promise<AlarmDocument | null> {
    switch (rule.type) {
      case 'threshold':
        return this.evaluateThresholdRule(rule, data);
      case 'constant':
        return this.evaluateConstantRule(rule, data);
      case 'custom':
        return this.evaluateCustomRule(rule, data);
      default:
        console.warn(`[AlarmRuleEngine] Unsupported rule type: ${rule.type}`);
        return null;
    }
  }

  /**
   * 评估阈值规则 (对齐现有 Threshold)
   */
  private evaluateThresholdRule(rule: AlarmRuleDocument, data: ParsedData): AlarmDocument | null {
    if (!rule.paramName || !rule.threshold) return null;

    const dataPoint = data.dataPoints.find((p) => p.name === rule.paramName);
    if (!dataPoint || !dataPoint.isValid) return null;

    const value = dataPoint.value;
    const { min, max } = rule.threshold;

    // 阈值检查: 值应该在 [min, max] 范围内
    const numValue = Number(value);
    const outOfRange = numValue < min || numValue > max;

    if (!outOfRange) return null;

    return createAlarm({
      parentId: rule._id?.toString(),
      type: 'threshold',
      level: rule.level,
      tag: 'Threshold',
      mac: data.mac,
      pid: data.pid,
      protocol: data.protocol,
      paramName: rule.paramName,
      currentValue: value,
      msg: `${rule.name}: ${rule.paramName} = ${value} (阈值: ${min} - ${max})`,
      timeStamp: Date.now(),
      triggeredAt: new Date(),
    });
  }

  /**
   * 评估常量规则 (对齐现有 AlarmStat)
   */
  private evaluateConstantRule(rule: AlarmRuleDocument, data: ParsedData): AlarmDocument | null {
    if (!rule.paramName || !rule.constant) return null;

    const dataPoint = data.dataPoints.find((p) => p.name === rule.paramName);
    if (!dataPoint || !dataPoint.isValid) return null;

    const value = String(dataPoint.value);
    const { alarmStat } = rule.constant;

    // 常量检查: 值应该在 alarmStat 列表中 (正常值列表)
    const isNormal = alarmStat.includes(value);

    if (isNormal) return null;

    return createAlarm({
      parentId: rule._id?.toString(),
      type: 'constant',
      level: rule.level,
      tag: 'AlarmStat',
      mac: data.mac,
      pid: data.pid,
      protocol: data.protocol,
      paramName: rule.paramName,
      currentValue: value,
      msg: `${rule.name}: ${rule.paramName} = ${value} (正常值: ${alarmStat.join(', ')})`,
      timeStamp: Date.now(),
      triggeredAt: new Date(),
    });
  }

  /**
   * 评估自定义规则
   *
   * TODO: 实现安全的脚本执行环境
   */
  private evaluateCustomRule(_rule: AlarmRuleDocument, _data: ParsedData): AlarmDocument | null {
    console.warn('[AlarmRuleEngine] Custom rule evaluation not implemented yet');
    return null;
  }

  /**
   * 检查是否应该触发告警（去重检查）
   */
  private shouldTriggerAlarm(alarm: AlarmDocument, rule: AlarmRuleDocument): boolean {
    if (!rule.deduplicationWindow) return true;

    const key = `${alarm.mac}:${alarm.pid}:${rule._id?.toString()}`;
    const lastTrigger = this.deduplicationCache.get(key);

    if (!lastTrigger) return true;

    const now = Date.now();
    const windowMs = rule.deduplicationWindow * 1000;

    return now - lastTrigger > windowMs;
  }

  /**
   * 记录告警触发时间
   */
  private recordAlarmTrigger(alarm: AlarmDocument, rule: AlarmRuleDocument): void {
    const key = `${alarm.mac}:${alarm.pid}:${rule._id?.toString()}`;
    this.deduplicationCache.set(key, Date.now());
  }

  /**
   * 持久化告警到 MongoDB
   */
  private async persistAlarm(alarm: AlarmDocument): Promise<ObjectId> {
    const result = await this.collections.alarms.insertOne(alarm);
    console.log(`[AlarmRuleEngine] Alarm persisted: ${result.insertedId}`);
    return result.insertedId;
  }

  /**
   * 更新规则触发统计
   */
  private async updateRuleTriggerStats(ruleId: ObjectId): Promise<void> {
    await this.collections.alarmRules.updateOne(
      { _id: ruleId },
      { $set: updateRuleTrigger() }
    );
  }

  /**
   * 添加规则
   */
  async addRule(rule: AlarmRuleDocument): Promise<ObjectId> {
    const result = await this.collections.alarmRules.insertOne(rule);

    // 更新缓存
    if (rule.enabled) {
      this.rulesCache.set(result.insertedId.toString(), {
        ...rule,
        _id: result.insertedId,
      });
    }

    console.log(`[AlarmRuleEngine] Added rule: ${rule.name} (${result.insertedId})`);
    return result.insertedId;
  }

  /**
   * 更新规则
   */
  async updateRule(ruleId: string | ObjectId, updates: Partial<AlarmRuleDocument>): Promise<void> {
    const _id = typeof ruleId === 'string' ? new ObjectId(ruleId) : ruleId;

    await this.collections.alarmRules.updateOne(
      { _id },
      { $set: { ...updates, updatedAt: new Date() } }
    );

    // 更新缓存
    const cachedRule = this.rulesCache.get(_id.toString());
    if (cachedRule) {
      this.rulesCache.set(_id.toString(), { ...cachedRule, ...updates });
    }

    console.log(`[AlarmRuleEngine] Updated rule: ${_id}`);
  }

  /**
   * 删除规则
   */
  async deleteRule(ruleId: string | ObjectId): Promise<void> {
    const _id = typeof ruleId === 'string' ? new ObjectId(ruleId) : ruleId;

    await this.collections.alarmRules.deleteOne({ _id });
    this.rulesCache.delete(_id.toString());

    console.log(`[AlarmRuleEngine] Deleted rule: ${_id}`);
  }

  /**
   * 获取所有规则
   */
  async getRules(filter?: Partial<AlarmRuleDocument>): Promise<AlarmRuleDocument[]> {
    return await this.collections.alarmRules.find(filter || {}).toArray();
  }

  /**
   * 刷新规则缓存
   */
  async refreshRulesCache(): Promise<void> {
    await this.loadRules();
  }
}

/**
 * Re-export types from MongoDB entities for convenience
 */
export type { AlarmRuleDocument as AlarmRule, AlarmDocument as Alarm } from '../entities/mongodb';
export type { AlarmRuleType } from '../entities/mongodb/alarm-rule.entity';
export type { AlarmLevel } from '../entities/mongodb/alarm.entity';
