/**
 * 统一错误处理插件
 *
 * 处理所有应用错误,返回统一的 API 响应格式
 *
 * 功能:
 * 1. 捕获所有未处理的错误
 * 2. 格式化错误响应
 * 3. 记录错误日志
 * 4. 区分开发/生产环境的错误详情
 */

import { Elysia } from 'elysia';

/**
 * 应用错误类型
 */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * 错误处理插件
 *
 * 使用方式:
 * ```typescript
 * const app = new Elysia()
 *   .use(errorHandler())
 *   .get('/test', () => {
 *     throw new AppError('Something went wrong', 400);
 *   });
 * ```
 */
export const errorHandler = () =>
  new Elysia({ name: 'error-handler' })
    .onError(({ error, set, code }) => {
      const isDevelopment = process.env.NODE_ENV === 'development';

      // 处理 AppError (自定义应用错误)
      if (error instanceof AppError) {
        set.status = error.statusCode;

        console.error('[AppError]', {
          message: error.message,
          code: error.code,
          statusCode: error.statusCode,
          stack: isDevelopment ? error.stack : undefined,
        });

        return {
          status: 'error',
          message: error.message,
          code: error.code,
          data: null,
          ...(isDevelopment && { stack: error.stack }),
        };
      }

      // 处理 NOT_FOUND 错误
      if (code === 'NOT_FOUND') {
        set.status = 404;
        return {
          status: 'error',
          message: 'Route not found',
          data: null,
        };
      }

      // 处理 PARSE 错误 (JSON 解析失败)
      if (code === 'PARSE') {
        set.status = 400;
        return {
          status: 'error',
          message: 'Invalid JSON body',
          data: null,
        };
      }

      // 处理 INTERNAL_SERVER_ERROR
      if (code === 'INTERNAL_SERVER_ERROR') {
        set.status = 500;

        const errorMessage = error instanceof Error ? error.message : 'Internal server error';
        const errorStack = error instanceof Error ? error.stack : undefined;

        console.error('[Internal Server Error]', {
          message: errorMessage,
          stack: errorStack,
        });

        return {
          status: 'error',
          message: isDevelopment ? errorMessage : 'Internal server error',
          data: null,
          ...(isDevelopment && errorStack && { stack: errorStack }),
        };
      }

      // 处理其他未知错误
      set.status = 500;

      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      const errorStack = error instanceof Error ? error.stack : undefined;

      console.error('[Unknown Error]', {
        code,
        message: errorMessage,
        stack: errorStack,
      });

      return {
        status: 'error',
        message: isDevelopment ? errorMessage : 'An unexpected error occurred',
        code,
        data: null,
        ...(isDevelopment && errorStack && { stack: errorStack }),
      };
    });

/**
 * 使用示例:
 *
 * ```typescript
 * import { Elysia } from 'elysia';
 * import { errorHandler, AppError } from './plugins/error-handler';
 *
 * const app = new Elysia()
 *   .use(errorHandler())
 *   .get('/users/:id', async ({ params }) => {
 *     const user = await db.users.findOne({ id: params.id });
 *
 *     if (!user) {
 *       throw new AppError('User not found', 404, 'USER_NOT_FOUND');
 *     }
 *
 *     return { status: 'ok', data: user };
 *   });
 * ```
 */
