# 终端管理 API 文档

**版本**: 1.0
**创建日期**: 2025-12-23
**Phase**: 4.2 Day 1
**基础路径**: `/api/terminals`

---

## 认证要求

所有端点都需要 JWT 认证。在请求头中包含：

```
Authorization: Bearer <access_token>
```

---

## 权限说明

- **管理员**: 可以访问所有终端和执行所有操作
- **普通用户**: 只能访问自己绑定的设备（`user.devices`）

---

## 端点列表

### 1. 获取终端列表

获取当前用户绑定的终端列表，支持分页、过滤和搜索。

```http
GET /api/terminals
```

**Query 参数**:

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `page` | number | 否 | 1 | 页码（最小 1） |
| `limit` | number | 否 | 50 | 每页数量（1-100） |
| `online` | boolean | 否 | - | 过滤在线状态 |
| `share` | boolean | 否 | - | 过滤共享状态 |
| `keyword` | string | 否 | - | 搜索关键词（MAC 或名称） |

**成功响应** (200):

```json
{
  "status": "ok",
  "data": {
    "terminals": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "DevMac": "001122334455",
        "name": "测试终端",
        "online": true,
        "lastSeen": "2025-12-23T10:00:00.000Z",
        "share": false,
        "ownerId": "507f191e810c19729de860ea",
        "bindUsers": ["507f191e810c19729de860ea"],
        "mountDevs": [
          {
            "pid": 1,
            "protocol": "modbus",
            "mountDev": "01",
            "name": "温度传感器",
            "online": true
          }
        ],
        "createdAt": "2025-12-20T00:00:00.000Z",
        "updatedAt": "2025-12-23T10:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 15,
      "page": 1,
      "limit": 50,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  },
  "timestamp": "2025-12-23T10:00:00.000Z",
  "requestId": "req-123"
}
```

**权限**:
- 普通用户: 返回自己绑定的设备
- 管理员: 返回所有设备

---

### 2. 获取终端详情

获取指定 MAC 地址的终端详细信息。

```http
GET /api/terminals/:mac
```

**路径参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `mac` | string | 终端 MAC 地址（12位16进制或带冒号格式） |

**示例**:
```http
GET /api/terminals/001122334455
GET /api/terminals/00:11:22:33:44:55
```

**成功响应** (200):

```json
{
  "status": "ok",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "DevMac": "001122334455",
    "name": "测试终端",
    "ip": "192.168.1.100",
    "port": 8080,
    "jw": "116.404,39.915",
    "online": true,
    "lastSeen": "2025-12-23T10:00:00.000Z",
    "signal": 85,
    "ICCID": "89860123456789012345",
    "mountDevs": [...],
    "iccidInfo": {...},
    "createdAt": "2025-12-20T00:00:00.000Z",
    "updatedAt": "2025-12-23T10:00:00.000Z"
  },
  "timestamp": "2025-12-23T10:00:00.000Z",
  "requestId": "req-124"
}
```

**错误响应**:
- `401 Unauthorized` - 未认证
- `403 Forbidden` - 没有访问此终端的权限
- `404 Not Found` - 终端不存在

**权限**: 需要设备访问权限或管理员权限

---

### 3. 更新终端信息

更新终端的基本信息。

```http
PUT /api/terminals/:mac
```

**路径参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `mac` | string | 终端 MAC 地址 |

**请求体**:

```json
{
  "data": {
    "name": "新的终端名称",
    "jw": "116.404,39.915",
    "remark": "备注信息",
    "share": true
  }
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 否 | 终端名称（1-50字符） |
| `jw` | string | 否 | GPS坐标（格式: `经度,纬度`） |
| `remark` | string | 否 | 备注（最多200字符） |
| `share` | boolean | 否 | 是否共享设备 |

**成功响应** (200):

```json
{
  "status": "ok",
  "data": { /* 更新后的终端信息 */ },
  "message": "终端信息已更新",
  "timestamp": "2025-12-23T10:00:00.000Z",
  "requestId": "req-125"
}
```

**错误响应**:
- `400 Bad Request` - 验证失败（名称为空、GPS格式错误等）
- `403 Forbidden` - 没有权限修改此终端
- `404 Not Found` - 终端不存在

**权限**: 需要设备访问权限或管理员权限

---

### 4. 绑定终端

将终端绑定到当前用户。

```http
POST /api/terminals/:mac/bind
```

**路径参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `mac` | string | 终端 MAC 地址 |

**请求体**: 无

**成功响应** (200):

```json
{
  "status": "ok",
  "message": "终端绑定成功",
  "timestamp": "2025-12-23T10:00:00.000Z",
  "requestId": "req-126"
}
```

**错误响应**:
- `400 Bad Request` - 已绑定此终端
- `403 Forbidden` - 终端已被其他用户绑定（仅管理员可继续绑定）
- `404 Not Found` - 终端不存在

**业务逻辑**:
- 如果终端未被绑定，绑定成功后设置当前用户为设备所有者
- 如果终端已被绑定，只有管理员可以继续绑定
- 绑定操作会同时更新 `terminals.bindUsers` 和 `users.devices`

**权限**: 需要认证

---

### 5. 解绑终端

解除终端与当前用户的绑定关系。

```http
DELETE /api/terminals/:mac/bind
```

**路径参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `mac` | string | 终端 MAC 地址 |

**请求体**: 无

**成功响应** (200):

```json
{
  "status": "ok",
  "message": "终端解绑成功",
  "timestamp": "2025-12-23T10:00:00.000Z",
  "requestId": "req-127"
}
```

**错误响应**:
- `403 Forbidden` - 您没有绑定此终端

**业务逻辑**:
- 从 `terminals.bindUsers` 中移除用户 ID
- 从 `users.devices` 中移除终端 MAC
- 至少一方更新成功即返回成功

**权限**: 需要设备访问权限或管理员权限

---

### 6. 添加挂载设备

为终端添加一个挂载设备（传感器/执行器）。

```http
POST /api/terminals/:mac/devices
```

**路径参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `mac` | string | 终端 MAC 地址 |

**请求体**:

```json
{
  "data": {
    "pid": 1,
    "protocol": "modbus",
    "mountDev": "01",
    "name": "温度传感器",
    "Type": "sensor",
    "formResize": 100,
    "isState": false
  }
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `pid` | number | 是 | 设备 PID（正整数，唯一） |
| `protocol` | string | 是 | 协议 ID |
| `mountDev` | string | 是 | 挂载设备地址 |
| `name` | string | 否 | 设备名称（1-50字符） |
| `Type` | string | 否 | 设备类型 |
| `formResize` | number | 否 | 表单大小调整 |
| `isState` | boolean | 否 | 是否为状态设备 |

**成功响应** (200):

```json
{
  "status": "ok",
  "data": {
    "pid": 1,
    "protocol": "modbus",
    "mountDev": "01",
    "name": "温度传感器",
    "online": false
  },
  "message": "挂载设备已添加",
  "timestamp": "2025-12-23T10:00:00.000Z",
  "requestId": "req-128"
}
```

**错误响应**:
- `400 Bad Request` - 验证失败（PID非正整数、协议为空等）
- `403 Forbidden` - 没有访问此终端的权限
- `409 Conflict` - PID 已存在

**权限**: 需要设备访问权限或管理员权限

---

### 7. 删除挂载设备

从终端删除指定的挂载设备。

```http
DELETE /api/terminals/:mac/devices/:pid
```

**路径参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `mac` | string | 终端 MAC 地址 |
| `pid` | number | 设备 PID |

**示例**:
```http
DELETE /api/terminals/001122334455/devices/1
```

**成功响应** (200):

```json
{
  "status": "ok",
  "message": "挂载设备已删除",
  "timestamp": "2025-12-23T10:00:00.000Z",
  "requestId": "req-129"
}
```

**错误响应**:
- `403 Forbidden` - 没有访问此终端的权限
- `404 Not Found` - 挂载设备不存在

**权限**: 需要设备访问权限或管理员权限

---

### 8. 获取终端在线状态

获取终端的实时在线状态和连接信息。

```http
GET /api/terminals/:mac/status
```

**路径参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `mac` | string | 终端 MAC 地址 |

**成功响应** (200):

```json
{
  "status": "ok",
  "data": {
    "DevMac": "001122334455",
    "online": true,
    "lastSeen": "2025-12-23T10:00:00.000Z",
    "uptime": "2025-12-22T08:00:00.000Z",
    "signal": 85
  },
  "timestamp": "2025-12-23T10:00:00.000Z",
  "requestId": "req-130"
}
```

**字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `DevMac` | string | 设备 MAC 地址 |
| `online` | boolean | 在线状态 |
| `lastSeen` | string | 最后心跳时间 |
| `uptime` | string | 最后上线时间 |
| `signal` | number | 信号强度（0-100） |

**错误响应**:
- `403 Forbidden` - 没有访问此终端的权限
- `404 Not Found` - 终端不存在

**权限**: 需要设备访问权限或管理员权限

---

## 通用响应格式

### 成功响应

```json
{
  "status": "ok",
  "data": { /* 响应数据 */ },
  "message": "可选的成功消息",
  "timestamp": "2025-12-23T10:00:00.000Z",
  "requestId": "req-xxx"
}
```

### 错误响应

```json
{
  "status": "error",
  "message": "错误描述",
  "code": "ERROR_CODE",
  "timestamp": "2025-12-23T10:00:00.000Z",
  "requestId": "req-xxx"
}
```

### 常见错误码

| HTTP 状态码 | 错误码 | 说明 |
|-------------|--------|------|
| 400 | `VALIDATION_ERROR` | 请求参数验证失败 |
| 401 | `UNAUTHORIZED` | 未认证或令牌无效 |
| 403 | `DEVICE_ACCESS_DENIED` | 没有设备访问权限 |
| 403 | `INSUFFICIENT_PERMISSIONS` | 权限不足 |
| 404 | `TERMINAL_NOT_FOUND` | 终端不存在 |
| 404 | `MOUNT_DEVICE_NOT_FOUND` | 挂载设备不存在 |
| 409 | `PID_ALREADY_EXISTS` | PID 已存在 |
| 409 | `TERMINAL_ALREADY_BOUND` | 终端已被绑定 |
| 500 | `INTERNAL_SERVER_ERROR` | 服务器内部错误 |

---

## 数据模型

### Terminal 终端

```typescript
interface TerminalDocument {
  _id: ObjectId;
  DevMac: string;              // 设备 MAC 地址（唯一）
  name: string;                // 设备别名
  ip?: string;                 // 设备 IP 地址
  port?: number;               // 设备端口
  jw?: string;                 // GPS 坐标（经度,纬度）
  online: boolean;             // 在线状态
  lastSeen?: Date;             // 最后心跳时间
  uptime?: Date;               // 最后上线时间
  signal?: number;             // 信号强度
  ICCID?: string;              // 物联卡 ICCID
  share?: boolean;             // 是否共享设备
  remark?: string;             // 备注信息
  ownerId?: string;            // 设备所有者用户 ID
  bindUsers?: string[];        // 绑定用户列表
  mountDevs?: MountDevice[];   // 挂载设备列表
  iccidInfo?: IccidInfo;       // 物联卡详细信息
  createdAt: Date;             // 创建时间
  updatedAt: Date;             // 更新时间
}
```

### MountDevice 挂载设备

```typescript
interface MountDevice {
  pid: number;                 // 设备 PID（唯一）
  protocol: string;            // 协议 ID
  mountDev: string;            // 挂载设备地址
  name?: string;               // 设备名称
  Type?: string;               // 设备类型
  online?: boolean;            // 在线状态
  bindDev?: string;            // 绑定设备标识
  dataId?: string;             // 数据 ID
  formResize?: number;         // 表单大小调整
  isState?: boolean;           // 是否为状态设备
}
```

---

## 示例代码

### JavaScript (Fetch API)

```javascript
// 获取终端列表
async function getTerminals(accessToken) {
  const response = await fetch('http://localhost:3000/api/terminals?page=1&limit=20', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  const data = await response.json();
  return data;
}

// 更新终端信息
async function updateTerminal(mac, updates, accessToken) {
  const response = await fetch(`http://localhost:3000/api/terminals/${mac}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      data: updates
    })
  });

  return await response.json();
}

// 绑定终端
async function bindTerminal(mac, accessToken) {
  const response = await fetch(`http://localhost:3000/api/terminals/${mac}/bind`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  return await response.json();
}
```

### cURL

```bash
# 获取终端列表
curl -X GET "http://localhost:3000/api/terminals?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 更新终端信息
curl -X PUT "http://localhost:3000/api/terminals/001122334455" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"data":{"name":"新终端名称","jw":"116.404,39.915"}}'

# 绑定终端
curl -X POST "http://localhost:3000/api/terminals/001122334455/bind" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 添加挂载设备
curl -X POST "http://localhost:3000/api/terminals/001122334455/devices" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"data":{"pid":1,"protocol":"modbus","mountDev":"01","name":"温度传感器"}}'
```

---

## 测试状态

✅ **84 个单元测试全部通过**

- Entity 测试: 17 个
- Schema 验证测试: 41 个
- Controller 测试: 26 个
- 总断言数: 187 个

---

**文档版本**: 1.0
**最后更新**: 2025-12-23
**维护者**: Phase 4.2 开发团队
