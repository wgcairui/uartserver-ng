/**
 * SMS Service Unit Tests
 *
 * 测试阿里云短信服务：
 * - Mock 模式测试
 * - 短信发送
 * - 签名生成
 * - 错误处理
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { SmsService } from '../../src/services/notification/sms.service';
import type { SmsParams, AliyunSmsResponse } from '../../src/services/notification/sms.service';

describe('SmsService', () => {
  describe('Mock Mode', () => {
    let service: SmsService;

    beforeEach(() => {
      service = new SmsService({ mockMode: true });
    });

    it('should send SMS in mock mode', async () => {
      const params: SmsParams = {
        SignName: '测试签名',
        TemplateCode: 'SMS_123456',
        TemplateParam: JSON.stringify({
          code: '123456',
          product: '告警系统',
        }),
      };

      const response = await service.sendSms(['13800138000'], params);

      expect(response.Code).toBe('OK');
      expect(response.Message).toBe('OK');
      expect(response.RequestId).toBeDefined();
      expect(response.BizId).toBeDefined();
    });

    it('should handle multiple phone numbers in mock mode', async () => {
      const params: SmsParams = {
        SignName: '测试签名',
        TemplateCode: 'SMS_123456',
        TemplateParam: JSON.stringify({ code: '123456' }),
      };

      const response = await service.sendSms(['13800138000', '13900139000'], params);

      expect(response.Code).toBe('OK');
      expect(response.Message).toBe('OK');
    });

    it('should generate unique RequestId for each request in mock mode', async () => {
      const params: SmsParams = {
        SignName: '测试签名',
        TemplateCode: 'SMS_123456',
        TemplateParam: JSON.stringify({ code: '123456' }),
      };

      const response1 = await service.sendSms(['13800138000'], params);
      await Bun.sleep(10); // Wait to ensure different RequestId
      const response2 = await service.sendSms(['13800138000'], params);

      expect(response1.RequestId).not.toBe(response2.RequestId);
      expect(response1.BizId).not.toBe(response2.BizId);
    });
  });

  describe('Real API Mode', () => {
    let service: SmsService;
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      service = new SmsService({
        accessKeyId: 'test-access-key-id',
        accessKeySecret: 'test-access-key-secret',
        mockMode: false,
      });
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('should send SMS successfully', async () => {
      globalThis.fetch = mock(async (url: string) => {
        // Verify URL contains required parameters
        expect(url).toContain('dysmsapi.aliyuncs.com');
        expect(url).toContain('Action=SendSms');
        expect(url).toContain('SignName=');
        expect(url).toContain('TemplateCode=');
        expect(url).toContain('Signature=');

        return new Response(
          JSON.stringify({
            RequestId: 'test-request-id',
            BizId: 'test-biz-id',
            Code: 'OK',
            Message: 'OK',
          }),
          { status: 200 }
        );
      }) as any;

      const params: SmsParams = {
        SignName: '测试签名',
        TemplateCode: 'SMS_123456',
        TemplateParam: JSON.stringify({ code: '123456' }),
      };

      const response = await service.sendSms(['13800138000'], params);

      expect(response.Code).toBe('OK');
      expect(response.Message).toBe('OK');
      expect(response.RequestId).toBe('test-request-id');
      expect(response.BizId).toBe('test-biz-id');
    });

    it('should handle Aliyun API error', async () => {
      globalThis.fetch = mock(async () => {
        return new Response(
          JSON.stringify({
            RequestId: 'test-request-id',
            Code: 'isv.BUSINESS_LIMIT_CONTROL',
            Message: '触发业务流控',
          }),
          { status: 200 }
        );
      }) as any;

      const params: SmsParams = {
        SignName: '测试签名',
        TemplateCode: 'SMS_123456',
        TemplateParam: JSON.stringify({ code: '123456' }),
      };

      await expect(service.sendSms(['13800138000'], params)).rejects.toThrow(
        'Aliyun SMS Error: isv.BUSINESS_LIMIT_CONTROL'
      );
    });

    it('should handle HTTP error', async () => {
      globalThis.fetch = mock(async () => {
        return new Response(null, { status: 500, statusText: 'Internal Server Error' });
      }) as any;

      const params: SmsParams = {
        SignName: '测试签名',
        TemplateCode: 'SMS_123456',
        TemplateParam: JSON.stringify({ code: '123456' }),
      };

      await expect(service.sendSms(['13800138000'], params)).rejects.toThrow('HTTP Error: 500');
    });

    it('should join multiple phone numbers with comma', async () => {
      let requestUrl = '';

      globalThis.fetch = mock(async (url: string) => {
        requestUrl = url;
        return new Response(
          JSON.stringify({
            RequestId: 'test-request-id',
            BizId: 'test-biz-id',
            Code: 'OK',
            Message: 'OK',
          }),
          { status: 200 }
        );
      }) as any;

      const params: SmsParams = {
        SignName: '测试签名',
        TemplateCode: 'SMS_123456',
        TemplateParam: JSON.stringify({ code: '123456' }),
      };

      await service.sendSms(['13800138000', '13900139000', '13700137000'], params);

      // Verify phone numbers are joined with comma
      expect(requestUrl).toContain('PhoneNumbers=13800138000%2C13900139000%2C13700137000');
    });

    it('should include all required parameters in request', async () => {
      let requestUrl = '';

      globalThis.fetch = mock(async (url: string) => {
        requestUrl = url;
        return new Response(
          JSON.stringify({
            RequestId: 'test-request-id',
            BizId: 'test-biz-id',
            Code: 'OK',
            Message: 'OK',
          }),
          { status: 200 }
        );
      }) as any;

      const params: SmsParams = {
        SignName: '测试签名',
        TemplateCode: 'SMS_123456',
        TemplateParam: JSON.stringify({ code: '123456' }),
      };

      await service.sendSms(['13800138000'], params);

      // Verify required parameters
      expect(requestUrl).toContain('Action=SendSms');
      expect(requestUrl).toContain('Format=JSON');
      expect(requestUrl).toContain('Version=2017-05-25');
      expect(requestUrl).toContain('AccessKeyId=test-access-key-id');
      expect(requestUrl).toContain('SignatureMethod=HMAC-SHA1');
      expect(requestUrl).toContain('SignatureVersion=1.0');
      expect(requestUrl).toContain('Timestamp=');
      expect(requestUrl).toContain('SignatureNonce=');
      expect(requestUrl).toContain('Signature=');
    });
  });

  describe('Signature Generation', () => {
    it('should generate valid signature', async () => {
      const service = new SmsService({
        accessKeyId: 'testid',
        accessKeySecret: 'testsecret',
        mockMode: false,
      });

      let requestUrl = '';

      globalThis.fetch = mock(async (url: string) => {
        requestUrl = url;
        return new Response(
          JSON.stringify({
            RequestId: 'test-request-id',
            BizId: 'test-biz-id',
            Code: 'OK',
            Message: 'OK',
          }),
          { status: 200 }
        );
      }) as any;

      const params: SmsParams = {
        SignName: 'test',
        TemplateCode: 'SMS_123',
        TemplateParam: '{}',
      };

      await service.sendSms(['13800138000'], params);

      // Verify signature is present and URL-encoded
      expect(requestUrl).toContain('Signature=');
      // Signature should be base64 encoded and URL encoded
      const signatureMatch = requestUrl.match(/Signature=([^&]+)/);
      expect(signatureMatch).toBeDefined();
      expect(signatureMatch![1]).toBeTruthy();
    });
  });

  describe('Percent Encoding', () => {
    it('should properly encode special characters', async () => {
      const service = new SmsService({
        accessKeyId: 'testid',
        accessKeySecret: 'testsecret',
        mockMode: false,
      });

      let requestUrl = '';

      globalThis.fetch = mock(async (url: string) => {
        requestUrl = url;
        return new Response(
          JSON.stringify({
            RequestId: 'test-request-id',
            BizId: 'test-biz-id',
            Code: 'OK',
            Message: 'OK',
          }),
          { status: 200 }
        );
      }) as any;

      const params: SmsParams = {
        SignName: '测试签名!',
        TemplateCode: 'SMS_123',
        TemplateParam: JSON.stringify({ key: 'value with spaces' }),
      };

      await service.sendSms(['13800138000'], params);

      // Verify special characters are encoded
      expect(requestUrl).toBeTruthy();
      // Chinese characters should be percent-encoded
      expect(requestUrl).not.toContain('测试');
      expect(requestUrl).toContain('%'); // Should contain encoded characters
    });
  });

  describe('Configuration Fallback', () => {
    it('should fallback to mock mode if credentials not configured', () => {
      const service = new SmsService({
        accessKeyId: '',
        accessKeySecret: '',
        mockMode: false, // Try real mode
      });

      // Should fallback to mock mode
      expect((service as any).mockMode).toBe(true);
    });

    it('should use provided credentials', () => {
      const service = new SmsService({
        accessKeyId: 'test-id',
        accessKeySecret: 'test-secret',
        mockMode: false,
      });

      expect((service as any).accessKeyId).toBe('test-id');
      expect((service as any).accessKeySecret).toBe('test-secret');
      expect((service as any).mockMode).toBe(false);
    });
  });

  describe('Phone Number Validation', () => {
    let service: SmsService;

    beforeEach(() => {
      service = new SmsService({ mockMode: true });
    });

    it('should accept valid Chinese mainland phone numbers', async () => {
      const validPhones = [
        '13800138000',
        '13900139000',
        '15012345678',
        '18612345678',
        '19912345678',
      ];

      const response = await service.sendSms(validPhones, {
        TemplateCode: 'SMS_TEST',
        TemplateParam: JSON.stringify({ code: '1234' }),
      });

      expect(response.Code).toBe('OK');
    });

    it('should filter out invalid phone numbers', async () => {
      const mixedPhones = [
        '13800138000',      // Valid
        '12345',            // Invalid: too short
        '1380013800a',      // Invalid: contains letter
        '+8613800138000',   // Invalid: contains +86
        '020-12345678',     // Invalid: landline format
      ];

      const response = await service.sendSms(mixedPhones, {
        TemplateCode: 'SMS_TEST',
        TemplateParam: JSON.stringify({ code: '1234' }),
      });

      // Should succeed with filtered valid phones
      expect(response.Code).toBe('OK');
    });

    it('should trim whitespace before validation', async () => {
      const phonesWithSpaces = [
        '  13800138000  ',
        ' 13900139000 ',
        '\t15012345678\t',
      ];

      const response = await service.sendSms(phonesWithSpaces, {
        TemplateCode: 'SMS_TEST',
        TemplateParam: JSON.stringify({ code: '1234' }),
      });

      expect(response.Code).toBe('OK');
    });

    it('should throw error when all phone numbers are invalid', async () => {
      const invalidPhones = [
        '12345',
        'abc',
        '+8613800138000',
        '123456789012',
      ];

      await expect(
        service.sendSms(invalidPhones, {
          TemplateCode: 'SMS_TEST',
          TemplateParam: JSON.stringify({ code: '1234' }),
        })
      ).rejects.toThrow('没有有效的手机号码');
    });

    it('should throw error when phone array is empty', async () => {
      await expect(
        service.sendSms([], {
          TemplateCode: 'SMS_TEST',
          TemplateParam: JSON.stringify({ code: '1234' }),
        })
      ).rejects.toThrow('没有有效的手机号码');
    });

    it('should validate phone number format: 1 + 10 digits', async () => {
      const testCases = [
        { phone: '13800138000', valid: true },   // Valid: starts with 1, 11 digits
        { phone: '23800138000', valid: false },  // Invalid: starts with 2
        { phone: '138001380', valid: false },    // Invalid: only 9 digits
        { phone: '138001380001', valid: false }, // Invalid: 12 digits
      ];

      for (const { phone, valid } of testCases) {
        if (valid) {
          const response = await service.sendSms([phone], {
            TemplateCode: 'SMS_TEST',
            TemplateParam: JSON.stringify({ code: '1234' }),
          });
          expect(response.Code).toBe('OK');
        } else {
          await expect(
            service.sendSms([phone], {
              TemplateCode: 'SMS_TEST',
              TemplateParam: JSON.stringify({ code: '1234' }),
            })
          ).rejects.toThrow('没有有效的手机号码');
        }
      }
    });
  });

  describe('Default Parameters', () => {
    it('should use default RegionId (cn-hangzhou)', async () => {
      const service = new SmsService({ mockMode: true });

      expect((service as any).defaultRegionId).toBe('cn-hangzhou');
    });

    it('should use default SignName (雷迪司科技湖北有限公司)', async () => {
      const service = new SmsService({ mockMode: true });

      expect((service as any).defaultSignName).toBe('雷迪司科技湖北有限公司');
    });

    it('should allow custom RegionId and SignName via constructor', async () => {
      const service = new SmsService({
        mockMode: true,
        regionId: 'cn-beijing',
        signName: '自定义公司',
      });

      expect((service as any).defaultRegionId).toBe('cn-beijing');
      expect((service as any).defaultSignName).toBe('自定义公司');
    });

    it('should apply default RegionId when not provided in params', async () => {
      const service = new SmsService({
        mockMode: false,
        accessKeyId: 'test-id',
        accessKeySecret: 'test-secret',
      });

      let requestUrl = '';
      globalThis.fetch = mock(async (url: string) => {
        requestUrl = url;
        return new Response(
          JSON.stringify({
            RequestId: 'test-request-id',
            Code: 'OK',
            Message: 'OK',
          }),
          { status: 200 }
        );
      }) as any;

      await service.sendSms(['13800138000'], {
        TemplateCode: 'SMS_TEST',
        TemplateParam: JSON.stringify({ code: '1234' }),
        // RegionId not provided
      });

      // Should use default cn-hangzhou
      expect(requestUrl).toContain('RegionId=cn-hangzhou');
    });

    it('should apply default SignName when not provided in params', async () => {
      const service = new SmsService({
        mockMode: false,
        accessKeyId: 'test-id',
        accessKeySecret: 'test-secret',
      });

      let requestUrl = '';
      globalThis.fetch = mock(async (url: string) => {
        requestUrl = url;
        return new Response(
          JSON.stringify({
            RequestId: 'test-request-id',
            Code: 'OK',
            Message: 'OK',
          }),
          { status: 200 }
        );
      }) as any;

      await service.sendSms(['13800138000'], {
        TemplateCode: 'SMS_TEST',
        TemplateParam: JSON.stringify({ code: '1234' }),
        // SignName not provided
      });

      // Should use default SignName (URL encoded)
      expect(requestUrl).toContain('SignName=');
    });

    it('should allow user-provided params to override defaults', async () => {
      const service = new SmsService({
        mockMode: false,
        accessKeyId: 'test-id',
        accessKeySecret: 'test-secret',
      });

      let requestUrl = '';
      globalThis.fetch = mock(async (url: string) => {
        requestUrl = url;
        return new Response(
          JSON.stringify({
            RequestId: 'test-request-id',
            Code: 'OK',
            Message: 'OK',
          }),
          { status: 200 }
        );
      }) as any;

      await service.sendSms(['13800138000'], {
        SignName: '用户自定义签名',
        RegionId: 'cn-shanghai',
        TemplateCode: 'SMS_TEST',
        TemplateParam: JSON.stringify({ code: '1234' }),
      });

      expect(requestUrl).toContain('RegionId=cn-shanghai');
      expect(requestUrl).toContain('SignName=');
      expect(requestUrl).not.toContain('RegionId=cn-hangzhou');
    });

    it('should read defaults from config if available', async () => {
      // This tests the config priority: options > config > hardcoded default
      const service = new SmsService({ mockMode: true });

      // Should use config values if set, otherwise hardcoded defaults
      expect((service as any).defaultRegionId).toBeTruthy();
      expect((service as any).defaultSignName).toBeTruthy();
    });
  });
});
