# Alarm Rules API Documentation

**Version**: 1.0
**Base URL**: `/api/alarm-rules`
**Last Updated**: 2025-12-19

---

## 📋 API 概述

告警规则管理 API 提供完整的 CRUD 操作，支持规则的创建、查询、更新、删除以及启用/禁用控制。

### 响应格式

所有 API 返回统一的响应格式：

```typescript
{
  status: 'ok' | 'error',
  message?: string,       // 错误消息或操作描述
  data: T | null          // 响应数据
}
```

---

## 📚 API 端点

### 1. 获取规则列表

**GET** `/api/alarm-rules`

获取告警规则列表，支持多条件过滤和分页。

#### 查询参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `type` | string | 否 | - | 规则类型：`threshold`, `constant`, `offline`, `timeout`, `custom` |
| `level` | string | 否 | - | 告警级别：`info`, `warning`, `error`, `critical` |
| `enabled` | string | 否 | - | 是否启用：`true`, `false` |
| `protocol` | string | 否 | - | 协议名称 |
| `limit` | string | 否 | `50` | 每页数量 (1-100) |
| `page` | string | 否 | `1` | 页码 (从 1 开始) |

#### 请求示例

```bash
# 获取所有启用的阈值规则
GET /api/alarm-rules?type=threshold&enabled=true&limit=20&page=1

# 获取 modbus 协议的所有规则
GET /api/alarm-rules?protocol=modbus
```

#### 响应示例

```json
{
  "status": "ok",
  "data": {
    "rules": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "name": "温度超限告警",
        "description": "检测温度是否超过阈值",
        "type": "threshold",
        "level": "warning",
        "protocol": "modbus",
        "pid": "device-1",
        "paramName": "temperature",
        "threshold": {
          "min": -10,
          "max": 80
        },
        "enabled": true,
        "deduplicationWindow": 300,
        "triggerCount": 42,
        "lastTriggeredAt": "2025-12-19T06:30:00.000Z",
        "createdBy": "admin",
        "createdAt": "2025-12-01T00:00:00.000Z",
        "updatedAt": "2025-12-19T06:30:00.000Z"
      }
    ],
    "total": 15,
    "page": 1,
    "limit": 20,
    "hasMore": false
  }
}
```

---

### 2. 获取规则详情

**GET** `/api/alarm-rules/:id`

根据 ID 获取单个规则的详细信息。

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 规则 ID (MongoDB ObjectId) |

#### 请求示例

```bash
GET /api/alarm-rules/507f1f77bcf86cd799439011
```

#### 响应示例

```json
{
  "status": "ok",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "温度超限告警",
    "description": "检测温度是否超过阈值",
    "type": "threshold",
    "level": "warning",
    "protocol": "modbus",
    "paramName": "temperature",
    "threshold": {
      "min": -10,
      "max": 80
    },
    "enabled": true,
    "deduplicationWindow": 300,
    "triggerCount": 42,
    "lastTriggeredAt": "2025-12-19T06:30:00.000Z",
    "createdBy": "admin",
    "createdAt": "2025-12-01T00:00:00.000Z",
    "updatedAt": "2025-12-19T06:30:00.000Z"
  }
}
```

#### 错误响应

```json
{
  "status": "error",
  "message": "Invalid rule ID format",
  "data": null
}
```

```json
{
  "status": "error",
  "message": "Rule not found",
  "data": null
}
```

---

### 3. 创建规则

**POST** `/api/alarm-rules`

创建新的告警规则。

#### 请求体

```typescript
{
  data: {
    name: string;              // 规则名称 (必填)
    description?: string;      // 规则描述
    type: AlarmRuleType;       // 规则类型 (必填)
    level: AlarmLevel;         // 告警级别 (必填)
    protocol?: string;         // 目标协议
    pid?: string | number;     // 设备 PID
    paramName?: string;        // 参数名称
    threshold?: {              // 阈值条件 (threshold 类型必填)
      min: number;
      max: number;
    };
    constant?: {               // 常量条件 (constant 类型必填)
      alarmStat: string[];
    };
    customScript?: string;     // 自定义脚本 (custom 类型)
    deduplicationWindow?: number; // 去重窗口(秒), 默认 300
    createdBy: string;         // 创建人 (必填)
  }
}
```

#### 请求示例

```json
{
  "data": {
    "name": "温度超限告警",
    "description": "检测温度是否超过阈值",
    "type": "threshold",
    "level": "warning",
    "protocol": "modbus",
    "pid": "device-1",
    "paramName": "temperature",
    "threshold": {
      "min": -10,
      "max": 80
    },
    "deduplicationWindow": 300,
    "createdBy": "admin"
  }
}
```

#### 响应示例

```json
{
  "status": "ok",
  "message": "Rule created successfully",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "name": "温度超限告警",
    "description": "检测温度是否超过阈值",
    "type": "threshold",
    "level": "warning",
    "protocol": "modbus",
    "pid": "device-1",
    "paramName": "temperature",
    "threshold": {
      "min": -10,
      "max": 80
    },
    "enabled": true,
    "deduplicationWindow": 300,
    "triggerCount": 0,
    "createdBy": "admin",
    "createdAt": "2025-12-19T08:00:00.000Z",
    "updatedAt": "2025-12-19T08:00:00.000Z"
  }
}
```

#### 错误响应

```json
{
  "status": "error",
  "message": "Rule name is required",
  "data": null
}
```

```json
{
  "status": "error",
  "message": "Threshold condition is required for threshold rule",
  "data": null
}
```

---

### 4. 更新规则

**PUT** `/api/alarm-rules/:id`

更新现有规则的信息。

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 规则 ID |

#### 请求体

```typescript
{
  data: {
    name?: string;
    description?: string;
    level?: AlarmLevel;
    protocol?: string;
    pid?: string | number;
    paramName?: string;
    threshold?: {
      min: number;
      max: number;
    };
    constant?: {
      alarmStat: string[];
    };
    customScript?: string;
    deduplicationWindow?: number;
    enabled?: boolean;
    updatedBy?: string;
  }
}
```

#### 请求示例

```json
{
  "data": {
    "description": "更新后的描述",
    "level": "error",
    "threshold": {
      "min": -5,
      "max": 75
    },
    "updatedBy": "admin"
  }
}
```

#### 响应示例

```json
{
  "status": "ok",
  "message": "Rule updated successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "温度超限告警",
    "description": "更新后的描述",
    "type": "threshold",
    "level": "error",
    "threshold": {
      "min": -5,
      "max": 75
    },
    "enabled": true,
    "updatedBy": "admin",
    "updatedAt": "2025-12-19T08:30:00.000Z"
  }
}
```

---

### 5. 删除规则

**DELETE** `/api/alarm-rules/:id`

删除指定的规则。

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 规则 ID |

#### 请求示例

```bash
DELETE /api/alarm-rules/507f1f77bcf86cd799439011
```

#### 响应示例

```json
{
  "status": "ok",
  "message": "Rule deleted successfully",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "deletedAt": "2025-12-19T09:00:00.000Z"
  }
}
```

---

### 6. 启用规则

**POST** `/api/alarm-rules/:id/enable`

启用指定的规则。

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 规则 ID |

#### 请求体 (可选)

```json
{
  "userId": "admin"
}
```

#### 响应示例

```json
{
  "status": "ok",
  "message": "Rule enabled successfully",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "enabled": true
  }
}
```

---

### 7. 禁用规则

**POST** `/api/alarm-rules/:id/disable`

禁用指定的规则。

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 规则 ID |

#### 请求体 (可选)

```json
{
  "userId": "admin"
}
```

#### 响应示例

```json
{
  "status": "ok",
  "message": "Rule disabled successfully",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "enabled": false
  }
}
```

---

### 8. 批量启用规则

**POST** `/api/alarm-rules/batch/enable`

批量启用多个规则。

#### 请求体

```json
{
  "ids": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"],
  "userId": "admin"
}
```

#### 响应示例

```json
{
  "status": "ok",
  "message": "Batch enable completed",
  "data": {
    "total": 2,
    "succeeded": 2,
    "failed": 0,
    "results": [
      { "id": "507f1f77bcf86cd799439011", "success": true },
      { "id": "507f1f77bcf86cd799439012", "success": true }
    ]
  }
}
```

---

### 9. 批量禁用规则

**POST** `/api/alarm-rules/batch/disable`

批量禁用多个规则。

#### 请求体

```json
{
  "ids": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"],
  "userId": "admin"
}
```

#### 响应示例

```json
{
  "status": "ok",
  "message": "Batch disable completed",
  "data": {
    "total": 2,
    "succeeded": 2,
    "failed": 0,
    "results": [
      { "id": "507f1f77bcf86cd799439011", "success": true },
      { "id": "507f1f77bcf86cd799439012", "success": true }
    ]
  }
}
```

---

### 10. 获取规则统计

**GET** `/api/alarm-rules/stats`

获取规则统计信息，包括总数、启用/禁用数、按类型和级别分组统计、触发次数统计等。

#### 请求示例

```bash
GET /api/alarm-rules/stats
```

#### 响应示例

```json
{
  "status": "ok",
  "data": {
    "total": 25,
    "enabled": 20,
    "disabled": 5,
    "byType": {
      "threshold": 15,
      "constant": 8,
      "offline": 1,
      "timeout": 1,
      "custom": 0
    },
    "byLevel": {
      "info": 5,
      "warning": 12,
      "error": 6,
      "critical": 2
    },
    "totalTriggers": 1250,
    "mostTriggered": [
      {
        "id": "507f1f77bcf86cd799439011",
        "name": "温度超限告警",
        "triggerCount": 350
      },
      {
        "id": "507f1f77bcf86cd799439012",
        "name": "湿度异常告警",
        "triggerCount": 280
      },
      {
        "id": "507f1f77bcf86cd799439013",
        "name": "压力过高告警",
        "triggerCount": 220
      }
    ]
  }
}
```

---

## 📊 数据类型定义

### AlarmRuleType

规则类型枚举：

- `threshold` - 阈值规则（数值范围检查）
- `constant` - 常量规则（枚举值检查）
- `offline` - 离线规则（设备离线检测）
- `timeout` - 超时规则（响应超时检测）
- `custom` - 自定义规则（脚本执行）

### AlarmLevel

告警级别枚举：

- `info` - 信息
- `warning` - 警告
- `error` - 错误
- `critical` - 严重

### ThresholdCondition

阈值条件：

```typescript
{
  min: number;  // 最小值
  max: number;  // 最大值
}
```

值应该在 `[min, max]` 范围内，否则触发告警。

### ConstantCondition

常量条件：

```typescript
{
  alarmStat: string[];  // 正常值列表
}
```

值不在 `alarmStat` 列表中时触发告警。

---

## 🔒 认证和授权

当前 API 暂未实现认证机制。在生产环境中，建议：

1. 添加 JWT 认证中间件
2. 实现基于角色的访问控制 (RBAC)
3. 限制敏感操作（创建、更新、删除）的权限

---

## ⚠️ 错误码

| HTTP 状态码 | status | message | 说明 |
|------------|--------|---------|------|
| 200 | ok | - | 请求成功 |
| 200 | error | "Invalid rule ID format" | 规则 ID 格式无效 |
| 200 | error | "Rule not found" | 规则不存在 |
| 200 | error | "Rule name is required" | 缺少必填字段 |
| 200 | error | "Threshold condition is required for threshold rule" | 规则类型与条件不匹配 |
| 500 | error | "Failed to ..." | 服务器内部错误 |

**注意**：当前所有响应都返回 HTTP 200，错误通过 `status` 字段区分。建议在生产环境中使用标准 HTTP 状态码。

---

## 📝 使用示例

### 创建阈值规则

```bash
curl -X POST http://localhost:3000/api/alarm-rules \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "name": "温度超限告警",
      "type": "threshold",
      "level": "warning",
      "protocol": "modbus",
      "paramName": "temperature",
      "threshold": {
        "min": -10,
        "max": 80
      },
      "createdBy": "admin"
    }
  }'
```

### 创建常量规则

```bash
curl -X POST http://localhost:3000/api/alarm-rules \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "name": "设备状态异常",
      "type": "constant",
      "level": "error",
      "protocol": "modbus",
      "paramName": "status",
      "constant": {
        "alarmStat": ["0", "1", "2"]
      },
      "createdBy": "admin"
    }
  }'
```

### 查询并过滤规则

```bash
# 获取所有启用的警告级别规则
curl "http://localhost:3000/api/alarm-rules?enabled=true&level=warning"

# 获取 modbus 协议的阈值规则
curl "http://localhost:3000/api/alarm-rules?protocol=modbus&type=threshold"
```

### 更新规则级别

```bash
curl -X PUT http://localhost:3000/api/alarm-rules/507f1f77bcf86cd799439011 \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "level": "critical",
      "updatedBy": "admin"
    }
  }'
```

### 批量启用规则

```bash
curl -X POST http://localhost:3000/api/alarm-rules/batch/enable \
  -H "Content-Type: application/json" \
  -d '{
    "ids": [
      "507f1f77bcf86cd799439011",
      "507f1f77bcf86cd799439012",
      "507f1f77bcf86cd799439013"
    ],
    "userId": "admin"
  }'
```

---

## 🔗 相关文档

- [数据库架构文档](./DATABASE_ARCHITECTURE.md)
- [服务层集成文档](./SERVICE_LAYER_INTEGRATION.md)
- [AlarmRuleEngineService 源码](../src/services/alarm-rule-engine.service.ts)
- [AlarmRulesController 源码](../src/controllers/alarm-rules.controller.ts)

---

**文档版本**: 1.0
**最后更新**: 2025-12-19
**维护者**: Development Team
