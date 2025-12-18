/**
 * 性能指标收集器
 * 用于收集和统计性能测试数据
 */

export interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface LatencyStats {
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  count: number;
}

export interface ThroughputStats {
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  duration: number; // 毫秒
  requestsPerSecond: number;
  successRate: number;
}

export interface ResourceStats {
  cpu: {
    usage: number; // 百分比
    user: number;
    system: number;
  };
  memory: {
    heapUsed: number; // MB
    heapTotal: number; // MB
    rss: number; // MB
    external: number; // MB
  };
}

/**
 * 性能指标收集器类
 */
export class MetricsCollector {
  private latencies: number[] = [];
  private startTime: number = 0;
  private endTime: number = 0;
  private successCount: number = 0;
  private failureCount: number = 0;
  private resourceSnapshots: ResourceStats[] = [];

  /**
   * 开始收集
   */
  start(): void {
    this.startTime = Date.now();
    this.latencies = [];
    this.successCount = 0;
    this.failureCount = 0;
    this.resourceSnapshots = [];
  }

  /**
   * 记录延迟
   */
  recordLatency(latencyMs: number, success: boolean = true): void {
    this.latencies.push(latencyMs);
    if (success) {
      this.successCount++;
    } else {
      this.failureCount++;
    }
  }

  /**
   * 记录资源使用情况
   */
  recordResourceUsage(): void {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    this.resourceSnapshots.push({
      cpu: {
        usage: 0, // 需要通过多次采样计算
        user: cpuUsage.user / 1000, // 转换为毫秒
        system: cpuUsage.system / 1000,
      },
      memory: {
        heapUsed: memUsage.heapUsed / 1024 / 1024, // 转换为 MB
        heapTotal: memUsage.heapTotal / 1024 / 1024,
        rss: memUsage.rss / 1024 / 1024,
        external: memUsage.external / 1024 / 1024,
      },
    });
  }

  /**
   * 结束收集
   */
  stop(): void {
    this.endTime = Date.now();
  }

  /**
   * 计算延迟统计
   */
  getLatencyStats(): LatencyStats {
    if (this.latencies.length === 0) {
      return {
        min: 0,
        max: 0,
        mean: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        count: 0,
      };
    }

    const sorted = [...this.latencies].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, val) => acc + val, 0);

    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: sum / sorted.length,
      p50: this.percentile(sorted, 50),
      p95: this.percentile(sorted, 95),
      p99: this.percentile(sorted, 99),
      count: sorted.length,
    };
  }

  /**
   * 计算吞吐量统计
   */
  getThroughputStats(): ThroughputStats {
    const duration = this.endTime - this.startTime;
    const totalRequests = this.successCount + this.failureCount;

    return {
      totalRequests,
      successRequests: this.successCount,
      failedRequests: this.failureCount,
      duration,
      requestsPerSecond: (totalRequests / duration) * 1000,
      successRate: totalRequests > 0 ? this.successCount / totalRequests : 0,
    };
  }

  /**
   * 获取资源使用统计
   */
  getResourceStats(): ResourceStats | null {
    if (this.resourceSnapshots.length === 0) {
      return null;
    }

    // 返回最后一次采样的数据
    return this.resourceSnapshots[this.resourceSnapshots.length - 1];
  }

  /**
   * 获取资源使用峰值
   */
  getPeakResourceStats(): { memory: number; cpu: number } {
    if (this.resourceSnapshots.length === 0) {
      return { memory: 0, cpu: 0 };
    }

    const peakMemory = Math.max(
      ...this.resourceSnapshots.map((s) => s.memory.heapUsed)
    );
    const peakCpu = Math.max(...this.resourceSnapshots.map((s) => s.cpu.usage));

    return {
      memory: peakMemory,
      cpu: peakCpu,
    };
  }

  /**
   * 计算百分位数
   */
  private percentile(sortedArray: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)];
  }

  /**
   * 重置收集器
   */
  reset(): void {
    this.latencies = [];
    this.startTime = 0;
    this.endTime = 0;
    this.successCount = 0;
    this.failureCount = 0;
    this.resourceSnapshots = [];
  }

  /**
   * 生成报告摘要
   */
  getSummary(): string {
    const latency = this.getLatencyStats();
    const throughput = this.getThroughputStats();
    const resource = this.getResourceStats();
    const peak = this.getPeakResourceStats();

    return `
性能测试摘要
============

延迟统计:
  - 最小延迟: ${latency.min.toFixed(2)} ms
  - 最大延迟: ${latency.max.toFixed(2)} ms
  - 平均延迟: ${latency.mean.toFixed(2)} ms
  - P50 延迟: ${latency.p50.toFixed(2)} ms
  - P95 延迟: ${latency.p95.toFixed(2)} ms
  - P99 延迟: ${latency.p99.toFixed(2)} ms
  - 请求总数: ${latency.count}

吞吐量统计:
  - 总请求数: ${throughput.totalRequests}
  - 成功请求: ${throughput.successRequests}
  - 失败请求: ${throughput.failedRequests}
  - 测试时长: ${(throughput.duration / 1000).toFixed(2)} s
  - 吞吐量: ${throughput.requestsPerSecond.toFixed(2)} req/s
  - 成功率: ${(throughput.successRate * 100).toFixed(2)}%

资源使用:
  - 当前堆内存: ${resource?.memory.heapUsed.toFixed(2) || 0} MB
  - 当前总内存: ${resource?.memory.rss.toFixed(2) || 0} MB
  - 峰值堆内存: ${peak.memory.toFixed(2)} MB
  - CPU 用户时间: ${resource?.cpu.user.toFixed(2) || 0} ms
  - CPU 系统时间: ${resource?.cpu.system.toFixed(2) || 0} ms
`;
  }
}

/**
 * 创建一个新的指标收集器
 */
export function createMetricsCollector(): MetricsCollector {
  return new MetricsCollector();
}
