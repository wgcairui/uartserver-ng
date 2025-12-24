/**
 * WeChat Template Message Service
 *
 * 微信公众号模板消息服务：
 * - Access Token 管理（自动刷新）
 * - 模板消息发送
 * - 错误处理和重试
 * - Mock 模式支持（测试环境）
 *
 * API 文档: https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Template_Message_Interface.html
 */

import { config } from '../../config';

/**
 * 微信模板消息参数
 */
export interface WechatTemplateParams {
  /** 接收者 OpenID */
  touser: string;
  /** 模板 ID（可选,使用默认模板） */
  template_id?: string;
  /** 跳转链接（可选） */
  url?: string;
  /** 小程序跳转（可选,使用默认小程序） */
  miniprogram?: {
    appid: string;
    pagepath: string;
  };
  /** 模板数据 */
  data: Record<
    string,
    {
      value: string;
      color?: string;
    }
  >;
}

/**
 * 微信 API 响应
 */
export interface WechatApiResponse {
  errcode: number;
  errmsg: string;
  msgid?: number;
}

/**
 * Access Token 缓存
 */
interface AccessTokenCache {
  token: string;
  expiresAt: number;
}

/**
 * WeChat Service
 */
export class WechatService {
  /** 微信公众号 AppID */
  private readonly appId: string;

  /** 微信公众号 AppSecret */
  private readonly appSecret: string;

  /** Access Token 缓存 */
  private accessTokenCache: AccessTokenCache | null = null;

  /** 是否为 Mock 模式 */
  private readonly mockMode: boolean;

  /** API Base URL */
  private readonly baseUrl = 'https://api.weixin.qq.com';

  /** 默认模板 ID */
  private readonly defaultTemplateId: string;

  /** 默认小程序配置 */
  private readonly defaultMiniprogram: {
    appid: string;
    pagepath: string;
  };

  constructor(options?: {
    appId?: string;
    appSecret?: string;
    templateId?: string;
    miniprogram?: { appid: string; pagepath: string };
    mockMode?: boolean;
  }) {
    this.appId = (options?.appId ?? config.WXP_ID) || '';
    this.appSecret = (options?.appSecret ?? config.WXP_SECRET) || '';
    this.defaultTemplateId =
      options?.templateId ?? config.WXP_TEMPLATE_ID ?? 'rIFS7MnXotNoNifuTfFpfh4vFGzCGlhh-DmWZDcXpWg';
    this.defaultMiniprogram = options?.miniprogram ?? {
      appid: config.WXP_MINIPROGRAM_APPID ?? 'wx38800d0139103920',
      pagepath: config.WXP_MINIPROGRAM_PAGEPATH ?? '/pages/index/alarm/alarm',
    };
    this.mockMode = options?.mockMode ?? (config.NODE_ENV !== 'production');

    if (!this.mockMode && (!this.appId || !this.appSecret)) {
      console.warn('[WechatService] AppID or AppSecret not configured, using mock mode');
      (this as any).mockMode = true;
    }

    console.log(`[WechatService] Initialized (mock: ${this.mockMode})`);
  }

  /**
   * 发送模板消息
   *
   * @param params - 模板消息参数
   * @returns API 响应
   */
  async sendTemplateMessage(params: WechatTemplateParams): Promise<WechatApiResponse> {
    // 应用默认值
    const requestParams: WechatTemplateParams = {
      ...params,
      template_id: params.template_id ?? this.defaultTemplateId,
      miniprogram: params.miniprogram ?? this.defaultMiniprogram,
    };

    if (this.mockMode) {
      return this.mockSendTemplateMessage(requestParams);
    }

    try {
      // 获取 Access Token
      const accessToken = await this.getAccessToken();

      // 调用发送接口
      const url = `${this.baseUrl}/cgi-bin/message/template/send?access_token=${accessToken}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestParams),
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }

      const result = (await response.json()) as WechatApiResponse;

      // 检查微信 API 错误
      if (result.errcode !== 0) {
        throw new Error(`WeChat API Error: ${result.errcode} - ${result.errmsg}`);
      }

      console.log(`[WechatService] Template message sent successfully: msgid=${result.msgid}`);

      return result;
    } catch (error) {
      console.error('[WechatService] Failed to send template message:', error);
      throw error;
    }
  }

  /**
   * 获取 Access Token（带缓存）
   *
   * @returns Access Token
   */
  private async getAccessToken(): Promise<string> {
    // 检查缓存是否有效
    if (this.accessTokenCache && this.accessTokenCache.expiresAt > Date.now()) {
      return this.accessTokenCache.token;
    }

    try {
      const url = `${this.baseUrl}/cgi-bin/token?grant_type=client_credential&appid=${this.appId}&secret=${this.appSecret}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }

      const result = (await response.json()) as {
        access_token?: string;
        expires_in?: number;
        errcode?: number;
        errmsg?: string;
      };

      if (result.errcode || !result.access_token) {
        throw new Error(
          `WeChat API Error: ${result.errcode || 'unknown'} - ${result.errmsg || 'No access_token'}`
        );
      }

      // 缓存 Access Token（提前 5 分钟过期以防边界情况）
      const expiresIn = (result.expires_in || 7200) - 300;
      this.accessTokenCache = {
        token: result.access_token,
        expiresAt: Date.now() + expiresIn * 1000,
      };

      console.log(`[WechatService] Access Token refreshed, expires in ${expiresIn}s`);

      return result.access_token;
    } catch (error) {
      console.error('[WechatService] Failed to get access token:', error);
      throw error;
    }
  }

  /**
   * Mock 模式：模拟发送模板消息
   */
  private mockSendTemplateMessage(params: WechatTemplateParams): WechatApiResponse {
    console.log('[WechatService] Mock sending template message:', {
      touser: params.touser,
      template_id: params.template_id,
      data: params.data,
    });

    return {
      errcode: 0,
      errmsg: 'ok',
      msgid: Math.floor(Math.random() * 1000000000),
    };
  }

  /**
   * 清除 Access Token 缓存（用于测试）
   */
  clearAccessTokenCache(): void {
    this.accessTokenCache = null;
  }
}

/**
 * 全局微信服务实例
 */
export const wechatService = new WechatService();
