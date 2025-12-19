/**
 * Database (MongoDB) Prometheus 指标
 *
 * 监控数据库连接、操作性能、连接池健康状况
 */

import type { Counter, Gauge, Histogram } from 'prom-client';
import { metricsService } from '../metrics.service';

/**
 * Database 指标集合
 */
export class DatabaseMetrics {
  // ========== 连接指标 ==========

  /** 数据库连接状态 (0=未连接, 1=已连接) */
  public readonly connectionStatus: Gauge;

  /** 连接池大小 */
  public readonly poolSize: Gauge;

  /** 连接池中活跃的连接数 */
  public readonly poolActiveConnections: Gauge;

  /** 连接池中可用的连接数 */
  public readonly poolAvailableConnections: Gauge;

  /** 等待连接的操作数 */
  public readonly poolWaitQueueSize: Gauge;

  /** 累计连接创建次数 */
  public readonly connectionsCreatedTotal: Counter;

  /** 累计连接关闭次数 */
  public readonly connectionsClosedTotal: Counter;

  /** 连接错误总数 */
  public readonly connectionErrorsTotal: Counter;

  // ========== 操作指标 ==========

  /** 数据库操作总数 (按命令类型分类: find, insert, update, delete, aggregate, count 等) */
  public readonly operationsTotal: Counter<'command'>;

  /** 数据库操作耗时分布 */
  public readonly operationDuration: Histogram<'command'>;

  /** 操作失败总数 (按命令类型分类) */
  public readonly operationFailuresTotal: Counter<'command'>;

  // ========== 集合指标 ==========

  /** 当前数据库中的集合数量 */
  public readonly collectionsCount: Gauge;

  // ========== 健康检查指标 ==========

  /** 健康检查成功次数 */
  public readonly healthCheckSuccessTotal: Counter;

  /** 健康检查失败次数 */
  public readonly healthCheckFailureTotal: Counter;

  /** 健康检查耗时 */
  public readonly healthCheckDuration: Histogram;

  constructor() {
    // ========== 初始化连接指标 ==========

    this.connectionStatus = metricsService.createGauge({
      name: 'mongodb_connection_status',
      help: 'MongoDB connection status (0=disconnected, 1=connected)',
    });

    this.poolSize = metricsService.createGauge({
      name: 'mongodb_pool_size',
      help: 'Current size of MongoDB connection pool',
    });

    this.poolActiveConnections = metricsService.createGauge({
      name: 'mongodb_pool_active_connections',
      help: 'Number of active connections in the MongoDB pool',
    });

    this.poolAvailableConnections = metricsService.createGauge({
      name: 'mongodb_pool_available_connections',
      help: 'Number of available connections in the MongoDB pool',
    });

    this.poolWaitQueueSize = metricsService.createGauge({
      name: 'mongodb_pool_wait_queue_size',
      help: 'Number of operations waiting for a connection',
    });

    this.connectionsCreatedTotal = metricsService.createCounter({
      name: 'mongodb_connections_created_total',
      help: 'Total number of MongoDB connections created',
    });

    this.connectionsClosedTotal = metricsService.createCounter({
      name: 'mongodb_connections_closed_total',
      help: 'Total number of MongoDB connections closed',
    });

    this.connectionErrorsTotal = metricsService.createCounter({
      name: 'mongodb_connection_errors_total',
      help: 'Total number of MongoDB connection errors',
    });

    // ========== 初始化操作指标 ==========

    this.operationsTotal = metricsService.createCounter({
      name: 'mongodb_operations_total',
      help: 'Total number of MongoDB operations by command type',
      labelNames: ['command'], // find, insert, update, delete, aggregate, etc.
    });

    this.operationDuration = metricsService.createHistogram({
      name: 'mongodb_operation_duration_seconds',
      help: 'MongoDB operation duration in seconds by command type',
      labelNames: ['command'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5], // 1ms ~ 5s
    });

    this.operationFailuresTotal = metricsService.createCounter({
      name: 'mongodb_operation_failures_total',
      help: 'Total number of failed MongoDB operations by command type',
      labelNames: ['command'],
    });

    // ========== 初始化集合指标 ==========

    this.collectionsCount = metricsService.createGauge({
      name: 'mongodb_collections_count',
      help: 'Number of collections in the current database',
    });

    // ========== 初始化健康检查指标 ==========

    this.healthCheckSuccessTotal = metricsService.createCounter({
      name: 'mongodb_health_check_success_total',
      help: 'Total number of successful MongoDB health checks',
    });

    this.healthCheckFailureTotal = metricsService.createCounter({
      name: 'mongodb_health_check_failure_total',
      help: 'Total number of failed MongoDB health checks',
    });

    this.healthCheckDuration = metricsService.createHistogram({
      name: 'mongodb_health_check_duration_seconds',
      help: 'MongoDB health check duration in seconds',
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1], // 1ms ~ 1s
    });
  }

  /**
   * 记录连接状态
   */
  recordConnectionStatus(connected: boolean): void {
    this.connectionStatus.set(connected ? 1 : 0);
  }

  /**
   * 记录连接创建
   */
  recordConnectionCreated(): void {
    this.connectionsCreatedTotal.inc();
  }

  /**
   * 记录连接关闭
   */
  recordConnectionClosed(): void {
    this.connectionsClosedTotal.inc();
  }

  /**
   * 记录连接错误
   */
  recordConnectionError(): void {
    this.connectionErrorsTotal.inc();
  }

  /**
   * 更新连接池指标
   */
  updatePoolMetrics(metrics: {
    poolSize: number;
    activeConnections: number;
    availableConnections: number;
    waitQueueSize: number;
  }): void {
    this.poolSize.set(metrics.poolSize);
    this.poolActiveConnections.set(metrics.activeConnections);
    this.poolAvailableConnections.set(metrics.availableConnections);
    this.poolWaitQueueSize.set(metrics.waitQueueSize);
  }

  /**
   * 记录数据库操作
   */
  recordOperation(command: string, durationMs: number, failed = false): void {
    this.operationsTotal.inc({ command });
    this.operationDuration.observe({ command }, durationMs / 1000);

    if (failed) {
      this.operationFailuresTotal.inc({ command });
    }
  }

  /**
   * 更新集合数量
   */
  updateCollectionsCount(count: number): void {
    this.collectionsCount.set(count);
  }

  /**
   * 记录健康检查结果
   */
  recordHealthCheck(success: boolean, durationMs: number): void {
    if (success) {
      this.healthCheckSuccessTotal.inc();
    } else {
      this.healthCheckFailureTotal.inc();
    }

    this.healthCheckDuration.observe(durationMs / 1000);
  }
}

/**
 * Database 指标单例
 */
export const databaseMetrics = new DatabaseMetrics();
