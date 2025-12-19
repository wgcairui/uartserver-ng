# Grafana 监控仪表板

这个目录包含了 UART Server NG 的 Grafana 监控仪表板配置。

> 📖 **完整监控系统文档**: [监控系统实施计划](../docs/MONITORING_IMPLEMENTATION.md)
>
> 当前状态：**Phase 2 已完成** ✅ | 下一步：**Phase 3**（等待重构完成）

## 仪表板列表

### 1. 系统监控总览 (`uartserver-overview.json`)
**概述:** 全面展示系统核心指标的综合仪表板

**包含面板:**
- ✅ 实时连接数（Socket.IO + WebSocket）
- ✅ 数据库连接状态
- ✅ 终端状态（在线/注册）
- ✅ Socket.IO 查询延迟（P95/P99）
- ✅ 查询请求速率（成功/超时/错误）
- ✅ WebSocket 订阅统计
- ✅ 设备更新推送速率
- ✅ MongoDB 连接池监控
- ✅ MongoDB 操作延迟
- ✅ Socket.IO 缓存大小
- ✅ 系统成功率指标

**适用场景:** 快速查看系统整体健康状况，适合日常监控和大屏展示

### 2. Socket.IO 详细监控 (`socketio-详细监控.json`)
**概述:** 深入监控 Node 客户端（DTU 设备）连接和查询性能

**包含面板:**
- ✅ 当前 Node 连接数
- ✅ 终端在线率
- ✅ 累计连接/断开统计
- ✅ 指令超时和告警计数
- ✅ 断开连接原因分布（饼图）
- ✅ 查询延迟百分位数（P50/P95/P99）
- ✅ 查询请求 QPS（按状态堆叠）
- ✅ DTU 操作延迟（按操作类型）
- ✅ DTU 操作速率
- ✅ 缓存大小趋势

**适用场景:** 排查设备连接问题、分析查询性能、监控 DTU 操作

## 快速开始

### 方式一：使用 Docker Compose（推荐）

1. **启动监控栈（Prometheus + Grafana）:**
```bash
cd /Users/cairui/Code/uartserver-ng
docker-compose -f docker-compose.monitoring.yml up -d
```

2. **访问 Grafana:**
- URL: http://localhost:3000
- 默认用户名: `admin`
- 默认密码: `admin`（首次登录会要求修改）

3. **仪表板会自动加载**，无需手动导入

4. **停止监控栈:**
```bash
docker-compose -f docker-compose.monitoring.yml down
```

### 方式二：手动导入

如果你已经有运行中的 Grafana 实例：

1. **登录 Grafana**
2. **导入仪表板:**
   - 点击左侧菜单 "+" → "Import"
   - 上传 JSON 文件或粘贴 JSON 内容
   - 选择 Prometheus 数据源
   - 点击 "Import"

3. **配置 Prometheus 数据源:**
   - 进入 Configuration → Data Sources
   - 添加 Prometheus 数据源
   - URL: `http://localhost:9090`（如果 Prometheus 在同一台机器）
   - 点击 "Save & Test"

## Prometheus 配置

确保你的 Prometheus 配置文件包含以下 scrape 配置：

```yaml
scrape_configs:
  - job_name: 'uartserver-ng'
    scrape_interval: 10s
    static_configs:
      - targets: ['localhost:9010']
        labels:
          app: 'uartserver-ng'
          environment: 'production'
```

## 指标说明

### Socket.IO 指标
| 指标名称 | 类型 | 描述 |
|---------|------|------|
| `uartserver_socketio_connections_active` | Gauge | 当前活跃的 Node 客户端连接数 |
| `uartserver_socketio_queries_total` | Counter | 查询请求总数（按状态：success/timeout/error）|
| `uartserver_socketio_query_duration_seconds` | Histogram | 查询延迟分布 |
| `uartserver_socketio_terminals_online` | Gauge | 在线终端数量 |
| `uartserver_socketio_cache_size` | Gauge | 缓存大小（按类型：nodes/terminals/protocols）|

### WebSocket 指标
| 指标名称 | 类型 | 描述 |
|---------|------|------|
| `uartserver_websocket_connections_active` | Gauge | 当前活跃的浏览器用户连接数 |
| `uartserver_websocket_subscriptions_active` | Gauge | 活跃订阅数 |
| `uartserver_websocket_rooms_active` | Gauge | 活跃房间数 |
| `uartserver_websocket_device_updates_sent_total` | Counter | 设备更新推送总数 |

### Database 指标
| 指标名称 | 类型 | 描述 |
|---------|------|------|
| `uartserver_mongodb_connection_status` | Gauge | 数据库连接状态（0=断开，1=连接）|
| `uartserver_mongodb_pool_size` | Gauge | 连接池大小 |
| `uartserver_mongodb_operations_total` | Counter | 数据库操作总数（按命令类型）|
| `uartserver_mongodb_operation_duration_seconds` | Histogram | 数据库操作延迟 |

## 告警规则建议

以下是一些推荐的 Prometheus 告警规则：

```yaml
groups:
  - name: uartserver_alerts
    rules:
      # 数据库连接丢失
      - alert: DatabaseDisconnected
        expr: uartserver_mongodb_connection_status == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "数据库连接断开"
          description: "MongoDB 连接已断开超过 1 分钟"

      # 查询超时率过高
      - alert: HighQueryTimeoutRate
        expr: |
          rate(uartserver_socketio_queries_total{status="timeout"}[5m])
          /
          rate(uartserver_socketio_queries_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "查询超时率过高"
          description: "过去 5 分钟查询超时率超过 10%"

      # 查询延迟过高
      - alert: HighQueryLatency
        expr: |
          histogram_quantile(0.95,
            sum(rate(uartserver_socketio_query_duration_seconds_bucket[5m])) by (le)
          ) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "查询延迟过高"
          description: "P95 查询延迟超过 2 秒"

      # 终端在线率过低
      - alert: LowTerminalOnlineRate
        expr: |
          uartserver_socketio_terminals_online
          /
          uartserver_socketio_terminals_registered_total < 0.5
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "终端在线率过低"
          description: "终端在线率低于 50%"

      # 连接数异常下降
      - alert: ConnectionsDrop
        expr: |
          (
            uartserver_socketio_connections_active
            <
            avg_over_time(uartserver_socketio_connections_active[1h]) * 0.5
          )
          and
          (
            avg_over_time(uartserver_socketio_connections_active[1h]) > 0
          )
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "连接数异常下降"
          description: "当前连接数比过去 1 小时平均值低 50%"
```

## 自定义仪表板

你可以基于现有仪表板创建自定义版本：

1. **克隆现有仪表板:**
   - 打开仪表板
   - 点击右上角设置图标 → "Save as..."
   - 输入新名称

2. **添加新面板:**
   - 点击 "Add panel"
   - 选择可视化类型（时间序列、仪表盘、饼图等）
   - 编写 PromQL 查询
   - 配置面板选项

3. **常用 PromQL 查询示例:**

```promql
# 计算错误率
sum(rate(uartserver_socketio_queries_total{status!="success"}[5m]))
/
sum(rate(uartserver_socketio_queries_total[5m]))

# 计算平均缓存大小
avg(uartserver_socketio_cache_size)

# 按操作类型统计 DTU 操作
sum by (operation) (rate(uartserver_socketio_dtu_operations_total[1m]))

# 计算 WebSocket 推送失败率
rate(uartserver_websocket_push_failures_total[1m])
/
(
  rate(uartserver_websocket_device_updates_sent_total[1m]) +
  rate(uartserver_websocket_batch_device_updates_sent_total[1m])
)
```

## 故障排查

### 仪表板无数据显示

1. **检查 Prometheus 是否正在抓取数据:**
   - 访问 `http://localhost:9090/targets`
   - 确认 `uartserver-ng` target 状态为 "UP"

2. **检查时间范围:**
   - 确保仪表板时间范围设置正确（建议：Last 1 hour）

3. **检查数据源配置:**
   - Configuration → Data Sources
   - 测试 Prometheus 连接

### 指标缺失

1. **确认应用正在运行:**
```bash
curl http://localhost:9010/metrics | grep uartserver
```

2. **检查应用日志是否有错误**

3. **验证指标名称是否正确**

## 性能优化建议

1. **降低抓取频率:** 如果 Prometheus 性能有问题，可以将 `scrape_interval` 从 10s 增加到 30s

2. **使用 Recording Rules:** 对于复杂的 PromQL 查询，可以配置 recording rules 预计算结果

3. **限制时间范围:** 避免查询过长的时间范围（建议不超过 7 天）

4. **使用变量:** 利用 Grafana 变量功能过滤特定实例或环境

## 许可证

这些仪表板配置文件遵循项目主许可证。

## 🚀 下一步计划 (Phase 3)

Phase 3 将在系统重构完成后实施，包括：

### 高优先级 (P0)
- 📊 **业务总览仪表板** - 关键业务指标和 KPI
- 🚨 **告警规则优化** - 减少误报，提高准确性

### 中优先级 (P1)
- ⚡ **Recording Rules** - 预聚合提升查询性能
- 🎯 **自定义指标扩展** - 协议解析、队列监控
- 📈 **SLA 合规性仪表板** - 服务质量跟踪

### 低优先级 (P2)
- 📝 **日志聚合集成** - Loki 日志系统
- 📊 **容量规划仪表板** - 资源趋势预测
- 🏃 **性能基准测试** - 负载测试和回归检测

详细计划请参考: [监控系统实施计划 - Phase 3](../docs/MONITORING_IMPLEMENTATION.md#-phase-3-高级监控与业务指标)

---

## 贡献

欢迎提交改进建议和新的仪表板配置！
