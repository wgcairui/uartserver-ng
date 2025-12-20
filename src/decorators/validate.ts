/**
 * Zod 验证装饰器系统
 * 为 Controller 方法提供声明式的请求参数验证
 */

import { z, type ZodTypeAny, ZodError } from 'zod';

/**
 * 验证目标类型
 */
export type ValidateTarget = 'body' | 'query' | 'params';

/**
 * 验证配置
 */
export interface ValidationConfig {
  /** 验证 schema */
  schema: ZodTypeAny;
  /** 验证目标（默认: body） */
  target?: ValidateTarget;
  /** 是否在验证失败时抛出异常（默认: false，返回错误响应） */
  throwOnError?: boolean;
}

/**
 * 验证元数据
 */
export interface ValidationMetadata {
  /** 验证配置 */
  config: ValidationConfig;
  /** 方法名 */
  methodName: string;
}

/**
 * 全局验证元数据存储
 * key: Controller 类构造函数
 * value: Map<方法名, ValidationMetadata>
 */
export const VALIDATION_METADATA = new Map<Function, Map<string, ValidationMetadata>>();

/**
 * 验证数据类型 (内部使用的占位符类型)
 *
 * 这个类型在运行时会被 Zod 验证后的实际类型替换
 */
export type Validated<T> = T;

/**
 * @Validate 装饰器
 * 为 Controller 方法添加 Zod schema 验证
 *
 * @param schema - Zod 验证 schema
 * @param target - 验证目标（body/query/params），默认为 'body'
 * @param throwOnError - 验证失败时是否抛出异常，默认为 false（返回错误响应）
 *
 * @example
 * ```typescript
 * // 使用 Validated<T> 类型提示,避免手动类型转换
 * @Post('/users')
 * @Validate(CreateUserRequestSchema)
 * async createUser(@Body() body: Validated<CreateUserRequest>) {
 *   // body 已通过验证,直接使用
 *   const { data } = body;
 *   return { success: true, data };
 * }
 *
 * @Get('/users')
 * @Validate(ListUsersQuerySchema, 'query')
 * async listUsers(@Query() query: Validated<ListUsersQuery>) {
 *   // query 已通过验证,直接使用
 *   const { page, limit } = query;
 *   return { users: [] };
 * }
 * ```
 */
export function Validate<T extends ZodTypeAny = ZodTypeAny>(
  schema: T,
  target: ValidateTarget = 'body',
  throwOnError: boolean = false
): MethodDecorator {
  return function (
    targetObject: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) {
    const constructor = targetObject.constructor;
    const methodName = propertyKey as string;

    // 获取或创建 Controller 的验证元数据
    let controllerMetadata = VALIDATION_METADATA.get(constructor);
    if (!controllerMetadata) {
      controllerMetadata = new Map<string, ValidationMetadata>();
      VALIDATION_METADATA.set(constructor, controllerMetadata);
    }

    // 存储验证元数据
    controllerMetadata.set(methodName, {
      config: {
        schema,
        target,
        throwOnError,
      },
      methodName,
    });

    return descriptor;
  };
}

/**
 * 验证请求数据
 *
 * @param data - 待验证的数据
 * @param schema - Zod schema
 * @returns 验证结果 { success: boolean, data?: T, error?: ZodError }
 */
export function validateData<T extends ZodTypeAny>(
  data: unknown,
  schema: T
): { success: true; data: z.infer<T> } | { success: false; error: ZodError } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, error: result.error };
}

/**
 * 格式化 Zod 验证错误为用户友好的错误消息
 *
 * @param error - Zod 错误对象
 * @returns 格式化的错误消息
 */
export function formatValidationError(error: ZodError): string {
  const firstIssue = error.issues[0];

  if (!firstIssue) {
    return '数据验证失败';
  }

  // 构建字段路径
  const path = firstIssue.path.length > 0 ? `${firstIssue.path.join('.')}` : '数据';

  // 返回错误消息
  return `${path}: ${firstIssue.message}`;
}

/**
 * 格式化所有验证错误
 *
 * @param error - Zod 错误对象
 * @returns 所有错误消息的数组
 */
export function formatAllValidationErrors(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join('.')}` : '数据';
    return `${path}: ${issue.message}`;
  });
}
