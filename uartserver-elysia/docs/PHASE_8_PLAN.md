# Phase 8: 剩余 Controllers 迁移计划

**计划日期**: 2025-12-24
**预计工期**: 5-7 天
**目标**: 完成所有核心功能 API 迁移

---

## 📊 当前迁移状态

### ✅ 已完成 (Phase 7)

| Controller | 端点数 | 状态 | 文档 |
|-----------|--------|------|------|
| Terminal Management | 8 | ✅ Phase 4.2 | ✅ |
| Alarm Management | 10 | ✅ Phase 7 Day 1 | ✅ |
| Data Query | 9 | ✅ Phase 7 Day 2 | ✅ |
| User Management | 13 | ✅ Phase 7 Day 3 | ✅ |
| **已迁移总计** | **40** | **100%** | **✅** |

### 🔄 待迁移 (Phase 8)

分析原 Midway 项目发现以下 Controllers:

| 原文件 | 端点数 | 优先级 | 功能描述 |
|--------|--------|--------|----------|
| auth.controller.ts | 10 | 🔴 P0 | 认证登录 (必需) |
| api.controller.ts (协议相关) | ~8 | 🔴 P0 | 协议管理 |
| api.controller.ts (设备相关) | ~6 | 🟡 P1 | 设备类型/挂载 |
| api.controller.ts (微信相关) | ~4 | 🟢 P2 | 微信集成 |
| api.controller.ts (SMS/通知) | ~3 | 🟢 P2 | 短信验证 |
| log.controller.ts | 19 | 🟢 P3 | 系统日志 (Admin) |
| **待迁移总计** | **~50** | - | - |

---

## 🎯 Phase 8 迁移策略

### 优先级定义

- **P0 (Critical)**: 核心功能,必须迁移
- **P1 (High)**: 重要功能,建议迁移
- **P2 (Medium)**: 辅助功能,可选迁移
- **P3 (Low)**: 管理功能,后期迁移

### 分阶段计划

#### Phase 8.1: 认证系统 (Day 1-2) 🔴 P0

**目标**: 替换临时 `userId = 'system'` 为真实 JWT 认证

**迁移内容** (来自 `auth.controller.ts`):

| 端点 | 方法 | 新路径 | 功能 |
|------|------|--------|------|
| `/api/auth/login` | POST | `/api/auth/login` | 用户登录 |
| `/api/auth/logout` | POST | `/api/auth/logout` | 用户登出 |
| `/api/auth/refresh` | POST | `/api/auth/refresh` | 刷新 Token |
| `/api/auth/hash` | GET | `/api/auth/hash` | 获取加密 hash |
| `/api/auth/user` | GET | `/api/auth/me` | 获取当前用户 (重复) |
| `/api/auth/wxapp/login` | POST | `/api/auth/wechat/mini-program` | 微信小程序登录 |
| `/api/auth/wxopen/login` | POST | `/api/auth/wechat/open` | 微信开放平台登录 |
| `/api/auth/register` | POST | `/api/auth/register` | 用户注册 |
| `/api/auth/reset-password` | POST | `/api/auth/reset-password` | 重置密码 |
| `/api/auth/verify-email` | POST | `/api/auth/verify-email` | 验证邮箱 |

**新增文件**:
- `src/schemas/auth.schema.ts` (认证验证)
- `src/routes/auth.route.ts` (认证路由)
- `src/middleware/jwt.middleware.ts` (JWT 中间件) ⭐
- `test/integration/auth-routes.test.ts` (集成测试)

**关键技术**:
- `@elysiajs/jwt` 插件
- bcrypt 密码哈希
- JWT Token 签发和验证
- Refresh Token 机制

**预计工作量**: 600-800 行代码

---

#### Phase 8.2: 协议管理 (Day 3) 🔴 P0

**目标**: 协议 CRUD 和配置管理

**迁移内容** (来自 `api.controller.ts` 协议相关端点):

| 原端点 | 方法 | 新路径 | 功能 |
|--------|------|--------|------|
| `/api/getProtocol` | POST | `GET /api/protocols/:code` | 获取协议详情 |
| `/api/SendProcotolInstructSet` | POST | `POST /api/protocols/send-instruction` | 发送协议指令 |
| `/api/setUserSetupProtocol` | POST | `PUT /api/protocols/:code/user-setup` | 设置用户协议配置 |
| `/api/getTerminalPidProtocol` | POST | `GET /api/protocols/terminal/:mac/:pid` | 获取终端协议 |
| `/api/getProtocolSetup` | POST | `GET /api/protocols/:code/setup` | 获取协议配置 |
| `/api/getUserAlarmProtocol` | POST | `GET /api/protocols/:code/alarm-setup` | 获取用户告警协议 |
| `/api/getAlarmProtocol` | POST | `GET /api/protocols/:code/alarm` | 获取告警协议 |

**新增文件**:
- `src/schemas/protocol.schema.ts`
- `src/routes/protocol.route.ts`
- `test/integration/protocol-routes.test.ts`

**服务层**:
- 复用 `src/services/protocol.service.ts` (已存在)

**预计工作量**: 400-500 行代码

---

#### Phase 8.3: 设备类型与挂载管理 (Day 4) 🟡 P1

**目标**: 设备类型查询和挂载设备管理

**迁移内容** (来自 `api.controller.ts`):

| 原端点 | 方法 | 新路径 | 功能 |
|--------|------|--------|------|
| `/api/getDevTypes` | POST | `GET /api/device-types?type=:type` | 获取设备类型 |
| `/api/addTerminalMountDev` | POST | `POST /api/terminals/:mac/mount-devices` | 添加挂载设备 |
| `/api/delTerminalMountDev` | POST | `DELETE /api/terminals/:mac/mount-devices/:pid` | 删除挂载设备 |
| `/api/getTerminal` | POST | `GET /api/terminals/:mac` | 获取终端详情 |
| `/api/getRegisterDev` | POST | `GET /api/terminals/registered` | 获取注册设备列表 |
| `/api/refreshDevTimeOut` | POST | `POST /api/terminals/:mac/refresh-timeout` | 刷新设备超时 |

**新增文件**:
- `src/schemas/device-type.schema.ts`
- `src/routes/device-type.route.ts`
- `src/routes/terminal-mount.route.ts` (扩展 terminal.route.ts)
- `test/integration/device-type-routes.test.ts`

**预计工作量**: 350-450 行代码

---

#### Phase 8.4: 微信集成 (Day 5) 🟢 P2

**目标**: 微信公众号和小程序集成

**迁移内容** (来自 `api.controller.ts` 和 `wx.public.controller.ts`):

| 原端点 | 方法 | 新路径 | 功能 |
|--------|------|--------|------|
| `/api/mpTicket` | POST | `GET /api/wechat/official-account/qrcode` | 获取公众号二维码 |
| `/api/wpTicket` | POST | `GET /api/wechat/mini-program/qrcode` | 获取小程序二维码 |
| `/api/unbindwx` | POST | `DELETE /api/wechat/unbind` | 解绑微信 |
| `/api/qr` | POST | `GET /api/wechat/qrcode/:scene` | 生成场景二维码 |

**新增文件**:
- `src/schemas/wechat.schema.ts`
- `src/routes/wechat.route.ts`
- `test/integration/wechat-routes.test.ts`

**服务层**:
- 复用 `src/services/wechat.service.ts` (如果存在)
- 或创建新的 WeChat 服务

**预计工作量**: 300-400 行代码

---

#### Phase 8.5: SMS 验证与通知 (Day 6) 🟢 P2

**目标**: 短信验证码和通知功能

**迁移内容** (来自 `api.controller.ts`):

| 原端点 | 方法 | 新路径 | 功能 |
|--------|------|--------|------|
| `/api/smsValidation` | POST | `POST /api/sms/send-code` | 发送短信验证码 |
| `/api/smsCodeValidation` | POST | `POST /api/sms/verify-code` | 验证短信验证码 |

**新增文件**:
- `src/schemas/sms.schema.ts`
- `src/routes/sms.route.ts`
- `test/integration/sms-routes.test.ts`

**服务层**:
- 复用 SMS 服务 (如果存在)

**预计工作量**: 200-300 行代码

---

#### Phase 8.6: 系统日志 (Day 7) 🟢 P3

**目标**: 管理员日志查询 (Admin-only)

**迁移内容** (来自 `log.controller.ts`):

| 原端点 | 方法 | 新路径 | 功能 |
|--------|------|--------|------|
| `/api/root/log/wxEvent` | POST | `GET /api/admin/logs/wechat-events` | 微信事件日志 |
| `/api/root/log/getUseBtyes` | POST | `GET /api/admin/logs/device-usage/:mac` | 设备流量日志 |
| `/api/root/log/getDtuBusy` | POST | `GET /api/admin/logs/device-busy` | 设备繁忙日志 |
| `/api/root/log/terminalAggs` | POST | `GET /api/admin/logs/terminal-aggregated` | 终端聚合日志 |
| `/api/root/log/userAggs` | POST | `GET /api/admin/logs/user-aggregated` | 用户聚合日志 |
| ... | ... | ... | (其他 14 个日志端点) |

**新增文件**:
- `src/schemas/admin-log.schema.ts`
- `src/routes/admin-log.route.ts`
- `src/middleware/admin.middleware.ts` (管理员权限检查)
- `test/integration/admin-log-routes.test.ts`

**预计工作量**: 500-600 行代码

---

## 📈 工作量估算

### 代码统计

| 阶段 | Schemas | Routes | Tests | 总计 |
|------|---------|--------|-------|------|
| 8.1 认证系统 | 200 行 | 400 行 | 250 行 | 850 行 |
| 8.2 协议管理 | 150 行 | 300 行 | 200 行 | 650 行 |
| 8.3 设备类型 | 100 行 | 250 行 | 150 行 | 500 行 |
| 8.4 微信集成 | 100 行 | 200 行 | 150 行 | 450 行 |
| 8.5 SMS 验证 | 80 行 | 150 行 | 100 行 | 330 行 |
| 8.6 系统日志 | 150 行 | 350 行 | 200 行 | 700 行 |
| **总计** | **780** | **1,650** | **1,050** | **3,480 行** |

### 时间估算

| 阶段 | 复杂度 | 估计时间 | 优先级 |
|------|--------|----------|--------|
| 8.1 认证系统 | 高 | 2 天 | 🔴 P0 |
| 8.2 协议管理 | 中 | 1 天 | 🔴 P0 |
| 8.3 设备类型 | 中 | 1 天 | 🟡 P1 |
| 8.4 微信集成 | 中 | 1 天 | 🟢 P2 |
| 8.5 SMS 验证 | 低 | 0.5 天 | 🟢 P2 |
| 8.6 系统日志 | 中 | 1 天 | 🟢 P3 |
| **总计** | - | **6.5 天** | - |

---

## 🔧 技术栈和依赖

### 新增依赖

```bash
# JWT 认证
bun add @elysiajs/jwt

# 密码哈希
bun add bcryptjs
bun add -D @types/bcryptjs

# 短信服务 (可选)
# bun add aliyun-sdk

# 微信 SDK (可选)
# bun add wechat-jssdk
```

### Elysia 插件使用

```typescript
import { jwt } from '@elysiajs/jwt';

new Elysia()
  .use(jwt({
    name: 'jwt',
    secret: process.env.JWT_SECRET!,
    exp: '7d', // Token 过期时间
  }))
  .derive(async ({ jwt, cookie: { auth } }) => {
    // JWT 验证中间件
    const payload = await jwt.verify(auth.value);
    if (!payload) {
      throw new Error('Unauthorized');
    }
    return { userId: payload.userId };
  })
```

---

## ✅ Phase 8 完成标准

### 功能完整性

- [ ] 所有 P0 端点迁移完成 (认证 + 协议)
- [ ] 所有 P1 端点迁移完成 (设备类型)
- [ ] P2/P3 端点至少完成 50%

### 代码质量

- [ ] 所有端点通过 Zod 验证
- [ ] JWT 认证中间件正常工作
- [ ] 所有集成测试通过
- [ ] 无 TypeScript 类型错误

### 性能指标

- [ ] 认证端点 < 100ms
- [ ] 其他端点 < 50ms
- [ ] 并发支持 100+ 连接

### 文档

- [ ] Phase 8 每日总结 (6 个文档)
- [ ] API 端点文档更新
- [ ] JWT 认证使用指南

---

## 🎯 Phase 8 之后

### Phase 9: 优化和完善

1. **性能优化**
   - MongoDB 索引优化
   - Redis 缓存策略
   - 查询性能分析

2. **功能增强**
   - OpenAPI 文档生成
   - API 版本控制
   - 速率限制 (Rate Limiting)

3. **部署准备**
   - Docker 镜像优化
   - CI/CD 流水线
   - 生产环境配置

### Phase 10: 前端迁移

1. 前端框架选择 (Vue 3 / React)
2. API 客户端生成 (Eden Treaty)
3. 端到端类型安全

---

## 📝 注意事项

### 1. JWT 认证迁移影响

**重要**: Phase 8.1 完成后,所有已迁移的路由都需要更新:

```typescript
// 当前 (临时)
function getCurrentUserId(): string {
  return 'system';
}

// Phase 8.1 之后 (JWT)
.derive(async ({ jwt, cookie: { auth } }) => {
  const payload = await jwt.verify(auth.value);
  return { userId: payload.userId };
})

.get('/me', async ({ userId }) => {
  const user = await getUserService().getUserById(userId);
  // ...
});
```

**影响范围**: 所有 user routes, alarm routes, data-query routes (约 32 个端点)

### 2. 向后兼容性

- 保留原有端点路径 (如 `/api/BindDev`) 作为别名
- 使用 HTTP 301 重定向到新路径
- 提供迁移指南给前端团队

### 3. 数据库迁移

- MongoDB: 确保 users 集合有 `refreshToken` 字段
- 添加 JWT blacklist (Redis)
- 创建认证日志集合

---

## 📚 参考文档

- **Elysia JWT**: https://elysiajs.com/plugins/jwt.html
- **bcrypt**: https://github.com/kelektiv/node.bcrypt.js
- **JWT Best Practices**: https://tools.ietf.org/html/rfc8725
- **Phase 7 Summary**: `docs/PHASE_7_SUMMARY.md`

---

**计划版本**: 1.0
**创建日期**: 2025-12-24
**预计开始**: Phase 7 完成后
**预计完成**: 2025-12-31
