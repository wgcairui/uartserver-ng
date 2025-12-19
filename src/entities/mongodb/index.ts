/**
 * MongoDB Entities Index
 *
 * 统一导出所有 MongoDB 实体定义
 */

// Alarm Rule
export * from './alarm-rule.entity';

// Alarm
export * from './alarm.entity';

// Notification Log
export * from './notification-log.entity';

// User Alarm Setup (对齐现有 UserAlarmSetup)
export * from './user-alarm-setup.entity';

/**
 * 所有集合的索引配置
 */
import {
  ALARM_RULE_COLLECTION,
  ALARM_RULE_INDEXES,
  type AlarmRuleDocument,
} from './alarm-rule.entity';
import { ALARM_COLLECTION, ALARM_INDEXES, type AlarmDocument } from './alarm.entity';
import {
  NOTIFICATION_LOG_COLLECTION,
  NOTIFICATION_LOG_INDEXES,
  type NotificationLogDocument,
} from './notification-log.entity';
import {
  USER_ALARM_SETUP_COLLECTION,
  USER_ALARM_SETUP_INDEXES,
  type UserAlarmSetupDocument,
} from './user-alarm-setup.entity';

import type { Db, IndexDescription } from 'mongodb';

/**
 * 集合配置
 */
export interface CollectionConfig {
  name: string;
  indexes: IndexDescription[];
}

/**
 * Phase 3 集合配置列表
 */
export const PHASE3_COLLECTIONS: CollectionConfig[] = [
  {
    name: ALARM_RULE_COLLECTION,
    indexes: ALARM_RULE_INDEXES as unknown as IndexDescription[],
  },
  {
    name: ALARM_COLLECTION,
    indexes: ALARM_INDEXES as unknown as IndexDescription[],
  },
  {
    name: NOTIFICATION_LOG_COLLECTION,
    indexes: NOTIFICATION_LOG_INDEXES as unknown as IndexDescription[],
  },
  {
    name: USER_ALARM_SETUP_COLLECTION,
    indexes: USER_ALARM_SETUP_INDEXES as unknown as IndexDescription[],
  },
];

/**
 * 初始化 Phase 3 集合和索引
 *
 * @param db - MongoDB 数据库实例
 */
export async function initializePhase3Collections(db: Db): Promise<void> {
  console.log('[Phase3] Initializing collections and indexes...');

  for (const config of PHASE3_COLLECTIONS) {
    const collection = db.collection(config.name);

    // 确保集合存在
    try {
      await db.createCollection(config.name);
      console.log(`[Phase3] Created collection: ${config.name}`);
    } catch (error: any) {
      // 集合已存在，忽略错误
      if (error.code !== 48) {
        console.warn(`[Phase3] Collection ${config.name} already exists`);
      }
    }

    // 创建索引
    for (const index of config.indexes) {
      try {
        await collection.createIndex(index.key, {
          name: index.name,
          unique: index.unique,
          sparse: index.sparse,
          expireAfterSeconds: index.expireAfterSeconds,
          partialFilterExpression: index.partialFilterExpression,
        });
        console.log(`[Phase3] Created index: ${config.name}.${index.name}`);
      } catch (error: any) {
        // 索引已存在，忽略错误
        if (error.code === 85 || error.code === 86) {
          console.warn(`[Phase3] Index ${config.name}.${index.name} already exists`);
        } else {
          console.error(`[Phase3] Failed to create index ${config.name}.${index.name}:`, error);
        }
      }
    }
  }

  console.log('[Phase3] Collections and indexes initialized successfully');
}

/**
 * 类型安全的集合访问器
 */
export class Phase3Collections {
  constructor(private db: Db) {}

  get alarmRules() {
    return this.db.collection<AlarmRuleDocument>(ALARM_RULE_COLLECTION);
  }

  get alarms() {
    return this.db.collection<AlarmDocument>(ALARM_COLLECTION);
  }

  get notificationLogs() {
    return this.db.collection<NotificationLogDocument>(NOTIFICATION_LOG_COLLECTION);
  }

  get userAlarmSetups() {
    return this.db.collection<UserAlarmSetupDocument>(USER_ALARM_SETUP_COLLECTION);
  }
}
