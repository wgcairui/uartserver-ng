/**
 * WebSocket 服务 Prometheus 指标
 *
 * 监控浏览器用户连接、订阅管理、实时推送等核心功能
 */

import type { Counter, Gauge } from 'prom-client';
import { metricsService } from '../metrics.service';

/**
 * WebSocket 指标集合
 */
export class WebSocketMetrics {
  // ========== 连接指标 ==========

  /** 当前活跃的用户 WebSocket 连接数 */
  public readonly connectionsActive: Gauge;

  /** 累计创建的连接数 */
  public readonly connectionsCreatedTotal: Counter;

  /** 累计断开的连接数 (按断开原因分类) */
  public readonly disconnectionsTotal: Counter<'reason'>;

  /** 认证成功的连接数 */
  public readonly authenticatedConnectionsTotal: Counter;

  /** 认证失败的连接数 */
  public readonly authenticationFailuresTotal: Counter;

  // ========== 订阅指标 ==========

  /** 设备订阅总数 (按操作类型: subscribe/unsubscribe) */
  public readonly subscriptionsTotal: Counter<'operation'>;

  /** 当前活跃的订阅数 */
  public readonly subscriptionsActive: Gauge;

  /** 当前活跃的房间数 */
  public readonly roomsActive: Gauge;

  /** 房间订阅者数量分布 (平均每个房间的订阅者数) */
  public readonly roomSubscribersAverage: Gauge;

  // ========== 推送指标 ==========

  /** 设备更新推送总数 */
  public readonly deviceUpdatesSentTotal: Counter;

  /** 批量设备更新推送总数 */
  public readonly batchDeviceUpdatesSentTotal: Counter;

  /** 推送失败总数 */
  public readonly pushFailuresTotal: Counter;

  // ========== 事件处理指标 ==========

  /** WebSocket 事件处理总数 (按事件类型分类) */
  public readonly eventsTotal: Counter<'event_type'>;

  /** 心跳事件总数 */
  public readonly heartbeatsTotal: Counter;

  constructor() {
    // ========== 初始化连接指标 ==========

    this.connectionsActive = metricsService.createGauge({
      name: 'websocket_connections_active',
      help: 'Current number of active user WebSocket connections',
    });

    this.connectionsCreatedTotal = metricsService.createCounter({
      name: 'websocket_connections_created_total',
      help: 'Total number of user WebSocket connections created',
    });

    this.disconnectionsTotal = metricsService.createCounter({
      name: 'websocket_disconnections_total',
      help: 'Total number of user WebSocket disconnections by reason',
      labelNames: ['reason'],
    });

    this.authenticatedConnectionsTotal = metricsService.createCounter({
      name: 'websocket_authenticated_connections_total',
      help: 'Total number of successfully authenticated WebSocket connections',
    });

    this.authenticationFailuresTotal = metricsService.createCounter({
      name: 'websocket_authentication_failures_total',
      help: 'Total number of WebSocket authentication failures',
    });

    // ========== 初始化订阅指标 ==========

    this.subscriptionsTotal = metricsService.createCounter({
      name: 'websocket_subscriptions_total',
      help: 'Total number of subscription operations (subscribe/unsubscribe)',
      labelNames: ['operation'], // subscribe, unsubscribe
    });

    this.subscriptionsActive = metricsService.createGauge({
      name: 'websocket_subscriptions_active',
      help: 'Current number of active device subscriptions',
    });

    this.roomsActive = metricsService.createGauge({
      name: 'websocket_rooms_active',
      help: 'Current number of active subscription rooms',
    });

    this.roomSubscribersAverage = metricsService.createGauge({
      name: 'websocket_room_subscribers_average',
      help: 'Average number of subscribers per room',
    });

    // ========== 初始化推送指标 ==========

    this.deviceUpdatesSentTotal = metricsService.createCounter({
      name: 'websocket_device_updates_sent_total',
      help: 'Total number of device updates sent to clients',
    });

    this.batchDeviceUpdatesSentTotal = metricsService.createCounter({
      name: 'websocket_batch_device_updates_sent_total',
      help: 'Total number of batch device updates sent to clients',
    });

    this.pushFailuresTotal = metricsService.createCounter({
      name: 'websocket_push_failures_total',
      help: 'Total number of push failures',
    });

    // ========== 初始化事件处理指标 ==========

    this.eventsTotal = metricsService.createCounter({
      name: 'websocket_events_total',
      help: 'Total number of WebSocket events processed by event type',
      labelNames: ['event_type'],
    });

    this.heartbeatsTotal = metricsService.createCounter({
      name: 'websocket_heartbeats_total',
      help: 'Total number of heartbeat events received from users',
    });
  }

  /**
   * 记录连接事件
   */
  recordConnection(authenticated: boolean): void {
    this.connectionsActive.inc();
    this.connectionsCreatedTotal.inc();

    if (authenticated) {
      this.authenticatedConnectionsTotal.inc();
    }
  }

  /**
   * 记录断开连接事件
   */
  recordDisconnection(reason: string): void {
    this.connectionsActive.dec();
    this.disconnectionsTotal.inc({ reason });
  }

  /**
   * 记录认证失败
   */
  recordAuthenticationFailure(): void {
    this.authenticationFailuresTotal.inc();
  }

  /**
   * 记录订阅操作
   */
  recordSubscription(operation: 'subscribe' | 'unsubscribe'): void {
    this.subscriptionsTotal.inc({ operation });

    if (operation === 'subscribe') {
      this.subscriptionsActive.inc();
    } else {
      this.subscriptionsActive.dec();
    }
  }

  /**
   * 更新房间统计信息
   */
  updateRoomStats(roomCount: number, totalSubscribers: number): void {
    this.roomsActive.set(roomCount);

    if (roomCount > 0) {
      this.roomSubscribersAverage.set(totalSubscribers / roomCount);
    } else {
      this.roomSubscribersAverage.set(0);
    }
  }

  /**
   * 记录设备更新推送
   */
  recordDeviceUpdate(): void {
    this.deviceUpdatesSentTotal.inc();
  }

  /**
   * 记录批量设备更新推送
   */
  recordBatchDeviceUpdate(): void {
    this.batchDeviceUpdatesSentTotal.inc();
  }

  /**
   * 记录推送失败
   */
  recordPushFailure(): void {
    this.pushFailuresTotal.inc();
  }
}

/**
 * WebSocket 指标单例
 */
export const webSocketMetrics = new WebSocketMetrics();
