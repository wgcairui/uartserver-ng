/**
 * Socket.IO 服务 Prometheus 指标
 *
 * 监控 Node 客户端连接、查询性能、事件处理等核心业务指标
 */

import type { Counter, Gauge, Histogram } from 'prom-client';
import { metricsService } from '../metrics.service';

/**
 * Socket.IO 指标集合
 */
export class SocketIoMetrics {
  // ========== 连接指标 ==========

  /** 当前活跃的 Node 客户端连接数 */
  public readonly connectionsActive: Gauge;

  /** 累计创建的连接数 */
  public readonly connectionsCreatedTotal: Counter;

  /** 累计断开的连接数 (按断开原因分类) */
  public readonly disconnectionsTotal: Counter<'reason'>;

  // ========== 查询指标 ==========

  /** 查询请求总数 (按状态分类: success/timeout/error) */
  public readonly queriesTotal: Counter<'status'>;

  /** 查询耗时分布 (从发送到收到结果) */
  public readonly queryDuration: Histogram;

  /** 查询结果总数 (按结果状态分类: ok/error) */
  public readonly queryResultsTotal: Counter<'result_status'>;

  // ========== DTU 操作指标 ==========

  /** DTU 操作总数 (按操作类型分类) */
  public readonly dtuOperationsTotal: Counter<'operation'>;

  /** DTU 操作耗时分布 */
  public readonly dtuOperationDuration: Histogram<'operation'>;

  /** DTU 操作结果总数 (按结果状态分类) */
  public readonly dtuOperationResultsTotal: Counter<'operation' | 'result_status'>;

  // ========== 事件处理指标 ==========

  /** Socket.IO 事件处理总数 (按事件类型分类) */
  public readonly eventsTotal: Counter<'event_type'>;

  /** 心跳事件总数 */
  public readonly heartbeatsTotal: Counter;

  /** 心跳超时次数 */
  public readonly heartbeatTimeoutsTotal: Counter;

  // ========== 终端状态指标 ==========

  /** 当前在线的终端数量 */
  public readonly terminalsOnline: Gauge;

  /** 已注册的终端总数 */
  public readonly terminalsRegisteredTotal: Gauge;

  /** 终端上线事件总数 */
  public readonly terminalOnlineEventsTotal: Counter;

  /** 终端下线事件总数 */
  public readonly terminalOfflineEventsTotal: Counter;

  // ========== 缓存指标 ==========

  /** 缓存大小 (按缓存类型分类: nodes/terminals/protocols/queries) */
  public readonly cacheSize: Gauge<'cache_type'>;

  // ========== 错误和告警指标 ==========

  /** 指令超时总数 */
  public readonly instructTimeoutsTotal: Counter;

  /** 设备超时总数 */
  public readonly deviceTimeoutsTotal: Counter;

  /** 告警事件总数 (按告警类型分类) */
  public readonly alarmsTotal: Counter<'alarm_type'>;

  /** 启动错误总数 */
  public readonly startErrorsTotal: Counter;

  constructor() {
    // ========== 初始化连接指标 ==========

    this.connectionsActive = metricsService.createGauge({
      name: 'socketio_connections_active',
      help: 'Current number of active Node client connections',
    });

    this.connectionsCreatedTotal = metricsService.createCounter({
      name: 'socketio_connections_created_total',
      help: 'Total number of Node client connections created',
    });

    this.disconnectionsTotal = metricsService.createCounter({
      name: 'socketio_disconnections_total',
      help: 'Total number of Node client disconnections by reason',
      labelNames: ['reason'],
    });

    // ========== 初始化查询指标 ==========

    this.queriesTotal = metricsService.createCounter({
      name: 'socketio_queries_total',
      help: 'Total number of instruction queries sent to Node clients',
      labelNames: ['status'], // success, timeout, error
    });

    this.queryDuration = metricsService.createHistogram({
      name: 'socketio_query_duration_seconds',
      help: 'Instruction query duration in seconds (from send to result)',
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10], // 50ms ~ 10s
    });

    this.queryResultsTotal = metricsService.createCounter({
      name: 'socketio_query_results_total',
      help: 'Total number of query results received',
      labelNames: ['result_status'], // ok, error
    });

    // ========== 初始化 DTU 操作指标 ==========

    this.dtuOperationsTotal = metricsService.createCounter({
      name: 'socketio_dtu_operations_total',
      help: 'Total number of DTU operations by operation type',
      labelNames: ['operation'],
    });

    this.dtuOperationDuration = metricsService.createHistogram({
      name: 'socketio_dtu_operation_duration_seconds',
      help: 'DTU operation duration in seconds by operation type',
      labelNames: ['operation'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30], // 100ms ~ 30s
    });

    this.dtuOperationResultsTotal = metricsService.createCounter({
      name: 'socketio_dtu_operation_results_total',
      help: 'Total number of DTU operation results by operation and result status',
      labelNames: ['operation', 'result_status'],
    });

    // ========== 初始化事件处理指标 ==========

    this.eventsTotal = metricsService.createCounter({
      name: 'socketio_events_total',
      help: 'Total number of Socket.IO events processed by event type',
      labelNames: ['event_type'],
    });

    this.heartbeatsTotal = metricsService.createCounter({
      name: 'socketio_heartbeats_total',
      help: 'Total number of heartbeat events received',
    });

    this.heartbeatTimeoutsTotal = metricsService.createCounter({
      name: 'socketio_heartbeat_timeouts_total',
      help: 'Total number of heartbeat timeouts (disconnected clients)',
    });

    // ========== 初始化终端状态指标 ==========

    this.terminalsOnline = metricsService.createGauge({
      name: 'socketio_terminals_online',
      help: 'Current number of online terminals',
    });

    this.terminalsRegisteredTotal = metricsService.createGauge({
      name: 'socketio_terminals_registered_total',
      help: 'Total number of registered terminals in cache',
    });

    this.terminalOnlineEventsTotal = metricsService.createCounter({
      name: 'socketio_terminal_online_events_total',
      help: 'Total number of terminal online events',
    });

    this.terminalOfflineEventsTotal = metricsService.createCounter({
      name: 'socketio_terminal_offline_events_total',
      help: 'Total number of terminal offline events',
    });

    // ========== 初始化缓存指标 ==========

    this.cacheSize = metricsService.createGauge({
      name: 'socketio_cache_size',
      help: 'Size of various caches in Socket.IO service',
      labelNames: ['cache_type'], // nodes, terminals, protocols, queries, instructions
    });

    // ========== 初始化错误和告警指标 ==========

    this.instructTimeoutsTotal = metricsService.createCounter({
      name: 'socketio_instruct_timeouts_total',
      help: 'Total number of instruction timeout events',
    });

    this.deviceTimeoutsTotal = metricsService.createCounter({
      name: 'socketio_device_timeouts_total',
      help: 'Total number of device/mount dev timeout events',
    });

    this.alarmsTotal = metricsService.createCounter({
      name: 'socketio_alarms_total',
      help: 'Total number of alarm events by alarm type',
      labelNames: ['alarm_type'],
    });

    this.startErrorsTotal = metricsService.createCounter({
      name: 'socketio_start_errors_total',
      help: 'Total number of start error events',
    });
  }

  /**
   * 记录连接事件
   */
  recordConnection(): void {
    this.connectionsActive.inc();
    this.connectionsCreatedTotal.inc();
  }

  /**
   * 记录断开连接事件
   */
  recordDisconnection(reason: string): void {
    this.connectionsActive.dec();
    this.disconnectionsTotal.inc({ reason });
  }

  /**
   * 更新缓存大小指标
   */
  updateCacheSize(cacheType: string, size: number): void {
    this.cacheSize.set({ cache_type: cacheType }, size);
  }

  /**
   * 记录终端在线状态变化
   */
  updateTerminalsOnline(count: number): void {
    this.terminalsOnline.set(count);
  }

  /**
   * 更新注册终端总数
   */
  updateTerminalsRegistered(count: number): void {
    this.terminalsRegisteredTotal.set(count);
  }
}

/**
 * Socket.IO 指标单例
 */
export const socketIoMetrics = new SocketIoMetrics();
