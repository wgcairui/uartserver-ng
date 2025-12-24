/**
 * Queue Service Interface
 *
 * 统一的任务队列接口，支持多种实现：
 * - SQLite 队列（开发/测试环境）
 * - BullMQ 队列（生产环境）
 *
 * 设计原则：
 * - 接口一致性：业务代码无需关心底层实现
 * - 环境适配：根据环境变量自动选择实现
 * - 平滑迁移：从 SQLite 到 BullMQ 无需修改业务代码
 */

/**
 * 任务选项
 */
export interface JobOptions {
  /** 优先级（数字越大优先级越高，0-10） */
  priority?: number;
  /** 最大重试次数 */
  attempts?: number;
  /** 延迟执行（毫秒） */
  delay?: number;
  /** 任务超时（毫秒） */
  timeout?: number;
}

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
  /** 当前尝试次数 */
  attempts?: number;
  /** 创建时间 */
  createdAt?: Date;
  /** 开始处理时间 */
  startedAt?: Date;
  /** 完成时间 */
  completedAt?: Date;
  /** 错误信息 */
  error?: string;
}

/**
 * 任务处理器函数
 */
export type JobProcessor<T = any> = (job: Job<T>) => Promise<any>;

/**
 * 队列统计信息
 */
export interface QueueStats {
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
 * 队列服务接口
 *
 * 所有队列实现（SQLite、BullMQ）必须实现此接口
 */
export interface QueueService {
  /**
   * 添加任务到队列
   *
   * @param queueName - 队列名称（如 'notifications', 'data-processing'）
   * @param jobName - 任务名称（如 'send-wechat', 'parse-data'）
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
  registerProcessor<T = any>(queueName: string, processor: JobProcessor<T>): void;

  /**
   * 获取队列统计信息
   *
   * @param queueName - 队列名称
   * @returns 统计信息
   */
  getQueueStats(queueName: string): QueueStats | Promise<QueueStats>;

  /**
   * 清理已完成和失败的任务
   *
   * @param queueName - 队列名称（可选，不指定则清理所有队列）
   * @param olderThanDays - 清理多少天前的任务
   */
  cleanup(queueName?: string, olderThanDays?: number): Promise<void>;

  /**
   * 关闭队列服务
   */
  close(): Promise<void>;
}
