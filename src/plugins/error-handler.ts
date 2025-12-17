/**
 * Fastify 错误处理插件
 * 统一处理所有应用错误和未捕获异常
 */

import { FastifyPluginAsync, FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError, formatErrorResponse, isOperationalError } from '../errors';
import { config } from '../config';

/**
 * 错误处理插件配置
 */
interface ErrorHandlerOptions {
  /**
   * 是否在响应中包含堆栈信息（默认：仅开发环境）
   */
  includeStack?: boolean;

  /**
   * 是否记录错误到日志（默认：true）
   */
  logErrors?: boolean;
}

/**
 * 全局错误处理器
 */
const errorHandler: FastifyPluginAsync<ErrorHandlerOptions> = async (
  fastify,
  options
) => {
  const { includeStack = config.NODE_ENV === 'development', logErrors = true } =
    options;

  /**
   * 设置自定义错误处理器
   */
  fastify.setErrorHandler(
    async (error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
      // 1. 记录错误
      if (logErrors) {
        const { method, url, ip, headers } = request;
        const userAgent = headers['user-agent'];

        if (error instanceof AppError && error.isOperational) {
          // 业务错误 - 警告级别
          fastify.log.warn(
            {
              err: error,
              req: {
                method,
                url,
                ip,
                userAgent,
              },
              errorCode: error.errorCode,
            },
            `业务错误: ${error.message}`
          );
        } else {
          // 系统错误 - 错误级别
          fastify.log.error(
            {
              err: error,
              req: {
                method,
                url,
                ip,
                userAgent,
              },
            },
            `系统错误: ${error.message}`
          );
        }
      }

      // 2. 构建错误响应
      let statusCode = 500;
      let errorResponse: any;

      if (error instanceof AppError) {
        // 自定义应用错误
        statusCode = error.statusCode;
        errorResponse = formatErrorResponse(error, includeStack);
      } else if ('statusCode' in error && typeof error.statusCode === 'number') {
        // Fastify 内置错误（如验证错误）
        statusCode = error.statusCode;
        errorResponse = {
          error: {
            code: statusCode,
            message: error.message,
            timestamp: new Date().toISOString(),
            ...(includeStack && error.stack && { stack: error.stack }),
            ...((error as any).validation && {
              validation: (error as any).validation,
            }),
          },
        };
      } else {
        // 未知错误
        errorResponse = formatErrorResponse(error, includeStack);
      }

      // 3. 发送错误响应
      reply.status(statusCode).send(errorResponse);

      // 4. 对于非业务错误，可能需要告警或上报
      if (!isOperationalError(error)) {
        // TODO: 可以在这里集成错误监控服务（如 Sentry）
        // await reportErrorToMonitoring(error, request);
      }
    }
  );

  /**
   * 添加 404 处理器
   */
  fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: 404,
        message: `Route ${request.method}:${request.url} not found`,
        timestamp: new Date().toISOString(),
      },
    });
  });

  /**
   * 添加请求钩子 - 记录慢请求
   */
  fastify.addHook('onRequest', async (request) => {
    // 记录请求开始时间
    (request as any).startTime = Date.now();
  });

  fastify.addHook('onResponse', async (request, reply) => {
    // 计算响应时间
    const startTime = (request as any).startTime;
    if (startTime) {
      const responseTime = Date.now() - startTime;
      if (responseTime > 1000) {
        // 响应时间超过 1 秒的警告
        fastify.log.warn(
          {
            method: request.method,
            url: request.url,
            statusCode: reply.statusCode,
            responseTime,
          },
          `慢请求: ${responseTime.toFixed(2)}ms`
        );
      }
    }
  });
};

/**
 * 导出插件
 */
export default errorHandler;
