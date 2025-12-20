/**
 * 参数装饰器系统
 * 用于从 HTTP 请求中提取参数
 */

import type { ZodTypeAny } from 'zod';

/**
 * 参数类型
 */
export type ParamType = 'body' | 'query' | 'params' | 'user' | 'headers';

/**
 * 参数元数据
 */
export interface ParamMetadata {
  type: ParamType;
  index: number; // 参数在方法中的索引位置
  propertyKey?: string; // 从对象中提取的属性键（可选）
  schema?: ZodTypeAny; // 可选的 Zod 验证 schema
}

/**
 * 全局参数元数据存储
 * key: Controller 类构造函数
 * value: Map<方法名, ParamMetadata[]>
 */
export const PARAM_METADATA = new Map<Function, Map<string, ParamMetadata[]>>();

/**
 * 检查是否为 Zod schema
 */
function isZodSchema(value: unknown): value is ZodTypeAny {
  return (
    value !== null &&
    typeof value === 'object' &&
    '_def' in value &&
    'safeParse' in value
  );
}

/**
 * 创建参数装饰器的工厂函数
 * 支持两种调用方式:
 * 1. @Body() or @Body('propertyKey') - 提取参数
 * 2. @Body(ZodSchema) - 验证并提取参数
 */
function createParamDecorator(type: ParamType) {
  return function (schemaOrPropertyKey?: ZodTypeAny | string): ParameterDecorator {
    return function (target: any, methodName: string | symbol | undefined, parameterIndex: number) {
      if (!methodName) {
        throw new Error('参数装饰器必须应用在方法参数上');
      }

      const constructor = target.constructor;

      // 判断参数是 schema 还是 propertyKey
      let schema: ZodTypeAny | undefined;
      let propertyKey: string | undefined;

      if (schemaOrPropertyKey !== undefined) {
        if (isZodSchema(schemaOrPropertyKey)) {
          schema = schemaOrPropertyKey;
        } else {
          propertyKey = schemaOrPropertyKey as string;
        }
      }

      // 获取或创建 Controller 的参数元数据
      let controllerMetadata = PARAM_METADATA.get(constructor);
      if (!controllerMetadata) {
        controllerMetadata = new Map<string, ParamMetadata[]>();
        PARAM_METADATA.set(constructor, controllerMetadata);
      }

      // 获取或创建方法的参数元数据数组
      const methodKey = methodName as string;
      let methodParams = controllerMetadata.get(methodKey);
      if (!methodParams) {
        methodParams = [];
        controllerMetadata.set(methodKey, methodParams);
      }

      // 添加参数元数据
      methodParams.push({
        type,
        index: parameterIndex,
        propertyKey,
        schema,
      });

      // 按索引排序（从小到大）
      methodParams.sort((a, b) => a.index - b.index);
    };
  };
}

/**
 * @Body 装饰器 - 从请求体中提取数据（可选验证）
 *
 * @param schemaOrPropertyKey - Zod schema（自动验证）或属性键（只提取）
 *
 * @example
 * ```typescript
 * // 1. 使用 Zod schema 自动验证
 * @Post('/users')
 * createUser(@Body(CreateUserRequestSchema) body: CreateUserRequest) {
 *   // body 已通过验证，类型安全
 *   const { data } = body;
 * }
 *
 * // 2. 不验证，直接提取
 * @Post('/users')
 * createUser(@Body() data: CreateUserDto) {
 *   // data 包含完整的请求体
 * }
 *
 * // 3. 提取特定属性
 * @Post('/users')
 * createUser(@Body('name') name: string, @Body('age') age: number) {
 *   // 分别提取 name 和 age
 * }
 * ```
 */
export const Body = createParamDecorator('body');

/**
 * @Query 装饰器 - 从查询字符串中提取参数（可选验证）
 *
 * @param schemaOrPropertyKey - Zod schema（自动验证）或属性键（只提取）
 *
 * @example
 * ```typescript
 * // 1. 使用 Zod schema 自动验证（支持类型转换）
 * @Get('/users')
 * listUsers(@Query(ListUsersQuerySchema) query: ListUsersQuery) {
 *   // query.page 和 query.limit 自动从 string 转为 number
 *   const { page, limit } = query;
 * }
 *
 * // 2. 不验证，直接提取
 * @Get('/users')
 * listUsers(@Query() query: any) {
 *   // query 包含所有查询参数
 * }
 *
 * // 3. 提取特定属性
 * @Get('/users')
 * listUsers(@Query('page') page: string, @Query('limit') limit: string) {
 *   return { page, limit };
 * }
 * ```
 */
export const Query = createParamDecorator('query');

/**
 * @Params 装饰器 - 从路由参数中提取数据（可选验证）
 *
 * @param schemaOrPropertyKey - Zod schema（自动验证）或属性键（只提取）
 *
 * @example
 * ```typescript
 * // 1. 使用 Zod schema 自动验证
 * @Get('/users/:id')
 * getUser(@Params(UserIdParamsSchema) params: UserIdParams) {
 *   const { id } = params;  // 已验证，类型安全
 * }
 *
 * // 2. 不验证，直接提取
 * @Get('/users/:id')
 * getUser(@Params() params: any) {
 *   // params 包含所有路由参数
 * }
 *
 * // 3. 提取特定属性
 * @Get('/posts/:mac/:pid')
 * getPost(@Params('mac') mac: string, @Params('pid') pid: string) {
 *   return { mac, pid };
 * }
 * ```
 */
export const Params = createParamDecorator('params');

/**
 * @User 装饰器 - 从请求中提取已认证的用户信息
 *
 * @param propertyKey - 可选的属性键
 *
 * @example
 * ```typescript
 * @Get('/profile')
 * @Auth()
 * getProfile(@User() user: any) {
 *   // user 包含完整的用户信息
 * }
 *
 * @Post('/posts')
 * @Auth()
 * createPost(@User('userId') userId: string, @Body() data: CreatePostDto) {
 *   // 只提取 userId
 * }
 * ```
 */
export const User = createParamDecorator('user');

/**
 * @Headers 装饰器 - 从请求头中提取数据
 *
 * @param propertyKey - 可选的属性键
 *
 * @example
 * ```typescript
 * @Get('/test')
 * test(@Headers('user-agent') userAgent: string) {
 *   return { userAgent };
 * }
 *
 * @Get('/test')
 * test(@Headers() headers: any) {
 *   // headers 包含所有请求头
 * }
 * ```
 */
export const Headers = createParamDecorator('headers');
