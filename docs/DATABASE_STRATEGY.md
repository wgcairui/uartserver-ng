# Database Strategy - MongoDB vs PostgreSQL

**更新时间**: 2025-12-19
**决策依据**: 对齐 midwayuartserver 现有架构,基于数据特性选择存储

---

## 📊 数据分类和存储策略

### MongoDB 为主 (运行时数据)

适用于**高频写入**、**灵活 Schema**、**时序数据**:

| 数据类型 | 集合名称 | 原因 | TTL |
|---------|---------|------|-----|
| **告警记录** | `alarms` | ✅ 高频写入<br>✅ 需要自动清理<br>✅ 查询模式简单 | 90天 (已解决) |
| **通知日志** | `notification.logs` | ✅ 高频写入<br>✅ 自动清理<br>✅ 对齐现有 log.* 模式 | 30天 (成功) |
| **用户告警设置** | `user.alarmsetups` | ✅ 对齐现有模式<br>✅ 嵌套文档 (ProtocolSetup) | 无 |
| **告警规则** | `alarm.rules` | ✅ 动态规则<br>✅ 频繁更新触发计数 | 无 |
| **设备参数超限** | `log.uartterminaldatatransfinites` | ✅ 现有集合<br>✅ 高频写入 | 无 |
| **终端数据** | `terminals.*` | ✅ 现有集合<br>✅ 在线状态频繁更新 | 无 |
| **其他日志** | `log.*` | ✅ 现有集合<br>✅ 高频写入 | 各有不同 |

---

### PostgreSQL 可选 (历史快照和分析)

适用于**历史归档**、**复杂分析**、**报表生成**:

| 数据类型 | 表名 | 用途 | 聚合周期 |
|---------|------|------|---------|
| **告警统计快照** | `alarm_stats_daily` | 📊 按天聚合告警数据<br>📊 设备/协议/级别维度统计<br>📊 趋势分析 | 每日 00:00 |
| **设备参数历史** | `device_params_hourly` | 📊 按小时聚合参数数据<br>📊 参数变化趋势<br>📊 历史对比 | 每小时 |
| **通知效果分析** | `notification_stats_daily` | 📊 通知发送统计<br>📊 成功率/失败率分析<br>📊 渠道效果对比 | 每日 00:00 |
| **用户活跃度** | `user_activity_weekly` | 📊 用户使用统计<br>📊 设备关注度<br>📊 告警处理效率 | 每周日 |
| **设备在线率** | `device_uptime_daily` | 📊 设备在线/离线统计<br>📊 可靠性分析<br>📊 SLA 报告 | 每日 00:00 |

---

## 🔄 数据流转策略

### 1. MongoDB → PostgreSQL 聚合 (每日任务)

```typescript
// 伪代码示例
async function dailyAggregation() {
  // 1. 从 MongoDB 读取昨天的告警数据
  const alarms = await mongodb.alarms.find({
    triggeredAt: { $gte: yesterday, $lt: today }
  }).toArray();

  // 2. 聚合统计
  const stats = aggregateAlarms(alarms);

  // 3. 写入 PostgreSQL
  await postgres.alarm_stats_daily.insert({
    stat_date: yesterday,
    total_alarms: stats.total,
    by_level: stats.byLevel,
    by_device: stats.byDevice,
    by_protocol: stats.byProtocol,
    avg_resolution_time: stats.avgResolutionTime
  });
}
```

### 2. MongoDB TTL 自动清理

```typescript
// alarms 集合
{
  key: { resolvedAt: 1 },
  expireAfterSeconds: 90 * 24 * 60 * 60, // 90天后删除
  partialFilterExpression: { status: { $in: ['resolved', 'auto_resolved'] } }
}

// notification.logs 集合
{
  key: { createdAt: 1 },
  expireAfterSeconds: 30 * 24 * 60 * 60, // 30天后删除
  partialFilterExpression: { status: 'sent' }
}
```

### 3. PostgreSQL 保留策略

```sql
-- 保留 1 年的每日统计
DELETE FROM alarm_stats_daily WHERE stat_date < NOW() - INTERVAL '1 year';

-- 保留 3 个月的每小时统计
DELETE FROM device_params_hourly WHERE stat_time < NOW() - INTERVAL '3 months';
```

---

## ⚖️ 决策矩阵

### 何时使用 MongoDB?

| 场景 | 原因 |
|------|------|
| 实时告警记录 | 高频写入,TTL 自动清理 |
| 设备在线状态 | 频繁更新,灵活字段 |
| 日志数据 | 写入密集,按时间查询 |
| 嵌套配置 | ProtocolSetup 等嵌套文档 |
| 快速原型 | Schema 灵活,快速迭代 |

### 何时使用 PostgreSQL?

| 场景 | 原因 |
|------|------|
| 历史数据分析 | 复杂聚合,JOIN 查询 |
| 统计报表 | 按维度统计,趋势分析 |
| 数据归档 | 长期保存,法规要求 |
| 跨表关联 | 多表 JOIN,外键约束 |
| 事务一致性 | ACID 保证 |

---

## 📈 PostgreSQL 表结构示例

### alarm_stats_daily (告警每日统计)

```sql
CREATE TABLE alarm_stats_daily (
  id SERIAL PRIMARY KEY,
  stat_date DATE NOT NULL UNIQUE,

  -- 总体统计
  total_alarms INTEGER NOT NULL,
  active_alarms INTEGER NOT NULL,
  resolved_alarms INTEGER NOT NULL,
  avg_resolution_minutes NUMERIC(10,2),

  -- 按级别统计 (JSONB)
  by_level JSONB NOT NULL, -- { "info": 10, "warning": 50, "error": 20, "critical": 5 }

  -- 按设备统计 (JSONB)
  by_device JSONB, -- { "device-1": 30, "device-2": 45 }

  -- 按协议统计 (JSONB)
  by_protocol JSONB, -- { "modbus": 40, "mqtt": 35 }

  -- 按标签统计 (JSONB)
  by_tag JSONB, -- { "Threshold": 60, "AlarmStat": 15 }

  created_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_alarm_stats_date ON alarm_stats_daily(stat_date DESC);
```

### device_params_hourly (设备参数每小时统计)

```sql
CREATE TABLE device_params_hourly (
  id BIGSERIAL PRIMARY KEY,
  stat_time TIMESTAMP NOT NULL,
  mac VARCHAR(17) NOT NULL,
  pid VARCHAR(50) NOT NULL,
  protocol VARCHAR(100) NOT NULL,
  param_name VARCHAR(100) NOT NULL,

  -- 统计值
  min_value NUMERIC,
  max_value NUMERIC,
  avg_value NUMERIC,
  sample_count INTEGER,

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(stat_time, mac, pid, param_name)
);

-- 索引
CREATE INDEX idx_device_params_time ON device_params_hourly(stat_time DESC);
CREATE INDEX idx_device_params_device ON device_params_hourly(mac, pid);
CREATE INDEX idx_device_params_param ON device_params_hourly(param_name);
```

### notification_stats_daily (通知效果每日统计)

```sql
CREATE TABLE notification_stats_daily (
  id SERIAL PRIMARY KEY,
  stat_date DATE NOT NULL,
  channel VARCHAR(20) NOT NULL, -- wechat, sms, email

  -- 发送统计
  total_sent INTEGER NOT NULL,
  success_count INTEGER NOT NULL,
  failed_count INTEGER NOT NULL,
  success_rate NUMERIC(5,2), -- 成功率 (%)

  -- 重试统计
  avg_retry_count NUMERIC(5,2),
  max_retry_count INTEGER,

  -- 性能统计
  avg_send_time_ms INTEGER, -- 平均发送耗时

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(stat_date, channel)
);

-- 索引
CREATE INDEX idx_notification_stats_date ON notification_stats_daily(stat_date DESC);
CREATE INDEX idx_notification_stats_channel ON notification_stats_daily(channel);
```

---

## 🚀 实施计划

### Phase 3.1 - MongoDB Only (当前)

- ✅ 所有运行时数据使用 MongoDB
- ✅ TTL 自动清理过期数据
- ✅ 满足基本查询和分析需求

### Phase 3.2 - 添加 PostgreSQL 聚合 (可选,未来)

**触发条件**: 当满足以下任一条件时考虑启用

1. 需要生成**长期趋势报表** (超过 90 天)
2. 需要**复杂多维度分析** (跨设备/协议/用户)
3. **法规要求**长期存档 (1年+)
4. **性能优化**需求 (MongoDB 聚合查询变慢)

**实施步骤**:

1. **Week 1**: 创建 PostgreSQL 表结构
2. **Week 2**: 开发聚合脚本 (每日定时任务)
3. **Week 3**: 数据验证和性能测试
4. **Week 4**: 上线监控和调优

---

## ✅ 当前决策总结

| 维度 | 决策 | 理由 |
|------|------|------|
| **运行时数据** | MongoDB | 高性能、灵活、TTL 自动清理 |
| **历史快照** | 暂不实施 | 当前数据量不需要,MongoDB 完全满足 |
| **未来扩展** | PostgreSQL 可选 | 预留方案,需求驱动 |
| **数据一致性** | 单数据库 | 避免双写复杂度,降低运维成本 |
| **查询性能** | MongoDB 索引 | 充分利用索引,满足查询需求 |

**结论**: Phase 3 专注于 MongoDB,PostgreSQL 作为可选方案预留,根据实际需求决定是否启用。

---

**文档版本**: 1.0
**最后更新**: 2025-12-19
**维护者**: Development Team
