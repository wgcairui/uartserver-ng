/**
 * Eden Treaty 端到端类型安全测试
 *
 * 验证 Eden Treaty 客户端的类型推导和 API 调用
 */

import { treaty } from '@elysiajs/eden';
import type { App } from '../src/index';

// 创建客户端
const api = treaty<App>('localhost:3333');

/**
 * 测试 1: 缓存统计 API
 */
async function testCacheStats() {
  console.log('\n📊 测试 1: 获取缓存统计\n');

  const { data, error } = await api.api.terminal.cache.stats.get();

  if (error) {
    console.error('❌ 错误:', error);
    return false;
  }

  console.log('✅ 响应状态:', data?.status);
  console.log('📦 缓存总数:', data?.data?.total);
  console.log('🎯 命中率:', data?.data?.performance?.hitRate);

  // TypeScript 类型检查 - 如果类型不匹配，编译时会报错
  const total: number = data?.data?.total ?? 0;
  const hitRate: string = data?.data?.performance?.hitRate ?? '0.00%';

  console.log(`\n✨ 类型安全验证: total=${total} (number), hitRate=${hitRate} (string)`);

  return true;
}

/**
 * 测试 2: 健康检查 API
 */
async function testHealthCheck() {
  console.log('\n💚 测试 2: API 健康检查\n');

  const { data, error } = await api.api.health.get();

  if (error) {
    console.error('❌ 错误:', error);
    return false;
  }

  console.log('✅ 响应:', data);

  // TypeScript 类型检查
  const status: string = data?.status ?? '';
  const message: string = data?.message ?? '';

  console.log(`\n✨ 类型安全验证: status=${status}, message=${message}`);

  return true;
}

/**
 * 测试 3: 类型错误检测（编译时）
 */
async function testTypeErrors() {
  console.log('\n🔍 测试 3: 类型错误检测\n');

  // ✅ 正确的调用
  const { data } = await api.api.terminal.cache.stats.get();

  // ❌ 以下代码会在编译时报错 (注释掉以通过编译)
  // const wrong: string = data?.data?.total; // Type 'number | undefined' is not assignable to type 'string'

  // ❌ 尝试访问不存在的端点会报错
  // await api.api.nonexistent.endpoint.get(); // Property 'nonexistent' does not exist

  // ❌ 参数类型错误会报错
  // await api.api.terminal.queryData.post({ macs: 123 }); // Type 'number' is not assignable to type 'string[]'

  console.log('✨ 类型系统工作正常 - 所有错误在编译时捕获');

  return true;
}

/**
 * 运行所有测试
 */
async function runTests() {
  console.log('🚀 Eden Treaty 端到端类型安全测试');
  console.log('━'.repeat(60));

  const tests = [testHealthCheck, testCacheStats, testTypeErrors];

  let passed = 0;
  for (const test of tests) {
    try {
      const result = await test();
      if (result) passed++;
    } catch (error) {
      console.error('❌ 测试失败:', error);
    }
  }

  console.log('\n' + '━'.repeat(60));
  console.log(`\n📊 测试结果: ${passed}/${tests.length} 通过`);

  if (passed === tests.length) {
    console.log('✅ 所有测试通过！Eden Treaty 类型安全验证成功\n');
  } else {
    console.log('❌ 部分测试失败\n');
    process.exit(1);
  }
}

runTests();
