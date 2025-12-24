# Scripts 目录

本目录包含自动化脚本，用于简化开发和测试流程。

---

## 📜 可用脚本

### `test-phase7.sh` - Phase 7 集成测试自动化

**功能**: 自动启动 MongoDB、Elysia 服务器并运行所有 Phase 7 集成测试

**使用方法**:

```bash
# 进入项目根目录
cd /Users/cairui/Code/uartserver-ng/uartserver-elysia

# 运行测试脚本
./scripts/test-phase7.sh
```

**脚本流程**:

1. ✅ 检查 MongoDB 是否运行
   - 如果未运行,自动启动 (Docker 或 Homebrew)
   - 验证连接成功

2. ✅ 启动 Elysia 开发服务器
   - 检查端口 3333 是否被占用
   - 等待服务器就绪
   - 验证健康检查

3. ✅ 运行集成测试
   - alarm-routes.test.ts (20+ 测试)
   - data-query-routes.test.ts (25+ 测试)
   - user-routes.test.ts (25+ 测试)

4. ✅ 清理环境
   - 停止 Elysia 服务器
   - 保留 MongoDB 运行 (可手动停止)

**预期输出**:

```
🚀 Phase 7 集成测试自动化脚本
=================================

1️⃣  检查 MongoDB...
✅ MongoDB 已运行

2️⃣  启动 Elysia 服务器...
   服务器 PID: 12345
   等待服务器启动...
✅ 服务器启动成功

3️⃣  运行集成测试...

📋 测试 Alarm Routes...
✅ Alarm Routes 测试通过

📋 测试 Data Query Routes...
✅ Data Query Routes 测试通过

📋 测试 User Routes...
✅ User Routes 测试通过

4️⃣  清理环境...
✅ 服务器已停止

=================================
✅ 所有测试完成! (70+ 测试通过)

📊 查看详细总结:
   docs/PHASE_7_SUMMARY.md
```

**故障排除**:

如果测试失败,脚本会提供调试建议:

```
❌ 部分测试失败

🔍 调试建议:
   1. 查看服务器日志: tail -f /tmp/elysia-server.log
   2. 检查 MongoDB 连接: mongosh --eval 'db.adminCommand({"ping": 1})'
   3. 查看测试输出详情
```

**环境要求**:

- **Bun**: >= 1.0.0
- **MongoDB**: 7.0 (Docker 或本地安装)
- **端口**: 3333 (Elysia), 27017 (MongoDB)

**可选依赖**:

- Docker Desktop (推荐): 自动启动 MongoDB
- Homebrew: 备用 MongoDB 安装方式

---

## 🛠️ 手动测试

如果不想使用自动化脚本,也可以手动运行:

```bash
# 1. 启动 MongoDB
docker compose -f docker-compose.dev.yml up -d mongodb
# 或
brew services start mongodb-community@7.0

# 2. 启动服务器
bun run dev

# 3. 新终端运行测试
bun test ./test/integration/alarm-routes.test.ts
bun test ./test/integration/data-query-routes.test.ts
bun test ./test/integration/user-routes.test.ts
```

---

## 📚 相关文档

- **快速测试指南**: `docs/QUICK_START_TESTING.md`
- **Phase 7 总结**: `docs/PHASE_7_SUMMARY.md`
- **开发环境设置**: `docs/DEVELOPMENT_SETUP.md`

---

**最后更新**: 2025-12-24
