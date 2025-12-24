/**
 * Eden Treaty API Client
 *
 * 提供端到端类型安全的 API 调用
 * - 无需手动定义类型
 * - 自动类型推导
 * - 编译时类型检查
 */

import { treaty } from '@elysiajs/eden';
import type { App } from '../../src/index';

/**
 * 创建 API 客户端实例
 *
 * 使用方式：
 * ```typescript
 * const { data, error } = await api.api.terminal.cache.stats.get();
 * ```
 */
export const api = treaty<App>('localhost:3333');

/**
 * 类型安全的 API 调用示例
 */
export class TerminalAPI {
  /**
   * 获取缓存统计
   */
  static async getCacheStats() {
    const { data, error } = await api.api.terminal.cache.stats.get();

    if (error) {
      console.error('获取缓存统计失败:', error);
      return null;
    }

    return data;
  }

  /**
   * 查询终端数据
   */
  static async queryData(mac: string, startTime: number, endTime: number) {
    const { data, error } = await api.api.terminal.queryData.post({
      macs: [mac],
      startTime,
      endTime,
    });

    if (error) {
      console.error('查询终端数据失败:', error);
      return null;
    }

    return data;
  }

  /**
   * 查询处理状态
   */
  static async getStatus(requestId: string) {
    const { data, error } = await api.api.terminal.status.post({
      requestId,
    });

    if (error) {
      console.error('查询状态失败:', error);
      return null;
    }

    return data;
  }

  /**
   * 清除指定终端缓存
   */
  static async clearCache(mac: string) {
    const { data, error } = await api.api.terminal.cache[mac].delete();

    if (error) {
      console.error('清除缓存失败:', error);
      return null;
    }

    return data;
  }

  /**
   * 清除所有缓存
   */
  static async clearAllCache() {
    const { data, error } = await api.api.terminal.cache.delete();

    if (error) {
      console.error('清除所有缓存失败:', error);
      return null;
    }

    return data;
  }
}
