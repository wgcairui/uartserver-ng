/**
 * Phase 8.4 - WeChat Integration Tests
 *
 * 微信集成 API 集成测试
 * 测试公众号、小程序二维码和解绑功能
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import type { App } from '../../src/index';

// ============================================================================
// Test Setup
// ============================================================================

const api = treaty<App>('localhost:3333');

// Test user credentials
const testUser = {
  username: 'testuser',
  password: 'Test123456',
};

let accessToken = '';
let userId = '';

// ============================================================================
// Setup - 登录获取 token
// ============================================================================

beforeAll(async () => {
  // 1. 注册测试用户 (如果不存在)
  try {
    await api.api.auth.register.post({
      data: {
        username: testUser.username,
        password: testUser.password,
        confirmPassword: testUser.password,
        email: 'testuser@example.com',
      },
    });
  } catch (error) {
    // 用户可能已存在,忽略错误
  }

  // 2. 登录获取 token
  const { data: loginData } = await api.api.auth.login.post({
    data: {
      username: testUser.username,
      password: testUser.password,
    },
  });

  expect(loginData?.status).toBe('ok');
  expect(loginData?.data?.accessToken).toBeDefined();

  accessToken = loginData!.data!.accessToken;
  userId = loginData!.data!.user._id; // userId 在 data.user._id 中

  console.log('[Test Setup] Login successful, userId:', userId);
});

// ============================================================================
// Test Suite: WeChat QR Code APIs
// ============================================================================

describe('Phase 8.4 - WeChat Integration', () => {
  // ============================================================================
  // 1. GET /api/wechat/official-account/qrcode
  // ============================================================================

  describe('GET /api/wechat/official-account/qrcode', () => {
    test('should require authentication', async () => {
      const { data } = await api.api.wechat['official-account'].qrcode.get();

      // 应该返回业务层面的错误 (因为没有提供 token)
      expect(data?.status).toBe('error');
      expect(data?.message).toContain('Unauthorized');
    });

    test('should return official account QR code with valid token', async () => {
      const { data } = await api.api.wechat['official-account'].qrcode.get({
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      // 注意: 这个测试可能失败,如果没有配置微信公众号 appid/secret
      // 验证响应格式,允许配置缺失的错误
      if (data?.status === 'error') {
        console.warn(
          '[Test Warning] Official account QR code failed (微信配置可能未设置):',
          data.message
        );
        expect(data.message).toContain('微信公众号配置未设置');
        return;
      }

      expect(data?.status).toBe('ok');
      if (data?.data) {
        expect(data.data.ticket).toBeDefined();
        expect(data.data.url).toContain('showqrcode');
        expect(data.data.expireSeconds).toBe(360);
      }
    });
  });

  // ============================================================================
  // 2. GET /api/wechat/mini-program/qrcode
  // ============================================================================

  describe('GET /api/wechat/mini-program/qrcode', () => {
    test('should require authentication', async () => {
      const { data } = await api.api.wechat['mini-program'].qrcode.get();

      expect(data?.status).toBe('error');
      expect(data?.message).toContain('Unauthorized');
    });

    test('should return mini-program QR code with valid token', async () => {
      const { data } = await api.api.wechat['mini-program'].qrcode.get({
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      // 注意: 这个测试可能失败,如果没有配置微信小程序 appid/secret
      // 验证响应格式,允许配置缺失的错误
      if (data?.status === 'error') {
        console.warn(
          '[Test Warning] Mini-program QR code failed (微信配置可能未设置):',
          data.message
        );
        expect(data.message).toContain('微信小程序配置未设置');
        return;
      }

      expect(data?.status).toBe('ok');
      if (data?.data) {
        expect(data.data.url).toContain('data:image/png;base64,');
        expect(data.data.expireSeconds).toBe(0); // 永久有效
      }
    });
  });

  // ============================================================================
  // 3. GET /api/wechat/qrcode/:scene
  // ============================================================================

  describe('GET /api/wechat/qrcode/:scene', () => {
    test('should require authentication', async () => {
      const { data } = await api.api.wechat.qrcode({
        scene: 'test-scene',
      }).get();

      expect(data?.status).toBe('error');
      expect(data?.message).toContain('Unauthorized');
    });

    test('should generate QR code with scene', async () => {
      const { data } = await api.api.wechat.qrcode({
        scene: 'test-scene-123',
      }).get({
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      expect(data?.status).toBe('ok');
      expect(data?.data?.qrcode).toBeDefined();
      expect(data?.data?.qrcode).toContain('data:image/png;base64,');
    });

    test('should generate QR code with custom width and margin', async () => {
      const { data } = await api.api.wechat.qrcode({
        scene: 'test-scene-456',
      }).get({
        query: {
          width: 512,
          margin: 2,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      expect(data?.status).toBe('ok');
      expect(data?.data?.qrcode).toBeDefined();
      expect(data?.data?.qrcode).toContain('data:image/png;base64,');
    });

    test('should reject invalid scene (too long)', async () => {
      const longScene = 'a'.repeat(201); // 超过 200 字符限制

      const { data, error } = await api.api.wechat.qrcode({
        scene: longScene,
      }).get({
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      // 应该验证失败
      expect(error).toBeDefined();
    });
  });

  // ============================================================================
  // 4. DELETE /api/wechat/unbind
  // ============================================================================

  describe('DELETE /api/wechat/unbind', () => {
    test('should require authentication', async () => {
      const { data } = await api.api.wechat.unbind.delete({});

      expect(data?.status).toBe('error');
      expect(data?.message).toContain('Unauthorized');
    });

    test('should handle unbind when user has no WeChat binding', async () => {
      const { data } = await api.api.wechat.unbind.delete(
        {}, // 空body
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      expect(data?.status).toBe('ok');
      expect(data?.message).toContain('未绑定');
      expect(data?.data?.success).toBe(true);
    });

    // TODO: 测试实际解绑场景 (需要先绑定微信用户)
    // test('should unbind WeChat successfully', async () => {
    //   // 1. 先创建并绑定微信用户
    //   // 2. 调用解绑接口
    //   // 3. 验证解绑成功
    // });
  });

  // ============================================================================
  // 综合测试: 完整工作流
  // ============================================================================

  describe('Complete WeChat Integration Workflow', () => {
    test('should handle complete QR code generation workflow', async () => {
      // 1. 生成通用二维码
      const { data: qrData } = await api.api.wechat.qrcode({
        scene: userId, // 使用userId作为场景值
      }).get({
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      expect(qrData?.status).toBe('ok');
      expect(qrData?.data?.qrcode).toBeDefined();
      expect(qrData?.data?.qrcode).toContain('data:image/png;base64,');

      console.log('[Test] QR code generated successfully for userId:', userId);

      // 2. 检查解绑状态 (应该返回未绑定)
      const { data: unbindData } = await api.api.wechat.unbind.delete(
        {},
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      expect(unbindData?.status).toBe('ok');
      expect(unbindData?.data?.success).toBe(true);
    });
  });
});
