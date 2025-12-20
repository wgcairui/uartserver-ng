# 验证装饰器使用指南

**版本**: 1.0
**创建日期**: 2025-12-19

---

## 📋 概述

本项目使用 Zod + 装饰器实现了声明式的 API 参数验证系统。通过 `@Validate()` 装饰器，可以自动验证请求参数,提供类型安全,减少样板代码。

### 核心优势

1. **声明式验证**: 一行装饰器替代数十行手动验证代码
2. **类型安全**: TypeScript 自动推断验证后的数据类型
3. **业务逻辑验证**: 支持复杂的跨字段验证规则
4. **自动错误处理**: 验证失败自动返回友好的错误消息
5. **避免 `any` 和 `unknown`**: 使用 `Validated<T>` 类型提供完整类型安全

---

## 🚀 快速开始

### 1. 创建 Zod Schema

首先在 `src/schemas/` 目录下创建验证 schema:

```typescript
// src/schemas/user.schema.ts
import { z } from 'zod';

/**
 * 创建用户请求 Schema
 */
export const CreateUserRequestSchema = z.object({
  data: z.object({
    username: z.string().min(3, '用户名至少 3 个字符'),
    email: z.string().email('无效的邮箱地址'),
    age: z.number().int().min(18, '年龄必须 >= 18'),
  }),
});

/**
 * 从 Schema 推导类型
 */
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;
```

### 2. 在 Controller 中使用（推荐方式）

**方式一：直接传入 schema 到参数装饰器（推荐）**

```typescript
import { Controller, Post } from '../decorators/controller';
import { Body } from '../decorators/params';
import { CreateUserRequestSchema, type CreateUserRequest } from '../schemas/user.schema';

@Controller('/api/users')
export class UserController {
  @Post('/')
  async createUser(@Body(CreateUserRequestSchema) body: CreateUserRequest) {
    // body 已通过验证,直接使用,无需额外类型转换
    const { data } = body;

    return {
      status: 'ok',
      data: {
        id: 1,
        username: data.username,
        email: data.email,
        age: data.age,
      },
    };
  }
}
```

**方式二：使用 @Validate 装饰器（旧方式，仍然支持）**

```typescript
import { Controller, Post } from '../decorators/controller';
import { Body } from '../decorators/params';
import { Validate, type Validated } from '../decorators/validate';
import { CreateUserRequestSchema, type CreateUserRequest } from '../schemas/user.schema';

@Controller('/api/users')
export class UserController {
  @Post('/')
  @Validate(CreateUserRequestSchema)
  async createUser(@Body() body: Validated<CreateUserRequest>) {
    // body 已通过验证,直接使用
    const { data } = body;

    return {
      status: 'ok',
      data: {
        id: 1,
        username: data.username,
        email: data.email,
        age: data.age,
      },
    };
  }
}
```

### 3. 验证效果

**请求成功**:
```bash
POST /api/users
{
  "data": {
    "username": "john",
    "email": "john@example.com",
    "age": 25
  }
}

# 响应: 200 OK
{
  "status": "ok",
  "data": { "id": 1, "username": "john", ... }
}
```

**验证失败**:
```bash
POST /api/users
{
  "data": {
    "username": "ab",  # 太短
    "email": "invalid", # 格式错误
    "age": 16          # 小于 18
  }
}

# 响应: 200 OK (错误通过 status 字段区分)
{
  "status": "error",
  "message": "data.username: 用户名至少 3 个字符",
  "data": null
}
```

---

## 📚 详细用法

### 验证不同的请求部分

#### 方式一：Schema 传入装饰器（推荐）

```typescript
// 验证请求体 (Body)
@Post('/users')
async createUser(@Body(CreateUserRequestSchema) body: CreateUserRequest) {
  const { data } = body;
  return { status: 'ok', data };
}

// 验证查询参数 (Query)
@Get('/users')
async listUsers(@Query(ListUsersQuerySchema) query: ListUsersQuery) {
  const { page, limit } = query;
  return { status: 'ok', data: [] };
}

// 验证路径参数 (Params)
@Get('/users/:id')
async getUser(@Params(UserIdParamsSchema) params: UserIdParams) {
  const { id } = params;
  return { status: 'ok', data: { id } };
}
```

#### 方式二：使用 @Validate 装饰器（旧方式）

```typescript
// 验证请求体 (Body)
@Post('/users')
@Validate(CreateUserRequestSchema)  // 默认验证 body
async createUser(@Body() body: Validated<CreateUserRequest>) {
  const { data } = body;
  return { status: 'ok', data };
}

// 验证查询参数 (Query)
@Get('/users')
@Validate(ListUsersQuerySchema, 'query')  // 指定验证 query
async listUsers(@Query() query: Validated<ListUsersQuery>) {
  const { page, limit } = query;
  return { status: 'ok', data: [] };
}

// 验证路径参数 (Params)
@Get('/users/:id')
@Validate(UserIdParamsSchema, 'params')  // 指定验证 params
async getUser(@Params() params: Validated<UserIdParams>) {
  const { id } = params;
  return { status: 'ok', data: { id } };
}
```

### 高级 Schema 特性

#### 1. 类型转换

Zod 自动将字符串转换为正确的类型:

```typescript
export const ListUsersQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .default('1')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  limit: z
    .string()
    .optional()
    .default('50')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive().max(100)),

  active: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
});

// 推导的类型:
// {
//   page: number;
//   limit: number;
//   active: boolean | undefined;
// }
```

使用示例:
```typescript
@Get('/users')
@Validate(ListUsersQuerySchema, 'query')
async listUsers(@Query() query: Validated<ListUsersQuery>) {
  // query.page 自动是 number 类型
  // query.limit 自动是 number 类型
  // query.active 自动是 boolean 类型
  const users = await this.userService.getUsers(query.page, query.limit);
  return { status: 'ok', data: users };
}
```

#### 2. 跨字段验证

使用 `.refine()` 实现复杂的业务逻辑验证:

```typescript
export const CreateRuleRequestSchema = z
  .object({
    data: z.object({
      type: z.enum(['threshold', 'constant', 'custom']),
      threshold: ThresholdConditionSchema.optional(),
      constant: ConstantConditionSchema.optional(),
      customScript: z.string().optional(),
    }),
  })
  .refine(
    (data) => {
      // threshold 类型必须有 threshold 条件
      if (data.data.type === 'threshold' && !data.data.threshold) {
        return false;
      }
      // constant 类型必须有 constant 条件
      if (data.data.type === 'constant' && !data.data.constant) {
        return false;
      }
      return true;
    },
    {
      message: '规则类型与条件不匹配',
    }
  );
```

#### 3. 条件验证

```typescript
export const UpdateUserRequestSchema = z.object({
  data: z.object({
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
    confirmPassword: z.string().optional(),
  }),
}).refine(
  (data) => {
    // 如果提供了 password,必须提供 confirmPassword
    if (data.data.password && !data.data.confirmPassword) {
      return false;
    }
    // password 和 confirmPassword 必须匹配
    if (data.data.password !== data.data.confirmPassword) {
      return false;
    }
    return true;
  },
  {
    message: '密码和确认密码必须匹配',
  }
);
```

---

## 🎨 最佳实践

### 1. Schema 文件组织

```
src/
  schemas/
    user.schema.ts           # 用户相关 schemas
    alarm-rules.schema.ts    # 告警规则相关 schemas
    product.schema.ts        # 产品相关 schemas
```

### 2. Schema 命名规范

```typescript
// ✅ 好的命名
CreateUserRequestSchema
UpdateUserRequestSchema
ListUsersQuerySchema
UserIdParamsSchema

// ❌ 避免的命名
UserSchema        // 不明确是请求还是响应
CreateSchema      // 缺少主体
RequestSchema     // 太宽泛
```

### 3. 类型导出

始终从 schema 导出推导的类型:

```typescript
// ✅ 推荐: 单一数据源
export const CreateUserRequestSchema = z.object({ ... });
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

// ❌ 避免: 分离的类型定义
export interface CreateUserRequest { ... }  // 手动维护,易出错
export const CreateUserRequestSchema = z.object({ ... });
```

### 4. 错误消息本地化

提供友好的中文错误消息:

```typescript
export const CreateUserRequestSchema = z.object({
  data: z.object({
    username: z.string()
      .min(3, '用户名至少 3 个字符')
      .max(20, '用户名最多 20 个字符')
      .regex(/^[a-zA-Z0-9_]+$/, '用户名只能包含字母、数字和下划线'),

    email: z.string()
      .email('无效的邮箱地址'),

    age: z.number()
      .int('年龄必须是整数')
      .min(18, '年龄必须 >= 18')
      .max(150, '年龄必须 <= 150'),
  }),
});
```

### 5. 默认值处理

使用 `.default()` 或 `.optional()`:

```typescript
export const ListUsersQuerySchema = z.object({
  page: z.string().optional().default('1'),  // 默认值
  limit: z.string().optional().default('50'),
  sortBy: z.enum(['name', 'createdAt']).optional(),  // 可选,无默认值
});
```

---

## 🔧 与现有代码对比

### 之前 (手动验证)

```typescript
@Post('/')
async createRule(@Body('data') data: CreateRuleRequest) {
  try {
    // 验证必填字段 (10+ 行)
    if (!data.name) {
      return { status: 'error', message: 'Rule name is required', data: null };
    }
    if (!data.type) {
      return { status: 'error', message: 'Rule type is required', data: null };
    }
    if (!data.level) {
      return { status: 'error', message: 'Alarm level is required', data: null };
    }
    if (!data.createdBy) {
      return { status: 'error', message: 'Creator user ID is required', data: null };
    }

    // 根据规则类型验证条件 (10+ 行)
    if (data.type === 'threshold' && !data.threshold) {
      return {
        status: 'error',
        message: 'Threshold condition is required for threshold rule',
        data: null,
      };
    }
    if (data.type === 'constant' && !data.constant) {
      return {
        status: 'error',
        message: 'Constant condition is required for constant rule',
        data: null,
      };
    }

    // 业务逻辑
    const rule = await this.alarmEngine.addRule(data);
    return { status: 'ok', data: rule };
  } catch (error) {
    return { status: 'error', message: error.message, data: null };
  }
}
```

### 现在 (使用 @Validate)

```typescript
@Post('/')
@Validate(CreateRuleRequestSchema)
async createRule(@Body() body: Validated<CreateRuleRequest>) {
  const { data } = body;

  try {
    // 直接执行业务逻辑,所有验证已完成
    const rule = await this.alarmEngine.addRule(data);
    return { status: 'ok', data: rule };
  } catch (error) {
    return { status: 'error', message: error.message, data: null };
  }
}
```

**代码减少**: 从 ~40 行减少到 ~10 行 (减少 75%)
**类型安全**: 自动类型推导,无需手动类型断言
**可维护性**: 验证逻辑集中在 schema,易于修改

---

## 🎯 实际案例

### 案例 1: AlarmRulesController

完整的告警规则管理 API,展示了各种验证场景:

```typescript
@Controller('/api/alarm-rules')
export class AlarmRulesController {
  // 查询参数验证 + 类型转换
  @Get('/')
  @Validate(ListRulesQuerySchema, 'query')
  async listRules(@Query() query: Validated<ListRulesQuery>) {
    const { type, level, enabled, protocol, limit, page } = query;
    // limit 和 page 自动转换为 number
    // enabled 自动转换为 boolean
    const allRules = await this.alarmEngine.getRules({ type, level, enabled, protocol });
    const rules = allRules.slice((page - 1) * limit, page * limit);
    return { status: 'ok', data: { rules, total: allRules.length, page, limit } };
  }

  // 复杂的请求体验证 + 跨字段规则
  @Post('/')
  @Validate(CreateRuleRequestSchema)
  async createRule(@Body() body: Validated<CreateRuleRequest>) {
    const { data } = body;
    // Schema 已验证:
    // - 所有必填字段存在
    // - threshold 类型有 threshold 条件
    // - constant 类型有 constant 条件
    const ruleId = await this.alarmEngine.addRule(data);
    return { status: 'ok', message: 'Rule created successfully', data: { id: ruleId } };
  }

  // 批量操作验证
  @Post('/batch/enable')
  @Validate(BatchOperationRequestSchema)
  async batchEnableRules(@Body() body: Validated<BatchOperationRequest>) {
    const { ids, userId } = body;
    // Schema 已验证 ids 非空数组
    const results = await Promise.all(
      ids.map((id) => this.alarmEngine.updateRule(id, { enabled: true, updatedBy: userId }))
    );
    return { status: 'ok', data: { total: ids.length, results } };
  }
}
```

### 案例 2: 查询参数类型转换

```typescript
// Schema 定义
export const ListUsersQuerySchema = z.object({
  page: z.string().optional().default('1')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  limit: z.string().optional().default('50')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive().max(100)),

  active: z.string().optional()
    .transform((val) => val === 'true'),

  role: z.enum(['admin', 'user', 'guest']).optional(),
});

// Controller 使用
@Get('/users')
@Validate(ListUsersQuerySchema, 'query')
async listUsers(@Query() query: Validated<ListUsersQuery>) {
  // TypeScript 知道正确的类型:
  // query.page: number
  // query.limit: number
  // query.active: boolean | undefined
  // query.role: 'admin' | 'user' | 'guest' | undefined

  const users = await this.userService.findAll({
    skip: (query.page - 1) * query.limit,
    take: query.limit,
    where: {
      active: query.active,
      role: query.role,
    },
  });

  return { status: 'ok', data: users };
}
```

---

## 📖 API 参考

### @Validate() 装饰器

```typescript
function Validate<T>(
  schema: ZodSchema<T>,
  target?: 'body' | 'query' | 'params',
  throwOnError?: boolean
): MethodDecorator
```

**参数**:
- `schema`: Zod 验证 schema
- `target`: 验证目标 (默认: `'body'`)
- `throwOnError`: 验证失败时是否抛出异常 (默认: `false`,返回错误响应)

**使用示例**:
```typescript
@Post('/users')
@Validate(CreateUserRequestSchema)
async createUser(@Body() body: Validated<CreateUserRequest>) { ... }

@Get('/users')
@Validate(ListUsersQuerySchema, 'query')
async listUsers(@Query() query: Validated<ListUsersQuery>) { ... }

@Get('/users/:id')
@Validate(UserIdParamsSchema, 'params')
async getUser(@Params() params: Validated<UserIdParams>) { ... }
```

### Validated<T> 类型

```typescript
type Validated<T> = T
```

这是一个类型标记,表示数据已通过 Zod 验证。在运行时,它等同于 `T`,但为 TypeScript 提供了类型安全。

**为什么使用 `Validated<T>` 而不是直接使用 `T`**:
1. **明确意图**: 代码审查时一眼看出数据已验证
2. **避免 `unknown`**: 不需要使用 `unknown` 然后手动类型断言
3. **类型安全**: TypeScript 会确保你使用的是正确的类型

---

## 🔗 相关文档

- [Zod 官方文档](https://zod.dev/)
- [AlarmRules API 文档](./API_ALARM_RULES.md)
- [数据库架构文档](./DATABASE_ARCHITECTURE.md)

---

**文档版本**: 1.0
**最后更新**: 2025-12-19
**维护者**: Development Team
