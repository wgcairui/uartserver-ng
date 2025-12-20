# 新老系统通知服务对比分析

**分析日期**: 2025-12-19
**分析人**: Claude Code
**老系统**: midwayuartserver (Midway.js + BullMQ)
**新系统**: uartserver-ng (Fastify + SQLite Queue)

---

## 📊 总体对比

| 维度 | 老系统 | 新系统 | 状态 |
|-----|-------|-------|------|
| **短信服务** | @alicloud/pop-core SDK | 原生 fetch + HMAC-SHA1 | ⚠️ 功能缺失 |
| **邮件服务** | Nodemailer (QQ邮箱) | Nodemailer (通用SMTP) | ⚠️ 配置差异 |
| **微信服务** | 模板消息 + 固定参数 | 模板消息（参数灵活） | ⚠️ 缺少默认值 |
| **日志记录** | ✅ 完整日志服务 | ❌ 缺失 | ❌ 严重遗漏 |
| **队列系统** | BullMQ (Redis) | SQLite Queue | ✅ 已实现 |
| **告警类型** | 6种告警类型 | 通用告警处理 | ✅ 已实现 |

---

## 🔍 详细差异分析

### 1. 短信服务对比

#### 老系统 (`src/service/sms.service.ts`)

```typescript
// 使用阿里云官方 SDK
import * as core from '@alicloud/pop-core';

this.app = new core({
  accessKeyId: this.config.appid,
  accessKeySecret: this.config.secret,
  endpoint: 'https://dysmsapi.aliyuncs.com',
  apiVersion: '2017-05-25',
});

// 调用方式
await this.app.request<SmsResult>('SendSms', params, {
  method: 'POST',
});
```

**关键特性**:
- ✅ 使用官方 SDK（稳定可靠）
- ✅ 手机号验证（`isPhoneNumber(tel, 'CN')`）
- ✅ 固定签名：'雷迪司科技湖北有限公司'
- ✅ 固定区域：'cn-hangzhou'
- ✅ 日志记录（`logSmsService.save()`）
- ✅ 短信模板代码：
  - SMS_190275627 - 验证码
  - SMS_200701321 - 设备超时/恢复
  - SMS_200691431 - 设备离线/上线
  - SMS_200701342 - 参数告警

#### 新系统 (`src/services/notification/sms.service.ts`)

```typescript
// 使用原生 fetch + 手动签名
const response = await fetch(url, { method: 'GET' });

private generateSignature(params: Record<string, string>): string {
  // HMAC-SHA1 签名
  const hmac = createHmac('sha1', `${this.accessKeySecret}&`);
  hmac.update(stringToSign);
  return hmac.digest('base64');
}
```

**关键特性**:
- ✅ 零依赖（使用原生 API）
- ❌ 没有手机号验证
- ❌ 没有固定签名和区域
- ❌ 没有日志记录
- ⚠️ 签名算法正确，但缺少业务逻辑

**差异总结**:

| 功能 | 老系统 | 新系统 | 影响 |
|-----|-------|-------|------|
| SDK | @alicloud/pop-core | 手动实现 | 新系统更轻量，但需确保签名正确性 |
| 手机号验证 | ✅ | ❌ | **高危**：可能发送到无效号码 |
| SignName | 固定 | 参数传入 | **中危**：缺少默认值 |
| RegionId | 固定 | 参数传入 | **中危**：缺少默认值 |
| 日志记录 | ✅ | ❌ | **高危**：无法追踪发送历史 |
| 模板代码 | 硬编码 | 参数传入 | **低危**：需在调用处指定 |

---

### 2. 邮件服务对比

#### 老系统 (`src/service/email.service.ts`)

```typescript
// 使用 QQ 邮箱服务
this.app = createTransport({
  service: 'QQ', // 内置QQ邮箱配置
  auth: {
    user: this.config.appid,  // 260338538@qq.com
    pass: this.config.secret,
  },
});

// 发件人自动追加邮箱地址
mailOptions.from += ' <260338538@qq.com>';
```

**关键特性**:
- ✅ 使用 QQ 邮箱（service: 'QQ'）
- ✅ 固定发件邮箱：260338538@qq.com
- ✅ from 字段自动追加邮箱地址
- ✅ 日志记录（`logMailService.save()`）

#### 新系统 (`src/services/notification/email.service.ts`)

```typescript
// 使用通用 SMTP 配置
this.smtpConfig = {
  host: options?.smtpHost,
  port: options?.smtpPort || 587,
  secure: port === 465,
  auth: { user, pass },
};

// Nodemailer 懒加载
const nodemailer = await import('nodemailer');
this.transporter = nodemailer.createTransport(this.smtpConfig);
```

**关键特性**:
- ✅ 支持通用 SMTP 配置
- ✅ 懒加载优化
- ❌ 没有 QQ 邮箱快捷配置
- ❌ 没有日志记录
- ⚠️ from 字段需要完整配置

**差异总结**:

| 功能 | 老系统 | 新系统 | 影响 |
|-----|-------|-------|------|
| SMTP 配置 | QQ 邮箱 (内置) | 通用 SMTP | 新系统更灵活 |
| 发件人邮箱 | 固定 260338538@qq.com | 参数传入 | **中危**：需配置 |
| from 追加邮箱 | ✅ 自动追加 | ❌ 需完整配置 | **低危**：调用处需注意 |
| 日志记录 | ✅ | ❌ | **高危**：无法追踪发送历史 |
| 懒加载 | ❌ | ✅ | 新系统优化更好 |

---

### 3. 微信服务对比

#### 老系统 (`src/service/wx.public.service.ts`)

```typescript
// 在 send.alarm.processor.ts 中
this.bullService.wxPublicMessageBull.add(bullName, {
  ...postData,
  template_id: 'rIFS7MnXotNoNifuTfFpfh4vFGzCGlhh-DmWZDcXpWg', // 固定模板ID
  miniprogram: {
    appid: 'wx38800d0139103920',  // 固定小程序ID
    pagepath: '/pages/index/alarm/alarm',  // 固定跳转路径
  },
});

// 发送模板消息
async SendSubscribeMessageDevAlarm(postData: Uart.WX.wxsubscribeMessage) {
  const url = `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${await this.getToken()}`;
  return await fetch({ url, method: 'POST', data: postData });
}
```

**关键特性**:
- ✅ 固定模板 ID：'rIFS7MnXotNoNifuTfFpfh4vFGzCGlhh-DmWZDcXpWg'
- ✅ 固定小程序配置：appid 和 pagepath
- ✅ Access Token 管理（`getToken()`）
- ✅ 日志记录（`log.wx.subscribe.service`）

#### 新系统 (`src/services/notification/wechat.service.ts`)

```typescript
// 完全参数化
async sendTemplateMessage(params: WechatTemplateParams): Promise<WechatApiResponse> {
  const accessToken = await this.getAccessToken();
  const url = `${this.baseUrl}/cgi-bin/message/template/send?access_token=${accessToken}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  return await response.json();
}
```

**关键特性**:
- ✅ Access Token 缓存（7200s - 300s 缓冲）
- ✅ 完全参数化（灵活性高）
- ❌ 没有固定模板 ID 和小程序配置
- ❌ 没有日志记录
- ⚠️ 调用处需要传入所有参数

**差异总结**:

| 功能 | 老系统 | 新系统 | 影响 |
|-----|-------|-------|------|
| template_id | 固定硬编码 | 参数传入 | **高危**：必须在调用处指定 |
| miniprogram | 固定硬编码 | 参数传入 | **高危**：必须在调用处指定 |
| Access Token | ✅ 缓存 | ✅ 缓存 | 实现一致 |
| 日志记录 | ✅ | ❌ | **高危**：无法追踪发送历史 |
| 灵活性 | 低 | 高 | 新系统更灵活 |

---

### 4. 告警发送处理器对比

#### 老系统 (`src/service/processor/send.alarm.processor.ts`)

```typescript
// 6种告警类型
switch (job.name) {
  case QUEUE_ALARM_TYPE.TIME_OUT_ALARM:      // 设备超时告警
  case QUEUE_ALARM_TYPE.OFFLINE:             // 设备离线
  case QUEUE_ALARM_TYPE.ARGUMENT_ALARM:      // 参数告警
  case QUEUE_ALARM_TYPE.ARGUMENT_ALARM_RELOAD: // 告警恢复
  case QUEUE_ALARM_TYPE.MAC_ON_OFF_LINE:     // 设备上下线
  case QUEUE_ALARM_TYPE.ICCID_EXPIRE:        // ICCID即将失效
}

// 通知渠道优先级
if (wxId) {
  return this.sendWxPublicMessage(...);  // 优先微信
}
if (tels) {
  return this.sendSmsMessage(...);       // 其次短信
}
if (mails) {
  return this.sendMailMessage(...);      // 最后邮件
}
```

**关键特性**:
- ✅ 6种告警类型明确区分
- ✅ 每种告警有特定的消息格式
- ✅ 通知渠道有优先级（微信 > 短信 > 邮件）
- ✅ 固定的模板参数和格式

#### 新系统 (`src/services/alarm-notification.service.ts`)

```typescript
// 通用告警处理
async sendAlarmNotification(
  userId: ObjectId,
  alarm: AlarmDocument,
  channels: NotificationChannel[]
): Promise<void> {
  // 根据 channels 参数发送通知
  for (const channel of channels) {
    switch (channel) {
      case 'wechat': await this.sendWeChatNotification(...); break;
      case 'sms': await this.sendSmsNotification(...); break;
      case 'email': await this.sendEmailNotification(...); break;
    }
  }
}
```

**关键特性**:
- ✅ 通用告警处理（不区分类型）
- ✅ 支持多渠道同时发送
- ⚠️ 没有明确的告警类型枚举
- ⚠️ 消息格式在调用处组装

**差异总结**:

| 功能 | 老系统 | 新系统 | 影响 |
|-----|-------|-------|------|
| 告警类型 | 6种明确类型 | 通用处理 | **中危**：需在调用处区分 |
| 消息格式 | 每种类型固定 | 调用处组装 | **中危**：需确保格式一致 |
| 渠道优先级 | 微信>短信>邮件 | 无优先级 | **低危**：设计差异 |
| 固定参数 | template_id等 | 无固定参数 | **高危**：需在调用处指定 |

---

## ❌ 关键遗漏功能

### 1. 日志记录（严重遗漏）⭐⭐⭐

**老系统**:
- `LogSmsService` - 短信发送日志
- `LogMailService` - 邮件发送日志
- `LogWxSubscribeService` - 微信推送日志

**MongoDB 实体**:
```typescript
// src/mongo_entity/log.ts
class SmsSend {
  tels: string[];          // 接收手机号列表
  sendParams: any;         // 发送参数
  Success?: any;           // 成功响应
  Error?: any;             // 失败响应
  timeStamp: number;       // 时间戳
}

class MailSend {
  mails: string[];         // 接收邮箱列表
  sendParams: any;         // 发送参数
  Success?: any;           // 成功响应
  Error?: any;             // 失败响应
  timeStamp: number;       // 时间戳
}

class wxsubscribeMessage {
  touser: string;          // 接收者OpenID
  template_id: string;     // 模板ID
  data: any;               // 消息数据
  timeStamp: number;       // 时间戳
  Success?: any;           // 成功响应
  Error?: any;             // 失败响应
}
```

**新系统**: ❌ 完全缺失

**影响**:
- ❌ 无法追踪通知发送历史
- ❌ 无法统计发送成功率
- ❌ 无法排查发送失败原因
- ❌ 无法审计通知记录

**修复优先级**: 🔴 **极高** - 生产环境必须

---

### 2. 短信服务固定参数（高危）⭐⭐⭐

**老系统**:
```typescript
const params: params = {
  RegionId: 'cn-hangzhou',            // 固定区域
  SignName: '雷迪司科技湖北有限公司', // 固定签名
  PhoneNumbers: tels.join(','),
  TemplateCode: '...',
  TemplateParam: '...',
};
```

**新系统**: ❌ 缺少默认值

**影响**:
- ❌ 每次调用必须手动指定 RegionId
- ❌ 每次调用必须手动指定 SignName
- ⚠️ 容易遗漏或填错

**修复优先级**: 🔴 **高** - 功能性缺陷

---

### 3. 手机号验证（高危）⭐⭐⭐

**老系统**:
```typescript
const tels = params.PhoneNumbers.toString()
  .split(',')
  .filter(tel => isPhoneNumber(tel, 'CN'));

if (tels.length === 0) {
  return;  // 没有有效号码，直接返回
}
```

**新系统**: ❌ 缺失

**影响**:
- ❌ 可能发送到无效手机号（浪费费用）
- ❌ API 调用失败（无效号码）
- ❌ 没有容错机制

**修复优先级**: 🔴 **高** - 成本和稳定性

---

### 4. 微信固定参数（高危）⭐⭐⭐

**老系统**:
```typescript
{
  template_id: 'rIFS7MnXotNoNifuTfFpfh4vFGzCGlhh-DmWZDcXpWg',
  miniprogram: {
    appid: 'wx38800d0139103920',
    pagepath: '/pages/index/alarm/alarm',
  },
}
```

**新系统**: ❌ 缺少默认值

**影响**:
- ❌ 每次调用必须手动指定 template_id
- ❌ 每次调用必须手动指定 miniprogram
- ⚠️ 调用处代码冗长

**修复优先级**: 🔴 **高** - 功能性缺陷

---

### 5. 邮件发件人配置（中危）⭐⭐

**老系统**:
```typescript
mailOptions.from += ' <260338538@qq.com>';  // 自动追加邮箱地址
```

**新系统**: ❌ 需要完整配置

**影响**:
- ⚠️ 调用处需要完整配置 from 字段
- ⚠️ 容易遗漏邮箱地址

**修复优先级**: 🟡 **中** - 配置问题

---

## 🔧 修复建议

### 优先级 1: 补充日志记录功能（必须）

#### 1.1 创建通知日志实体

```typescript
// src/entities/mongodb/notification-log.entity.ts
export interface NotificationLogDocument {
  _id?: ObjectId;
  type: 'wechat' | 'sms' | 'email';
  userId: ObjectId;
  alarmId?: ObjectId;

  // 发送参数
  recipient: string | string[];  // 接收者
  params: Record<string, any>;   // 发送参数

  // 发送结果
  success: boolean;
  response?: any;
  error?: any;

  // 时间戳
  createdAt: Date;
}

export function createNotificationLog(
  type: 'wechat' | 'sms' | 'email',
  userId: ObjectId,
  recipient: string | string[],
  params: Record<string, any>,
  alarmId?: ObjectId
): NotificationLogDocument {
  return {
    type,
    userId,
    recipient,
    params,
    success: false,
    createdAt: new Date(),
    alarmId,
  };
}
```

#### 1.2 在 Phase3Collections 中添加集合

```typescript
// src/entities/mongodb/index.ts
export class Phase3Collections {
  // ... existing collections

  /** 通知日志集合 */
  public notificationLogs: Collection<NotificationLogDocument>;

  constructor(db: Db) {
    // ... existing collections
    this.notificationLogs = db.collection('notification.logs');
  }

  async createIndexes(): Promise<void> {
    // ... existing indexes

    // 通知日志索引
    await this.notificationLogs.createIndex({ userId: 1, createdAt: -1 });
    await this.notificationLogs.createIndex({ type: 1, success: 1 });
    await this.notificationLogs.createIndex({ alarmId: 1 });
  }
}
```

#### 1.3 在服务中记录日志

```typescript
// src/services/notification/wechat.service.ts
async sendTemplateMessage(params: WechatTemplateParams): Promise<WechatApiResponse> {
  try {
    const response = await wechatService.sendTemplateMessage(params);

    // 记录成功日志
    await this.logSuccess(params, response);

    return response;
  } catch (error) {
    // 记录失败日志
    await this.logError(params, error);
    throw error;
  }
}
```

---

### 优先级 2: 补充固定参数和默认值

#### 2.1 短信服务添加默认值

```typescript
// src/services/notification/sms.service.ts
export class SmsService {
  private readonly defaultRegion = 'cn-hangzhou';
  private readonly defaultSignName = '雷迪司科技湖北有限公司';

  async sendSms(
    phoneNumbers: string[],
    params: SmsParams,
    options?: {
      regionId?: string;
      signName?: string;
    }
  ): Promise<AliyunSmsResponse> {
    // 手机号验证
    const validNumbers = phoneNumbers.filter(tel => this.isValidPhoneNumber(tel));

    if (validNumbers.length === 0) {
      throw new Error('No valid phone numbers');
    }

    const requestParams = {
      Action: 'SendSms',
      PhoneNumbers: validNumbers.join(','),
      RegionId: options?.regionId || this.defaultRegion,
      SignName: params.SignName || options?.signName || this.defaultSignName,
      TemplateCode: params.TemplateCode,
      TemplateParam: params.TemplateParam,
      // ... other params
    };

    // ... send request
  }

  private isValidPhoneNumber(tel: string): boolean {
    // 中国大陆手机号验证：1 开头 + 10 位数字
    return /^1\d{10}$/.test(tel);
  }
}
```

#### 2.2 微信服务添加默认配置

```typescript
// src/config/index.ts
export const config = configSchema.parse({
  // ... existing config

  // 微信公众号配置
  WXP_ID: process.env.WXP_ID,
  WXP_SECRET: process.env.WXP_SECRET,
  WXP_TEMPLATE_ID: process.env.WXP_TEMPLATE_ID || 'rIFS7MnXotNoNifuTfFpfh4vFGzCGlhh-DmWZDcXpWg',
  WXP_MINIPROGRAM_APPID: process.env.WXP_MINIPROGRAM_APPID || 'wx38800d0139103920',
  WXP_MINIPROGRAM_PAGEPATH: process.env.WXP_MINIPROGRAM_PAGEPATH || '/pages/index/alarm/alarm',
});

// src/services/notification/wechat.service.ts
export class WechatService {
  private readonly defaultTemplateId: string;
  private readonly defaultMiniprogram: { appid: string; pagepath: string };

  constructor(options?: {
    appId?: string;
    appSecret?: string;
    mockMode?: boolean;
    templateId?: string;
    miniprogram?: { appid: string; pagepath: string };
  }) {
    // ... existing constructor

    this.defaultTemplateId = options?.templateId || config.WXP_TEMPLATE_ID;
    this.defaultMiniprogram = options?.miniprogram || {
      appid: config.WXP_MINIPROGRAM_APPID,
      pagepath: config.WXP_MINIPROGRAM_PAGEPATH,
    };
  }

  async sendTemplateMessage(
    params: Partial<WechatTemplateParams>
  ): Promise<WechatApiResponse> {
    const fullParams: WechatTemplateParams = {
      touser: params.touser!,
      template_id: params.template_id || this.defaultTemplateId,
      url: params.url,
      miniprogram: params.miniprogram || this.defaultMiniprogram,
      data: params.data!,
    };

    // ... send request with fullParams
  }
}
```

#### 2.3 邮件服务添加默认发件人

```typescript
// src/config/index.ts
export const config = configSchema.parse({
  // ... existing config

  EMAIL_ID: process.env.EMAIL_ID,
  EMAIL_SECRET: process.env.EMAIL_SECRET,
  EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME || 'Ladis透传平台',
  EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS || '260338538@qq.com',
});

// src/services/notification/email.service.ts
export class EmailService {
  private readonly defaultFrom: string;

  constructor(options?: { ... }) {
    // ... existing constructor

    this.defaultFrom = `${config.EMAIL_FROM_NAME} <${config.EMAIL_FROM_ADDRESS}>`;
  }

  async sendMail(params: EmailParams): Promise<EmailResponse> {
    const fullParams = {
      ...params,
      from: params.from || this.defaultFrom,
    };

    // ... send mail with fullParams
  }
}
```

---

### 优先级 3: 更新告警通知服务集成

```typescript
// src/services/alarm-notification.service.ts
async sendWeChatNotification(
  userId: ObjectId,
  openIds: string[],
  alarm: AlarmDocument
): Promise<void> {
  if (openIds.length === 0) return;

  const params = {
    touser: openIds[0]!,
    // template_id 和 miniprogram 现在有默认值，无需传入
    data: {
      first: {
        value: `[ ${alarm.deviceId} ] 告警通知`,
        color: '#F56C6C',
      },
      device: {
        value: alarm.deviceId,
        color: '#173177',
      },
      time: {
        value: new Date(alarm.timestamp).toLocaleString('zh-CN'),
        color: '#173177',
      },
      remark: {
        value: alarm.message,
        color: '#F56C6C',
      },
    },
  };

  // ... rest of the code
}

async sendSmsNotification(
  userId: ObjectId,
  phones: string[],
  alarm: AlarmDocument
): Promise<void> {
  if (phones.length === 0) return;

  const params: SmsParams = {
    // SignName 现在有默认值，无需传入
    TemplateCode: 'SMS_200701342',  // 根据告警类型选择
    TemplateParam: JSON.stringify({
      name: '用户名',  // 需从用户信息获取
      DTU: alarm.deviceId,
      time: new Date(alarm.timestamp).toLocaleString('zh-CN'),
      remind: alarm.message,
    }),
  };

  // RegionId 和 SignName 现在有默认值
  await smsService.sendSms(phones, params);

  // ... rest of the code
}
```

---

## 📋 修复任务清单

### 立即修复（生产必须）

- [ ] **补充通知日志记录功能**
  - [ ] 创建 `notification-log.entity.ts`
  - [ ] 在 Phase3Collections 添加 notificationLogs 集合
  - [ ] 在三个服务中添加日志记录逻辑
  - [ ] 添加日志查询 API
  - 预计工时: 4 小时

- [ ] **短信服务添加默认值**
  - [ ] 添加 defaultRegion 和 defaultSignName
  - [ ] 添加手机号验证函数
  - [ ] 更新 config 配置
  - 预计工时: 1 小时

- [ ] **微信服务添加默认值**
  - [ ] 添加 defaultTemplateId 和 defaultMiniprogram
  - [ ] 更新 config 配置
  - [ ] 修改 sendTemplateMessage 支持部分参数
  - 预计工时: 1 小时

### 推荐修复（提升稳定性）

- [ ] **邮件服务添加默认发件人**
  - [ ] 添加 defaultFrom 配置
  - [ ] 更新 config 配置
  - 预计工时: 0.5 小时

- [ ] **补充短信模板代码映射**
  - [ ] 定义告警类型到模板代码的映射
  - [ ] 在告警通知服务中使用映射
  - 预计工时: 0.5 小时

### 可选优化（长期改进）

- [ ] **统计和监控**
  - [ ] 通知发送成功率统计
  - [ ] 通知延迟监控
  - [ ] 失败原因分析
  - 预计工时: 4 小时

- [ ] **重试机制优化**
  - [ ] 基于失败原因的智能重试
  - [ ] 指数退避策略
  - 预计工时: 2 小时

---

## 📊 风险评估

| 风险项 | 风险等级 | 影响 | 修复优先级 |
|-------|---------|------|----------|
| 缺少日志记录 | 🔴 极高 | 无法追踪、审计、排查 | P0 |
| 缺少手机号验证 | 🔴 高 | 浪费费用、调用失败 | P0 |
| 缺少固定参数 | 🔴 高 | 功能缺陷、调用错误 | P0 |
| 邮件发件人配置 | 🟡 中 | 配置复杂度 | P1 |
| 短信模板映射 | 🟡 中 | 代码可维护性 | P1 |

---

## 📈 修复后预期

修复完成后，新系统将：

1. ✅ 完整的通知日志记录（与老系统一致）
2. ✅ 手机号验证机制（防止无效发送）
3. ✅ 固定参数默认值（简化调用）
4. ✅ 与老系统功能对等
5. ✅ 保持更好的灵活性和可扩展性

**建议**: 优先完成 P0 级别的修复，然后再启动 Phase 4 开发。

---

**分析完成日期**: 2025-12-19
**下一步**: 立即开始修复 P0 级别的问题
