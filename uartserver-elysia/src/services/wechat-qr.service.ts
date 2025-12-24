/**
 * WeChat QR Code Service (Phase 8.4)
 *
 * 微信二维码服务 - 处理公众号和小程序二维码生成
 * 迁移自老系统的 WxPublicService 和 WxAppService
 */

/**
 * 微信公众号二维码 Ticket 响应
 */
interface WxPublicQRTicketResponse {
  ticket: string;
  expire_seconds: number;
  url: string;
}

/**
 * 微信 Token 响应
 */
interface WxAccessTokenResponse {
  access_token: string;
  expires_in: number;
  errcode?: number;
  errmsg?: string;
}

/**
 * 微信二维码服务
 *
 * 提供公众号和小程序二维码生成功能
 */
export class WeChatQRService {
  // 微信公众号配置
  private readonly publicAccount = {
    appid: process.env.WXP_ID || '',
    secret: process.env.WXP_SECRET || '',
  };

  // 微信小程序配置
  private readonly miniProgram = {
    appid: process.env.WXA_ID || '',
    secret: process.env.WXA_SECRET || '',
  };

  // ============================================================================
  // 公众号二维码
  // ============================================================================

  /**
   * 获取公众号 access_token
   *
   * @returns access_token
   */
  private async getPublicAccountToken(): Promise<string> {
    const { appid, secret } = this.publicAccount;

    if (!appid || !secret) {
      throw new Error('微信公众号配置未设置 (WXP_ID, WXP_SECRET)');
    }

    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`获取公众号 access_token 失败: ${response.statusText}`);
    }

    const data = (await response.json()) as WxAccessTokenResponse;

    if (data.errcode) {
      throw new Error(`获取公众号 access_token 失败: ${data.errmsg}`);
    }

    return data.access_token;
  }

  /**
   * 获取公众号带参数二维码
   * 对应老系统: WxPublicService.getTicket()
   *
   * @param sceneStr - 场景字符串 (通常是用户ID)
   * @param expireSeconds - 二维码有效期(秒), 默认360秒
   * @returns 二维码 ticket 和 URL
   */
  async getOfficialAccountQRCode(
    sceneStr: string,
    expireSeconds = 360
  ): Promise<{ ticket: string; url: string; expireSeconds: number }> {
    const accessToken = await this.getPublicAccountToken();

    const apiUrl = `https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token=${accessToken}`;

    const requestData = {
      expire_seconds: expireSeconds,
      action_name: 'QR_STR_SCENE',
      action_info: {
        scene: {
          scene_str: sceneStr,
        },
      },
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      throw new Error(`获取公众号二维码失败: ${response.statusText}`);
    }

    const data = (await response.json()) as WxPublicQRTicketResponse;

    // 构造显示二维码的 URL
    const qrCodeUrl = `https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=${data.ticket}`;

    return {
      ticket: data.ticket,
      url: qrCodeUrl,
      expireSeconds: data.expire_seconds,
    };
  }

  // ============================================================================
  // 小程序二维码
  // ============================================================================

  /**
   * 获取小程序 access_token
   *
   * @returns access_token
   */
  private async getMiniProgramToken(): Promise<string> {
    const { appid, secret } = this.miniProgram;

    if (!appid || !secret) {
      throw new Error('微信小程序配置未设置 (WXA_ID, WXA_SECRET)');
    }

    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`获取小程序 access_token 失败: ${response.statusText}`);
    }

    const data = (await response.json()) as WxAccessTokenResponse;

    if (data.errcode) {
      throw new Error(`获取小程序 access_token 失败: ${data.errmsg}`);
    }

    return data.access_token;
  }

  /**
   * 获取小程序无限制二维码
   * 对应老系统: WxAppService.getTicket()
   *
   * @param scene - 场景值 (通常是用户ID)
   * @param page - 小程序页面路径, 默认首页
   * @returns base64 格式的二维码图片
   */
  async getMiniProgramQRCode(
    scene: string,
    page = 'pages/index/index'
  ): Promise<string> {
    const accessToken = await this.getMiniProgramToken();

    const apiUrl = `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${accessToken}`;

    const requestData = {
      scene,
      page,
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      throw new Error(`获取小程序二维码失败: ${response.statusText}`);
    }

    // 响应是图片 buffer
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    return `data:image/png;base64,${base64}`;
  }

  // ============================================================================
  // 通用二维码生成 (使用 qrcode 库)
  // ============================================================================

  /**
   * 生成通用二维码
   * 对应老系统: toDataURL(code)
   *
   * @param content - 二维码内容
   * @param options - 二维码选项
   * @returns base64 格式的二维码图片
   */
  async generateQRCode(
    content: string,
    options?: {
      width?: number;
      margin?: number;
    }
  ): Promise<string> {
    // 动态导入 qrcode 库
    const qrcode = await import('qrcode');

    const qrOptions = {
      width: options?.width || 256,
      margin: options?.margin || 1,
      errorCorrectionLevel: 'M' as const,
    };

    return await qrcode.toDataURL(content, qrOptions);
  }
}
