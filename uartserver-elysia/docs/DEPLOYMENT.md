# UartServer Elysia 部署指南

生产环境部署完整指南 - Docker + CI/CD + 监控

**版本**: 1.0
**日期**: 2025-12-24
**状态**: Phase 6 - 文档总结

---

## 📋 目录

1. [部署概览](#部署概览)
2. [环境准备](#环境准备)
3. [Docker 部署](#docker-部署)
4. [生产配置](#生产配置)
5. [CI/CD 流程](#cicd-流程)
6. [监控与日志](#监控与日志)
7. [故障排查](#故障排查)
8. [性能调优](#性能调优)

---

## 部署概览

### 部署架构

```
┌─────────────────────────────────────────────┐
│           Load Balancer (Nginx)              │
│         SSL/TLS Termination                  │
└──────────────┬──────────────────────────────┘
               │
       ┌───────┼───────┐
       ↓       ↓       ↓
┌────────┐ ┌────────┐ ┌────────┐
│ App 1  │ │ App 2  │ │ App 3  │  ← UartServer Elysia
│  3333  │ │  3334  │ │  3335  │     (Docker Containers)
└───┬────┘ └───┬────┘ └───┬────┘
    └──────────┼──────────┘
               ↓
┌─────────────────────────────────────────────┐
│          Shared Services                     │
│  ┌────────────┐  ┌──────────┐  ┌─────────┐ │
│  │  MongoDB   │  │Postgres  │  │  Redis  │ │
│  │    27017   │  │   5432   │  │  6379   │ │
│  └────────────┘  └──────────┘  └─────────┘ │
└─────────────────────────────────────────────┘
```

### 部署选项

| 方式 | 适用场景 | 难度 | 性能 |
|------|---------|------|------|
| **Docker Compose** | 开发/测试 | 低 | ★★★☆☆ |
| **Docker Swarm** | 小规模生产 | 中 | ★★★★☆ |
| **Kubernetes** | 大规模生产 | 高 | ★★★★★ |
| **Standalone** | 单机部署 | 低 | ★★★★☆ |

---

## 环境准备

### 系统要求

**最低配置**:
- CPU: 2 核
- 内存: 4 GB
- 磁盘: 20 GB SSD
- OS: Ubuntu 22.04+ / Debian 12+

**推荐配置**:
- CPU: 4 核+
- 内存: 8 GB+
- 磁盘: 50 GB+ SSD
- OS: Ubuntu 22.04 LTS

### 软件依赖

```bash
# 1. 安装 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 2. 安装 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 3. 验证安装
docker --version
docker-compose --version
```

### 端口规划

| 服务 | 端口 | 协议 | 说明 |
|------|------|------|------|
| UartServer | 3333 | HTTP/WS | 主应用端口 |
| MongoDB | 27017 | TCP | 数据库端口 |
| PostgreSQL | 5432 | TCP | 数据库端口 |
| Redis | 6379 | TCP | 缓存端口 (可选) |
| Nginx | 80/443 | HTTP/HTTPS | 反向代理 |

---

## Docker 部署

### 1. Dockerfile

创建 `Dockerfile`:

```dockerfile
# ─────────────────────────────────────────────
# Stage 1: Build
# ─────────────────────────────────────────────
FROM oven/bun:1 AS builder

WORKDIR /app

# 复制依赖文件
COPY package.json bun.lockb ./

# 安装依赖
RUN bun install --frozen-lockfile --production

# 复制源代码
COPY . .

# 编译为单个可执行文件
RUN bun build --compile --target bun --outfile uartserver src/index.ts

# ─────────────────────────────────────────────
# Stage 2: Runtime
# ─────────────────────────────────────────────
FROM debian:bookworm-slim

WORKDIR /app

# 安装运行时依赖
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 从构建阶段复制编译后的可执行文件
COPY --from=builder /app/uartserver ./uartserver

# 复制配置文件（如果需要）
COPY --from=builder /app/public ./public

# 创建非 root 用户
RUN useradd -m -u 1001 appuser && \
    chown -R appuser:appuser /app
USER appuser

# 暴露端口
EXPOSE 3333

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3333/health || exit 1

# 启动应用
CMD ["./uartserver"]
```

### 2. .dockerignore

创建 `.dockerignore`:

```
node_modules
.git
.gitignore
*.md
test/
docs/
.env
.env.local
dist/
coverage/
*.log
```

### 3. docker-compose.yml (生产环境)

创建 `docker-compose.yml`:

```yaml
version: '3.8'

services:
  # ─────────────────────────────────────────────
  # UartServer Elysia Application
  # ─────────────────────────────────────────────
  app:
    build:
      context: .
      dockerfile: Dockerfile
    image: uartserver-elysia:latest
    container_name: uartserver-app
    restart: unless-stopped
    ports:
      - "3333:3333"
    environment:
      - NODE_ENV=production
      - PORT=3333
      - MONGODB_URI=mongodb://mongodb:27017/uart_server
      - POSTGRES_HOST=postgres
      - POSTGRES_PORT=5432
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=uart_server
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - mongodb
      - postgres
      - redis
    networks:
      - uart-network
    volumes:
      - ./logs:/app/logs
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3333/health"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 10s

  # ─────────────────────────────────────────────
  # MongoDB
  # ─────────────────────────────────────────────
  mongodb:
    image: mongo:7
    container_name: uartserver-mongodb
    restart: unless-stopped
    ports:
      - "27017:27017"
    environment:
      - MONGO_INITDB_DATABASE=uart_server
    volumes:
      - mongodb-data:/data/db
      - ./mongo-init:/docker-entrypoint-initdb.d
    networks:
      - uart-network
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 3s
      retries: 5

  # ─────────────────────────────────────────────
  # PostgreSQL
  # ─────────────────────────────────────────────
  postgres:
    image: postgres:16-alpine
    container_name: uartserver-postgres
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=uart_server
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - uart-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 3s
      retries: 5

  # ─────────────────────────────────────────────
  # Redis (可选 - 用于会话/缓存)
  # ─────────────────────────────────────────────
  redis:
    image: redis:7-alpine
    container_name: uartserver-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    networks:
      - uart-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  # ─────────────────────────────────────────────
  # Nginx (反向代理)
  # ─────────────────────────────────────────────
  nginx:
    image: nginx:alpine
    container_name: uartserver-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - nginx-logs:/var/log/nginx
    depends_on:
      - app
    networks:
      - uart-network

networks:
  uart-network:
    driver: bridge

volumes:
  mongodb-data:
  postgres-data:
  redis-data:
  nginx-logs:
```

### 4. docker-compose.dev.yml (开发环境)

创建 `docker-compose.dev.yml`:

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    image: uartserver-elysia:dev
    container_name: uartserver-app-dev
    restart: unless-stopped
    ports:
      - "3333:3333"
    environment:
      - NODE_ENV=development
      - PORT=3333
      - MONGODB_URI=mongodb://mongodb:27017/uart_server_dev
      - POSTGRES_HOST=postgres
      - POSTGRES_PORT=5432
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=dev_password
      - POSTGRES_DB=uart_server_dev
    depends_on:
      - mongodb
      - postgres
    networks:
      - uart-network
    volumes:
      - .:/app
      - /app/node_modules
    command: bun run dev

  mongodb:
    image: mongo:7
    container_name: uartserver-mongodb-dev
    ports:
      - "27017:27017"
    environment:
      - MONGO_INITDB_DATABASE=uart_server_dev
    volumes:
      - mongodb-dev-data:/data/db
    networks:
      - uart-network

  postgres:
    image: postgres:16-alpine
    container_name: uartserver-postgres-dev
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=dev_password
      - POSTGRES_DB=uart_server_dev
    volumes:
      - postgres-dev-data:/var/lib/postgresql/data
    networks:
      - uart-network

networks:
  uart-network:
    driver: bridge

volumes:
  mongodb-dev-data:
  postgres-dev-data:
```

### 5. Nginx 配置

创建 `nginx/nginx.conf`:

```nginx
events {
    worker_connections 4096;
}

http {
    upstream uartserver {
        least_conn;
        server app:3333 max_fails=3 fail_timeout=30s;
    }

    # WebSocket 升级配置
    map $http_upgrade $connection_upgrade {
        default upgrade;
        '' close;
    }

    server {
        listen 80;
        server_name your-domain.com;

        # 重定向到 HTTPS
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        # SSL 证书
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;

        # SSL 配置
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;

        # 请求体大小限制
        client_max_body_size 10M;

        # 日志
        access_log /var/log/nginx/access.log;
        error_log /var/log/nginx/error.log;

        # 反向代理
        location / {
            proxy_pass http://uartserver;
            proxy_http_version 1.1;

            # Headers
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # WebSocket 支持
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;

            # 超时配置
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }

        # Socket.IO 路径
        location /socket.io/ {
            proxy_pass http://uartserver;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # 健康检查
        location /health {
            proxy_pass http://uartserver;
            access_log off;
        }

        # 静态文件
        location /static/ {
            alias /app/public/;
            expires 7d;
            add_header Cache-Control "public, immutable";
        }
    }
}
```

---

## 生产配置

### 1. 环境变量

创建 `.env.production`:

```bash
# Application
NODE_ENV=production
PORT=3333

# Database
MONGODB_URI=mongodb://mongodb:27017/uart_server
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_strong_password_here
POSTGRES_DB=uart_server

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# JWT
JWT_SECRET=your_jwt_secret_here_use_long_random_string

# Logging
LOG_LEVEL=info
LOG_FILE=/app/logs/app.log
```

### 2. 启动脚本

创建 `scripts/start-production.sh`:

```bash
#!/bin/bash

set -e

echo "🚀 Starting UartServer Elysia (Production)"

# 检查环境变量
if [ ! -f .env.production ]; then
    echo "❌ Error: .env.production file not found"
    exit 1
fi

# 加载环境变量
export $(cat .env.production | xargs)

# 拉取最新镜像
echo "📦 Pulling latest images..."
docker-compose pull

# 构建应用
echo "🔨 Building application..."
docker-compose build

# 启动服务
echo "🎯 Starting services..."
docker-compose up -d

# 等待健康检查
echo "⏳ Waiting for health checks..."
sleep 10

# 检查状态
echo "✅ Checking service status..."
docker-compose ps

# 查看日志
echo "📋 Recent logs:"
docker-compose logs --tail=50

echo "✨ Deployment complete!"
echo "🌐 Application running on http://localhost:3333"
```

### 3. 停止脚本

创建 `scripts/stop-production.sh`:

```bash
#!/bin/bash

set -e

echo "🛑 Stopping UartServer Elysia"

docker-compose down

echo "✅ Stopped successfully"
```

### 4. 备份脚本

创建 `scripts/backup.sh`:

```bash
#!/bin/bash

set -e

BACKUP_DIR="/backups/uartserver"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "💾 Starting backup..."

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 备份 MongoDB
echo "📦 Backing up MongoDB..."
docker exec uartserver-mongodb mongodump \
    --archive="/tmp/mongodb_backup_$TIMESTAMP.archive" \
    --gzip

docker cp uartserver-mongodb:/tmp/mongodb_backup_$TIMESTAMP.archive \
    "$BACKUP_DIR/"

# 备份 PostgreSQL
echo "📦 Backing up PostgreSQL..."
docker exec uartserver-postgres pg_dump -U postgres uart_server | \
    gzip > "$BACKUP_DIR/postgres_backup_$TIMESTAMP.sql.gz"

# 清理旧备份 (保留最近 7 天)
echo "🧹 Cleaning old backups..."
find "$BACKUP_DIR" -type f -mtime +7 -delete

echo "✅ Backup complete: $BACKUP_DIR"
```

---

## CI/CD 流程

### 1. GitHub Actions Workflow

创建 `.github/workflows/deploy.yml`:

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  # ─────────────────────────────────────────────
  # 测试
  # ─────────────────────────────────────────────
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Run tests
        run: bun test

      - name: Type check
        run: bun run type-check

  # ─────────────────────────────────────────────
  # 构建 Docker 镜像
  # ─────────────────────────────────────────────
  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: |
            ${{ secrets.DOCKER_USERNAME }}/uartserver-elysia:latest
            ${{ secrets.DOCKER_USERNAME }}/uartserver-elysia:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ─────────────────────────────────────────────
  # 部署到生产环境
  # ─────────────────────────────────────────────
  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to server
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_KEY }}
          script: |
            cd /opt/uartserver
            docker-compose pull
            docker-compose up -d
            docker-compose ps
```

### 2. GitLab CI/CD

创建 `.gitlab-ci.yml`:

```yaml
stages:
  - test
  - build
  - deploy

variables:
  DOCKER_IMAGE: $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA

# ─────────────────────────────────────────────
# 测试阶段
# ─────────────────────────────────────────────
test:
  stage: test
  image: oven/bun:latest
  script:
    - bun install
    - bun test
    - bun run type-check
  only:
    - branches

# ─────────────────────────────────────────────
# 构建阶段
# ─────────────────────────────────────────────
build:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  before_script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
  script:
    - docker build -t $DOCKER_IMAGE .
    - docker tag $DOCKER_IMAGE $CI_REGISTRY_IMAGE:latest
    - docker push $DOCKER_IMAGE
    - docker push $CI_REGISTRY_IMAGE:latest
  only:
    - main

# ─────────────────────────────────────────────
# 部署阶段
# ─────────────────────────────────────────────
deploy:
  stage: deploy
  image: alpine:latest
  before_script:
    - apk add --no-cache openssh-client
    - eval $(ssh-agent -s)
    - echo "$DEPLOY_KEY" | ssh-add -
  script:
    - ssh $DEPLOY_USER@$DEPLOY_HOST "cd /opt/uartserver && docker-compose pull && docker-compose up -d"
  only:
    - main
```

---

## 监控与日志

### 1. 应用监控

#### Prometheus + Grafana

创建 `monitoring/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'uartserver'
    static_configs:
      - targets: ['app:3333']
```

#### 添加到 docker-compose.yml:

```yaml
  prometheus:
    image: prom/prometheus:latest
    container_name: uartserver-prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    networks:
      - uart-network

  grafana:
    image: grafana/grafana:latest
    container_name: uartserver-grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana-data:/var/lib/grafana
    depends_on:
      - prometheus
    networks:
      - uart-network
```

### 2. 日志管理

#### 结构化日志

```typescript
// src/utils/logger.ts
export const logger = {
  info: (message: string, meta?: object) => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      message,
      ...meta,
    }));
  },

  error: (message: string, error?: Error, meta?: object) => {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      message,
      error: error?.message,
      stack: error?.stack,
      ...meta,
    }));
  },
};
```

#### ELK Stack (可选)

```yaml
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
    ports:
      - "9200:9200"
    volumes:
      - elasticsearch-data:/usr/share/elasticsearch/data

  logstash:
    image: docker.elastic.co/logstash/logstash:8.11.0
    volumes:
      - ./logstash/logstash.conf:/usr/share/logstash/pipeline/logstash.conf
    depends_on:
      - elasticsearch

  kibana:
    image: docker.elastic.co/kibana/kibana:8.11.0
    ports:
      - "5601:5601"
    depends_on:
      - elasticsearch
```

---

## 故障排查

### 常见问题

#### 1. 容器无法启动

```bash
# 查看容器日志
docker-compose logs app

# 查看详细错误
docker-compose logs --tail=100 app

# 进入容器调试
docker-compose exec app sh
```

#### 2. 数据库连接失败

```bash
# 检查数据库状态
docker-compose ps mongodb postgres

# 测试连接
docker-compose exec mongodb mongosh --eval "db.adminCommand('ping')"
docker-compose exec postgres psql -U postgres -c "SELECT 1"
```

#### 3. 性能问题

```bash
# 查看资源使用
docker stats

# 查看容器资源限制
docker-compose config

# 增加资源限制 (docker-compose.yml)
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
```

---

## 性能调优

### 1. Bun 优化

```bash
# 设置 Bun 环境变量
export BUN_JSC_useJIT=1
export BUN_JSC_useBBQJIT=1
```

### 2. MongoDB 优化

```javascript
// 创建索引
db.terminals.createIndex({ mac: 1 });
db['alarm.rules'].createIndex({ enabled: 1, mac: 1 });
db['notification.logs'].createIndex({ createdAt: -1 });
```

### 3. Nginx 优化

```nginx
# 启用 gzip 压缩
gzip on;
gzip_types text/plain text/css application/json application/javascript;
gzip_min_length 1000;

# 缓存静态资源
location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

---

## 安全最佳实践

### 1. 环境变量安全

```bash
# 不要将 .env 文件提交到 Git
echo ".env*" >> .gitignore

# 使用 secrets 管理敏感信息
docker secret create jwt_secret /path/to/secret
```

### 2. 网络隔离

```yaml
# docker-compose.yml
networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true  # 仅内部访问

services:
  app:
    networks:
      - frontend
      - backend
  mongodb:
    networks:
      - backend  # 仅后端访问
```

### 3. 定期更新

```bash
# 更新基础镜像
docker-compose pull
docker-compose up -d

# 更新系统包
apt-get update && apt-get upgrade -y
```

---

## 快速参考

### 常用命令

```bash
# 启动所有服务
docker-compose up -d

# 停止所有服务
docker-compose down

# 查看日志
docker-compose logs -f app

# 重启应用
docker-compose restart app

# 查看状态
docker-compose ps

# 进入容器
docker-compose exec app sh

# 清理未使用的资源
docker system prune -a
```

---

**文档版本**: 1.0
**最后更新**: 2025-12-24
**状态**: Phase 6 - 文档总结
