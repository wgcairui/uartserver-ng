/**
 * Admin Log Schemas (Phase 8.6)
 *
 * 管理员日志查询 API 的验证 schemas
 */

import { t } from 'elysia';

// ============================================================================
// 查询参数 Schemas
// ============================================================================

/**
 * 日期范围查询参数
 */
export const DateRangeQuerySchema = t.Object({
  start: t.Optional(
    t.Number({
      description: '开始时间戳 (毫秒)',
      minimum: 0,
    })
  ),
  end: t.Optional(
    t.Number({
      description: '结束时间戳 (毫秒)',
      minimum: 0,
    })
  ),
});

/**
 * MAC 地址 + 日期范围查询参数
 */
export const MacDateQuerySchema = t.Object({
  mac: t.String({
    description: '设备MAC地址',
    minLength: 12,
    maxLength: 17,
  }),
  start: t.Optional(
    t.Number({
      description: '开始时间戳 (毫秒)',
      minimum: 0,
    })
  ),
  end: t.Optional(
    t.Number({
      description: '结束时间戳 (毫秒)',
      minimum: 0,
    })
  ),
});

/**
 * 用户 + 日期范围查询参数
 */
export const UserDateQuerySchema = t.Object({
  user: t.String({
    description: '用户名',
    minLength: 1,
  }),
  start: t.Optional(
    t.Number({
      description: '开始时间戳 (毫秒)',
      minimum: 0,
    })
  ),
  end: t.Optional(
    t.Number({
      description: '结束时间戳 (毫秒)',
      minimum: 0,
    })
  ),
});

/**
 * 用户告警日志查询参数
 */
export const UserAlarmQuerySchema = t.Object({
  user: t.String({
    description: '用户名',
    minLength: 1,
  }),
  start: t.Number({
    description: '开始时间戳 (毫秒)',
    minimum: 0,
  }),
  end: t.Number({
    description: '结束时间戳 (毫秒)',
    minimum: 0,
  }),
});

// ============================================================================
// 响应类型定义
// ============================================================================

/**
 * 标准日志响应
 */
export interface LogResponse<T = any> {
  status: 'ok' | 'error';
  data: T;
  message?: string;
}

/**
 * 微信事件日志项
 */
export interface WxEventLog {
  _id: string;
  timeStamp: number;
  ToUserName: string;
  FromUserName: string;
  CreateTime: string;
  MsgType: string;
  Event: string;
  EventKey?: string;
  Content?: string;
  MenuID?: string;
}

/**
 * 设备流量日志项
 */
export interface DeviceBytesLog {
  _id: string;
  timeStamp: number;
  mac: string;
  date: string;
  useBytes: number;
}

/**
 * 设备繁忙日志项
 */
export interface DeviceBusyLog {
  _id: string;
  timeStamp: number;
  mac: string;
  stat: boolean;
  n: number;
}

/**
 * 终端聚合日志项
 */
export interface TerminalAggLog {
  type: string;
  msg: string;
  timeStamp: number;
}

/**
 * 用户聚合日志项
 */
export interface UserAggLog {
  type: string;
  msg: string;
  timeStamp: number;
}

/**
 * 节点日志项
 */
export interface NodeLog {
  _id: string;
  timeStamp: number;
  ID: string;
  IP: string;
  Name: string;
  type: string;
}

/**
 * 终端日志项
 */
export interface TerminalLog {
  _id: string;
  timeStamp: number;
  NodeIP: string;
  NodeName: string;
  TerminalMac: string;
  type: string;
  msg: string;
  query?: any;
  result?: any;
}

/**
 * 短信发送日志项
 */
export interface SmsSendLog {
  _id?: string;
  timeStamp: number;
  tels: string;
  sendParams: {
    SignName: string;
    TemplateCode: string;
    TemplateParam: string;
  };
  Success?: {
    Message: string;
    RequestId: string;
    BizId: string;
    Code: string;
  };
  Error?: any;
}

/**
 * 短信发送统计项
 */
export interface SmsSendCountInfo {
  _id: string; // 手机号
  sum: number; // 发送次数
}

/**
 * 邮件发送日志项
 */
export interface MailSendLog {
  _id: string;
  timeStamp: number;
  mails: string[];
  sendParams: {
    from: string;
    to: string;
    subject: string;
    html: string;
  };
  Success?: any;
  Error?: any;
}

/**
 * 设备告警日志项
 */
export interface DeviceAlarmLog {
  _id: string;
  timeStamp: number;
  parentId: string;
  type: string;
  mac: string;
  devName: string;
  pid: number;
  protocol: string;
  tag: string;
  msg: string;
  isOk: boolean;
}

/**
 * 用户登录日志项
 */
export interface UserLoginLog {
  _id: string;
  timeStamp: number;
  user: string;
  type: string;
  address: string;
  msg: string;
  creatTime: Date;
}

/**
 * 用户请求日志项
 */
export interface UserRequestLog {
  _id: string;
  timeStamp: number;
  user: string;
  userGroup: string;
  type: string;
  argument?: any;
}

/**
 * 微信订阅消息日志项
 */
export interface WxSubscribeLog {
  _id: string;
  timeStamp: number;
  touser: string;
  template_id: string;
  url?: string;
  page?: string;
  data: any;
  result: any;
}

/**
 * 内部消息日志项
 */
export interface InnerMessageLog {
  _id: string;
  timeStamp: number;
  user?: string;
  nikeName?: string;
  mac?: string;
  pid?: number;
  data?: any;
  message: string;
}

/**
 * Bull 队列日志项
 */
export interface BullLog {
  _id: string;
  timeStamp: number;
  jobName: string;
  name: string;
  id: string;
  data?: any;
}

/**
 * 设备使用时间日志项
 */
export interface DeviceUseTimeLog {
  _id: string;
  timeStamp: number;
  mac: string;
  pid: number;
  Interval: number;
  useTime: number;
}

/**
 * 数据清理日志项
 */
export interface DataCleanLog {
  _id: string;
  timeStamp: number;
  useTime: number;
  NumUserRequest: string;
  NumClientresults: string;
  CleanClientresultsTimeOut: string;
}
