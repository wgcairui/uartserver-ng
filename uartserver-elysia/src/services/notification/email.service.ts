/**
 * Email Service
 *
 * 邮件服务（使用 Nodemailer）：
 * - HTML 邮件发送
 * - 附件支持
 * - 多种传输方式（SMTP/SendGrid/等）
 * - Mock 模式支持（测试环境）
 *
 * 文档: https://nodemailer.com/
 */

import { config } from '../../config';

/**
 * 邮件发送参数
 */
export interface EmailParams {
  /** 发件人（可选,使用默认发件人） */
  from?: string;
  /** 收件人 */
  to: string;
  /** 抄送（可选） */
  cc?: string;
  /** 密送（可选） */
  bcc?: string;
  /** 主题 */
  subject: string;
  /** 纯文本内容（可选） */
  text?: string;
  /** HTML 内容（可选） */
  html?: string;
  /** 附件（可选） */
  attachments?: Array<{
    filename: string;
    content?: string | Buffer;
    path?: string;
  }>;
}

/**
 * 邮件发送响应
 */
export interface EmailResponse {
  /** 是否成功 */
  accepted: string[];
  /** 被拒绝的地址 */
  rejected: string[];
  /** 消息 ID */
  messageId: string;
  /** 响应消息 */
  response: string;
}

/**
 * Nodemailer Transporter 接口（简化版）
 */
interface Transporter {
  sendMail(mailOptions: EmailParams): Promise<EmailResponse>;
  verify(): Promise<boolean>;
}

/**
 * Email Service
 */
export class EmailService {
  /** SMTP 配置 */
  private readonly smtpConfig: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  } | null;

  /** 是否为 Mock 模式 */
  private readonly mockMode: boolean;

  /** Nodemailer Transporter（懒加载） */
  private transporter: Transporter | null = null;

  /** 默认发件人名称 */
  private readonly defaultFromName: string;

  /** 默认发件人地址 */
  private readonly defaultFromAddress: string;

  constructor(options?: {
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPass?: string;
    fromName?: string;
    fromAddress?: string;
    mockMode?: boolean;
  }) {
    const host = (options?.smtpHost ?? process.env.SMTP_HOST) || '';
    const port = options?.smtpPort ?? parseInt(process.env.SMTP_PORT || '587', 10);
    const user = (options?.smtpUser ?? config.EMAIL_ID) || '';
    const pass = (options?.smtpPass ?? config.EMAIL_SECRET) || '';
    this.defaultFromName = options?.fromName ?? config.EMAIL_FROM_NAME ?? '雷迪司科技湖北有限公司';
    this.defaultFromAddress = options?.fromAddress ?? config.EMAIL_FROM_ADDRESS ?? '260338538@qq.com';

    this.mockMode = options?.mockMode ?? (config.NODE_ENV !== 'production');

    if (!this.mockMode && (!host || !user || !pass)) {
      console.warn('[EmailService] SMTP not configured, using mock mode');
      (this as any).mockMode = true;
      this.smtpConfig = null;
    } else {
      this.smtpConfig = {
        host,
        port,
        secure: port === 465, // 465 使用 SSL/TLS，587 使用 STARTTLS
        auth: { user, pass },
      };
    }

    console.log(`[EmailService] Initialized (mock: ${this.mockMode})`);
  }

  /**
   * 发送邮件
   *
   * @param params - 邮件参数
   * @returns 发送响应
   */
  async sendMail(params: EmailParams): Promise<EmailResponse> {
    // 应用默认发件人
    const requestParams: EmailParams = {
      ...params,
      from: params.from ?? `${this.defaultFromName} <${this.defaultFromAddress}>`,
    };

    if (this.mockMode) {
      return this.mockSendMail(requestParams);
    }

    try {
      const transporter = await this.getTransporter();
      const result = await transporter.sendMail(requestParams);

      console.log(`[EmailService] Email sent successfully: messageId=${result.messageId}`);

      return result;
    } catch (error) {
      console.error('[EmailService] Failed to send email:', error);
      throw error;
    }
  }

  /**
   * 获取 Nodemailer Transporter（懒加载）
   */
  private async getTransporter(): Promise<Transporter> {
    if (this.transporter) {
      return this.transporter;
    }

    if (!this.smtpConfig) {
      throw new Error('SMTP not configured');
    }

    try {
      // 动态导入 nodemailer（仅在需要时加载）
      const nodemailer = await import('nodemailer');

      this.transporter = nodemailer.createTransport(this.smtpConfig) as any;

      // 验证连接
      await this.transporter.verify();
      console.log('[EmailService] SMTP connection verified');

      return this.transporter;
    } catch (error) {
      console.error('[EmailService] Failed to create/verify transporter:', error);
      throw error;
    }
  }

  /**
   * Mock 模式：模拟发送邮件
   */
  private mockSendMail(params: EmailParams): EmailResponse {
    console.log('[EmailService] Mock sending email:', {
      from: params.from,
      to: params.to,
      subject: params.subject,
      hasHtml: !!params.html,
      hasText: !!params.text,
      attachments: params.attachments?.length || 0,
    });

    return {
      accepted: [params.to],
      rejected: [],
      messageId: `<mock-${Date.now()}@example.com>`,
      response: '250 Message accepted',
    };
  }

  /**
   * 验证配置（用于启动时检查）
   */
  async verifyConfiguration(): Promise<boolean> {
    if (this.mockMode) {
      return true;
    }

    try {
      const transporter = await this.getTransporter();
      return await transporter.verify();
    } catch (error) {
      console.error('[EmailService] Configuration verification failed:', error);
      return false;
    }
  }
}

/**
 * 全局邮件服务实例
 */
export const emailService = new EmailService();
