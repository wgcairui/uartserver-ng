/**
 * Zod 验证插件
 *
 * 让 Elysia 原生支持 Zod schemas,并提供友好的错误格式化
 *
 * 功能:
 * 1. 自动验证 body/query/params
 * 2. 格式化 Zod 验证错误为统一的 API 响应格式
 * 3. 保持类型安全
 */

import { Elysia } from 'elysia';
import { ZodError } from 'zod';

/**
 * 格式化 Zod 验证错误为用户友好的消息
 */
function formatZodError(error: ZodError): string {
  const firstIssue = error.issues[0];

  if (!firstIssue) {
    return '数据验证失败';
  }

  // 构建字段路径
  const path = firstIssue.path.length > 0
    ? `${firstIssue.path.join('.')}`
    : '数据';

  // 返回错误消息
  return `${path}: ${firstIssue.message}`;
}

/**
 * 格式化所有验证错误
 */
function formatAllZodErrors(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0
      ? `${issue.path.join('.')}`
      : '数据';
    return `${path}: ${issue.message}`;
  });
}

/**
 * Zod 验证插件
 *
 * 使用方式:
 * ```typescript
 * const app = new Elysia()
 *   .use(zodValidator())
 *   .post('/users', handler, {
 *     body: CreateUserRequestSchema  // Zod schema
 *   });
 * ```
 */
export const zodValidator = () =>
  new Elysia({ name: 'zod-validator' })
    .onError(({ error, set, code }) => {
      // 处理 Zod 验证错误
      if (error instanceof ZodError) {
        set.status = 400;

        const message = formatZodError(error);
        const allErrors = formatAllZodErrors(error);

        console.error('[Zod Validation Error]', {
          message,
          allErrors,
          issues: error.issues,
        });

        return {
          status: 'error',
          message,
          data: null,
          errors: allErrors.length > 1 ? allErrors : undefined,
        };
      }

      // 处理其他类型的验证错误
      if (code === 'VALIDATION') {
        set.status = 400;
        return {
          status: 'error',
          message: error.message || 'Validation failed',
          data: null,
        };
      }

      // 其他错误继续传递
      return error;
    });

/**
 * 使用示例:
 *
 * ```typescript
 * import { Elysia } from 'elysia';
 * import { zodValidator } from './plugins/zod-validator';
 * import { CreateUserRequestSchema } from './schemas/user.schema';
 *
 * const app = new Elysia()
 *   .use(zodValidator())
 *   .post('/users', async ({ body }) => {
 *     // body 已经通过 Zod 验证
 *     const { data } = body;
 *     return { status: 'ok', data };
 *   }, {
 *     body: CreateUserRequestSchema
 *   });
 * ```
 */
