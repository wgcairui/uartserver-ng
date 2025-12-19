/**
 * Alarm Notification Service
 *
 * 负责告警通知的分发和发送：
 * - 微信模板消息
 * - 短信通知
 * - 邮件通知
 * - 通知去重
 * - 通知日志
 */

import type { Alarm, AlarmLevel } from './alarm-rule-engine.service';
import type { QueueService } from './queue/queue.interface';

/**
 * 通知渠道
 */
export type NotificationChannel = 'wechat' | 'sms' | 'email';

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
  /** 微信 OpenID */
  wechatOpenId?: string;
  /** 手机号 */
  phone?: string;
  /** 邮箱 */
  email?: string;
}

/**
 * 通知任务数据
 */
export interface NotificationJob {
  /** 告警对象 */
  alarm: Alarm;
  /** 用户 ID */
  userId: string;
  /** 通知渠道 */
  channel: NotificationChannel;
  /** 用户联系信息 */
  contact: {
    wechatOpenId?: string;
    phone?: string;
    email?: string;
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
}

/**
 * Alarm Notification Service
 */
export class AlarmNotificationService {
  /** 队列服务 */
  private queueService?: QueueService;

  /** 通知去重缓存 (key: userId:alarmRuleId, value: last sent time) */
  private notificationCache: Map<string, number> = new Map();

  /** 去重时间窗口 (秒) */
  private readonly DEDUP_WINDOW = 300; // 5 分钟

  constructor(queueService?: QueueService) {
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
  async sendAlarmNotification(alarm: Alarm): Promise<void> {
    console.log(`[AlarmNotification] Processing alarm: ${alarm.ruleName}`);

    // 1. 获取订阅该设备告警的用户
    const subscribers = await this.getAlarmSubscribers(alarm.mac, alarm.pid);

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
      if (!this.shouldSendNotification(user.userId, alarm.ruleId)) {
        console.log(`[AlarmNotification] Notification deduplicated for user ${user.userId}`);
        continue;
      }

      // 根据用户偏好选择通知渠道
      for (const channel of user.channels) {
        await this.queueNotification(alarm, user, channel);
      }

      // 记录通知发送时间
      this.recordNotificationSent(user.userId, alarm.ruleId);
    }
  }

  /**
   * 获取告警订阅用户
   *
   * TODO: 从数据库查询订阅该设备的用户
   */
  private async getAlarmSubscribers(
    _mac: string,
    _pid: number | string
  ): Promise<UserNotificationPreference[]> {
    // 临时：返回示例用户
    const exampleUsers: UserNotificationPreference[] = [
      {
        userId: 'user-1',
        channels: ['wechat'],
        alarmLevels: ['warning', 'error', 'critical'],
        wechatOpenId: 'wx-openid-example',
      },
    ];

    return exampleUsers;
  }

  /**
   * 将通知任务加入队列
   */
  private async queueNotification(
    alarm: Alarm,
    user: UserNotificationPreference,
    channel: NotificationChannel
  ): Promise<void> {
    const job: NotificationJob = {
      alarm,
      userId: user.userId,
      channel,
      contact: {
        wechatOpenId: user.wechatOpenId,
        phone: user.phone,
        email: user.email,
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

    try {
      switch (channel) {
        case 'wechat':
          await this.sendWeChatNotification(alarm, contact.wechatOpenId!);
          break;
        case 'sms':
          await this.sendSmsNotification(alarm, contact.phone!);
          break;
        case 'email':
          await this.sendEmailNotification(alarm, contact.email!);
          break;
      }

      // TODO: 记录通知日志到数据库
      console.log(`[AlarmNotification] ${channel} notification sent successfully`);

      return {
        success: true,
        channel,
        sentAt: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[AlarmNotification] Failed to send ${channel} notification:`, error);

      // TODO: 记录失败日志到数据库

      return {
        success: false,
        channel,
        error: errorMessage,
        sentAt: new Date(),
      };
    }
  }

  /**
   * 发送微信通知
   *
   * TODO: 集成微信模板消息 API
   */
  private async sendWeChatNotification(alarm: Alarm, openId: string): Promise<void> {
    console.log(`[AlarmNotification] Sending WeChat notification to ${openId}`);

    // 格式化消息
    const message = this.formatWeChatMessage(alarm);

    // TODO: 调用微信 API
    // await this.wechatService.sendTemplateMessage(openId, message);

    console.log('[AlarmNotification] WeChat message:', message);
  }

  /**
   * 格式化微信消息
   */
  private formatWeChatMessage(alarm: Alarm): any {
    return {
      template_id: 'ALARM_TEMPLATE_ID',
      data: {
        first: { value: `【${this.getLevelText(alarm.level)}】${alarm.ruleName}` },
        keyword1: { value: alarm.mac },
        keyword2: { value: alarm.pid },
        keyword3: { value: alarm.message },
        keyword4: { value: alarm.triggeredAt.toLocaleString('zh-CN') },
        remark: { value: '请及时处理' },
      },
    };
  }

  /**
   * 发送短信通知
   *
   * TODO: 集成阿里云短信 API
   */
  private async sendSmsNotification(alarm: Alarm, phone: string): Promise<void> {
    console.log(`[AlarmNotification] Sending SMS notification to ${phone}`);

    // 格式化短信内容
    const content = `【告警通知】${alarm.ruleName}：${alarm.message}。请及时处理。`;

    // TODO: 调用阿里云短信 API
    // await this.smsService.send(phone, content);

    console.log('[AlarmNotification] SMS content:', content);
  }

  /**
   * 发送邮件通知
   *
   * TODO: 集成 SMTP 邮件发送
   */
  private async sendEmailNotification(alarm: Alarm, email: string): Promise<void> {
    console.log(`[AlarmNotification] Sending Email notification to ${email}`);

    // 格式化邮件内容
    const subject = `【告警通知】${alarm.ruleName}`;
    const body = `
      <h2>${alarm.ruleName}</h2>
      <p><strong>告警级别:</strong> ${this.getLevelText(alarm.level)}</p>
      <p><strong>设备信息:</strong> ${alarm.mac} - ${alarm.pid}</p>
      <p><strong>告警消息:</strong> ${alarm.message}</p>
      <p><strong>触发时间:</strong> ${alarm.triggeredAt.toLocaleString('zh-CN')}</p>
      <p>请及时登录系统查看详情并处理。</p>
    `;

    // TODO: 调用邮件服务
    // await this.emailService.send(email, subject, body);

    console.log('[AlarmNotification] Email subject:', subject);
    console.log('[AlarmNotification] Email body length:', body.length);
  }

  /**
   * 检查是否应该发送通知（去重检查）
   */
  private shouldSendNotification(userId: string, ruleId: string): boolean {
    const key = `${userId}:${ruleId}`;
    const lastSent = this.notificationCache.get(key);

    if (!lastSent) return true;

    const now = Date.now();
    const windowMs = this.DEDUP_WINDOW * 1000;

    return now - lastSent > windowMs;
  }

  /**
   * 记录通知发送时间
   */
  private recordNotificationSent(userId: string, ruleId: string): void {
    const key = `${userId}:${ruleId}`;
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
}
