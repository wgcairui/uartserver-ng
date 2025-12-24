# 开发环境配置指南

## 前置要求

### 必需软件

1. **Bun Runtime** (>= 1.0)
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. **MongoDB** (>= 6.0)

   **选项 A: 使用 Docker (推荐)**
   ```bash
   # 启动 Docker Desktop
   # 然后运行:
   docker-compose -f docker-compose.dev.yml up -d mongodb

   # 查看 MongoDB 管理界面
   # http://localhost:8081 (Mongo Express)
   ```

   **选项 B: 使用 Homebrew (macOS)**
   ```bash
   brew tap mongodb/brew
   brew install mongodb-community@7.0
   brew services start mongodb-community@7.0
   ```

   **选项 C: 手动安装**
   - 下载: https://www.mongodb.com/try/download/community
   - 启动: `mongod --dbpath /path/to/data`

## 快速开始

### 1. 安装依赖

```bash
cd uartserver-elysia
bun install
```

### 2. 配置环境变量

创建 `.env` 文件 (可选,已有默认配置):

```env
# Server
NODE_ENV=development
PORT=3333
HOST=0.0.0.0

# MongoDB
MONGODB_URI=mongodb://localhost:27017/uart_server

# PostgreSQL (Phase 8 需要)
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=pg123456

# Redis (Phase 9 需要)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
NODE_SECRET=your-node-client-secret-change-this-in-production
```

### 3. 启动 MongoDB

```bash
# 使用 Docker Compose (推荐)
docker-compose -f docker-compose.dev.yml up -d

# 或者使用系统安装的 MongoDB
brew services start mongodb-community
```

### 4. 运行应用

```bash
# 开发模式 (热重载)
bun run dev

# 生产模式
bun run build
bun start
```

### 5. 验证安装

访问 http://localhost:3333/health ,应该看到:

```json
{
  "status": "ok",
  "timestamp": "2025-12-24T08:00:00.000Z",
  "uptime": 1.234,
  "environment": "development"
}
```

## 运行测试

### 前提条件

确保 MongoDB 正在运行并且应用已启动:

```bash
# 终端 1: 启动应用
bun run dev

# 终端 2: 运行测试
bun test
```

### 运行特定测试

```bash
# 运行 Alarm 集成测试
bun test test/integration/alarm-routes.test.ts

# 运行所有集成测试
bun test test/integration/

# 运行单元测试
bun test test/unit/
```

## 开发工具

### MongoDB 管理

- **Mongo Express** (Web UI): http://localhost:8081
- **MongoDB Compass** (桌面应用): https://www.mongodb.com/products/compass

### 查看日志

```bash
# 应用日志
bun run dev

# Docker 服务日志
docker-compose -f docker-compose.dev.yml logs -f mongodb
```

## 常见问题

### Q: MongoDB 连接失败 "ECONNREFUSED"

**原因**: MongoDB 未运行

**解决方案**:
```bash
# 检查 MongoDB 是否运行
ps aux | grep mongod

# 启动 MongoDB (Docker)
docker-compose -f docker-compose.dev.yml up -d mongodb

# 或者启动系统 MongoDB
brew services start mongodb-community
```

### Q: 端口 3333 已被占用

**解决方案**:
```bash
# 修改 .env 文件
PORT=3334

# 或者杀掉占用端口的进程
lsof -ti:3333 | xargs kill -9
```

### Q: Bun 找不到命令

**解决方案**:
```bash
# 重新安装 Bun
curl -fsSL https://bun.sh/install | bash

# 添加到 PATH
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

## 项目结构

```
uartserver-elysia/
├── src/
│   ├── routes/          # API 路由
│   ├── services/        # 业务逻辑
│   ├── schemas/         # Zod 验证
│   ├── database/        # 数据库连接
│   ├── entities/        # 数据模型
│   └── index.ts         # 应用入口
├── test/
│   ├── integration/     # 集成测试
│   └── unit/            # 单元测试
├── docs/                # 文档
└── docker-compose.dev.yml  # 开发环境 Docker 配置
```

## 下一步

- 查看 [docs/ROADMAP.md](./ROADMAP.md) 了解项目进度
- 查看 [docs/API.md](./API.md) 了解 API 文档
- 查看 [docs/ARCHITECTURE.md](./ARCHITECTURE.md) 了解架构设计

## 需要帮助?

- 提交 Issue: https://github.com/your-org/uartserver-ng/issues
- 查看文档: [docs/README.md](./README.md)
