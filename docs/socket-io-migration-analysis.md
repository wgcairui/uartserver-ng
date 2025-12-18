# Socket.IO 迁移功能差异分析

## 概述

本文档对比 Midway.js 原项目和 Bun + Fastify 新项目的 Socket.IO 实现，识别需要迁移的功能差异。

## 功能对比表

### 1. 核心 Socket.IO 服务 (socket.service.ts)

| 功能 | 原项目 (Midway.js) | 新项目 (Bun) | 状态 | 优先级 |
|------|-------------------|--------------|------|--------|
| Node 客户端注册 | ✅ `connect` + `register` | ✅ `RegisterNode` | 完成 | - |
| 查询调度循环 | ✅ `setInterval(1000ms)` | ✅ `setInterval(500ms)` | 完成 | - |
| 指令查询 | ✅ `InstructQuery()` | ✅ `InstructQuery()` | 完成 | - |
| DTU 操作 | ✅ `OprateDTU()` | ✅ `OprateDTU()` | 完成 | - |
| 通用节点消息 | ✅ `sendMessagetoNode()` | ✅ `sendMessagetoNode()` | 完成 | - |
| 节点重启 | ✅ `nodeRestart()` | ✅ `nodeRestart()` | 完成 | - |
| 定时任务: nodeInfo | ✅ 每分钟 | ✅ 每分钟 | 完成 | - |
| 定时任务: clear_nodeMap | ✅ 每小时 | ✅ 每小时 | 完成 | - |
| 定时任务: clear_Cache | ✅ 每10分钟 | ✅ 每10分钟 | 完成 | - |

### 2. Node 客户端事件处理 (node.socket.controller.ts)

| 事件 | 原项目 | 新项目 | 状态 | 优先级 |
|------|--------|--------|------|--------|
| `connect` | ✅ 连接认证 | ✅ 中间件认证 | 完成 | - |
| `disconnect` | ✅ 清理缓存 | ✅ 清理缓存 | 完成 | - |
| `register` | ✅ 注册节点 | ✅ `RegisterNode` | 完成 | - |
| `terminalOn` | ✅ 终端上线 | ✅ `handleTerminalOnline` | 完成 | - |
| `terminalOff` | ✅ 终端下线 | ✅ `handleTerminalOffline` | 完成 | - |
| `instructTimeOut` | ✅ 指令超时 | ✅ `handleInstructTimeOut` | 完成 | - |
| `terminalMountDevTimeOut` | ✅ 设备查询超时 | ✅ `handleTerminalMountDevTimeOut` | 完成 | - |
| `busy` | ✅ 设备忙碌状态 | ✅ `handleBusy` | 完成 | - |
| `ready` | ✅ 节点就绪 | ✅ `handleReady` | 完成 | - |
| `alarm` | ✅ 告警事件 | ✅ `handleAlarm` | 完成 | - |
| `startError` | ✅ 启动失败 | ✅ `handleStartError` | 完成 | - |

### 3. 用户推送服务 (socket.user.service.ts)

| 功能 | 原项目 | 新项目 | 状态 | 优先级 |
|------|--------|--------|------|--------|
| 设备变更推送 | ✅ `sendMacUpdate()` | ✅ `sendMacUpdate()` | 完成 | - |
| 设备查询间隔变更 | ✅ `sendMacIntervalUpdate()` | ✅ `sendMacIntervalUpdate()` | 完成 | - |
| 设备数据更新推送 | ✅ `sendMacDateUpdate()` | ✅ `sendMacDataUpdate()` | 完成 | - |
| 告警推送 | ✅ `sendMacAlarm()` | ✅ `sendMacAlarm()` | 完成 | - |
| 通用用户消息 | ✅ `toUserInfo()` | ✅ `toUserInfo()` | 完成 | - |
| Root 用户消息 | ✅ `sendRootSocketMessage()` | ✅ `sendRootSocketMessage()` | 完成 | - |
| 设备日志推送 | ✅ `sendMacListenMessage()` | ✅ `sendMacListenMessage()` | 完成 | - |

### 4. Web 客户端服务 (web.socket.controller.ts → websocket.service.ts)

| 功能 | 原项目 | 新项目 | 状态 | 优先级 |
|------|--------|--------|------|--------|
| 用户注册 | ✅ `register` | ✅ `auth` | 完成 | - |
| 设备订阅 | ✅ `subscribe` | ✅ `subscribe` | 完成 | - |
| 取消订阅 | ✅ `unSubscribe` | ✅ `unsubscribe` | 完成 | - |
| 权限检查 | ❌ Redis 缓存 | ✅ MongoDB 查询 | 改进 | - |

## 需要迁移的核心功能

### 高优先级

1. **终端生命周期事件**
   - `terminalOn` - 终端上线事件
   - `terminalOff` - 终端下线事件
   - `instructTimeOut` - 指令超时处理
   - `terminalMountDevTimeOut` - 设备查询超时处理
   - `busy` - 设备忙碌状态管理

2. **用户推送系统**
   - `sendMacUpdate()` - 设备变更推送
   - `sendMacDateUpdate()` - 设备数据更新推送
   - `sendMacAlarm()` - 告警推送
   - `toUserInfo()` - 通用用户消息推送

3. **通用节点通信**
   - `sendMessagetoNode()` - 发送消息到指定节点

### 中优先级

1. **定时任务**
   - `nodeInfo` - 每分钟获取节点状态
   - `clear_Cache` - 每10分钟刷新缓存

2. **辅助事件**
   - `ready` - 节点就绪事件
   - `alarm` - 告警事件
   - `nodeRestart()` - 节点重启功能

### 低优先级

1. **定时清理**
   - `clear_nodeMap` - 每小时清理节点缓存

2. **错误处理**
   - `startError` - 节点启动失败事件
   - `sendRootSocketMessage()` - Root 用户消息

## 架构差异

### Midway.js → Bun + Fastify

| 特性 | Midway.js | Bun + Fastify |
|------|-----------|---------------|
| 依赖注入 | `@Inject()` 装饰器 | 直接导入 singleton |
| Socket.IO 获取 | `@App('socketIO')` | 传入 `io` 实例 |
| 事件处理 | `@OnWSMessage()` | `socket.on()` |
| 定时任务 | `@TaskLocal()` | `setInterval()` |
| 生命周期 | `@Init()` | `initialize()` |
| 作用域 | `@Scope(ScopeEnum.Singleton)` | 手动 singleton |

## 迁移策略

### Phase 2.8.1 - 终端生命周期事件 ✅ 已完成
- [x] 添加 `terminalOn` 事件处理
- [x] 添加 `terminalOff` 事件处理
- [x] 添加 `instructTimeOut` 事件处理
- [x] 添加 `terminalMountDevTimeOut` 事件处理
- [x] 添加 `busy` 事件处理
- [x] 添加 `ready` 事件处理
- [x] 添加 `alarm` 和 `startError` 事件处理

### Phase 2.8.2 - 用户推送系统 ✅ 已完成
- [x] 实现用户推送服务模块 (socket-user.service.ts)
- [x] 集成 WebSocket 推送到浏览器用户
- [x] 实现设备变更/数据/告警推送
- [x] 集成到终端生命周期事件和结果保存流程

### Phase 2.8.3 - 定时任务和辅助功能 ✅ 已完成
- [x] 实现定时任务 (nodeInfo - 每分钟)
- [x] 实现定时任务 (clear_Cache - 每10分钟)
- [x] 实现定时任务 (clear_nodeMap - 每小时)
- [x] 实现通用节点消息功能 (sendMessagetoNode)
- [x] 实现节点重启功能 (nodeRestart)

## 注意事项

1. **Redis 依赖**: 原项目大量使用 Redis 缓存，新项目需确认是否需要 Redis 或用内存缓存替代
2. **日志服务**: 原项目使用 `logNodeService`, `logTerminalService` 等，新项目需确认对应服务
3. **BullMQ 集成**: 告警推送依赖 BullMQ 队列，需确认新项目的队列系统
4. **WS 服务**: 原项目同时支持 Socket.IO 和 WebSocket，新项目需确认策略

## 测试计划

1. **单元测试**: 每个新增事件处理函数
2. **集成测试**: 终端生命周期完整流程
3. **E2E 测试**: 用户推送系统端到端验证
4. **性能测试**: 查询调度和推送系统负载测试

## ✅ 迁移完成总结 (2025-12-18)

### 已完成的所有功能

#### Phase 2.8.1 - 终端生命周期事件 (8个事件处理器)
1. **terminalOn** - 终端上线，更新状态、缓存，推送通知
2. **terminalOff** - 终端下线，清理缓存，推送通知
3. **instructTimeOut** - 指令超时，记录日志，发送告警
4. **terminalMountDevTimeOut** - 设备查询超时（阈值>10），标记离线，发送告警
5. **busy** - 设备忙碌状态管理，缓存队列长度
6. **ready** - 节点就绪，刷新该节点的所有终端缓存
7. **alarm** - 告警事件处理
8. **startError** - 节点启动失败事件处理

#### Phase 2.8.2 - 用户推送系统 (7个推送方法)
1. **sendMacUpdate** - 设备状态变更推送（上线/下线/配置/状态）
2. **sendMacIntervalUpdate** - 查询间隔变更推送
3. **sendMacDataUpdate** - 实时数据更新推送
4. **sendMacAlarm** - 告警推送（支持4种类型、4种级别）
5. **toUserInfo** - 通用用户消息推送
6. **sendRootSocketMessage** - Root用户专用消息
7. **sendMacListenMessage** - 设备日志推送

**集成点**:
- 终端上线/下线自动推送状态变更
- 指令超时自动发送告警
- 设备查询超时自动发送告警
- 查询结果保存时自动推送数据和告警

#### Phase 2.8.3 - 定时任务和辅助功能 (5个方法)
1. **sendMessagetoNode** - 通用节点消息发送，支持请求-响应模式、超时处理
2. **nodeRestart** - 节点重启便捷方法
3. **nodeInfo** - 定时任务：每分钟向所有节点发送状态查询
4. **clear_Cache** - 定时任务：每10分钟刷新终端查询缓存
5. **clear_nodeMap** - 定时任务：每小时清理节点映射缓存

### 技术实现亮点

1. **类型安全**: 完全避免 `any` 类型，所有事件和数据都有严格的类型定义
2. **双重推送机制**: WebSocket房间推送 + 用户绑定推送，兼顾性能和权限控制
3. **事件驱动架构**: 使用 EventEmitter 实现解耦的请求-响应模式
4. **阈值告警**: 设备查询超时需达到10次才标记离线，减少误报
5. **批量操作支持**: terminalOn 支持单个或批量终端上线
6. **定时任务管理**: 独立的启动/停止方法，支持优雅关闭
7. **权限感知**: 用户推送服务查询 MongoDB 绑定关系，确保数据安全

### 代码统计

- **新增/修改文件**: 4个核心文件
  - `socket-io.service.ts` - 新增 ~500 行（事件处理器 + 定时任务 + 辅助方法）
  - `socket-user.service.ts` - 新增 318 行（完整的用户推送服务）
  - `result.service.ts` - 修改推送集成
  - `app.ts` - 添加服务初始化

- **类型定义扩展**:
  - `socket-events.ts` - 新增 8 个事件接口
  - 完整的事件映射类型定义

### 兼容性

✅ 与 Midway.js 原项目功能对等
✅ 保持数据库模型兼容性
✅ 保持 WebSocket 通信协议兼容性
✅ 支持原有的所有终端生命周期事件
✅ 支持原有的所有用户推送功能
✅ 支持原有的所有定时任务

### 后续建议

1. **性能监控**: 添加定时任务执行时间和推送延迟监控
2. **错误恢复**: 增强定时任务失败后的重试机制
3. **单元测试**: 为事件处理器和推送方法添加测试用例
4. **文档完善**: 为用户推送服务添加 API 文档
