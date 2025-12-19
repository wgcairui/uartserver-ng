# Prometheus 指标集成规划

**创建时间**: 2025-12-19
**状态**: 规划中
**优先级**: P1（重要但不紧急）

---

## 📋 目录

1. [概述](#概述)
2. [指标架构设计](#指标架构设计)
3. [指标分类和命名规范](#指标分类和命名规范)
4. [核心指标清单](#核心指标清单)
5. [实施计划](#实施计划)
6. [已完成功能的指标集成](#已完成功能的指标集成)
7. [未来功能的指标规划](#未来功能的指标规划)
8. [监控仪表板设计](#监控仪表板设计)
9. [告警规则建议](#告警规则建议)

---

## 概述

### 目标

为 uartserver-ng 系统添加全面的 Prometheus 指标收集能力，实现：
- **可观测性**: 实时监控系统运行状态
- **性能分析**: 识别性能瓶颈和优化机会
- **故障诊断**: 快速定位和解决问题
- **容量规划**: 基于历史数据进行资源规划

### 技术栈

- **指标库**: `prom-client` (官方 Node.js Prometheus 客户端)
- **导出方式**: HTTP `/metrics` 端点
- **存储**: Prometheus Server (外部部署)
- **可视化**: Grafana Dashboard

---

## 指标架构设计

### 三层指标模型

```
┌─────────────────────────────────────────────────────────┐
│                    应用层指标 (Business Metrics)          │
│  - 在线终端数、查询成功率、告警数量                         │
│  - 设备类型分布、协议使用统计                              │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   服务层指标 (Service Metrics)            │
│  - Socket.IO 连接数、查询延迟、事件吞吐量                   │
│  - WebSocket 订阅数、数据库操作性能                        │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                  基础设施指标 (Infrastructure Metrics)    │
│  - HTTP 请求、内存使用、事件循环延迟                        │
│  - MongoDB/Redis 连接池、错误率                           │
└─────────────────────────────────────────────────────────┘
```

### 指标服务架构

```typescript
┌──────────────────────┐
│  MetricsService      │  ← 统一指标管理服务
│  - register()        │
│  - getMetrics()      │
│  - createCounter()   │
│  - createGauge()     │
│  - createHistogram() │
└──────────────────────┘
           ↓
┌──────────────────────────────────────────┐
│  Domain-Specific Metric Collectors        │
│  - SocketIoMetrics                       │
│  - WebSocketMetrics                      │
│  - DatabaseMetrics                       │
│  - AlarmMetrics                          │
│  - TerminalMetrics                       │
└──────────────────────────────────────────┘
           ↓
┌──────────────────────┐
│  HTTP /metrics       │  ← Prometheus 抓取端点
│  Endpoint            │
└──────────────────────┘
```

---

## 指标分类和命名规范

### 命名规范

遵循 Prometheus 最佳实践：

```
<namespace>_<subsystem>_<metric_name>_<unit>
```

**示例:**
- `uartserver_socketio_query_duration_seconds`
- `uartserver_terminal_online_total`
- `uartserver_alarm_triggered_total`

### 指标类型

| 类型 | 用途 | 示例 |
|------|------|------|
| **Counter** | 累计计数（只增不减） | 查询总数、错误总数、告警总数 |
| **Gauge** | 当前值（可增可减） | 在线终端数、活跃连接数、内存使用 |
| **Histogram** | 分布统计 | 查询延迟、数据包大小 |
| **Summary** | 分位数统计 | P50/P95/P99 延迟 |

---

## 核心指标清单

### 1. 应用层指标 (Business Metrics)

#### 终端管理
```typescript
// 在线终端总数
uartserver_terminal_online_total{protocol="modbus"} gauge

// 终端注册总数（累计）
uartserver_terminal_registered_total{node="node-1"} counter

// 终端上线/下线事件
uartserver_terminal_status_changes_total{status="online|offline"} counter

// 按设备类型统计的终端数
uartserver_terminal_by_type{device_type="DTU|RTU"} gauge
```

#### 查询性能
```typescript
// 查询总数
uartserver_query_total{status="success|failure|timeout",protocol="modbus"} counter

// 查询延迟分布
uartserver_query_duration_seconds{protocol="modbus"} histogram
  Buckets: 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10

// 查询成功率（通过 PromQL 计算）
rate(uartserver_query_total{status="success"}[5m]) /
rate(uartserver_query_total[5m])

// 每秒查询数 (QPS)
uartserver_query_qps gauge
```

#### 告警系统
```typescript
// 告警触发总数
uartserver_alarm_triggered_total{type="data|timeout|offline",level="warning|error|critical"} counter

// 活跃告警数
uartserver_alarm_active{type="data|timeout|offline"} gauge

// 告警推送成功/失败
uartserver_alarm_push_total{channel="websocket|sms|email",status="success|failure"} counter

// 告警响应时间
uartserver_alarm_response_duration_seconds histogram
```

### 2. 服务层指标 (Service Metrics)

#### Socket.IO (Node 客户端)
```typescript
// Node 客户端连接数
uartserver_socketio_node_connections_active gauge

// Node 客户端总数
uartserver_socketio_nodes_total gauge

// Socket.IO 事件处理延迟
uartserver_socketio_event_duration_seconds{event="RegisterNode|queryResult"} histogram

// 事件处理总数
uartserver_socketio_events_total{event="RegisterNode|queryResult",status="success|error"} counter

// 数据包大小
uartserver_socketio_packet_size_bytes{direction="in|out"} histogram
```

#### WebSocket (用户客户端)
```typescript
// 用户 WebSocket 连接数
uartserver_websocket_user_connections_active gauge

// 订阅总数
uartserver_websocket_subscriptions_total gauge

// 按房间统计的订阅数
uartserver_websocket_room_subscribers{room="device_MAC_PID"} gauge

// 推送消息总数
uartserver_websocket_messages_pushed_total{type="data|alarm|status"} counter

// 推送延迟
uartserver_websocket_push_duration_seconds histogram
```

#### 数据库操作
```typescript
// MongoDB 操作延迟
uartserver_mongodb_operation_duration_seconds{operation="find|insert|update|delete",collection="terminals"} histogram

// MongoDB 操作总数
uartserver_mongodb_operations_total{operation="find|insert|update",status="success|error"} counter

// MongoDB 连接池
uartserver_mongodb_pool_connections{state="active|idle|total"} gauge

// Redis 操作延迟
uartserver_redis_operation_duration_seconds{operation="get|set|del"} histogram

// Redis 操作总数
uartserver_redis_operations_total{operation="get|set|del",status="success|error"} counter
```

### 3. 基础设施指标 (Infrastructure Metrics)

#### HTTP 服务器
```typescript
// HTTP 请求总数
uartserver_http_requests_total{method="GET|POST",path="/api/...",status="200|404|500"} counter

// HTTP 请求延迟
uartserver_http_request_duration_seconds{method="GET|POST",path="/api/..."} histogram

// 活跃 HTTP 连接
uartserver_http_connections_active gauge
```

#### 系统资源
```typescript
// 内存使用
uartserver_memory_heap_used_bytes gauge
uartserver_memory_heap_total_bytes gauge
uartserver_memory_external_bytes gauge
uartserver_memory_rss_bytes gauge

// 事件循环延迟
uartserver_eventloop_lag_seconds histogram

// CPU 使用率（通过 process.cpuUsage()）
uartserver_cpu_user_seconds_total counter
uartserver_cpu_system_seconds_total counter

// 垃圾回收
uartserver_gc_duration_seconds{type="major|minor"} histogram
uartserver_gc_count_total{type="major|minor"} counter
```

#### 错误和异常
```typescript
// 未捕获异常
uartserver_uncaught_exceptions_total{type="error|rejection"} counter

// 应用错误
uartserver_errors_total{service="socketio|websocket|database",severity="warning|error|critical"} counter
```

---

## 实施计划

### Phase 1: 基础设施搭建 (2-3 小时)

**任务:**
1. ✅ 安装 `prom-client` 依赖
2. ✅ 创建 `MetricsService` 核心服务
3. ✅ 实现 `/metrics` HTTP 端点
4. ✅ 添加默认的 Node.js 运行时指标
5. ✅ 编写单元测试

**交付物:**
- `src/services/metrics.service.ts`
- `src/routes/metrics.route.ts`
- `test/unit/metrics.service.test.ts`

**验收标准:**
- `/metrics` 端点正常返回 Prometheus 格式数据
- 包含基础的 Node.js 运行时指标（内存、事件循环等）

---

### Phase 2: 核心服务指标 (4-5 小时)

**任务:**
1. ✅ Socket.IO 服务指标集成
   - 连接数、事件延迟、查询统计
2. ✅ WebSocket 服务指标集成
   - 订阅数、推送延迟、房间统计
3. ✅ 数据库服务指标集成
   - MongoDB 操作延迟、连接池状态
   - Redis 操作统计
4. ✅ 编写集成测试

**交付物:**
- `src/services/socket-io.service.ts` (添加指标)
- `src/services/websocket.service.ts` (添加指标)
- `src/services/result.service.ts` (添加指标)
- `test/integration/metrics.test.ts`

**验收标准:**
- 所有核心服务的关键操作都有指标记录
- 指标在高负载下不影响性能（<1% 开销）

---

### Phase 3: 业务指标集成 (3-4 小时)

**任务:**
1. ✅ 终端管理指标
   - 在线数、注册数、状态变更
2. ✅ 查询流程指标
   - QPS、延迟、成功率
3. ✅ 告警系统指标
   - 告警触发数、推送成功率
4. ✅ 更新现有功能添加指标

**交付物:**
- `src/services/terminal.service.ts` (添加指标)
- `src/services/alarm.service.ts` (添加指标)
- 所有已完成功能的指标集成

**验收标准:**
- 核心业务流程的端到端指标覆盖
- 指标数据准确性验证

---

### Phase 4: 监控和可视化 (2-3 小时)

**任务:**
1. ✅ 创建 Grafana Dashboard 配置
2. ✅ 编写 Prometheus 告警规则
3. ✅ 更新部署文档
4. ✅ 创建监控运维手册

**交付物:**
- `monitoring/grafana-dashboard.json`
- `monitoring/prometheus-rules.yml`
- `docs/MONITORING_GUIDE.md`

**验收标准:**
- Grafana Dashboard 可视化所有关键指标
- 告警规则覆盖关键故障场景

---

## 已完成功能的指标集成

### 性能测试功能 (已完成)

**需要添加的指标:**

```typescript
// test/performance/baseline-test.test.ts
// test/performance/load-test.test.ts

// 测试场景指标
uartserver_test_terminals_total gauge
uartserver_test_query_latency_p95_seconds gauge
uartserver_test_query_latency_p99_seconds gauge
uartserver_test_query_throughput_qps gauge
uartserver_test_query_success_rate gauge
```

**集成位置:**
- `test/performance/utils/metrics-collector.ts` - 扩展以导出 Prometheus 指标
- 性能测试结果自动发送到 Prometheus Pushgateway

---

### 告警流程功能 (已完成)

**需要添加的指标:**

```typescript
// src/services/result.service.ts (handleQueryResult)

// 告警触发
metricsService.alarmTriggered.inc({
  type: 'data',  // data|timeout|offline
  level: 'warning',
  mac: data.mac,
  protocol: terminalData.protocol
});

// 告警推送
metricsService.alarmPushed.inc({
  channel: 'websocket',
  status: 'success',
  userCount: subscribers.length
});
```

**集成位置:**
- `src/services/result.service.ts:192-220` - 告警推送逻辑
- `src/services/socket-user.service.ts` - 用户推送服务
- `test/integration/alarm-flow.test.ts` - 验证指标记录

---

### Socket.IO 查询流程 (已完成)

**需要添加的指标:**

```typescript
// src/services/socket-io.service.ts

// 查询开始
const queryTimer = metricsService.queryDuration.startTimer({
  protocol: protocol,
  mac: mac
});

// 查询完成
metricsService.queryTotal.inc({
  status: success ? 'success' : 'failure',
  protocol: protocol
});
queryTimer({ status: success ? 'success' : 'failure' });

// Node 连接
metricsService.nodeConnections.set(this.nodeMap.size);
```

**集成位置:**
- `src/services/socket-io.service.ts:handleQueryResult()` - 查询结果处理
- `src/services/socket-io.service.ts:handleRegisterNode()` - Node 注册
- `src/services/socket-io.service.ts:handleDisconnect()` - 连接断开

---

### WebSocket 订阅功能 (已完成)

**需要添加的指标:**

```typescript
// src/services/websocket.service.ts

// 订阅统计
metricsService.websocketSubscriptions.inc({
  userId: userId,
  mac: mac,
  pid: pid
});

// 推送统计
metricsService.websocketMessagesPushed.inc({
  type: update.type,  // data|alarm|status
  room: room,
  subscriberCount: this.roomSubscribers.get(room)?.size
});
```

**集成位置:**
- `src/services/websocket.service.ts:handleSubscribe()` - 订阅处理
- `src/services/websocket.service.ts:pushToRoom()` - 消息推送
- `src/services/websocket.service.ts:handleConnection()` - 连接管理

---

## 未来功能的指标规划

### Phase 3.1: 告警规则引擎

**规划的指标:**

```typescript
// 规则引擎性能
uartserver_alarm_rule_evaluation_duration_seconds{rule_id} histogram
uartserver_alarm_rule_evaluations_total{rule_id,result="matched|not_matched"} counter
uartserver_alarm_rules_active{type="threshold|pattern|composite"} gauge

// 规则命中率
uartserver_alarm_rule_hit_rate{rule_id} gauge
```

---

### Phase 3.2: API 网关

**规划的指标:**

```typescript
// API 请求
uartserver_api_requests_total{endpoint,method,status} counter
uartserver_api_request_duration_seconds{endpoint,method} histogram

// API 限流
uartserver_api_rate_limit_exceeded_total{endpoint,user_id} counter

// 认证
uartserver_api_auth_attempts_total{result="success|failure",method="jwt|apikey"} counter
```

---

### Phase 3.3: 管理后台

**规划的指标:**

```typescript
// 用户操作审计
uartserver_admin_operations_total{operation="create|update|delete",resource="terminal|user|rule"} counter

// 配置变更
uartserver_admin_config_changes_total{config_type} counter
```

---

## 监控仪表板设计

### Grafana Dashboard 布局

#### Dashboard 1: 系统总览 (System Overview)

**Row 1: 关键业务指标**
- 在线终端数 (Gauge)
- 查询 QPS (Graph)
- 查询成功率 (Gauge, SLA 目标 99%)
- 活跃告警数 (Stat)

**Row 2: 性能指标**
- 查询延迟 P50/P95/P99 (Graph)
- WebSocket 连接数 (Graph)
- Socket.IO 连接数 (Graph)
- 事件循环延迟 (Graph)

**Row 3: 资源使用**
- 内存使用 (Graph, Heap/RSS)
- CPU 使用率 (Graph)
- MongoDB 连接池 (Graph)
- Redis 连接数 (Graph)

**Row 4: 错误统计**
- 错误率 (Graph)
- 异常总数 (Table)
- 慢查询 (Table, >1s)

---

#### Dashboard 2: 告警系统 (Alarm System)

**Row 1: 告警概览**
- 告警触发总数 (按类型分组)
- 告警响应时间
- 推送成功率

**Row 2: 告警明细**
- 按设备统计的告警数 (Table)
- 告警趋势 (Time Series)
- 告警级别分布 (Pie Chart)

---

#### Dashboard 3: 终端管理 (Terminal Management)

**Row 1: 终端统计**
- 总终端数 vs 在线终端数
- 按协议分类的终端数
- 按节点分布的终端数

**Row 2: 查询性能**
- 按协议的查询延迟
- 按终端的查询成功率
- 超时查询统计

---

#### Dashboard 4: 性能分析 (Performance Analysis)

**Row 1: 延迟分析**
- 查询延迟热力图 (Heatmap)
- 延迟分布直方图
- P99 延迟趋势

**Row 2: 吞吐量分析**
- QPS 趋势
- 数据吞吐量 (bytes/s)
- 事件处理速率

---

## 告警规则建议

### Prometheus 告警规则 (prometheus-rules.yml)

```yaml
groups:
  - name: uartserver_alerts
    interval: 30s
    rules:
      # 查询成功率低于 95%
      - alert: LowQuerySuccessRate
        expr: |
          (
            rate(uartserver_query_total{status="success"}[5m]) /
            rate(uartserver_query_total[5m])
          ) < 0.95
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "查询成功率低于 95%"
          description: "当前成功率: {{ $value | humanizePercentage }}"

      # 查询延迟 P95 > 500ms
      - alert: HighQueryLatency
        expr: |
          histogram_quantile(0.95,
            rate(uartserver_query_duration_seconds_bucket[5m])
          ) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "查询延迟 P95 超过 500ms"
          description: "当前 P95 延迟: {{ $value }}s"

      # 在线终端数急剧下降（5分钟内下降 20%）
      - alert: TerminalDropRateHigh
        expr: |
          (
            uartserver_terminal_online_total -
            uartserver_terminal_online_total offset 5m
          ) / uartserver_terminal_online_total offset 5m < -0.2
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "在线终端数急剧下降"
          description: "5分钟内下降了 {{ $value | humanizePercentage }}"

      # 内存使用率 > 80%
      - alert: HighMemoryUsage
        expr: |
          uartserver_memory_heap_used_bytes /
          uartserver_memory_heap_total_bytes > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "内存使用率过高"
          description: "当前使用率: {{ $value | humanizePercentage }}"

      # 事件循环延迟 > 100ms
      - alert: HighEventLoopLag
        expr: |
          histogram_quantile(0.95,
            rate(uartserver_eventloop_lag_seconds_bucket[1m])
          ) > 0.1
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "事件循环延迟过高"
          description: "当前 P95 延迟: {{ $value }}s"

      # 活跃告警数过多
      - alert: TooManyActiveAlarms
        expr: uartserver_alarm_active > 100
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "活跃告警数过多"
          description: "当前活跃告警: {{ $value }} 个"

      # MongoDB 操作错误率 > 1%
      - alert: HighDatabaseErrorRate
        expr: |
          (
            rate(uartserver_mongodb_operations_total{status="error"}[5m]) /
            rate(uartserver_mongodb_operations_total[5m])
          ) > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "MongoDB 错误率过高"
          description: "当前错误率: {{ $value | humanizePercentage }}"

      # WebSocket 推送失败率 > 5%
      - alert: HighWebSocketPushFailureRate
        expr: |
          (
            rate(uartserver_websocket_messages_pushed_total{status="error"}[5m]) /
            rate(uartserver_websocket_messages_pushed_total[5m])
          ) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "WebSocket 推送失败率过高"
          description: "当前失败率: {{ $value | humanizePercentage }}"
```

---

## 性能考虑

### 指标收集开销

**目标**: 指标收集的性能开销 < 1%

**优化策略:**
1. **使用标签谨慎**: 避免高基数标签（如 MAC 地址、用户 ID）
2. **采样**: 对高频操作使用采样（如每 100 次记录一次）
3. **批量更新**: 使用 `inc()` 而不是 `set()`
4. **延迟计算**: 使用 Histogram 而不是实时计算百分位数
5. **缓存**: 缓存静态指标值

### 标签基数控制

**高基数标签（避免）:**
- ❌ `mac` (成千上万个不同值)
- ❌ `userId` (用户量很大)
- ❌ `timestamp` (每秒都不同)

**低基数标签（推荐）:**
- ✅ `protocol` (modbus, http, mqtt - 固定几个)
- ✅ `status` (success, failure, timeout - 固定几个)
- ✅ `type` (data, alarm, status - 固定几个)

**解决方案:**
- 对于需要按设备统计的场景,使用日志或追踪系统
- 对于 TOP N 设备,使用单独的聚合服务

---

## 测试策略

### 单元测试

```typescript
// test/unit/metrics.service.test.ts

test('should increment counter', () => {
  const counter = metricsService.createCounter({
    name: 'test_counter',
    help: 'Test counter'
  });

  counter.inc();
  expect(counter.get().values[0].value).toBe(1);
});

test('should record histogram', () => {
  const histogram = metricsService.createHistogram({
    name: 'test_histogram',
    help: 'Test histogram',
    buckets: [0.1, 0.5, 1]
  });

  histogram.observe(0.3);
  const metrics = histogram.get();
  expect(metrics.values.find(v => v.labels.le === '0.5').value).toBe(1);
});
```

### 集成测试

```typescript
// test/integration/metrics.test.ts

test('should expose metrics endpoint', async () => {
  const response = await fetch('http://localhost:9010/metrics');
  const text = await response.text();

  expect(response.status).toBe(200);
  expect(text).toContain('# HELP');
  expect(text).toContain('uartserver_');
});

test('should record query metrics', async () => {
  // 执行查询
  await performQuery();

  // 验证指标
  const metrics = await fetchMetrics();
  expect(metrics).toContain('uartserver_query_total');
  expect(metrics).toContain('uartserver_query_duration_seconds');
});
```

### 负载测试

验证指标收集在高负载下的性能影响：

```typescript
// test/performance/metrics-overhead.test.ts

test('metrics overhead < 1%', async () => {
  // 基准测试（无指标）
  const baselineTime = await runBenchmark({ metricsEnabled: false });

  // 带指标测试
  const withMetricsTime = await runBenchmark({ metricsEnabled: true });

  const overhead = (withMetricsTime - baselineTime) / baselineTime;
  expect(overhead).toBeLessThan(0.01); // < 1%
});
```

---

## 文档和培训

### 需要更新的文档

1. **docs/MONITORING_GUIDE.md** (新建)
   - 指标说明和使用指南
   - 常见监控场景
   - 故障排查手册

2. **docs/DEPLOYMENT.md** (更新)
   - Prometheus Server 部署
   - Grafana 配置
   - 告警配置

3. **README.md** (更新)
   - 添加监控相关说明
   - 指标端点文档

4. **docs/API.md** (更新)
   - `/metrics` 端点文档

---

## 时间估算

| 阶段 | 任务 | 预计工时 |
|------|------|----------|
| Phase 1 | 基础设施搭建 | 2-3 小时 |
| Phase 2 | 核心服务指标 | 4-5 小时 |
| Phase 3 | 业务指标集成 | 3-4 小时 |
| Phase 4 | 监控和可视化 | 2-3 小时 |
| **总计** | | **11-15 小时** |

**推荐分配:**
- 第 1 天: Phase 1 + Phase 2 (6-8 小时)
- 第 2 天: Phase 3 + Phase 4 (5-7 小时)

---

## 依赖和风险

### 外部依赖

1. **prom-client** - Node.js Prometheus 客户端库
2. **Prometheus Server** - 指标存储和查询 (需要运维团队部署)
3. **Grafana** - 可视化平台 (需要运维团队部署)

### 风险和缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 指标过多导致性能下降 | 高 | 严格控制标签基数,性能测试验证 |
| Prometheus Server 存储压力 | 中 | 设置合理的保留期,使用联邦集群 |
| 指标命名不规范 | 低 | 代码审查,使用 linter 检查 |
| 指标数据不准确 | 高 | 集成测试覆盖,生产环境验证 |

---

## 下一步行动

### 立即开始 (优先级 P0)

1. ✅ **创建本规划文档** (已完成)
2. ⏳ 安装 `prom-client` 依赖
3. ⏳ 创建 `MetricsService` 基础服务
4. ⏳ 实现 `/metrics` 端点

### 本周完成 (优先级 P1)

- Phase 1: 基础设施搭建
- Phase 2: 核心服务指标（至少 Socket.IO 和 WebSocket）

### 下周完成 (优先级 P2)

- Phase 3: 业务指标集成
- Phase 4: 监控和可视化

---

## 参考资料

1. [Prometheus 最佳实践](https://prometheus.io/docs/practices/naming/)
2. [prom-client 文档](https://github.com/siimon/prom-client)
3. [Node.js 应用监控指南](https://www.robustperception.io/monitoring-nodejs-applications)
4. [Grafana Dashboard 设计指南](https://grafana.com/docs/grafana/latest/dashboards/)

---

**文档版本**: 1.0
**最后更新**: 2025-12-19
**维护者**: Development Team
