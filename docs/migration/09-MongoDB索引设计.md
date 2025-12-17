# MongoDB 索引设计和实施方案

## 📋 目录

1. [索引设计原则](#1-索引设计原则)
2. [集合索引清单](#2-集合索引清单)
3. [MongoDB Native Driver 实现](#3-mongodb-native-driver-实现)
4. [索引管理工具](#4-索引管理工具)
5. [索引监控和优化](#5-索引监控和优化)

---

## 1. 索引设计原则

### 1.1 索引设计考虑因素

1. **查询模式优先** - 根据实际查询创建索引
2. **复合索引顺序** - 遵循 ESR 原则（Equality, Sort, Range）
3. **避免过度索引** - 每个索引都有写入代价
4. **覆盖索引优化** - 查询只需访问索引即可返回结果
5. **稀疏索引** - 字段值可能为 null 时使用 sparse 选项

### 1.2 索引命名规范

```
<字段名>_<1|_1>_<字段名2>_<1|_1>...

例如：
- mac_1: 单字段升序索引
- mac_1_pid_1_timeStamp_-1: 复合索引（mac 升序，pid 升序，timeStamp 降序）
```

---

## 2. 集合索引清单

### 2.1 核心业务集合

#### ✅ terminals（终端集合）- 最高优先级

**查询模式**：
- 根据 MAC 查找终端（最频繁）
- 查找在线终端
- 根据 ICCID 查找
- 根据挂载设备 PID 查找

**索引设计**：

| 索引名称 | 字段 | 类型 | 用途 |
|---------|------|------|------|
| `DevMac_1` | `{ DevMac: 1 }` | 唯一索引 | 根据 MAC 查找终端 |
| `online_1` | `{ online: 1 }` | 普通索引 | 查找在线/离线终端 |
| `ICCID_1` | `{ ICCID: 1 }` | 普通索引 | 根据 ICCID 查找 |
| `mountNode_1` | `{ mountNode: 1 }` | 普通索引 | 根据节点查找终端 |
| `ownerId_1` | `{ ownerId: 1 }` | 普通索引 | 根据所有者查找终端 |
| `mountDevs_pid_1` | `{ "mountDevs.pid": 1 }` | 普通索引 | 根据挂载设备 PID 查找 |
| `online_1_UT_-1` | `{ online: 1, UT: -1 }` | 复合索引 | 查找在线终端并按更新时间排序 |

**估算大小**: 假设 10,000 个终端，每个索引约 200KB，总计约 1.4MB

---

#### ✅ client.resultcolltions（设备数据集合）- 高优先级

**查询模式**：
- 根据 MAC + PID 查询数据
- 按时间范围查询
- 查询告警数据

**索引设计**：

| 索引名称 | 字段 | 类型 | 用途 |
|---------|------|------|------|
| `mac_1_pid_1_timeStamp_-1` | `{ mac: 1, pid: 1, timeStamp: -1 }` | 复合索引 | 时间序列查询（最重要） |
| `timeStamp_-1` | `{ timeStamp: -1 }` | 普通索引 | 按时间查询/清理旧数据 |
| `hasAlarm_1_timeStamp_-1` | `{ hasAlarm: 1, timeStamp: -1 }` | 复合索引 | 查询告警数据 |
| `parentId_1` | `{ parentId: 1 }` | 普通索引 | 关联原始数据 |

**TTL 索引**（可选）:
```javascript
{ timeStamp: 1 }, { expireAfterSeconds: 7776000 } // 90 天后自动删除
```

**估算大小**: 假设 1,000,000 条记录，每个索引约 20-40MB，总计约 80-120MB

---

#### ✅ client.resultsingles（设备单次数据）

**索引设计**：

| 索引名称 | 字段 | 类型 | 用途 |
|---------|------|------|------|
| `mac_1_pid_1` | `{ mac: 1, pid: 1 }` | 复合索引 | 查询最新数据 |
| `parentId_1` | `{ parentId: 1 }` | 普通索引 | 关联数据 |

---

### 2.2 用户相关集合

#### ✅ users（用户集合）

| 索引名称 | 字段 | 类型 | 用途 |
|---------|------|------|------|
| `userId_1` | `{ userId: 1 }` | 唯一索引 | 用户 ID 查找 |
| `user_1` | `{ user: 1 }` | 唯一索引 | 用户名登录 |
| `tel_1` | `{ tel: 1 }` | 唯一稀疏索引 | 手机号查找 |
| `openId_1` | `{ openId: 1 }` | 普通索引 | 微信 openId 查找 |
| `userGroup_1` | `{ userGroup: 1 }` | 普通索引 | 按用户组查找 |

---

#### ✅ user.binddevices（用户绑定设备）

| 索引名称 | 字段 | 类型 | 用途 |
|---------|------|------|------|
| `user_1` | `{ user: 1 }` | 唯一索引 | 查找用户绑定 |

---

#### ✅ user.aggregations（用户聚合设备）

| 索引名称 | 字段 | 类型 | 用途 |
|---------|------|------|------|
| `user_1_id_1` | `{ user: 1, id: 1 }` | 复合唯一索引 | 用户聚合查找 |

---

#### ✅ user.layouts（用户布局）

| 索引名称 | 字段 | 类型 | 用途 |
|---------|------|------|------|
| `user_1_type_1` | `{ user: 1, type: 1 }` | 复合索引 | 查找用户布局 |

---

#### ✅ user.wxpubilcs（微信用户）

| 索引名称 | 字段 | 类型 | 用途 |
|---------|------|------|------|
| `openid_1` | `{ openid: 1 }` | 唯一索引 | 微信 openid 查找 |
| `unionid_1` | `{ unionid: 1 }` | 普通索引 | 微信 unionid 查找 |

---

#### ✅ user.alarmsetups（用户告警设置）

| 索引名称 | 字段 | 类型 | 用途 |
|---------|------|------|------|
| `user_1` | `{ user: 1 }` | 唯一索引 | 用户告警配置 |

---

### 2.3 协议和设备类型集合

#### ✅ device.protocols（协议集合）

| 索引名称 | 字段 | 类型 | 用途 |
|---------|------|------|------|
| `Protocol_1` | `{ Protocol: 1 }` | 唯一索引 | 协议名称查找 |
| `Type_1` | `{ Type: 1 }` | 普通索引 | 按类型查找协议 |

---

#### ✅ device.constants（设备常量）

| 索引名称 | 字段 | 类型 | 用途 |
|---------|------|------|------|
| `Protocol_1` | `{ Protocol: 1 }` | 唯一索引 | 协议常量查找 |

---

#### ✅ device.argumentalias（设备参数别名）

| 索引名称 | 字段 | 类型 | 用途 |
|---------|------|------|------|
| `mac_1_pid_1` | `{ mac: 1, pid: 1 }` | 复合唯一索引 | 设备别名查找 |

---

### 2.4 日志集合（按时间索引 + TTL）

#### ✅ log.terminals（终端日志）

| 索引名称 | 字段 | 类型 | 用途 |
|---------|------|------|------|
| `TerminalMac_1_timeStamp_-1` | `{ TerminalMac: 1, timeStamp: -1 }` | 复合索引 | 终端日志查询 |
| `timeStamp_-1` | `{ timeStamp: -1 }` | TTL 索引 | 自动删除 30 天前日志 |

---

#### ✅ log.uartterminaldatatransfinites（超限日志）

| 索引名称 | 字段 | 类型 | 用途 |
|---------|------|------|------|
| `mac_1_pid_1_timeStamp_-1` | `{ mac: 1, pid: 1, timeStamp: -1 }` | 复合索引 | 告警查询 |
| `timeStamp_-1` | `{ timeStamp: -1 }` | TTL 索引 | 自动删除 90 天前日志 |
| `isOk_1_timeStamp_-1` | `{ isOk: 1, timeStamp: -1 }` | 复合索引 | 查询未处理告警 |

---

#### ✅ log.UserRequests（用户操作日志）

| 索引名称 | 字段 | 类型 | 用途 |
|---------|------|------|------|
| `user_1_timeStamp_-1` | `{ user: 1, timeStamp: -1 }` | 复合索引 | 用户操作历史 |
| `timeStamp_-1` | `{ timeStamp: -1 }` | TTL 索引 | 自动删除 90 天前日志 |

---

#### ✅ log.instructquerys（指令查询日志）

| 索引名称 | 字段 | 类型 | 用途 |
|---------|------|------|------|
| `mac_1_timeStamp_-1` | `{ mac: 1, timeStamp: -1 }` | 复合索引 | 指令历史查询 |
| `timeStamp_-1` | `{ timeStamp: -1 }` | TTL 索引 | 自动删除 30 天前日志 |

---

#### ✅ log.usebytes（流量使用日志）

| 索引名称 | 字段 | 类型 | 用途 |
|---------|------|------|------|
| `mac_1_date_1` | `{ mac: 1, date: 1 }` | 复合唯一索引 | 流量统计 |
| `date_1` | `{ date: 1 }` | 普通索引 | 按日期统计 |

---

#### ✅ log.usetime（设备使用时间日志）

| 索引名称 | 字段 | 类型 | 用途 |
|---------|------|------|------|
| `mac_1_pid_1_timeStamp_-1` | `{ mac: 1, pid: 1, timeStamp: -1 }` | 复合索引 | 性能分析 |
| `timeStamp_-1` | `{ timeStamp: -1 }` | TTL 索引 | 自动删除 30 天前日志 |

---

#### ✅ log.wxsubscribeMessages（微信消息日志）

| 索引名称 | 字段 | 类型 | 用途 |
|---------|------|------|------|
| `touser_1_timeStamp_-1` | `{ touser: 1, timeStamp: -1 }` | 复合索引 | 用户消息历史 |
| `timeStamp_-1` | `{ timeStamp: -1 }` | TTL 索引 | 自动删除 90 天前日志 |

---

#### ✅ log.innerMessages（站内信）

| 索引名称 | 字段 | 类型 | 用途 |
|---------|------|------|------|
| `user_1_timeStamp_-1` | `{ user: 1, timeStamp: -1 }` | 复合索引 | 用户消息查询 |
| `timeStamp_-1` | `{ timeStamp: -1 }` | 普通索引 | 按时间查询 |

---

### 2.5 其他集合

#### ✅ node.clients（节点客户端）

| 索引名称 | 字段 | 类型 | 用途 |
|---------|------|------|------|
| `Name_1` | `{ Name: 1 }` | 唯一索引 | 节点名称查找 |

---

#### ✅ terminal.registers（终端注册）

| 索引名称 | 字段 | 类型 | 用途 |
|---------|------|------|------|
| `DevMac_1` | `{ DevMac: 1 }` | 唯一索引 | 注册查找 |

---

#### ✅ dev.register（设备注册）

| 索引名称 | 字段 | 类型 | 用途 |
|---------|------|------|------|
| `id_1` | `{ id: 1 }` | 唯一索引 | 设备 ID 查找 |

---

#### ✅ amap.loctioncaches（高德地图缓存）

| 索引名称 | 字段 | 类型 | 用途 |
|---------|------|------|------|
| `key_1` | `{ key: 1 }` | 唯一索引 | GPS 缓存查找 |
| `createdAt_1` | `{ createdAt: 1 }` | TTL 索引 | 自动删除 30 天缓存 |

---

## 3. MongoDB Native Driver 实现

### 3.1 索引管理服务

```typescript
import { Db, Collection, IndexDescription } from 'mongodb';
import pino from 'pino';

const logger = pino();

/**
 * 索引定义类型
 */
export interface IndexDefinition {
  collection: string;
  indexes: Array<{
    key: Record<string, 1 | -1>;
    options?: {
      unique?: boolean;
      sparse?: boolean;
      expireAfterSeconds?: number;
      name?: string;
      background?: boolean;
    };
  }>;
}

/**
 * 索引管理服务
 */
export class IndexManager {
  private db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  /**
   * 确保所有索引存在
   */
  async ensureAllIndexes(): Promise<void> {
    logger.info('开始创建/更新索引...');
    const startTime = Date.now();

    const indexDefinitions = this.getIndexDefinitions();

    for (const def of indexDefinitions) {
      try {
        await this.ensureCollectionIndexes(def);
      } catch (error) {
        logger.error({ error, collection: def.collection }, '索引创建失败');
        throw error;
      }
    }

    const duration = Date.now() - startTime;
    logger.info({ duration }, '索引创建/更新完成');
  }

  /**
   * 为单个集合创建索引
   */
  private async ensureCollectionIndexes(def: IndexDefinition): Promise<void> {
    const collection = this.db.collection(def.collection);

    logger.info({ collection: def.collection }, `创建 ${def.indexes.length} 个索引`);

    for (const index of def.indexes) {
      const indexName = this.generateIndexName(index.key);
      const options = {
        ...index.options,
        name: index.options?.name || indexName,
        background: true, // 后台创建，不阻塞数据库
      };

      try {
        await collection.createIndex(index.key, options);
        logger.debug({ collection: def.collection, index: indexName }, '索引创建成功');
      } catch (error) {
        // 索引已存在的错误可以忽略
        if (error.code !== 85 && error.code !== 86) {
          throw error;
        }
        logger.debug({ collection: def.collection, index: indexName }, '索引已存在');
      }
    }
  }

  /**
   * 生成索引名称
   */
  private generateIndexName(key: Record<string, 1 | -1>): string {
    return Object.entries(key)
      .map(([field, direction]) => `${field}_${direction}`)
      .join('_');
  }

  /**
   * 获取所有索引定义
   */
  private getIndexDefinitions(): IndexDefinition[] {
    return [
      // ============ 核心业务集合 ============
      {
        collection: 'terminals',
        indexes: [
          { key: { DevMac: 1 }, options: { unique: true } },
          { key: { online: 1 } },
          { key: { ICCID: 1 } },
          { key: { mountNode: 1 } },
          { key: { ownerId: 1 } },
          { key: { 'mountDevs.pid': 1 } },
          { key: { online: 1, UT: -1 } },
        ],
      },

      {
        collection: 'client.resultcolltions',
        indexes: [
          { key: { mac: 1, pid: 1, timeStamp: -1 } }, // 最重要的复合索引
          { key: { timeStamp: -1 } }, // 可选：添加 TTL
          { key: { hasAlarm: 1, timeStamp: -1 } },
          { key: { parentId: 1 } },
        ],
      },

      {
        collection: 'client.resultsingles',
        indexes: [
          { key: { mac: 1, pid: 1 } },
          { key: { parentId: 1 } },
        ],
      },

      // ============ 用户相关集合 ============
      {
        collection: 'users',
        indexes: [
          { key: { userId: 1 }, options: { unique: true } },
          { key: { user: 1 }, options: { unique: true } },
          { key: { tel: 1 }, options: { unique: true, sparse: true } },
          { key: { openId: 1 } },
          { key: { userGroup: 1 } },
        ],
      },

      {
        collection: 'user.binddevices',
        indexes: [{ key: { user: 1 }, options: { unique: true } }],
      },

      {
        collection: 'user.aggregations',
        indexes: [{ key: { user: 1, id: 1 }, options: { unique: true } }],
      },

      {
        collection: 'user.layouts',
        indexes: [{ key: { user: 1, type: 1 } }],
      },

      {
        collection: 'user.wxpubilcs',
        indexes: [
          { key: { openid: 1 }, options: { unique: true } },
          { key: { unionid: 1 } },
        ],
      },

      {
        collection: 'user.alarmsetups',
        indexes: [{ key: { user: 1 }, options: { unique: true } }],
      },

      // ============ 协议和设备类型 ============
      {
        collection: 'device.protocols',
        indexes: [
          { key: { Protocol: 1 }, options: { unique: true } },
          { key: { Type: 1 } },
        ],
      },

      {
        collection: 'device.constants',
        indexes: [{ key: { Protocol: 1 }, options: { unique: true } }],
      },

      {
        collection: 'device.argumentalias',
        indexes: [{ key: { mac: 1, pid: 1 }, options: { unique: true } }],
      },

      // ============ 日志集合（带 TTL） ============
      {
        collection: 'log.terminals',
        indexes: [
          { key: { TerminalMac: 1, timeStamp: -1 } },
          { key: { timeStamp: -1 }, options: { expireAfterSeconds: 2592000 } }, // 30 天
        ],
      },

      {
        collection: 'log.uartterminaldatatransfinites',
        indexes: [
          { key: { mac: 1, pid: 1, timeStamp: -1 } },
          { key: { timeStamp: -1 }, options: { expireAfterSeconds: 7776000 } }, // 90 天
          { key: { isOk: 1, timeStamp: -1 } },
        ],
      },

      {
        collection: 'log.UserRequests',
        indexes: [
          { key: { user: 1, timeStamp: -1 } },
          { key: { timeStamp: -1 }, options: { expireAfterSeconds: 7776000 } }, // 90 天
        ],
      },

      {
        collection: 'log.instructquerys',
        indexes: [
          { key: { mac: 1, timeStamp: -1 } },
          { key: { timeStamp: -1 }, options: { expireAfterSeconds: 2592000 } }, // 30 天
        ],
      },

      {
        collection: 'log.usebytes',
        indexes: [
          { key: { mac: 1, date: 1 }, options: { unique: true } },
          { key: { date: 1 } },
        ],
      },

      {
        collection: 'log.usetime',
        indexes: [
          { key: { mac: 1, pid: 1, timeStamp: -1 } },
          { key: { timeStamp: -1 }, options: { expireAfterSeconds: 2592000 } }, // 30 天
        ],
      },

      {
        collection: 'log.wxsubscribeMessages',
        indexes: [
          { key: { touser: 1, timeStamp: -1 } },
          { key: { timeStamp: -1 }, options: { expireAfterSeconds: 7776000 } }, // 90 天
        ],
      },

      {
        collection: 'log.innerMessages',
        indexes: [
          { key: { user: 1, timeStamp: -1 } },
          { key: { timeStamp: -1 } },
        ],
      },

      // ============ 其他集合 ============
      {
        collection: 'node.clients',
        indexes: [{ key: { Name: 1 }, options: { unique: true } }],
      },

      {
        collection: 'terminal.registers',
        indexes: [{ key: { DevMac: 1 }, options: { unique: true } }],
      },

      {
        collection: 'dev.register',
        indexes: [{ key: { id: 1 }, options: { unique: true } }],
      },

      {
        collection: 'amap.loctioncaches',
        indexes: [
          { key: { key: 1 }, options: { unique: true } },
          { key: { createdAt: 1 }, options: { expireAfterSeconds: 2592000 } }, // 30 天
        ],
      },
    ];
  }

  /**
   * 列出所有集合的索引
   */
  async listAllIndexes(): Promise<Record<string, any[]>> {
    const collections = await this.db.listCollections().toArray();
    const result: Record<string, any[]> = {};

    for (const collInfo of collections) {
      const collection = this.db.collection(collInfo.name);
      const indexes = await collection.indexes();
      result[collInfo.name] = indexes;
    }

    return result;
  }

  /**
   * 删除未使用的索引
   */
  async dropUnusedIndexes(collectionName: string, indexNames: string[]): Promise<void> {
    const collection = this.db.collection(collectionName);

    for (const indexName of indexNames) {
      try {
        await collection.dropIndex(indexName);
        logger.info({ collection: collectionName, index: indexName }, '索引已删除');
      } catch (error) {
        logger.error({ error, collection: collectionName, index: indexName }, '删除索引失败');
      }
    }
  }

  /**
   * 获取索引统计信息
   */
  async getIndexStats(collectionName: string): Promise<any> {
    const collection = this.db.collection(collectionName);
    const stats = await collection.aggregate([{ $indexStats: {} }]).toArray();
    return stats;
  }
}
```

---

### 3.2 在应用启动时初始化索引

```typescript
import { MongoClient } from 'mongodb';
import { IndexManager } from './services/index-manager';

async function initializeDatabase() {
  const client = new MongoClient(process.env.MONGODB_URI!);

  try {
    await client.connect();
    console.log('MongoDB 连接成功');

    const db = client.db('uart_server');

    // 初始化索引
    const indexManager = new IndexManager(db);
    await indexManager.ensureAllIndexes();

    console.log('所有索引创建完成');

    return { client, db, indexManager };
  } catch (error) {
    console.error('数据库初始化失败:', error);
    throw error;
  }
}

// 应用启动
async function bootstrap() {
  const { client, db, indexManager } = await initializeDatabase();

  // ... 启动 Fastify 服务器
}

bootstrap();
```

---

## 4. 索引管理工具

### 4.1 索引检查脚本

```typescript
// scripts/check-indexes.ts
import { MongoClient } from 'mongodb';
import { IndexManager } from '../src/services/index-manager';

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI!);

  try {
    await client.connect();
    const db = client.db('uart_server');
    const indexManager = new IndexManager(db);

    console.log('📊 查询所有索引...\n');
    const allIndexes = await indexManager.listAllIndexes();

    for (const [collection, indexes] of Object.entries(allIndexes)) {
      console.log(`\n📁 集合: ${collection}`);
      console.log('═'.repeat(60));

      for (const index of indexes) {
        console.log(`  索引名称: ${index.name}`);
        console.log(`  索引字段: ${JSON.stringify(index.key)}`);
        if (index.unique) console.log(`  ✓ 唯一索引`);
        if (index.sparse) console.log(`  ✓ 稀疏索引`);
        if (index.expireAfterSeconds) {
          console.log(`  ✓ TTL 索引 (${index.expireAfterSeconds / 86400} 天)`);
        }
        console.log('');
      }
    }
  } finally {
    await client.close();
  }
}

main();
```

---

### 4.2 索引性能分析脚本

```typescript
// scripts/analyze-indexes.ts
import { MongoClient } from 'mongodb';
import { IndexManager } from '../src/services/index-manager';

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI!);

  try {
    await client.connect();
    const db = client.db('uart_server');
    const indexManager = new IndexManager(db);

    const collections = ['terminals', 'client.resultcolltions', 'users'];

    console.log('📈 索引使用统计\n');

    for (const collectionName of collections) {
      console.log(`\n📁 集合: ${collectionName}`);
      console.log('═'.repeat(60));

      const stats = await indexManager.getIndexStats(collectionName);

      for (const stat of stats) {
        console.log(`  索引: ${stat.name}`);
        console.log(`  访问次数: ${stat.accesses.ops}`);
        console.log(`  最后访问: ${stat.accesses.since}`);
        console.log('');
      }
    }

    console.log('\n💡 提示: 访问次数为 0 的索引可能是未使用的索引，可考虑删除');
  } finally {
    await client.close();
  }
}

main();
```

---

### 4.3 索引重建脚本

```typescript
// scripts/rebuild-indexes.ts
import { MongoClient } from 'mongodb';

async function rebuildIndexes(collectionName: string) {
  const client = new MongoClient(process.env.MONGODB_URI!);

  try {
    await client.connect();
    const db = client.db('uart_server');
    const collection = db.collection(collectionName);

    console.log(`🔄 重建集合 ${collectionName} 的索引...`);

    // 重建所有索引
    await collection.reIndex();

    console.log(`✅ 索引重建完成`);
  } finally {
    await client.close();
  }
}

// 使用方式：bun run scripts/rebuild-indexes.ts terminals
const collectionName = process.argv[2];
if (!collectionName) {
  console.error('请提供集合名称');
  process.exit(1);
}

rebuildIndexes(collectionName);
```

---

## 5. 索引监控和优化

### 5.1 慢查询监控

```typescript
// 启用 MongoDB profiling
async function enableProfiling() {
  const client = new MongoClient(process.env.MONGODB_URI!);

  try {
    await client.connect();
    const db = client.db('uart_server');

    // 设置 profiling 级别
    // 0: 关闭
    // 1: 记录慢查询（> slowms）
    // 2: 记录所有查询
    await db.command({
      profile: 1,
      slowms: 100, // 记录超过 100ms 的查询
    });

    console.log('✅ 慢查询监控已启用');
  } finally {
    await client.close();
  }
}
```

---

### 5.2 查询慢查询日志

```typescript
async function getSlowQueries() {
  const client = new MongoClient(process.env.MONGODB_URI!);

  try {
    await client.connect();
    const db = client.db('uart_server');

    const slowQueries = await db
      .collection('system.profile')
      .find({
        millis: { $gt: 100 },
      })
      .sort({ ts: -1 })
      .limit(10)
      .toArray();

    console.log('🐌 最近 10 条慢查询:\n');

    for (const query of slowQueries) {
      console.log(`集合: ${query.ns}`);
      console.log(`耗时: ${query.millis}ms`);
      console.log(`查询: ${JSON.stringify(query.command)}`);
      console.log('─'.repeat(60));
    }
  } finally {
    await client.close();
  }
}
```

---

### 5.3 索引建议

根据慢查询日志，MongoDB 可以提供索引建议：

```typescript
async function getIndexSuggestions(collectionName: string, query: any) {
  const client = new MongoClient(process.env.MONGODB_URI!);

  try {
    await client.connect();
    const db = client.db('uart_server');
    const collection = db.collection(collectionName);

    // 使用 explain 分析查询
    const explanation = await collection.find(query).explain('executionStats');

    console.log('📊 查询分析:\n');
    console.log(`执行时间: ${explanation.executionStats.executionTimeMillis}ms`);
    console.log(`扫描文档数: ${explanation.executionStats.totalDocsExamined}`);
    console.log(`返回文档数: ${explanation.executionStats.nReturned}`);

    // 如果扫描文档数 >> 返回文档数，说明缺少索引
    const efficiency = explanation.executionStats.nReturned / explanation.executionStats.totalDocsExamined;

    if (efficiency < 0.1) {
      console.log('\n⚠️  警告: 查询效率低，建议添加索引');
      console.log(`建议索引字段: ${JSON.stringify(query)}`);
    }
  } finally {
    await client.close();
  }
}
```

---

### 5.4 索引大小监控

```typescript
async function monitorIndexSizes() {
  const client = new MongoClient(process.env.MONGODB_URI!);

  try {
    await client.connect();
    const db = client.db('uart_server');

    const collections = await db.listCollections().toArray();

    console.log('💾 索引大小统计\n');

    for (const collInfo of collections) {
      const stats = await db.collection(collInfo.name).stats();

      const totalIndexSize = stats.totalIndexSize;
      const dataSize = stats.size;
      const ratio = ((totalIndexSize / dataSize) * 100).toFixed(2);

      console.log(`📁 ${collInfo.name}`);
      console.log(`  数据大小: ${(dataSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  索引大小: ${(totalIndexSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  索引比例: ${ratio}%`);
      console.log('');

      // 警告：索引大小超过数据大小 50%
      if (parseFloat(ratio) > 50) {
        console.log(`  ⚠️  警告: 索引大小过大，可能有冗余索引\n`);
      }
    }
  } finally {
    await client.close();
  }
}
```

---

## 📋 总结

### ✅ 核心要点

1. **使用 MongoDB Native Driver 的 `createIndex()` 方法创建索引**
2. **后台创建索引** (`background: true`) 避免阻塞
3. **为时间序列数据添加 TTL 索引** 自动清理旧数据
4. **复合索引遵循 ESR 原则** (Equality, Sort, Range)
5. **定期监控索引使用情况** 删除未使用的索引

### 📊 索引数量统计

| 集合类型 | 集合数量 | 平均索引数 | 总计索引数 |
|---------|---------|-----------|-----------|
| 核心业务 | 3 | 5 | 15 |
| 用户相关 | 6 | 2 | 12 |
| 协议设备 | 3 | 2 | 6 |
| 日志类 | 8 | 3 | 24 |
| 其他 | 4 | 2 | 8 |
| **合计** | **24** | **2.7** | **65** |

### 🎯 下一步

1. ✅ 在迁移项目中集成 `IndexManager`
2. ✅ 在应用启动时自动创建索引
3. ✅ 设置 Prometheus 监控索引性能
4. ✅ 定期运行索引分析脚本
5. ✅ 根据慢查询日志优化索引

---

**文档版本**: v1.0.0
**最后更新**: 2024-12-16
**维护者**: 开发团队
