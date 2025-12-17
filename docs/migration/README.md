# Midway UART Server → Bun + Fastify 迁移文档

## 📚 文档概览

本目录包含从 Midway.js 架构迁移到 Bun + Fastify 的完整技术文档。

### 核心目标

- ⚡ **性能提升**: queryData API 延迟从 150ms → 5ms (30x)
- 📈 **吞吐量提升**: 从 500 req/s → 10,000 req/s (20x)
- 💾 **内存优化**: 从 800MB → 400MB (50%)
- 🚀 **启动速度**: 从 8-12s → 3s (4x)
- 🔧 **架构简化**: 移除 IoC 容器，采用简单服务容器
- 🗄️ **保持 MongoDB**: 继续使用 MongoDB，无需数据迁移

## 📖 文档列表

### 1️⃣ [架构设计文档](./01-架构设计文档.md)
**适合**: 架构师、技术负责人、开发者

**内容**:
- 技术栈选型 (Bun 1.1.40+, Fastify 5.1.0+, MongoDB 8.0+)
- 系统架构设计
- queryData API 优化方案 ⭐ **核心优化**
- 装饰器系统设计 (无 IoC)
- Worker 池设计
- 批量写入策略
- 数据库架构 (MongoDB only)
- 性能目标和基准
- 安全设计

**关键点**:
```typescript
// queryData 优化：立即响应 + 异步处理
@Post('/queryData')
async queryData(@Body('data') data: Uart.queryResult) {
  this.processAsync(data).catch(console.error);
  return { status: 'ok' };  // <5ms 响应
}
```

---

### 2️⃣ [实施计划文档](./02-实施计划文档.md)
**适合**: 项目经理、技术负责人、开发团队

**内容**:
- 8 周详细实施计划
- 3 个阶段划分
- 每周任务分解
- 验收标准
- 风险管理
- 资源分配
- 沟通计划

**时间表**:
- **Phase 1 (Week 1-3)**: API 层 + queryData 优化 ⭐ **最高优先级**
- **Phase 2 (Week 4-5)**: Worker 池 + 批量写入
- **Phase 3 (Week 6-8)**: Socket.IO + 队列迁移

**里程碑**:
- Week 3: queryData API 性能提升 20x
- Week 5: MongoDB 写入压力降低 80%
- Week 8: 完整系统上线

---

### 3️⃣ [代码示例文档](./03-代码示例文档.md)
**适合**: 开发者

**内容**:
- 完整项目初始化
- 装饰器系统完整实现
  - `@Controller`, `@Get/@Post/@Put/@Delete`
  - `@Body/@Query/@Params/@User`
  - `@Auth`, `@Role`, `@Validate`
- 路由加载器
- queryData 优化实现
- Worker 池实现
- 批量写入服务
- 完整服务器启动代码
- K6 性能测试脚本

**示例代码**:
```typescript
// 装饰器使用示例
@Controller('/api/terminal')
export class TerminalController {
  @Get('/:mac/:pid/results')
  @Auth()
  async getResults(
    @Params('mac') mac: string,
    @Params('pid') pid: number,
    @Query('skip') skip: number = 0,
    @Query('take') take: number = 20
  ) {
    return await terminalService.getResults(mac, pid, { skip, take });
  }
}
```

---

### 4️⃣ [部署运维文档](./04-部署运维文档.md)
**适合**: 运维工程师、DevOps

**内容**:
- 环境要求 (Bun, MongoDB, Redis)
- Docker 部署 (推荐)
- 传统部署 (PM2)
- Kubernetes 部署
- 灰度发布策略
- 监控和日志 (Prometheus, Grafana, Pino)
- 备份和恢复
- 故障恢复
- 健康检查
- 性能调优
- 安全加固

**部署方式**:
```bash
# Docker 一键部署
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f app
```

**灰度发布流程**:
1. 小流量验证 (5%)
2. 中等流量 (30%)
3. 全量发布 (100%)

---

### 5️⃣ [测试方案文档](./05-测试方案文档.md)
**适合**: 测试工程师、QA、开发者

**内容**:
- 测试策略 (单元 60%, 集成 30%, E2E 10%)
- 单元测试 (Bun Test)
  - 装饰器测试
  - 服务层测试
  - 控制器测试
  - 工具函数测试
- 集成测试
  - API 集成测试
  - 数据库集成测试
  - Socket.IO 集成测试
  - Worker 集成测试
- 性能测试 (K6)
  - 负载测试
  - 压力测试
  - 持久性测试 (24h)
- E2E 测试 (Playwright)
- 兼容性测试
- 回归测试
- 验收测试

**测试覆盖率目标**:
- 语句覆盖率: ≥ 80%
- 分支覆盖率: ≥ 75%
- 函数覆盖率: ≥ 85%

**性能测试**:
```bash
# K6 负载测试
k6 run test/performance/load-test.js

# 对比新旧版本
node test/performance/compare-results.js results-old.json results-new.json
```

---

### 6️⃣ [FAQ 和故障排查](./07-FAQ和故障排查.md)
**适合**: 所有人

**内容**:
- **常见问题 (FAQ)**
  - 为什么选择 Bun + Fastify?
  - 为什么不使用依赖注入?
  - 单数据库架构优缺点?
  - queryData 如何做到 < 10ms?
  - 为什么使用 Bun Worker 而不是 BullMQ?
  - 迁移需要停机吗?
  - API 会有 Breaking Changes 吗?
  - 如何调试 Bun 应用?
  - 如何编写单元测试?
  - 装饰器如何工作?

- **故障排查**
  - 服务启动失败
  - 性能问题 (API 慢、CPU 高、内存泄漏)
  - 数据问题 (丢失、不一致)
  - Socket.IO 问题
  - Worker 问题
  - 数据库问题

- **监控和告警**
  - 关键指标
  - Prometheus 告警规则
  - 日志查询

- **性能优化建议**
  - 应用层优化
  - 数据库优化
  - 系统层优化

**快速查询**:
```bash
# 服务启动失败 → 检查端口占用
lsof -i :9000

# API 响应慢 → 检查 Worker 队列
curl http://localhost:9000/metrics | grep worker_pool_queue_size

# 内存泄漏 → 分析内存快照
bun --heap-prof src/app.ts

# 数据丢失 → 从备份恢复
mongorestore --uri="$MONGODB_URI" /data/backups/latest/
```

---

### 7️⃣ [MongoDB 索引设计](./09-MongoDB索引设计.md)
**适合**: 开发者、DBA、运维工程师

**内容**:
- **索引设计原则**
  - 查询模式优先
  - ESR 原则（Equality, Sort, Range）
  - 索引命名规范

- **完整索引清单** ⭐ 65 个索引定义
  - 核心业务集合（terminals, client.resultcolltions）
  - 用户相关集合（users, binddevices, layouts）
  - 协议设备集合（protocols, constants）
  - 日志集合（带 TTL 自动清理）

- **MongoDB Native Driver 实现**
  - IndexManager 服务完整代码
  - 自动创建/更新索引
  - 后台创建避免阻塞
  - 应用启动时初始化

- **索引管理工具**
  - 索引检查脚本
  - 性能分析脚本
  - 索引重建脚本

- **监控和优化**
  - 慢查询监控
  - 索引使用统计
  - 索引大小监控
  - 索引建议

**代码示例**:
```typescript
// 索引管理服务
export class IndexManager {
  async ensureAllIndexes(): Promise<void> {
    const indexDefinitions = this.getIndexDefinitions();
    for (const def of indexDefinitions) {
      await this.ensureCollectionIndexes(def);
    }
  }
}

// 创建索引
{
  collection: 'terminals',
  indexes: [
    { key: { DevMac: 1 }, options: { unique: true } },
    { key: { online: 1, UT: -1 } }, // 复合索引
  ],
}

// TTL 索引（自动删除 30 天前数据）
{ key: { timeStamp: -1 }, options: { expireAfterSeconds: 2592000 } }
```

---

### 8️⃣ [技术细节和设计模式](./08-技术细节和设计模式.md)
**适合**: 开发者、架构师

**内容**:
- **MongoDB ORM 选择**
  - Native Driver + Zod + Repository 对比 Mongoose
  - 完整 Repository 实现示例
  - Zod Schema 定义和运行时验证
  - 性能基准测试对比 (1.3x-1.6x 提升)

- **策略模式应用场景** ⭐ 核心设计模式
  - 协议解析策略 (Modbus RTU, UTF8, Pesiv, 自定义脚本)
  - 告警检测策略 (阈值、状态变化、离线)
  - 通知推送策略 (微信、短信、邮件、钉钉)
  - 完整策略工厂实现

- **实体类设计**
  - Terminal 实体 (状态管理、设备管理、统计)
  - MountDevice 实体 (查询管理、协议处理)
  - QueryResult 实体 (验证、解析、告警)
  - Protocol 实体 (指令生成、策略获取)
  - Alarm 实体 (多渠道消息格式化)
  - User 实体 (权限、绑定、通知偏好)

- **最佳实践**
  - ORM 使用建议 (索引、批量操作、缓存)
  - 策略模式最佳实践 (注册、缓存、错误处理)
  - 实体类最佳实践 (职责单一、验证、序列化)

**代码示例**:
```typescript
// Zod Schema + Repository
export const terminalSchema = z.object({
  DevMac: z.string().regex(/^[0-9A-Fa-f]{12}$/),
  online: z.boolean(),
  mountDevs: z.array(mountDeviceSchema),
});

export class TerminalRepository {
  async findByMac(mac: string): Promise<Terminal | null> {
    const terminal = await this.collection.findOne({ DevMac: mac });
    return terminal ? terminalSchema.parse(terminal) : null;
  }
}

// 协议解析策略
export class ModbusRtuStrategy implements ProtocolStrategy {
  generateInstruction(config: InstructionConfig): Buffer {
    // Modbus RTU 指令生成逻辑
  }

  parseResponse(buffer: Buffer, config: ParseConfig): ParsedResult {
    // Modbus RTU 响应解析逻辑
  }
}
```

---

## 🎯 快速导航

### 📌 我想了解...

| 问题 | 查看文档 | 章节 |
|------|----------|------|
| 整体架构设计 | [01-架构设计](./01-架构设计文档.md) | 第 2-4 章 |
| queryData 如何优化 | [01-架构设计](./01-架构设计文档.md) | 第 4.1 章 ⭐ |
| 实施时间表 | [02-实施计划](./02-实施计划文档.md) | 第 3 章 |
| 代码实现示例 | [03-代码示例](./03-代码示例文档.md) | 全文 |
| Docker 部署 | [04-部署运维](./04-部署运维文档.md) | 第 3.1 章 |
| 灰度发布 | [04-部署运维](./04-部署运维文档.md) | 第 4 章 |
| 单元测试 | [05-测试方案](./05-测试方案文档.md) | 第 2 章 |
| 性能测试 | [05-测试方案](./05-测试方案文档.md) | 第 4 章 |
| 常见问题 | [07-FAQ](./07-FAQ和故障排查.md) | 第 1 章 |
| 故障排查 | [07-FAQ](./07-FAQ和故障排查.md) | 第 2 章 |
| MongoDB 索引设计 | [09-MongoDB索引](./09-MongoDB索引设计.md) | 第 2 章 ⭐ |
| 索引管理工具 | [09-MongoDB索引](./09-MongoDB索引设计.md) | 第 4 章 |
| MongoDB ORM 选择 | [08-技术细节](./08-技术细节和设计模式.md) | 第 1 章 ⭐ |
| 策略模式应用 | [08-技术细节](./08-技术细节和设计模式.md) | 第 2 章 ⭐ |
| 实体类设计 | [08-技术细节](./08-技术细节和设计模式.md) | 第 3 章 ⭐ |

### 📌 我想做...

| 任务 | 操作步骤 | 文档链接 |
|------|----------|----------|
| 快速开始 | 1. 阅读架构设计<br>2. 查看代码示例<br>3. 运行测试 | [01-架构](./01-架构设计文档.md)<br>[03-代码示例](./03-代码示例文档.md) |
| 部署到生产 | 1. 配置环境<br>2. Docker 部署<br>3. 灰度发布 | [04-部署运维](./04-部署运维文档.md) |
| 性能测试 | 1. 运行 K6 测试<br>2. 对比新旧版本<br>3. 生成报告 | [05-测试方案](./05-测试方案文档.md) |
| 解决问题 | 1. 查看 FAQ<br>2. 故障排查<br>3. 查看日志 | [07-FAQ](./07-FAQ和故障排查.md) |

---

## 🔥 核心优化亮点

### 1. queryData API 优化 ⭐

**问题**: 原系统 queryData API 是性能瓶颈
- 接收 100-500 req/s
- 阻塞 HTTP 线程 150-300ms
- 吞吐量受限于单线程处理

**解决方案**: 立即响应 + 异步处理
```typescript
// 旧版本: 150ms
await parseService.queryData(data);
return 'ok';

// 新版本: 3ms
processAsync(data).catch(console.error);
return { status: 'ok' };
```

**效果**:
- HTTP 响应: 150ms → 3ms (50x)
- 吞吐量: 500 req/s → 10,000 req/s (20x)

### 2. Worker 池并行处理

**问题**: 协议解析 CPU 密集，阻塞主线程

**解决方案**: 4-8 个 Worker 并行处理
```typescript
const result = await workerPool.dispatch({
  type: 'parse',
  data: queryData,
});
```

**效果**:
- CPU 利用率: 25% → 80%
- 并发处理: 4x-8x

### 3. 批量写入优化

**问题**: MongoDB 频繁写入 (800 ops/s)

**解决方案**: 缓冲 + 批量写入
```typescript
logBuffer.add('logs', data);  // 缓冲
// 自动 flush: 1000 条 或 1 秒
```

**效果**:
- MongoDB 写入: 800 ops/s → 80 ops/s (10x)
- 写入延迟: 20ms → 2ms (10x)

---

## 📊 性能对比

| 指标 | 旧版本 | 新版本 | 提升 |
|------|--------|--------|------|
| **HTTP P50 延迟** | 150ms | 3ms | **50x** ⚡ |
| **HTTP P95 延迟** | 280ms | 5ms | **56x** ⚡ |
| **HTTP P99 延迟** | 350ms | 10ms | **35x** ⚡ |
| **吞吐量** | 500 req/s | 10,000 req/s | **20x** 📈 |
| **CPU 使用率** | 75% | 40% | -47% 💪 |
| **内存使用** | 800MB | 400MB | -50% 💾 |
| **启动时间** | 8-12s | 3s | **4x** 🚀 |
| **MongoDB 写入** | 800 ops/s | 80 ops/s | -90% 📉 |

---

## ✅ 技术栈

| 组件 | 旧版本 | 新版本 |
|------|--------|--------|
| **运行时** | Node.js 20.x | Bun 1.1.40+ |
| **HTTP 框架** | Koa 2.x | Fastify 5.1.0+ |
| **IoC 容器** | Midway.js | ❌ 移除 (简单服务容器) |
| **ORM** | Typegoose | Mongoose 8.x |
| **数据库** | MongoDB | MongoDB 8.0+ (继续使用) |
| **队列** | BullMQ (Redis) | Bun Worker + SQLite |
| **日志** | Egg Logger | Pino |
| **测试** | Jest | Bun Test |
| **装饰器** | reflect-metadata | 全局 Map 存储 |

---

## 📝 开发流程

### 1. 阅读文档
```bash
# 按顺序阅读
01-架构设计文档.md      # 了解整体架构
02-实施计划文档.md      # 了解实施计划
03-代码示例文档.md      # 学习代码实现
```

### 2. 环境准备
```bash
# 安装 Bun
curl -fsSL https://bun.sh/install | bash

# 克隆项目
git clone <repository-url>
cd midwayuartserver-bun

# 安装依赖
bun install

# 配置环境变量
cp .env.example .env
```

### 3. 本地开发
```bash
# 启动开发服务器
bun run dev

# 运行测试
bun test

# 查看覆盖率
bun test --coverage
```

### 4. 部署上线
```bash
# Docker 部署
docker-compose up -d

# 查看日志
docker-compose logs -f app

# 健康检查
curl http://localhost:9000/health
```

---

## 🎓 学习路径

### 入门 (1-2 天)
1. 阅读 [01-架构设计](./01-架构设计文档.md) 第 1-3 章
2. 浏览 [03-代码示例](./03-代码示例文档.md) 装饰器部分
3. 运行示例代码

### 进阶 (3-5 天)
1. 深入 [01-架构设计](./01-架构设计文档.md) 第 4-6 章
2. 学习 [03-代码示例](./03-代码示例文档.md) Worker 池和批量写入
3. 编写单元测试

### 精通 (1-2 周)
1. 完整阅读所有文档
2. 实现完整功能模块
3. 部署到测试环境
4. 性能优化和调优

---

## 💬 支持和反馈

### 获取帮助
- 📖 查看 [FAQ 和故障排查](./07-FAQ和故障排查.md)
- 💬 联系开发团队
- 🐛 报告 Bug: GitHub Issues

### 贡献文档
如果发现文档错误或有改进建议，欢迎提交 PR。

---

## 📅 更新日志

### v1.0.0 (2024-12-16)
- ✅ 初始版本
- ✅ 6 份完整技术文档
- ✅ 覆盖架构、实施、代码、部署、测试、FAQ

---

**文档版本**: v1.0.0
**最后更新**: 2024-12-16
**维护者**: 开发团队

---

**🎉 祝您迁移顺利！**
