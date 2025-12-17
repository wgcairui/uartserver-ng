/**
 * 统一错误处理系统
 * 提供标准化的错误类型和错误响应格式
 */

/**
 * 错误代码枚举
 */
export enum ErrorCode {
  // 通用错误 (1xxx)
  INTERNAL_ERROR = 1000,
  INVALID_REQUEST = 1001,
  VALIDATION_ERROR = 1002,
  NOT_FOUND = 1003,

  // 认证错误 (2xxx)
  UNAUTHORIZED = 2000,
  INVALID_TOKEN = 2001,
  TOKEN_EXPIRED = 2002,
  FORBIDDEN = 2003,

  // 业务错误 (3xxx)
  DEVICE_NOT_FOUND = 3000,
  DEVICE_OFFLINE = 3001,
  INVALID_PROTOCOL = 3002,
  QUERY_TIMEOUT = 3003,
  NODE_UNAVAILABLE = 3004,

  // 数据库错误 (4xxx)
  DATABASE_ERROR = 4000,
  DUPLICATE_ENTRY = 4001,
  CONSTRAINT_VIOLATION = 4002,

  // 外部服务错误 (5xxx)
  EXTERNAL_API_ERROR = 5000,
  NETWORK_ERROR = 5001,
}

/**
 * 基础应用错误类
 * 所有自定义错误的基类
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: ErrorCode;
  public readonly isOperational: boolean;
  public readonly timestamp: string;
  public readonly details?: any;

  constructor(
    message: string,
    statusCode: number,
    errorCode: ErrorCode,
    isOperational = true,
    details?: any
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    this.details = details;

    Error.captureStackTrace(this);
  }

  /**
   * 转换为 JSON 响应格式
   */
  toJSON() {
    return {
      error: {
        code: this.errorCode,
        message: this.message,
        timestamp: this.timestamp,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

/**
 * 验证错误 - 400
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, ErrorCode.VALIDATION_ERROR, true, details);
  }
}

/**
 * 未找到错误 - 404
 */
export class NotFoundError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 404, ErrorCode.NOT_FOUND, true, details);
  }
}

/**
 * 未授权错误 - 401
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details?: any) {
    super(message, 401, ErrorCode.UNAUTHORIZED, true, details);
  }
}

/**
 * 禁止访问错误 - 403
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: any) {
    super(message, 403, ErrorCode.FORBIDDEN, true, details);
  }
}

/**
 * 内部服务器错误 - 500
 */
export class InternalError extends AppError {
  constructor(message = 'Internal server error', details?: any) {
    super(message, 500, ErrorCode.INTERNAL_ERROR, false, details);
  }
}

/**
 * 设备相关错误 - 404/503
 */
export class DeviceError extends AppError {
  constructor(message: string, online = false, details?: any) {
    super(
      message,
      online ? 404 : 503,
      online ? ErrorCode.DEVICE_NOT_FOUND : ErrorCode.DEVICE_OFFLINE,
      true,
      details
    );
  }
}

/**
 * 数据库错误 - 500
 */
export class DatabaseError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 500, ErrorCode.DATABASE_ERROR, false, details);
  }
}

/**
 * 外部 API 错误 - 502
 */
export class ExternalAPIError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 502, ErrorCode.EXTERNAL_API_ERROR, true, details);
  }
}

/**
 * 查询超时错误 - 504
 */
export class QueryTimeoutError extends AppError {
  constructor(message = 'Query timeout', details?: any) {
    super(message, 504, ErrorCode.QUERY_TIMEOUT, true, details);
  }
}

/**
 * 判断是否为可操作的错误（业务逻辑错误 vs 系统错误）
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * 错误响应格式化
 * 根据环境决定是否包含堆栈信息
 */
export function formatErrorResponse(
  error: Error,
  includeStack = false
): {
  error: {
    code: number;
    message: string;
    timestamp: string;
    details?: any;
    stack?: string;
  };
} {
  if (error instanceof AppError) {
    const response = error.toJSON();
    if (includeStack && error.stack) {
      response.error.stack = error.stack;
    }
    return response;
  }

  // 未知错误
  return {
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: error.message || 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
      ...(includeStack && error.stack && { stack: error.stack }),
    },
  };
}
