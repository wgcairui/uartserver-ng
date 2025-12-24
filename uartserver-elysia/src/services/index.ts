/**
 * Services Initialization
 *
 * 集中管理应用服务的创建和生命周期：
 * - 队列服务 (SQLite/BullMQ)
 * - 告警通知服务
 * - 服务依赖注入
 */

import type { Db } from 'mongodb';
import { SQLiteQueueService } from './queue/sqlite-queue.service';
import type { QueueService } from './queue/queue.interface';
import { AlarmNotificationService } from './alarm-notification.service';
import { config } from '../config';

/**
 * 应用服务容器
 */
export class ServiceContainer {
  /** 队列服务 */
  public queueService: QueueService;

  /** 告警通知服务 */
  public alarmNotificationService: AlarmNotificationService;

  private constructor(
    queueService: QueueService,
    alarmNotificationService: AlarmNotificationService
  ) {
    this.queueService = queueService;
    this.alarmNotificationService = alarmNotificationService;
  }

  /**
   * 初始化服务容器
   *
   * @param db - MongoDB 数据库实例
   * @param options - 配置选项
   */
  static async initialize(
    db: Db,
    options: {
      /** 队列类型 */
      queueType?: 'sqlite' | 'bullmq';
      /** SQLite 队列配置 */
      sqliteConfig?: {
        dbPath?: string;
        pollInterval?: number;
        maxConcurrency?: number;
      };
    } = {}
  ): Promise<ServiceContainer> {
    console.log('[ServiceContainer] Initializing services...');

    // 1. 创建队列服务
    const queueService = await this.createQueueService(options);

    // 2. 创建告警通知服务（注入队列服务）
    const alarmNotificationService = new AlarmNotificationService(db, queueService);

    console.log('[ServiceContainer] All services initialized successfully');

    return new ServiceContainer(queueService, alarmNotificationService);
  }

  /**
   * 创建队列服务
   */
  private static async createQueueService(options: {
    queueType?: 'sqlite' | 'bullmq';
    sqliteConfig?: {
      dbPath?: string;
      pollInterval?: number;
      maxConcurrency?: number;
    };
  }): Promise<QueueService> {
    const queueType = options.queueType || config.QUEUE_TYPE;

    if (queueType === 'sqlite') {
      console.log('[ServiceContainer] Creating SQLite queue service');

      const sqliteConfig = {
        dbPath: options.sqliteConfig?.dbPath || config.QUEUE_DB_PATH,
        pollInterval: options.sqliteConfig?.pollInterval || config.QUEUE_POLL_INTERVAL,
        maxConcurrency: options.sqliteConfig?.maxConcurrency || config.QUEUE_MAX_CONCURRENCY,
      };

      return new SQLiteQueueService(sqliteConfig);
    }

    // TODO: BullMQ implementation
    throw new Error(`Queue type "${queueType}" not implemented yet`);
  }

  /**
   * 关闭所有服务
   */
  async close(): Promise<void> {
    console.log('[ServiceContainer] Closing services...');

    try {
      await this.queueService.close();
      console.log('[ServiceContainer] Queue service closed');
    } catch (error) {
      console.error('[ServiceContainer] Error closing queue service:', error);
    }

    console.log('[ServiceContainer] All services closed');
  }
}

/**
 * 全局服务容器实例
 */
let serviceContainer: ServiceContainer | null = null;

/**
 * 获取服务容器实例
 */
export function getServiceContainer(): ServiceContainer {
  if (!serviceContainer) {
    throw new Error('ServiceContainer not initialized. Call initializeServices() first.');
  }
  return serviceContainer;
}

/**
 * 初始化全局服务容器
 */
export async function initializeServices(
  db: Db,
  options?: Parameters<typeof ServiceContainer.initialize>[1]
): Promise<ServiceContainer> {
  if (serviceContainer) {
    console.warn('[ServiceContainer] Services already initialized');
    return serviceContainer;
  }

  serviceContainer = await ServiceContainer.initialize(db, options);
  return serviceContainer;
}

/**
 * 关闭全局服务容器
 */
export async function closeServices(): Promise<void> {
  if (!serviceContainer) {
    return;
  }

  await serviceContainer.close();
  serviceContainer = null;
}
