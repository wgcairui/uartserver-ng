# UART Server NG - 监控系统完整指南

这份文档详细说明了如何部署和使用 UART Server NG 的 Prometheus + Grafana 监控系统。

## 目录

- [系统架构](#系统架构)
- [快速开始](#快速开始)
- [监控指标说明](#监控指标说明)
- [Grafana 仪表板](#grafana-仪表板)
- [告警配置](#告警配置)
- [故障排查](#故障排查)
- [最佳实践](#最佳实践)

## 系统架构

```
┌─────────────────┐
│ UART Server NG  │ :9010/metrics
└────────┬────────┘
         │ (scrape)
         ▼
    ┌────────────┐      ┌──────────────┐
    │ Prometheus │─────▶│ AlertManager │ (告警通知)
    └─────┬──────┘      └──────────────┘
          │ (query)
          ▼
     ┌─────────┐
     │ Grafana │ :3000 (可视化)
     └─────────┘
```

**组件说明:**
- **UART Server NG**: 暴露 `/metrics` 端点提供 Prometheus 格式的指标
- **Prometheus**: 时序数据库，定期抓取指标数据
- **Grafana**: 可视化平台，展示监控仪表板
- **AlertManager**: 告警管理，处理告警路由和通知

## 快速开始

### 前置条件

- Docker 和 Docker Compose 已安装
- UART Server NG 应用正在运行在 `localhost:9010`

### 一键启动监控栈

```bash
# 1. 进入项目目录
cd /Users/cairui/Code/uartserver-ng

# 2. 启动监控服务（Prometheus + Grafana + AlertManager）
docker-compose -f docker-compose.monitoring.yml up -d

# 3. 检查服务状态
docker-compose -f docker-compose.monitoring.yml ps

# 应该看到三个服务都是 Up 状态
```

### 访问监控服务

启动成功后，可以访问以下地址：

| 服务 | 地址 | 默认凭据 | 说明 |
|------|------|----------|------|
| **Grafana** | http://localhost:3000 | admin / admin | 监控仪表板 |
| **Prometheus** | http://localhost:9090 | 无需认证 | 指标查询 |
| **AlertManager** | http://localhost:9093 | 无需认证 | 告警管理 |
| **UART Server** | http://localhost:9010/metrics | 无需认证 | 原始指标 |

### 首次登录 Grafana

1. 访问 http://localhost:3000
2. 输入默认凭据：
   - 用户名: `admin`
   - 密码: `admin`
3. 首次登录会要求修改密码
4. 仪表板会自动加载，可以在左侧菜单 "Dashboards" 中找到

## 监控指标说明

### 指标分类

系统提供 **51+ 个自定义业务指标**，分为三大类：

#### 1. Socket.IO 服务指标 (21 个)

监控 Node 客户端（DTU 设备）的连接和查询性能。

**核心指标:**
```promql
# 当前活跃连接数
uartserver_socketio_connections_active

# 查询延迟 P95
histogram_quantile(0.95,
  sum(rate(uartserver_socketio_query_duration_seconds_bucket[5m])) by (le)
)

# 查询成功率
sum(rate(uartserver_socketio_queries_total{status="success"}[5m]))
/
sum(rate(uartserver_socketio_queries_total[5m])) * 100

# 终端在线率
uartserver_socketio_terminals_online
/
uartserver_socketio_terminals_registered_total * 100
```

**详细指标列表:**
- `uartserver_socketio_connections_active` - 活跃连接数
- `uartserver_socketio_queries_total{status}` - 查询总数（按状态）
- `uartserver_socketio_query_duration_seconds` - 查询延迟
- `uartserver_socketio_dtu_operations_total{operation}` - DTU 操作总数
- `uartserver_socketio_terminals_online` - 在线终端数
- `uartserver_socketio_cache_size{cache_type}` - 缓存大小

#### 2. WebSocket 服务指标 (15 个)

监控浏览器用户的连接、订阅和推送性能。

**核心指标:**
```promql
# 当前活跃用户连接数
uartserver_websocket_connections_active

# 订阅房间数
uartserver_websocket_rooms_active

# 推送成功率
(
  rate(uartserver_websocket_device_updates_sent_total[5m]) +
  rate(uartserver_websocket_batch_device_updates_sent_total[5m])
)
/
(
  rate(uartserver_websocket_device_updates_sent_total[5m]) +
  rate(uartserver_websocket_batch_device_updates_sent_total[5m]) +
  rate(uartserver_websocket_push_failures_total[5m])
) * 100
```

**详细指标列表:**
- `uartserver_websocket_connections_active` - 活跃连接数
- `uartserver_websocket_subscriptions_active` - 活跃订阅数
- `uartserver_websocket_rooms_active` - 活跃房间数
- `uartserver_websocket_device_updates_sent_total` - 设备更新推送总数
- `uartserver_websocket_push_failures_total` - 推送失败总数

#### 3. Database 服务指标 (15 个)

监控 MongoDB 连接、操作性能和健康状况。

**核心指标:**
```promql
# 数据库连接状态（0=断开，1=连接）
uartserver_mongodb_connection_status

# 数据库操作延迟 P95
histogram_quantile(0.95,
  sum(rate(uartserver_mongodb_operation_duration_seconds_bucket[5m])) by (le, command)
)

# 连接池使用率
(uartserver_mongodb_connections_created_total - uartserver_mongodb_connections_closed_total)
/
uartserver_mongodb_pool_size * 100
```

**详细指标列表:**
- `uartserver_mongodb_connection_status` - 连接状态
- `uartserver_mongodb_operations_total{command}` - 操作总数（按命令类型）
- `uartserver_mongodb_operation_duration_seconds` - 操作延迟
- `uartserver_mongodb_pool_size` - 连接池大小
- `uartserver_mongodb_health_check_success_total` - 健康检查成功总数

### 指标命名规范

所有指标遵循以下命名规范：

```
uartserver_<service>_<metric>_<unit>
```

- `uartserver`: 命名空间前缀
- `<service>`: 服务类型（socketio, websocket, mongodb）
- `<metric>`: 指标名称
- `<unit>`: 单位（total, seconds, bytes 等）

**示例:**
- `uartserver_socketio_query_duration_seconds` - Socket.IO 查询延迟（秒）
- `uartserver_websocket_connections_active` - WebSocket 活跃连接数
- `uartserver_mongodb_operations_total` - MongoDB 操作总数

## Grafana 仪表板

### 1. 系统监控总览

**文件:** `grafana/dashboards/uartserver-overview.json`
**UID:** `uartserver-overview`

**功能:**
- 📊 全局系统健康状况一览
- 🔌 实时连接数监控
- ⚡ 性能指标汇总
- 📈 关键业务指标趋势

**适用场景:**
- 日常运维监控
- 大屏展示
- 快速定位问题

**包含的面板:**
1. 实时连接数（Socket.IO + WebSocket）
2. 数据库连接状态
3. 终端状态统计
4. Socket.IO 查询延迟
5. 查询请求速率
6. WebSocket 订阅统计
7. 设备更新推送速率
8. MongoDB 连接池
9. MongoDB 操作延迟
10. Socket.IO 缓存大小
11. 系统成功率

### 2. Socket.IO 详细监控

**文件:** `grafana/dashboards/socketio-detailed-monitoring.json`
**UID:** `socketio-detailed`

**功能:**
- 🔍 深入分析 Node 客户端连接
- 📉 查询性能详细统计
- 🎯 DTU 操作监控
- 💾 缓存使用情况

**适用场景:**
- 排查设备连接问题
- 分析查询性能瓶颈
- 监控 DTU 操作状态

**包含的面板:**
1. 当前 Node 连接数（仪表盘）
2. 终端在线率（仪表盘）
3. 累计连接/断开统计
4. 指令超时计数
5. 告警事件统计
6. 断开连接原因分布（饼图）
7. 查询延迟百分位数（P50/P95/P99）
8. 查询请求速率（按状态堆叠图）
9. DTU 操作延迟（按类型）
10. DTU 操作速率
11. 缓存大小趋势

### 常用查询示例

```promql
# 1. 计算查询成功率（5 分钟内）
sum(rate(uartserver_socketio_queries_total{status="success"}[5m]))
/
sum(rate(uartserver_socketio_queries_total[5m])) * 100

# 2. 查询错误率
sum(rate(uartserver_socketio_queries_total{status=~"timeout|error"}[5m]))
/
sum(rate(uartserver_socketio_queries_total[5m])) * 100

# 3. 按缓存类型统计大小
sum by (cache_type) (uartserver_socketio_cache_size)

# 4. WebSocket 推送失败率
rate(uartserver_websocket_push_failures_total[5m])
/
(
  rate(uartserver_websocket_device_updates_sent_total[5m]) +
  rate(uartserver_websocket_batch_device_updates_sent_total[5m])
)

# 5. 数据库操作延迟 P99（按命令类型）
histogram_quantile(0.99,
  sum(rate(uartserver_mongodb_operation_duration_seconds_bucket[5m])) by (le, command)
)
```

## 告警配置

### 告警规则

系统预配置了 **20+ 条告警规则**，涵盖：

#### 1. 服务可用性告警
- `ServiceDown` - 服务不可用
- `DatabaseDisconnected` - 数据库连接断开

#### 2. 性能告警
- `HighQueryLatency` - 查询延迟过高（P95 > 2s）
- `HighQueryTimeoutRate` - 查询超时率过高（> 10%）
- `HighDatabaseLatency` - 数据库延迟过高（P95 > 1s）

#### 3. 错误率告警
- `HighQueryErrorRate` - 查询错误率过高（> 5%）
- `HighWebSocketPushFailureRate` - 推送失败率过高（> 5%）
- `HighAuthenticationFailureRate` - 认证失败率过高（> 10%）

#### 4. 资源使用告警
- `HighConnectionCount` - 连接数过高（> 1000）
- `HighCacheSize` - 缓存过大（可能内存泄漏）
- `LowTerminalOnlineRate` - 终端在线率过低（< 30%）

#### 5. 异常检测
- `ConnectionsDrop` - 连接数异常下降（低于 1 小时平均值 50%）
- `SuddenQuerySpike` - 查询量突增（高于 1 小时平均值 3 倍）

### 配置告警通知

编辑 `prometheus/alertmanager.yml` 配置告警接收器：

**1. 邮件通知:**
```yaml
receivers:
  - name: 'critical-alerts'
    email_configs:
      - to: 'ops-team@example.com'
        from: 'alertmanager@example.com'
        smarthost: 'smtp.example.com:587'
        auth_username: 'alertmanager@example.com'
        auth_password: 'password'
        headers:
          Subject: '【紧急】UART Server NG - {{ .GroupLabels.alertname }}'
```

**2. 企业微信通知:**
```yaml
receivers:
  - name: 'critical-alerts'
    wechat_configs:
      - corp_id: 'your_corp_id'
        api_url: 'https://qyapi.weixin.qq.com/cgi-bin/'
        api_secret: 'your_secret'
        to_user: '@all'
        agent_id: 'your_agent_id'
```

**3. Webhook 通知:**
```yaml
receivers:
  - name: 'critical-alerts'
    webhook_configs:
      - url: 'http://your-webhook-server/alerts'
        send_resolved: true
```

### 测试告警

```bash
# 1. 查看当前告警状态
curl http://localhost:9090/api/v1/alerts

# 2. 查看 AlertManager 告警
curl http://localhost:9093/api/v1/alerts

# 3. 手动触发测试告警
curl -X POST http://localhost:9093/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '[{
    "labels": {"alertname":"TestAlert","severity":"critical"},
    "annotations": {"summary":"This is a test alert"}
  }]'
```

## 故障排查

### 问题：仪表板无数据

**可能原因和解决方案:**

1. **Prometheus 未抓取到数据**
```bash
# 检查 Prometheus targets 状态
curl http://localhost:9090/api/v1/targets

# 应该看到 uartserver-ng 的状态为 UP
# 如果是 DOWN，检查：
# - UART Server 是否在运行
# - 端口 9010 是否可访问
# - Docker 网络配置是否正确
```

2. **时间范围设置错误**
- 检查 Grafana 右上角时间选择器
- 建议设置为 "Last 1 hour" 或 "Last 6 hours"

3. **数据源配置错误**
```bash
# 在 Grafana 中测试数据源连接
# Configuration -> Data Sources -> Prometheus -> Save & Test
```

### 问题：指标缺失

```bash
# 1. 检查应用是否暴露指标
curl http://localhost:9010/metrics | grep uartserver

# 2. 检查 Prometheus 是否存储了指标
curl 'http://localhost:9090/api/v1/query?query=uartserver_socketio_connections_active'

# 3. 查看 Prometheus 日志
docker logs uartserver-prometheus
```

### 问题：告警未触发

1. **检查告警规则状态**
```bash
# 访问 Prometheus 查看规则
http://localhost:9090/alerts

# 或使用 API
curl http://localhost:9090/api/v1/rules
```

2. **检查 AlertManager 配置**
```bash
# 查看 AlertManager 日志
docker logs uartserver-alertmanager

# 测试 AlertManager 配置
docker exec uartserver-alertmanager amtool check-config /etc/alertmanager/alertmanager.yml
```

### 问题：Docker 容器无法启动

```bash
# 1. 查看容器日志
docker-compose -f docker-compose.monitoring.yml logs

# 2. 检查端口占用
lsof -i :3000  # Grafana
lsof -i :9090  # Prometheus
lsof -i :9093  # AlertManager

# 3. 重新启动服务
docker-compose -f docker-compose.monitoring.yml restart
```

## 最佳实践

### 1. 监控策略

**关注核心指标:**
- ✅ 服务可用性（`up{job="uartserver-ng"}`）
- ✅ 查询成功率（> 95%）
- ✅ 查询延迟 P95（< 1s）
- ✅ 终端在线率（> 80%）
- ✅ 数据库连接状态

**设置合理的告警阈值:**
- 根据业务 SLA 设置阈值
- 避免告警疲劳（太多误报）
- 使用分级告警（critical/warning/info）

### 2. 性能优化

**Prometheus 优化:**
```yaml
# prometheus.yml
global:
  scrape_interval: 15s  # 降低抓取频率
  evaluation_interval: 15s

# 使用 recording rules 预计算复杂查询
rule_files:
  - 'recording_rules.yml'
```

**Grafana 优化:**
- 限制查询时间范围（建议 < 7 天）
- 使用变量过滤（$instance, $environment）
- 启用查询缓存

### 3. 数据保留

**Prometheus 数据保留策略:**
```bash
# docker-compose.monitoring.yml
command:
  - '--storage.tsdb.retention.time=30d'  # 保留 30 天
  - '--storage.tsdb.retention.size=50GB' # 或 50GB
```

**长期存储方案:**
- 使用 Thanos 或 VictoriaMetrics 进行长期存储
- 配置 `remote_write` 将数据写入远程存储

### 4. 安全加固

**启用认证:**
```yaml
# prometheus.yml
basic_auth_users:
  admin: $2y$10$...  # bcrypt hash
```

**配置 HTTPS:**
```yaml
# prometheus.yml
tls_server_config:
  cert_file: /etc/prometheus/server.crt
  key_file: /etc/prometheus/server.key
```

**网络隔离:**
- 使用 Docker 网络隔离监控服务
- 限制 Prometheus 和 Grafana 的访问 IP

### 5. 备份和恢复

**备份 Grafana 配置:**
```bash
# 备份 Grafana 数据库
docker exec uartserver-grafana \
  sqlite3 /var/lib/grafana/grafana.db ".backup '/tmp/grafana.db'"

docker cp uartserver-grafana:/tmp/grafana.db ./backup/
```

**备份 Prometheus 数据:**
```bash
# 创建快照
curl -X POST http://localhost:9090/api/v1/admin/tsdb/snapshot

# 备份数据目录
docker run --rm -v uartserver-prometheus-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/prometheus-data.tar.gz /data
```

## 生产环境部署建议

### 1. 资源规划

**最小配置:**
- CPU: 2 核
- 内存: 4GB
- 磁盘: 50GB SSD

**推荐配置:**
- CPU: 4 核
- 内存: 8GB
- 磁盘: 100GB SSD

### 2. 高可用部署

使用 Prometheus 联邦集群:
```yaml
# prometheus-primary.yml
scrape_configs:
  - job_name: 'federate'
    honor_labels: true
    metrics_path: '/federate'
    params:
      'match[]':
        - '{job="uartserver-ng"}'
    static_configs:
      - targets:
          - 'prometheus-secondary:9090'
```

### 3. 监控 Prometheus 自身

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
```

## 相关资源

- [Prometheus 官方文档](https://prometheus.io/docs/)
- [Grafana 官方文档](https://grafana.com/docs/)
- [PromQL 查询语言](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [AlertManager 配置](https://prometheus.io/docs/alerting/latest/configuration/)

## 许可证

本监控系统配置遵循项目主许可证。
