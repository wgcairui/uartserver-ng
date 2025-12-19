/**
 * BullMQ + Bun 兼容性验证脚本
 *
 * 运行方式:
 * ```bash
 * bun run test/verify-bullmq.ts
 * ```
 */

import { Queue, Worker } from 'bullmq';

async function verifyBullMQ() {
  console.log('🔍 验证 Bun + BullMQ 兼容性...\n');

  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  };

  try {
    // 1. 创建队列
    console.log('1️⃣ 创建队列...');
    const queue = new Queue('test-queue', { connection });
    console.log('   ✅ 队列创建成功\n');

    // 2. 添加任务
    console.log('2️⃣ 添加测试任务...');
    const job = await queue.add('test-job', {
      message: 'Hello from Bun!',
      timestamp: new Date().toISOString(),
    });
    console.log(`   ✅ 任务已添加 (ID: ${job.id})\n`);

    // 3. 创建 Worker
    console.log('3️⃣ 创建 Worker 处理任务...');
    const worker = new Worker('test-queue', async (job) => {
      console.log(`   📦 处理任务: ${job.id}`);
      console.log(`   📄 数据: ${JSON.stringify(job.data)}`);

      // 模拟处理
      await new Promise(resolve => setTimeout(resolve, 100));

      return { success: true, processedAt: new Date().toISOString() };
    }, { connection });

    // 4. 等待任务完成
    await new Promise<void>((resolve) => {
      worker.on('completed', (job, result) => {
        console.log(`   ✅ 任务完成: ${job.id}`);
        console.log(`   ✅ 结果: ${JSON.stringify(result)}\n`);
        resolve();
      });

      worker.on('failed', (job, err) => {
        console.error(`   ❌ 任务失败: ${job?.id}`, err);
        resolve();
      });
    });

    // 5. 清理
    console.log('4️⃣ 清理资源...');
    await worker.close();
    await queue.close();
    console.log('   ✅ 资源已清理\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 验证成功！Bun 完全支持 BullMQ');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ 验证失败:', error);
    process.exit(1);
  }
}

verifyBullMQ();
