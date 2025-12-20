/**
 * Notification Log Entity 单元测试
 *
 * 测试覆盖:
 * - 日志创建 (createWechatLog, createSmsLog, createEmailLog)
 * - 状态更新 (markLogSuccess, markLogError)
 * - 数据结构验证
 */

import { describe, it, expect } from 'bun:test';
import { ObjectId } from 'mongodb';
import {
  createWechatLog,
  createSmsLog,
  createEmailLog,
  markLogSuccess,
  markLogError,
  type NotificationLogDocument,
} from '../../src/entities/mongodb/notification-log.entity';

describe('NotificationLog Entity', () => {
  const testUserId = new ObjectId();
  const testAlarmId = new ObjectId();

  describe('createWechatLog', () => {
    it('should create a WeChat notification log', () => {
      const openId = 'oABC123';
      const params = {
        template_id: 'test_template',
        data: {
          first: { value: '告警通知' },
        },
      };

      const log = createWechatLog(testUserId, openId, params, testAlarmId);

      expect(log.type).toBe('wechat');
      expect(log.userId).toBe(testUserId);
      expect(log.recipient).toBe(openId);
      expect(log.params).toEqual(params);
      expect(log.success).toBe(false);
      expect(log.alarmId).toBe(testAlarmId);
      expect(log.createdAt).toBeInstanceOf(Date);
    });

    it('should create WeChat log without alarmId', () => {
      const log = createWechatLog(testUserId, 'oABC123', {});

      expect(log.type).toBe('wechat');
      expect(log.alarmId).toBeUndefined();
    });

    it('should set success to false by default', () => {
      const log = createWechatLog(testUserId, 'oABC123', {});

      expect(log.success).toBe(false);
    });
  });

  describe('createSmsLog', () => {
    it('should create an SMS notification log', () => {
      const phones = ['13800138000', '13900139000'];
      const params = {
        TemplateCode: 'SMS_123',
        TemplateParam: JSON.stringify({ code: '1234' }),
      };

      const log = createSmsLog(testUserId, phones, params, testAlarmId);

      expect(log.type).toBe('sms');
      expect(log.userId).toBe(testUserId);
      expect(log.recipient).toEqual(phones);
      expect(log.params).toEqual(params);
      expect(log.success).toBe(false);
      expect(log.alarmId).toBe(testAlarmId);
      expect(log.createdAt).toBeInstanceOf(Date);
    });

    it('should handle single phone number in array', () => {
      const log = createSmsLog(testUserId, ['13800138000'], {});

      expect(log.recipient).toEqual(['13800138000']);
    });

    it('should create SMS log without alarmId', () => {
      const log = createSmsLog(testUserId, ['13800138000'], {});

      expect(log.type).toBe('sms');
      expect(log.alarmId).toBeUndefined();
    });
  });

  describe('createEmailLog', () => {
    it('should create an Email notification log', () => {
      const emails = ['user1@example.com', 'user2@example.com'];
      const params = {
        subject: '告警通知',
        html: '<p>设备离线</p>',
      };

      const log = createEmailLog(testUserId, emails, params, testAlarmId);

      expect(log.type).toBe('email');
      expect(log.userId).toBe(testUserId);
      expect(log.recipient).toEqual(emails);
      expect(log.params).toEqual(params);
      expect(log.success).toBe(false);
      expect(log.alarmId).toBe(testAlarmId);
      expect(log.createdAt).toBeInstanceOf(Date);
    });

    it('should handle single email in array', () => {
      const log = createEmailLog(testUserId, ['user@example.com'], {});

      expect(log.recipient).toEqual(['user@example.com']);
    });

    it('should create email log without alarmId', () => {
      const log = createEmailLog(testUserId, ['user@example.com'], {});

      expect(log.type).toBe('email');
      expect(log.alarmId).toBeUndefined();
    });
  });

  describe('markLogSuccess', () => {
    it('should mark log as successful', () => {
      const log = createWechatLog(testUserId, 'oABC123', {});
      const response = {
        errcode: 0,
        errmsg: 'ok',
        msgid: 123456,
      };

      const update = markLogSuccess(log, response);

      expect(update.success).toBe(true);
      expect(update.response).toEqual(response);
    });

    it('should preserve response data', () => {
      const log = createSmsLog(testUserId, ['13800138000'], {});
      const response = {
        RequestId: 'test-123',
        BizId: 'biz-456',
        Code: 'OK',
      };

      const update = markLogSuccess(log, response);

      expect(update.response).toEqual(response);
    });

    it('should handle complex response objects', () => {
      const log = createEmailLog(testUserId, ['user@example.com'], {});
      const response = {
        accepted: ['user@example.com'],
        rejected: [],
        messageId: '<test@example.com>',
        response: '250 Message accepted',
      };

      const update = markLogSuccess(log, response);

      expect(update.response).toEqual(response);
    });
  });

  describe('markLogError', () => {
    it('should mark log as failed with Error object', () => {
      const log = createWechatLog(testUserId, 'oABC123', {});
      const error = new Error('Network timeout');

      const update = markLogError(log, error);

      expect(update.success).toBe(false);
      expect(update.error).toBe('Network timeout');
      expect(update.errorDetails).toBe(error);
    });

    it('should handle string errors', () => {
      const log = createSmsLog(testUserId, ['13800138000'], {});
      const error = 'API rate limit exceeded';

      const update = markLogError(log, error);

      expect(update.success).toBe(false);
      expect(update.error).toBe('API rate limit exceeded');
      expect(update.errorDetails).toBe(error);
    });

    it('should handle custom error objects', () => {
      const log = createEmailLog(testUserId, ['user@example.com'], {});
      const error = {
        code: 'SMTP_ERROR',
        message: 'Connection refused',
        details: { host: 'smtp.example.com', port: 587 },
      };

      const update = markLogError(log, error);

      expect(update.success).toBe(false);
      expect(update.error).toBe('Connection refused'); // Uses error.message
      expect(update.errorDetails).toEqual(error);
    });

    it('should handle errors without message property', () => {
      const log = createWechatLog(testUserId, 'oABC123', {});
      const error = { statusCode: 500, statusText: 'Internal Server Error' };

      const update = markLogError(log, error);

      expect(update.success).toBe(false);
      expect(update.errorDetails).toEqual(error);
    });
  });

  describe('Log Document Structure', () => {
    it('should have all required fields', () => {
      const log = createWechatLog(testUserId, 'oABC123', {}, testAlarmId);

      expect(log).toHaveProperty('type');
      expect(log).toHaveProperty('userId');
      expect(log).toHaveProperty('recipient');
      expect(log).toHaveProperty('params');
      expect(log).toHaveProperty('success');
      expect(log).toHaveProperty('createdAt');
      expect(log).toHaveProperty('alarmId');
    });

    it('should not have _id when created', () => {
      const log = createWechatLog(testUserId, 'oABC123', {});

      expect(log._id).toBeUndefined();
    });

    it('should not have response/error fields initially', () => {
      const log = createSmsLog(testUserId, ['13800138000'], {});

      expect(log).not.toHaveProperty('response');
      expect(log).not.toHaveProperty('error');
      expect(log).not.toHaveProperty('errorDetails');
    });

    it('should support different recipient types', () => {
      const wechatLog = createWechatLog(testUserId, 'oABC123', {});
      const smsLog = createSmsLog(testUserId, ['13800138000'], {});
      const emailLog = createEmailLog(testUserId, ['user@example.com'], {});

      // WeChat: string recipient
      expect(typeof wechatLog.recipient).toBe('string');

      // SMS: array recipient
      expect(Array.isArray(smsLog.recipient)).toBe(true);

      // Email: array recipient
      expect(Array.isArray(emailLog.recipient)).toBe(true);
    });
  });

  describe('Integration Scenarios', () => {
    it('should simulate complete log lifecycle - success', () => {
      // 1. Create log
      const log = createWechatLog(testUserId, 'oABC123', {
        template_id: 'test',
        data: {},
      });

      expect(log.success).toBe(false);

      // 2. Mark as successful
      const successUpdate = markLogSuccess(log, { errcode: 0, msgid: 123 });

      expect(successUpdate.success).toBe(true);
      expect(successUpdate.response).toBeDefined();
    });

    it('should simulate complete log lifecycle - failure', () => {
      // 1. Create log
      const log = createSmsLog(testUserId, ['13800138000'], {
        TemplateCode: 'SMS_123',
      });

      expect(log.success).toBe(false);

      // 2. Mark as failed
      const errorUpdate = markLogError(log, new Error('API quota exceeded'));

      expect(errorUpdate.success).toBe(false);
      expect(errorUpdate.error).toBe('API quota exceeded');
      expect(errorUpdate.errorDetails).toBeInstanceOf(Error);
    });

    it('should support updating log in MongoDB', () => {
      const log = createEmailLog(testUserId, ['user@example.com'], {});

      // Simulate MongoDB insertOne
      const insertedLog: NotificationLogDocument = {
        ...log,
        _id: new ObjectId(),
      };

      expect(insertedLog._id).toBeInstanceOf(ObjectId);

      // Simulate MongoDB updateOne with markLogSuccess
      const update = markLogSuccess(insertedLog, { messageId: 'test-123' });

      // Update would be applied via $set in MongoDB
      const updatedLog = { ...insertedLog, ...update };

      expect(updatedLog.success).toBe(true);
      expect(updatedLog.response).toBeDefined();
    });
  });

  describe('Type Discriminator', () => {
    it('should distinguish between notification types', () => {
      const wechatLog = createWechatLog(testUserId, 'oABC123', {});
      const smsLog = createSmsLog(testUserId, ['13800138000'], {});
      const emailLog = createEmailLog(testUserId, ['user@example.com'], {});

      expect(wechatLog.type).toBe('wechat');
      expect(smsLog.type).toBe('sms');
      expect(emailLog.type).toBe('email');

      // All should be different types
      expect(wechatLog.type).not.toBe(smsLog.type);
      expect(smsLog.type).not.toBe(emailLog.type);
      expect(emailLog.type).not.toBe(wechatLog.type);
    });
  });
});
