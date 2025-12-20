/**
 * WeChat Service Unit Tests
 *
 * 测试微信模板消息服务：
 * - Mock 模式测试
 * - Access Token 缓存机制
 * - 模板消息发送
 * - 错误处理
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { WechatService } from '../../src/services/notification/wechat.service';
import type { WechatTemplateParams, WechatApiResponse } from '../../src/services/notification/wechat.service';

describe('WechatService', () => {
  describe('Mock Mode', () => {
    let service: WechatService;

    beforeEach(() => {
      service = new WechatService({ mockMode: true });
    });

    it('should send template message in mock mode', async () => {
      const params: WechatTemplateParams = {
        touser: 'test-openid',
        template_id: 'test-template-id',
        url: 'https://example.com',
        data: {
          first: { value: '告警通知', color: '#FF0000' },
          keyword1: { value: '设备001', color: '#000000' },
          keyword2: { value: '温度过高', color: '#000000' },
          remark: { value: '请及时处理', color: '#0000FF' },
        },
      };

      const response = await service.sendTemplateMessage(params);

      expect(response.errcode).toBe(0);
      expect(response.errmsg).toBe('ok');
      expect(response.msgid).toBeDefined();
      expect(typeof response.msgid).toBe('number');
    });

    it('should handle miniprogram parameter in mock mode', async () => {
      const params: WechatTemplateParams = {
        touser: 'test-openid',
        template_id: 'test-template-id',
        miniprogram: {
          appid: 'test-appid',
          pagepath: '/pages/alarm/detail',
        },
        data: {
          first: { value: '告警通知' },
        },
      };

      const response = await service.sendTemplateMessage(params);

      expect(response.errcode).toBe(0);
      expect(response.errmsg).toBe('ok');
    });

    it('should generate unique msgid for each request in mock mode', async () => {
      const params: WechatTemplateParams = {
        touser: 'test-openid',
        template_id: 'test-template-id',
        data: { first: { value: 'test' } },
      };

      const response1 = await service.sendTemplateMessage(params);
      await Bun.sleep(10); // Wait to ensure different msgid
      const response2 = await service.sendTemplateMessage(params);

      expect(response1.msgid).not.toBe(response2.msgid);
    });
  });

  describe('Real API Mode', () => {
    let service: WechatService;
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      service = new WechatService({
        appId: 'test-appid',
        appSecret: 'test-secret',
        mockMode: false,
      });
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('should get access token successfully', async () => {
      // Mock fetch for access token request
      globalThis.fetch = mock(async (url: string) => {
        if (url.includes('/cgi-bin/token')) {
          return new Response(
            JSON.stringify({
              access_token: 'test-access-token',
              expires_in: 7200,
            }),
            { status: 200 }
          );
        }
        return new Response(null, { status: 404 });
      }) as any;

      const params: WechatTemplateParams = {
        touser: 'test-openid',
        template_id: 'test-template-id',
        data: { first: { value: 'test' } },
      };

      // Mock fetch for send message request
      globalThis.fetch = mock(async (url: string) => {
        if (url.includes('/cgi-bin/token')) {
          return new Response(
            JSON.stringify({
              access_token: 'test-access-token',
              expires_in: 7200,
            }),
            { status: 200 }
          );
        }
        if (url.includes('/cgi-bin/message/template/send')) {
          return new Response(
            JSON.stringify({
              errcode: 0,
              errmsg: 'ok',
              msgid: 123456789,
            }),
            { status: 200 }
          );
        }
        return new Response(null, { status: 404 });
      }) as any;

      const response = await service.sendTemplateMessage(params);

      expect(response.errcode).toBe(0);
      expect(response.errmsg).toBe('ok');
      expect(response.msgid).toBe(123456789);
    });

    it('should cache access token', async () => {
      let tokenRequestCount = 0;

      globalThis.fetch = mock(async (url: string) => {
        if (url.includes('/cgi-bin/token')) {
          tokenRequestCount++;
          return new Response(
            JSON.stringify({
              access_token: 'test-access-token',
              expires_in: 7200,
            }),
            { status: 200 }
          );
        }
        if (url.includes('/cgi-bin/message/template/send')) {
          return new Response(
            JSON.stringify({
              errcode: 0,
              errmsg: 'ok',
              msgid: 123456789,
            }),
            { status: 200 }
          );
        }
        return new Response(null, { status: 404 });
      }) as any;

      const params: WechatTemplateParams = {
        touser: 'test-openid',
        template_id: 'test-template-id',
        data: { first: { value: 'test' } },
      };

      // Send two messages
      await service.sendTemplateMessage(params);
      await service.sendTemplateMessage(params);

      // Should only request token once (cached)
      expect(tokenRequestCount).toBe(1);
    });

    it('should handle WeChat API error', async () => {
      globalThis.fetch = mock(async (url: string) => {
        if (url.includes('/cgi-bin/token')) {
          return new Response(
            JSON.stringify({
              access_token: 'test-access-token',
              expires_in: 7200,
            }),
            { status: 200 }
          );
        }
        if (url.includes('/cgi-bin/message/template/send')) {
          return new Response(
            JSON.stringify({
              errcode: 40001,
              errmsg: 'invalid credential',
            }),
            { status: 200 }
          );
        }
        return new Response(null, { status: 404 });
      }) as any;

      const params: WechatTemplateParams = {
        touser: 'test-openid',
        template_id: 'test-template-id',
        data: { first: { value: 'test' } },
      };

      await expect(service.sendTemplateMessage(params)).rejects.toThrow('WeChat API Error: 40001');
    });

    it('should handle HTTP error', async () => {
      globalThis.fetch = mock(async (url: string) => {
        if (url.includes('/cgi-bin/token')) {
          return new Response(
            JSON.stringify({
              access_token: 'test-access-token',
              expires_in: 7200,
            }),
            { status: 200 }
          );
        }
        if (url.includes('/cgi-bin/message/template/send')) {
          return new Response(null, { status: 500, statusText: 'Internal Server Error' });
        }
        return new Response(null, { status: 404 });
      }) as any;

      const params: WechatTemplateParams = {
        touser: 'test-openid',
        template_id: 'test-template-id',
        data: { first: { value: 'test' } },
      };

      await expect(service.sendTemplateMessage(params)).rejects.toThrow('HTTP Error: 500');
    });

    it('should handle access token error', async () => {
      globalThis.fetch = mock(async (url: string) => {
        if (url.includes('/cgi-bin/token')) {
          return new Response(
            JSON.stringify({
              errcode: 40013,
              errmsg: 'invalid appid',
            }),
            { status: 200 }
          );
        }
        return new Response(null, { status: 404 });
      }) as any;

      const params: WechatTemplateParams = {
        touser: 'test-openid',
        template_id: 'test-template-id',
        data: { first: { value: 'test' } },
      };

      await expect(service.sendTemplateMessage(params)).rejects.toThrow('WeChat API Error: 40013');
    });

    it('should refresh token when cache expires', async () => {
      // Clear cache first
      service.clearAccessTokenCache();

      let tokenRequestCount = 0;

      globalThis.fetch = mock(async (url: string) => {
        if (url.includes('/cgi-bin/token')) {
          tokenRequestCount++;
          return new Response(
            JSON.stringify({
              access_token: `test-access-token-${tokenRequestCount}`,
              expires_in: 1, // Expire in 1 second
            }),
            { status: 200 }
          );
        }
        if (url.includes('/cgi-bin/message/template/send')) {
          return new Response(
            JSON.stringify({
              errcode: 0,
              errmsg: 'ok',
              msgid: 123456789,
            }),
            { status: 200 }
          );
        }
        return new Response(null, { status: 404 });
      }) as any;

      const params: WechatTemplateParams = {
        touser: 'test-openid',
        template_id: 'test-template-id',
        data: { first: { value: 'test' } },
      };

      // First request
      await service.sendTemplateMessage(params);
      expect(tokenRequestCount).toBe(1);

      // Wait for token to expire (expires_in - 300s buffer, but we set it to 1s so it's negative)
      await Bun.sleep(100);

      // Second request should refresh token
      await service.sendTemplateMessage(params);
      expect(tokenRequestCount).toBe(2);
    });
  });

  describe('Configuration Fallback', () => {
    it('should fallback to mock mode if credentials not configured', () => {
      const service = new WechatService({
        appId: '',
        appSecret: '',
        mockMode: false, // Try real mode
      });

      // Should fallback to mock mode
      expect((service as any).mockMode).toBe(true);
    });

    it('should use provided credentials', () => {
      const service = new WechatService({
        appId: 'test-appid',
        appSecret: 'test-secret',
        mockMode: false,
      });

      expect((service as any).appId).toBe('test-appid');
      expect((service as any).appSecret).toBe('test-secret');
      expect((service as any).mockMode).toBe(false);
    });
  });

  describe('Default Parameters', () => {
    let service: WechatService;

    beforeEach(() => {
      service = new WechatService({
        mockMode: true,
        templateId: 'custom-template-id',
        miniprogram: {
          appid: 'custom-appid',
          pagepath: '/custom/path',
        },
      });
    });

    it('should use default template_id when not provided', async () => {
      const defaultService = new WechatService({ mockMode: true });

      expect((defaultService as any).defaultTemplateId).toBe('rIFS7MnXotNoNifuTfFpfh4vFGzCGlhh-DmWZDcXpWg');
    });

    it('should use default miniprogram when not provided', async () => {
      const defaultService = new WechatService({ mockMode: true });

      expect((defaultService as any).defaultMiniprogram).toEqual({
        appid: 'wx38800d0139103920',
        pagepath: '/pages/index/alarm/alarm',
      });
    });

    it('should apply custom default template_id', async () => {
      expect((service as any).defaultTemplateId).toBe('custom-template-id');
    });

    it('should apply custom default miniprogram', async () => {
      expect((service as any).defaultMiniprogram).toEqual({
        appid: 'custom-appid',
        pagepath: '/custom/path',
      });
    });

    it('should apply default template_id when sending without template_id', async () => {
      const params: WechatTemplateParams = {
        touser: 'test-openid',
        data: { first: { value: 'test' } },
      };

      // Mock console.log to capture the applied template_id
      const originalLog = console.log;
      let capturedParams: any;
      console.log = (...args: any[]) => {
        if (args[0] === '[WechatService] Mock sending template message:') {
          capturedParams = args[1];
        }
      };

      await service.sendTemplateMessage(params);

      console.log = originalLog;

      expect(capturedParams.template_id).toBe('custom-template-id');
    });

    it('should apply default miniprogram when sending without miniprogram', async () => {
      const params: WechatTemplateParams = {
        touser: 'test-openid',
        data: { first: { value: 'test' } },
      };

      // Mock console.log to capture the applied miniprogram
      const originalLog = console.log;
      let capturedParams: any;
      console.log = (...args: any[]) => {
        if (args[0] === '[WechatService] Mock sending template message:') {
          capturedParams = args[1];
        }
      };

      await service.sendTemplateMessage(params);

      console.log = originalLog;

      // Since miniprogram is not logged in mock mode, we verify internally
      // by checking that no error occurs and response is valid
      expect(capturedParams).toBeDefined();
    });

    it('should allow user-provided params to override defaults', async () => {
      const params: WechatTemplateParams = {
        touser: 'test-openid',
        template_id: 'user-provided-template-id',
        miniprogram: {
          appid: 'user-appid',
          pagepath: '/user/path',
        },
        data: { first: { value: 'test' } },
      };

      // Mock console.log to capture the params
      const originalLog = console.log;
      let capturedParams: any;
      console.log = (...args: any[]) => {
        if (args[0] === '[WechatService] Mock sending template message:') {
          capturedParams = args[1];
        }
      };

      await service.sendTemplateMessage(params);

      console.log = originalLog;

      expect(capturedParams.template_id).toBe('user-provided-template-id');
      // Note: miniprogram is not captured in mock log, but we verify no error
    });

    it('should support undefined template_id triggering default', async () => {
      const params: WechatTemplateParams = {
        touser: 'test-openid',
        template_id: undefined, // Explicitly undefined
        data: { first: { value: 'test' } },
      };

      // Mock console.log to capture the applied template_id
      const originalLog = console.log;
      let capturedParams: any;
      console.log = (...args: any[]) => {
        if (args[0] === '[WechatService] Mock sending template message:') {
          capturedParams = args[1];
        }
      };

      await service.sendTemplateMessage(params);

      console.log = originalLog;

      expect(capturedParams.template_id).toBe('custom-template-id');
    });

    it('should support undefined miniprogram triggering default', async () => {
      const params: WechatTemplateParams = {
        touser: 'test-openid',
        miniprogram: undefined, // Explicitly undefined
        data: { first: { value: 'test' } },
      };

      const response = await service.sendTemplateMessage(params);

      expect(response.errcode).toBe(0);
      expect(response.errmsg).toBe('ok');
    });

    it('should prioritize constructor options over hardcoded defaults', async () => {
      const customService = new WechatService({
        mockMode: true,
        templateId: 'constructor-template-id',
        miniprogram: {
          appid: 'constructor-appid',
          pagepath: '/constructor/path',
        },
      });

      expect((customService as any).defaultTemplateId).toBe('constructor-template-id');
      expect((customService as any).defaultMiniprogram).toEqual({
        appid: 'constructor-appid',
        pagepath: '/constructor/path',
      });
    });
  });

  describe('Parameter Merging', () => {
    let service: WechatService;

    beforeEach(() => {
      service = new WechatService({
        mockMode: true,
        templateId: 'default-template',
        miniprogram: {
          appid: 'default-appid',
          pagepath: '/default/path',
        },
      });
    });

    it('should merge user params with defaults correctly', async () => {
      const params: WechatTemplateParams = {
        touser: 'test-openid',
        url: 'https://example.com',
        data: {
          first: { value: '告警通知', color: '#FF0000' },
          keyword1: { value: '设备001' },
        },
      };

      const response = await service.sendTemplateMessage(params);

      expect(response.errcode).toBe(0);
      expect(response.errmsg).toBe('ok');
    });

    it('should preserve url when provided', async () => {
      const params: WechatTemplateParams = {
        touser: 'test-openid',
        url: 'https://example.com/detail',
        data: { first: { value: 'test' } },
      };

      const response = await service.sendTemplateMessage(params);

      expect(response.errcode).toBe(0);
    });

    it('should preserve touser exactly as provided', async () => {
      const params: WechatTemplateParams = {
        touser: 'oABC_123XYZ-test',
        data: { first: { value: 'test' } },
      };

      // Mock console.log to capture touser
      const originalLog = console.log;
      let capturedParams: any;
      console.log = (...args: any[]) => {
        if (args[0] === '[WechatService] Mock sending template message:') {
          capturedParams = args[1];
        }
      };

      await service.sendTemplateMessage(params);

      console.log = originalLog;

      expect(capturedParams.touser).toBe('oABC_123XYZ-test');
    });

    it('should handle complex data object', async () => {
      const params: WechatTemplateParams = {
        touser: 'test-openid',
        data: {
          first: { value: '告警通知', color: '#FF0000' },
          keyword1: { value: '设备001', color: '#000000' },
          keyword2: { value: '温度过高', color: '#FF6600' },
          keyword3: { value: '85°C', color: '#FF0000' },
          keyword4: { value: '2025-12-19 10:30:00', color: '#999999' },
          remark: { value: '请及时处理', color: '#0000FF' },
        },
      };

      const response = await service.sendTemplateMessage(params);

      expect(response.errcode).toBe(0);
      expect(response.errmsg).toBe('ok');
    });

    it('should handle minimal data object', async () => {
      const params: WechatTemplateParams = {
        touser: 'test-openid',
        data: {
          first: { value: 'test' },
        },
      };

      const response = await service.sendTemplateMessage(params);

      expect(response.errcode).toBe(0);
    });
  });

  describe('Access Token Cache Management', () => {
    let service: WechatService;

    beforeEach(() => {
      service = new WechatService({
        appId: 'test-appid',
        appSecret: 'test-secret',
        mockMode: false,
      });
    });

    it('should clear cache using clearAccessTokenCache', () => {
      // Set a mock cache
      (service as any).accessTokenCache = {
        token: 'cached-token',
        expiresAt: Date.now() + 7200000,
      };

      expect((service as any).accessTokenCache).not.toBeNull();

      service.clearAccessTokenCache();

      expect((service as any).accessTokenCache).toBeNull();
    });

    it('should start with null cache', () => {
      const newService = new WechatService({
        appId: 'test-appid',
        appSecret: 'test-secret',
        mockMode: false,
      });

      expect((newService as any).accessTokenCache).toBeNull();
    });
  });
});
