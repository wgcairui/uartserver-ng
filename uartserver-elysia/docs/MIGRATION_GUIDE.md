# Fastify → Elysia.js 迁移指南

UartServer NG Fastify 到 Elysia.js 迁移完整指南

**目标**: 保持 100% 业务逻辑兼容，实现 3.9x 性能提升，添加端到端类型安全

---

## 📋 目录

1. [迁移概览](#迁移概览)
2. [核心概念对比](#核心概念对比)
3. [逐步迁移指南](#逐步迁移指南)
4. [常见模式](#常见模式)
5. [注意事项](#注意事项)
6. [验证清单](#验证清单)

---

## 迁移概览

### 迁移范围

- **已完成**: 1/12 Controllers (terminal.controller.ts)
- **待迁移**: 11 Controllers
- **保持不变**:
  - 所有业务逻辑（services/）
  - 数据库实体（entities/）
  - 验证 schemas（schemas/）
  - 数据库连接（database/）

### 关键变化

| 方面 | Fastify | Elysia |
|-----|---------|--------|
| **路由定义** | 装饰器 `@Controller()` | 链式方法 `.get()` |
| **验证** | 装饰器 `@Validate()` | 配置对象 `{ body: Schema }` |
| **参数提取** | 装饰器 `@Body()` | 解构 `{ body }` |
| **响应格式** | 返回对象 | 返回对象（相同） |
| **类型安全** | 运行时 | 编译时 + 运行时 |

---

## 核心概念对比

### 1. Controller → Route

#### Fastify (旧)

```typescript
import { Controller, Get, Post } from '../decorators/controller';
import { Body, Query } from '../decorators/params';
import { Validate, type Validated } from '../decorators/validate';

@Controller('/api/terminal')
export class TerminalController {
  @Get('/cache/stats')
  async getCacheStats() {
    return { status: 'ok', data: stats };
  }

  @Post('/queryData')
  @Validate(QueryDataRequestSchema)
  async queryData(@Body() body: Validated<QueryDataRequest>) {
    const { data } = body;
    return { status: 'ok', data: result };
  }
}
```

#### Elysia (新)

```typescript
import { Elysia } from 'elysia';
import { QueryDataRequestSchema } from '../schemas/terminal.schema';

export const terminalRoutes = new Elysia({ prefix: '/api/terminal' })
  .get('/cache/stats', async (): Promise<CacheStatsResponse> => {
    return { status: 'ok', data: stats };
  })
  .post('/queryData', async ({ body }): Promise<QueryDataResponse> => {
    const { data } = body;
    return { status: 'ok', data: result };
  }, {
    body: QueryDataRequestSchema,  // Zod 验证
  });
```

### 2. 参数提取

#### Fastify (旧)

```typescript
@Post('/users')
async createUser(
  @Body() body: CreateUserRequest,
  @Query('page') page: string,
  @Params('id') id: string,
  @User('userId') userId: string
) {
  // ...
}
```

#### Elysia (新)

```typescript
.post('/users', async ({ body, query, params, userId }) => {
  // 直接解构使用
  const { page } = query;
  const { id } = params;
  // ...
}, {
  body: CreateUserRequestSchema,
  // query/params schema 也可以定义
})
```

### 3. 验证配置

#### Fastify (旧)

```typescript
@Post('/users')
@Validate(CreateUserRequestSchema)
@Validate(QuerySchema, 'query')
async createUser(@Body() body: Validated<CreateUserRequest>) {
  // ...
}
```

#### Elysia (新)

```typescript
.post('/users', async ({ body, query }) => {
  // ...
}, {
  body: CreateUserRequestSchema,
  query: QuerySchema,
})
```

### 4. 类型定义

#### Fastify (旧)

```typescript
// 手动定义返回类型
interface ApiResponse<T> {
  status: 'ok' | 'error';
  data?: T;
  message?: string;
}
```

#### Elysia (新)

```typescript
// 明确返回类型，Eden Treaty 自动推导
.get('/users', async (): Promise<ApiResponse<User[]>> => {
  return { status: 'ok', data: users };
})
```

---

## 逐步迁移指南

### Step 1: 创建新的 Route 文件

```bash
# 从 controllers/ 迁移到 routes/
src/controllers/alarm-rules.controller.ts
→
src/routes/alarm-rules.route.ts
```

### Step 2: 导入依赖

```typescript
// alarm-rules.route.ts
import { Elysia } from 'elysia';

// 复用现有的 schemas、services、types
import {
  CreateAlarmRuleRequestSchema,
  UpdateAlarmRuleRequestSchema,
  // ...
} from '../schemas/alarm-rules.schema';

import { AlarmRuleEngineService } from '../services/alarm-rule-engine.service';
import { mongodb } from '../database/mongodb';

// 类型定义
import type {
  CreateAlarmRuleRequest,
  CreateAlarmRuleResponse,
  // ...
} from '../schemas/alarm-rules.schema';
```

### Step 3: 初始化服务（模块级）

```typescript
// Elysia 使用模块级状态，而非类成员
const alarmEngine = new AlarmRuleEngineService(mongodb.getDatabase());
const notificationService = new AlarmNotificationService(
  mongodb.getDatabase()
);
```

### Step 4: 创建 Elysia 实例

```typescript
export const alarmRulesRoutes = new Elysia({ prefix: '/api/alarm-rules' })
  // 添加路由...
```

### Step 5: 迁移路由

#### GET 路由示例

```typescript
// Fastify
@Get('/')
@Validate(ListAlarmRulesQuerySchema, 'query')
async listRules(@Query() query: Validated<ListAlarmRulesQuery>) {
  const rules = await this.alarmEngine.listRules(query);
  return { status: 'ok', data: rules };
}

// ↓ Elysia ↓

.get('/', async ({ query }): Promise<ListAlarmRulesResponse> => {
  const rules = await alarmEngine.listRules(query);
  return { status: 'ok', data: rules };
}, {
  query: ListAlarmRulesQuerySchema,
})
```

#### POST 路由示例

```typescript
// Fastify
@Post('/')
@Validate(CreateAlarmRuleRequestSchema)
async createRule(@Body() body: Validated<CreateAlarmRuleRequest>) {
  const { data } = body;
  const ruleId = await this.alarmEngine.addRule(data);
  return { status: 'ok', data: { id: ruleId.toHexString() } };
}

// ↓ Elysia ↓

.post('/', async ({ body }): Promise<CreateAlarmRuleResponse> => {
  const { data } = body;
  const ruleId = await alarmEngine.addRule(data);
  return { status: 'ok', data: { id: ruleId.toHexString() } };
}, {
  body: CreateAlarmRuleRequestSchema,
})
```

#### DELETE 路由示例

```typescript
// Fastify
@Delete('/:id')
async deleteRule(@Params('id') id: string) {
  await this.alarmEngine.deleteRule(new ObjectId(id));
  return { status: 'ok', message: '删除成功' };
}

// ↓ Elysia ↓

.delete('/:id', async ({ params }): Promise<DeleteAlarmRuleResponse> => {
  const { id } = params;
  await alarmEngine.deleteRule(new ObjectId(id));
  return { status: 'ok', message: '删除成功' };
})
```

### Step 6: 在主应用中注册路由

```typescript
// src/index.ts
import { alarmRulesRoutes } from './routes/alarm-rules.route';

const app = new Elysia()
  .use(cors())
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))
  .use(zodValidator())
  .use(errorHandler())
  .use(socketPlugin)
  .use(terminalRoutes)
  .use(alarmRulesRoutes)  // 新增
  .listen({ port: 3333, ...engine.handler() });
```

### Step 7: 导出类型（Eden Treaty）

```typescript
// src/index.ts 底部
export type App = typeof app;
```

---

## 常见模式

### 1. 处理异常（统一格式）

```typescript
.post('/users', async ({ body }) => {
  try {
    const user = await createUser(body.data);
    return { status: 'ok', data: user };
  } catch (error) {
    // error-handler.ts 插件会自动处理
    throw error;
  }
}, {
  body: CreateUserRequestSchema,
})
```

### 2. 访问上下文（JWT、用户等）

```typescript
// 如果使用 JWT 插件
.get('/me', async ({ jwt, headers }): Promise<UserResponse> => {
  const token = headers.authorization?.replace('Bearer ', '');
  const payload = await jwt.verify(token);

  const user = await findUserById(payload.userId);
  return { status: 'ok', data: user };
})
```

### 3. 响应格式标准化

```typescript
// 所有响应使用统一格式
interface ApiResponse<T = unknown> {
  status: 'ok' | 'error';
  message?: string;
  data?: T;
}

// 成功响应
return { status: 'ok', data: result };

// 错误响应（由 error-handler.ts 处理）
throw new Error('详细错误信息');
```

### 4. Fire-and-Forget 模式

```typescript
// POST /api/terminal/queryData
.post('/queryData', async ({ body }): Promise<QueryDataResponse> => {
  const { data } = body;

  // 立即返回（Fire-and-Forget）
  setImmediate(() => {
    processDataInBackground(data).catch((error) => {
      console.error('Background processing error:', error);
    });
  });

  return { status: 'ok' };
}, {
  body: QueryDataRequestSchema,
})
```

### 5. 缓存集成

```typescript
// 使用 terminal-cache.ts
import { terminalCache } from '../repositories/terminal-cache';

.get('/cache/stats', async (): Promise<CacheStatsResponse> => {
  const stats = terminalCache.getStats();
  return { status: 'ok', data: stats };
})

.delete('/cache/:mac', async ({ params }): Promise<ClearCacheResponse> => {
  const { mac } = params;
  terminalCache.delete(mac);
  return { status: 'ok', message: `已清除 MAC: ${mac} 的缓存` };
})
```

---

## 注意事项

### ⚠️ 1. 不要修改业务逻辑

```typescript
// ❌ 错误：修改服务层逻辑
const result = await alarmEngine.addRule({
  ...data,
  newField: 'new-value'  // 不要添加新字段
});

// ✅ 正确：保持原样
const result = await alarmEngine.addRule(data);
```

### ⚠️ 2. 保持响应格式一致

```typescript
// ❌ 错误：改变响应格式
return { success: true, result: data };

// ✅ 正确：使用统一格式
return { status: 'ok', data: data };
```

### ⚠️ 3. 使用现有 Schemas

```typescript
// ❌ 错误：重写 Schema
const NewSchema = z.object({ ... });

// ✅ 正确：复用现有 Schema
import { CreateAlarmRuleRequestSchema } from '../schemas/alarm-rules.schema';
```

### ⚠️ 4. 类型安全

```typescript
// ❌ 错误：缺少返回类型
.get('/users', async () => {
  return { status: 'ok', data: users };
})

// ✅ 正确：明确返回类型
.get('/users', async (): Promise<ListUsersResponse> => {
  return { status: 'ok', data: users };
})
```

### ⚠️ 5. ObjectId 转换

```typescript
// ❌ 错误：直接使用字符串
const rule = await alarmEngine.getRule(id);

// ✅ 正确：转换为 ObjectId
import { ObjectId } from 'mongodb';
const rule = await alarmEngine.getRule(new ObjectId(id));
```

---

## 验证清单

### 代码检查

- [ ] 所有路由都有明确的返回类型
- [ ] 所有 POST/PUT 请求都配置了 `body: Schema`
- [ ] 所有 GET 请求（带查询参数）都配置了 `query: Schema`
- [ ] 服务层调用保持原样（参数、返回值不变）
- [ ] 响应格式统一：`{ status, message?, data? }`
- [ ] 异常处理委托给 error-handler 插件

### 功能测试

```bash
# 1. 启动服务器
bun run dev

# 2. 测试端点
curl http://localhost:3333/api/alarm-rules

# 3. 运行集成测试（如果有）
bun test test/integration/alarm-rules.test.ts
```

### 类型检查

```bash
# 编译检查
bun build src/index.ts

# TypeScript 类型检查
npx tsc --noEmit
```

### Eden Treaty 验证

```typescript
// test/eden-treaty.test.ts
import { treaty } from '@elysiajs/eden';
import type { App } from '../src/index';

const api = treaty<App>('localhost:3333');

// 测试类型推导
const { data, error } = await api.api['alarm-rules'].get();
//      ^? data: ListAlarmRulesResponse | undefined
```

---

## 完整示例：迁移 alarm-rules.controller.ts

### 原 Fastify Controller

```typescript
// src/controllers/alarm-rules.controller.ts
import { Controller, Get, Post, Put, Delete } from '../decorators/controller';
import { Body, Query, Params } from '../decorators/params';
import { Validate, type Validated } from '../decorators/validate';
import { AlarmRuleEngineService } from '../services/alarm-rule-engine.service';
import { mongodb } from '../database/mongodb';

@Controller('/api/alarm-rules')
export class AlarmRulesController {
  private alarmEngine: AlarmRuleEngineService;

  constructor() {
    this.alarmEngine = new AlarmRuleEngineService(mongodb.getDatabase());
  }

  @Get('/')
  @Validate(ListAlarmRulesQuerySchema, 'query')
  async listRules(@Query() query: Validated<ListAlarmRulesQuery>) {
    const rules = await this.alarmEngine.listRules(query);
    return { status: 'ok', data: rules };
  }

  @Post('/')
  @Validate(CreateAlarmRuleRequestSchema)
  async createRule(@Body() body: Validated<CreateAlarmRuleRequest>) {
    const { data } = body;
    const ruleId = await this.alarmEngine.addRule(data);
    return { status: 'ok', data: { id: ruleId.toHexString() } };
  }

  @Put('/:id')
  @Validate(UpdateAlarmRuleRequestSchema)
  async updateRule(
    @Params('id') id: string,
    @Body() body: Validated<UpdateAlarmRuleRequest>
  ) {
    const { data } = body;
    await this.alarmEngine.updateRule(new ObjectId(id), data);
    return { status: 'ok', message: '更新成功' };
  }

  @Delete('/:id')
  async deleteRule(@Params('id') id: string) {
    await this.alarmEngine.deleteRule(new ObjectId(id));
    return { status: 'ok', message: '删除成功' };
  }
}
```

### 新 Elysia Route

```typescript
// src/routes/alarm-rules.route.ts
import { Elysia } from 'elysia';
import { ObjectId } from 'mongodb';

// 复用现有代码
import {
  ListAlarmRulesQuerySchema,
  CreateAlarmRuleRequestSchema,
  UpdateAlarmRuleRequestSchema,
  type ListAlarmRulesQuery,
  type CreateAlarmRuleRequest,
  type UpdateAlarmRuleRequest,
  type ListAlarmRulesResponse,
  type CreateAlarmRuleResponse,
  type UpdateAlarmRuleResponse,
  type DeleteAlarmRuleResponse,
} from '../schemas/alarm-rules.schema';

import { AlarmRuleEngineService } from '../services/alarm-rule-engine.service';
import { mongodb } from '../database/mongodb';

// 模块级初始化（替代类成员）
const alarmEngine = new AlarmRuleEngineService(mongodb.getDatabase());

// Elysia Route
export const alarmRulesRoutes = new Elysia({ prefix: '/api/alarm-rules' })
  // GET /api/alarm-rules
  .get('/', async ({ query }): Promise<ListAlarmRulesResponse> => {
    const rules = await alarmEngine.listRules(query);
    return { status: 'ok', data: rules };
  }, {
    query: ListAlarmRulesQuerySchema,
  })

  // POST /api/alarm-rules
  .post('/', async ({ body }): Promise<CreateAlarmRuleResponse> => {
    const { data } = body;
    const ruleId = await alarmEngine.addRule(data);
    return { status: 'ok', data: { id: ruleId.toHexString() } };
  }, {
    body: CreateAlarmRuleRequestSchema,
  })

  // PUT /api/alarm-rules/:id
  .put('/:id', async ({ params, body }): Promise<UpdateAlarmRuleResponse> => {
    const { id } = params;
    const { data } = body;
    await alarmEngine.updateRule(new ObjectId(id), data);
    return { status: 'ok', message: '更新成功' };
  }, {
    body: UpdateAlarmRuleRequestSchema,
  })

  // DELETE /api/alarm-rules/:id
  .delete('/:id', async ({ params }): Promise<DeleteAlarmRuleResponse> => {
    const { id } = params;
    await alarmEngine.deleteRule(new ObjectId(id));
    return { status: 'ok', message: '删除成功' };
  });
```

---

## 性能优化建议

### 1. 避免阻塞操作

```typescript
// ❌ 错误：同步操作
.post('/upload', async ({ body }) => {
  fs.writeFileSync('/path/to/file', body.content);  // 阻塞
  return { status: 'ok' };
})

// ✅ 正确：异步操作
.post('/upload', async ({ body }) => {
  await fs.promises.writeFile('/path/to/file', body.content);
  return { status: 'ok' };
})
```

### 2. 使用 Fire-and-Forget 适当场景

```typescript
// 适用场景：日志记录、数据注入、通知发送
.post('/log', async ({ body }) => {
  setImmediate(() => {
    logService.writeLog(body.data).catch(console.error);
  });
  return { status: 'ok' };
})
```

### 3. 缓存高频查询

```typescript
// 使用 terminal-cache.ts 或 LRU cache
const cache = new LRUCache({ max: 500 });

.get('/terminals/:mac', async ({ params }) => {
  const cached = cache.get(params.mac);
  if (cached) return { status: 'ok', data: cached };

  const terminal = await findTerminal(params.mac);
  cache.set(params.mac, terminal);
  return { status: 'ok', data: terminal };
})
```

---

## 故障排查

### 问题 1: 类型推导失败

**症状**: Eden Treaty 客户端类型为 `any`

**解决**:
```typescript
// 确保导出 App 类型
export type App = typeof app;

// 确保所有路由都有返回类型
.get('/', async (): Promise<Response> => { ... })
```

### 问题 2: Zod 验证错误格式不友好

**症状**: 错误信息显示为原始 Zod 错误

**解决**: 确保使用 `zodValidator()` 插件
```typescript
// src/index.ts
import { zodValidator } from './plugins/zod-validator';

const app = new Elysia()
  .use(zodValidator())  // 必须添加
```

### 问题 3: ObjectId 类型错误

**症状**: `Argument of type 'string' is not assignable to parameter of type 'ObjectId'`

**解决**:
```typescript
import { ObjectId } from 'mongodb';

// 转换字符串 → ObjectId
const rule = await alarmEngine.getRule(new ObjectId(params.id));
```

### 问题 4: 服务层报错 "this is undefined"

**症状**: 服务方法内 `this` 为 undefined

**解决**: 使用模块级变量，而非类成员
```typescript
// ❌ 错误：类成员（Fastify 模式）
export class AlarmRulesController {
  private alarmEngine: AlarmRuleEngineService;
}

// ✅ 正确：模块级变量（Elysia 模式）
const alarmEngine = new AlarmRuleEngineService(mongodb.getDatabase());
```

---

## 下一步

完成一个 Controller 迁移后：

1. ✅ 运行类型检查：`npx tsc --noEmit`
2. ✅ 启动服务器：`bun run dev`
3. ✅ 测试 API 端点：`curl` 或 Postman
4. ✅ 编写集成测试（参考 `test/integration/terminal-routes.test.ts`）
5. ✅ 更新文档

---

## 参考资料

- [Elysia.js 官方文档](https://elysiajs.com/)
- [Eden Treaty 文档](https://elysiajs.com/eden/overview.html)
- [terminal.route.ts 示例](../src/routes/terminal.route.ts)
- [Phase 5 测试报告](./PHASE_5_TEST_REPORT.md)

---

**文档版本**: 1.0
**最后更新**: 2025-12-24
**状态**: Phase 6 - 文档总结
