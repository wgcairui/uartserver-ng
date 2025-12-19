/**
 * Notification Log Entity (MongoDB)
 *
 * 通知日志实体 - 对齐 midwayuartserver 日志模式
 * Collection: notification.logs
 *
 * Phase 3: 统一通知日志,对齐现有 log.smssends, log.mailsends, log.wxsubscribeMessages 模式
 */

import type { ObjectId } from 'mongodb';
import type { AlarmLevel } from './alarm.entity';

/**
 * 通知渠道 (对齐现有系统)
 */
export type NotificationChannel = 'wechat' | 'sms' | 'email' | 'webhook';

/**
 * 通知状态
 */
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'retrying';

/**
 * 短信发送参数 (对齐现有 smssendParams)
 */
export interface SmsParams {
  SignName: string;
  TemplateCode: string;
  TemplateParam: string;
}

/**
 * 邮件发送参数 (对齐现有 mailsendParams)
 */
export interface MailParams {
  from: string;
  to: string;
  subject: string;
  html: string;
}

/**
 * 微信订阅消息参数 (对齐现有 wxsubscribeMessage)
 */
export interface WechatParams {
  touser: string;
  template_id: string;
  url?: string;
  page?: string;
  data: Record<string, any>;
}

/**
 * 外部系统响应 (对齐现有 Success 结构)
 */
export interface ExternalResponse {
  /** 响应消息 */
  Message?: string;
  /** 请求 ID */
  RequestId?: string;
  /** 业务 ID (短信/微信) */
  BizId?: string;
  /** 响应代码 */
  Code?: string;
}

/**
 * 通知日志文档 (统一现有多个 log 集合)
 */
export interface NotificationLogDocument {
  /** MongoDB _id */
  _id?: ObjectId;

  /** 时间戳 (对齐现有 timeStamp) */
  timeStamp: number;

  /** 告警 ID (Phase 3 新增,关联告警) */
  alarmId?: string | ObjectId;

  /** 告警级别 (冗余,便于统计) */
  alarmLevel?: AlarmLevel;

  /** 用户 ID */
  userId: string;

  /** 通知渠道 */
  channel: NotificationChannel;

  /** 通知状态 */
  status: NotificationStatus;

  /** 接收者列表 (对齐现有 tels/mails/touser) */
  recipients: string[];

  /** 发送参数 (对应不同渠道的参数结构) */
  sendParams?: SmsParams | MailParams | WechatParams | Record<string, any>;

  /** 成功响应 (对齐现有 Success) */
  Success?: ExternalResponse;

  /** 错误信息 (对齐现有 Error) */
  Error?: any;

  /** 发送时间 */
  sentAt?: Date;

  /** 重试次数 (Phase 3 新增) */
  retryCount?: number;

  /** 最大重试次数 */
  maxRetries?: number;

  /** 下次重试时间 */
  nextRetryAt?: Date;

  /** 创建时间 */
  createdAt: Date;

  /** 更新时间 */
  updatedAt: Date;
}

/**
 * 通知日志集合名称
 */
export const NOTIFICATION_LOG_COLLECTION = 'notification.logs';

/**
 * 通知日志索引定义
 */
export const NOTIFICATION_LOG_INDEXES = [
  // 时间戳索引 (对齐现有 timeStamp 查询)
  { key: { timeStamp: -1 }, name: 'timestamp_idx' },

  // 告警查询索引
  { key: { alarmId: 1, timeStamp: -1 }, name: 'alarm_time_idx', sparse: true },

  // 用户查询索引
  { key: { userId: 1, channel: 1, timeStamp: -1 }, name: 'user_channel_time_idx' },

  // 状态查询索引
  { key: { status: 1, nextRetryAt: 1 }, name: 'status_retry_idx' },

  // 渠道统计索引
  { key: { channel: 1, status: 1, timeStamp: -1 }, name: 'channel_status_time_idx' },

  // 发送时间索引
  { key: { sentAt: -1 }, name: 'sent_at_idx', sparse: true },

  // TTL 索引 - 自动删除 30 天前的成功通知
  {
    key: { createdAt: 1 },
    name: 'ttl_success_idx',
    expireAfterSeconds: 30 * 24 * 60 * 60, // 30 天
    partialFilterExpression: { status: 'sent' },
  },
];

/**
 * 创建通知日志的辅助函数 (对齐现有 timeStamp 模式)
 */
export function createNotificationLog(
  log: Omit<
    NotificationLogDocument,
    '_id' | 'status' | 'timeStamp' | 'retryCount' | 'maxRetries' | 'createdAt' | 'updatedAt'
  >
): NotificationLogDocument {
  const now = new Date();
  return {
    ...log,
    status: 'pending',
    timeStamp: Date.now(),
    retryCount: 0,
    maxRetries: 3,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 标记通知发送成功的辅助函数 (对齐现有 Success 结构)
 */
export function markNotificationSent(response?: ExternalResponse) {
  const now = new Date();
  return {
    status: 'sent' as NotificationStatus,
    sentAt: now,
    Success: response,
    updatedAt: now,
  };
}

/**
 * 标记通知发送失败的辅助函数 (对齐现有 Error 结构)
 */
export function markNotificationFailed(error: any, willRetry: boolean, nextRetryAt?: Date) {
  return {
    status: (willRetry ? 'retrying' : 'failed') as NotificationStatus,
    Error: error,
    nextRetryAt,
    $inc: { retryCount: 1 },
    updatedAt: new Date(),
  };
}

/**
 * 创建短信通知日志 (对齐现有 log.smssends)
 */
export function createSmsLog(
  userId: string,
  tels: string[],
  params: SmsParams,
  alarmId?: string
): NotificationLogDocument {
  return createNotificationLog({
    userId,
    channel: 'sms',
    recipients: tels,
    sendParams: params,
    alarmId,
  });
}

/**
 * 创建邮件通知日志 (对齐现有 log.mailsends)
 */
export function createMailLog(
  userId: string,
  mails: string[],
  params: MailParams,
  alarmId?: string
): NotificationLogDocument {
  return createNotificationLog({
    userId,
    channel: 'email',
    recipients: mails,
    sendParams: params,
    alarmId,
  });
}

/**
 * 创建微信通知日志 (对齐现有 log.wxsubscribeMessages)
 */
export function createWechatLog(
  userId: string,
  touser: string,
  params: WechatParams,
  alarmId?: string
): NotificationLogDocument {
  return createNotificationLog({
    userId,
    channel: 'wechat',
    recipients: [touser],
    sendParams: params,
    alarmId,
  });
}
