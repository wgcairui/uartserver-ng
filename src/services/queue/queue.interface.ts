/**
 * Queue Service Interface
 *
 * 统一的队列服务接口，支持多种实现：
 * - SQLite Queue (开发/测试环境，零依赖)
 * - BullMQ (生产环境，Redis 支持)
 */

/**
 * 任务对象
 */
export interface Job<T = any> {
  /** 任务 ID */
  id: string;
  /** 任务名称 */
  name: string;
  /** 任务数据 */
  data: T;
  /** 任务状态 */
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  /** 尝试次数 */
  attempts?: number;
  /** 错误信息 */
  error?: string;
  /** 创建时间 */
  createdAt?: Date;
  /** 完成时间 */
  completedAt?: Date;
}

/**
 * 任务选项
 */
export interface JobOptions {
  /** 优先级 (数字越大优先级越高) */
  priority?: number;
  /** 最大重试次数 */
  attempts?: number;
  /** 延迟执行 (毫秒) */
  delay?: number;
  /** 重试退避策略 */
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
}

/**
 * 任务处理器函数
 */
export type JobProcessor<T = any, R = any> = (job: Job<T>) => Promise<R>;

/**
 * 队列服务接口
 */
export interface QueueService {
  /**
   * 添加任务到队列
   *
   * @param queueName - 队列名称
   * @param jobName - 任务名称
   * @param data - 任务数据
   * @param options - 任务选项
   * @returns 任务对象
   */
  addJob<T = any>(
    queueName: string,
    jobName: string,
    data: T,
    options?: JobOptions
  ): Promise<Job<T>>;

  /**
   * 注册任务处理器
   *
   * @param queueName - 队列名称
   * @param processor - 任务处理函数
   */
  registerProcessor<T = any, R = any>(
    queueName: string,
    processor: JobProcessor<T, R>
  ): void;

  /**
   * 关闭队列服务
   */
  close(): Promise<void>;

  /**
   * 获取队列统计信息
   *
   * @param queueName - 队列名称 (可选，不指定则返回所有队列)
   */
  getStats(queueName?: string): Promise<QueueStats>;
}

/**
 * 队列统计信息
 */
export interface QueueStats {
  /** 队列名称 */
  queueName?: string;
  /** 待处理任务数 */
  pending: number;
  /** 处理中任务数 */
  processing: number;
  /** 已完成任务数 */
  completed: number;
  /** 失败任务数 */
  failed: number;
}

/**
 * 队列配置
 */
export interface QueueConfig {
  /** 环境类型 */
  env: 'development' | 'test' | 'production';
  /** SQLite 数据库路径 (SQLite 实现) */
  sqlitePath?: string;
  /** Redis 配置 (BullMQ 实现) */
  redis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
}

/**
 * 创建队列服务工厂函数
 * 根据环境自动选择合适的实现
 *
 * @param config - 队列配置
 * @returns 队列服务实例
 */
export function createQueueService(config: QueueConfig): QueueService {
  if (config.env === 'production' && config.redis) {
    // 生产环境使用 BullMQ
    throw new Error('BullMQ implementation not yet available. Use SQLite for now.');
    // return new BullMQQueueService(config.redis);
  }

  // 开发/测试环境使用 SQLite
  const { SQLiteQueueService } = require('./sqlite-queue.service');
  return new SQLiteQueueService({
    dbPath: config.sqlitePath || './data/dev-queue.db',
  });
}
