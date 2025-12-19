## Database Architecture - Phase 3

**更新时间**: 2025-12-19
**决策**: MongoDB 为主,对齐 midwayuartserver 现有数据模型
**策略**: 不重构现有数据模型,扩展现有集合

---

## 📋 架构决策

### MongoDB 为主数据库 ⭐

**用途**: 所有运行时数据、配置、告警规则、通知日志

**优势**:
- ✅ 灵活的 Schema - 适合快速迭代
- ✅ 高性能写入 - 适合 IoT 高频数据
- ✅ 内置 TTL 索引 - 自动清理过期数据
- ✅ 丰富的查询能力 - 支持复杂聚合
- ✅ 水平扩展 - 支持分片
- ✅ 对齐现有 midwayuartserver 架构

### PostgreSQL 可选 (未来)

**用途**: 历史数据快照、长期存档、复杂分析

**适用场景**:
- 📊 按天/周/月的数据聚合
- 📈 长期趋势分析
- 🔍 跨设备数据关联分析
- 💾 法规要求的长期存档

**当前状态**: Phase 3 暂不实施,MongoDB 完全满足需求

详见 [DATABASE_STRATEGY.md](./DATABASE_STRATEGY.md)

---

## 📦 MongoDB 集合设计

### 1. alarm.rules (告警规则) - Phase 3 新增

**用途**: 存储所有告警规则配置 (扩展现有 ProtocolSetup 模式)

**主要字段**:
```typescript
{
  name: string;              // 规则名称
  type: AlarmRuleType;       // 规则类型: threshold, constant, offline, timeout, custom
  level: AlarmLevel;         // 告警级别: info, warning, error, critical
  protocol?: string;         // 目标协议 (对齐现有 Protocol)
  pid?: string | number;     // 目标设备
  paramName?: string;        // 监控参数 (对应 Threshold.name 或 AlarmStat.name)
  threshold?: {              // 阈值条件 (对应 Threshold)
    min: number;
    max: number;
  };
  constant?: {               // 常量条件 (对应 AlarmStat)
    alarmStat: string[];
  };
  enabled: boolean;          // 是否启用
  deduplicationWindow: number; // 去重窗口(秒)
  createdBy: string;         // 创建人
}
```

**索引策略**:
- `enabled_type_idx`: 按启用状态和类型查询
- `protocol_enabled_idx`: 按协议查询启用规则
- `pid_enabled_idx`: 按设备查询规则
- `param_enabled_idx`: 按参数查询规则
- `user_rules_idx`: 用户规则列表查询

**数据量估算**: ~1,000 规则

**对齐说明**:
- 基于现有 `Threshold` 和 `AlarmStat` 模式
- 扩展为独立规则引擎
- 支持更灵活的告警配置

---

### 2. alarms (告警记录) - Phase 3 新增

**用途**: 持久化告警事件 (扩展现有 UartTerminalDataTransfinite)

**主要字段**:
```typescript
{
  parentId?: string;         // 父级 ID (对齐现有 parentId)
  type: string;              // 告警类型 (对齐现有 type)
  level: AlarmLevel;         // 告警级别
  tag: AlarmTag;             // 告警标签 (对齐现有 tag: Threshold, AlarmStat, ups)
  mac: string;               // 终端 MAC (对齐现有 mac)
  devName?: string;          // 设备名称 (对齐现有 devName)
  pid: number | string;      // 设备 PID (对齐现有 pid)
  protocol: string;          // 协议名称 (对齐现有 protocol)
  msg: string;               // 告警消息 (对齐现有 msg)
  status: AlarmStatus;       // 状态: active, acknowledged, resolved (扩展现有 isOk)
  timeStamp: number;         // 时间戳 (对齐现有 timeStamp)
  triggeredAt: Date;         // 触发时间
  resolvedAt?: Date;         // 解决时间
}
```

**索引策略**:
- `status_time_idx`: 状态查询索引 (对齐现有 isOk 查询)
- `device_time_idx`: 设备告警历史 (mac + pid)
- `protocol_time_idx`: 协议告警查询
- `tag_time_idx`: 标签查询 (对齐现有 tag)
- **TTL 索引**: 自动删除 90 天前的已解决告警

**数据量估算**: ~10,000-100,000 条/月

**数据生命周期**:
- Active 告警: 永久保留
- 已解决告警: 保留 90 天

**对齐说明**:
- 扩展现有 `UartTerminalDataTransfinite` (log.uartterminaldatatransfinites)
- 保留关键字段: parentId, type, mac, devName, pid, protocol, msg, timeStamp
- 扩展 `isOk` 为更细粒度的 `status`
- 添加 Phase 3 新功能: 级别、确认、解决

---

### 3. notification.logs (通知日志) - Phase 3 新增

**用途**: 统一通知发送记录 (整合现有多个 log.* 集合)

**主要字段**:
```typescript
{
  timeStamp: number;         // 时间戳 (对齐现有 timeStamp)
  alarmId?: ObjectId;        // 告警 ID (Phase 3 新增)
  userId: string;            // 用户 ID
  channel: NotificationChannel; // 通知渠道: wechat, sms, email
  status: NotificationStatus;   // 发送状态: pending, sent, failed
  recipients: string[];      // 接收者列表 (对齐现有 tels/mails/touser)
  sendParams?: {...};        // 发送参数 (对齐现有 smssendParams/mailsendParams)
  Success?: {...};           // 成功响应 (对齐现有 Success)
  Error?: any;               // 错误信息 (对齐现有 Error)
  retryCount: number;        // 重试次数 (Phase 3 新增)
}
```

**索引策略**:
- `timestamp_idx`: 时间戳查询 (对齐现有)
- `alarm_time_idx`: 按告警查询通知
- `user_channel_time_idx`: 用户通知历史
- `status_retry_idx`: 重试队列查询
- **TTL 索引**: 自动删除 30 天前的成功通知

**数据量估算**: ~50,000-500,000 条/月

**数据生命周期**:
- 成功通知: 保留 30 天
- 失败通知: 永久保留 (需人工分析)

**对齐说明**:
- 整合现有 `log.smssends`, `log.mailsends`, `log.wxsubscribeMessages`
- 保留关键结构: timeStamp, sendParams, Success, Error
- 统一为单一集合,添加 channel 字段区分
- 添加告警关联和重试机制

---

### 4. user.alarmsetups (用户告警设置) - 对齐现有

**用途**: 用户通知偏好和告警配置 (完全对齐现有 UserAlarmSetup)

**主要字段**:
```typescript
{
  user: string;              // 用户名 (对齐现有 user)
  tels: string[];            // 告警电话列表 (对齐现有 tels)
  mails: string[];           // 告警邮箱列表 (对齐现有 mails)
  wxs: string[];             // 告警微信列表 (对齐现有 wxs,OpenID)
  ProtocolSetup: [{          // 协议设置 (对齐现有 ProtocolSetup)
    Protocol: string;        // 协议名称
    ShowTag?: string[];      // 显示标签
    Threshold?: [{           // 阈值配置
      name: string;
      min: number;
      max: number;
    }];
    AlarmStat?: [{           // 常量告警配置
      name: string;
      alarmStat: string[];
    }];
  }];
}
```

**索引策略**:
- `user_idx`: 用户查询 (唯一索引)
- `protocol_idx`: 协议查询

**数据量估算**: ~1,000-10,000 条

**对齐说明**:
- 完全对齐现有 `UserAlarmSetup` (collection: 'user.alarmsetups')
- 保持所有字段名和结构不变
- Phase 3 复用此集合,不做修改

---

## 🔧 服务层集成

### AlarmRuleEngineService 集成示例

告警规则引擎服务使用 MongoDB 实体进行规则管理和告警持久化：

```typescript
import { mongodb } from '../database/mongodb';
import { AlarmRuleEngineService } from '../services/alarm-rule-engine.service';

// 创建告警规则引擎实例
const alarmEngine = new AlarmRuleEngineService(mongodb.getDatabase());

// 添加阈值规则
const ruleId = await alarmEngine.addRule(
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

// 评估数据并检测告警
const result = await alarmEngine.evaluateData(parsedData);
```

### AlarmNotificationService 集成示例

告警通知服务从 MongoDB 查询用户订阅信息并持久化通知日志：

```typescript
import { mongodb } from '../database/mongodb';
import { AlarmNotificationService } from '../services/alarm-notification.service';

// 创建通知服务实例
const notificationService = new AlarmNotificationService(
  mongodb.getDatabase(),
  queueService // 可选的任务队列服务
);

// 发送告警通知
await notificationService.sendAlarmNotification(alarm);

// 获取通知统计
const stats = await notificationService.getNotificationStats('user-1');
```

### 数据库初始化流程

应用启动时自动初始化 Phase 3 集合和索引：

```typescript
// src/database/mongodb.ts
import { initializePhase3Collections } from '../entities/mongodb';

// 在 MongoDB 连接建立后自动初始化
await mongodb.connect();
// ✓ MongoDB 已连接: uart_server
// [Phase3] Initializing collections and indexes...
// [Phase3] Created collection: alarm.rules
// [Phase3] Created index: alarm.rules.enabled_type_idx
// ...
// [Phase3] Collections and indexes initialized successfully
```

---

## 🔧 数据访问模式

### 类型安全的集合访问

```typescript
import { Phase3Collections } from '../entities/mongodb';
import { mongodb } from '../database/mongodb';

// 获取类型安全的集合访问器
const collections = new Phase3Collections(mongodb.getDatabase());

// 查询告警规则
const rules = await collections.alarmRules
  .find({ enabled: true, type: 'threshold' })
  .toArray();

// 创建告警
import { createAlarm } from '../entities/mongodb';
await collections.alarms.insertOne(createAlarm({
  parentId: rule._id?.toString(),
  type: 'threshold',
  level: 'warning',
  tag: 'Threshold',
  mac: '00:11:22:33:44:55',
  pid: 'device-1',
  protocol: 'modbus',
  msg: 'Temperature too high',
  timeStamp: Date.now(),
  triggeredAt: new Date(),
}));

// 更新告警状态
import { acknowledgeAlarm } from '../entities/mongodb';
await collections.alarms.updateOne(
  { _id: alarmId },
  { $set: acknowledgeAlarm(userId, 'Checking...') }
);

// 查询用户告警设置 (对齐现有模式)
const userSetup = await collections.userAlarmSetups.findOne({ user: 'username' });
```

---

## 📈 性能优化策略

### 1. 索引优化
- ✅ 所有查询字段都有对应索引
- ✅ 复合索引覆盖常见查询模式
- ✅ Sparse 索引减少空值索引开销
- ✅ Partial 索引仅索引活跃数据

### 2. TTL 索引自动清理
```typescript
// 告警 - 90 天后删除已解决记录
{
  key: { resolvedAt: 1 },
  expireAfterSeconds: 90 * 24 * 60 * 60,
  partialFilterExpression: { status: { $in: ['resolved', 'auto_resolved'] } }
}

// 通知日志 - 30 天后删除成功记录
{
  key: { createdAt: 1 },
  expireAfterSeconds: 30 * 24 * 60 * 60,
  partialFilterExpression: { status: 'sent' }
}
```

### 3. 查询模式优化
- ✅ 分页查询使用 `limit()` + `skip()`
- ✅ 大量数据使用 `cursor.forEach()`
- ✅ 聚合查询使用 `aggregate()`
- ✅ 批量操作使用 `bulkWrite()`

---

## 🚀 初始化流程

### 在应用启动时初始化

```typescript
import { initializePhase3Collections } from '../entities/mongodb';
import { mongodb } from '../database/mongodb';

// 连接数据库后
await mongodb.connect();

// 初始化 Phase 3 集合和索引
await initializePhase3Collections(mongodb.getDatabase());
```

这将自动:
- ✅ 创建所有集合 (如果不存在)
- ✅ 创建所有索引
- ✅ 设置 TTL 索引

---

## 📊 现有集合对齐说明

### 保持不变的集合 (继续使用)

| 集合名 | 用途 | 说明 |
|-------|------|------|
| `user.alarmsetups` | 用户告警设置 | Phase 3 复用,不修改 |
| `log.smssends` | 短信发送日志 | 继续使用,Phase 3 新增 notification.logs 作为补充 |
| `log.mailsends` | 邮件发送日志 | 继续使用,Phase 3 新增 notification.logs 作为补充 |
| `log.wxsubscribeMessages` | 微信消息日志 | 继续使用,Phase 3 新增 notification.logs 作为补充 |
| `log.uartterminaldatatransfinites` | 设备超限日志 | 继续使用,Phase 3 新增 alarms 作为增强版 |
| `terminals.*` | 终端数据 | 继续使用,不修改 |
| 其他 `log.*` | 各类日志 | 继续使用,不修改 |

### Phase 3 新增集合

| 集合名 | 用途 | 与现有集合关系 |
|-------|------|---------------|
| `alarm.rules` | 告警规则 | 扩展 ProtocolSetup 为独立规则引擎 |
| `alarms` | 告警记录 | 扩展 log.uartterminaldatatransfinites,添加状态管理 |
| `notification.logs` | 统一通知日志 | 整合 log.smssends, log.mailsends, log.wxsubscribeMessages,添加告警关联 |

---

## ✅ 架构优势总结

| 维度 | MongoDB 方案 | 双数据库方案 |
|------|-------------|-------------|
| **开发速度** | ⭐⭐⭐⭐⭐ 快 | ⭐⭐⭐ 中等 |
| **运维复杂度** | ⭐⭐⭐⭐⭐ 低 | ⭐⭐ 高 |
| **查询灵活性** | ⭐⭐⭐⭐⭐ 高 | ⭐⭐⭐⭐ 高 |
| **水平扩展** | ⭐⭐⭐⭐⭐ 优秀 | ⭐⭐⭐ 一般 |
| **数据一致性** | ⭐⭐⭐⭐ 好 | ⭐⭐⭐ 复杂 |
| **成本** | ⭐⭐⭐⭐⭐ 低 | ⭐⭐ 高 |
| **兼容现有** | ⭐⭐⭐⭐⭐ 完全对齐 | ⭐⭐⭐ 需迁移 |

**结论**: MongoDB 单数据库方案最适合当前项目需求,完全对齐现有 midwayuartserver 架构。

---

**文档版本**: 2.0
**最后更新**: 2025-12-19
**维护者**: Development Team
