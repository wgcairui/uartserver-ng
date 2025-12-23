# Phase 4.2: API 网关实施文档

**文档版本**: 1.0
**创建日期**: 2025-12-23
**预计工时**: 40-50 小时
**依赖**: Phase 4.1 用户认证系统 ✅

---

## 📋 目录

1. [概述](#概述)
2. [总体架构](#总体架构)
3. [API 模块清单](#api-模块清单)
4. [实施步骤](#实施步骤)
5. [测试计划](#测试计划)
6. [验收标准](#验收标准)

---

## 概述

### 目标

实现完整的 RESTful API 网关，提供设备管理、数据查询、用户管理等核心功能，对标 midwayuartserver 的 API 功能。

### 参考系统分析

基于 `midwayuartserver` 的 API 结构分析：

**核心 Controller**:
- `api.controller.ts` - 主要用户 API (58 个端点)
- `data.controller.ts` - 数据查询 API (3 个端点)
- `iot.controller.ts` - 物联卡管理 API (8 个端点)
- `node.controller.ts` - Node 客户端管理
- `log.controller.ts` - 日志查询
- `root.controller.ts` - 管理员 API

**总计**: 100+ API 端点

### Phase 4.2 范围

**本阶段实现** (核心用户 API):
- ✅ 用户认证 API (Phase 4.1 已完成)
- ✅ **设备管理 API (8 个端点) - Day 1 完成 (2025-12-23)**
- 🎯 数据查询 API (6 个端点)
- 🎯 告警管理 API (5 个端点)
- 🎯 协议管理 API (4 个端点)
- 🎯 用户配置 API (3 个端点)

**后续阶段**:
- Phase 4.3: 管理员 API
- Phase 4.4: 物联卡管理 API
- Phase 4.5: 高级功能 API

---

## 总体架构

### 技术栈对比

| 功能层 | midwayuartserver | uartserver-ng | 说明 |
|--------|------------------|---------------|------|
| 框架 | Midway.js + Koa | Fastify | 更高性能 |
| 装饰器 | @midwayjs/decorator | 自定义装饰器系统 | 无 reflect-metadata |
| 验证 | @midwayjs/validate | Zod | 类型安全 |
| 认证 | Session | JWT | 无状态 |
| 权限 | 自定义 Guard | 中间件 + 装饰器 | RBAC |
| 数据库 | TypeORM + Mongoose | TypeORM + MongoDB Native | 原生驱动性能更好 |

### 目录结构

```
src/
├── controllers/              # API 控制器
│   ├── auth.controller.ts        # ✅ Phase 4.1 已完成
│   ├── user.controller.ts        # ✅ Phase 4.1 已完成
│   ├── terminal-api.controller.ts # ✅ Day 1 已完成
│   ├── data.controller.ts        # 🎯 本阶段
│   ├── alarm.controller.ts       # 🎯 本阶段
│   ├── protocol.controller.ts    # 🎯 本阶段
│   └── config.controller.ts      # 🎯 本阶段
├── services/                 # 业务逻辑层
│   ├── terminal-api.service.ts   # ✅ Day 1 已完成
│   ├── data.service.ts           # 🎯 本阶段
│   ├── alarm.service.ts          # 部分完成，需扩展
│   └── protocol.service.ts       # 🎯 本阶段
├── schemas/                  # Zod 验证 schemas
│   ├── terminal.schema.ts        # ✅ Day 1 已完成（扩展）
│   ├── data.schema.ts           # 🎯 本阶段
│   ├── alarm.schema.ts          # 🎯 本阶段
│   └── protocol.schema.ts       # 🎯 本阶段
├── entities/
│   └── mongodb/              # MongoDB 实体
│       ├── terminal.entity.ts   # ✅ Day 1 已完成
│       ├── data.entity.ts       # 🎯 新建
│       └── protocol.entity.ts   # 需扩展
└── middleware/
    └── auth.ts              # ✅ Phase 4.1 已完成
```

---

## API 模块清单

### 模块 1: 设备管理 API

**对应老系统**: `api.controller.ts` 中的设备相关端点

#### 1.1 获取用户绑定设备列表

**老系统参考**:
```typescript
// midwayuartserver/src/controller/api.controller.ts:119-127
@Post('/BindDev')
async BindDev(@User() user: Users) {
  const macs = await this.userService.getUserBind(user.user);
  return {
    UTs: await this.terminalService.getTerminal(macs),
  };
}
```

**新系统实现**:
- **端点**: `GET /api/terminals`
- **认证**: 需要 JWT 认证
- **权限**: `user`, `admin`
- **返回**: 终端列表（包含在线状态、挂载设备等）

#### 1.2 获取单个终端详情

**老系统参考**:
```typescript
// api.controller.ts:589-594
@Post('/getTerminal')
async getTerminalSingle(@Body() datas: mac) {
  return await this.terminalService.getTerminal(datas.mac);
}
```

**新系统实现**:
- **端点**: `GET /api/terminals/:mac`
- **认证**: 需要 JWT 认证
- **权限**: 必须是设备绑定用户或管理员
- **返回**: 终端详细信息

#### 1.3 修改终端别名

**老系统参考**:
```typescript
// api.controller.ts:197-208
@Post('/modifyTerminal')
async modifyTerminal(@Body() data: modifiTerminalName, @User() user: Users) {
  const isUserBind = await this.userService.isBindMac(user.user, data.mac);
  if (!isUserBind) {
    throw new Error('no bind');
  }
  return await this.terminalService.modifyTerminal(data.mac, {
    name: data.name,
  });
}
```

**新系统实现**:
- **端点**: `PUT /api/terminals/:mac`
- **认证**: 需要 JWT 认证
- **权限**: 必须是设备绑定用户或管理员
- **参数**: `{ name: string, jw?: string }`
- **返回**: 更新后的终端信息

#### 1.4 添加绑定设备

**老系统参考**:
```typescript
// api.controller.ts:213-235
@Post('/addUserTerminal')
async addUserTerminal(@Body() data: mac, @User() user: Users) {
  if (user.userGroup === 'test') {
    throw new Error('测试账户无法绑定新设备');
  }

  const [terminal, isBind] = await Promise.all([
    this.terminalService.getTerminal(data.mac),
    this.terminalService.isBind(data.mac),
  ]);

  if (!terminal.share && isBind) {
    throw new Error('该设备已被其他用户绑定');
  }

  if (!isBind) {
    await this.terminalService.setTerminalOwner(data.mac, user.user);
  }

  return await this.terminalService.addUserTerminal(user.user, data.mac);
}
```

**新系统实现**:
- **端点**: `POST /api/terminals/:mac/bind`
- **认证**: 需要 JWT 认证
- **权限**: `user`
- **业务逻辑**:
  - 检查设备是否已被绑定
  - 检查设备 share 属性
  - 设置设备所有者（如果未绑定）
  - 添加用户绑定关系
- **返回**: 绑定结果

#### 1.5 删除绑定设备

**老系统参考**:
```typescript
// api.controller.ts:241-247
@Post('/delUserTerminal')
async delUserTerminal(@Body() data: mac, @User() user: Users) {
  return await this.terminalService.delUserTerminal(user.user, data.mac);
}
```

**新系统实现**:
- **端点**: `DELETE /api/terminals/:mac/bind`
- **认证**: 需要 JWT 认证
- **权限**: `user`
- **返回**: 删除结果

#### 1.6 添加终端挂载设备

**老系统参考**:
```typescript
// api.controller.ts:281-294
@Post('/addTerminalMountDev')
async addTerminalMountDev(@Body() data: addMountDev, @User() user: Users) {
  if (!(await this.userService.isBindMac(user.user, data.mac))) {
    throw new Error('mac not you bind');
  }

  const [result] = await Promise.all([
    this.terminalService.addTerminalMountDev(data.mac, data.mountDev),
    this.socketIoService.setTerminalMountDevCache(data.mac),
  ]);
  return result;
}
```

**新系统实现**:
- **端点**: `POST /api/terminals/:mac/devices`
- **认证**: 需要 JWT 认证
- **权限**: 必须是设备绑定用户或管理员
- **参数**: `{ pid: number, protocol: string, name: string, mountDev?: string }`
- **业务逻辑**:
  - 添加挂载设备到终端
  - 更新 Socket.IO 缓存
- **返回**: 添加结果

#### 1.7 删除终端挂载设备

**老系统参考**:
```typescript
// api.controller.ts:263-275
@Post('/delTerminalMountDev')
async delTerminalMountDev(@Body() { mac, pid }: macPid, @User() user: Users) {
  if (!(await this.userService.isBindMac(user.user, mac))) {
    throw new Error('mac not you bind');
  }
  const [result] = await Promise.all([
    this.terminalService.delTerminalMountDev(mac, pid),
    this.socketIoService.delTerminalMountDevCache(mac, pid),
  ]);
  return result;
}
```

**新系统实现**:
- **端点**: `DELETE /api/terminals/:mac/devices/:pid`
- **认证**: 需要 JWT 认证
- **权限**: 必须是设备绑定用户或管理员
- **业务逻辑**:
  - 删除挂载设备
  - 更新 Socket.IO 缓存
- **返回**: 删除结果

#### 1.8 检查终端在线状态

**老系统参考**:
```typescript
// api.controller.ts:185-191
@Post('/getTerminalOnline')
async getTerminalOnline(@Body() data: mac) {
  const ter = await this.terminalService.getTerminal(data.mac);
  return ter && ter.online ? ter : ter?.online;
}
```

**新系统实现**:
- **端点**: `GET /api/terminals/:mac/status`
- **认证**: 需要 JWT 认证
- **返回**: `{ online: boolean, lastSeen?: Date }`

---

### 模块 2: 数据查询 API

**对应老系统**: `api.controller.ts` 中的数据相关端点

#### 2.1 获取终端最新数据

**老系统参考**:
```typescript
// api.controller.ts:430-441
@Post('/getTerminalData')
async getTerminalData(@Body() data: macPid, @User() user: Users) {
  const isBind = await this.userService.isBindMac(user.user, data.mac);
  if (!isBind) {
    throw new Error('mac not bind');
  }

  const result = await this.dataService.getTerminalData(data.mac, data.pid);
  return result;
}
```

**新系统实现**:
- **端点**: `GET /api/data/latest/:mac/:pid`
- **认证**: 需要 JWT 认证
- **权限**: 必须是设备绑定用户或管理员
- **返回**: 最新的设备数据

#### 2.2 获取终端历史数据 (V2)

**老系统参考**:
```typescript
// api.controller.ts:446-474
@Post('/getTerminalDatasV2')
async getTerminalDatasV2(
  @Body() data: terminalResultsV2,
  @User() user: Users
) {
  const isBind = await this.userService.isBindMac(user.user, data.mac);
  if (!isBind) {
    throw new Error('mac not bind');
  }
  const d = await this.dataService.getTerminalDatasV2(
    data.mac,
    data.pid,
    data.name,
    data.start,
    data.end
  );

  // 如果参数是数组,或结果小于50条,直接返回数据
  if (d.length < 50 || typeof data.name === 'object') {
    return d;
  }
  // 把结果拆分为块,50等分
  const len = Number.parseInt((d.length / 50).toFixed(0));
  const resultChunk = lodash.chunk(d, len < 10 ? 10 : len);
  return resultChunk
    .map(el => [lodash.maxBy(el, 'value')!, lodash.minBy(el, 'value')!])
    .flat();
}
```

**新系统实现**:
- **端点**: `GET /api/data/history/:mac/:pid`
- **查询参数**: `name` (string 或 array), `start` (timestamp), `end` (timestamp), `aggregate` (boolean)
- **认证**: 需要 JWT 认证
- **权限**: 必须是设备绑定用户或管理员
- **业务逻辑**:
  - 如果结果 > 50 条且 `aggregate=true`，返回聚合数据（max/min）
  - 否则返回完整数据
- **返回**: 历史数据数组

#### 2.3 获取指定参数的数据

**新系统实现**:
- **端点**: `GET /api/data/:mac/:pid/:name`
- **查询参数**: `start` (timestamp), `end` (timestamp)
- **认证**: 需要 JWT 认证
- **权限**: 必须是设备绑定用户或管理员
- **返回**: 指定参数的数据

#### 2.4 获取原始数据 (管理员)

**老系统参考**:
```typescript
// data.controller.ts:25-34
@Post('/row')
async ClientResults(@Body() data: IdDate) {
  return await this.dataService.getRow(
    data.getStart(),
    data.getEnd(),
    data.id ? data.getId() : null
  );
}
```

**新系统实现**:
- **端点**: `GET /api/data/raw`
- **查询参数**: `start`, `end`, `terminalId` (optional)
- **认证**: 需要 JWT 认证
- **权限**: `admin`, `root`
- **返回**: 原始数据记录

#### 2.5 获取解析数据 (管理员)

**老系统参考**:
```typescript
// data.controller.ts:43-52
@Post('/parse')
async ClientResult(@Body() data: IdDate) {
  return await this.dataService.getParseData(
    data.getStart(),
    data.getEnd(),
    data.id ? data.getId() : null
  );
}
```

**新系统实现**:
- **端点**: `GET /api/data/parsed`
- **查询参数**: `start`, `end`, `terminalId` (optional)
- **认证**: 需要 JWT 认证
- **权限**: `admin`, `root`
- **返回**: 解析后的数据记录

#### 2.6 重置设备超时状态

**老系统参考**:
```typescript
// api.controller.ts:478-495
@Post('/refreshDevTimeOut')
async refreshDevTimeOut(@Body() data: macPid, @User() user: Users) {
  const isBind = await this.userService.isBindMac(user.user, data.mac);
  if (!isBind) {
    throw new Error('mac not bind');
  }
  await this.socketIoService.setTerminalMountDevCache(
    data.mac,
    data.interVal
  );
  return await this.terminalService.setStatTerminalDevsOnline(
    data.mac,
    data.pid,
    true
  );
}
```

**新系统实现**:
- **端点**: `POST /api/data/:mac/:pid/refresh-timeout`
- **认证**: 需要 JWT 认证
- **权限**: 必须是设备绑定用户或管理员
- **业务逻辑**:
  - 重置 Socket.IO 缓存
  - 更新设备在线状态
- **返回**: 操作结果

---

### 模块 3: 告警管理 API

**对应老系统**: `api.controller.ts` 中的告警相关端点

#### 3.1 获取用户告警列表

**老系统参考**:
```typescript
// api.controller.ts:134-153
@Post('/loguartterminaldatatransfinites')
async loguartterminaldatatransfinites(
  @Body() data: date,
  @User() user: Users
) {
  const alarms = await this.terminalDataTransfiniteService.getUserAlarm(
    user.user,
    data.getStart(),
    data.getEnd()
  );

  const macs = new Set(alarms.map(i => i.mac));
  const terminals = await this.terminalService.getTerminal(Array.from(macs));
  const termialsMap = new Map(terminals.map(i => [i.DevMac, i]));
  return alarms.map(el => {
    const terminal = termialsMap.get(el.mac);
    el.mac = terminal?.name || el.mac;
    return el;
  });
}
```

**新系统实现**:
- **端点**: `GET /api/alarms`
- **查询参数**: `start`, `end`, `confirmed` (boolean), `level` (string)
- **认证**: 需要 JWT 认证
- **权限**: `user`
- **返回**: 告警列表（包含终端名称）

#### 3.2 确认告警

**老系统参考**:
```typescript
// api.controller.ts:172-179
@Post('/confrimAlarm')
async confrimAlarm(@Body() data: mongoId, @User() user: Users) {
  return await this.terminalDataTransfiniteService.confrimAlarm(
    user.user,
    data.getId()
  );
}
```

**新系统实现**:
- **端点**: `POST /api/alarms/:id/confirm`
- **认证**: 需要 JWT 认证
- **权限**: `user`
- **业务逻辑**: 标记告警为已确认
- **返回**: 确认结果

#### 3.3 获取未确认告警数量

**老系统参考**:
```typescript
// api.controller.ts:715-726
@Post('/getAlarmunconfirmed')
async getAlarmunconfirmed(@User() user: Users) {
  const macs = await this.userService.getUserBind(user.user);
  return await this.terminalDataTransfiniteService.uartTerminalDataTransfiniteModel.countDocuments(
    {
      mac: { $in: macs },
      isOk: false,
    }
  );
}
```

**新系统实现**:
- **端点**: `GET /api/alarms/unconfirmed/count`
- **认证**: 需要 JWT 认证
- **权限**: `user`
- **返回**: `{ count: number }`

#### 3.4 获取用户告警配置

**老系统参考**:
```typescript
// api.controller.ts:339-344
@Post('/getUserAlarmSetup')
async getUserAlarmSetup(@User() user: Users) {
  return await this.alarmSetupService.getUserAlarmSetup(user.user);
}
```

**新系统实现**:
- **端点**: `GET /api/alarms/config`
- **认证**: 需要 JWT 认证
- **权限**: `user`
- **返回**: 用户告警配置

#### 3.5 修改用户告警联系方式

**老系统参考**:
```typescript
// api.controller.ts:350-361
@Post('/modifyUserAlarmSetupTel')
async modifyUserAlarmSetupTel(
  @Body() { tels, mails }: alarmTels,
  @User() user: Users
) {
  return await this.alarmSetupService.modifyUserAlarmSetup(user.user, {
    tels,
    mails,
  });
}
```

**新系统实现**:
- **端点**: `PUT /api/alarms/config/contacts`
- **认证**: 需要 JWT 认证
- **权限**: `user`
- **参数**: `{ tels: string[], mails: string[] }`
- **返回**: 更新结果

---

### 模块 4: 协议管理 API

**对应老系统**: `api.controller.ts` 中的协议相关端点

#### 4.1 获取协议详情

**老系统参考**:
```typescript
// api.controller.ts:557-562
@Post('/getProtocol')
async getProtocol(@Body() data: protocol) {
  return await this.protocolService.getProtocol(data.protocol);
}
```

**新系统实现**:
- **端点**: `GET /api/protocols/:protocol`
- **认证**: 需要 JWT 认证
- **权限**: `user`, `admin`
- **返回**: 协议详细信息

#### 4.2 获取协议告警配置

**老系统参考**:
```typescript
// api.controller.ts:420-425
@Post('/getAlarmProtocol')
async getAlarmProtocol(@Body() data: protocol) {
  return await this.devConstantService.getAlarmProtocol(data.protocol);
}
```

**新系统实现**:
- **端点**: `GET /api/protocols/:protocol/alarm-config`
- **认证**: 需要 JWT 认证
- **权限**: `user`
- **返回**: 协议告警配置

#### 4.3 获取用户协议告警配置

**老系统参考**:
```typescript
// api.controller.ts:408-416
@Post('/getUserAlarmProtocol')
async getUserAlarmProtocol(@Body() data: protocol, @User() user: Users) {
  return await this.alarmSetupService.getUserAlarmProtocol(
    user.user,
    data.protocol
  );
}
```

**新系统实现**:
- **端点**: `GET /api/protocols/:protocol/user-config`
- **认证**: 需要 JWT 认证
- **权限**: `user`
- **返回**: 用户自定义协议告警配置

#### 4.4 设置用户协议配置

**老系统参考**:
```typescript
// api.controller.ts:568-583
@Post('/setUserSetupProtocol')
async setUserSetupProtocols(
  @Body() data: setUserSetupProtocolDto,
  @User() user: Users
) {
  const d = await this.alarmSetupService.setUserSetupProtocol(
    user.user,
    data.protocol,
    data.type,
    data.arg
  );
  this.redisService.setUserSetup(user.user, data.protocol);
  return d;
}
```

**新系统实现**:
- **端点**: `PUT /api/protocols/:protocol/user-config`
- **认证**: 需要 JWT 认证
- **权限**: `user`
- **参数**: `{ type: string, arg: any }`
- **业务逻辑**:
  - 保存用户协议配置
  - 更新 Redis 缓存
- **返回**: 更新结果

---

### 模块 5: 用户配置 API

**对应老系统**: `api.controller.ts` 中的配置相关端点

#### 5.1 获取用户布局配置

**老系统参考**:
```typescript
// api.controller.ts:608-624
@Post('/getUserLayout')
async getUserLayout(@Body() data: id, @User() user: Users) {
  const layout = await this.userLayoutService.getUserLayout(
    user.user,
    data.id
  );
  for (const i of layout.Layout) {
    (i as any).result = await this.dataService.getTerminalDataName(
      i.bind.mac,
      i.bind.pid,
      i.bind.name
    );
  }
  return layout;
}
```

**新系统实现**:
- **端点**: `GET /api/config/layout/:id`
- **认证**: 需要 JWT 认证
- **权限**: `user`
- **业务逻辑**: 获取布局并注入实时数据
- **返回**: 布局配置（含实时数据）

#### 5.2 设置用户布局配置

**老系统参考**:
```typescript
// api.controller.ts:637-648
@Post('/setUserLayout')
async setUserLayout(@Body() data: setAggs, @User() user: Users) {
  return await this.userLayoutService.setUserLayout(
    user.user,
    data.id,
    data.type,
    data.bg,
    data.Layout
  );
}
```

**新系统实现**:
- **端点**: `PUT /api/config/layout/:id`
- **认证**: 需要 JWT 认证
- **权限**: `user`
- **参数**: `{ type: string, bg: string, Layout: any[] }`
- **返回**: 更新结果

#### 5.3 获取设备聚合配置

**老系统参考**:
```typescript
// api.controller.ts:628-633
@Post('/getAggregation')
async getAggregation(@Body() data: id, @User() user: Users) {
  return await this.userAggregationService.getAggregation(user.user, data.id);
}
```

**新系统实现**:
- **端点**: `GET /api/config/aggregation/:id`
- **认证**: 需要 JWT 认证
- **权限**: `user`
- **返回**: 聚合设备配置

---

## 实施步骤

### ✅ 第 1 天: 设备管理 API - 已完成 (2025-12-23)

**实际工时**: ~6 小时
**完成内容**:
- ✅ Step 1.1: 创建实体和类型定义
- ✅ Step 1.2: 创建 Schema 验证
- ✅ Step 1.3: 实现 TerminalApiService
- ✅ Step 1.4: 实现 TerminalApiController (8 个端点)
- ✅ Step 1.5: 注册控制器和配置路由
- ✅ Step 1.6: 编写单元测试 (84 个测试，全部通过)

**测试覆盖**:
- Entity 测试: 17 个测试
- Schema 测试: 41 个测试
- Controller 测试: 26 个测试
- 总断言数: 187 个

**实现的 8 个 API 端点**:
1. `GET /api/terminals` - 获取终端列表
2. `GET /api/terminals/:mac` - 获取终端详情
3. `PUT /api/terminals/:mac` - 更新终端信息
4. `POST /api/terminals/:mac/bind` - 绑定终端
5. `DELETE /api/terminals/:mac/bind` - 解绑终端
6. `POST /api/terminals/:mac/devices` - 添加挂载设备
7. `DELETE /api/terminals/:mac/devices/:pid` - 删除挂载设备
8. `GET /api/terminals/:mac/status` - 获取在线状态

---

### 第 1 天原计划: 设备管理 API (8-10 小时)

#### Step 1.1: 创建实体和类型定义 (1 小时)

**文件**: `src/entities/mongodb/terminal.entity.ts`

```typescript
import { ObjectId } from 'mongodb';

/**
 * 挂载设备信息
 */
export interface MountDevice {
  pid: number;
  protocol: string;
  name: string;
  mountDev?: string;
  online?: boolean;
  formResize?: number;
  isState?: boolean;
}

/**
 * 终端实体
 */
export interface TerminalDocument {
  _id: ObjectId;
  DevMac: string;              // 设备 MAC 地址
  name: string;                // 设备别名
  online: boolean;             // 在线状态
  lastSeen?: Date;             // 最后上线时间
  mountDevs?: MountDevice[];   // 挂载设备列表
  jw?: string;                 // GPS 坐标
  share?: boolean;             // 是否共享设备
  owner?: string;              // 设备所有者
  ICCID?: string;              // 物联卡 ICCID
  iccidInfo?: any;             // 物联卡信息
  bindUsers?: string[];        // 绑定用户列表
  createdAt: Date;
  updatedAt: Date;
}
```

**操作**:
1. 扩展现有的 `terminal.entity.ts` 文件
2. 添加缺失的字段定义
3. 确保类型与老系统兼容

#### Step 1.2: 创建 Schema 验证 (1.5 小时)

**文件**: `src/schemas/terminal.schema.ts`

```typescript
import { z } from 'zod';

/**
 * MAC 地址验证
 */
export const MacAddressSchema = z.string()
  .regex(/^[0-9A-Fa-f]{12}$/, 'Invalid MAC address format');

/**
 * 修改终端名称请求
 */
export const UpdateTerminalRequestSchema = z.object({
  data: z.object({
    name: z.string().min(1, '终端名称不能为空').max(50, '终端名称过长'),
    jw: z.string().optional(),
  }),
});
export type UpdateTerminalRequest = z.infer<typeof UpdateTerminalRequestSchema>;

/**
 * 添加挂载设备请求
 */
export const AddMountDeviceRequestSchema = z.object({
  data: z.object({
    pid: z.number().int().positive('PID 必须为正整数'),
    protocol: z.string().min(1, '协议不能为空'),
    name: z.string().min(1, '设备名称不能为空'),
    mountDev: z.string().optional(),
  }),
});
export type AddMountDeviceRequest = z.infer<typeof AddMountDeviceRequestSchema>;

/**
 * 删除挂载设备参数
 */
export const DeleteMountDeviceParamsSchema = z.object({
  mac: MacAddressSchema,
  pid: z.string().transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),
});
export type DeleteMountDeviceParams = z.infer<typeof DeleteMountDeviceParamsSchema>;
```

**操作**:
1. 创建 `terminal.schema.ts` 文件
2. 定义所有终端相关的请求 schema
3. 包含 MAC 地址格式验证

#### Step 1.3: 实现 Terminal Service (2.5 小时)

**文件**: `src/services/terminal.service.ts`

```typescript
import { Db, ObjectId } from 'mongodb';
import type { TerminalDocument, MountDevice } from '../entities/mongodb/terminal.entity';
import { Phase3Collections } from '../entities/mongodb';

export class TerminalService {
  private collections: Phase3Collections;

  constructor(db: Db) {
    this.collections = new Phase3Collections(db);
  }

  /**
   * 获取终端列表
   */
  async getTerminals(macs: string[]): Promise<TerminalDocument[]> {
    return await this.collections.terminals
      .find({ DevMac: { $in: macs } })
      .toArray();
  }

  /**
   * 获取单个终端
   */
  async getTerminal(mac: string): Promise<TerminalDocument | null> {
    return await this.collections.terminals.findOne({ DevMac: mac });
  }

  /**
   * 修改终端信息
   */
  async updateTerminal(
    mac: string,
    updates: Partial<TerminalDocument>
  ): Promise<boolean> {
    const result = await this.collections.terminals.updateOne(
      { DevMac: mac },
      {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      }
    );
    return result.modifiedCount > 0;
  }

  /**
   * 检查终端是否被绑定
   */
  async isBound(mac: string): Promise<boolean> {
    const terminal = await this.collections.terminals.findOne(
      { DevMac: mac },
      { projection: { bindUsers: 1 } }
    );
    return (terminal?.bindUsers?.length || 0) > 0;
  }

  /**
   * 设置终端所有者
   */
  async setTerminalOwner(mac: string, userId: string): Promise<boolean> {
    const result = await this.collections.terminals.updateOne(
      { DevMac: mac },
      { $set: { owner: userId, updatedAt: new Date() } }
    );
    return result.modifiedCount > 0;
  }

  /**
   * 添加用户终端绑定
   */
  async bindTerminal(userId: string, mac: string): Promise<boolean> {
    // 添加到用户的绑定列表
    const userResult = await this.collections.users.updateOne(
      { _id: new ObjectId(userId) },
      { $addToSet: { bindDevices: mac } }
    );

    // 添加到终端的绑定用户列表
    const terminalResult = await this.collections.terminals.updateOne(
      { DevMac: mac },
      { $addToSet: { bindUsers: userId }, $set: { updatedAt: new Date() } }
    );

    return userResult.modifiedCount > 0 && terminalResult.modifiedCount > 0;
  }

  /**
   * 删除用户终端绑定
   */
  async unbindTerminal(userId: string, mac: string): Promise<boolean> {
    // 从用户的绑定列表移除
    const userResult = await this.collections.users.updateOne(
      { _id: new ObjectId(userId) },
      { $pull: { bindDevices: mac } }
    );

    // 从终端的绑定用户列表移除
    const terminalResult = await this.collections.terminals.updateOne(
      { DevMac: mac },
      { $pull: { bindUsers: userId }, $set: { updatedAt: new Date() } }
    );

    return userResult.modifiedCount > 0 && terminalResult.modifiedCount > 0;
  }

  /**
   * 添加挂载设备
   */
  async addMountDevice(mac: string, mountDev: MountDevice): Promise<boolean> {
    const result = await this.collections.terminals.updateOne(
      { DevMac: mac },
      {
        $push: { mountDevs: mountDev },
        $set: { updatedAt: new Date() },
      }
    );
    return result.modifiedCount > 0;
  }

  /**
   * 删除挂载设备
   */
  async removeMountDevice(mac: string, pid: number): Promise<boolean> {
    const result = await this.collections.terminals.updateOne(
      { DevMac: mac },
      {
        $pull: { mountDevs: { pid } },
        $set: { updatedAt: new Date() },
      }
    );
    return result.modifiedCount > 0;
  }

  /**
   * 设置设备在线状态
   */
  async setDeviceOnline(mac: string, pid: number, online: boolean): Promise<boolean> {
    const result = await this.collections.terminals.updateOne(
      { DevMac: mac, 'mountDevs.pid': pid },
      {
        $set: {
          'mountDevs.$.online': online,
          updatedAt: new Date(),
        },
      }
    );
    return result.modifiedCount > 0;
  }
}
```

**操作**:
1. 创建 `terminal.service.ts` 文件
2. 实现所有终端相关业务逻辑
3. 包含权限检查和数据验证

#### Step 1.4: 实现 Terminal Controller (3 小时)

**文件**: `src/controllers/terminal.controller.ts`

```typescript
import { Controller, Get, Post, Put, Delete } from '../decorators/controller';
import { Params, Body } from '../decorators/params';
import { mongodb } from '../database/mongodb';
import { TerminalService } from '../services/terminal.service';
import type { UserDocument } from '../entities/mongodb/user.entity';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  UpdateTerminalRequestSchema,
  AddMountDeviceRequestSchema,
  DeleteMountDeviceParamsSchema,
  type UpdateTerminalRequest,
  type AddMountDeviceRequest,
  type DeleteMountDeviceParams,
} from '../schemas/terminal.schema';
import { UserService } from '../services/user.service';

@Controller('/api/terminals')
export class TerminalController {
  private terminalService: TerminalService;
  private userService: UserService;

  constructor() {
    const db = mongodb.getDatabase();
    this.terminalService = new TerminalService(db);
    this.userService = new UserService(db);
  }

  /**
   * 获取用户绑定的终端列表
   */
  @Get('/')
  async getTerminals(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as UserDocument;
    if (!user) {
      return reply.status(401).send({
        status: 'error',
        message: 'Unauthorized',
        data: null,
      });
    }

    const macs = await this.userService.getUserBindings(user._id.toHexString());
    const terminals = await this.terminalService.getTerminals(macs);

    return reply.send({
      status: 'ok',
      data: { terminals },
    });
  }

  /**
   * 获取单个终端详情
   */
  @Get('/:mac')
  async getTerminal(
    @Params('mac') mac: string,
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const user = request.user as UserDocument;
    if (!user) {
      return reply.status(401).send({
        status: 'error',
        message: 'Unauthorized',
        data: null,
      });
    }

    // 检查权限
    const isBound = await this.userService.isDeviceBound(
      user._id.toHexString(),
      mac
    );
    if (!isBound && user.role !== 'admin') {
      return reply.status(403).send({
        status: 'error',
        message: 'Device access denied',
        data: null,
      });
    }

    const terminal = await this.terminalService.getTerminal(mac);
    if (!terminal) {
      return reply.status(404).send({
        status: 'error',
        message: 'Terminal not found',
        data: null,
      });
    }

    return reply.send({
      status: 'ok',
      data: terminal,
    });
  }

  /**
   * 修改终端信息
   */
  @Put('/:mac')
  async updateTerminal(
    @Params('mac') mac: string,
    @Body(UpdateTerminalRequestSchema) body: UpdateTerminalRequest,
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const user = request.user as UserDocument;
    if (!user) {
      return reply.status(401).send({
        status: 'error',
        message: 'Unauthorized',
        data: null,
      });
    }

    // 检查权限
    const isBound = await this.userService.isDeviceBound(
      user._id.toHexString(),
      mac
    );
    if (!isBound && user.role !== 'admin') {
      return reply.status(403).send({
        status: 'error',
        message: 'Device access denied',
        data: null,
      });
    }

    const success = await this.terminalService.updateTerminal(mac, body.data);
    if (!success) {
      return reply.status(500).send({
        status: 'error',
        message: 'Failed to update terminal',
        data: null,
      });
    }

    return reply.send({
      status: 'ok',
      message: 'Terminal updated successfully',
      data: null,
    });
  }

  /**
   * 绑定终端
   */
  @Post('/:mac/bind')
  async bindTerminal(
    @Params('mac') mac: string,
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const user = request.user as UserDocument;
    if (!user) {
      return reply.status(401).send({
        status: 'error',
        message: 'Unauthorized',
        data: null,
      });
    }

    // 检查是否是测试账户
    if (user.role === 'guest') {
      return reply.status(403).send({
        status: 'error',
        message: 'Test accounts cannot bind new devices',
        data: null,
      });
    }

    // 获取终端信息
    const terminal = await this.terminalService.getTerminal(mac);
    if (!terminal) {
      return reply.status(404).send({
        status: 'error',
        message: 'Terminal not found',
        data: null,
      });
    }

    // 检查是否已被绑定
    const isBound = await this.terminalService.isBound(mac);
    if (!terminal.share && isBound) {
      return reply.status(409).send({
        status: 'error',
        message: 'Device already bound by another user',
        data: null,
      });
    }

    // 如果未绑定，设置所有者
    if (!isBound) {
      await this.terminalService.setTerminalOwner(mac, user._id.toHexString());
    }

    // 绑定终端
    const success = await this.terminalService.bindTerminal(
      user._id.toHexString(),
      mac
    );
    if (!success) {
      return reply.status(500).send({
        status: 'error',
        message: 'Failed to bind terminal',
        data: null,
      });
    }

    return reply.send({
      status: 'ok',
      message: 'Terminal bound successfully',
      data: null,
    });
  }

  /**
   * 解绑终端
   */
  @Delete('/:mac/bind')
  async unbindTerminal(
    @Params('mac') mac: string,
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const user = request.user as UserDocument;
    if (!user) {
      return reply.status(401).send({
        status: 'error',
        message: 'Unauthorized',
        data: null,
      });
    }

    const success = await this.terminalService.unbindTerminal(
      user._id.toHexString(),
      mac
    );
    if (!success) {
      return reply.status(500).send({
        status: 'error',
        message: 'Failed to unbind terminal',
        data: null,
      });
    }

    return reply.send({
      status: 'ok',
      message: 'Terminal unbound successfully',
      data: null,
    });
  }

  /**
   * 添加挂载设备
   */
  @Post('/:mac/devices')
  async addMountDevice(
    @Params('mac') mac: string,
    @Body(AddMountDeviceRequestSchema) body: AddMountDeviceRequest,
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const user = request.user as UserDocument;
    if (!user) {
      return reply.status(401).send({
        status: 'error',
        message: 'Unauthorized',
        data: null,
      });
    }

    // 检查权限
    const isBound = await this.userService.isDeviceBound(
      user._id.toHexString(),
      mac
    );
    if (!isBound && user.role !== 'admin') {
      return reply.status(403).send({
        status: 'error',
        message: 'Device access denied',
        data: null,
      });
    }

    const success = await this.terminalService.addMountDevice(mac, body.data);
    if (!success) {
      return reply.status(500).send({
        status: 'error',
        message: 'Failed to add mount device',
        data: null,
      });
    }

    // TODO: 更新 Socket.IO 缓存
    // await socketIoService.setTerminalMountDevCache(mac);

    return reply.send({
      status: 'ok',
      message: 'Mount device added successfully',
      data: null,
    });
  }

  /**
   * 删除挂载设备
   */
  @Delete('/:mac/devices/:pid')
  async removeMountDevice(
    @Params(DeleteMountDeviceParamsSchema) params: DeleteMountDeviceParams,
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const { mac, pid } = params;
    const user = request.user as UserDocument;
    if (!user) {
      return reply.status(401).send({
        status: 'error',
        message: 'Unauthorized',
        data: null,
      });
    }

    // 检查权限
    const isBound = await this.userService.isDeviceBound(
      user._id.toHexString(),
      mac
    );
    if (!isBound && user.role !== 'admin') {
      return reply.status(403).send({
        status: 'error',
        message: 'Device access denied',
        data: null,
      });
    }

    const success = await this.terminalService.removeMountDevice(mac, pid);
    if (!success) {
      return reply.status(500).send({
        status: 'error',
        message: 'Failed to remove mount device',
        data: null,
      });
    }

    // TODO: 更新 Socket.IO 缓存
    // await socketIoService.delTerminalMountDevCache(mac, pid);

    return reply.send({
      status: 'ok',
      message: 'Mount device removed successfully',
      data: null,
    });
  }

  /**
   * 获取终端在线状态
   */
  @Get('/:mac/status')
  async getTerminalStatus(
    @Params('mac') mac: string,
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const user = request.user as UserDocument;
    if (!user) {
      return reply.status(401).send({
        status: 'error',
        message: 'Unauthorized',
        data: null,
      });
    }

    const terminal = await this.terminalService.getTerminal(mac);
    if (!terminal) {
      return reply.status(404).send({
        status: 'error',
        message: 'Terminal not found',
        data: null,
      });
    }

    return reply.send({
      status: 'ok',
      data: {
        online: terminal.online,
        lastSeen: terminal.lastSeen,
      },
    });
  }
}
```

**操作**:
1. 创建 `terminal.controller.ts` 文件
2. 实现所有 8 个终端 API 端点
3. 集成认证中间件和权限检查
4. 添加完整的错误处理

#### Step 1.5: 注册 Controller 和配置路由 (0.5 小时)

**文件**: `src/app.ts`

```typescript
// 添加导入
import { TerminalController } from './controllers/terminal.controller';

// 在 registerControllers 调用中添加
registerControllers(app, [
  AuthController,
  UserController,
  TerminalController,  // 新增
  // ... 其他 controllers
]);
```

**文件**: `src/utils/auth-routes.ts`

```typescript
// 添加需要认证的路由
const authRoutes = [
  '/api/auth/me',
  '/api/auth/change-password',
  '/api/auth/logout',
  '/api/terminals',        // 新增
  '/api/terminals/',       // 新增
];
```

**操作**:
1. 注册 TerminalController
2. 配置认证中间件
3. 测试路由是否正确加载

#### Step 1.6: 编写单元测试 (2 小时)

**文件**: `test/unit/terminal.service.test.ts`

创建 TerminalService 的单元测试，覆盖所有方法。

**文件**: `test/integration/terminal.api.test.ts`

创建 Terminal API 的集成测试，测试所有端点。

**测试覆盖**:
- ✅ 获取终端列表
- ✅ 获取终端详情
- ✅ 修改终端信息
- ✅ 绑定/解绑终端
- ✅ 添加/删除挂载设备
- ✅ 权限检查
- ✅ 错误处理

---

### 第 2 天: 数据查询 API (8-10 小时)

#### Step 2.1: 创建数据实体 (1 小时)

**文件**: `src/entities/mongodb/data.entity.ts`

```typescript
import { ObjectId } from 'mongodb';

/**
 * 原始数据记录
 */
export interface DataRecordDocument {
  _id: ObjectId;
  mac: string;
  pid: number;
  data: string;               // 原始数据
  timestamp: Date;
  createdAt: Date;
}

/**
 * 解析后的数据记录
 */
export interface ParsedDataDocument {
  _id: ObjectId;
  mac: string;
  pid: number;
  protocol: string;
  name: string;               // 参数名称
  value: number;              // 解析后的值
  unit?: string;              // 单位
  timestamp: Date;
  createdAt: Date;
}

/**
 * 单例数据 (最新值缓存)
 */
export interface SingleDataDocument {
  _id: ObjectId;
  mac: string;
  pid: number;
  name: string;
  value: number;
  unit?: string;
  timestamp: Date;
  updatedAt: Date;
}
```

#### Step 2.2: 创建 Schema 验证 (1 小时)

**文件**: `src/schemas/data.schema.ts`

```typescript
import { z } from 'zod';
import { MacAddressSchema } from './terminal.schema';

/**
 * 查询历史数据请求
 */
export const QueryHistoryDataSchema = z.object({
  mac: MacAddressSchema,
  pid: z.string().transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),
  name: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  start: z.string().transform((val) => new Date(parseInt(val, 10))),
  end: z.string().transform((val) => new Date(parseInt(val, 10))),
  aggregate: z.string().optional()
    .transform((val) => val === 'true')
    .pipe(z.boolean()),
});
export type QueryHistoryData = z.infer<typeof QueryHistoryDataSchema>;

/**
 * 刷新超时请求
 */
export const RefreshTimeoutRequestSchema = z.object({
  data: z.object({
    interval: z.number().int().positive().optional(),
  }),
});
export type RefreshTimeoutRequest = z.infer<typeof RefreshTimeoutRequestSchema>;
```

#### Step 2.3: 实现 Data Service (3 小时)

**文件**: `src/services/data.service.ts`

实现数据查询的核心业务逻辑。

#### Step 2.4: 实现 Data Controller (3 小时)

**文件**: `src/controllers/data.controller.ts`

实现所有 6 个数据查询 API 端点。

#### Step 2.5: 编写测试 (2 小时)

创建 DataService 单元测试和 Data API 集成测试。

---

### 第 3 天: 告警和协议 API (8-10 小时)

#### Step 3.1: 扩展告警实体 (1 小时)

基于现有的 `alarm.entity.ts` 扩展缺失字段。

#### Step 3.2: 创建 Schema (1 小时)

创建 `alarm.schema.ts` 和 `protocol.schema.ts`。

#### Step 3.3: 实现告警 Service 和 Controller (3 小时)

实现告警管理的 5 个 API 端点。

#### Step 3.4: 实现协议 Service 和 Controller (2 小时)

实现协议管理的 4 个 API 端点。

#### Step 3.5: 编写测试 (2 小时)

---

### 第 4 天: 用户配置 API 和集成测试 (8 小时)

#### Step 4.1: 实现配置 Service 和 Controller (3 小时)

实现用户配置的 3 个 API 端点。

#### Step 4.2: 端到端集成测试 (3 小时)

创建完整的 API 流程测试。

#### Step 4.3: API 文档生成 (2 小时)

使用 Swagger/OpenAPI 生成 API 文档。

---

## 测试计划

### 单元测试

**目标覆盖率**: 80%+

**测试文件**:
- `test/unit/terminal.service.test.ts` (15 tests)
- `test/unit/data.service.test.ts` (12 tests)
- `test/unit/alarm.service.test.ts` (10 tests)
- `test/unit/protocol.service.test.ts` (8 tests)
- `test/unit/config.service.test.ts` (6 tests)

### 集成测试

**测试文件**:
- `test/integration/terminal.api.test.ts` (20 tests)
- `test/integration/data.api.test.ts` (15 tests)
- `test/integration/alarm.api.test.ts` (12 tests)
- `test/integration/protocol.api.test.ts` (10 tests)
- `test/integration/config.api.test.ts` (8 tests)

### 端到端测试

**测试场景**:
1. 用户登录 → 获取设备列表 → 查看设备数据
2. 用户绑定设备 → 配置告警 → 接收告警
3. 用户修改协议配置 → 验证生效
4. 管理员查询所有数据

---

## 验收标准

### 功能完整性

- ✅ 所有 26 个 API 端点正常工作
- ✅ 认证和权限控制正确
- ✅ 数据验证完整
- ✅ 错误处理完善

### 测试覆盖

- ✅ 单元测试覆盖率 > 80%
- ✅ 集成测试覆盖所有端点
- ✅ 端到端测试覆盖主要场景

### 性能指标

- ✅ API 响应时间 P95 < 200ms
- ✅ 并发请求支持 > 1000 req/s
- ✅ 内存占用 < 300MB

### 文档完整性

- ✅ API 文档完整（Swagger/OpenAPI）
- ✅ 代码注释清晰
- ✅ 使用示例完整

### 兼容性

- ✅ 与老系统 API 行为一致
- ✅ 前端无需大改
- ✅ 支持平滑迁移

---

## 附录

### A. 老系统 API 端点映射表

| 老系统端点 | 新系统端点 | HTTP 方法 | 状态 |
|-----------|-----------|----------|------|
| `/api/BindDev` | `/api/terminals` | GET | 🎯 待实现 |
| `/api/getTerminal` | `/api/terminals/:mac` | GET | 🎯 待实现 |
| `/api/modifyTerminal` | `/api/terminals/:mac` | PUT | 🎯 待实现 |
| `/api/addUserTerminal` | `/api/terminals/:mac/bind` | POST | 🎯 待实现 |
| `/api/delUserTerminal` | `/api/terminals/:mac/bind` | DELETE | 🎯 待实现 |
| `/api/addTerminalMountDev` | `/api/terminals/:mac/devices` | POST | 🎯 待实现 |
| `/api/delTerminalMountDev` | `/api/terminals/:mac/devices/:pid` | DELETE | 🎯 待实现 |
| `/api/getTerminalOnline` | `/api/terminals/:mac/status` | GET | 🎯 待实现 |
| `/api/getTerminalData` | `/api/data/latest/:mac/:pid` | GET | 🎯 待实现 |
| `/api/getTerminalDatasV2` | `/api/data/history/:mac/:pid` | GET | 🎯 待实现 |
| `/api/loguartterminaldatatransfinites` | `/api/alarms` | GET | 🎯 待实现 |
| `/api/confrimAlarm` | `/api/alarms/:id/confirm` | POST | 🎯 待实现 |
| `/api/getAlarmunconfirmed` | `/api/alarms/unconfirmed/count` | GET | 🎯 待实现 |
| `/api/getUserAlarmSetup` | `/api/alarms/config` | GET | 🎯 待实现 |
| `/api/modifyUserAlarmSetupTel` | `/api/alarms/config/contacts` | PUT | 🎯 待实现 |
| `/api/getProtocol` | `/api/protocols/:protocol` | GET | 🎯 待实现 |
| `/api/getAlarmProtocol` | `/api/protocols/:protocol/alarm-config` | GET | 🎯 待实现 |
| `/api/getUserAlarmProtocol` | `/api/protocols/:protocol/user-config` | GET | 🎯 待实现 |
| `/api/setUserSetupProtocol` | `/api/protocols/:protocol/user-config` | PUT | 🎯 待实现 |
| `/api/getUserLayout` | `/api/config/layout/:id` | GET | 🎯 待实现 |
| `/api/setUserLayout` | `/api/config/layout/:id` | PUT | 🎯 待实现 |
| `/api/getAggregation` | `/api/config/aggregation/:id` | GET | 🎯 待实现 |

### B. 数据库集合清单

**MongoDB 集合**:
- `terminals` - 终端信息
- `users` - 用户信息
- `alarm.rules` - 告警规则
- `alarm.logs` - 告警日志
- `notification.logs` - 通知日志
- `protocols` - 协议定义
- `user.layouts` - 用户布局配置
- `user.aggregations` - 用户聚合配置
- `data.records` - 原始数据记录
- `data.parsed` - 解析数据记录
- `data.single` - 单例数据（最新值）

### C. 依赖的 Service

**已实现**:
- ✅ `UserService` (Phase 4.1)
- ✅ `AlarmNotificationService` (Phase 3.2)
- ✅ `QueueService` (Phase 3.1)

**需新增**:
- ✅ `TerminalApiService` (Day 1 已完成)
- 🎯 `DataService`
- 🎯 `ProtocolService`
- 🎯 `ConfigService`

**需扩展**:
- 🔧 `AlarmService` (增加查询和确认功能)

---

## 📝 更新日志

### 2025-12-23
- ✅ **Day 1 完成**: 设备管理 API 模块
  - 实现 8 个终端管理 RESTful 端点
  - 创建完整的实体、Schema、Service、Controller 层
  - 编写 84 个单元测试，全部通过
  - 实际工时: ~6 小时 (计划 8-10 小时)

---

**文档版本**: 1.1
**创建日期**: 2025-12-23
**最后更新**: 2025-12-23 (Day 1 完成)
**下次更新**: Day 2 数据 API 模块开始时
