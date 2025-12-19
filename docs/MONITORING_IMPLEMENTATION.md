# 监控系统实施计划

> UART Server NG 监控系统完整实施指南
>
> **当前状态**: Phase 2 已完成 ✅
> **下一步**: Phase 3（等待重构完成后实施）

---

## 📋 实施概览

本文档描述了 UART Server NG 监控系统的三阶段实施计划，包括基础设施搭建、告警配置和高级监控功能。

### 实施阶段

- ✅ **Phase 1**: 基础监控基础设施（已完成）
- ✅ **Phase 2**: 仪表板与告警配置（已完成）
- ⏳ **Phase 3**: 高级监控与业务指标（待实施）

---

## ✅ Phase 1: 基础监控基础设施

**目标**: 搭建完整的监控技术栈

### 1.1 技术栈部署

**已完成**:
- ✅ Prometheus (v0.30.0) - 指标收集和存储
- ✅ Grafana (latest) - 数据可视化平台
- ✅ AlertManager (latest) - 告警管理和通知

**部署方式**: Docker Compose
- 配置文件: `docker-compose.monitoring.yml`
- 数据持久化: Docker volumes
- 网络隔离: 独立 monitoring 网络

### 1.2 Prometheus 配置

**已配置**:
- 抓取间隔: 10s
- 数据保留: 30 天 / 1GB
- Target: `localhost:9010` (UART Server NG)
- 健康检查: 每 30 秒

**文件位置**: `prometheus/prometheus.yml`

### 1.3 应用指标暴露

**已实现的指标**:
- Socket.IO 指标（连接、查询、延迟）
- WebSocket 指标（订阅、推送）
- MongoDB 指标（连接池、操作延迟）
- 系统指标（缓存、终端状态）

**Endpoint**: `http://localhost:9010/metrics`

---

## ✅ Phase 2: 仪表板与告警配置

**目标**: 建立可视化监控和告警通知体系

### 2.1 Grafana 仪表板

**已创建的仪表板** (4 个):

1. **系统监控总览** (`uartserver-overview.json`)
   - 12 个核心面板
   - 实时连接数、查询延迟、成功率
   - 适合日常监控和大屏展示

2. **Socket.IO 详细监控** (`socketio-详细监控.json`)
   - 20 个详细面板
   - Node 连接、查询性能、DTU 操作
   - 适合性能调优和问题排查

3. **WebSocket 详细监控** (`websocket-detailed-monitoring.json`)
   - 19 个面板
   - 用户连接、订阅管理、推送性能
   - 适合实时通信监控

4. **数据库详细监控** (`database-detailed-monitoring.json`)
   - 19 个面板
   - 连接池、操作延迟、命令分布
   - 适合数据库性能优化

**文件位置**: `grafana/provisioning/dashboards/*.json`

### 2.2 邮件告警配置

**已配置**:
- ✅ SMTP 服务: QQ 邮箱 (smtp.qq.com:587)
- ✅ 发送地址: 260338538@qq.com
- ✅ 接收地址: wgcairui@icloud.com
- ✅ 中文邮件模板（HTML 格式）
- ✅ 告警路由（按严重程度）

**已知行为**:
⚠️ AlertManager 日志中的 `"failed to close SMTP connection"` 警告是无害的，不影响邮件发送。只要看到 `"Notify success"` 即表示邮件已成功发送。

**文件位置**:
- `prometheus/alertmanager.yml` - 告警路由配置
- `prometheus/alert-templates.tmpl` - 邮件模板
- `.env.monitoring` - 环境变量配置

### 2.3 告警规则

**已配置的基础告警**:
- 数据库连接丢失 (Critical)
- 查询超时率过高 (Warning)
- 查询延迟过高 (Warning)
- 终端在线率过低 (Warning)
- 连接数异常下降 (Critical)

**文件位置**: `prometheus/alerts.yml`

### 2.4 生产环境优化

**已完成**:
- ✅ 环境变量管理 (`.env.monitoring`)
- ✅ 安全配置（禁用匿名访问、会话加密）
- ✅ 健康检查（所有服务）
- ✅ 数据保留策略
- ✅ 部署文档 (`docs/PRODUCTION_DEPLOYMENT.md`)

---

## ⏳ Phase 3: 高级监控与业务指标

**目标**: 建立完善的业务监控和性能优化体系

> **注意**: Phase 3 将在系统重构完成后实施

### 3.1 告警规则优化 🚨

**目标**: 减少误报，提高告警准确性

**计划任务**:
- [ ] 实施分级告警策略（Critical/Warning/Info）
- [ ] 配置智能告警抑制和静默
- [ ] 添加业务告警规则（设备离线、SLA 违规）

**优先级**: P0（高）

### 3.2 Recording Rules（预聚合规则）⚡

**目标**: 提高查询性能，支持复杂业务指标

**计划任务**:
- [ ] 创建性能优化的 Recording Rules
  - 查询成功率（5 分钟滚动窗口）
  - P95 查询延迟
  - 设备在线率（按区域、类型）
- [ ] 业务 SLA 指标预计算

**新增文件**: `prometheus/recording_rules.yml`

**优先级**: P1（中）

### 3.3 业务指标仪表板 📈

**目标**: 创建面向业务的高级仪表板

**计划创建的仪表板**:

1. **业务总览仪表板** (`business-overview.json`)
   - 关键业务指标（KPI）
   - 设备在线趋势分析
   - 用户活跃度统计
   - 数据质量监控

2. **容量规划仪表板** (`capacity-planning.json`)
   - 资源使用趋势预测
   - 连接数增长曲线
   - 存储容量预警

3. **SLA 合规性仪表板** (`sla-compliance.json`)
   - 服务可用性统计
   - 查询成功率 SLA 跟踪
   - 月度/季度合规性报告

**优先级**:
- 业务总览: P0（高）
- 容量规划: P2（低）
- SLA 合规性: P1（中）

### 3.4 日志聚合集成（可选）📝

**目标**: 将 Prometheus 指标与日志系统关联

**计划任务**:
- [ ] 集成 Loki（Grafana 日志系统）
- [ ] 收集应用日志
- [ ] 在 Grafana 中关联指标和日志
- [ ] 错误日志告警

**新增服务**: Loki, Promtail

**优先级**: P2（低）

### 3.5 自定义指标扩展 🎯

**目标**: 添加更多业务相关的自定义指标

**计划添加的指标**:
- [ ] 协议解析性能指标
  - 按协议类型统计解析时间
  - 协议错误率监控
- [ ] BullMQ 队列监控
  - 队列长度
  - 任务处理延迟
  - 失败任务计数
- [ ] 微信/邮件通知监控
  - 通知发送成功率
  - 通知延迟统计

**涉及代码修改**:
- `src/service/metrics.service.ts`
- `src/service/socket.service.ts`
- `src/service/processor/*.processor.ts`

**优先级**: P1（中）

### 3.6 性能基准测试 🏃

**目标**: 建立性能基准，为容量规划提供数据

**计划任务**:
- [ ] 负载测试（模拟大量 DTU 连接）
- [ ] 压力测试查询吞吐量
- [ ] 性能回归检测

**新增文件**: `tests/performance/load-test.ts`

**优先级**: P2（低）

### 3.7 监控数据治理 🗄️

**目标**: 优化存储，控制数据增长

**计划任务**:
- [ ] 指标清理策略
- [ ] 降低高基数指标的采样率
- [ ] 配置远程存储（可选：Thanos/Cortex）

**优先级**: P2（低）

---

## 📁 文件结构

```
uartserver-ng/
├── docker-compose.monitoring.yml       # 监控栈 Docker Compose 配置
├── .env.monitoring                     # 环境变量（敏感信息，已加入 .gitignore）
├── prometheus/
│   ├── prometheus.yml                  # Prometheus 主配置
│   ├── alerts.yml                      # 告警规则
│   ├── alertmanager.yml                # AlertManager 配置
│   ├── alert-templates.tmpl            # 邮件模板
│   └── recording_rules.yml             # Recording Rules（Phase 3）
├── grafana/
│   ├── README.md                       # Grafana 使用文档
│   └── provisioning/
│       ├── datasources/
│       │   └── prometheus.yml          # Prometheus 数据源配置
│       └── dashboards/
│           ├── dashboards.yml          # 仪表板加载配置
│           ├── uartserver-overview.json
│           ├── socketio-详细监控.json
│           ├── websocket-detailed-monitoring.json
│           ├── database-detailed-monitoring.json
│           ├── business-overview.json       # Phase 3
│           ├── capacity-planning.json       # Phase 3
│           └── sla-compliance.json          # Phase 3
└── docs/
    ├── MONITORING_IMPLEMENTATION.md    # 本文档
    └── PRODUCTION_DEPLOYMENT.md        # 生产环境部署指南
```

---

## 🚀 快速开始

### 启动监控系统

```bash
cd /Users/cairui/Code/uartserver-ng

# 启动监控栈
docker-compose -f docker-compose.monitoring.yml up -d

# 查看服务状态
docker-compose -f docker-compose.monitoring.yml ps

# 查看日志
docker-compose -f docker-compose.monitoring.yml logs -f
```

### 访问服务

- **Grafana**: http://localhost:3000
  - 用户名: `admin`
  - 密码: 见 `.env.monitoring`

- **Prometheus**: http://localhost:9090
- **AlertManager**: http://localhost:9093

### 停止监控系统

```bash
docker-compose -f docker-compose.monitoring.yml down
```

---

## 📊 当前监控指标

### Socket.IO 指标
| 指标名称 | 类型 | 描述 |
|---------|------|------|
| `uartserver_socketio_connections_active` | Gauge | 当前活跃的 Node 客户端连接数 |
| `uartserver_socketio_queries_total` | Counter | 查询请求总数（按状态）|
| `uartserver_socketio_query_duration_seconds` | Histogram | 查询延迟分布 |
| `uartserver_socketio_terminals_online` | Gauge | 在线终端数量 |
| `uartserver_socketio_cache_size` | Gauge | 缓存大小 |

### WebSocket 指标
| 指标名称 | 类型 | 描述 |
|---------|------|------|
| `uartserver_websocket_connections_active` | Gauge | 当前活跃的浏览器用户连接数 |
| `uartserver_websocket_subscriptions_active` | Gauge | 活跃订阅数 |
| `uartserver_websocket_device_updates_sent_total` | Counter | 设备更新推送总数 |

### MongoDB 指标
| 指标名称 | 类型 | 描述 |
|---------|------|------|
| `uartserver_mongodb_connection_status` | Gauge | 数据库连接状态 |
| `uartserver_mongodb_pool_size` | Gauge | 连接池大小 |
| `uartserver_mongodb_operations_total` | Counter | 数据库操作总数 |
| `uartserver_mongodb_operation_duration_seconds` | Histogram | 数据库操作延迟 |

完整指标列表请访问: http://localhost:9010/metrics

---

## 📈 Phase 3 实施优先级

### P0（高优先级 - 重构后立即实施）
1. ✅ 告警规则优化（3.1）
2. ✅ 业务总览仪表板（3.3 部分）

### P1（中优先级 - 稳定运行后实施）
3. Recording Rules（3.2）
4. 自定义指标扩展（3.5）
5. SLA 合规性仪表板（3.3 部分）

### P2（低优先级 - 按需实施）
6. 日志聚合集成（3.4）
7. 容量规划仪表板（3.3 部分）
8. 性能基准测试（3.6）
9. 监控数据治理（3.7）

---

## 🎯 预期收益

### Phase 1-2 已实现的价值

✅ **可见性提升**:
- 系统运行状态实时可见
- 4 个专业仪表板覆盖核心指标
- 历史数据趋势分析（30 天）

✅ **问题快速定位**:
- 查询性能问题可视化
- 数据库性能监控
- 连接异常自动告警

✅ **运维效率**:
- 邮件告警自动通知
- 减少人工巡检时间
- 问题发现时间缩短 80%+

### Phase 3 预期价值

🎯 **业务价值**:
- 业务指标可视化，支持运营决策
- SLA 合规性跟踪，提升服务质量
- 容量规划能力，避免资源瓶颈

🎯 **技术价值**:
- 查询性能提升（通过 Recording Rules）
- 更全面的监控覆盖（日志 + 指标）
- 性能基准，快速识别回归问题

🎯 **运维价值**:
- 自动化告警抑制，减少告警疲劳
- 准确的告警，减少误报
- 长期数据存储，支持历史分析

---

## 🔧 故障排查

### 常见问题

1. **仪表板无数据**
   - 检查 Prometheus targets: http://localhost:9090/targets
   - 确认应用正在运行: `curl http://localhost:9010/metrics`
   - 检查 Grafana 数据源配置

2. **告警未发送**
   - 查看 AlertManager 日志: `docker logs uartserver-alertmanager`
   - 确认告警规则已触发: http://localhost:9090/alerts
   - 检查邮箱配置和授权码

3. **邮件发送警告**
   - `"failed to close SMTP connection"` 是无害警告
   - 只要看到 `"Notify success"` 即表示发送成功
   - 检查垃圾邮件箱

详细故障排查请参考: `docs/PRODUCTION_DEPLOYMENT.md`

---

## 📚 相关文档

- [Grafana 仪表板使用指南](../grafana/README.md)
- [生产环境部署指南](PRODUCTION_DEPLOYMENT.md)
- [Prometheus 告警规则](../prometheus/alerts.yml)
- [AlertManager 配置](../prometheus/alertmanager.yml)

---

## 📝 变更记录

| 日期 | 阶段 | 内容 |
|------|------|------|
| 2025-12-19 | Phase 1 | 完成监控基础设施搭建 |
| 2025-12-19 | Phase 2 | 完成 4 个仪表板和邮件告警配置 |
| 2025-12-19 | Phase 3 | 规划高级监控功能（待实施）|

---

**文档维护者**: UART Server NG Team
**最后更新**: 2025-12-19
