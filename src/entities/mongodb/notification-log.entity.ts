/**
 * 通知日志实体
 *
 * 记录所有通知发送的历史记录：
 * - 微信模板消息
 * - 阿里云短信
 * - 邮件通知
 */

import { ObjectId } from 'mongodb';

/**
 * 通知类型
 */
export type NotificationType = 'wechat' | 'sms' | 'email';

/**
 * 通知日志文档
 */
export interface NotificationLogDocument {
  /** 日志 ID */
  _id?: ObjectId;

  /** 通知类型 */
  type: NotificationType;

  /** 用户 ID */
  userId: ObjectId;

  /** 关联的告警 ID（可选） */
  alarmId?: ObjectId;

  /** 接收者（手机号/邮箱/OpenID） */
  recipient: string | string[];

  /** 发送参数 */
  params: Record<string, any>;

  /** 是否发送成功 */
  success: boolean;

  /** 成功响应（如果成功） */
  response?: any;

  /** 错误信息（如果失败） */
  error?: string;

  /** 错误详情（如果失败） */
  errorDetails?: any;

  /** 创建时间 */
  createdAt: Date;
}

/**
 * 创建微信通知日志
 */
export function createWechatLog(
  userId: ObjectId,
  openId: string,
  params: Record<string, any>,
  alarmId?: ObjectId
): NotificationLogDocument {
  return {
    type: 'wechat',
    userId,
    recipient: openId,
    params,
    success: false,
    createdAt: new Date(),
    alarmId,
  };
}

/**
 * 创建短信通知日志
 */
export function createSmsLog(
  userId: ObjectId,
  phones: string[],
  params: Record<string, any>,
  alarmId?: ObjectId
): NotificationLogDocument {
  return {
    type: 'sms',
    userId,
    recipient: phones,
    params,
    success: false,
    createdAt: new Date(),
    alarmId,
  };
}

/**
 * 创建邮件通知日志
 */
export function createEmailLog(
  userId: ObjectId,
  emails: string[],
  params: Record<string, any>,
  alarmId?: ObjectId
): NotificationLogDocument {
  return {
    type: 'email',
    userId,
    recipient: emails,
    params,
    success: false,
    createdAt: new Date(),
    alarmId,
  };
}

/**
 * 标记日志为成功
 */
export function markLogSuccess(
  _log: NotificationLogDocument,
  response: any
): Partial<NotificationLogDocument> {
  return {
    success: true,
    response,
  };
}

/**
 * 标记日志为失败
 */
export function markLogError(
  _log: NotificationLogDocument,
  error: Error | any
): Partial<NotificationLogDocument> {
  return {
    success: false,
    error: error.message || String(error),
    errorDetails: error,
  };
}

/**
 * 集合名称
 */
export const NOTIFICATION_LOG_COLLECTION = 'notification.logs';

/**
 * 索引配置
 */
export const NOTIFICATION_LOG_INDEXES = [
  {
    key: { userId: 1, createdAt: -1 },
    name: 'notification_logs.userId_createdAt_idx',
  },
  {
    key: { type: 1, success: 1 },
    name: 'notification_logs.type_success_idx',
  },
  {
    key: { alarmId: 1 },
    name: 'notification_logs.alarmId_idx',
    sparse: true,
  },
  {
    key: { createdAt: 1 },
    name: 'notification_logs.createdAt_idx',
    expireAfterSeconds: 2592000, // 30 天后自动删除
  },
];
