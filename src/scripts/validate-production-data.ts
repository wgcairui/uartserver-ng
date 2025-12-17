/**
 * 生产数据验证脚本
 * 验证 Phase 1 服务能否正确读取和处理生产数据
 */

import { mongodb } from '../database/mongodb';
import { terminalService } from '../services/terminal.service';
import { nodeService } from '../services/node.service';
import type { Terminal, NodeClient } from '../types/entities';

interface ValidationResult {
  collection: string;
  total: number;
  valid: number;
  errors: Array<{ doc: any; error: string }>;
}

/**
 * 验证 Terminal 集合数据
 */
async function validateTerminals(): Promise<ValidationResult> {
  console.log('\n📋 验证 terminals 集合...');

  const result: ValidationResult = {
    collection: 'terminals',
    total: 0,
    valid: 0,
    errors: [],
  };

  try {
    // 获取所有终端
    const terminals = await mongodb
      .getCollection<Terminal>('terminals')
      .find({})
      .limit(100) // 只验证前 100 个
      .toArray();

    result.total = terminals.length;
    console.log(`  总数: ${result.total}`);

    for (const terminal of terminals) {
      try {
        // 验证必需字段
        if (!terminal.DevMac) {
          throw new Error('缺少 DevMac 字段');
        }

        // 验证 mountDevs 结构
        if (terminal.mountDevs) {
          for (const dev of terminal.mountDevs) {
            if (typeof dev.pid !== 'number') {
              throw new Error(`mountDev pid 类型错误: ${typeof dev.pid}`);
            }
            if (typeof dev.protocol !== 'string') {
              throw new Error(`mountDev protocol 类型错误`);
            }
          }
        }

        // 尝试使用 service 读取
        const serviceResult = await terminalService.getTerminal(terminal.DevMac);
        if (!serviceResult) {
          throw new Error('Service 无法读取该终端');
        }

        result.valid++;
      } catch (error) {
        result.errors.push({
          doc: { DevMac: terminal.DevMac, name: terminal.name },
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log(`  ✅ 有效: ${result.valid}/${result.total}`);
    if (result.errors.length > 0) {
      console.log(`  ❌ 错误: ${result.errors.length}`);
      result.errors.slice(0, 5).forEach(err => {
        console.log(`     - ${err.doc.DevMac}: ${err.error}`);
      });
    }
  } catch (error) {
    console.error('  ❌ 验证失败:', error);
  }

  return result;
}

/**
 * 验证 Node 集合数据
 */
async function validateNodes(): Promise<ValidationResult> {
  console.log('\n📋 验证 node.clients 集合...');

  const result: ValidationResult = {
    collection: 'node.clients',
    total: 0,
    valid: 0,
    errors: [],
  };

  try {
    const nodes = await mongodb
      .getCollection<NodeClient>('node.clients')
      .find({})
      .toArray();

    result.total = nodes.length;
    console.log(`  总数: ${result.total}`);

    for (const node of nodes) {
      try {
        // 验证必需字段
        if (!node.Name) {
          throw new Error('缺少 Name 字段');
        }
        if (!node.IP) {
          throw new Error('缺少 IP 字段');
        }
        if (typeof node.Port !== 'number') {
          throw new Error('Port 类型错误');
        }

        // 尝试使用 service 读取
        const serviceResult = await nodeService.getNodeByName(node.Name);
        if (!serviceResult) {
          throw new Error('Service 无法读取该节点');
        }

        result.valid++;
      } catch (error) {
        result.errors.push({
          doc: { Name: node.Name, IP: node.IP },
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log(`  ✅ 有效: ${result.valid}/${result.total}`);
    if (result.errors.length > 0) {
      console.log(`  ❌ 错误: ${result.errors.length}`);
      result.errors.forEach(err => {
        console.log(`     - ${err.doc.Name}: ${err.error}`);
      });
    }
  } catch (error) {
    console.error('  ❌ 验证失败:', error);
  }

  return result;
}

/**
 * 统计数据分析
 */
async function analyzeData() {
  console.log('\n📊 数据统计分析...');

  // 终端统计
  const terminalStats = await mongodb.getCollection('terminals').aggregate([
    {
      $facet: {
        total: [{ $count: 'count' }],
        online: [{ $match: { online: true } }, { $count: 'count' }],
        offline: [{ $match: { online: false } }, { $count: 'count' }],
        withMountDevs: [
          { $match: { mountDevs: { $exists: true, $ne: [] } } },
          { $count: 'count' },
        ],
        protocols: [
          { $unwind: '$mountDevs' },
          { $group: { _id: '$mountDevs.protocol', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ],
      },
    },
  ]).toArray();

  const stats = terminalStats[0];

  if (stats) {
    console.log('\n  终端设备:');
    console.log(`    总数: ${stats.total[0]?.count || 0}`);
    console.log(`    在线: ${stats.online[0]?.count || 0}`);
    console.log(`    离线: ${stats.offline[0]?.count || 0}`);
    console.log(`    有挂载设备: ${stats.withMountDevs[0]?.count || 0}`);

    console.log('\n  协议分布:');
    stats.protocols.slice(0, 10).forEach((p: any) => {
      console.log(`    ${p._id}: ${p.count}`);
    });
  }

  // 用户统计
  const userCount = await mongodb.getCollection('users').countDocuments();
  console.log(`\n  用户总数: ${userCount}`);

  // 设备协议统计
  const protocolCount = await mongodb.getCollection('device.protocols').countDocuments();
  console.log(`  设备协议: ${protocolCount}`);
}

/**
 * 检查字段兼容性
 */
async function checkFieldCompatibility() {
  console.log('\n🔍 检查字段兼容性...');

  // 随机抽取一个终端检查字段
  const sampleTerminal = await mongodb
    .getCollection('terminals')
    .findOne({ mountDevs: { $exists: true, $ne: [] } });

  if (sampleTerminal) {
    console.log('\n  示例终端字段:');
    console.log(`    DevMac: ${sampleTerminal.DevMac}`);
    console.log(`    name: ${sampleTerminal.name || 'N/A'}`);
    console.log(`    online: ${sampleTerminal.online}`);
    console.log(`    mountNode: ${sampleTerminal.mountNode || 'N/A'}`);
    console.log(`    ip: ${sampleTerminal.ip || 'N/A'}`);
    console.log(`    port: ${sampleTerminal.port || 'N/A'}`);
    console.log(`    AT: ${sampleTerminal.AT !== undefined ? sampleTerminal.AT : 'N/A'}`);
    console.log(`    ICCID: ${sampleTerminal.ICCID || 'N/A'}`);
    console.log(`    uptime: ${sampleTerminal.uptime || sampleTerminal.UT || 'N/A'}`);

    if (sampleTerminal.mountDevs && sampleTerminal.mountDevs.length > 0) {
      const dev = sampleTerminal.mountDevs[0];
      console.log('\n  示例挂载设备字段:');
      console.log(`    Type: ${dev.Type}`);
      console.log(`    mountDev: ${dev.mountDev || 'N/A'}`);
      console.log(`    protocol: ${dev.protocol}`);
      console.log(`    pid: ${dev.pid}`);
      console.log(`    online: ${dev.online !== undefined ? dev.online : 'N/A'}`);
      console.log(`    minQueryLimit: ${dev.minQueryLimit || 'N/A'}`);
      console.log(`    lastEmit: ${dev.lastEmit || 'N/A'}`);
      console.log(`    lastRecord: ${dev.lastRecord || 'N/A'}`);
    }

    if (sampleTerminal.iccidInfo) {
      console.log('\n  iccidInfo 字段:');
      console.log(`    statu: ${sampleTerminal.iccidInfo.statu}`);
      console.log(`    expireDate: ${sampleTerminal.iccidInfo.expireDate || 'N/A'}`);
      console.log(`    flowUsed: ${sampleTerminal.iccidInfo.flowUsed || 'N/A'}`);
    }
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始验证生产数据...\n');
  console.log('=' .repeat(60));

  try {
    // 连接数据库
    await mongodb.connect();
    console.log('✅ MongoDB 连接成功\n');

    // 数据统计分析
    await analyzeData();

    // 字段兼容性检查
    await checkFieldCompatibility();

    // 验证数据
    const terminalResult = await validateTerminals();
    const nodeResult = await validateNodes();

    // 总结
    console.log('\n' + '='.repeat(60));
    console.log('📊 验证总结:\n');

    const totalDocs = terminalResult.total + nodeResult.total;
    const totalValid = terminalResult.valid + nodeResult.valid;
    const totalErrors = terminalResult.errors.length + nodeResult.errors.length;

    console.log(`  总文档数: ${totalDocs}`);
    console.log(`  有效文档: ${totalValid} (${((totalValid / totalDocs) * 100).toFixed(1)}%)`);
    console.log(`  错误数量: ${totalErrors}`);

    if (totalErrors === 0) {
      console.log('\n  ✅ 所有数据验证通过！Phase 1 完全兼容生产数据。');
    } else {
      console.log('\n  ⚠️  发现部分兼容性问题，需要修复。');
    }

    console.log('\n' + '='.repeat(60));

  } catch (error) {
    console.error('❌ 验证过程出错:', error);
    process.exit(1);
  } finally {
    await mongodb.disconnect();
    console.log('\n✅ 数据库连接已关闭');
  }
}

// 运行验证
main().catch(console.error);
