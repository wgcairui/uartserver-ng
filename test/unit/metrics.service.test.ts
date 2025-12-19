/**
 * MetricsService 单元测试
 *
 * 测试指标服务的核心功能：
 * - Counter, Gauge, Histogram, Summary 的创建和使用
 * - 指标数据导出
 * - 单例模式
 * - 默认运行时指标
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { MetricsService } from '../../src/services/metrics.service';

describe('MetricsService', () => {
  let metricsService: MetricsService;

  beforeEach(() => {
    // 获取单例实例
    metricsService = MetricsService.getInstance();
    // 重置所有指标值（但保留指标定义）
    metricsService.reset();
  });

  describe('Singleton Pattern', () => {
    test('should return same instance', () => {
      const instance1 = MetricsService.getInstance();
      const instance2 = MetricsService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('Counter', () => {
    test('should create counter', () => {
      const counter = metricsService.createCounter({
        name: 'test_counter_total',
        help: 'Test counter',
      });

      expect(counter).toBeDefined();
      expect(counter.name).toBe('uartserver_test_counter_total');
    });

    test('should increment counter', async () => {
      const counter = metricsService.createCounter({
        name: 'test_increment_total',
        help: 'Test increment counter',
      });

      counter.inc();
      counter.inc(5);

      // 验证指标可以被导出
      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('uartserver_test_increment_total{');
      expect(metrics).toMatch(/uartserver_test_increment_total\{.*\} 6/);
    });

    test('should increment counter with labels', async () => {
      const counter = metricsService.createCounter({
        name: 'test_labeled_counter_total',
        help: 'Test labeled counter',
        labelNames: ['method', 'status'],
      });

      counter.inc({ method: 'GET', status: '200' });
      counter.inc({ method: 'GET', status: '200' }, 2);
      counter.inc({ method: 'POST', status: '201' });

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('method="GET"');
      expect(metrics).toContain('status="200"');
      expect(metrics).toContain('method="POST"');
    });

    test('should reuse existing counter', () => {
      const counter1 = metricsService.createCounter({
        name: 'test_reuse_total',
        help: 'Test reuse counter',
      });

      const counter2 = metricsService.createCounter({
        name: 'test_reuse_total',
        help: 'Different help text', // 会被忽略
      });

      expect(counter1).toBe(counter2);
    });
  });

  describe('Gauge', () => {
    test('should create gauge', () => {
      const gauge = metricsService.createGauge({
        name: 'test_gauge',
        help: 'Test gauge',
      });

      expect(gauge).toBeDefined();
      expect(gauge.name).toBe('uartserver_test_gauge');
    });

    test('should set gauge value', async () => {
      const gauge = metricsService.createGauge({
        name: 'test_set_gauge',
        help: 'Test set gauge',
      });

      gauge.set(42);

      const metrics = await metricsService.getMetrics();
      expect(metrics).toMatch(/uartserver_test_set_gauge\{.*\} 42/);
    });

    test('should increment and decrement gauge', async () => {
      const gauge = metricsService.createGauge({
        name: 'test_inc_dec_gauge',
        help: 'Test inc/dec gauge',
      });

      gauge.inc();
      gauge.inc(5);
      gauge.dec(2);

      const metrics = await metricsService.getMetrics();
      expect(metrics).toMatch(/uartserver_test_inc_dec_gauge\{.*\} 4/);
    });

    test('should work with labels', async () => {
      const gauge = metricsService.createGauge({
        name: 'test_labeled_gauge',
        help: 'Test labeled gauge',
        labelNames: ['instance'],
      });

      gauge.set({ instance: 'server1' }, 10);
      gauge.set({ instance: 'server2' }, 20);

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('instance="server1"');
      expect(metrics).toContain('instance="server2"');
    });
  });

  describe('Histogram', () => {
    test('should create histogram', () => {
      const histogram = metricsService.createHistogram({
        name: 'test_histogram_seconds',
        help: 'Test histogram',
      });

      expect(histogram).toBeDefined();
      expect(histogram.name).toBe('uartserver_test_histogram_seconds');
    });

    test('should use default buckets', async () => {
      const histogram = metricsService.createHistogram({
        name: 'test_default_buckets_seconds',
        help: 'Test default buckets',
      });

      histogram.observe(0.3);

      // 默认分桶: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
      // 0.3 应该落在 0.5 的桶中
      const metrics = await metricsService.getMetrics();
      expect(metrics).toMatch(/uartserver_test_default_buckets_seconds_bucket\{.*le="0\.5".*\} 1/);
      expect(metrics).toMatch(/uartserver_test_default_buckets_seconds_count\{.*\} 1/);
    });

    test('should use custom buckets', async () => {
      const histogram = metricsService.createHistogram({
        name: 'test_custom_buckets_seconds',
        help: 'Test custom buckets',
        buckets: [0.1, 0.5, 1],
      });

      histogram.observe(0.3);
      histogram.observe(0.7);

      const metrics = await metricsService.getMetrics();
      expect(metrics).toMatch(/uartserver_test_custom_buckets_seconds_bucket\{.*le="0\.5".*\} 1/); // 只有 0.3
      expect(metrics).toMatch(/uartserver_test_custom_buckets_seconds_bucket\{.*le="1".*\} 2/);   // 0.3 和 0.7
      expect(metrics).toMatch(/uartserver_test_custom_buckets_seconds_count\{.*\} 2/);
    });

    test('should work with timer', async () => {
      const histogram = metricsService.createHistogram({
        name: 'test_timer_seconds',
        help: 'Test timer',
        labelNames: ['operation'],
      });

      const timer = histogram.startTimer({ operation: 'query' });
      // 模拟一些工作
      const duration = timer(); // 返回耗时（秒）

      expect(duration).toBeGreaterThan(0);

      const metrics = await metricsService.getMetrics();
      // 应该有至少一个观测值
      expect(metrics).toMatch(/uartserver_test_timer_seconds_count\{.*operation="query".*\} 1/);
    });
  });

  describe('Summary', () => {
    test('should create summary', () => {
      const summary = metricsService.createSummary({
        name: 'test_summary',
        help: 'Test summary',
      });

      expect(summary).toBeDefined();
      expect(summary.name).toBe('uartserver_test_summary');
    });

    test('should observe values', async () => {
      const summary = metricsService.createSummary({
        name: 'test_observe_summary',
        help: 'Test observe summary',
        percentiles: [0.5, 0.9, 0.99],
      });

      // 观测一些值
      for (let i = 1; i <= 100; i++) {
        summary.observe(i);
      }

      const metrics = await metricsService.getMetrics();
      expect(metrics).toMatch(/uartserver_test_observe_summary_count\{.*\} 100/);
      expect(metrics).toMatch(/uartserver_test_observe_summary_sum\{.*\} 5050/); // 1+2+...+100 = 5050
    });
  });

  describe('Metrics Export', () => {
    test('should export metrics in Prometheus format', async () => {
      // 创建一些指标
      const counter = metricsService.createCounter({
        name: 'export_test_total',
        help: 'Export test counter',
      });
      counter.inc(42);

      const gauge = metricsService.createGauge({
        name: 'export_test_gauge',
        help: 'Export test gauge',
      });
      gauge.set(100);

      // 获取指标
      const metrics = await metricsService.getMetrics();

      // 验证格式
      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
      expect(metrics).toMatch(/uartserver_export_test_total\{.*\} 42/);
      expect(metrics).toMatch(/uartserver_export_test_gauge\{.*\} 100/);
    });

    test('should include default metrics', async () => {
      const metrics = await metricsService.getMetrics();

      // 应该包含默认的 Node.js 运行时指标
      expect(metrics).toContain('uartserver_process_cpu_user_seconds_total');
      expect(metrics).toContain('uartserver_nodejs_heap_size_total_bytes');
      expect(metrics).toContain('uartserver_nodejs_eventloop_lag_seconds');
    });

    test('should return correct content type', () => {
      const contentType = metricsService.getContentType();
      expect(contentType).toContain('text/plain');
    });
  });

  describe('Registry Management', () => {
    test('should reset metrics', async () => {
      const counter = metricsService.createCounter({
        name: 'reset_test_total',
        help: 'Reset test counter',
      });
      counter.inc(42);

      metricsService.reset();

      const metrics = await metricsService.getMetrics();
      expect(metrics).toMatch(/uartserver_reset_test_total\{.*\} 0/);
    });

    test('should get stats', () => {
      metricsService.createCounter({ name: 'stats_counter_total', help: 'Test' });
      metricsService.createGauge({ name: 'stats_gauge', help: 'Test' });
      metricsService.createHistogram({ name: 'stats_histogram', help: 'Test' });
      metricsService.createSummary({ name: 'stats_summary', help: 'Test' });

      const stats = metricsService.getStats();

      expect(stats.counters).toBeGreaterThanOrEqual(1);
      expect(stats.gauges).toBeGreaterThanOrEqual(1);
      expect(stats.histograms).toBeGreaterThanOrEqual(1);
      expect(stats.summaries).toBeGreaterThanOrEqual(1);
      expect(stats.total).toBe(
        stats.counters + stats.gauges + stats.histograms + stats.summaries
      );
    });

    test('should enable/disable metrics', async () => {
      const counter = metricsService.createCounter({
        name: 'enable_test_total',
        help: 'Enable test counter',
      });
      counter.inc(42);

      metricsService.setEnabled(false);
      const metricsDisabled = await metricsService.getMetrics();
      expect(metricsDisabled).toBe('');

      metricsService.setEnabled(true);
      const metricsEnabled = await metricsService.getMetrics();
      expect(metricsEnabled).toContain('uartserver_enable_test_total');
    });
  });

  describe('Metric Naming', () => {
    test('should auto-prefix metric names', () => {
      const counter = metricsService.createCounter({
        name: 'auto_prefix_total',
        help: 'Auto prefix test',
      });

      expect(counter.name).toBe('uartserver_auto_prefix_total');
    });

    test('should not duplicate prefix', () => {
      const counter = metricsService.createCounter({
        name: 'uartserver_manual_prefix_total',
        help: 'Manual prefix test',
      });

      expect(counter.name).toBe('uartserver_manual_prefix_total');
      // 不应该变成 uartserver_uartserver_manual_prefix_total
    });
  });
});
