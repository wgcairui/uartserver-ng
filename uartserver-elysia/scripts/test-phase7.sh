#!/bin/bash

set -e

echo "🚀 Phase 7 集成测试自动化脚本"
echo "================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 进入项目目录
cd "$(dirname "$0")/.."

# 1. 检查 MongoDB
echo "1️⃣  检查 MongoDB..."
if mongosh --quiet --eval "db.adminCommand('ping').ok" > /dev/null 2>&1; then
  echo -e "${GREEN}✅ MongoDB 已运行${NC}"
else
  echo -e "${YELLOW}⚠️  MongoDB 未运行,尝试启动...${NC}"

  # 尝试 Docker
  if command -v docker &> /dev/null; then
    echo "   使用 Docker Compose 启动 MongoDB..."
    docker compose -f docker-compose.dev.yml up -d mongodb
    echo "   等待 MongoDB 启动..."
    sleep 5

    # 验证启动成功
    if mongosh --quiet --eval "db.adminCommand('ping').ok" > /dev/null 2>&1; then
      echo -e "${GREEN}✅ MongoDB 启动成功 (Docker)${NC}"
    else
      echo -e "${RED}❌ MongoDB 启动失败${NC}"
      exit 1
    fi

  # 尝试 Homebrew
  elif command -v brew &> /dev/null; then
    echo "   使用 Homebrew 启动 MongoDB..."
    brew services start mongodb-community@7.0 2>/dev/null || brew services start mongodb-community
    sleep 3

    if mongosh --quiet --eval "db.adminCommand('ping').ok" > /dev/null 2>&1; then
      echo -e "${GREEN}✅ MongoDB 启动成功 (Homebrew)${NC}"
    else
      echo -e "${RED}❌ MongoDB 启动失败${NC}"
      exit 1
    fi

  else
    echo -e "${RED}❌ 无法启动 MongoDB,请手动启动${NC}"
    echo "   提示: 运行以下命令之一:"
    echo "   - docker compose -f docker-compose.dev.yml up -d mongodb"
    echo "   - brew services start mongodb-community@7.0"
    echo "   - mongod --dbpath /usr/local/var/mongodb"
    exit 1
  fi
fi

echo ""

# 2. 启动服务器
echo "2️⃣  启动 Elysia 服务器..."

# 检查端口是否被占用
if lsof -Pi :3333 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
  echo -e "${YELLOW}⚠️  端口 3333 已被占用,尝试关闭...${NC}"
  PID=$(lsof -Pi :3333 -sTCP:LISTEN -t)
  kill $PID 2>/dev/null || true
  sleep 2
fi

# 启动服务器
bun run dev > /tmp/elysia-server.log 2>&1 &
SERVER_PID=$!
echo "   服务器 PID: $SERVER_PID"

# 等待服务器就绪
echo "   等待服务器启动..."
for i in {1..30}; do
  if curl -s http://localhost:3333/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 服务器启动成功${NC}"
    break
  fi
  if [ $i -eq 30 ]; then
    echo -e "${RED}❌ 服务器启动超时${NC}"
    echo "   查看日志: tail -f /tmp/elysia-server.log"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

echo ""

# 3. 运行测试
echo "3️⃣  运行集成测试..."
echo ""

TEST_FAILED=0

# Alarm Routes 测试
echo "📋 测试 Alarm Routes..."
if bun test ./test/integration/alarm-routes.test.ts; then
  echo -e "${GREEN}✅ Alarm Routes 测试通过${NC}"
else
  echo -e "${RED}❌ Alarm Routes 测试失败${NC}"
  TEST_FAILED=1
fi
echo ""

# Data Query Routes 测试
echo "📋 测试 Data Query Routes..."
if bun test ./test/integration/data-query-routes.test.ts; then
  echo -e "${GREEN}✅ Data Query Routes 测试通过${NC}"
else
  echo -e "${RED}❌ Data Query Routes 测试失败${NC}"
  TEST_FAILED=1
fi
echo ""

# User Routes 测试
echo "📋 测试 User Routes..."
if bun test ./test/integration/user-routes.test.ts; then
  echo -e "${GREEN}✅ User Routes 测试通过${NC}"
else
  echo -e "${RED}❌ User Routes 测试失败${NC}"
  TEST_FAILED=1
fi
echo ""

# 4. 清理
echo "4️⃣  清理环境..."
kill $SERVER_PID 2>/dev/null || true
echo -e "${GREEN}✅ 服务器已停止${NC}"

echo ""
echo "================================="
if [ $TEST_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ 所有测试完成! (70+ 测试通过)${NC}"
  echo ""
  echo "📊 查看详细总结:"
  echo "   docs/PHASE_7_SUMMARY.md"
  exit 0
else
  echo -e "${RED}❌ 部分测试失败${NC}"
  echo ""
  echo "🔍 调试建议:"
  echo "   1. 查看服务器日志: tail -f /tmp/elysia-server.log"
  echo "   2. 检查 MongoDB 连接: mongosh --eval 'db.adminCommand({\"ping\": 1})'"
  echo "   3. 查看测试输出详情"
  exit 1
fi
