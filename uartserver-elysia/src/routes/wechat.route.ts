/**
 * WeChat Routes (Phase 8.4)
 *
 * 微信集成 API 路由
 * 提供公众号、小程序二维码和解绑功能
 *
 * 对应老系统路由:
 * - POST /api/mpTicket -> GET /api/wechat/official-account/qrcode
 * - POST /api/wpTicket -> GET /api/wechat/mini-program/qrcode
 * - POST /api/unbindwx -> DELETE /api/wechat/unbind
 * - POST /api/qr -> GET /api/wechat/qrcode/:scene
 */

import { Elysia, t } from 'elysia';
import { requireAuth, getAuthUser } from '../middleware/jwt-auth.middleware';
import { WeChatQRService } from '../services/wechat-qr.service';
import {
  WeChatQRCodeResponse,
  UnbindWeChatResponse,
  GenerateQRCodeResponse,
  GenerateQRCodeQuerySchema,
} from '../schemas/wechat.schema';
import { WxAuthService } from '../services/wx-auth.service';

/**
 * 微信路由
 */
export const wechatRoutes = new Elysia({ prefix: '/api/wechat' })
  .use(requireAuth)

  // ============================================================================
  // 1. GET /api/wechat/official-account/qrcode
  //    获取公众号带参数二维码(用于绑定用户)
  // ============================================================================
  .get(
    '/official-account/qrcode',
    async (ctx): Promise<WeChatQRCodeResponse> => {
      try {
        const { userId } = await getAuthUser(ctx);

        const wechatQRService = new WeChatQRService();

        // 使用用户ID作为场景值
        const result = await wechatQRService.getOfficialAccountQRCode(
          userId,
          360 // 360秒过期
        );

        return {
          status: 'ok',
          data: result,
        };
      } catch (error) {
        console.error('Error getting official account QR code:', error);
        return {
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : '获取公众号二维码失败',
          data: null,
        };
      }
    }
  )

  // ============================================================================
  // 2. GET /api/wechat/mini-program/qrcode
  //    获取小程序二维码(用于绑定用户)
  // ============================================================================
  .get(
    '/mini-program/qrcode',
    async (ctx): Promise<WeChatQRCodeResponse> => {
      try {
        const { userId } = await getAuthUser(ctx);

        const wechatQRService = new WeChatQRService();

        // 使用用户ID作为场景值,返回base64图片
        const qrCodeDataUrl = await wechatQRService.getMiniProgramQRCode(
          userId,
          'pages/index/index'
        );

        return {
          status: 'ok',
          data: {
            ticket: '', // 小程序二维码不需要ticket
            url: qrCodeDataUrl, // base64 data URL
            expireSeconds: 0, // 永久有效
          },
        };
      } catch (error) {
        console.error('Error getting mini-program QR code:', error);
        return {
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : '获取小程序二维码失败',
          data: null,
        };
      }
    }
  )

  // ============================================================================
  // 3. DELETE /api/wechat/unbind
  //    解绑微信
  // ============================================================================
  .delete('/unbind', async (ctx): Promise<UnbindWeChatResponse> => {
    try {
      const { userId } = await getAuthUser(ctx);

      const wxAuthService = new WxAuthService();

      // 查找绑定的微信用户
      const wxUser = await wxAuthService.findWxUserBySystemUser(userId);

      if (!wxUser) {
        return {
          status: 'ok',
          message: '用户未绑定微信',
          data: {
            success: true,
          },
        };
      }

      // 解绑微信
      await wxAuthService.unbindWxUser(wxUser._id.toString());

      return {
        status: 'ok',
        message: '解绑微信成功',
        data: {
          success: true,
        },
      };
    } catch (error) {
      console.error('Error unbinding WeChat:', error);
      return {
        status: 'error',
        message:
          error instanceof Error ? error.message : '解绑微信失败',
        data: null,
      };
    }
  })

  // ============================================================================
  // 4. GET /api/wechat/qrcode/:scene
  //    生成通用二维码(可用于任意内容)
  // ============================================================================
  .get(
    '/qrcode/:scene',
    async (ctx): Promise<GenerateQRCodeResponse> => {
      try {
        // 强制认证
        await getAuthUser(ctx);

        const { scene } = ctx.params;
        const { width, margin } = ctx.query;

        const wechatQRService = new WeChatQRService();

        const qrCodeDataUrl = await wechatQRService.generateQRCode(scene, {
          width,
          margin,
        });

        return {
          status: 'ok',
          data: {
            qrcode: qrCodeDataUrl,
          },
        };
      } catch (error) {
        console.error('Error generating QR code:', error);
        return {
          status: 'error',
          message:
            error instanceof Error ? error.message : '生成二维码失败',
          data: null,
        };
      }
    },
    {
      params: t.Object({
        scene: t.String({
          minLength: 1,
          maxLength: 200,
          description: '二维码场景值/内容',
        }),
      }),
      query: GenerateQRCodeQuerySchema,
    }
  );
