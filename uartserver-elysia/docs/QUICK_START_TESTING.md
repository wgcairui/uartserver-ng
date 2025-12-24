# Phase 7 快速测试指南

本指南帮助您快速启动 MongoDB 并运行 Phase 7 的集成测试。

---

## 🚀 快速开始 (3 步)

### 步骤 1: 启动 MongoDB

#### 选项 A: Docker Compose (推荐)

```bash
# 1. 启动 Docker Desktop (Mac)
# 或确保 Docker daemon 运行

# 2. 启动 MongoDB
cd /Users/cairui/Code/uartserver-ng/uartserver-elysia
docker compose -f docker-compose.dev.yml up -d mongodb

# 3. 验证 MongoDB 运行
docker compose -f docker-compose.dev.yml ps
# 应该看到 mongodb 容器状态为 "Up (healthy)"

# 4. 查看日志
docker compose -f docker-compose.dev.yml logs -f mongodb
# 看到 "Waiting for connections on port 27017" 表示成功
```

#### 选项 B: Homebrew (本地安装)

```bash
# 1. 安装 MongoDB (如果未安装)
brew tap mongodb/brew
brew install mongodb-community@7.0

# 2. 启动 MongoDB 服务
brew services start mongodb-community@7.0

# 3. 验证运行
brew services list | grep mongodb
# 应该看到 "mongodb-community started"

# 4. 连接测试
mongosh --eval "db.adminCommand('ping')"
# 应该看到 { ok: 1 }
```

#### 选项 C: 手动启动

```bash
# 1. 创建数据目录
mkdir -p /usr/local/var/mongodb

# 2. 启动 mongod
mongod --dbpath /usr/local/var/mongodb --logpath /usr/local/var/log/mongodb/mongo.log --fork

# 3. 验证运行
ps aux | grep mongod
```

### 步骤 2: 启动 Elysia 服务器

```bash
# 新终端窗口
cd /Users/cairui/Code/uartserver-ng/uartserver-elysia

# 启动开发服务器
bun run dev

# 应该看到:
# 🚀 UartServer Elysia - 启动成功!
# 📡 HTTP Server:   http://localhost:3333
```

### 步骤 3: 运行集成测试

```bash
# 新终端窗口
cd /Users/cairui/Code/uartserver-ng/uartserver-elysia

# 运行所有集成测试
bun test ./test/integration/alarm-routes.test.ts
bun test ./test/integration/data-query-routes.test.ts
bun test ./test/integration/user-routes.test.ts

# 或一次性运行所有测试
bun test test/integration/
```

---

## ✅ 预期结果

### Alarm Routes 测试 (20+ 测试)

```
✓ Alarm Routes Integration Tests > GET /api/alarms
✓ Alarm Routes Integration Tests > GET /api/alarms/:id
✓ Alarm Routes Integration Tests > POST /api/alarms/confirm
✓ Alarm Routes Integration Tests > 性能测试
...

20 pass
0 fail
```

### Data Query Routes 测试 (25+ 测试)

```
✓ Data Query Routes Integration Tests > GET /api/data/latest/:mac/:pid
✓ Data Query Routes Integration Tests > GET /api/data/history
✓ Data Query Routes Integration Tests > 性能测试
...

25 pass
0 fail
```

### User Routes 测试 (25+ 测试)

```
✓ User Routes Integration Tests > GET /api/users/me
✓ User Routes Integration Tests > 敏感数据过滤
✓ User Routes Integration Tests > 性能测试
...

25 pass
0 fail
```

---

## 🐛 常见问题

### 问题 1: "Server is not running on localhost:3333"

**原因**: Elysia 服务器未启动

**解决**:
```bash
# 确保服务器运行
cd /Users/cairui/Code/uartserver-ng/uartserver-elysia
bun run dev
```

### 问题 2: "Cannot connect to MongoDB"

**原因**: MongoDB 未启动

**解决**:
```bash
# Docker 方式
docker compose -f docker-compose.dev.yml up -d mongodb

# Homebrew 方式
brew services start mongodb-community@7.0

# 验证连接
mongosh --eval "db.adminCommand('ping')"
```

### 问题 3: "Cannot connect to Docker daemon"

**原因**: Docker Desktop 未运行

**解决**:
```bash
# Mac: 启动 Docker Desktop
open -a Docker

# 等待 Docker 启动 (约 30 秒)
# 然后重新运行 docker compose 命令
```

### 问题 4: 测试超时

**原因**: MongoDB 数据库数据过多,查询变慢

**解决**:
```bash
# 清空测试数据
mongosh uart_server --eval "db.dropDatabase()"

# 重新运行测试
bun test test/integration/
```

### 问题 5: 端口 3333 被占用

**原因**: 其他进程占用端口

**解决**:
```bash
# 查找占用端口的进程
lsof -i :3333

# 杀死进程
kill -9 <PID>

# 或修改 .env 文件中的端口
PORT=3334
```

---

## 📊 性能测试

### 基础性能验证

集成测试已包含性能验证:

```typescript
// Alarm Routes - 目标: < 100ms
test('获取告警列表应该 < 100ms', async () => {
  const start = Date.now();
  await api.api.alarms.get({ query: { page: '1', limit: '20' } });
  expect(Date.now() - start).toBeLessThan(100);
});

// Data Query - 目标: < 50ms
test('最新数据查询应该 < 50ms', async () => {
  const start = Date.now();
  await api.api.data.latest({ mac: TEST_MAC, pid: TEST_PID }).get();
  expect(Date.now() - start).toBeLessThan(50);
});

// User Routes - 目标: < 50ms
test('获取当前用户信息应该 < 50ms', async () => {
  const start = Date.now();
  await api.api.users.me.get();
  expect(Date.now() - start).toBeLessThan(50);
});
```

### 高级性能测试 (可选)

使用 `wrk` 进行压力测试:

```bash
# 安装 wrk
brew install wrk

# 测试告警列表查询
wrk -t4 -c100 -d30s http://localhost:3333/api/alarms?page=1&limit=20

# 测试最新数据查询
wrk -t4 -c100 -d30s http://localhost:3333/api/data/latest/00:11:22:33:44:55/1001

# 测试用户信息查询
wrk -t4 -c100 -d30s http://localhost:3333/api/users/me
```

**预期结果**:
- 吞吐量: > 10,000 req/s
- 延迟 P50: < 10ms
- 延迟 P99: < 50ms

---

## 🧹 清理环境

### 停止服务

```bash
# 停止 Elysia 服务器
# Ctrl+C 或 kill 进程

# 停止 MongoDB (Docker)
docker compose -f docker-compose.dev.yml down

# 停止 MongoDB (Homebrew)
brew services stop mongodb-community@7.0
```

### 清理数据

```bash
# 删除测试数据 (Docker)
docker compose -f docker-compose.dev.yml down -v

# 删除测试数据 (本地)
mongosh uart_server --eval "db.dropDatabase()"
```

---

## 📝 一键测试脚本

创建 `scripts/test-phase7.sh`:

```bash
#!/bin/bash

set -e

echo "🚀 Phase 7 集成测试自动化脚本"
echo "================================="

# 1. 检查 MongoDB
echo "1️⃣ 检查 MongoDB..."
if ! mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
  echo "❌ MongoDB 未运行,正在启动..."

  # 尝试 Docker
  if command -v docker &> /dev/null; then
    docker compose -f docker-compose.dev.yml up -d mongodb
    sleep 5
  # 尝试 Homebrew
  elif command -v brew &> /dev/null; then
    brew services start mongodb-community@7.0
    sleep 3
  else
    echo "❌ 无法启动 MongoDB,请手动启动"
    exit 1
  fi
fi

echo "✅ MongoDB 运行中"

# 2. 启动服务器
echo "2️⃣ 启动 Elysia 服务器..."
bun run dev &
SERVER_PID=$!
sleep 2

# 等待服务器就绪
for i in {1..30}; do
  if curl -s http://localhost:3333/health > /dev/null; then
    echo "✅ 服务器启动成功"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "❌ 服务器启动超时"
    kill $SERVER_PID
    exit 1
  fi
  sleep 1
done

# 3. 运行测试
echo "3️⃣ 运行集成测试..."
bun test test/integration/alarm-routes.test.ts
bun test test/integration/data-query-routes.test.ts
bun test test/integration/user-routes.test.ts

# 4. 清理
echo "4️⃣ 清理环境..."
kill $SERVER_PID

echo "================================="
echo "✅ 所有测试完成!"
```

**使用**:
```bash
chmod +x scripts/test-phase7.sh
./scripts/test-phase7.sh
```

---

## 🎯 测试检查清单

在运行测试前,确保:

- [ ] Docker Desktop 运行中 (如果使用 Docker)
- [ ] MongoDB 运行在 localhost:27017
- [ ] Elysia 服务器运行在 localhost:3333
- [ ] 网络连接正常
- [ ] 没有其他进程占用端口 3333

测试完成后,验证:

- [ ] 所有 70+ 测试通过
- [ ] 无性能测试失败 (< 50ms, < 100ms 目标)
- [ ] 无验证错误 (Zod schema 验证)
- [ ] 无敏感数据泄露 (password, refreshToken 过滤)

---

## 📞 获取帮助

如果遇到问题:

1. 查看 `docs/DEVELOPMENT_SETUP.md` 详细设置指南
2. 查看 `docs/PHASE_7_SUMMARY.md` 完整项目总结
3. 检查服务器日志: `bun run dev` 输出
4. 检查 MongoDB 日志: `docker compose -f docker-compose.dev.yml logs mongodb`

---

**最后更新**: 2025-12-24
**预计测试时间**: < 5 分钟
**成功率**: 预期 100% (70+ 测试)
