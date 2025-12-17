/**
 * Phase 1 生产数据兼容性测试
 * 测试所有核心服务功能
 */

import { mongodb } from '../database/mongodb';
import { terminalService } from '../services/terminal.service';
import { nodeService } from '../services/node.service';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
}

const results: TestResult[] = [];

/**
 * 记录测试结果
 */
function logTest(name: string, fn: () => Promise<void>): Promise<void> {
  return new Promise(async (resolve) => {
    const start = Date.now();
    try {
      await fn();
      const duration = Date.now() - start;
      results.push({ name, passed: true, message: '通过', duration });
      console.log(`  ✅ ${name} (${duration}ms)`);
      resolve();
    } catch (error) {
      const duration = Date.now() - start;
      const message = error instanceof Error ? error.message : String(error);
      results.push({ name, passed: false, message, duration });
      console.log(`  ❌ ${name}: ${message} (${duration}ms)`);
      resolve();
    }
  });
}

/**
 * 测试 Terminal 服务
 */
async function testTerminalService() {
  console.log('\n📦 测试 TerminalService...\n');

  // 1. getTerminal - 通过 MAC 获取终端
  await logTest('getTerminal - 获取单个终端', async () => {
    const terminals = await mongodb.getCollection('terminals')
      .find({ online: true })
      .limit(1)
      .toArray();

    if (terminals.length === 0) throw new Error('没有在线终端');

    const result = await terminalService.getTerminal(terminals[0].DevMac);
    if (!result) throw new Error('未返回终端数据');
    if (result.DevMac !== terminals[0].DevMac) throw new Error('MAC 地址不匹配');
  });

  // 2. getTerminals - 批量获取
  await logTest('getTerminals - 批量获取终端', async () => {
    const terminals = await mongodb.getCollection('terminals')
      .find({})
      .limit(5)
      .toArray();

    const macs = terminals.map(t => t.DevMac);
    const results = await terminalService.getTerminals(macs);

    if (results.length !== macs.length) {
      throw new Error(`返回数量不匹配: ${results.length} vs ${macs.length}`);
    }
  });

  // 3. getOnlineTerminals - 获取所有在线终端
  await logTest('getOnlineTerminals - 获取在线终端', async () => {
    const results = await terminalService.getOnlineTerminals();

    const expectedCount = await mongodb.getCollection('terminals')
      .countDocuments({ online: true });

    if (results.length !== expectedCount) {
      throw new Error(`在线终端数量不匹配: ${results.length} vs ${expectedCount}`);
    }
  });

  // 4. getMountDevice - 获取挂载设备
  await logTest('getMountDevice - 获取挂载设备', async () => {
    const terminal = await mongodb.getCollection('terminals')
      .findOne({
        mountDevs: { $exists: true, $ne: [] }
      });

    if (!terminal || !terminal.mountDevs || terminal.mountDevs.length === 0) {
      throw new Error('没有挂载设备的终端');
    }

    const dev = terminal.mountDevs[0];
    const result = await terminalService.getMountDevice(terminal.DevMac, dev.pid);

    if (!result) throw new Error('未返回挂载设备');
    if (result.pid !== dev.pid) throw new Error('PID 不匹配');
  });

  // 5. updateOnlineStatus - 更新在线状态
  await logTest('updateOnlineStatus - 更新在线状态', async () => {
    const terminal = await mongodb.getCollection('terminals')
      .findOne({});

    if (!terminal) throw new Error('没有终端数据');

    const originalStatus = terminal.online;
    const newStatus = !originalStatus;

    // 更新状态
    const updated = await terminalService.updateOnlineStatus(terminal.DevMac, newStatus);
    if (!updated) throw new Error('更新失败');

    // 验证更新
    const result = await terminalService.getTerminal(terminal.DevMac);
    if (result?.online !== newStatus) throw new Error('状态未更新');

    // 恢复原状态
    await terminalService.updateOnlineStatus(terminal.DevMac, originalStatus);
  });

  // 6. updateMountDeviceOnlineStatus - 更新挂载设备状态
  await logTest('updateMountDeviceOnlineStatus - 更新挂载设备状态', async () => {
    const terminal = await mongodb.getCollection('terminals')
      .findOne({
        mountDevs: { $exists: true, $ne: [] }
      });

    if (!terminal || !terminal.mountDevs || terminal.mountDevs.length === 0) {
      throw new Error('没有挂载设备的终端');
    }

    const dev = terminal.mountDevs[0];
    const originalStatus = dev.online;
    const newStatus = !originalStatus;

    // 更新状态
    const updated = await terminalService.updateMountDeviceOnlineStatus(
      terminal.DevMac,
      dev.pid,
      newStatus
    );
    if (!updated) throw new Error('更新失败');

    // 验证更新
    const result = await terminalService.getMountDevice(terminal.DevMac, dev.pid);
    if (result?.online !== newStatus) throw new Error('状态未更新');

    // 恢复原状态
    if (originalStatus !== undefined) {
      await terminalService.updateMountDeviceOnlineStatus(
        terminal.DevMac,
        dev.pid,
        originalStatus
      );
    }
  });

  // 7. findTerminals - 条件查询
  await logTest('findTerminals - 条件查询', async () => {
    const results = await terminalService.findTerminals({ online: true });

    if (results.length === 0) throw new Error('未返回结果');

    // 验证所有返回的终端都是在线的
    const allOnline = results.every(t => t.online === true);
    if (!allOnline) throw new Error('返回了离线终端');
  });
}

/**
 * 测试 Node 服务
 */
async function testNodeService() {
  console.log('\n📦 测试 NodeService...\n');

  // 1. getAllNodes - 获取所有节点
  await logTest('getAllNodes - 获取所有节点', async () => {
    const results = await nodeService.getAllNodes();

    const expectedCount = await mongodb.getCollection('node.clients')
      .countDocuments({});

    if (results.length !== expectedCount) {
      throw new Error(`节点数量不匹配: ${results.length} vs ${expectedCount}`);
    }
  });

  // 2. getNodeByName - 通过名称获取节点
  await logTest('getNodeByName - 通过名称获取节点', async () => {
    const nodes = await mongodb.getCollection('node.clients')
      .find({})
      .limit(1)
      .toArray();

    if (nodes.length === 0) throw new Error('没有节点数据');

    const result = await nodeService.getNodeByName(nodes[0].Name);
    if (!result) throw new Error('未返回节点数据');
    if (result.Name !== nodes[0].Name) throw new Error('节点名称不匹配');
  });

  // 3. getNodeByIP - 通过 IP 获取节点
  await logTest('getNodeByIP - 通过 IP 获取节点', async () => {
    const nodes = await mongodb.getCollection('node.clients')
      .find({})
      .limit(1)
      .toArray();

    if (nodes.length === 0) throw new Error('没有节点数据');

    const result = await nodeService.getNodeByIP(nodes[0].IP);
    if (!result) throw new Error('未返回节点数据');
    if (result.IP !== nodes[0].IP) throw new Error('IP 地址不匹配');
  });
}

/**
 * 测试数据完整性
 */
async function testDataIntegrity() {
  console.log('\n📦 测试数据完整性...\n');

  // 1. Terminal 必需字段检查
  await logTest('Terminal - 必需字段完整性', async () => {
    const terminals = await mongodb.getCollection('terminals')
      .find({})
      .limit(50)
      .toArray();

    for (const terminal of terminals) {
      if (!terminal.DevMac) throw new Error('缺少 DevMac');
      if (terminal.online === undefined) throw new Error('缺少 online 字段');
    }
  });

  // 2. MountDevice 结构检查
  await logTest('MountDevice - 结构完整性', async () => {
    const terminals = await mongodb.getCollection('terminals')
      .find({ mountDevs: { $exists: true, $ne: [] } })
      .limit(50)
      .toArray();

    for (const terminal of terminals) {
      if (!terminal.mountDevs) continue;

      for (const dev of terminal.mountDevs) {
        if (typeof dev.pid !== 'number') throw new Error('pid 类型错误');
        if (typeof dev.protocol !== 'string') throw new Error('protocol 类型错误');
        if (typeof dev.Type !== 'string') throw new Error('Type 类型错误');
      }
    }
  });

  // 3. Node 必需字段检查
  await logTest('Node - 必需字段完整性', async () => {
    const nodes = await mongodb.getCollection('node.clients')
      .find({})
      .toArray();

    for (const node of nodes) {
      if (!node.Name) throw new Error('缺少 Name');
      if (!node.IP) throw new Error('缺少 IP');
      if (typeof node.Port !== 'number') throw new Error('Port 类型错误');
    }
  });
}

/**
 * 性能测试
 */
async function testPerformance() {
  console.log('\n📦 性能测试...\n');

  // 1. 批量查询性能
  await logTest('批量查询 100 个终端', async () => {
    const terminals = await mongodb.getCollection('terminals')
      .find({})
      .limit(100)
      .toArray();

    const macs = terminals.map(t => t.DevMac);
    const start = Date.now();
    await terminalService.getTerminals(macs);
    const duration = Date.now() - start;

    if (duration > 1000) {
      throw new Error(`查询耗时过长: ${duration}ms`);
    }
  });

  // 2. 在线终端查询性能
  await logTest('查询所有在线终端', async () => {
    const start = Date.now();
    await terminalService.getOnlineTerminals();
    const duration = Date.now() - start;

    if (duration > 2000) {
      throw new Error(`查询耗时过长: ${duration}ms`);
    }
  });
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 Phase 1 生产数据兼容性测试\n');
  console.log('=' .repeat(60));

  try {
    // 连接数据库
    await mongodb.connect();
    console.log('✅ MongoDB 连接成功');

    // 运行测试
    await testTerminalService();
    await testNodeService();
    await testDataIntegrity();
    await testPerformance();

    // 总结
    console.log('\n' + '='.repeat(60));
    console.log('📊 测试总结:\n');

    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / total;

    console.log(`  总测试数: ${total}`);
    console.log(`  通过: ${passed} (${((passed / total) * 100).toFixed(1)}%)`);
    console.log(`  失败: ${failed}`);
    console.log(`  平均耗时: ${avgDuration.toFixed(2)}ms`);

    if (failed > 0) {
      console.log('\n  失败的测试:');
      results.filter(r => !r.passed).forEach(r => {
        console.log(`    ❌ ${r.name}: ${r.message}`);
      });
    }

    console.log('\n' + '='.repeat(60));

    if (failed === 0) {
      console.log('\n✅ 所有测试通过！Phase 1 完全兼容生产数据。\n');
      process.exit(0);
    } else {
      console.log('\n⚠️  部分测试失败，需要修复。\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ 测试过程出错:', error);
    process.exit(1);
  } finally {
    await mongodb.disconnect();
    console.log('✅ 数据库连接已关闭\n');
  }
}

// 运行测试
main().catch(console.error);
