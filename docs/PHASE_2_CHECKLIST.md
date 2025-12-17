# Phase 2 快速检查清单

## 2.1 Socket.IO 基础架构
- [ ] 安装依赖: `socket.io@^4.8.1`
- [ ] 创建 `SocketIoService` 类
- [ ] 配置 `/node` namespace
- [ ] 实现连接认证
- [ ] 实现心跳机制 (30s)
- [ ] 测试: Node 客户端连接成功

## 2.2 Node 客户端管理
- [ ] `RegisterNode` 事件处理
- [ ] `UpdateNodeInfo` 事件处理
- [ ] NodeMap 缓存实现
- [ ] Node 断开清理逻辑
- [ ] 测试: Node 注册/更新/断开

## 2.3 终端注册与缓存
- [ ] `TerminalMountDevRegister` 事件
- [ ] TerminalCache 实现 (Map<mac, info>)
- [ ] `setTerminalMountDevCache()` 方法
- [ ] 缓存刷新机制
- [ ] 测试: 1000 个终端注册性能

## 2.4 协议服务
- [ ] 创建 `ProtocolService`
- [ ] 从数据库加载协议
- [ ] ProMap 缓存 (protocol → 指令)
- [ ] Modbus CRC16 工具
- [ ] 测试: 27 个生产协议加载

## 2.5 指令生成
- [ ] `generateInstruction()` 方法
- [ ] UTF8 协议支持
- [ ] 标准 Modbus 协议 (CRC16)
- [ ] 非标准协议 (scriptStart)
- [ ] 测试: 对比老系统指令一致性

## 2.6 查询循环
- [ ] 500ms 查询循环实现
- [ ] 查询间隔计算 (4G/非4G)
- [ ] IoT SIM 卡流量控制
- [ ] `InstructQuery` 事件发送
- [ ] 15s 超时处理
- [ ] 测试: 500 个终端查询循环 CPU < 10%

## 2.7 查询结果处理
- [ ] `queryResult` 事件接收
- [ ] 结果存储到 MongoDB
- [ ] `lastEmit` 时间戳更新
- [ ] EventEmitter request/response 模式
- [ ] 监听器清理 (防止内存泄漏)
- [ ] 测试: 1000 次查询结果处理性能

## 2.8 DTU 操作
- [ ] `OprateDTU` 事件实现
- [ ] restart (重启 DTU)
- [ ] restart485 (重启 485)
- [ ] updateMount (更新挂载)
- [ ] OprateInstruct (透传指令)
- [ ] 测试: 所有操作类型

## 2.9 WebSocket 用户连接
- [ ] WebSocket 服务实现
- [ ] JWT 认证
- [ ] 用户房间管理
- [ ] subscribe/unsubscribe 事件
- [ ] 实时数据推送
- [ ] 测试: 订阅-推送流程

## 2.10 集成测试
- [ ] 端到端集成测试
- [ ] Node → 终端 → 查询完整流程
- [ ] 性能测试 (1000 终端)
- [ ] 内存泄漏测试 (24h)
- [ ] 压力测试 (10 Node, 500 终端)
- [ ] 生产数据验证

## 完成标准
- [ ] 所有单元测试通过 (覆盖率 > 80%)
- [ ] 所有集成测试通过
- [ ] 性能指标达标 (P95 < 500ms)
- [ ] 内存使用正常 (< 500MB for 1000 terminals)
- [ ] CPU 使用正常 (< 20%)
- [ ] TypeScript 类型检查通过
- [ ] 生产数据测试通过

---

## 核心性能指标

| 指标 | 目标 | 当前 |
|------|------|------|
| 查询延迟 P50 | < 100ms | - |
| 查询延迟 P95 | < 500ms | - |
| 查询延迟 P99 | < 1000ms | - |
| 吞吐量 | > 1000 queries/s | - |
| 内存使用 (1000 终端) | < 500MB | - |
| CPU 使用 (查询循环) | < 20% | - |
| 并发 Node 连接 | > 100 | - |

---

## 关键实现参考

### 查询间隔计算
```typescript
function calculateQueryInterval(
  terminal: Terminal,
  instructCount: number
): number {
  let base = terminal.ICCID ? 1000 : 500;

  if (terminal.iccidInfo?.resName === 'ali_1') {
    const flow = terminal.iccidInfo.flowResource || 512000;
    if (flow < 512000) {
      base *= (512000 / flow) * 2;
    }
  }

  return Math.max(instructCount * base, 5000);
}
```

### EventEmitter 模式
```typescript
async InstructQuery(mac: string, pid: number): Promise<QueryResult> {
  return new Promise((resolve, reject) => {
    const eventName = `query_${mac}_${pid}_${Date.now()}`;
    const timeout = setTimeout(() => {
      this.removeAllListeners(eventName);
      reject(new Error('Timeout'));
    }, 15000);

    this.once(eventName, (result) => {
      clearTimeout(timeout);
      resolve(result);
    });

    this.emitToNode(nodeSocketId, 'InstructQuery', { ... });
  });
}
```

### Modbus CRC16
```typescript
import crc16 from 'crc/crc16modbus';

function applyModbusCRC(hex: string, pid: number): string {
  // 添加 PID
  const withPid = hex.replace(/\{PID\}/g, pid.toString(16).padStart(2, '0'));

  // 计算 CRC16
  const buffer = Buffer.from(withPid, 'hex');
  const crc = crc16(buffer);

  // 追加 CRC (低字节在前)
  return withPid + crc.toString(16).padStart(4, '0');
}
```
