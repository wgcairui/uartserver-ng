/**
 * Terminal Cache - 混合策略缓存
 *
 * 设计原则：
 * 1. 在线终端：永久缓存（被轮询频繁访问）
 * 2. 离线冷数据：5分钟 TTL（很少访问）
 * 3. 离线热数据：30分钟 TTL（活动期间频繁访问）
 * 4. LRU 淘汰策略：优先淘汰离线冷数据
 */

import { TerminalEntity } from '../domain/terminal.entity';
import { logger } from '../utils/logger';
import type { TerminalRepository } from './terminal.repository';

interface CacheEntry {
  entity: TerminalEntity;
  expiresAt: number;
  accessCount: number;
  lastAccess: number;
  addedAt: number;
}

interface CacheStats {
  total: number;
  maxSize: number;
  breakdown: {
    online: number;
    onlineStandard: number;
    onlinePesiv: number;
    offlineHot: number;
    offlineCold: number;
  };
  performance: {
    hits: number;
    misses: number;
    evictions: number;
    hitRate: string;
  };
  details: {
    avgAccessCount: string;
    oldestEntry: number;
    newestEntry: number;
  };
}

export class TerminalCache {
  private cache = new Map<string, CacheEntry>();
  private cleanupInterval?: ReturnType<typeof setInterval>;

  // TTL 配置
  private readonly TTL = {
    ONLINE: Infinity, // 在线终端：永不过期
    ONLINE_PESIV: 10 * 60 * 1000, // pesiv 协议在线终端：10分钟（自主上报，无需轮询）
    OFFLINE_COLD: 5 * 60 * 1000, // 离线冷数据：5分钟
    OFFLINE_HOT: 30 * 60 * 1000, // 离线热数据：30分钟
  };

  // 热数据阈值
  private readonly HOT_THRESHOLD = {
    ACCESS_COUNT: 5, // 5次访问
    TIME_WINDOW: 60 * 1000, // 1分钟内
  };

  // 访问计数衰减配置
  private readonly DECAY_CONFIG = {
    INTERVAL: 60 * 60 * 1000, // 每小时衰减一次
    RATE: 0.5, // 衰减率 50%
  };

  private readonly MAX_SIZE = 1000;

  // 性能统计
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor() {
    // 每分钟清理一次过期缓存
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
  }

  /**
   * 获取缓存
   */
  get(mac: string): TerminalEntity | null {
    const entry = this.cache.get(mac);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // 检查是否过期
    const now = Date.now();
    if (entry.expiresAt !== Infinity && now > entry.expiresAt) {
      this.cache.delete(mac);
      this.stats.misses++;
      logger.debug(`Cache expired: ${mac}`);
      return null;
    }

    // 访问计数衰减
    this.decayAccessCount(entry, now);

    // 更新访问信息
    entry.accessCount++;
    entry.lastAccess = now;
    this.stats.hits++;

    // 离线终端：检查是否变成热数据
    if (!entry.entity.online) {
      const isHot = this.isHotData(entry);

      if (isHot && entry.expiresAt !== Infinity) {
        // 升级为热数据，延长 TTL
        const oldTTL = entry.expiresAt - now;
        entry.expiresAt = now + this.TTL.OFFLINE_HOT;
        logger.debug(
          `Offline terminal promoted to hot: ${mac} (${entry.accessCount} accesses in ${Math.round((now - entry.addedAt) / 1000)}s, TTL: ${Math.round(oldTTL / 1000)}s → ${Math.round(this.TTL.OFFLINE_HOT / 1000)}s)`
        );
      }
    }

    return entry.entity;
  }

  /**
   * 访问计数衰减
   * 防止长时间运行后计数失真
   */
  private decayAccessCount(entry: CacheEntry, now: number): void {
    const timeSinceLastAccess = now - entry.lastAccess;

    // 每隔衰减间隔，计数减半
    if (timeSinceLastAccess > this.DECAY_CONFIG.INTERVAL) {
      const decayCount = Math.floor(timeSinceLastAccess / this.DECAY_CONFIG.INTERVAL);
      entry.accessCount = Math.max(
        1,
        Math.floor(entry.accessCount * Math.pow(this.DECAY_CONFIG.RATE, decayCount))
      );
      logger.debug(
        `Access count decayed for ${entry.entity.mac}: ${entry.accessCount} (idle ${Math.round(timeSinceLastAccess / 1000)}s)`
      );
    }
  }

  /**
   * 设置缓存
   */
  set(mac: string, entity: TerminalEntity): void {
    const now = Date.now();

    // 检查缓存大小
    if (this.cache.size >= this.MAX_SIZE && !this.cache.has(mac)) {
      this.evictLRU();
    }

    // 根据在线状态和协议设置 TTL
    const ttl = this.getTTL(entity);

    this.cache.set(mac, {
      entity,
      expiresAt: ttl === Infinity ? Infinity : now + ttl,
      accessCount: 1,
      lastAccess: now,
      addedAt: now,
    });

    logger.debug(
      `Cached terminal: ${mac} (online=${entity.online}, protocol=${this.getProtocol(entity)}, TTL=${ttl === Infinity ? '∞' : `${ttl / 1000}s`})`
    );
  }

  /**
   * 获取终端协议
   */
  private getProtocol(entity: TerminalEntity): string {
    // 检查终端 PID 或挂载设备协议
    const data = entity.getData();
    if (data.PID === 'pesiv') {
      return 'pesiv';
    }
    if (data.mountDevs?.some((dev) => dev.protocol === 'pesiv')) {
      return 'pesiv';
    }
    return 'standard';
  }

  /**
   * 根据终端状态和协议获取 TTL
   */
  private getTTL(entity: TerminalEntity): number {
    if (!entity.online) {
      return this.TTL.OFFLINE_COLD;
    }

    // pesiv 协议：自主上报，无需轮询，10分钟 TTL
    if (this.getProtocol(entity) === 'pesiv') {
      return this.TTL.ONLINE_PESIV;
    }

    // 标准协议：被轮询查询，永久缓存
    return this.TTL.ONLINE;
  }

  /**
   * 判断离线终端是否为热数据
   */
  private isHotData(entry: CacheEntry): boolean {
    const now = Date.now();
    const timeSinceAdded = now - entry.addedAt;

    // 在时间窗口内访问次数超过阈值
    if (timeSinceAdded < this.HOT_THRESHOLD.TIME_WINDOW) {
      return entry.accessCount >= this.HOT_THRESHOLD.ACCESS_COUNT;
    }

    // 超过时间窗口，按平均访问频率计算
    const avgAccessRate = entry.accessCount / (timeSinceAdded / 1000); // 次/秒
    const thresholdRate =
      this.HOT_THRESHOLD.ACCESS_COUNT / (this.HOT_THRESHOLD.TIME_WINDOW / 1000);
    return avgAccessRate > thresholdRate;
  }

  /**
   * 终端上线事件
   */
  onTerminalOnline(mac: string): void {
    const entry = this.cache.get(mac);
    if (entry) {
      const now = Date.now();
      const ttl = this.getTTL(entry.entity);
      entry.expiresAt = ttl === Infinity ? Infinity : now + ttl;

      logger.debug(
        `Terminal online, TTL set to ${ttl === Infinity ? '∞' : `${ttl / 1000}s`}: ${mac} (protocol=${this.getProtocol(entry.entity)})`
      );
    }
  }

  /**
   * 终端下线事件
   */
  onTerminalOffline(mac: string): void {
    const entry = this.cache.get(mac);
    if (entry) {
      const now = Date.now();

      // 检查是否为热数据
      const isHot = this.isHotData(entry);
      const ttl = isHot ? this.TTL.OFFLINE_HOT : this.TTL.OFFLINE_COLD;

      entry.expiresAt = now + ttl;
      logger.debug(
        `Terminal offline, TTL set to ${ttl / 1000}s: ${mac} (hot=${isHot}, ${entry.accessCount} accesses)`
      );
    }
  }

  /**
   * 使缓存失效
   */
  invalidate(mac: string): void {
    const deleted = this.cache.delete(mac);
    if (deleted) {
      logger.debug(`Cache invalidated: ${mac}`);
    }
  }

  /**
   * 批量失效（节点下线）
   */
  invalidateByNode(nodeName: string): void {
    let count = 0;
    for (const [mac, entry] of this.cache.entries()) {
      if (entry.entity.mountNode === nodeName) {
        this.cache.delete(mac);
        count++;
      }
    }
    if (count > 0) {
      logger.info(`Cache invalidated for node ${nodeName}: ${count} terminals`);
    }
  }

  /**
   * 清理过期缓存
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [mac, entry] of this.cache.entries()) {
      if (entry.expiresAt !== Infinity && now > entry.expiresAt) {
        this.cache.delete(mac);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cache cleanup: removed ${cleaned} expired entries`);
    }
  }

  /**
   * LRU 淘汰策略
   * 优先级：离线冷数据 > pesiv在线数据 > 标准在线数据
   */
  private evictLRU(): void {
    let victim: string | null = null;
    let oldestAccess = Date.now();

    // 1. 优先淘汰离线冷数据
    for (const [mac, entry] of this.cache.entries()) {
      if (!entry.entity.online && entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        victim = mac;
      }
    }

    // 2. 如果没有离线数据，淘汰 pesiv 在线数据
    if (!victim) {
      for (const [mac, entry] of this.cache.entries()) {
        if (
          entry.entity.online &&
          this.getProtocol(entry.entity) === 'pesiv' &&
          entry.lastAccess < oldestAccess
        ) {
          oldestAccess = entry.lastAccess;
          victim = mac;
        }
      }
    }

    // 3. 如果还没有，淘汰最旧的标准在线数据
    if (!victim) {
      for (const [mac, entry] of this.cache.entries()) {
        if (entry.lastAccess < oldestAccess) {
          oldestAccess = entry.lastAccess;
          victim = mac;
        }
      }
    }

    if (victim) {
      this.cache.delete(victim);
      this.stats.evictions++;
      logger.info(`LRU evicted: ${victim} (cache size limit reached)`);
    }
  }

  /**
   * 预热缓存
   */
  async warmup(repository: TerminalRepository): Promise<void> {
    const startTime = Date.now();
    const onlineTerminals = await repository.findOnlineTerminals();

    for (const terminal of onlineTerminals) {
      this.set(terminal.mac, terminal);
    }

    const elapsed = Date.now() - startTime;
    logger.info(
      `Cache warmed up: ${onlineTerminals.length} online terminals (${elapsed}ms)`
    );
  }

  /**
   * 获取缓存统计
   */
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());

    const online = entries.filter((e) => e.entity.online);
    const onlineStandard = online.filter((e) => this.getProtocol(e.entity) !== 'pesiv');
    const onlinePesiv = online.filter((e) => this.getProtocol(e.entity) === 'pesiv');
    const offline = entries.filter((e) => !e.entity.online);
    const offlineHot = offline.filter((e) => this.isHotData(e));
    const offlineCold = offline.filter((e) => !this.isHotData(e));

    const avgAccessCount =
      entries.reduce((sum, e) => sum + e.accessCount, 0) / entries.length || 0;

    const hitRate =
      this.stats.hits + this.stats.misses > 0
        ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100
        : 0;

    return {
      total: this.cache.size,
      maxSize: this.MAX_SIZE,
      breakdown: {
        online: online.length, // 在线终端总数
        onlineStandard: onlineStandard.length, // 标准协议在线终端（永久缓存）
        onlinePesiv: onlinePesiv.length, // pesiv协议在线终端（10分钟缓存）
        offlineHot: offlineHot.length, // 离线热数据（30分钟）
        offlineCold: offlineCold.length, // 离线冷数据（5分钟）
      },
      performance: {
        hits: this.stats.hits,
        misses: this.stats.misses,
        evictions: this.stats.evictions,
        hitRate: hitRate.toFixed(2) + '%',
      },
      details: {
        avgAccessCount: avgAccessCount.toFixed(2),
        oldestEntry: entries.length > 0 ? Math.min(...entries.map((e) => e.addedAt)) : 0,
        newestEntry: entries.length > 0 ? Math.max(...entries.map((e) => e.addedAt)) : 0,
      },
    };
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
    logger.info('Cache cleared');
  }

  /**
   * 停止定时任务（用于优雅关闭）
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.cache.clear();
    logger.info('Terminal cache destroyed');
  }
}

/**
 * 导出缓存单例
 */
export const terminalCache = new TerminalCache();
