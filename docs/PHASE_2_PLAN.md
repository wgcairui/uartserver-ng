# Phase 2: 实时通信层实现

**目标**: 实现核心的 Socket.IO 和实时通信功能，使系统能够与 Node 客户端和 Web 前端进行双向通信

**前置条件**: Phase 1 完成（✅ 已验证）

---

## 2.1 Socket.IO 基础架构

### 任务清单

- [ ] 集成 Socket.IO 4.8 到 Fastify
- [ ] 配置 Socket.IO Adapter（内存版本）
- [ ] 实现 `/node` namespace（Node 客户端连接）
- [ ] 实现连接认证和心跳机制
- [ ] 创建 Socket.IO 事件类型定义

### 关键文件

```
src/services/socket-io.service.ts          # Socket.IO 核心服务
src/types/socket-events.ts                 # Socket 事件类型定义
src/middleware/socket-auth.middleware.ts   # Socket 连接认证
```

### 验收标准

- Node 客户端可以连接到 `/node` namespace
- 连接认证正常工作（验证 Node 名称和凭证）
- 心跳机制正常（30s 间隔）
- Socket 连接和断开事件正确处理
- 单元测试覆盖率 > 80%

---

## 2.2 Node 客户端管理

### 任务清单

- [ ] 实现 Node 注册逻辑（`RegisterNode` 事件）
- [ ] 实现 Node 信息更新（`UpdateNodeInfo` 事件）
- [ ] 实现 Node 在线状态管理
- [ ] 实现 Node 连接数跟踪
- [ ] 创建 NodeMap 缓存（Socket ID → Node 信息）

### 关键文件

```
src/services/socket-io.service.ts          # Node 管理逻辑
src/types/socket-events.ts                 # Node 相关事件定义
```

### 数据结构

```typescript
// NodeMap 缓存结构
interface NodeSocketInfo {
  socketId: string;
  Name: string;
  IP: string;
  Port: number;
  MaxConnections: number;
  Connections: number;
  connectedAt: Date;
  lastHeartbeat: Date;
}
```

### 验收标准

- Node 客户端注册成功后信息存储到 MongoDB
- NodeMap 缓存正确维护（连接/断开时更新）
- Node 断开连接时清理相关数据
- Node 信息变更实时更新到数据库
- 集成测试验证完整注册流程

---

## 2.3 终端注册与缓存管理

### 任务清单

- [ ] 实现终端注册逻辑（`TerminalMountDevRegister` 事件）
- [ ] 创建 TerminalCache（终端挂载设备缓存）
- [ ] 实现缓存刷新机制（`setTerminalMountDevCache`）
- [ ] 实现终端与 Node 的映射关系
- [ ] 实现终端在线状态同步

### 关键文件

```
src/services/socket-io.service.ts          # 终端注册逻辑
src/services/cache.service.ts              # 缓存管理服务
```

### 缓存结构

```typescript
// TerminalCache: Map<DevMac, TerminalCacheInfo>
interface TerminalCacheInfo {
  mac: string;
  name: string;
  mountNode: string;
  socketId: string;              // 所属 Node 的 Socket ID
  online: boolean;
  mountDevs: MountDeviceCache[];
  lastUpdate: Date;
}

interface MountDeviceCache {
  pid: number;
  protocol: string;
  Type: string;
  online: boolean;
  minQueryLimit: number;
  lastEmit?: Date;
}
```

### 验收标准

- 终端注册时自动更新数据库和缓存
- 缓存数据与数据库保持一致
- 终端断开连接时正确清理缓存
- 支持批量刷新缓存（按 Node 或按终端）
- 性能测试：1000 个终端注册 < 5s

---

## 2.4 协议服务实现

### 任务清单

- [ ] 创建 ProtocolService（协议查询和管理）
- [ ] 实现协议指令缓存（ProMap: `protocol → 指令列表`）
- [ ] 实现协议类型识别（UTF8/标准/非标准）
- [ ] 实现 Modbus CRC16 校验计算
- [ ] 支持自定义协议脚本执行（`scriptStart`）

### 关键文件

```
src/services/protocol.service.ts           # 协议服务
src/utils/modbus-crc.ts                    # Modbus CRC16 工具
src/types/protocol.ts                      # 协议类型定义
```

### 协议类型定义

```typescript
interface Protocol {
  protocol: string;              // 协议名称
  Type: number;                  // 协议类型（232/485/...）
  instruct: ProtocolInstruct[];  // 指令列表
  scriptStart?: string;          // 自定义脚本
}

interface ProtocolInstruct {
  name: string;                  // 指令名称
  value: string;                 // 指令值（十六进制）
  resultType: string;            // 结果类型
  shift: boolean;                // 是否使用 PID 偏移
}
```

### 验收标准

- 支持从数据库加载所有协议（27 个生产协议）
- 协议缓存正确构建（ProMap）
- CRC16 计算正确（与老系统一致）
- UTF8 协议直接使用指令名
- 标准协议正确应用 Modbus CRC16
- 非标准协议执行自定义脚本
- 单元测试覆盖所有协议类型

---

## 2.5 设备查询指令生成

### 任务清单

- [ ] 实现指令生成逻辑（`generateInstructions`）
- [ ] 支持 UTF8 协议指令生成
- [ ] 支持标准 Modbus 协议（CRC16 + PID）
- [ ] 支持非标准协议（自定义脚本）
- [ ] 实现特殊协议处理（pesiv 等）

### 关键文件

```
src/services/instruction.service.ts        # 指令生成服务
src/utils/modbus-crc.ts                    # CRC16 工具
```

### 指令生成逻辑

```typescript
// 根据协议类型生成指令
function generateInstruction(
  protocol: Protocol,
  instruct: ProtocolInstruct,
  pid: number
): string {
  if (protocol.Type === 232) {
    // UTF8 协议：直接使用指令名
    return instruct.name;
  } else if (instruct.shift) {
    // 标准协议：应用 Modbus CRC16
    return applyModbusCRC(instruct.value, pid);
  } else {
    // 非标准协议：执行自定义脚本
    return executeScript(protocol.scriptStart, pid);
  }
}
```

### 验收标准

- UTF8 协议指令正确生成（直接使用指令名）
- 标准 Modbus 协议 CRC16 计算正确
- PID 偏移正确应用
- 自定义脚本正确执行
- 对比老系统验证指令一致性
- 性能测试：生成 1000 条指令 < 100ms

---

## 2.6 查询循环核心逻辑

### 任务清单

- [ ] 实现 500ms 查询循环（`startQueryLoop`）
- [ ] 实现查询间隔计算（基于指令数和连接类型）
- [ ] 实现 IoT SIM 卡流量控制逻辑
- [ ] 实现查询指令发送（`InstructQuery` 事件）
- [ ] 实现超时处理（15s 超时）

### 关键文件

```
src/services/socket-io.service.ts          # 查询循环主逻辑
src/services/query-scheduler.service.ts    # 查询调度服务
```

### 查询间隔计算

```typescript
// 查询间隔计算逻辑（与老系统一致）
function calculateQueryInterval(
  terminal: Terminal,
  instructCount: number
): number {
  // 基础间隔：4G = 1000ms，其他 = 500ms
  let base = terminal.ICCID ? 1000 : 500;

  // IoT SIM 卡流量控制
  if (terminal.iccidInfo?.resName === 'ali_1') {
    const flowResource = terminal.iccidInfo.flowResource || 512000;
    if (flowResource < 512000) {
      base *= (512000 / flowResource) * 2;
    }
  }

  // 根据指令数计算间隔
  const interval = instructCount * base;

  // 最小间隔 5000ms
  return Math.max(interval, 5000);
}
```

### 验收标准

- 查询循环正确启动（500ms 间隔）
- 查询间隔计算与老系统一致
- 只查询在线终端和在线设备
- 尊重 `minQueryLimit` 限制
- 超时正确处理（15s 后触发超时事件）
- 性能测试：500 个终端查询循环 CPU < 10%

---

## 2.7 查询结果处理

### 任务清单

- [ ] 实现查询结果接收（`queryResult` 事件）
- [ ] 实现结果数据存储（MongoDB `terminal.client.results` 集合）
- [ ] 实现 `lastEmit` 时间戳更新
- [ ] 实现查询失败处理
- [ ] 创建 EventEmitter 机制（request/response 模式）

### 关键文件

```
src/services/socket-io.service.ts          # 结果处理逻辑
src/services/result.service.ts             # 结果存储服务
```

### EventEmitter 模式

```typescript
// 使用 EventEmitter 实现异步 request/response
class SocketIoService extends EventEmitter {
  async InstructQuery(
    mac: string,
    pid: number,
    protocol: string,
    instruct: string
  ): Promise<QueryResult> {
    return new Promise((resolve, reject) => {
      const eventName = `query_${mac}_${pid}_${Date.now()}`;
      const timeout = setTimeout(() => {
        this.removeAllListeners(eventName);
        reject(new Error('Query timeout'));
      }, 15000);

      this.once(eventName, (result) => {
        clearTimeout(timeout);
        resolve(result);
      });

      // 发送查询指令到 Node
      this.emitToNode(nodeSocketId, 'InstructQuery', {
        mac, pid, protocol, instruct, eventName
      });
    });
  }
}
```

### 验收标准

- 查询结果正确存储到 MongoDB
- `lastEmit` 时间戳正确更新
- 超时情况正确处理（不阻塞循环）
- EventEmitter 监听器正确清理（防止内存泄漏）
- 集成测试：完整查询-结果流程
- 性能测试：1000 次查询结果处理 < 1s

---

## 2.8 DTU 操作指令

### 任务清单

- [ ] 实现 DTU 重启（`OprateDTU` - restart）
- [ ] 实现 DTU 重连（`OprateDTU` - restart485）
- [ ] 实现 DTU 更新挂载设备（`OprateDTU` - updateMount）
- [ ] 实现 DTU 透传指令（`OprateDTU` - OprateInstruct）
- [ ] 实现操作结果反馈

### 关键文件

```
src/services/socket-io.service.ts          # DTU 操作逻辑
src/types/socket-events.ts                 # DTU 操作事件定义
```

### DTU 操作类型

```typescript
type DtuOperationType =
  | 'restart'          // 重启 DTU
  | 'restart485'       // 重启 485 接口
  | 'updateMount'      // 更新挂载设备配置
  | 'OprateInstruct';  // 透传自定义指令

interface OprateDtuRequest {
  mac: string;
  type: DtuOperationType;
  content?: any;        // 操作相关参数
}
```

### 验收标准

- 所有 DTU 操作正确发送到 Node
- 操作结果正确返回
- 超时处理（30s 超时）
- 操作日志记录到数据库
- 集成测试验证所有操作类型

---

## 2.9 WebSocket 用户连接

### 任务清单

- [ ] 实现 WebSocket 服务（浏览器客户端连接）
- [ ] 实现用户认证（JWT token）
- [ ] 实现用户房间管理（基于用户 ID）
- [ ] 实现实时数据推送到前端
- [ ] 实现用户订阅/取消订阅设备

### 关键文件

```
src/services/websocket.service.ts          # WebSocket 服务
src/middleware/ws-auth.middleware.ts       # WebSocket 认证
```

### WebSocket 事件

```typescript
// 前端 → 后端
interface WsClientEvents {
  'subscribe': { mac: string; pid: number };      // 订阅设备
  'unsubscribe': { mac: string; pid: number };    // 取消订阅
  'query': { mac: string; pid: number };          // 手动查询
}

// 后端 → 前端
interface WsServerEvents {
  'deviceData': TerminalClientResult;             // 设备数据推送
  'deviceStatus': { mac: string; online: boolean }; // 设备状态变更
  'alarm': AlarmEvent;                            // 告警事件
}
```

### 验收标准

- WebSocket 连接正确建立
- JWT 认证正常工作
- 用户只能订阅自己的设备
- 实时数据正确推送到订阅用户
- 断线重连正确处理
- 集成测试：完整订阅-推送流程

---

## 2.10 集成测试与性能验证

### 任务清单

- [ ] 创建完整的端到端集成测试
- [ ] 测试 Node 注册 → 终端注册 → 查询循环流程
- [ ] 测试 1000 个终端的查询性能
- [ ] 测试内存泄漏（长时间运行）
- [ ] 压力测试：10 个 Node, 500 个终端同时查询

### 关键文件

```
src/services/socket-io.service.integration.test.ts
src/services/websocket.service.integration.test.ts
scripts/performance-test.ts
scripts/stress-test.ts
```

### 性能指标

- **查询延迟**: P50 < 100ms, P95 < 500ms, P99 < 1000ms
- **吞吐量**: > 1000 queries/s
- **内存使用**: 1000 个终端 < 500MB
- **CPU 使用**: 查询循环 CPU < 20%
- **并发连接**: 支持 100+ Node 客户端同时连接

### 验收标准

- 所有集成测试通过
- 性能指标满足要求
- 无明显内存泄漏（24h 运行测试）
- 压力测试下系统稳定运行
- 生产数据测试（使用 Phase 1 的生产数据）

---

## Phase 2 完成标准

✅ **功能完整性**
- Node 客户端可以正常连接和注册
- 终端注册和缓存管理正常工作
- 查询循环正确运行（500ms 间隔）
- 查询结果正确接收和存储
- DTU 操作指令正常工作
- WebSocket 用户连接和实时推送正常

✅ **性能要求**
- 支持 1000+ 终端查询循环
- 查询延迟 P95 < 500ms
- 内存使用合理（< 500MB for 1000 terminals）
- CPU 使用 < 20%

✅ **测试覆盖**
- 单元测试覆盖率 > 80%
- 集成测试覆盖所有核心流程
- 性能测试验证指标达标
- 压力测试验证系统稳定性

✅ **代码质量**
- TypeScript 类型检查通过（0 errors）
- ESLint 检查通过
- 代码符合项目规范
- 文档完善（API 文档 + 架构文档）

---

## Phase 2 预估工作量

- **2.1 Socket.IO 基础架构**: 1-2 天
- **2.2 Node 客户端管理**: 1 天
- **2.3 终端注册与缓存**: 1-2 天
- **2.4 协议服务实现**: 1-2 天
- **2.5 指令生成**: 1 天
- **2.6 查询循环**: 2-3 天（核心逻辑）
- **2.7 查询结果处理**: 1 天
- **2.8 DTU 操作**: 1 天
- **2.9 WebSocket 用户连接**: 1-2 天
- **2.10 集成测试与性能验证**: 2-3 天

**总计**: 12-18 天

---

## Phase 2 技术风险

### 高风险项

1. **查询循环性能**: 500ms 间隔处理 1000+ 终端可能导致 CPU 过高
   - **缓解策略**: 使用 Bun 的高性能特性，优化查询调度算法

2. **内存泄漏**: EventEmitter 监听器未清理可能导致内存泄漏
   - **缓解策略**: 严格的超时清理机制，定期内存分析

3. **协议兼容性**: 27 个生产协议可能有特殊情况
   - **缓解策略**: 逐个协议测试，对比老系统结果

### 中风险项

1. **CRC16 计算正确性**: Modbus CRC16 必须与老系统完全一致
   - **缓解策略**: 使用成熟的 CRC16 库，对比测试

2. **查询间隔计算**: IoT SIM 卡流量控制逻辑复杂
   - **缓解策略**: 完全复制老系统逻辑，单元测试验证

---

## 依赖的 npm 包

```json
{
  "socket.io": "^4.8.1",
  "socket.io-client": "^4.8.1",  // 测试用
  "ws": "^8.18.0",               // WebSocket
  "eventemitter3": "^5.0.1",     // 高性能 EventEmitter
  "crc": "^4.3.2"                // CRC16 计算
}
```

---

## 下一步 (Phase 3 预告)

Phase 3 将实现:
- BullMQ 后台任务队列
- 告警检测和推送
- 数据解析和存储
- 日志系统
- 用户 API 端点（完整的 REST API）
