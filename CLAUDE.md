# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 提供项目工作指南。

## 项目概述

这是一个基于 Fastify + TypeScript 的 IoT UART 服务器重构项目 (uartserver-ng)，从原有的 Midway.js 架构迁移到更轻量化的技术栈。系统管理 DTU 设备、协议、实时数据采集，使用双数据库策略 (MongoDB + PostgreSQL)。

**技术栈**:
- **框架**: Fastify (替代 Midway.js/Koa)
- **语言**: TypeScript (严格模式)
- **数据库**: MongoDB (运行时数据) + PostgreSQL (配置数据)
- **验证**: Zod (类型安全的运行时验证)
- **实时通信**: Socket.IO (待迁移)
- **任务队列**: BullMQ (待迁移)

---

## 开发命令

### 运行应用
- `npm run dev` - 启动开发服务器 (热重载)
- `npm start` - 启动生产服务器
- `npm run build` - 编译 TypeScript 到 `dist/`

### 代码质量
- `npm run lint` - 检查代码风格
- `npm run lint:fix` - 自动修复代码风格问题
- `npm test` - 运行单元测试
- `npx tsc --noEmit` - 运行类型检查 (不生成文件)

---

## 核心架构模式

### 1. 装饰器系统

项目使用自定义装饰器系统 (无需 reflect-metadata)，通过 Map 存储元数据。

#### Controller 装饰器

```typescript
@Controller('/api/users')
export class UserController {
  @Get('/')
  async listUsers() { ... }

  @Post('/')
  async createUser() { ... }
}
```

#### 参数装饰器

```typescript
@Post('/users')
async createUser(
  @Body() body: CreateUserRequest,
  @Query('page') page: string,
  @Params('id') id: string,
  @User('userId') userId: string
) { ... }
```

### 2. Zod 验证装饰器 ⭐

**核心规范**: 所有 API 参数必须使用 Zod schema 验证，避免使用 `any` 和 `unknown` 类型。

#### 基本用法（推荐：集成到参数装饰器）

```typescript
// 1. 创建 Schema (schemas/*.schema.ts)
export const CreateUserRequestSchema = z.object({
  data: z.object({
    username: z.string().min(3, '用户名至少 3 个字符'),
    email: z.string().email('无效的邮箱地址'),
    age: z.number().int().min(18, '年龄必须 >= 18'),
  }),
});

// 2. 推导类型 (单一数据源)
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

// 3. 在 Controller 中应用 - 直接传入 schema 到参数装饰器
@Post('/users')
async createUser(@Body(CreateUserRequestSchema) body: CreateUserRequest) {
  const { data } = body;  // 类型安全,已验证
  return { status: 'ok', data };
}
```

#### 验证不同的请求部分

```typescript
// 验证 Body
@Post('/users')
async createUser(@Body(CreateUserRequestSchema) body: CreateUserRequest) { ... }

// 验证 Query (支持自动类型转换)
@Get('/users')
async listUsers(@Query(ListUsersQuerySchema) query: ListUsersQuery) { ... }

// 验证 Params
@Get('/users/:id')
async getUser(@Params(UserIdParamsSchema) params: UserIdParams) { ... }
```

#### 旧方式（使用 @Validate 装饰器，仍然支持）

```typescript
import { Validate, type Validated } from '../decorators/validate';

// 验证 Body
@Post('/users')
@Validate(CreateUserRequestSchema)
async createUser(@Body() body: Validated<CreateUserRequest>) { ... }

// 验证 Query
@Get('/users')
@Validate(ListUsersQuerySchema, 'query')
async listUsers(@Query() query: Validated<ListUsersQuery>) { ... }
```

#### Schema 高级特性

```typescript
// 类型转换 (query 参数自动转换)
export const ListUsersQuerySchema = z.object({
  page: z.string().optional().default('1')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  limit: z.string().optional().default('50')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive().max(100)),
});

// 跨字段验证
export const CreateRuleRequestSchema = z.object({
  data: z.object({
    type: z.enum(['threshold', 'constant']),
    threshold: ThresholdSchema.optional(),
    constant: ConstantSchema.optional(),
  }),
}).refine(
  (data) => {
    // 业务逻辑验证
    if (data.data.type === 'threshold' && !data.data.threshold) {
      return false;
    }
    return true;
  },
  { message: '规则类型与条件不匹配' }
);
```

### 3. 双数据库策略

- **MongoDB** (Native Driver): **热数据** - 用户 (users)、终端 (terminals)、协议 (protocols)、告警规则等频繁访问的数据
- **PostgreSQL** (TypeORM): **冷数据** - 历史数据、日志、归档记录等不常访问的数据

**集合命名规范**:
- MongoDB: `entity.collection` (如 `alarm.rules`, `notification.logs`)
- 索引命名: `collection.field1_field2_idx`

### 4. 实体层组织

```
src/
  entities/
    mongodb/              # MongoDB 实体
      alarm-rule.entity.ts
      alarm.entity.ts
      notification-log.entity.ts
      index.ts            # 统一导出
    typeorm/              # PostgreSQL 实体
      protocol.entity.ts
      device-type.entity.ts
```

**实体设计原则**:
- 使用 MongoDB Native Driver,不使用 Typegoose
- 实体文件提供类型定义和辅助函数
- 集合初始化在 `index.ts` 中统一管理

---

## 代码规范

### 1. TypeScript 严格模式

**禁止使用**:
- ❌ `any` 类型
- ❌ `unknown` 类型 (除非配合 Zod 验证)
- ❌ 类型断言 `as` (除非必要)
- ❌ `@ts-ignore` / `@ts-expect-error`

**推荐使用**:
- ✅ `Validated<T>` 类型 (已通过 Zod 验证的数据)
- ✅ 明确的接口定义
- ✅ 从 Zod schema 推导类型 (`z.infer<typeof Schema>`)

### 2. 验证规范

所有 API 端点必须使用 `@Validate()` 装饰器:

```typescript
// ❌ 错误: 手动验证
@Post('/users')
async createUser(@Body('data') data: any) {
  if (!data.name) {
    return { status: 'error', message: 'Name required' };
  }
  // ...
}

// ✅ 正确: Zod 验证
@Post('/users')
@Validate(CreateUserRequestSchema)
async createUser(@Body() body: Validated<CreateUserRequest>) {
  const { data } = body;  // 已验证,类型安全
  // ...
}
```

### 3. 错误处理

统一的 API 响应格式:

```typescript
interface ApiResponse<T = unknown> {
  status: 'ok' | 'error';
  message?: string;
  data: T | null;
}
```

验证失败自动返回:
```json
{
  "status": "error",
  "message": "data.username: 用户名至少 3 个字符",
  "data": null
}
```

### 4. 文件命名规范

- **Controllers**: `*.controller.ts`
- **Services**: `*.service.ts`
- **Entities**: `*.entity.ts`
- **Schemas**: `*.schema.ts`
- **Decorators**: `*.ts` (在 `decorators/` 目录)
- **Utils**: `*.ts` (在 `utils/` 目录)

---

## 项目结构

```
uartserver-ng/
├── src/
│   ├── controllers/          # API 控制器
│   │   └── alarm-rules.controller.ts
│   ├── services/             # 业务逻辑层
│   │   ├── alarm-rule-engine.service.ts
│   │   └── alarm-notification.service.ts
│   ├── entities/             # 数据实体
│   │   ├── mongodb/          # MongoDB 实体
│   │   └── typeorm/          # PostgreSQL 实体
│   ├── schemas/              # Zod 验证 schemas
│   │   └── alarm-rules.schema.ts
│   ├── decorators/           # 装饰器系统
│   │   ├── controller.ts     # @Controller, @Get, @Post
│   │   ├── params.ts         # @Body, @Query, @Params
│   │   └── validate.ts       # @Validate
│   ├── utils/                # 工具函数
│   │   └── route-loader.ts   # 路由加载器
│   ├── database/             # 数据库连接
│   │   ├── mongodb.ts
│   │   └── postgres.ts
│   ├── config/               # 配置文件
│   ├── types/                # 类型定义
│   └── app.ts                # 应用入口
├── docs/                     # 文档 (见 docs/README.md)
├── CLAUDE.md                 # 本文件
└── package.json
```

---

## 常见模式

### 1. 创建新的 API 端点

```typescript
// 1. 创建 Schema (src/schemas/product.schema.ts)
export const CreateProductRequestSchema = z.object({
  data: z.object({
    name: z.string().min(1, '产品名称不能为空'),
    price: z.number().positive('价格必须 > 0'),
  }),
});
export type CreateProductRequest = z.infer<typeof CreateProductRequestSchema>;

// 2. 创建 Controller (src/controllers/product.controller.ts)
import { Controller, Post } from '../decorators/controller';
import { Body } from '../decorators/params';
import { Validate, type Validated } from '../decorators/validate';
import { CreateProductRequestSchema, type CreateProductRequest } from '../schemas/product.schema';

@Controller('/api/products')
export class ProductController {
  @Post('/')
  @Validate(CreateProductRequestSchema)
  async createProduct(@Body() body: Validated<CreateProductRequest>) {
    const { data } = body;
    // 业务逻辑
    return { status: 'ok', data: { id: 1, ...data } };
  }
}

// 3. 注册 Controller (src/app.ts)
import { ProductController } from './controllers/product.controller';
registerControllers(app, [ProductController, ...]);
```

### 2. MongoDB 实体操作

```typescript
// 使用 Phase3Collections
import { mongodb } from '../database/mongodb';
import { Phase3Collections } from '../entities/mongodb';

const collections = new Phase3Collections(mongodb.getDatabase());

// 查询
const rules = await collections.alarmRules.find({ enabled: true }).toArray();

// 插入
const result = await collections.alarmRules.insertOne(newRule);

// 更新
await collections.alarmRules.updateOne(
  { _id: ruleId },
  { $set: { enabled: false } }
);

// 删除
await collections.alarmRules.deleteOne({ _id: ruleId });
```

### 3. 服务层依赖注入

```typescript
export class AlarmRuleEngineService {
  private collections: Phase3Collections;

  constructor(db: Db) {
    this.collections = new Phase3Collections(db);
  }

  async addRule(rule: AlarmRuleDocument): Promise<ObjectId> {
    const result = await this.collections.alarmRules.insertOne(rule);
    return result.insertedId;
  }
}

// 在 Controller 中使用
@Controller('/api/alarm-rules')
export class AlarmRulesController {
  private alarmEngine: AlarmRuleEngineService;

  constructor() {
    this.alarmEngine = new AlarmRuleEngineService(mongodb.getDatabase());
  }
}
```

---

## 常见陷阱

### 1. ❌ 不要绕过验证装饰器

```typescript
// ❌ 错误
@Post('/users')
async createUser(@Body('data') data: any) {
  if (!data.name) { ... }  // 手动验证
}

// ✅ 正确
@Post('/users')
@Validate(CreateUserRequestSchema)
async createUser(@Body() body: Validated<CreateUserRequest>) {
  const { data } = body;  // 自动验证
}
```

### 2. ❌ 不要手动类型转换查询参数

```typescript
// ❌ 错误
@Get('/users')
async listUsers(@Query('page') page: string) {
  const pageNum = parseInt(page);  // 手动转换
}

// ✅ 正确
export const ListUsersQuerySchema = z.object({
  page: z.string().default('1')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),
});

@Get('/users')
@Validate(ListUsersQuerySchema, 'query')
async listUsers(@Query() query: Validated<ListUsersQuery>) {
  const { page } = query;  // 自动转换为 number
}
```

### 3. ❌ 不要使用 any 类型

```typescript
// ❌ 错误
const filter: any = {};

// ✅ 正确
interface RuleFilter {
  type?: string;
  level?: string;
  enabled?: boolean;
}
const filter: RuleFilter = {};
```

### 4. ❌ 不要分离类型定义和验证

```typescript
// ❌ 错误: 重复定义,易出错
export interface CreateUserRequest { ... }
export const CreateUserRequestSchema = z.object({ ... });

// ✅ 正确: 单一数据源
export const CreateUserRequestSchema = z.object({ ... });
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;
```

---

## 迁移注意事项

从 Midway.js 迁移到 Fastify 时注意:

1. **装饰器**: Midway 使用 `@Inject()`,Fastify 使用构造函数注入
2. **中间件**: Midway 使用 Koa 中间件,Fastify 使用 hooks/plugins
3. **验证**: Midway 使用 `@Validate()` + class-validator,Fastify 使用 Zod
4. **响应格式**: 保持统一的 `{status, message, data}` 格式

---

## 文档索引

详细文档请参考 [`docs/README.md`](./docs/README.md):

### 核心文档
- **[验证装饰器指南](./docs/VALIDATION_DECORATOR.md)** - Zod 验证系统完整指南 ⭐
- **[数据库架构](./docs/DATABASE_ARCHITECTURE.md)** - MongoDB + PostgreSQL 设计
- **[API 文档](./docs/API_ALARM_RULES.md)** - 告警规则 API 参考

### 开发文档
- **[Phase 3 计划](./docs/PHASE_3_PLAN.md)** - 当前开发阶段
- **[服务层集成](./docs/SERVICE_LAYER_INTEGRATION.md)** - 服务层 MongoDB 集成

完整文档列表请查看 `docs/README.md`。

---

## 测试

```bash
# 运行测试
npm test

# 类型检查
npx tsc --noEmit

# 覆盖率
npm run cov
```

测试文件应与源文件放在同一目录或 `test/` 目录。

---

## 配置

环境变量 (`.env`):

```bash
# 数据库
MONGODB_URI=mongodb://localhost:27017/uart_server
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DB=uart_server

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# 服务器
PORT=3000
NODE_ENV=development
```

---

## 提交规范

遵循 Conventional Commits:

```bash
feat: 添加新功能
fix: 修复 bug
docs: 文档更新
refactor: 代码重构
test: 测试相关
chore: 构建/工具相关
```

示例:
```bash
git commit -m "feat(validation): implement Zod validation decorator"
git commit -m "fix(alarm-rules): correct type error in filter"
git commit -m "docs: update CLAUDE.md with validation guide"
```

---

**文档版本**: 2.0
**最后更新**: 2025-12-19
**项目状态**: Phase 3 - 服务层集成完成,验证系统已就绪
