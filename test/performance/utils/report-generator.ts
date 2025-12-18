/**
 * 性能测试报告生成器
 */

import type { LatencyStats, ThroughputStats } from './metrics-collector';

export interface PerformanceTestResult {
  testName: string;
  timestamp: Date;
  latency: LatencyStats;
  throughput: ThroughputStats;
  resource?: {
    memory: {
      peak: number;
      avg: number;
    };
    cpu?: {
      peak: number;
      avg: number;
    };
  };
  passed: boolean;
  failures: string[];
}

export interface PerformanceReport {
  title: string;
  generatedAt: Date;
  summary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    overallScore: number; // 0-100
  };
  results: PerformanceTestResult[];
  recommendations: string[];
}

/**
 * 生成性能测试报告
 */
export function generatePerformanceReport(results: PerformanceTestResult[]): PerformanceReport {
  const passedTests = results.filter((r) => r.passed).length;
  const failedTests = results.length - passedTests;

  // 计算总体得分
  const overallScore = calculateOverallScore(results);

  // 生成建议
  const recommendations = generateRecommendations(results);

  return {
    title: 'Phase 2.10 性能测试报告',
    generatedAt: new Date(),
    summary: {
      totalTests: results.length,
      passedTests,
      failedTests,
      overallScore,
    },
    results,
    recommendations,
  };
}

/**
 * 计算总体得分
 */
function calculateOverallScore(results: PerformanceTestResult[]): number {
  if (results.length === 0) return 0;

  let totalScore = 0;

  for (const result of results) {
    let testScore = 100;

    // 延迟评分 (权重 40%)
    if (result.latency.p95 > 500) {
      testScore -= Math.min(40, (result.latency.p95 - 500) / 10);
    }

    // 吞吐量评分 (权重 30%)
    if (result.throughput.requestsPerSecond < 1000) {
      testScore -= Math.min(30, (1000 - result.throughput.requestsPerSecond) / 33);
    }

    // 成功率评分 (权重 20%)
    if (result.throughput.successRate < 0.95) {
      testScore -= Math.min(20, (0.95 - result.throughput.successRate) * 100);
    }

    // 内存评分 (权重 10%)
    if (result.resource && result.resource.memory.peak > 500) {
      testScore -= Math.min(10, (result.resource.memory.peak - 500) / 50);
    }

    totalScore += Math.max(0, testScore);
  }

  return Math.round(totalScore / results.length);
}

/**
 * 生成优化建议
 */
function generateRecommendations(results: PerformanceTestResult[]): string[] {
  const recommendations: string[] = [];

  const hasHighLatency = results.some((r) => r.latency.p95 > 500);
  const hasLowThroughput = results.some((r) => r.throughput.requestsPerSecond < 1000);
  const hasHighMemory = results.some((r) => r.resource && r.resource.memory.peak > 500);
  const hasLowSuccessRate = results.some((r) => r.throughput.successRate < 0.95);

  if (hasHighLatency) {
    recommendations.push('🔴 **高延迟问题**: P95 延迟超过 500ms，建议优化查询处理逻辑或增加缓存');
  }

  if (hasLowThroughput) {
    recommendations.push('🟡 **吞吐量不足**: 系统吞吐量低于 1000 req/s，考虑增加并发处理能力');
  }

  if (hasHighMemory) {
    recommendations.push('🟡 **内存使用偏高**: 峰值内存超过 500MB，检查是否存在内存泄漏');
  }

  if (hasLowSuccessRate) {
    recommendations.push('🔴 **成功率偏低**: 成功率低于 95%，需要改进错误处理和重试机制');
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ **性能优秀**: 所有指标均符合要求，系统已达到生产就绪状态');
  }

  return recommendations;
}

/**
 * 格式化 Markdown 报告
 */
export function formatMarkdownReport(report: PerformanceReport): string {
  const { title, generatedAt, summary, results, recommendations } = report;

  let markdown = `# ${title}\n\n`;
  markdown += `**生成时间**: ${generatedAt.toISOString()}\n`;
  markdown += `**总体得分**: ${summary.overallScore}/100\n\n`;
  markdown += `---\n\n`;

  // 摘要
  markdown += `## 📊 测试摘要\n\n`;
  markdown += `| 指标 | 数值 |\n`;
  markdown += `|------|------|\n`;
  markdown += `| 测试总数 | ${summary.totalTests} |\n`;
  markdown += `| 通过测试 | ${summary.passedTests} |\n`;
  markdown += `| 失败测试 | ${summary.failedTests} |\n`;
  markdown += `| 通过率 | ${((summary.passedTests / summary.totalTests) * 100).toFixed(1)}% |\n`;
  markdown += `\n`;

  // 详细结果
  markdown += `## 📋 测试结果详情\n\n`;

  for (const result of results) {
    const status = result.passed ? '✅ 通过' : '❌ 失败';
    markdown += `### ${result.testName} ${status}\n\n`;

    markdown += `**延迟统计**:\n`;
    markdown += `- P50: ${result.latency.p50.toFixed(2)} ms\n`;
    markdown += `- P95: ${result.latency.p95.toFixed(2)} ms ${result.latency.p95 < 500 ? '✅' : '❌'}\n`;
    markdown += `- P99: ${result.latency.p99.toFixed(2)} ms\n`;
    markdown += `- 平均: ${result.latency.mean.toFixed(2)} ms\n`;
    markdown += `\n`;

    markdown += `**吞吐量统计**:\n`;
    markdown += `- 总请求: ${result.throughput.totalRequests}\n`;
    markdown += `- 成功率: ${(result.throughput.successRate * 100).toFixed(2)}% ${result.throughput.successRate > 0.95 ? '✅' : '❌'}\n`;
    markdown += `- 吞吐量: ${result.throughput.requestsPerSecond.toFixed(2)} req/s ${result.throughput.requestsPerSecond > 1000 ? '✅' : '❌'}\n`;
    markdown += `\n`;

    if (result.resource) {
      markdown += `**资源使用**:\n`;
      markdown += `- 峰值内存: ${result.resource.memory.peak.toFixed(2)} MB ${result.resource.memory.peak < 500 ? '✅' : '❌'}\n`;
      markdown += `- 平均内存: ${result.resource.memory.avg.toFixed(2)} MB\n`;
      markdown += `\n`;
    }

    if (result.failures.length > 0) {
      markdown += `**失败原因**:\n`;
      for (const failure of result.failures) {
        markdown += `- ${failure}\n`;
      }
      markdown += `\n`;
    }

    markdown += `---\n\n`;
  }

  // 优化建议
  markdown += `## 💡 优化建议\n\n`;
  for (const recommendation of recommendations) {
    markdown += `${recommendation}\n\n`;
  }

  return markdown;
}

/**
 * 格式化控制台输出
 */
export function formatConsoleReport(report: PerformanceReport): string {
  const { title, summary } = report;

  let output = '\n';
  output += '='.repeat(70) + '\n';
  output += `  ${title}\n`;
  output += '='.repeat(70) + '\n\n';

  output += `  总体得分: ${summary.overallScore}/100 `;
  if (summary.overallScore >= 90) {
    output += '🟢 优秀\n';
  } else if (summary.overallScore >= 70) {
    output += '🟡 良好\n';
  } else {
    output += '🔴 需要改进\n';
  }

  output += `  通过率: ${summary.passedTests}/${summary.totalTests} (${((summary.passedTests / summary.totalTests) * 100).toFixed(1)}%)\n`;
  output += '\n';
  output += '='.repeat(70) + '\n';

  return output;
}
