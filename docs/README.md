# uartserver-ng 文档中心

**项目**: IoT UART 服务器 (Fastify + TypeScript 重构版)
**文档版本**: 2.0
**最后更新**: 2025-12-19

---

## 📚 文档导航

### 🚀 快速开始

| 文档 | 说明 | 重要性 |
|------|------|--------|
| [../CLAUDE.md](../CLAUDE.md) | **项目工作指南** - 开发规范、架构模式、常见陷阱 | ⭐⭐⭐ |
| [VALIDATION_DECORATOR.md](./VALIDATION_DECORATOR.md) | **Zod 验证装饰器完整指南** - API 参数验证最佳实践 | ⭐⭐⭐ |

### 🏗️ 架构设计

| 文档 | 说明 | 状态 |
|------|------|------|
| [DATABASE_ARCHITECTURE.md](./DATABASE_ARCHITECTURE.md) | MongoDB + PostgreSQL 双数据库架构设计 | ✅ 最新 |
| [DATABASE_STRATEGY.md](./DATABASE_STRATEGY.md) | 数据库选型策略和设计原则 | ✅ 稳定 |
| [DDD_REFACTORING_REPORT.md](./DDD_REFACTORING_REPORT.md) | 领域驱动设计重构报告 | 📝 参考 |
| [migration/01-架构设计文档.md](./migration/01-架构设计文档.md) | 迁移架构设计 (从 Midway.js 到 Fastify) | 📝 历史 |
| [migration/08-技术细节和设计模式.md](./migration/08-技术细节和设计模式.md) | 技术细节和设计模式说明 | 📝 参考 |

### 📡 API 文档

| 文档 | 说明 | 状态 |
|------|------|------|
| [API_ALARM_RULES.md](./API_ALARM_RULES.md) | **告警规则管理 API** - 完整的 RESTful API 参考 | ✅ 最新 |

> 💡 **提示**: 其他 API 文档待补充。参考 `API_ALARM_RULES.md` 的格式创建新的 API 文档。

### 🔧 服务层

| 文档 | 说明 | 状态 |
|------|------|------|
| [SERVICE_LAYER_INTEGRATION.md](./SERVICE_LAYER_INTEGRATION.md) | **服务层 MongoDB 集成** - AlarmRuleEngine 和 AlarmNotification | ✅ 最新 |

### 📈 开发进度

| 文档 | 说明 | 阶段 |
|------|------|------|
| [PHASE_3_PLAN.md](./PHASE_3_PLAN.md) | **Phase 3 开发计划** - 告警规则引擎和通知系统 | 🚧 进行中 |
| [PHASE_3_SCAFFOLDING.md](./PHASE_3_SCAFFOLDING.md) | Phase 3 脚手架实现记录 | ✅ 完成 |
| [PHASE_2_PLAN.md](./PHASE_2_PLAN.md) | Phase 2 开发计划 - 实体层和仓储层 | ✅ 完成 |
| [PHASE_2_CHECKLIST.md](./PHASE_2_CHECKLIST.md) | Phase 2 检查清单 | ✅ 完成 |
| [PHASE_2.10_STATUS_REPORT.md](./PHASE_2.10_STATUS_REPORT.md) | Phase 2.10 状态报告 | ✅ 完成 |
| [PHASE_2.9_COMPLETION_REPORT.md](./PHASE_2.9_COMPLETION_REPORT.md) | Phase 2.9 完成报告 | ✅ 完成 |
| [PHASE_2.8_COMPLETION_REPORT.md](./PHASE_2.8_COMPLETION_REPORT.md) | Phase 2.8 完成报告 | ✅ 完成 |
| [PHASE_2.7_COMPLETION_REPORT.md](./PHASE_2.7_COMPLETION_REPORT.md) | Phase 2.7 完成报告 | ✅ 完成 |
| [NEXT_PHASE_PLAN.md](./NEXT_PHASE_PLAN.md) | 下一阶段计划 | 📝 规划中 |
| [NEXT_STEPS.md](./NEXT_STEPS.md) | 后续步骤 | 📝 规划中 |
| [TASK_PRIORITIES.md](./TASK_PRIORITIES.md) | 任务优先级 | 📝 参考 |

### 🚀 迁移指南

| 文档 | 说明 | 状态 |
|------|------|------|
| [migration/README.md](./migration/README.md) | 迁移文档总索引 | 📝 参考 |
| [migration/02-实施进度.md](./migration/02-实施进度.md) | 迁移实施进度跟踪 | 📝 历史 |
| [migration/03-代码示例文档.md](./migration/03-代码示例文档.md) | 迁移代码示例 | 📝 参考 |
| [migration/04-部署运维文档.md](./migration/04-部署运维文档.md) | 部署和运维指南 | 📝 待更新 |
| [migration/05-测试方案文档.md](./migration/05-测试方案文档.md) | 测试方案 | 📝 待更新 |
| [migration/07-FAQ和故障排查.md](./migration/07-FAQ和故障排查.md) | FAQ 和故障排查 | 📝 参考 |
| [migration/09-MongoDB索引设计.md](./migration/09-MongoDB索引设计.md) | MongoDB 索引设计详解 | ✅ 参考 |
| [migration/DATA_MODEL_REVIEW.md](./migration/DATA_MODEL_REVIEW.md) | 数据模型审查 | 📝 历史 |
| [socket-io-migration-analysis.md](./socket-io-migration-analysis.md) | Socket.IO 迁移分析 | 📝 待实施 |

### 📊 性能与监控

| 文档 | 说明 | 状态 |
|------|------|------|
| [MONITORING.md](./MONITORING.md) | 监控系统设计 | 📝 规划中 |
| [MONITORING_IMPLEMENTATION.md](./MONITORING_IMPLEMENTATION.md) | 监控系统实现 | 📝 规划中 |
| [PROMETHEUS_INTEGRATION_PLAN.md](./PROMETHEUS_INTEGRATION_PLAN.md) | Prometheus 集成计划 | 📝 规划中 |
| [performance-test-report.md](./performance-test-report.md) | 性能测试报告 | 📝 待更新 |
| [performance-testing-changelog.md](./performance-testing-changelog.md) | 性能测试变更日志 | 📝 待更新 |
| [STABILITY_TEST_GUIDE.md](./STABILITY_TEST_GUIDE.md) | 稳定性测试指南 | 📝 待更新 |

### 🚢 部署与运维

| 文档 | 说明 | 状态 |
|------|------|------|
| [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) | 生产环境部署指南 | 📝 待更新 |
| [migration/04-部署运维文档.md](./migration/04-部署运维文档.md) | 部署运维详细文档 | 📝 待更新 |

### 📝 其他参考

| 文档 | 说明 | 状态 |
|------|------|------|
| [terminal-entity-usage.md](./terminal-entity-usage.md) | Terminal 实体使用说明 | 📝 参考 |

---

## 📖 文档图标说明

| 图标 | 含义 |
|------|------|
| ⭐⭐⭐ | 必读文档 |
| ✅ 最新 | 与当前代码同步的最新文档 |
| ✅ 稳定 | 稳定版本,可参考 |
| ✅ 完成 | 已完成的阶段文档 |
| 🚧 进行中 | 当前开发阶段 |
| 📝 规划中 | 规划阶段,待实施 |
| 📝 参考 | 可参考的历史文档 |
| 📝 历史 | 历史记录,仅供参考 |
| 📝 待更新 | 需要更新的文档 |

---

## 🎯 快速查找

### 我想了解...

#### 如何开始开发?
→ 阅读 [../CLAUDE.md](../CLAUDE.md)

#### 如何添加 API 参数验证?
→ 阅读 [VALIDATION_DECORATOR.md](./VALIDATION_DECORATOR.md)

#### 数据库如何设计?
→ 阅读 [DATABASE_ARCHITECTURE.md](./DATABASE_ARCHITECTURE.md)

#### 如何创建新的 API 端点?
→ 阅读 [../CLAUDE.md](../CLAUDE.md) 的"常见模式"部分,参考 [API_ALARM_RULES.md](./API_ALARM_RULES.md)

#### 服务层如何集成 MongoDB?
→ 阅读 [SERVICE_LAYER_INTEGRATION.md](./SERVICE_LAYER_INTEGRATION.md)

#### 项目当前进度?
→ 阅读 [PHASE_3_PLAN.md](./PHASE_3_PLAN.md)

#### 从 Midway.js 迁移?
→ 阅读 [migration/README.md](./migration/README.md)

---

## 📐 文档编写规范

### 新文档创建指南

创建新文档时,请遵循以下规范:

1. **文件命名**: 使用大写字母和下划线 (如 `API_USERS.md`,`DATABASE_DESIGN.md`)
2. **文件位置**:
   - API 文档 → `docs/API_*.md`
   - 架构文档 → `docs/*_ARCHITECTURE.md` 或 `docs/*_DESIGN.md`
   - 开发计划 → `docs/PHASE_*.md`
   - 迁移相关 → `docs/migration/`

3. **文档结构**:
```markdown
# 文档标题

**版本**: 1.0
**创建日期**: YYYY-MM-DD
**最后更新**: YYYY-MM-DD

---

## 📋 概述

简要说明文档内容...

## 详细内容

...

---

**文档版本**: 1.0
**最后更新**: YYYY-MM-DD
**维护者**: Development Team
```

4. **提交规范**:
```bash
git commit -m "docs: add API users documentation"
git commit -m "docs: update validation decorator guide"
```

### 文档更新流程

1. 修改文档内容
2. 更新文档头部的"最后更新"日期
3. 如有重大变更,更新版本号
4. 更新 `docs/README.md` 中的文档状态
5. 提交时使用 `docs:` 前缀

---

## 🔗 相关资源

### 外部文档

- [Fastify 官方文档](https://www.fastify.io/)
- [Zod 官方文档](https://zod.dev/)
- [MongoDB 官方文档](https://www.mongodb.com/docs/)
- [TypeScript 官方文档](https://www.typescriptlang.org/docs/)

### 项目链接

- **代码仓库**: `uartserver-ng/`
- **原项目**: `midwayuartserver/`
- **问题追踪**: (待添加)

---

## 📞 获取帮助

### 文档相关问题

1. 查看本索引找到相关文档
2. 阅读 [../CLAUDE.md](../CLAUDE.md) 了解项目规范
3. 查看具体功能的详细文档

### 代码相关问题

1. 查看 [../CLAUDE.md](../CLAUDE.md) 的"常见陷阱"部分
2. 参考 API 文档中的示例代码
3. 查看服务层集成文档了解最佳实践

---

**文档索引版本**: 2.0
**最后更新**: 2025-12-19
**维护者**: Development Team

> 💡 **提示**: 如果你找不到需要的文档,请检查是否需要创建新文档。参考"文档编写规范"部分创建符合项目标准的文档。
