# Terminal 实体使用指南

## 概述

Terminal 实体采用领域驱动设计（DDD）模式，将业务逻辑封装在实体内部，使用"获取 → 操作 → flush"的工作流程。

## 核心概念

### 1. TerminalEntity（领域实体）
封装了终端的业务逻辑和状态管理。

### 2. TerminalRepository（仓储层）
负责实体的获取、查询和持久化。

### 3. 工作流程
```typescript
// 1. 获取实体
const terminal = await terminalRepository.findByMac(mac);

// 2. 操作实体（业务逻辑在实体内）
terminal
  .setOnline(true)
  .setMountDeviceOnline(pid, true)
  .setMountDeviceLastEmit(pid);

// 3. 持久化到数据库
await terminal.flush();
```

## 使用示例

### 示例 1：更新终端在线状态

**旧方式（直接使用 Service）**:
```typescript
await terminalService.updateOnlineStatus(mac, true);
```

**新方式（使用实体）**:
```typescript
const terminal = await terminalRepository.findByMac(mac);
if (terminal) {
  terminal.setOnline(true);
  await terminal.flush();
}
```

### 示例 2：批量更新终端和设备状态

**旧方式（多次数据库调用）**:
```typescript
await terminalService.updateOnlineStatus(mac, true);
await terminalService.updateMountDeviceOnlineStatus(mac, pid, true);
await terminalService.updateMountDeviceLastEmit(mac, pid, new Date());
```

**新方式（链式调用 + 单次写入）**:
```typescript
const terminal = await terminalRepository.findByMac(mac);
if (terminal) {
  terminal
    .setOnline(true)
    .setMountDeviceOnline(pid, true)
    .setMountDeviceLastEmit(pid);

  await terminal.flush(); // 所有变更一次性写入数据库
}
```

### 示例 3：终端上线处理（完整示例）

```typescript
async function handleTerminalOnline(mac: string, data: { reline?: boolean }) {
  // 1. 获取终端实体
  const terminal = await terminalRepository.findByMac(mac);
  if (!terminal) {
    logger.warn(`Terminal not found: ${mac}`);
    return;
  }

  // 2. 更新状态
  terminal.setOnline(true);

  // 3. 处理所有挂载设备
  for (const mountDev of terminal.mountDevs) {
    if (mountDev.protocol === 'pesiv') {
      // pesiv 协议设备自动上线
      terminal.setMountDeviceOnline(mountDev.pid, true);
    }
  }

  // 4. 持久化到数据库
  await terminal.flush();

  // 5. 推送通知
  await socketUserService.sendMacUpdate(mac, {
    type: 'online',
    timestamp: Date.now(),
  });

  logger.info(`Terminal online: ${mac}${data.reline ? ' (reconnect)' : ''}`);
}
```

### 示例 4：批量处理多个终端

```typescript
async function refreshTerminalCaches(nodeName: string) {
  // 1. 批量获取实体
  const terminals = await terminalRepository.findByNode(nodeName);

  // 2. 批量操作
  for (const terminal of terminals) {
    // 更新缓存信息...
    terminal.update({ updatedAt: new Date() });
  }

  // 3. 批量持久化
  const savedCount = await terminalRepository.flushAll(terminals);
  logger.info(`Flushed ${savedCount} terminals for node ${nodeName}`);
}
```

### 示例 5：条件更新

```typescript
async function updateTerminalIfOnline(mac: string, pid: number) {
  const terminal = await terminalRepository.findByMac(mac);
  if (!terminal) {
    return false;
  }

  // 只在终端在线时更新设备状态
  if (terminal.online) {
    terminal.setMountDeviceLastRecord(pid);
    await terminal.flush();
    return true;
  }

  return false;
}
```

## 实体方法参考

### 状态查询方法
- `terminal.mac` - 获取 MAC 地址
- `terminal.name` - 获取设备名称
- `terminal.online` - 获取在线状态
- `terminal.mountNode` - 获取挂载节点
- `terminal.mountDevs` - 获取挂载设备列表（只读）
- `terminal.getMountDevice(pid)` - 获取指定的挂载设备
- `terminal.getData()` - 获取原始数据（只读）

### 状态更新方法
- `terminal.setOnline(online)` - 更新终端在线状态
- `terminal.setMountDeviceOnline(pid, online)` - 更新设备在线状态
- `terminal.setMountDeviceLastEmit(pid, time?)` - 更新最后发送时间
- `terminal.setMountDeviceLastRecord(pid, time?)` - 更新最后记录时间
- `terminal.updateIccidInfo(iccidInfo)` - 更新 ICCID 信息
- `terminal.update(updates)` - 批量更新字段

### 特殊方法
- `terminal.updateOnlineStatusForPesiv()` - 应用 pesiv 协议特殊逻辑
- `terminal.hasPendingChanges()` - 检查是否有待保存的变更
- `terminal.getChanges()` - 获取变更内容（调试用）
- `terminal.flush()` - 持久化变更到数据库
- `terminal.reset()` - 重置变更跟踪（慎用）

## Repository 方法参考

### 查询方法
- `terminalRepository.findByMac(mac)` - 根据 MAC 获取实体
- `terminalRepository.findByNode(nodeName)` - 根据节点获取实体列表
- `terminalRepository.findByMacs(macs)` - 批量获取实体
- `terminalRepository.findOnlineTerminals()` - 获取所有在线终端
- `terminalRepository.find(filter)` - 根据过滤条件查询

### 操作方法
- `terminalRepository.upsert(data)` - 创建或更新终端
- `terminalRepository.delete(mac)` - 删除终端
- `terminalRepository.initialize(mac)` - 初始化终端（清空数据）
- `terminalRepository.flushAll(entities)` - 批量保存实体变更

## 性能优化

### 1. 变更跟踪
实体只记录变更的字段，flush 时只更新这些字段，避免全量更新：

```typescript
terminal.setOnline(true); // 只记录 online 和 uptime 字段的变更
await terminal.flush(); // 只更新这 2 个字段，不是整个文档
```

### 2. 批量操作
使用链式调用进行多次更新，一次性写入数据库：

```typescript
// ❌ 不好的方式（3 次数据库写入）
await terminalService.updateOnlineStatus(mac, true);
await terminalService.updateMountDeviceOnlineStatus(mac, pid, true);
await terminalService.updateMountDeviceLastEmit(mac, pid, new Date());

// ✅ 好的方式（1 次数据库写入）
const terminal = await terminalRepository.findByMac(mac);
terminal
  .setOnline(true)
  .setMountDeviceOnline(pid, true)
  .setMountDeviceLastEmit(pid);
await terminal.flush();
```

### 3. 批量持久化
使用 `flushAll` 批量保存多个实体：

```typescript
const terminals = await terminalRepository.findByNode(nodeName);

// 批量操作
terminals.forEach(t => t.setOnline(false));

// 批量保存
await terminalRepository.flushAll(terminals);
```

## 注意事项

### 1. 向后兼容性
旧代码仍然可以使用 `terminalService`，它内部已经改为使用实体模式：

```typescript
// 这仍然有效
await terminalService.updateOnlineStatus(mac, true);
```

但新代码建议直接使用 Repository：

```typescript
// 推荐的新方式
const terminal = await terminalRepository.findByMac(mac);
terminal.setOnline(true);
await terminal.flush();
```

### 2. 并发问题
实体不处理并发冲突。如果多个地方同时更新同一个终端，最后一次 flush 会覆盖前面的变更。

### 3. 实体生命周期
实体获取后是内存中的快照，不会自动同步数据库的变更。如果需要最新数据，重新获取实体：

```typescript
const terminal = await terminalRepository.findByMac(mac);
// ... 一些操作 ...
// 需要最新数据时，重新获取
const freshTerminal = await terminalRepository.findByMac(mac);
```

### 4. 何时调用 flush
- 单次操作：立即 flush
- 批量操作：操作完成后统一 flush
- 链式调用：所有操作完成后 flush
- 不确定时：调用 `terminal.hasPendingChanges()` 检查

## 迁移指南

### 从 TerminalService 迁移到 Repository

**场景 1：简单的状态更新**
```typescript
// 旧代码
await terminalService.updateOnlineStatus(mac, true);

// 新代码
const terminal = await terminalRepository.findByMac(mac);
if (terminal) {
  terminal.setOnline(true);
  await terminal.flush();
}
```

**场景 2：复杂的业务逻辑**
```typescript
// 旧代码（分散的业务逻辑）
const terminal = await terminalService.getTerminal(mac);
if (terminal && terminal.online) {
  await terminalService.updateMountDeviceOnlineStatus(mac, pid, true);
  await terminalService.updateMountDeviceLastRecord(mac, pid, new Date());
}

// 新代码（集中的业务逻辑）
const terminal = await terminalRepository.findByMac(mac);
if (terminal && terminal.online) {
  terminal
    .setMountDeviceOnline(pid, true)
    .setMountDeviceLastRecord(pid);
  await terminal.flush();
}
```

**场景 3：批量处理**
```typescript
// 旧代码
const terminals = await terminalService.getTerminalsByNode(nodeName);
for (const t of terminals) {
  await terminalService.updateOnlineStatus(t.DevMac, false);
}

// 新代码
const terminals = await terminalRepository.findByNode(nodeName);
terminals.forEach(t => t.setOnline(false));
await terminalRepository.flushAll(terminals);
```

## 总结

使用 Terminal 实体模式的优势：

1. **更内聚** - 业务逻辑封装在实体内，易于维护
2. **更高效** - 变更跟踪，批量操作，减少数据库访问
3. **更安全** - 类型安全，链式调用减少错误
4. **更清晰** - 代码意图明确，易于理解

建议在新代码中优先使用实体模式，旧代码可以逐步迁移。
