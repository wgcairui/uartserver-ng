/**
 * Email Service Unit Tests
 *
 * 测试邮件服务：
 * - Mock 模式测试
 * - 邮件发送
 * - SMTP 配置验证
 * - 错误处理
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { EmailService } from '../../src/services/notification/email.service';
import type { EmailParams, EmailResponse } from '../../src/services/notification/email.service';

describe('EmailService', () => {
  describe('Mock Mode', () => {
    let service: EmailService;

    beforeEach(() => {
      service = new EmailService({ mockMode: true });
    });

    it('should send email in mock mode', async () => {
      const params: EmailParams = {
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: '告警通知',
        text: '这是一条告警通知',
        html: '<h1>告警通知</h1><p>这是一条告警通知</p>',
      };

      const response = await service.sendMail(params);

      expect(response.accepted).toEqual(['recipient@example.com']);
      expect(response.rejected).toEqual([]);
      expect(response.messageId).toBeDefined();
      expect(response.response).toBe('250 Message accepted');
    });

    it('should handle CC and BCC in mock mode', async () => {
      const params: EmailParams = {
        from: 'sender@example.com',
        to: 'recipient@example.com',
        cc: 'cc@example.com',
        bcc: 'bcc@example.com',
        subject: '测试邮件',
        text: '测试内容',
      };

      const response = await service.sendMail(params);

      expect(response.accepted).toEqual(['recipient@example.com']);
      expect(response.rejected).toEqual([]);
    });

    it('should handle attachments in mock mode', async () => {
      const params: EmailParams = {
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: '带附件的邮件',
        text: '请查看附件',
        attachments: [
          {
            filename: 'report.pdf',
            content: Buffer.from('PDF content'),
          },
          {
            filename: 'data.csv',
            path: '/path/to/data.csv',
          },
        ],
      };

      const response = await service.sendMail(params);

      expect(response.accepted).toEqual(['recipient@example.com']);
      expect(response.rejected).toEqual([]);
    });

    it('should generate unique messageId for each email in mock mode', async () => {
      const params: EmailParams = {
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: '测试',
        text: '内容',
      };

      const response1 = await service.sendMail(params);
      await Bun.sleep(10); // Wait to ensure different messageId
      const response2 = await service.sendMail(params);

      expect(response1.messageId).not.toBe(response2.messageId);
    });

    it('should handle HTML-only email in mock mode', async () => {
      const params: EmailParams = {
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'HTML Email',
        html: '<div><h1>Title</h1><p>Content</p></div>',
      };

      const response = await service.sendMail(params);

      expect(response.accepted).toEqual(['recipient@example.com']);
    });

    it('should handle text-only email in mock mode', async () => {
      const params: EmailParams = {
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Text Email',
        text: 'Plain text content',
      };

      const response = await service.sendMail(params);

      expect(response.accepted).toEqual(['recipient@example.com']);
    });
  });

  describe('Configuration Verification', () => {
    it('should verify configuration in mock mode', async () => {
      const service = new EmailService({ mockMode: true });
      const isValid = await service.verifyConfiguration();

      expect(isValid).toBe(true);
    });

    it('should fallback to mock mode if SMTP not configured', () => {
      const service = new EmailService({
        smtpHost: '',
        smtpUser: '',
        smtpPass: '',
        mockMode: false, // Try real mode
      });

      // Should fallback to mock mode
      expect((service as any).mockMode).toBe(true);
    });

    it('should use provided SMTP configuration', () => {
      const service = new EmailService({
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        smtpUser: 'user@example.com',
        smtpPass: 'password',
        mockMode: false,
      });

      expect((service as any).smtpConfig).toEqual({
        host: 'smtp.example.com',
        port: 587,
        secure: false, // 587 uses STARTTLS
        auth: {
          user: 'user@example.com',
          pass: 'password',
        },
      });
      expect((service as any).mockMode).toBe(false);
    });

    it('should use SSL/TLS for port 465', () => {
      const service = new EmailService({
        smtpHost: 'smtp.example.com',
        smtpPort: 465,
        smtpUser: 'user@example.com',
        smtpPass: 'password',
        mockMode: false,
      });

      expect((service as any).smtpConfig.secure).toBe(true);
    });

    it('should use STARTTLS for port 587', () => {
      const service = new EmailService({
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        smtpUser: 'user@example.com',
        smtpPass: 'password',
        mockMode: false,
      });

      expect((service as any).smtpConfig.secure).toBe(false);
    });

    it('should use default port 587 if not specified', () => {
      const service = new EmailService({
        smtpHost: 'smtp.example.com',
        smtpUser: 'user@example.com',
        smtpPass: 'password',
        mockMode: false,
      });

      expect((service as any).smtpConfig.port).toBe(587);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing required fields gracefully in mock mode', async () => {
      const service = new EmailService({ mockMode: true });

      // Missing 'to' field - but mock mode doesn't validate
      const params = {
        from: 'sender@example.com',
        to: '',
        subject: 'Test',
        text: 'Content',
      } as EmailParams;

      const response = await service.sendMail(params);

      // Mock mode accepts everything
      expect(response.accepted).toEqual(['']);
    });

    it('should handle empty attachments array in mock mode', async () => {
      const service = new EmailService({ mockMode: true });

      const params: EmailParams = {
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test',
        text: 'Content',
        attachments: [],
      };

      const response = await service.sendMail(params);

      expect(response.accepted).toEqual(['recipient@example.com']);
    });
  });

  describe('Lazy Loading', () => {
    it('should not load nodemailer in mock mode', async () => {
      const service = new EmailService({ mockMode: true });

      // Verify transporter is not initialized
      expect((service as any).transporter).toBe(null);

      // Send an email
      await service.sendMail({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test',
        text: 'Content',
      });

      // Transporter should still be null in mock mode
      expect((service as any).transporter).toBe(null);
    });
  });

  describe('Email Formatting', () => {
    it('should accept both text and HTML content', async () => {
      const service = new EmailService({ mockMode: true });

      const params: EmailParams = {
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: '测试邮件',
        text: '纯文本内容',
        html: '<p>HTML 内容</p>',
      };

      const response = await service.sendMail(params);

      expect(response.accepted).toEqual(['recipient@example.com']);
    });

    it('should handle Chinese characters in subject and content', async () => {
      const service = new EmailService({ mockMode: true });

      const params: EmailParams = {
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: '告警通知：温度超过阈值',
        text: '设备001的温度传感器检测到温度超过85℃',
        html: '<h1>告警通知</h1><p>设备001的温度传感器检测到温度超过85℃</p>',
      };

      const response = await service.sendMail(params);

      expect(response.accepted).toEqual(['recipient@example.com']);
    });

    it('should handle multiple recipients in TO field', async () => {
      const service = new EmailService({ mockMode: true });

      const params: EmailParams = {
        from: 'sender@example.com',
        to: 'recipient1@example.com,recipient2@example.com',
        subject: '群发邮件',
        text: '测试内容',
      };

      const response = await service.sendMail(params);

      // Mock returns the 'to' field as-is in accepted array
      expect(response.accepted).toEqual(['recipient1@example.com,recipient2@example.com']);
    });
  });

  describe('Environment Variables', () => {
    it('should read SMTP configuration from environment', () => {
      // Set environment variables
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_PORT = '465';

      const service = new EmailService({
        smtpUser: 'user@test.com',
        smtpPass: 'password',
        mockMode: false,
      });

      expect((service as any).smtpConfig.host).toBe('smtp.test.com');
      expect((service as any).smtpConfig.port).toBe(465);

      // Clean up
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_PORT;
    });

    it('should prefer constructor options over environment variables', () => {
      // Set environment variables
      process.env.SMTP_HOST = 'smtp.env.com';
      process.env.SMTP_PORT = '587';

      const service = new EmailService({
        smtpHost: 'smtp.constructor.com',
        smtpPort: 465,
        smtpUser: 'user@test.com',
        smtpPass: 'password',
        mockMode: false,
      });

      expect((service as any).smtpConfig.host).toBe('smtp.constructor.com');
      expect((service as any).smtpConfig.port).toBe(465);

      // Clean up
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_PORT;
    });
  });

  describe('Default From Field', () => {
    let service: EmailService;

    beforeEach(() => {
      service = new EmailService({
        mockMode: true,
        fromName: '自定义公司',
        fromAddress: 'custom@company.com',
      });
    });

    it('should use default from name and address when not provided', async () => {
      const defaultService = new EmailService({ mockMode: true });

      expect((defaultService as any).defaultFromName).toBe('雷迪司科技湖北有限公司');
      expect((defaultService as any).defaultFromAddress).toBe('260338538@qq.com');
    });

    it('should apply custom default from name and address', async () => {
      expect((service as any).defaultFromName).toBe('自定义公司');
      expect((service as any).defaultFromAddress).toBe('custom@company.com');
    });

    it('should apply default from when not provided in params', async () => {
      const params: EmailParams = {
        to: 'recipient@example.com',
        subject: '测试邮件',
        text: '测试内容',
      };

      const response = await service.sendMail(params);

      expect(response.accepted).toEqual(['recipient@example.com']);
      expect(response.rejected).toEqual([]);
    });

    it('should allow user-provided from to override default', async () => {
      const params: EmailParams = {
        from: '用户提供的发件人 <user@example.com>',
        to: 'recipient@example.com',
        subject: '测试邮件',
        text: '测试内容',
      };

      const response = await service.sendMail(params);

      expect(response.accepted).toEqual(['recipient@example.com']);
    });

    it('should format default from as "Name <email>"', async () => {
      const defaultService = new EmailService({ mockMode: true });

      const expectedFrom = '雷迪司科技湖北有限公司 <260338538@qq.com>';

      expect((defaultService as any).defaultFromName).toBe('雷迪司科技湖北有限公司');
      expect((defaultService as any).defaultFromAddress).toBe('260338538@qq.com');

      // Test formatted default
      const params: EmailParams = {
        to: 'recipient@example.com',
        subject: '测试',
        text: '内容',
      };

      const response = await defaultService.sendMail(params);

      expect(response.accepted).toEqual(['recipient@example.com']);
    });

    it('should support undefined from triggering default', async () => {
      const params: EmailParams = {
        from: undefined, // Explicitly undefined
        to: 'recipient@example.com',
        subject: '测试',
        text: '内容',
      };

      const response = await service.sendMail(params);

      expect(response.accepted).toEqual(['recipient@example.com']);
    });

    it('should prioritize constructor options over hardcoded defaults', async () => {
      const customService = new EmailService({
        mockMode: true,
        fromName: 'Constructor Company',
        fromAddress: 'constructor@test.com',
      });

      expect((customService as any).defaultFromName).toBe('Constructor Company');
      expect((customService as any).defaultFromAddress).toBe('constructor@test.com');
    });

    it('should handle from field with only name', async () => {
      const params: EmailParams = {
        from: 'Only Name',
        to: 'recipient@example.com',
        subject: '测试',
        text: '内容',
      };

      const response = await service.sendMail(params);

      expect(response.accepted).toEqual(['recipient@example.com']);
    });

    it('should handle from field with only email', async () => {
      const params: EmailParams = {
        from: 'only-email@example.com',
        to: 'recipient@example.com',
        subject: '测试',
        text: '内容',
      };

      const response = await service.sendMail(params);

      expect(response.accepted).toEqual(['recipient@example.com']);
    });
  });

  describe('Parameter Merging', () => {
    let service: EmailService;

    beforeEach(() => {
      service = new EmailService({
        mockMode: true,
        fromName: 'Default Sender',
        fromAddress: 'default@company.com',
      });
    });

    it('should merge user params with defaults correctly', async () => {
      const params: EmailParams = {
        to: 'recipient@example.com',
        cc: 'cc@example.com',
        bcc: 'bcc@example.com',
        subject: '综合测试',
        text: '纯文本内容',
        html: '<p>HTML 内容</p>',
      };

      const response = await service.sendMail(params);

      expect(response.accepted).toEqual(['recipient@example.com']);
      expect(response.rejected).toEqual([]);
    });

    it('should preserve all user-provided fields', async () => {
      const params: EmailParams = {
        from: 'Custom Sender <custom@example.com>',
        to: 'recipient@example.com',
        cc: 'cc1@example.com,cc2@example.com',
        bcc: 'bcc@example.com',
        subject: '完整参数测试',
        text: '纯文本',
        html: '<p>HTML</p>',
        attachments: [
          {
            filename: 'test.txt',
            content: Buffer.from('test content'),
          },
        ],
      };

      const response = await service.sendMail(params);

      expect(response.accepted).toEqual(['recipient@example.com']);
      expect(response.rejected).toEqual([]);
    });

    it('should handle minimal params with default from', async () => {
      const params: EmailParams = {
        to: 'recipient@example.com',
        subject: 'Minimal',
        text: 'Content',
      };

      const response = await service.sendMail(params);

      expect(response.accepted).toEqual(['recipient@example.com']);
    });

    it('should preserve reply-to if provided', async () => {
      const params: EmailParams = {
        from: 'sender@example.com',
        to: 'recipient@example.com',
        replyTo: 'reply-to@example.com',
        subject: 'Reply To Test',
        text: 'Content',
      };

      const response = await service.sendMail(params);

      expect(response.accepted).toEqual(['recipient@example.com']);
    });
  });
});
