/**
 * 分页工具函数
 * 统一处理分页参数和响应格式
 */

/**
 * 分页请求参数
 */
export interface PaginationParams {
  /** 页码（从 1 开始） */
  page?: number;
  /** 每页数量 */
  limit?: number;
  /** 排序字段 */
  sortBy?: string;
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc';
}

/**
 * 分页响应数据
 */
export interface PaginatedResponse<T> {
  /** 数据列表 */
  data: T[];
  /** 分页信息 */
  pagination: {
    /** 当前页码 */
    page: number;
    /** 每页数量 */
    limit: number;
    /** 总记录数 */
    total: number;
    /** 总页数 */
    totalPages: number;
    /** 是否有上一页 */
    hasPrevPage: boolean;
    /** 是否有下一页 */
    hasNextPage: boolean;
  };
}

/**
 * 分页配置选项
 */
export interface PaginationOptions {
  /** 默认页码 */
  defaultPage?: number;
  /** 默认每页数量 */
  defaultLimit?: number;
  /** 最大每页数量 */
  maxLimit?: number;
  /** 默认排序字段 */
  defaultSortBy?: string;
  /** 默认排序方向 */
  defaultSortOrder?: 'asc' | 'desc';
}

/**
 * 默认分页配置
 */
const DEFAULT_PAGINATION_OPTIONS: Required<PaginationOptions> = {
  defaultPage: 1,
  defaultLimit: 50,
  maxLimit: 1000,
  defaultSortBy: 'createdAt',
  defaultSortOrder: 'desc',
};

/**
 * 解析和验证分页参数
 * @param params - 原始分页参数
 * @param options - 分页配置选项
 * @returns 标准化的分页参数
 */
export function parsePaginationParams(
  params: PaginationParams = {},
  options: PaginationOptions = {}
): Required<PaginationParams> {
  const opts = { ...DEFAULT_PAGINATION_OPTIONS, ...options };

  // 解析页码
  let page = params.page ?? opts.defaultPage;
  if (typeof page === 'string') {
    page = parseInt(page, 10);
  }
  page = Math.max(1, page); // 确保至少为 1

  // 解析每页数量
  let limit = params.limit ?? opts.defaultLimit;
  if (typeof limit === 'string') {
    limit = parseInt(limit, 10);
  }
  limit = Math.min(Math.max(1, limit), opts.maxLimit); // 限制在 [1, maxLimit] 范围

  // 解析排序字段
  const sortBy = params.sortBy || opts.defaultSortBy;

  // 解析排序方向
  const sortOrder = params.sortOrder || opts.defaultSortOrder;

  return {
    page,
    limit,
    sortBy,
    sortOrder,
  };
}

/**
 * 计算 MongoDB skip 值
 * @param page - 页码（从 1 开始）
 * @param limit - 每页数量
 * @returns skip 值
 */
export function calculateSkip(page: number, limit: number): number {
  return (page - 1) * limit;
}

/**
 * 计算总页数
 * @param total - 总记录数
 * @param limit - 每页数量
 * @returns 总页数
 */
export function calculateTotalPages(total: number, limit: number): number {
  return Math.ceil(total / limit);
}

/**
 * 创建分页响应
 * @param data - 数据列表
 * @param total - 总记录数
 * @param page - 当前页码
 * @param limit - 每页数量
 * @returns 分页响应对象
 */
export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResponse<T> {
  const totalPages = calculateTotalPages(total, limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
    },
  };
}

/**
 * MongoDB 排序对象生成器
 * @param sortBy - 排序字段
 * @param sortOrder - 排序方向
 * @returns MongoDB 排序对象
 */
export function createMongoSort(
  sortBy: string,
  sortOrder: 'asc' | 'desc'
): Record<string, 1 | -1> {
  return {
    [sortBy]: sortOrder === 'asc' ? 1 : -1,
  };
}

/**
 * 分页查询帮助类
 * 简化 MongoDB 分页查询流程
 */
export class PaginationHelper {
  private params: Required<PaginationParams>;

  constructor(params: PaginationParams = {}, options?: PaginationOptions) {
    this.params = parsePaginationParams(params, options);
  }

  /**
   * 获取页码
   */
  get page(): number {
    return this.params.page;
  }

  /**
   * 获取每页数量
   */
  get limit(): number {
    return this.params.limit;
  }

  /**
   * 获取 skip 值
   */
  get skip(): number {
    return calculateSkip(this.params.page, this.params.limit);
  }

  /**
   * 获取排序字段
   */
  get sortBy(): string {
    return this.params.sortBy;
  }

  /**
   * 获取排序方向
   */
  get sortOrder(): 'asc' | 'desc' {
    return this.params.sortOrder;
  }

  /**
   * 获取 MongoDB 排序对象
   */
  get mongoSort(): Record<string, 1 | -1> {
    return createMongoSort(this.params.sortBy, this.params.sortOrder);
  }

  /**
   * 创建分页响应
   */
  createResponse<T>(data: T[], total: number): PaginatedResponse<T> {
    return createPaginatedResponse(data, total, this.params.page, this.params.limit);
  }
}

/**
 * 从查询字符串解析分页参数
 * 用于 HTTP 请求处理
 */
export function parsePaginationFromQuery(query: Record<string, any>): PaginationParams {
  return {
    page: query.page ? parseInt(String(query.page), 10) : undefined,
    limit: query.limit ? parseInt(String(query.limit), 10) : undefined,
    sortBy: query.sortBy ? String(query.sortBy) : undefined,
    sortOrder: query.sortOrder === 'asc' || query.sortOrder === 'desc' ? query.sortOrder : undefined,
  };
}
