/**
 * Alarm Notification Service
 *
 * 负责告警通知的分发和发送：
 * - 微信模板消息
 * - 短信通知
 * - 邮件通知
 * - 通知去重
 * - 通知日志持久化
 *
 * 使用 MongoDB 实体持久化数据
 */

import { ObjectId } from 'mongodb';
import type { Db } from 'mongodb';
import {
  Phase3Collections,
  type AlarmDocument,
  type AlarmLevel,
  type NotificationChannel,
  createWechatLog,
  createSmsLog,
  createEmailLog,
  markLogSuccess,
  markLogError,
} from '../entities/mongodb';
import type { QueueService } from './queue/queue.interface';
import { wechatService, type WechatTemplateParams } from './notification/wechat.service';
import { smsService, type SmsParams } from './notification/sms.service';
import { emailService, type EmailParams } from './notification/email.service';

// Type aliases for consistency
type WechatParams = WechatTemplateParams;
type MailParams = EmailParams;

/**
 * 用户通知偏好
 */
export interface UserNotificationPreference {
  /** 用户 ID */
  userId: string;
  /** 启用的通知渠道 */
  channels: NotificationChannel[];
  /** 接收的告警级别 */
  alarmLevels: AlarmLevel[];
  /** 微信 OpenID 列表 */
  wechatOpenIds: string[];
  /** 手机号列表 */
  phones: string[];
  /** 邮箱列表 */
  emails: string[];
}

/**
 * 通知任务数据
 */
export interface NotificationJob {
  /** 告警对象 */
  alarm: AlarmDocument;
  /** 用户 ID */
  userId: string;
  /** 通知渠道 */
  channel: NotificationChannel;
  /** 用户联系信息 */
  contact: {
    wechatOpenIds?: string[];
    phones?: string[];
    emails?: string[];
  };
}

/**
 * 通知发送结果
 */
export interface NotificationResult {
  /** 是否成功 */
  success: boolean;
  /** 渠道 */
  channel: NotificationChannel;
  /** 错误信息 */
  error?: string;
  /** 发送时间 */
  sentAt: Date;
  /** 日志 ID */
  logId?: ObjectId;
}

/**
 * Alarm Notification Service
 */
export class AlarmNotificationService {
  /** MongoDB 集合访问器 */
  private collections: Phase3Collections;

  /** 队列服务 */
  private queueService?: QueueService;

  /** 通知去重缓存 (key: userId:alarmId, value: last sent time) */
  private notificationCache: Map<string, number> = new Map();

  /** 去重时间窗口 (秒) */
  private readonly DEDUP_WINDOW = 300; // 5 分钟

  constructor(db: Db, queueService?: QueueService) {
    this.collections = new Phase3Collections(db);
    this.queueService = queueService;

    // 注册通知处理器
    if (this.queueService) {
      this.queueService.registerProcessor('notifications', (job) =>
        this.processNotification(job.data as NotificationJob)
      );
    }

    console.log('[AlarmNotification] Service initialized');
  }

  /**
   * 发送告警通知
   *
   * @param alarm - 告警对象
   */
  async sendAlarmNotification(alarm: AlarmDocument): Promise<void> {
    console.log(`[AlarmNotification] Processing alarm: ${alarm.msg}`);

    // 1. 获取订阅该设备告警的用户
    const subscribers = await this.getAlarmSubscribers(alarm.mac, alarm.pid, alarm.protocol);

    if (subscribers.length === 0) {
      console.log(`[AlarmNotification] No subscribers for ${alarm.mac}:${alarm.pid}`);
      return;
    }

    console.log(`[AlarmNotification] Found ${subscribers.length} subscribers`);

    // 2. 为每个用户创建通知任务
    for (const user of subscribers) {
      // 检查用户是否订阅该告警级别
      if (!user.alarmLevels.includes(alarm.level)) {
        console.log(
          `[AlarmNotification] User ${user.userId} not subscribed to ${alarm.level} alarms`
        );
        continue;
      }

      // 检查去重
      if (!this.shouldSendNotification(user.userId, alarm._id?.toString() || '')) {
        console.log(`[AlarmNotification] Notification deduplicated for user ${user.userId}`);
        continue;
      }

      // 根据用户偏好选择通知渠道
      for (const channel of user.channels) {
        await this.queueNotification(alarm, user, channel);
      }

      // 记录通知发送时间
      this.recordNotificationSent(user.userId, alarm._id?.toString() || '');
    }
  }

  /**
   * 获取告警订阅用户 (从 MongoDB 查询)
   *
   * 查询 user.alarmsetups 集合,找到订阅了该协议的用户
   */
  private async getAlarmSubscribers(
    mac: string,
    pid: number | string,
    protocol: string
  ): Promise<UserNotificationPreference[]> {
    console.log(`[AlarmNotification] Querying subscribers for ${mac}:${pid} (${protocol})`);

    try {
      // 查询订阅了该协议的用户
      const userSetups = await this.collections.userAlarmSetups
        .find({
          'ProtocolSetup.Protocol': protocol,
        })
        .toArray();

      console.log(`[AlarmNotification] Found ${userSetups.length} potential subscribers`);

      // 转换为 UserNotificationPreference 格式
      const subscribers: UserNotificationPreference[] = userSetups.map((setup) => {
        // 确定启用的通知渠道
        const channels: NotificationChannel[] = [];
        if (setup.wxs && setup.wxs.length > 0) channels.push('wechat');
        if (setup.tels && setup.tels.length > 0) channels.push('sms');
        if (setup.mails && setup.mails.length > 0) channels.push('email');

        // 默认订阅所有级别的告警
        const alarmLevels: AlarmLevel[] = ['info', 'warning', 'error', 'critical'];

        return {
          userId: setup.user,
          channels,
          alarmLevels,
          wechatOpenIds: setup.wxs || [],
          phones: setup.tels || [],
          emails: setup.mails || [],
        };
      });

      return subscribers;
    } catch (error) {
      console.error('[AlarmNotification] Error querying subscribers:', error);
      return [];
    }
  }

  /**
   * 将通知任务加入队列
   */
  private async queueNotification(
    alarm: AlarmDocument,
    user: UserNotificationPreference,
    channel: NotificationChannel
  ): Promise<void> {
    const job: NotificationJob = {
      alarm,
      userId: user.userId,
      channel,
      contact: {
        wechatOpenIds: user.wechatOpenIds,
        phones: user.phones,
        emails: user.emails,
      },
    };

    if (this.queueService) {
      // 使用任务队列异步处理
      await this.queueService.addJob('notifications', 'alarm_notification', job, {
        priority: this.getPriority(alarm.level),
        attempts: 3, // 重试 3 次
      });

      console.log(
        `[AlarmNotification] Queued ${channel} notification for user ${user.userId}`
      );
    } else {
      // 无队列服务，直接处理
      await this.processNotification(job);
    }
  }

  /**
   * 处理通知任务
   */
  private async processNotification(job: NotificationJob): Promise<NotificationResult> {
    const { alarm, userId, channel, contact } = job;

    console.log(`[AlarmNotification] Processing ${channel} notification for user ${userId}`);

    let logId: ObjectId | undefined;

    try {
      switch (channel) {
        case 'wechat':
          if (!contact.wechatOpenIds || contact.wechatOpenIds.length === 0) {
            throw new Error('No WeChat OpenID available');
          }
          logId = await this.sendWeChatNotification(alarm, userId, contact.wechatOpenIds);
          break;
        case 'sms':
          if (!contact.phones || contact.phones.length === 0) {
            throw new Error('No phone number available');
          }
          logId = await this.sendSmsNotification(alarm, userId, contact.phones);
          break;
        case 'email':
          if (!contact.emails || contact.emails.length === 0) {
            throw new Error('No email address available');
          }
          logId = await this.sendEmailNotification(alarm, userId, contact.emails);
          break;
      }

      console.log(`[AlarmNotification] ${channel} notification sent successfully`);

      return {
        success: true,
        channel,
        sentAt: new Date(),
        logId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[AlarmNotification] Failed to send ${channel} notification:`, error);

      // 记录失败日志
      if (logId) {
        await this.markNotificationFailed(logId, error, false);
      }

      return {
        success: false,
        channel,
        error: errorMessage,
        sentAt: new Date(),
        logId,
      };
    }
  }

  /**
   * 发送微信通知并持久化日志
   *
   * @returns 通知日志 ID
   */
  private async sendWeChatNotification(
    alarm: AlarmDocument,
    userId: string,
    openIds: string[]
  ): Promise<ObjectId> {
    console.log(`[AlarmNotification] Sending WeChat notification to ${openIds.join(', ')}`);

    // 格式化消息
    const params = this.formatWeChatMessage(alarm);

    // 创建通知日志
    const log = createWechatLog(new ObjectId(userId), openIds[0]!, params, alarm._id);
    const result = await this.collections.notificationLogs.insertOne(log);
    const logId = result.insertedId;

    try {
      // 调用微信 API
      const response = await wechatService.sendTemplateMessage({
        touser: openIds[0]!,
        template_id: params.template_id,
        url: params.url,
        miniprogram: params.miniprogram,
        data: params.data,
      });

      const responseData = {
        Message: response.errmsg,
        RequestId: `wechat-${response.msgid || Date.now()}`,
        BizId: `${response.msgid || Date.now()}`,
      };

      console.log('[AlarmNotification] WeChat message sent:', responseData);

      // 标记为成功
      await this.collections.notificationLogs.updateOne(
        { _id: logId },
        { $set: markLogSuccess(log, responseData) }
      );

      return logId;
    } catch (error) {
      // 标记为失败
      await this.markNotificationFailed(logId, error, true);
      throw error;
    }
  }

  /**
   * 格式化微信消息
   */
  private formatWeChatMessage(alarm: AlarmDocument): WechatParams {
    return {
      touser: '', // 将由调用方填充
      template_id: 'ALARM_TEMPLATE_ID',
      data: {
        first: { value: `【${this.getLevelText(alarm.level)}】${alarm.msg}` },
        keyword1: { value: alarm.mac },
        keyword2: { value: String(alarm.pid) },
        keyword3: { value: alarm.msg },
        keyword4: { value: alarm.triggeredAt.toLocaleString('zh-CN') },
        remark: { value: '请及时处理' },
      },
    };
  }

  /**
   * 发送短信通知并持久化日志
   *
   * @returns 通知日志 ID
   */
  private async sendSmsNotification(
    alarm: AlarmDocument,
    userId: string,
    phones: string[]
  ): Promise<ObjectId> {
    console.log(`[AlarmNotification] Sending SMS notification to ${phones.join(', ')}`);

    // 格式化短信参数
    const params: SmsParams = {
      SignName: '告警通知',
      TemplateCode: 'SMS_ALARM_TEMPLATE',
      TemplateParam: JSON.stringify({
        level: this.getLevelText(alarm.level),
        message: alarm.msg,
        time: alarm.triggeredAt.toLocaleString('zh-CN'),
      }),
    };

    // 创建通知日志
    const log = createSmsLog(new ObjectId(userId), phones, params, alarm._id);
    const result = await this.collections.notificationLogs.insertOne(log);
    const logId = result.insertedId;

    try {
      // 调用阿里云短信 API
      const response = await smsService.sendSms(phones, params);

      const responseData = {
        Message: response.Message || 'OK',
        RequestId: response.RequestId,
        BizId: response.BizId || `sms-${Date.now()}`,
      };

      console.log('[AlarmNotification] SMS sent:', responseData);

      // 标记为成功
      await this.collections.notificationLogs.updateOne(
        { _id: logId },
        { $set: markLogSuccess(log, responseData) }
      );

      return logId;
    } catch (error) {
      // 标记为失败
      await this.markNotificationFailed(logId, error, true);
      throw error;
    }
  }

  /**
   * 发送邮件通知并持久化日志
   *
   * @returns 通知日志 ID
   */
  private async sendEmailNotification(
    alarm: AlarmDocument,
    userId: string,
    emails: string[]
  ): Promise<ObjectId> {
    console.log(`[AlarmNotification] Sending Email notification to ${emails.join(', ')}`);

    // 格式化邮件参数
    const subject = `【告警通知】${alarm.msg}`;
    const html = `
      <h2>${alarm.msg}</h2>
      <p><strong>告警级别:</strong> ${this.getLevelText(alarm.level)}</p>
      <p><strong>设备信息:</strong> ${alarm.mac} - ${alarm.pid}</p>
      <p><strong>协议:</strong> ${alarm.protocol}</p>
      <p><strong>触发时间:</strong> ${alarm.triggeredAt.toLocaleString('zh-CN')}</p>
      <p>请及时登录系统查看详情并处理。</p>
    `;

    const params: MailParams = {
      from: 'noreply@example.com',
      to: emails[0]!,
      subject,
      html,
    };

    // 创建通知日志
    const log = createEmailLog(new ObjectId(userId), emails, params, alarm._id);
    const result = await this.collections.notificationLogs.insertOne(log);
    const logId = result.insertedId;

    try {
      // 调用邮件服务
      const response = await emailService.sendMail(params);

      console.log('[AlarmNotification] Email sent:', response);

      // 标记为成功
      await this.collections.notificationLogs.updateOne(
        { _id: logId },
        { $set: markLogSuccess(log, response) }
      );

      return logId;
    } catch (error) {
      // 标记为失败
      await this.markNotificationFailed(logId, error, true);
      throw error;
    }
  }

  /**
   * 标记通知发送失败
   */
  private async markNotificationFailed(
    logId: ObjectId,
    error: any,
    _willRetry: boolean // 参数保留以兼容现有调用，重试由队列处理
  ): Promise<void> {
    const log = { userId: new ObjectId(), alarmId: undefined, recipient: '', params: {}, success: false, type: 'wechat' as const, createdAt: new Date() };
    await this.collections.notificationLogs.updateOne(
      { _id: logId },
      { $set: markLogError(log, error) }
    );
  }

  /**
   * 检查是否应该发送通知（去重检查）
   */
  private shouldSendNotification(userId: string, alarmId: string): boolean {
    const key = `${userId}:${alarmId}`;
    const lastSent = this.notificationCache.get(key);

    if (!lastSent) return true;

    const now = Date.now();
    const windowMs = this.DEDUP_WINDOW * 1000;

    return now - lastSent > windowMs;
  }

  /**
   * 记录通知发送时间
   */
  private recordNotificationSent(userId: string, alarmId: string): void {
    const key = `${userId}:${alarmId}`;
    this.notificationCache.set(key, Date.now());
  }

  /**
   * 获取告警级别优先级（用于队列排序）
   */
  private getPriority(level: AlarmLevel): number {
    switch (level) {
      case 'critical':
        return 10;
      case 'error':
        return 8;
      case 'warning':
        return 5;
      case 'info':
        return 1;
      default:
        return 0;
    }
  }

  /**
   * 获取告警级别文本
   */
  private getLevelText(level: AlarmLevel): string {
    switch (level) {
      case 'critical':
        return '严重';
      case 'error':
        return '错误';
      case 'warning':
        return '警告';
      case 'info':
        return '信息';
      default:
        return '未知';
    }
  }

  /**
   * 获取通知统计
   *
   * @param userId - 用户 ID
   * @param startTime - 开始时间戳
   * @param endTime - 结束时间戳
   */
  async getNotificationStats(
    userId?: string,
    startTime?: number,
    endTime?: number
  ): Promise<{
    total: number;
    sent: number;
    failed: number;
    byChannel: Record<NotificationChannel, number>;
  }> {
    const filter: any = {};

    if (userId) filter.userId = userId;
    if (startTime || endTime) {
      filter.timeStamp = {};
      if (startTime) filter.timeStamp.$gte = startTime;
      if (endTime) filter.timeStamp.$lte = endTime;
    }

    const logs = await this.collections.notificationLogs.find(filter).toArray();

    const stats = {
      total: logs.length,
      sent: logs.filter((l) => l.status === 'sent').length,
      failed: logs.filter((l) => l.status === 'failed').length,
      byChannel: {
        wechat: logs.filter((l) => l.channel === 'wechat').length,
        sms: logs.filter((l) => l.channel === 'sms').length,
        email: logs.filter((l) => l.channel === 'email').length,
      },
    };

    return stats;
  }
}
