/**
 * Prometheus 指标服务
 *
 * 提供全面的指标收集和导出能力，支持：
 * - Counter: 只增不减的计数器（如请求总数、错误总数）
 * - Gauge: 可增可减的仪表（如在线用户数、内存使用）
 * - Histogram: 分布统计（如延迟分布）
 * - Summary: 分位数统计（如 P50/P95/P99）
 *
 * 遵循 Prometheus 命名规范：
 * - 格式: <namespace>_<subsystem>_<metric_name>_<unit>
 * - 示例: uartserver_socketio_query_duration_seconds
 */

import { Registry, Counter, Gauge, Histogram, Summary, collectDefaultMetrics } from 'prom-client';
import type {
  CounterConfiguration,
  GaugeConfiguration,
  HistogramConfiguration,
  SummaryConfiguration
} from 'prom-client';
import { logger } from '../utils/logger';

/**
 * 指标命名空间
 */
const METRICS_NAMESPACE = 'uartserver';

/**
 * 默认的延迟分桶 (秒)
 * 覆盖范围: 50ms ~ 10s
 */
const DEFAULT_LATENCY_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/**
 * 指标服务类
 * 使用单例模式，确保整个应用只有一个 Registry
 */
export class MetricsService {
  private static instance: MetricsService;
  private registry: Registry;
  private metricsEnabled: boolean;

  // 缓存已创建的指标，避免重复创建
  private counters = new Map<string, Counter>();
  private gauges = new Map<string, Gauge>();
  private histograms = new Map<string, Histogram>();
  private summaries = new Map<string, Summary>();

  /**
   * 私有构造函数（单例模式）
   */
  private constructor() {
    this.registry = new Registry();
    this.metricsEnabled = true;

    // 设置默认标签
    this.registry.setDefaultLabels({
      app: 'uartserver-ng',
      version: '2.0.0',
    });

    // 收集默认的 Node.js 运行时指标
    this.collectDefaultMetrics();

    logger.info('MetricsService initialized');
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  /**
   * 收集默认的 Node.js 运行时指标
   *
   * 包括：
   * - process_cpu_user_seconds_total: CPU 用户态时间
   * - process_cpu_system_seconds_total: CPU 系统态时间
   * - process_heap_bytes: 堆内存使用
   * - process_resident_memory_bytes: 常驻内存
   * - nodejs_eventloop_lag_seconds: 事件循环延迟
   * - nodejs_gc_duration_seconds: GC 耗时
   */
  private collectDefaultMetrics(): void {
    collectDefaultMetrics({
      register: this.registry,
      prefix: `${METRICS_NAMESPACE}_`,
      // 每 10 秒收集一次默认指标
      timeout: 10000,
      // 收集 GC 指标
      gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
      // 收集事件循环延迟
      eventLoopMonitoringPrecision: 10,
    });

    logger.debug('Default Node.js metrics collection enabled');
  }

  /**
   * 创建或获取 Counter 指标
   *
   * @example
   * const requestCounter = metricsService.createCounter({
   *   name: 'http_requests_total',
   *   help: 'Total HTTP requests',
   *   labelNames: ['method', 'path', 'status']
   * });
   * requestCounter.inc({ method: 'GET', path: '/api/users', status: '200' });
   */
  public createCounter<T extends string = string>(
    config: CounterConfiguration<T>
  ): Counter<T> {
    const fullName = this.buildMetricName(config.name);

    // 检查是否已存在
    if (this.counters.has(fullName)) {
      return this.counters.get(fullName) as Counter<T>;
    }

    const counter = new Counter<T>({
      ...config,
      name: fullName,
      registers: [this.registry],
    });

    this.counters.set(fullName, counter as Counter);
    logger.debug(`Created counter: ${fullName}`);

    return counter;
  }

  /**
   * 创建或获取 Gauge 指标
   *
   * @example
   * const activeConnections = metricsService.createGauge({
   *   name: 'socketio_connections_active',
   *   help: 'Active Socket.IO connections'
   * });
   * activeConnections.set(42);
   */
  public createGauge<T extends string = string>(
    config: GaugeConfiguration<T>
  ): Gauge<T> {
    const fullName = this.buildMetricName(config.name);

    if (this.gauges.has(fullName)) {
      return this.gauges.get(fullName) as Gauge<T>;
    }

    const gauge = new Gauge<T>({
      ...config,
      name: fullName,
      registers: [this.registry],
    });

    this.gauges.set(fullName, gauge as Gauge);
    logger.debug(`Created gauge: ${fullName}`);

    return gauge;
  }

  /**
   * 创建或获取 Histogram 指标
   *
   * @example
   * const queryDuration = metricsService.createHistogram({
   *   name: 'query_duration_seconds',
   *   help: 'Query duration in seconds',
   *   labelNames: ['protocol'],
   *   buckets: [0.1, 0.5, 1, 2, 5]
   * });
   *
   * const timer = queryDuration.startTimer({ protocol: 'modbus' });
   * // ... perform query ...
   * timer(); // 自动记录耗时
   */
  public createHistogram<T extends string = string>(
    config: HistogramConfiguration<T>
  ): Histogram<T> {
    const fullName = this.buildMetricName(config.name);

    if (this.histograms.has(fullName)) {
      return this.histograms.get(fullName) as Histogram<T>;
    }

    // 如果未指定 buckets，使用默认的延迟分桶
    const finalConfig = {
      ...config,
      buckets: config.buckets || DEFAULT_LATENCY_BUCKETS,
    };

    const histogram = new Histogram<T>({
      ...finalConfig,
      name: fullName,
      registers: [this.registry],
    });

    this.histograms.set(fullName, histogram as Histogram);
    logger.debug(`Created histogram: ${fullName}`);

    return histogram;
  }

  /**
   * 创建或获取 Summary 指标
   *
   * @example
   * const requestSize = metricsService.createSummary({
   *   name: 'request_size_bytes',
   *   help: 'Request size in bytes',
   *   percentiles: [0.5, 0.9, 0.95, 0.99]
   * });
   * requestSize.observe(1024);
   */
  public createSummary<T extends string = string>(
    config: SummaryConfiguration<T>
  ): Summary<T> {
    const fullName = this.buildMetricName(config.name);

    if (this.summaries.has(fullName)) {
      return this.summaries.get(fullName) as Summary<T>;
    }

    const summary = new Summary<T>({
      ...config,
      name: fullName,
      registers: [this.registry],
    });

    this.summaries.set(fullName, summary as Summary);
    logger.debug(`Created summary: ${fullName}`);

    return summary;
  }

  /**
   * 构建完整的指标名称
   * 自动添加命名空间前缀
   */
  private buildMetricName(name: string): string {
    // 如果已经包含命名空间，直接返回
    if (name.startsWith(`${METRICS_NAMESPACE}_`)) {
      return name;
    }
    return `${METRICS_NAMESPACE}_${name}`;
  }

  /**
   * 获取所有指标数据（Prometheus 格式）
   *
   * @returns Prometheus 格式的文本数据
   */
  public async getMetrics(): Promise<string> {
    if (!this.metricsEnabled) {
      return '';
    }

    try {
      return await this.registry.metrics();
    } catch (error) {
      logger.error('Failed to get metrics:', error);
      return '';
    }
  }

  /**
   * 获取内容类型（用于 HTTP 响应）
   */
  public getContentType(): string {
    return this.registry.contentType;
  }

  /**
   * 获取 Registry 实例（用于高级用法）
   */
  public getRegistry(): Registry {
    return this.registry;
  }

  /**
   * 重置所有指标（主要用于测试）
   */
  public reset(): void {
    this.registry.resetMetrics();
    logger.debug('All metrics reset');
  }

  /**
   * 清除所有指标（主要用于测试）
   */
  public clear(): void {
    this.registry.clear();
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.summaries.clear();
    logger.debug('All metrics cleared');
  }

  /**
   * 启用/禁用指标收集
   */
  public setEnabled(enabled: boolean): void {
    this.metricsEnabled = enabled;
    logger.info(`Metrics collection ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * 获取指标统计信息（用于调试）
   */
  public getStats(): {
    counters: number;
    gauges: number;
    histograms: number;
    summaries: number;
    total: number;
  } {
    return {
      counters: this.counters.size,
      gauges: this.gauges.size,
      histograms: this.histograms.size,
      summaries: this.summaries.size,
      total: this.counters.size + this.gauges.size + this.histograms.size + this.summaries.size,
    };
  }
}

/**
 * 导出单例实例
 */
export const metricsService = MetricsService.getInstance();
