/**
 * Eden Treaty Demo Application
 *
 * 展示端到端类型安全的 API 调用
 */

import { TerminalAPI } from './api';

/**
 * 初始化 Demo 应用
 */
async function initDemo() {
  console.log('🚀 Eden Treaty Demo - 端到端类型安全 API 调用');

  // 获取 DOM 元素
  const statusEl = document.getElementById('status')!;
  const resultEl = document.getElementById('result')!;
  const btnStats = document.getElementById('btn-stats')!;
  const btnQuery = document.getElementById('btn-query')!;
  const btnClear = document.getElementById('btn-clear')!;

  /**
   * 显示状态
   */
  function showStatus(message: string, isError = false) {
    statusEl.textContent = message;
    statusEl.className = isError ? 'status error' : 'status success';
  }

  /**
   * 显示结果
   */
  function showResult(data: any) {
    resultEl.textContent = JSON.stringify(data, null, 2);
  }

  /**
   * 获取缓存统计
   */
  btnStats.addEventListener('click', async () => {
    showStatus('正在获取缓存统计...');

    const stats = await TerminalAPI.getCacheStats();

    if (stats) {
      showStatus('✅ 缓存统计获取成功');
      showResult(stats);
    } else {
      showStatus('❌ 获取缓存统计失败', true);
    }
  });

  /**
   * 查询终端数据 (Fire-and-Forget 模式)
   */
  btnQuery.addEventListener('click', async () => {
    showStatus('正在发起数据查询...');

    const mac = '00:11:22:33:44:55'; // 示例 MAC 地址
    const endTime = Date.now();
    const startTime = endTime - 3600 * 1000; // 过去1小时

    const response = await TerminalAPI.queryData(mac, startTime, endTime);

    if (response) {
      showStatus('✅ 查询请求已提交 (Fire-and-Forget)');
      showResult(response);

      // 如果返回了 requestId，可以轮询状态
      if (response.status === 'processing' && response.data?.requestId) {
        setTimeout(() => pollStatus(response.data.requestId), 1000);
      }
    } else {
      showStatus('❌ 查询请求失败', true);
    }
  });

  /**
   * 清除所有缓存
   */
  btnClear.addEventListener('click', async () => {
    if (!confirm('确定要清除所有缓存吗？')) {
      return;
    }

    showStatus('正在清除缓存...');

    const result = await TerminalAPI.clearAllCache();

    if (result) {
      showStatus('✅ 缓存已清除');
      showResult(result);
    } else {
      showStatus('❌ 清除缓存失败', true);
    }
  });

  /**
   * 轮询查询状态
   */
  async function pollStatus(requestId: string) {
    showStatus(`正在查询处理状态 (${requestId})...`);

    const status = await TerminalAPI.getStatus(requestId);

    if (status) {
      showStatus(`✅ 状态: ${status.status}`);
      showResult(status);

      // 如果还在处理中，继续轮询
      if (status.status === 'processing') {
        setTimeout(() => pollStatus(requestId), 2000);
      }
    } else {
      showStatus('❌ 查询状态失败', true);
    }
  }

  // 初始化完成
  showStatus('✨ Demo 已就绪，点击按钮测试 API');
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDemo);
} else {
  initDemo();
}
