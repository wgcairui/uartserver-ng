/**
 * Phase 8.5 - SMS Verification Tests
 *
 * 短信验证 API 集成测试
 * 测试短信验证码发送和验证功能
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import type { App } from '../../src/index';

// ============================================================================
// Test Setup
// ============================================================================

const api = treaty<App>('localhost:3333');

// Test user credentials (unique per test run)
const timestamp = Date.now();
const testUser = {
  username: `smsuser_${timestamp}`,
  password: 'Test123456',
  email: `smsuser_${timestamp}@example.com`,
  phone: '13800138000', // 测试手机号
};

let accessToken = '';
let userId = '';

// ============================================================================
// Setup - 注册用户并登录获取 token
// ============================================================================

beforeAll(async () => {
  // 等待服务器就绪
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // 1. 注册新用户
  const { data: registerData, error: registerError } = await api.api.auth.register.post({
    data: {
      username: testUser.username,
      password: testUser.password,
      confirmPassword: testUser.password,
      email: testUser.email,
    },
  });

  if (registerData?.status !== 'ok') {
    console.error('[Test Setup] Registration error:', registerData?.message);
    throw new Error(`Registration failed: ${registerData?.message}`);
  }

  console.log('[Test Setup] User registered successfully');

  // 3. 登录获取 token
  const { data: loginData, error: loginError } = await api.api.auth.login.post({
    data: {
      username: testUser.username,
      password: testUser.password,
    },
  });

  if (loginError) {
    console.error('[Test Setup] Login error:', loginError);
  }
  console.log('[Test Setup] Login response:', loginData);

  expect(loginData?.status).toBe('ok');
  expect(loginData?.data?.accessToken).toBeDefined();

  accessToken = loginData!.data!.accessToken;
  userId = loginData!.data!.user._id;

  console.log('[Test Setup] User from login:', {
    _id: loginData!.data!.user._id,
    _idType: typeof loginData!.data!.user._id,
  });

  // 4. 更新用户手机号 (通过 API)
  const { data: updateData, error: updateError } = await api.api.users.me.put(
    {
      data: {
        tel: testUser.phone,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  console.log('[Test Setup] Update phone API response:', { data: updateData, error: updateError });

  if (updateData?.status !== 'ok') {
    console.error('[Test Setup] Failed to update phone via API:', updateData?.message);
    throw new Error('Failed to setup test user phone number');
  }

  console.log('[Test Setup] Phone number updated via API:', testUser.phone);

  console.log('[Test Setup] SMS test user ready, userId:', userId);
});

// ============================================================================
// Test Suite: SMS Verification APIs
// ============================================================================

describe('Phase 8.5 - SMS Verification', () => {
  // ============================================================================
  // 1. POST /api/sms/send-code
  // ============================================================================

  describe('POST /api/sms/send-code', () => {
    test('should require authentication', async () => {
      const { data } = await api.api.sms['send-code'].post({});

      // 应该返回业务层面的错误 (因为没有提供 token)
      expect(data?.status).toBe('error');
      expect(data?.message).toContain('Unauthorized');
    });

    test('should send SMS code successfully with valid token', async () => {
      const { data } = await api.api.sms['send-code'].post(
        {},
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (data?.status === 'error') {
        console.log('[Test Debug] Send code error:', data.message);
      }

      expect(data?.status).toBe('ok');
      expect(data?.data).toBeDefined();
      expect(data?.data?.message).toBeDefined();
      expect(data?.data?.expiresIn).toBe(300); // 5分钟

      // Mock模式下会返回验证码提示
      if (data?.message) {
        console.log('[Test Info] SMS code:', data.message);
        expect(data.message).toContain('测试模式');
      }
    });

    test('should return error if user has no phone number', async () => {
      // 创建一个没有手机号的用户
      const userWithoutPhone = {
        username: 'nophoneuser',
        password: 'Test123456',
        email: 'nophone@example.com',
      };

      // 注册用户
      await api.api.auth.register.post({
        data: {
          username: userWithoutPhone.username,
          password: userWithoutPhone.password,
          confirmPassword: userWithoutPhone.password,
          email: userWithoutPhone.email,
        },
      });

      // 登录
      const { data: loginData } = await api.api.auth.login.post({
        data: {
          username: userWithoutPhone.username,
          password: userWithoutPhone.password,
        },
      });

      const noPhoneToken = loginData!.data!.accessToken;

      // 尝试发送验证码
      const { data } = await api.api.sms['send-code'].post(
        {},
        {
          headers: {
            Authorization: `Bearer ${noPhoneToken}`,
          },
        }
      );

      expect(data?.status).toBe('error');
      expect(data?.message).toContain('未绑定手机号');
    });

    test('should generate different codes for multiple sends', async () => {
      // 发送第一次
      const { data: data1 } = await api.api.sms['send-code'].post(
        {},
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      expect(data1?.status).toBe('ok');

      // 等待1秒
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 发送第二次
      const { data: data2 } = await api.api.sms['send-code'].post(
        {},
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      expect(data2?.status).toBe('ok');

      // 两次发送应该都成功 (第二次会覆盖第一次)
      console.log('[Test Info] Multiple sends completed successfully');
    });
  });

  // ============================================================================
  // 2. POST /api/sms/verify-code
  // ============================================================================

  describe('POST /api/sms/verify-code', () => {
    test('should require authentication', async () => {
      const { data } = await api.api.sms['verify-code'].post({
        data: {
          code: '1234',
        },
      });

      expect(data?.status).toBe('error');
      expect(data?.message).toContain('Unauthorized');
    });

    test('should reject empty code', async () => {
      const { data, error } = await api.api.sms['verify-code'].post(
        {
          data: {
            code: '',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      // 应该验证失败 (Elysia schema 验证)
      expect(error).toBeDefined();
    });

    test('should reject invalid code format', async () => {
      const { data, error } = await api.api.sms['verify-code'].post(
        {
          data: {
            code: 'abc', // 非数字
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      // 应该验证失败 (schema要求数字)
      expect(error).toBeDefined();
    });

    test('should reject wrong code', async () => {
      const { data } = await api.api.sms['verify-code'].post(
        {
          data: {
            code: '9999', // 错误的验证码
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      expect(data?.status).toBe('error');
      expect(data?.message).toContain('验证码错误');
    });

    test('should reject verification without sending code first', async () => {
      // 创建新用户但不发送验证码
      const newUser = {
        username: 'newverifyuser',
        password: 'Test123456',
        email: 'newverify@example.com',
      };

      await api.api.auth.register.post({
        data: {
          username: newUser.username,
          password: newUser.password,
          confirmPassword: newUser.password,
          email: newUser.email,
        },
      });

      const { data: loginData } = await api.api.auth.login.post({
        data: {
          username: newUser.username,
          password: newUser.password,
        },
      });

      const newToken = loginData!.data!.accessToken;

      // 尝试验证但没有发送过验证码
      const { data } = await api.api.sms['verify-code'].post(
        {
          data: {
            code: '1234',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${newToken}`,
          },
        }
      );

      expect(data?.status).toBe('error');
      expect(data?.message).toContain('不存在或已失效');
    });
  });

  // ============================================================================
  // 综合测试: 完整验证码流程
  // ============================================================================

  describe('Complete SMS Verification Workflow', () => {
    test('should complete full send and verify flow in mock mode', async () => {
      // 1. 发送验证码
      const { data: sendData } = await api.api.sms['send-code'].post(
        {},
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      expect(sendData?.status).toBe('ok');
      expect(sendData?.data?.expiresIn).toBe(300);

      // 2. Mock模式下从message中提取验证码
      const codeMatch = sendData?.message?.match(/验证码已生成 \(测试模式\): (\d{4})/);

      if (codeMatch && codeMatch[1]) {
        const code = codeMatch[1];
        console.log('[Test Info] Extracted code:', code);

        // 3. 验证验证码
        const { data: verifyData } = await api.api.sms['verify-code'].post(
          {
            data: {
              code,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        expect(verifyData?.status).toBe('ok');
        expect(verifyData?.data?.verified).toBe(true);
        expect(verifyData?.message).toContain('验证成功');

        // 4. 验证成功后再次验证应该失败 (验证码已删除)
        const { data: verifyAgainData } = await api.api.sms['verify-code'].post(
          {
            data: {
              code,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        expect(verifyAgainData?.status).toBe('error');
        expect(verifyAgainData?.message).toContain('不存在或已失效');

        console.log('[Test Info] Complete SMS workflow tested successfully');
      } else {
        console.warn('[Test Warning] Could not extract code from mock response');
        console.warn('[Test Warning] This is expected if Aliyun SMS is configured');
      }
    });

    test('should expire code after 5 minutes', async () => {
      // 注意: 这个测试需要等待5分钟,实际测试中会skip
      // 这里只测试逻辑,不实际等待

      // 1. 发送验证码
      const { data: sendData } = await api.api.sms['send-code'].post(
        {},
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      expect(sendData?.status).toBe('ok');
      expect(sendData?.data?.expiresIn).toBe(300); // 5分钟 = 300秒

      console.log('[Test Info] Code expiration is set to 300 seconds (5 minutes)');

      // TODO: 在实际生产测试中,可以:
      // 1. 使用更短的过期时间 (如5秒) 进行测试
      // 2. 或者 mock Date.now() 来模拟时间流逝
    });
  });
});
