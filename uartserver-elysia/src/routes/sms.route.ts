/**
 * SMS Verification Routes (Phase 8.5)
 *
 * 短信验证码 API - 支持阿里云SMS和Mock模式
 *
 * 端点:
 * - POST /api/sms/send-code      - 发送短信验证码
 * - POST /api/sms/verify-code    - 验证短信验证码
 */

import { Elysia, t } from 'elysia';
import { ObjectId } from 'mongodb';
import { requireAuth, getAuthUser } from '../middleware/jwt-auth.middleware';
import { SMSService } from '../services/sms.service';
import type {
  SendSMSCodeResponse,
  VerifySMSCodeResponse,
} from '../schemas/sms.schema';
import { VerifySMSCodeRequestSchema } from '../schemas/sms.schema';
import { mongodb } from '../database/mongodb';

// ============================================================================
// 服务初始化
// ============================================================================

const smsService = new SMSService();

// ============================================================================
// Helper: 获取用户手机号
// ============================================================================

/**
 * 从数据库获取用户手机号
 *
 * @param userId - 用户ID
 * @returns 手机号 (如果存在)
 */
async function getUserPhone(userId: string): Promise<string | null> {
  const db = mongodb.getDatabase();
  const usersCollection = db.collection('users');

  const user = await usersCollection.findOne(
    { _id: new ObjectId(userId) },
    { projection: { phone: 1 } }
  );

  return user?.phone || null;
}

// ============================================================================
// Routes
// ============================================================================

export const smsRoutes = new Elysia({ prefix: '/api/sms' })
  .use(requireAuth)

  // ==========================================================================
  // POST /api/sms/send-code - 发送短信验证码
  // ==========================================================================
  /**
   * 发送短信验证码
   *
   * 老系统对应: POST /api/smsValidation
   *
   * 流程:
   * 1. 获取当前用户ID
   * 2. 从数据库查询用户手机号
   * 3. 调用 SMSService 发送验证码
   * 4. 返回发送结果
   *
   * @requires Authentication
   * @returns SendSMSCodeResponse
   */
  .post(
    '/send-code',
    async (ctx): Promise<SendSMSCodeResponse> => {
      try {
        // 1. 验证用户身份
        const { userId } = await getAuthUser(ctx);

        // 2. 获取用户手机号
        const phoneNumber = await getUserPhone(userId);

        if (!phoneNumber) {
          return {
            status: 'error',
            message: '用户未绑定手机号',
            data: null,
          };
        }

        // 3. 发送验证码
        const result = await smsService.sendVerificationCode(
          userId,
          phoneNumber
        );

        if (!result.success) {
          return {
            status: 'error',
            message: result.message,
            data: null,
          };
        }

        // 4. 返回成功结果
        // 注意: Mock模式下会包含验证码 (result.code),生产环境不应返回
        const response: SendSMSCodeResponse = {
          status: 'ok',
          data: {
            message: result.message,
            expiresIn: smsService.getCodeExpiresIn(),
          },
        };

        // Mock模式下在 message 中附加验证码提示
        if (result.code) {
          response.message = `验证码已生成 (测试模式): ${result.code}`;
        }

        return response;
      } catch (error) {
        console.error('[SMS Routes] Send code error:', error);
        return {
          status: 'error',
          message: error instanceof Error ? error.message : '发送验证码失败',
          data: null,
        };
      }
    },
    {
      detail: {
        summary: '发送短信验证码',
        description: '向用户手机发送验证码 (老系统: POST /api/smsValidation)',
        tags: ['SMS'],
      },
    }
  )

  // ==========================================================================
  // POST /api/sms/verify-code - 验证短信验证码
  // ==========================================================================
  /**
   * 验证短信验证码
   *
   * 老系统对应: POST /api/smsCodeValidation
   *
   * 流程:
   * 1. 获取当前用户ID
   * 2. 验证请求参数 (验证码)
   * 3. 调用 SMSService 验证验证码
   * 4. 返回验证结果
   *
   * @requires Authentication
   * @body { data: { code: string } }
   * @returns VerifySMSCodeResponse
   */
  .post(
    '/verify-code',
    async (ctx): Promise<VerifySMSCodeResponse> => {
      try {
        // 1. 验证用户身份
        const { userId } = await getAuthUser(ctx);

        // 2. 获取请求参数
        const { data } = ctx.body as { data: { code: string } };

        if (!data || !data.code) {
          return {
            status: 'error',
            message: '验证码不能为空',
            data: null,
          };
        }

        // 3. 验证验证码
        const result = await smsService.verifyCode(userId, data.code);

        if (!result.verified) {
          return {
            status: 'error',
            message: result.message,
            data: null,
          };
        }

        // 4. 返回验证成功
        return {
          status: 'ok',
          message: result.message,
          data: {
            verified: true,
          },
        };
      } catch (error) {
        console.error('[SMS Routes] Verify code error:', error);
        return {
          status: 'error',
          message: error instanceof Error ? error.message : '验证失败',
          data: null,
        };
      }
    },
    {
      body: VerifySMSCodeRequestSchema,
      detail: {
        summary: '验证短信验证码',
        description: '验证用户提交的短信验证码 (老系统: POST /api/smsCodeValidation)',
        tags: ['SMS'],
      },
    }
  );
