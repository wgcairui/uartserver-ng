# Service Layer Integration - Phase 3

**更新时间**: 2025-12-19
**状态**: 完成 AlarmRuleEngineService 和 AlarmNotificationService MongoDB 集成

---

## 📋 集成概述

Phase 3 服务层已成功集成 MongoDB 实体，实现了从占位符实现到完整数据库持久化的迁移。

### 已完成的服务

| 服务 | 状态 | 数据库集合 | 主要功能 |
|------|------|-----------|---------|
| **AlarmRuleEngineService** | ✅ 完成 | `alarm.rules`, `alarms` | 规则评估、告警持久化 |
| **AlarmNotificationService** | ✅ 完成 | `user.alarmsetups`, `notification.logs` | 用户查询、通知日志 |

---

## 🔧 AlarmRuleEngineService 集成详情

### 主要改动

#### 1. 构造函数更新

**之前** (占位符):
```typescript
constructor() {
  // 规则存储在内存中
  this.rulesCache = new Map();
}
```

**现在** (MongoDB 集成):
```typescript
import type { Db } from 'mongodb';
import { Phase3Collections } from '../entities/mongodb';

constructor(db: Db) {
  this.collections = new Phase3Collections(db);
  this.rulesCache = new Map();

  // 从 MongoDB 加载规则
  this.loadRules().catch(error => {
    console.error('[AlarmRuleEngine] Failed to load rules:', error);
  });
}
```

#### 2. 规则加载从 MongoDB

```typescript
private async loadRules(): Promise<void> {
  const rules = await this.collections.alarmRules
    .find({ enabled: true })
    .toArray();

  this.rulesCache.clear();
  for (const rule of rules) {
    if (rule._id) {
      this.rulesCache.set(rule._id.toString(), rule);
    }
  }
}
```

#### 3. 告警持久化

评估规则后，告警自动保存到 `alarms` 集合：

```typescript
if (alarm) {
  if (this.shouldTriggerAlarm(alarm, rule)) {
    alarms.push(alarm);
    this.recordAlarmTrigger(alarm, rule);

    // 持久化告警到 MongoDB
    await this.persistAlarm(alarm);

    // 更新规则触发统计
    await this.updateRuleTriggerStats(rule._id!);
  }
}
```

#### 4. CRUD 操作完整实现

```typescript
// 添加规则
async addRule(rule: AlarmRuleDocument): Promise<ObjectId> {
  const result = await this.collections.alarmRules.insertOne(rule);
  if (rule.enabled) {
    this.rulesCache.set(result.insertedId.toString(), {
      ...rule,
      _id: result.insertedId,
    });
  }
  return result.insertedId;
}

// 更新规则
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
}

// 删除规则
async deleteRule(ruleId: string | ObjectId): Promise<void> {
  const _id = typeof ruleId === 'string' ? new ObjectId(ruleId) : ruleId;
  await this.collections.alarmRules.deleteOne({ _id });
  this.rulesCache.delete(_id.toString());
}
```

---

## 🔧 AlarmNotificationService 集成详情

### 主要改动

#### 1. 构造函数更新

**之前** (占位符):
```typescript
constructor(queueService?: QueueService) {
  this.queueService = queueService;
}
```

**现在** (MongoDB 集成):
```typescript
import type { Db } from 'mongodb';
import { Phase3Collections } from '../entities/mongodb';

constructor(db: Db, queueService?: QueueService) {
  this.collections = new Phase3Collections(db);
  this.queueService = queueService;
}
```

#### 2. 用户订阅查询 (对齐现有模型)

**之前** (占位符):
```typescript
private async getAlarmSubscribers(
  _mac: string,
  _pid: number | string
): Promise<UserNotificationPreference[]> {
  // 临时返回示例用户
  return [{ userId: 'user-1', channels: ['wechat'], ... }];
}
```

**现在** (从 MongoDB 查询):
```typescript
private async getAlarmSubscribers(
  mac: string,
  pid: number | string,
  protocol: string
): Promise<UserNotificationPreference[]> {
  // 查询订阅了该协议的用户
  const userSetups = await this.collections.userAlarmSetups
    .find({
      'ProtocolSetup.Protocol': protocol,
    })
    .toArray();

  // 转换为 UserNotificationPreference 格式
  return userSetups.map((setup) => {
    const channels: NotificationChannel[] = [];
    if (setup.wxs && setup.wxs.length > 0) channels.push('wechat');
    if (setup.tels && setup.tels.length > 0) channels.push('sms');
    if (setup.mails && setup.mails.length > 0) channels.push('email');

    return {
      userId: setup.user,
      channels,
      alarmLevels: ['info', 'warning', 'error', 'critical'],
      wechatOpenIds: setup.wxs || [],
      phones: setup.tels || [],
      emails: setup.mails || [],
    };
  });
}
```

#### 3. 通知日志持久化

每次发送通知都会创建日志记录：

```typescript
private async sendWeChatNotification(
  alarm: AlarmDocument,
  userId: string,
  openIds: string[]
): Promise<ObjectId> {
  // 格式化消息
  const params = this.formatWeChatMessage(alarm);

  // 创建通知日志 (pending 状态)
  const log = createWechatLog(userId, openIds[0], params, alarm._id?.toString());
  const result = await this.collections.notificationLogs.insertOne(log);
  const logId = result.insertedId;

  try {
    // 调用微信 API (TODO: 集成真实 API)
    const response = await this.wechatService.sendTemplateMessage(openIds[0], params);

    // 标记为成功
    await this.collections.notificationLogs.updateOne(
      { _id: logId },
      { $set: markNotificationSent(response) }
    );

    return logId;
  } catch (error) {
    // 标记为失败
    await this.markNotificationFailed(logId, error, true);
    throw error;
  }
}
```

#### 4. 新增统计功能

```typescript
async getNotificationStats(
  userId?: string,
  startTime?: number,
  endTime?: number
): Promise<{
  total: number;
  sent: number;
  failed: number;
  byChannel: Record<NotificationChannel, number>;
}> {
  const filter: any = {};

  if (userId) filter.userId = userId;
  if (startTime || endTime) {
    filter.timeStamp = {};
    if (startTime) filter.timeStamp.$gte = startTime;
    if (endTime) filter.timeStamp.$lte = endTime;
  }

  const logs = await this.collections.notificationLogs.find(filter).toArray();

  return {
    total: logs.length,
    sent: logs.filter((l) => l.status === 'sent').length,
    failed: logs.filter((l) => l.status === 'failed').length,
    byChannel: {
      wechat: logs.filter((l) => l.channel === 'wechat').length,
      sms: logs.filter((l) => l.channel === 'sms').length,
      email: logs.filter((l) => l.channel === 'email').length,
      webhook: logs.filter((l) => l.channel === 'webhook').length,
    },
  };
}
```

---

## 🔗 数据库初始化集成

### mongodb.ts 更新

添加了 Phase 3 集合自动初始化：

```typescript
// src/database/mongodb.ts
import { initializePhase3Collections } from '../entities/mongodb';

private async _connect(): Promise<void> {
  // ... 连接逻辑 ...

  console.log(`✓ MongoDB 已连接: ${dbName}`);

  // 初始化 Phase 3 集合和索引
  await initializePhase3Collections(this.db);

  // 启动连接池监控
  this.startPoolMonitoring();
}
```

### 启动日志示例

```
✓ MongoDB 已连接: uart_server
[Phase3] Initializing collections and indexes...
[Phase3] Created collection: alarm.rules
[Phase3] Created index: alarm.rules.enabled_type_idx
[Phase3] Created index: alarm.rules.protocol_enabled_idx
[Phase3] Created index: alarm.rules.pid_enabled_idx
[Phase3] Created index: alarm.rules.param_enabled_idx
[Phase3] Created index: alarm.rules.level_enabled_idx
[Phase3] Created index: alarm.rules.user_rules_idx
[Phase3] Created index: alarm.rules.last_triggered_idx
[Phase3] Created collection: alarms
[Phase3] Created index: alarms.status_time_idx
[Phase3] Created index: alarms.device_time_idx
[Phase3] Created index: alarms.protocol_time_idx
[Phase3] Created index: alarms.tag_time_idx
[Phase3] Created index: alarms.ttl_resolved_idx
[Phase3] Created collection: notification.logs
[Phase3] Created index: notification.logs.timestamp_idx
[Phase3] Created index: notification.logs.alarm_time_idx
[Phase3] Created index: notification.logs.user_channel_time_idx
[Phase3] Created index: notification.logs.status_retry_idx
[Phase3] Created index: notification.logs.channel_status_time_idx
[Phase3] Created index: notification.logs.sent_at_idx
[Phase3] Created index: notification.logs.ttl_success_idx
[Phase3] Collections and indexes initialized successfully
```

---

## 📊 服务使用示例

### 完整的告警处理流程

```typescript
import { mongodb } from './database/mongodb';
import { AlarmRuleEngineService } from './services/alarm-rule-engine.service';
import { AlarmNotificationService } from './services/alarm-notification.service';
import { DataParsingService } from './services/data-parsing.service';

// 1. 创建服务实例
const db = mongodb.getDatabase();
const alarmEngine = new AlarmRuleEngineService(db);
const notificationService = new AlarmNotificationService(db);
const parsingService = new DataParsingService();

// 2. 添加告警规则
await alarmEngine.addRule(
  createThresholdRule(
    '温度超限告警',
    'modbus',
    'temperature',
    -10,
    80,
    'warning',
    'admin'
  )
);

// 3. 解析设备数据
const rawData = Buffer.from('01030400640065', 'hex');
const parsedData = await parsingService.parseData(rawData, {
  mac: '00:11:22:33:44:55',
  pid: 'device-1',
  protocol: 'modbus',
});

// 4. 评估规则并触发告警
const result = await alarmEngine.evaluateData(parsedData);

// 5. 发送通知
if (result.triggered) {
  for (const alarm of result.alarms) {
    await notificationService.sendAlarmNotification(alarm);
  }
}

// 6. 查询统计
const stats = await notificationService.getNotificationStats('admin');
console.log('通知统计:', stats);
```

---

## 🎯 对齐现有 midwayuartserver 模式

### UserAlarmSetup 集合复用

Phase 3 直接使用现有 `user.alarmsetups` 集合，保持字段结构不变：

| 字段 | 类型 | 说明 |
|------|------|------|
| `user` | string | 用户名 (对齐现有) |
| `tels` | string[] | 告警电话列表 (对齐现有) |
| `mails` | string[] | 告警邮箱列表 (对齐现有) |
| `wxs` | string[] | 告警微信 OpenID 列表 (对齐现有) |
| `ProtocolSetup` | DevConstant[] | 协议设置 (对齐现有) |

### 通知日志结构对齐

`notification.logs` 集合对齐现有 `log.smssends`, `log.mailsends`, `log.wxsubscribeMessages` 结构：

| 新字段 | 对应现有字段 | 说明 |
|-------|-------------|------|
| `timeStamp` | `timeStamp` | 时间戳 (对齐) |
| `recipients` | `tels` / `mails` / `touser` | 接收者列表 |
| `sendParams` | `smssendParams` / `mailsendParams` | 发送参数 |
| `Success` | `Success` | 成功响应 (对齐) |
| `Error` | `Error` | 错误信息 (对齐) |
| `channel` | - | Phase 3 新增 (区分渠道) |
| `alarmId` | - | Phase 3 新增 (关联告警) |

---

## ✅ 集成检查清单

- [x] AlarmRuleEngineService 接受 Db 参数
- [x] AlarmRuleEngineService 从 MongoDB 加载规则
- [x] AlarmRuleEngineService 持久化告警到 MongoDB
- [x] AlarmRuleEngineService 实现 CRUD 操作
- [x] AlarmNotificationService 接受 Db 参数
- [x] AlarmNotificationService 从 user.alarmsetups 查询订阅者
- [x] AlarmNotificationService 持久化通知日志到 MongoDB
- [x] AlarmNotificationService 提供统计功能
- [x] mongodb.ts 自动初始化 Phase 3 集合
- [x] 文档更新 (DATABASE_ARCHITECTURE.md)
- [x] 文档更新 (SERVICE_LAYER_INTEGRATION.md)
- [ ] 类型检查通过
- [ ] 提交代码更新

---

## 🚀 后续工作

### 待完成的服务集成

| 服务 | 优先级 | 需要的集合 | 预计工作量 |
|------|--------|-----------|-----------|
| DataParsingService | 中 | 无 (纯计算服务) | - |
| QueueService | 低 | 无 (使用 BullMQ) | - |

### API 集成 (TODO)

以下 API 需要后续集成：

1. **微信模板消息 API** (`AlarmNotificationService.sendWeChatNotification`)
2. **阿里云短信 API** (`AlarmNotificationService.sendSmsNotification`)
3. **SMTP 邮件 API** (`AlarmNotificationService.sendEmailNotification`)

---

**文档版本**: 1.0
**最后更新**: 2025-12-19
**维护者**: Development Team
