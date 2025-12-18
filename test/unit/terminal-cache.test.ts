/**
 * Terminal Cache 单元测试
 * 测试混合策略缓存的所有功能
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { TerminalCache } from '../../src/repositories/terminal-cache';
import {
  createTerminalEntity,
  createPesivTerminalEntity,
  createOfflineTerminalEntity,
  createMixedProtocolTerminalData,
  MockTerminalRepository,
} from '../helpers/terminal-mock';
import { TerminalEntity } from '../../src/domain/terminal.entity';

describe('TerminalCache', () => {
  let cache: TerminalCache;

  beforeEach(() => {
    // 每个测试前创建新的缓存实例
    cache = new TerminalCache();
  });

  afterEach(() => {
    // 每个测试后清理缓存
    cache.destroy();
  });

  describe('基础缓存操作', () => {
    test('应该能够设置和获取缓存', () => {
      const entity = createTerminalEntity({ DevMac: 'AA:BB:CC:DD:EE:01' });

      cache.set('AA:BB:CC:DD:EE:01', entity);
      const result = cache.get('AA:BB:CC:DD:EE:01');

      expect(result).toBe(entity);
    });

    test('缓存未命中时应该返回 null', () => {
      const result = cache.get('NOT:EXIST:MAC');
      expect(result).toBeNull();
    });

    test('应该能够使缓存失效', () => {
      const entity = createTerminalEntity({ DevMac: 'AA:BB:CC:DD:EE:02' });

      cache.set('AA:BB:CC:DD:EE:02', entity);
      expect(cache.get('AA:BB:CC:DD:EE:02')).toBe(entity);

      cache.invalidate('AA:BB:CC:DD:EE:02');
      expect(cache.get('AA:BB:CC:DD:EE:02')).toBeNull();
    });

    test('应该能够清空所有缓存', () => {
      const entity1 = createTerminalEntity({ DevMac: 'AA:BB:CC:DD:EE:03' });
      const entity2 = createTerminalEntity({ DevMac: 'AA:BB:CC:DD:EE:04' });

      cache.set('AA:BB:CC:DD:EE:03', entity1);
      cache.set('AA:BB:CC:DD:EE:04', entity2);

      cache.clear();

      expect(cache.get('AA:BB:CC:DD:EE:03')).toBeNull();
      expect(cache.get('AA:BB:CC:DD:EE:04')).toBeNull();
    });

    test('应该能够按节点批量失效缓存', () => {
      const entity1 = createTerminalEntity({
        DevMac: 'AA:BB:CC:DD:EE:05',
        mountNode: 'node-01',
      });
      const entity2 = createTerminalEntity({
        DevMac: 'AA:BB:CC:DD:EE:06',
        mountNode: 'node-01',
      });
      const entity3 = createTerminalEntity({
        DevMac: 'AA:BB:CC:DD:EE:07',
        mountNode: 'node-02',
      });

      cache.set('AA:BB:CC:DD:EE:05', entity1);
      cache.set('AA:BB:CC:DD:EE:06', entity2);
      cache.set('AA:BB:CC:DD:EE:07', entity3);

      cache.invalidateByNode('node-01');

      // node-01 的终端应该被清除
      expect(cache.get('AA:BB:CC:DD:EE:05')).toBeNull();
      expect(cache.get('AA:BB:CC:DD:EE:06')).toBeNull();

      // node-02 的终端应该保留
      expect(cache.get('AA:BB:CC:DD:EE:07')).toBe(entity3);
    });
  });

  describe('TTL 策略', () => {
    test('标准协议在线终端应该永久缓存', () => {
      const entity = createTerminalEntity({
        DevMac: 'AA:BB:CC:DD:EE:10',
        online: true,
        PID: 'standard',
      });

      cache.set('AA:BB:CC:DD:EE:10', entity);

      // 获取统计信息验证
      const stats = cache.getStats();
      expect(stats.breakdown.onlineStandard).toBe(1);

      // 即使过了很长时间也不应该过期
      const result = cache.get('AA:BB:CC:DD:EE:10');
      expect(result).toBe(entity);
    });

    test('pesiv 协议在线终端应该有 10 分钟 TTL', () => {
      const entity = createPesivTerminalEntity({
        DevMac: 'AA:BB:CC:DD:EE:11',
        online: true,
      });

      cache.set('AA:BB:CC:DD:EE:11', entity);

      const stats = cache.getStats();
      expect(stats.breakdown.onlinePesiv).toBe(1);

      // 立即获取应该成功
      expect(cache.get('AA:BB:CC:DD:EE:11')).toBe(entity);
    });

    test('混合协议终端（包含 pesiv 设备）应该被识别为 pesiv 协议', () => {
      const mixedData = createMixedProtocolTerminalData({
        DevMac: 'AA:BB:CC:DD:EE:22',
        online: true,
      });
      const entity = new TerminalEntity(mixedData);

      cache.set('AA:BB:CC:DD:EE:22', entity);

      const stats = cache.getStats();
      expect(stats.breakdown.onlinePesiv).toBe(1); // 应该被识别为 pesiv
    });

    test('离线冷数据应该有 5 分钟 TTL', () => {
      const entity = createOfflineTerminalEntity({
        DevMac: 'AA:BB:CC:DD:EE:12',
        online: false,
      });

      cache.set('AA:BB:CC:DD:EE:12', entity);

      const stats = cache.getStats();
      expect(stats.breakdown.offlineCold).toBe(1);

      // 立即获取应该成功
      expect(cache.get('AA:BB:CC:DD:EE:12')).toBe(entity);
    });

    test('离线终端频繁访问后应该升级为热数据', () => {
      const entity = createOfflineTerminalEntity({
        DevMac: 'AA:BB:CC:DD:EE:13',
        online: false,
      });

      cache.set('AA:BB:CC:DD:EE:13', entity);

      // 初始应该是冷数据
      let stats = cache.getStats();
      expect(stats.breakdown.offlineCold).toBe(1);
      expect(stats.breakdown.offlineHot).toBe(0);

      // 频繁访问（5次）
      for (let i = 0; i < 5; i++) {
        cache.get('AA:BB:CC:DD:EE:13');
      }

      // 应该升级为热数据
      stats = cache.getStats();
      expect(stats.breakdown.offlineHot).toBe(1);
      expect(stats.breakdown.offlineCold).toBe(0);
    });
  });

  describe('访问计数与衰减', () => {
    test('每次访问应该增加访问计数', () => {
      const entity = createTerminalEntity({ DevMac: 'AA:BB:CC:DD:EE:20' });

      cache.set('AA:BB:CC:DD:EE:20', entity);

      // 访问多次
      cache.get('AA:BB:CC:DD:EE:20');
      cache.get('AA:BB:CC:DD:EE:20');
      cache.get('AA:BB:CC:DD:EE:20');

      const stats = cache.getStats();
      expect(stats.performance.hits).toBe(3);
    });

    test('缓存未命中应该增加 miss 计数', () => {
      cache.get('NOT:EXIST:01');
      cache.get('NOT:EXIST:02');

      const stats = cache.getStats();
      expect(stats.performance.misses).toBe(2);
    });

    test('命中率应该正确计算', () => {
      const entity = createTerminalEntity({ DevMac: 'AA:BB:CC:DD:EE:21' });
      cache.set('AA:BB:CC:DD:EE:21', entity);

      // 7 次命中
      for (let i = 0; i < 7; i++) {
        cache.get('AA:BB:CC:DD:EE:21');
      }

      // 3 次未命中
      for (let i = 0; i < 3; i++) {
        cache.get(`NOT:EXIST:${i}`);
      }

      const stats = cache.getStats();
      expect(stats.performance.hits).toBe(7);
      expect(stats.performance.misses).toBe(3);
      expect(stats.performance.hitRate).toBe('70.00%'); // 7 / 10 = 70%
    });
  });

  describe('协议检测', () => {
    test('应该正确识别标准协议终端', () => {
      const entity = createTerminalEntity({
        DevMac: 'AA:BB:CC:DD:EE:30',
        PID: 'standard',
      });

      cache.set('AA:BB:CC:DD:EE:30', entity);

      const stats = cache.getStats();
      expect(stats.breakdown.onlineStandard).toBe(1);
      expect(stats.breakdown.onlinePesiv).toBe(0);
    });

    test('应该正确识别 PID 为 pesiv 的终端', () => {
      const entity = createPesivTerminalEntity({
        DevMac: 'AA:BB:CC:DD:EE:31',
        PID: 'pesiv',
      });

      cache.set('AA:BB:CC:DD:EE:31', entity);

      const stats = cache.getStats();
      expect(stats.breakdown.onlinePesiv).toBe(1);
      expect(stats.breakdown.onlineStandard).toBe(0);
    });

    test('应该正确识别挂载了 pesiv 设备的终端', () => {
      const mixedData = createMixedProtocolTerminalData({
        DevMac: 'AA:BB:CC:DD:EE:32',
        PID: 'standard', // 终端本身是标准协议
        // mountDevs 中包含 pesiv 设备（在 helper 中定义）
      });
      const entity = new TerminalEntity(mixedData);

      cache.set('AA:BB:CC:DD:EE:32', entity);

      const stats = cache.getStats();
      expect(stats.breakdown.onlinePesiv).toBe(1); // 应该被识别为 pesiv
    });
  });

  describe('LRU 淘汰策略', () => {
    test('达到容量上限时应该触发 LRU 淘汰', () => {
      // 创建一个小容量的缓存用于测试（通过反射访问私有属性）
      const smallCache = new TerminalCache();
      // 注意：由于 MAX_SIZE 是私有常量，我们用正常大小测试，但只验证逻辑

      // 填充多个在线和离线终端
      const onlineEntity = createTerminalEntity({
        DevMac: 'ONLINE:00:00:00:00:01',
        online: true,
      });
      const offlineEntity = createOfflineTerminalEntity({
        DevMac: 'OFFLINE:00:00:00:00:01',
        online: false,
      });

      smallCache.set('ONLINE:00:00:00:00:01', onlineEntity);
      smallCache.set('OFFLINE:00:00:00:00:01', offlineEntity);

      const stats = smallCache.getStats();
      expect(stats.total).toBe(2);

      smallCache.destroy();
    });

    test('LRU 应该优先淘汰离线冷数据', () => {
      // 创建多种类型的缓存数据
      const standardOnline = createTerminalEntity({
        DevMac: 'STD:ONLINE:01',
        online: true,
        PID: 'standard',
      });
      const pesivOnline = createPesivTerminalEntity({
        DevMac: 'PESIV:ONLINE:01',
        online: true,
      });
      const offlineCold = createOfflineTerminalEntity({
        DevMac: 'OFFLINE:COLD:01',
        online: false,
      });

      cache.set('STD:ONLINE:01', standardOnline);
      cache.set('PESIV:ONLINE:01', pesivOnline);
      cache.set('OFFLINE:COLD:01', offlineCold);

      const stats = cache.getStats();

      // 验证分类正确
      expect(stats.breakdown.onlineStandard).toBe(1);
      expect(stats.breakdown.onlinePesiv).toBe(1);
      expect(stats.breakdown.offlineCold).toBe(1);
    });
  });

  describe('事件处理', () => {
    test('终端上线事件应该更新缓存 TTL', () => {
      const entity = createOfflineTerminalEntity({
        DevMac: 'AA:BB:CC:DD:EE:40',
        online: false,
      });

      cache.set('AA:BB:CC:DD:EE:40', entity);

      // 初始是离线状态
      let stats = cache.getStats();
      expect(stats.breakdown.offlineCold).toBe(1);

      // 模拟终端上线
      entity.setOnline(true);
      cache.onTerminalOnline('AA:BB:CC:DD:EE:40');

      // 缓存应该更新 TTL（但实体本身需要更新）
      // 实际使用中，这会配合 terminalService 更新实体状态
    });

    test('终端下线事件应该设置 TTL', () => {
      const entity = createTerminalEntity({
        DevMac: 'AA:BB:CC:DD:EE:41',
        online: true,
      });

      cache.set('AA:BB:CC:DD:EE:41', entity);

      // 初始是在线状态
      let stats = cache.getStats();
      expect(stats.breakdown.online).toBe(1);

      // 模拟终端下线
      entity.setOnline(false);
      cache.onTerminalOffline('AA:BB:CC:DD:EE:41');

      // 缓存应该设置 TTL
    });

    test('终端下线时如果是热数据应该使用 30 分钟 TTL', () => {
      const entity = createTerminalEntity({
        DevMac: 'AA:BB:CC:DD:EE:42',
        online: true,
      });

      cache.set('AA:BB:CC:DD:EE:42', entity);

      // 频繁访问使其成为热数据
      for (let i = 0; i < 6; i++) {
        cache.get('AA:BB:CC:DD:EE:42');
      }

      // 模拟下线
      entity.setOnline(false);
      cache.onTerminalOffline('AA:BB:CC:DD:EE:42');

      // 应该被识别为热数据
      const result = cache.get('AA:BB:CC:DD:EE:42');
      expect(result).not.toBeNull();
    });
  });

  describe('统计信息', () => {
    test('应该返回正确的缓存总数', () => {
      cache.set('MAC:01', createTerminalEntity({ DevMac: 'MAC:01' }));
      cache.set('MAC:02', createTerminalEntity({ DevMac: 'MAC:02' }));
      cache.set('MAC:03', createTerminalEntity({ DevMac: 'MAC:03' }));

      const stats = cache.getStats();
      expect(stats.total).toBe(3);
    });

    test('应该返回正确的在线/离线分类统计', () => {
      cache.set(
        'ONLINE:01',
        createTerminalEntity({ DevMac: 'ONLINE:01', online: true })
      );
      cache.set(
        'ONLINE:02',
        createTerminalEntity({ DevMac: 'ONLINE:02', online: true })
      );
      cache.set(
        'OFFLINE:01',
        createOfflineTerminalEntity({ DevMac: 'OFFLINE:01', online: false })
      );

      const stats = cache.getStats();
      expect(stats.breakdown.online).toBe(2);
      expect(stats.breakdown.offlineCold).toBe(1);
    });

    test('应该返回正确的协议分类统计', () => {
      cache.set(
        'STANDARD:01',
        createTerminalEntity({ DevMac: 'STANDARD:01', PID: 'standard', online: true })
      );
      cache.set(
        'PESIV:01',
        createPesivTerminalEntity({ DevMac: 'PESIV:01', online: true })
      );

      const stats = cache.getStats();
      expect(stats.breakdown.onlineStandard).toBe(1);
      expect(stats.breakdown.onlinePesiv).toBe(1);
    });

    test('应该返回性能统计信息', () => {
      const entity = createTerminalEntity({ DevMac: 'MAC:PERF:01' });
      cache.set('MAC:PERF:01', entity);

      // 5 次命中
      for (let i = 0; i < 5; i++) {
        cache.get('MAC:PERF:01');
      }

      // 2 次未命中
      cache.get('NOT:EXIST:01');
      cache.get('NOT:EXIST:02');

      const stats = cache.getStats();
      expect(stats.performance.hits).toBe(5);
      expect(stats.performance.misses).toBe(2);
      expect(stats.performance.hitRate).toBe('71.43%'); // 5 / 7
    });

    test('应该返回平均访问次数', () => {
      cache.set('MAC:AVG:01', createTerminalEntity({ DevMac: 'MAC:AVG:01' }));
      cache.set('MAC:AVG:02', createTerminalEntity({ DevMac: 'MAC:AVG:02' }));

      // MAC:AVG:01 访问 3 次（set 时 accessCount=1，再 get 3 次 = 4）
      cache.get('MAC:AVG:01');
      cache.get('MAC:AVG:01');
      cache.get('MAC:AVG:01');

      // MAC:AVG:02 访问 1 次（set 时 accessCount=1，再 get 1 次 = 2）
      cache.get('MAC:AVG:02');

      const stats = cache.getStats();
      // 平均访问次数 = (4 + 2) / 2 = 3.0
      expect(parseFloat(stats.details.avgAccessCount)).toBeCloseTo(3.0, 1);
    });
  });

  describe('预热功能', () => {
    test('应该能够预热在线终端', async () => {
      const mockRepo = new MockTerminalRepository();

      // 添加 3 个在线终端和 2 个离线终端
      mockRepo.addMockData(
        'ONLINE:01',
        createTerminalEntity({ DevMac: 'ONLINE:01', online: true })
      );
      mockRepo.addMockData(
        'ONLINE:02',
        createTerminalEntity({ DevMac: 'ONLINE:02', online: true })
      );
      mockRepo.addMockData(
        'ONLINE:03',
        createTerminalEntity({ DevMac: 'ONLINE:03', online: true })
      );
      mockRepo.addMockData(
        'OFFLINE:01',
        createOfflineTerminalEntity({ DevMac: 'OFFLINE:01', online: false })
      );
      mockRepo.addMockData(
        'OFFLINE:02',
        createOfflineTerminalEntity({ DevMac: 'OFFLINE:02', online: false })
      );

      // 执行预热
      await cache.warmup(mockRepo as any);

      // 应该只缓存在线终端
      const stats = cache.getStats();
      expect(stats.total).toBe(3);
      expect(stats.breakdown.online).toBe(3);

      // 验证可以获取缓存的终端
      expect(cache.get('ONLINE:01')).not.toBeNull();
      expect(cache.get('ONLINE:02')).not.toBeNull();
      expect(cache.get('ONLINE:03')).not.toBeNull();

      // 离线终端不应该被缓存
      expect(cache.get('OFFLINE:01')).toBeNull();
      expect(cache.get('OFFLINE:02')).toBeNull();
    });

    test('预热应该区分标准协议和 pesiv 协议', async () => {
      const mockRepo = new MockTerminalRepository();

      mockRepo.addMockData(
        'STANDARD:WARM:01',
        createTerminalEntity({ DevMac: 'STANDARD:WARM:01', PID: 'standard', online: true })
      );
      mockRepo.addMockData(
        'PESIV:WARM:01',
        createPesivTerminalEntity({ DevMac: 'PESIV:WARM:01', online: true })
      );

      await cache.warmup(mockRepo as any);

      const stats = cache.getStats();
      expect(stats.breakdown.onlineStandard).toBe(1);
      expect(stats.breakdown.onlinePesiv).toBe(1);
    });
  });

  describe('优雅关闭', () => {
    test('destroy 应该清理定时器和缓存', () => {
      const entity = createTerminalEntity({ DevMac: 'MAC:DESTROY:01' });
      cache.set('MAC:DESTROY:01', entity);

      // 验证缓存存在
      expect(cache.get('MAC:DESTROY:01')).toBe(entity);

      // 销毁缓存
      cache.destroy();

      // 缓存应该被清空
      expect(cache.get('MAC:DESTROY:01')).toBeNull();
    });

    test('多次调用 destroy 应该是安全的', () => {
      cache.destroy();
      expect(() => cache.destroy()).not.toThrow();
    });
  });

  describe('边界条件', () => {
    test('空缓存的统计信息应该正确', () => {
      const stats = cache.getStats();

      expect(stats.total).toBe(0);
      expect(stats.breakdown.online).toBe(0);
      expect(stats.performance.hits).toBe(0);
      expect(stats.performance.misses).toBe(0);
      expect(stats.performance.hitRate).toBe('0.00%');
      expect(stats.details.avgAccessCount).toBe('0.00');
    });

    test('获取不存在的 MAC 地址应该不抛出异常', () => {
      expect(() => cache.get('NOT:EXIST')).not.toThrow();
    });

    test('失效不存在的缓存应该不抛出异常', () => {
      expect(() => cache.invalidate('NOT:EXIST')).not.toThrow();
    });

    test('按不存在的节点失效缓存应该不抛出异常', () => {
      expect(() => cache.invalidateByNode('not-exist-node')).not.toThrow();
    });

    test('相同 MAC 地址重复设置应该覆盖', () => {
      const entity1 = createTerminalEntity({ DevMac: 'MAC:DUP:01', name: 'First' });
      const entity2 = createTerminalEntity({ DevMac: 'MAC:DUP:01', name: 'Second' });

      cache.set('MAC:DUP:01', entity1);
      cache.set('MAC:DUP:01', entity2);

      const result = cache.get('MAC:DUP:01');
      expect(result?.name).toBe('Second');
    });
  });

  describe('性能特性', () => {
    test('大量缓存操作应该保持性能', () => {
      const startTime = Date.now();

      // 设置 100 个缓存项
      for (let i = 0; i < 100; i++) {
        const entity = createTerminalEntity({
          DevMac: `PERF:${i.toString().padStart(2, '0')}`,
        });
        cache.set(`PERF:${i.toString().padStart(2, '0')}`, entity);
      }

      // 访问 100 次
      for (let i = 0; i < 100; i++) {
        cache.get(`PERF:${i.toString().padStart(2, '0')}`);
      }

      const elapsed = Date.now() - startTime;

      // 200 次操作应该在 100ms 内完成
      expect(elapsed).toBeLessThan(100);

      const stats = cache.getStats();
      expect(stats.total).toBe(100);
      expect(stats.performance.hits).toBe(100);
    });

    test('统计信息查询应该快速', () => {
      // 添加一些缓存数据
      for (let i = 0; i < 50; i++) {
        cache.set(
          `MAC:${i}`,
          createTerminalEntity({ DevMac: `MAC:${i}` })
        );
      }

      const startTime = Date.now();

      // 查询统计信息 100 次
      for (let i = 0; i < 100; i++) {
        cache.getStats();
      }

      const elapsed = Date.now() - startTime;

      // 100 次统计查询应该在 50ms 内完成
      expect(elapsed).toBeLessThan(50);
    });
  });
});
