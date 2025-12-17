# FAQ 和故障排查手册

## 1. 常见问题 (FAQ)

### 1.1 架构相关

#### Q: 为什么选择 Bun + Fastify 而不是 Node.js + Express/Koa?

**A**: 主要有以下几个原因:

1. **启动速度**: Bun 启动速度比 Node.js 快 4x
2. **性能**: Fastify 比 Koa/Express 快 3-5x
3. **内置功能**: Bun 自带 TypeScript、测试、打包工具
4. **内存占用**: Bun 内存占用比 Node.js 低 30-50%
5. **简化架构**: 避免 Midway.js 的重量级 IoC 容器

**性能对比**:
```
Node.js + Koa:     500 req/s,  150ms P95
Bun + Fastify:    10,000 req/s,   5ms P95 (20x 提升)
```

#### Q: 为什么不使用依赖注入 (DI/IoC)?

**A**: 依赖注入有以下问题:

**缺点**:
- 增加复杂度（装饰器元数据、反射、容器管理）
- 隐式依赖（难以追踪依赖关系）
- 启动时间长（需要扫描和注册所有类）
- 调试困难（堆栈追踪不清晰）

**我们的方案**:
- 使用简单的服务容器（Map 存储）
- 显式导入依赖（import 语句）
- 更快的启动时间（< 3 秒）
- 更清晰的代码结构

```typescript
// ❌ 复杂的 DI
@Inject()
private userService: UserService;

// ✅ 简单的显式依赖
import { userService } from '../services/user.service';
```

#### Q: 单数据库架构（MongoDB only）有什么优缺点?

**A**:

**优点**:
- ✅ 减少复杂度（不需要管理两个数据库）
- ✅ 减少数据同步问题
- ✅ 减少运维成本
- ✅ 更快的查询（无需 JOIN 跨数据库）
- ✅ 更好的扩展性（MongoDB 分片）

**缺点**:
- ❌ 失去 PostgreSQL 的事务 ACID 保证（但 MongoDB 4.0+ 支持事务）
- ❌ 失去关系型约束（但可以通过应用层验证）
- ❌ 去规范化设计（数据冗余，但读性能更好）

**适用场景**: IoT 数据采集系统，读多写少，性能优先，数据一致性要求不高。

### 1.2 性能相关

#### Q: queryData API 如何做到 P95 < 10ms?

**A**: 核心优化策略:

1. **立即响应**: 不等待数据处理完成
```typescript
// ❌ 旧版本: 150ms
await parseService.queryData(data);
return 'ok';

// ✅ 新版本: 3ms
processAsync(data).catch(console.error);
return { status: 'ok' };
```

2. **异步处理**: 数据处理在后台 Worker 完成
3. **批量写入**: 缓冲 1000 条日志后批量写入 MongoDB
4. **Worker 池**: 4-8 个 Worker 并行处理 CPU 密集任务

#### Q: 为什么使用 Bun Worker 而不是 BullMQ?

**A**:

**BullMQ 问题**:
- 依赖 Redis (增加复杂度)
- 网络延迟 (Redis 往返 1-5ms)
- 序列化开销 (JSON.stringify/parse)

**Bun Worker 优势**:
- ✅ 进程内通信 (< 0.1ms)
- ✅ 结构化克隆 (比 JSON 快 10x)
- ✅ SQLite 持久化 (本地存储)
- ✅ 无外部依赖

**性能对比**:
```
BullMQ:      10ms 入队 + 5ms Redis往返 = 15ms 延迟
Bun Worker:  < 1ms 入队 + < 0.1ms 通信 = 1ms 延迟
```

#### Q: 批量写入会丢数据吗?

**A**: 不会，我们有多重保障:

1. **内存缓冲**: 最多缓冲 1000 条
2. **定时 Flush**: 每 1 秒强制 flush
3. **进程退出**: 监听 SIGTERM，退出前 flush
4. **SQLite 持久化**: 重要数据写入 SQLite

```typescript
process.on('SIGTERM', async () => {
  await logBuffer.flush();
  await stateBuffer.flush();
  process.exit(0);
});
```

#### Q: 如何验证性能提升?

**A**: 使用 K6 进行性能测试:

```bash
# 运行负载测试
k6 run test/performance/load-test.js

# 对比旧版本
k6 run --out json=results-old.json test/performance/load-test.js
k6 run --out json=results-new.json test/performance/load-test.js
node test/performance/compare-results.js results-old.json results-new.json
```

**关键指标**:
- HTTP P50: < 5ms
- HTTP P95: < 10ms
- HTTP P99: < 20ms
- 吞吐量: > 8000 req/s
- CPU: < 50%
- 内存: < 500MB

### 1.3 迁移相关

#### Q: 迁移需要停机吗?

**A**: 不需要。我们采用**灰度发布 + 双写**策略:

**阶段 1**: 启用双写（新旧系统同时写入）
```
旧版本 (100%) → PostgreSQL + MongoDB (old data)
```

**阶段 2**: 数据迁移（凌晨低峰期）
```
迁移脚本 → PostgreSQL → MongoDB (new schema)
```

**阶段 3**: 灰度发布
```
旧版本 (95%) → PostgreSQL + MongoDB (old)
新版本 (5%)  → MongoDB only (new schema)
```

**阶段 4**: 全量切换
```
新版本 (100%) → MongoDB only
```

停机时间: **0 秒**

#### Q: 如何处理迁移失败?

**A**: 我们有完整的回滚方案:

1. **数据备份**: 迁移前备份 PostgreSQL + MongoDB
2. **双写保留**: 迁移后保留双写 1-2 周
3. **快速回滚**: Nginx 切换到旧版本（< 1 分钟）
4. **数据恢复**: 从备份恢复 MongoDB（< 30 分钟）

```bash
# 快速回滚
bash scripts/rollback.sh

# 数据回滚
bash scripts/rollback-data.sh
```

#### Q: API 会有 Breaking Changes 吗?

**A**: 不会，我们保证向后兼容:

**兼容策略**:
- ✅ 所有现有 API 端点保持不变
- ✅ 响应格式保持一致
- ✅ Socket.IO 事件格式不变
- ✅ 认证机制不变

**新增 API**:
- 分页接口支持 `skip` + `take` 参数（推荐）
- 同时保留旧的 `page` + `limit` 参数（兼容）

```typescript
// 旧接口（兼容）
GET /api/terminal/123456/1/results?page=1&limit=20

// 新接口（推荐）
GET /api/terminal/123456/1/results?skip=0&take=20
```

### 1.4 开发相关

#### Q: 如何调试 Bun 应用?

**A**:

**方法 1: Bun 内置调试器**
```bash
bun --inspect src/app.ts

# 在 Chrome 打开 chrome://inspect
```

**方法 2: VS Code 调试**
```json
// .vscode/launch.json
{
  "type": "bun",
  "request": "launch",
  "name": "Debug Bun",
  "program": "${workspaceFolder}/src/app.ts",
  "cwd": "${workspaceFolder}",
  "stopOnEntry": false,
  "watchMode": false
}
```

**方法 3: 日志调试**
```typescript
import { logger } from './utils/logger';

logger.info({ mac, pid }, 'Processing query data');
logger.error({ err }, 'Query failed');
```

#### Q: 如何编写单元测试?

**A**: 使用 Bun Test:

```typescript
import { describe, test, expect } from 'bun:test';

describe('UserService', () => {
  test('should create user', async () => {
    const user = await userService.create({
      username: 'test',
      password: 'password',
    });
    expect(user).toBeDefined();
  });
});
```

```bash
# 运行测试
bun test

# 运行特定文件
bun test test/services/user.service.test.ts

# 查看覆盖率
bun test --coverage
```

#### Q: 装饰器如何工作?

**A**:

我们的装饰器基于 **全局 Map** 存储元数据:

```typescript
// 1. 定义元数据存储
export const ROUTE_METADATA = new Map<Function, RouteMetadata[]>();

// 2. 装饰器写入元数据
export function Get(path: string) {
  return function (target: any, propertyKey: string) {
    const routes = ROUTE_METADATA.get(target.constructor) || [];
    routes.push({ method: 'GET', path, handler: propertyKey });
    ROUTE_METADATA.set(target.constructor, routes);
  };
}

// 3. 路由加载器读取元数据
export function loadRoutes(app: FastifyInstance, controller: any) {
  const routes = ROUTE_METADATA.get(controller.constructor);
  for (const route of routes) {
    app[route.method.toLowerCase()](route.path, controller[route.handler]);
  }
}
```

## 2. 故障排查

### 2.1 服务启动失败

#### 症状: 服务无法启动

**可能原因 1: 端口被占用**

```bash
# 检查端口占用
lsof -i :9000
netstat -tlnp | grep 9000

# 杀死进程
kill -9 <PID>

# 或者修改端口
export PORT=9001
bun run src/app.ts
```

**可能原因 2: MongoDB 连接失败**

```bash
# 检查 MongoDB 状态
docker ps | grep mongo
systemctl status mongod

# 检查连接字符串
echo $MONGODB_URI

# 测试连接
mongosh "$MONGODB_URI" --eval "db.runCommand({ ping: 1 })"
```

**日志示例**:
```
Error: connect ECONNREFUSED 127.0.0.1:27017
```

**解决方案**:
1. 启动 MongoDB: `docker-compose up -d mongo`
2. 检查防火墙: `ufw allow 27017`
3. 修改连接字符串

**可能原因 3: Redis 连接失败**

```bash
# 检查 Redis 状态
docker ps | grep redis
redis-cli ping

# 测试连接
redis-cli -h localhost -p 6379 ping
```

**解决方案**:
1. 启动 Redis: `docker-compose up -d redis`
2. 检查密码配置: `REDIS_PASSWORD`

**可能原因 4: 环境变量缺失**

```bash
# 检查 .env 文件
cat .env

# 复制模板
cp .env.example .env
```

**必需的环境变量**:
```bash
NODE_ENV=production
PORT=9000
MONGODB_URI=mongodb://localhost:27017/uart_server
REDIS_HOST=localhost
REDIS_PORT=6379
```

### 2.2 性能问题

#### 症状: queryData API 响应慢 (> 50ms)

**检查步骤**:

**1. 检查 Worker 队列积压**
```bash
curl http://localhost:9000/metrics | grep worker_pool_queue_size

# 如果 > 5000，说明 Worker 处理不过来
```

**解决方案**: 增加 Worker 数量
```bash
export WORKER_POOL_SIZE=16
docker-compose restart app
```

**2. 检查 MongoDB 慢查询**
```javascript
// 开启慢查询分析
db.setProfilingLevel(1, { slowms: 100 });

// 查看慢查询
db.system.profile.find({ millis: { $gt: 100 } }).sort({ ts: -1 }).limit(10);

// 分析查询计划
db.uartTerminalResults.find({ mac: '123456', pid: 1 }).explain('executionStats');
```

**解决方案**: 创建索引
```javascript
db.uartTerminalResults.createIndex({ mac: 1, pid: 1, timeStamp: -1 });
```

**3. 检查批量写入缓冲区**
```bash
# 查看日志缓冲区大小
curl http://localhost:9000/metrics | grep log_buffer_size

# 如果缓冲区满，调整大小
export BATCH_WRITE_MAX_SIZE=500
export BATCH_WRITE_FLUSH_INTERVAL=500
```

**4. 检查内存使用**
```bash
# Docker 容器
docker stats uart-server

# 系统进程
ps aux | grep bun
```

**解决方案**: 增加内存限制
```yaml
# docker-compose.yml
services:
  app:
    mem_limit: 1g
```

#### 症状: CPU 使用率过高 (> 70%)

**检查步骤**:

**1. 查看 CPU 分析**
```bash
# Bun 内置性能分析
bun --cpu-prof src/app.ts

# 生成火焰图
bun --prof src/app.ts
```

**2. 检查热点代码**
```bash
# 使用 clinic.js
npx clinic doctor -- bun src/app.ts
```

**可能原因**:
- Worker 数量过多（超过 CPU 核心数）
- 协议解析计算密集
- 日志过多

**解决方案**:
```bash
# 减少 Worker 数量
export WORKER_POOL_SIZE=4  # 等于 CPU 核心数

# 降低日志级别
export LOG_LEVEL=warn
```

#### 症状: 内存泄漏

**检查步骤**:

**1. 监控内存趋势**
```bash
# Prometheus 查询
process_resident_memory_bytes

# Grafana 绘制趋势图
```

**2. 分析内存快照**
```bash
# 使用 Bun 内存分析
bun --heap-prof src/app.ts

# 生成 Heap Snapshot
```

**3. 检查常见泄漏点**
- EventEmitter 没有 removeListener
- Worker 没有正确关闭
- 缓存无限增长

**解决方案**:
```typescript
// ❌ 内存泄漏
socket.on('data', handler);

// ✅ 正确清理
socket.once('data', handler);  // 自动移除
// 或
socket.on('data', handler);
socket.removeListener('data', handler);  // 手动移除

// ❌ 缓存无限增长
const cache = new Map();
cache.set(key, value);

// ✅ LRU 缓存
import { LRUCache } from 'lru-cache';
const cache = new LRUCache({ max: 1000 });
```

### 2.3 数据问题

#### 症状: 数据丢失

**检查步骤**:

**1. 检查日志**
```bash
# 查看错误日志
tail -f logs/error.log

# 搜索特定 MAC
grep '123456' logs/app.log
```

**2. 检查 MongoDB 数据**
```javascript
// 查询最近的数据
db.uartTerminalResults.find({ mac: '123456', pid: 1 }).sort({ timeStamp: -1 }).limit(10);

// 检查数据总数
db.uartTerminalResults.countDocuments({ mac: '123456', pid: 1 });
```

**3. 检查批量写入缓冲区**
```bash
# 如果缓冲区有数据但没有 flush，可能丢失
# 手动触发 flush
curl -X POST http://localhost:9000/admin/flush-buffers
```

**可能原因**:
- 进程异常退出（没有 flush 缓冲区）
- MongoDB 写入失败（磁盘满、权限问题）
- Worker 任务超时

**解决方案**:
1. 从备份恢复
```bash
mongorestore --uri="$MONGODB_URI" /data/backups/latest/
```

2. 启用 WAL (Write-Ahead Logging)
```bash
export ENABLE_WAL=true  # 所有数据先写入 SQLite
```

#### 症状: 数据不一致

**场景**: MongoDB 和 Redis 缓存不一致

**检查步骤**:
```bash
# 查询 MongoDB
mongosh "$MONGODB_URI" --eval "db.uartTerminalResultsSingle.findOne({ mac: '123456', pid: 1 })"

# 查询 Redis
redis-cli GET "terminal:123456:1:result"
```

**解决方案**: 清除 Redis 缓存
```bash
redis-cli FLUSHDB
```

**场景**: 迁移后数据不匹配

**检查步骤**:
```bash
# 运行数据一致性检查
bun run scripts/check-data-consistency.ts
```

**解决方案**: 手动修复
```bash
bun run scripts/fix-inconsistency.ts
```

### 2.4 Socket.IO 问题

#### 症状: Node 客户端连接失败

**检查步骤**:

**1. 检查服务端日志**
```bash
tail -f logs/socket.log
```

**2. 检查认证 token**
```typescript
// Node 客户端
const socket = io('http://localhost:9000/node', {
  auth: { token: 'your_token' },
});

socket.on('connect_error', (err) => {
  console.error('Connect error:', err.message);
});
```

**3. 检查防火墙**
```bash
# 检查端口是否开放
telnet localhost 9000

# 检查 UFW
sudo ufw status
```

**可能原因**:
- Token 过期或无效
- 防火墙阻止
- 网络不通

**解决方案**:
1. 重新生成 token
2. 开放端口: `ufw allow 9000`
3. 检查网络连接

#### 症状: 消息丢失

**检查步骤**:

**1. 检查 Socket.IO 日志**
```bash
grep 'message sent' logs/socket.log
grep 'message received' logs/socket.log
```

**2. 检查 Redis Adapter**
```bash
# 如果使用 Redis Adapter，检查 Redis 连接
redis-cli MONITOR | grep socket
```

**可能原因**:
- Socket 断开连接
- Redis 连接断开
- 消息队列满

**解决方案**:
```typescript
// 使用 ACK 确认消息送达
socket.emit('message', data, (ack) => {
  if (ack) {
    console.log('Message delivered');
  } else {
    console.log('Message failed, retry');
  }
});
```

### 2.5 Worker 问题

#### 症状: Worker 处理超时

**检查步骤**:

**1. 查看 Worker 日志**
```bash
tail -f logs/worker.log
```

**2. 检查任务队列**
```bash
curl http://localhost:9000/metrics | grep worker_pool_queue_size
```

**可能原因**:
- 协议解析复杂（计算密集）
- Worker 数量不足
- 单个任务超时（> 10s）

**解决方案**:
```bash
# 增加 Worker 数量
export WORKER_POOL_SIZE=16

# 增加任务超时
export WORKER_TASK_TIMEOUT=30000  # 30 秒
```

#### 症状: Worker 崩溃

**检查步骤**:

**1. 查看崩溃日志**
```bash
grep 'Worker crashed' logs/worker.log
```

**2. 检查内存使用**
```bash
docker stats uart-server
```

**可能原因**:
- 内存不足（OOM）
- 未捕获的异常
- 协议脚本错误

**解决方案**:
```typescript
// Worker 内部错误处理
self.onmessage = async (event) => {
  try {
    const result = await processTask(event.data);
    self.postMessage({ success: true, result });
  } catch (err) {
    self.postMessage({ success: false, error: err.message });
  }
};

// 主进程监听 Worker 错误
worker.on('error', (err) => {
  logger.error({ err }, 'Worker error');
  // 重启 Worker
  restartWorker();
});
```

### 2.6 数据库问题

#### 症状: MongoDB 连接池耗尽

**日志示例**:
```
MongoServerSelectionError: connection pool is exhausted
```

**检查步骤**:
```javascript
// 查看当前连接数
db.serverStatus().connections
```

**解决方案**:
```typescript
// 增加连接池大小
const client = new MongoClient(uri, {
  maxPoolSize: 200,  // 默认 100
  minPoolSize: 20,
});
```

#### 症状: MongoDB 写入慢

**检查步骤**:
```javascript
// 查看当前写入操作
db.currentOp({ op: 'insert' })

// 查看慢查询
db.system.profile.find({ op: 'insert', millis: { $gt: 100 } })
```

**可能原因**:
- 索引过多（写入需要更新索引）
- 磁盘 I/O 慢
- writeConcern 设置过高

**解决方案**:
```typescript
// 降低 writeConcern
await collection.insertMany(docs, {
  writeConcern: { w: 1, j: false },  // 不等待 journal
});

// 批量写入
await collection.bulkWrite(ops, { ordered: false });
```

## 3. 监控和告警

### 3.1 关键指标

**应用指标**:
- HTTP 请求延迟 (P50, P95, P99)
- HTTP 请求成功率
- queryData API QPS
- Worker 队列大小
- Worker 处理延迟

**系统指标**:
- CPU 使用率
- 内存使用
- 磁盘 I/O
- 网络流量

**数据库指标**:
- MongoDB 连接数
- MongoDB 操作延迟
- MongoDB 写入 ops
- Redis 连接数
- Redis 内存使用

### 3.2 告警规则

**Prometheus 告警配置**:
```yaml
groups:
- name: uart_server_alerts
  rules:
  # HTTP 延迟告警
  - alert: HighHTTPLatency
    expr: histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m])) > 50
    for: 5m
    annotations:
      summary: "HTTP P95 latency is high: {{ $value }}ms"

  # queryData 成功率告警
  - alert: LowQueryDataSuccessRate
    expr: rate(query_data_total{status="success"}[5m]) / rate(query_data_total[5m]) < 0.999
    for: 5m
    annotations:
      summary: "queryData success rate is low: {{ $value }}"

  # Worker 队列积压告警
  - alert: HighWorkerQueueSize
    expr: worker_pool_queue_size > 5000
    for: 5m
    annotations:
      summary: "Worker queue size is high: {{ $value }}"

  # CPU 使用率告警
  - alert: HighCPUUsage
    expr: process_cpu_seconds_total > 0.7
    for: 5m
    annotations:
      summary: "CPU usage is high: {{ $value }}"
```

### 3.3 日志查询

**常用日志查询**:

```bash
# 查询错误日志
grep ERROR logs/app.log | tail -20

# 查询特定 MAC 的日志
grep '123456' logs/app.log

# 查询 queryData API 日志
grep 'queryData' logs/query.log | tail -20

# 查询慢请求 (> 100ms)
grep 'duration.*[1-9][0-9][0-9]' logs/access.log

# 统计错误频率
grep ERROR logs/app.log | awk '{print $1}' | uniq -c | sort -rn

# 实时监控日志
tail -f logs/app.log | grep ERROR
```

## 4. 性能优化建议

### 4.1 应用层优化

**1. 使用对象池**
```typescript
// 避免频繁创建对象
class BufferPool {
  private pool: Buffer[] = [];

  acquire(size: number): Buffer {
    return this.pool.pop() || Buffer.allocUnsafe(size);
  }

  release(buffer: Buffer) {
    this.pool.push(buffer);
  }
}
```

**2. 减少 JSON 序列化**
```typescript
// ❌ 每次都序列化
socket.emit('data', JSON.stringify(data));

// ✅ 使用结构化克隆
worker.postMessage(data);  // Bun 自动使用结构化克隆
```

**3. 使用流式处理**
```typescript
// ❌ 一次加载所有数据
const results = await db.collection.find({}).toArray();

// ✅ 使用流
const cursor = db.collection.find({});
for await (const doc of cursor) {
  processDoc(doc);
}
```

### 4.2 数据库优化

**1. 索引优化**
```javascript
// 创建复合索引
db.uartTerminalResults.createIndex({ mac: 1, pid: 1, timeStamp: -1 });

// 使用部分索引（减少索引大小）
db.uartTerminalResults.createIndex(
  { timeStamp: -1 },
  { partialFilterExpression: { hasAlarm: true } }
);
```

**2. 查询优化**
```javascript
// ❌ 查询所有字段
db.uartTerminalResults.find({ mac: '123456' });

// ✅ 投影字段
db.uartTerminalResults.find(
  { mac: '123456' },
  { projection: { result: 1, timeStamp: 1 } }
);
```

**3. 批量操作**
```javascript
// ❌ 单条插入
for (const doc of docs) {
  await db.collection.insertOne(doc);
}

// ✅ 批量插入
await db.collection.insertMany(docs, { ordered: false });
```

### 4.3 系统层优化

**1. 调整文件描述符限制**
```bash
# /etc/security/limits.conf
* soft nofile 1000000
* hard nofile 1000000
```

**2. 调整内核参数**
```bash
# /etc/sysctl.conf
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 8192
net.ipv4.tcp_tw_reuse = 1
```

**3. 使用 SSD 磁盘**
- MongoDB 数据目录使用 SSD
- 日志目录可以使用 HDD

## 5. 联系支持

### 5.1 报告 Bug

如果遇到无法解决的问题，请报告 Bug:

**GitHub Issues**: https://github.com/yourorg/uart-server/issues

**Bug 报告模板**:
```markdown
## 环境信息
- Bun 版本: 1.1.40
- 操作系统: Ubuntu 20.04
- MongoDB 版本: 8.0.1
- Redis 版本: 7.4.0

## 问题描述
清晰描述遇到的问题

## 复现步骤
1. 启动服务
2. 发送请求
3. 观察错误

## 期望行为
描述期望的正确行为

## 实际行为
描述实际发生的错误

## 日志和错误信息
```
粘贴相关日志
```

## 截图
如果适用，添加截图

## 补充信息
其他可能相关的信息
```

### 5.2 获取帮助

**文档**: `/docs`
**示例代码**: `/examples`
**测试代码**: `/test`

---

**文档版本**: v1.0
**最后更新**: 2024-12-16
**维护者**: 开发团队
