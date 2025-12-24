/**
 * SMS Service (Phase 8.5)
 *
 * 短信验证服务 - 支持阿里云SMS和Mock模式
 */

/**
 * 验证码存储项
 */
interface SMSCodeEntry {
  code: string;
  expiresAt: number; // Unix timestamp (ms)
}

/**
 * SMS 服务类
 *
 * 提供短信验证码发送和验证功能
 * 默认使用内存存储,生产环境应使用Redis
 */
export class SMSService {
  // 内存存储 (生产环境应使用Redis)
  private codeStore = new Map<string, SMSCodeEntry>();

  // 验证码有效期 (秒)
  private readonly CODE_EXPIRES_IN = 300; // 5分钟

  // 阿里云SMS配置
  private readonly aliyunConfig = {
    accessKeyId: process.env.ALISMS_ID || '',
    accessKeySecret: process.env.ALISMS_SECRET || '',
    signName: process.env.ALISMS_SIGN || '雷迪司科技',
    templateCode: process.env.ALISMS_TEMPLATE || 'SMS_190275627',
  };

  /**
   * 生成随机验证码
   *
   * @param length - 验证码长度, 默认4位
   * @returns 验证码字符串
   */
  private generateCode(length = 4): string {
    const code = Math.floor(Math.random() * Math.pow(10, length))
      .toString()
      .padStart(length, '0');
    return code;
  }

  /**
   * 发送短信验证码
   *
   * @param userId - 用户ID
   * @param phoneNumber - 手机号
   * @returns 发送结果
   */
  async sendVerificationCode(
    userId: string,
    phoneNumber: string
  ): Promise<{
    success: boolean;
    code?: string; // Mock模式下返回验证码(生产环境不应返回)
    message: string;
  }> {
    // 生成验证码
    const code = this.generateCode(4);
    const expiresAt = Date.now() + this.CODE_EXPIRES_IN * 1000;

    // 存储验证码
    this.codeStore.set(userId, { code, expiresAt });

    // 清理过期验证码
    this.cleanExpiredCodes();

    // 检查是否配置了阿里云SMS
    const hasSMSConfig =
      this.aliyunConfig.accessKeyId && this.aliyunConfig.accessKeySecret;

    if (hasSMSConfig) {
      // 生产模式: 调用阿里云SMS API
      try {
        await this.sendAliyunSMS(phoneNumber, code);
        return {
          success: true,
          message: this.maskPhoneNumber(phoneNumber),
        };
      } catch (error) {
        console.error('[SMS Service] Failed to send SMS:', error);
        return {
          success: false,
          message: '发送短信失败',
        };
      }
    } else {
      // Mock模式: 不发送真实短信,返回验证码用于测试
      console.log(`[SMS Service] Mock mode - Code for ${userId}:`, code);
      return {
        success: true,
        code, // Mock模式下返回验证码
        message: `${this.maskPhoneNumber(phoneNumber)} (测试模式)`,
      };
    }
  }

  /**
   * 验证短信验证码
   *
   * @param userId - 用户ID
   * @param code - 用户提交的验证码
   * @returns 验证结果
   */
  async verifyCode(
    userId: string,
    code: string
  ): Promise<{ verified: boolean; message: string }> {
    // 获取存储的验证码
    const entry = this.codeStore.get(userId);

    if (!entry) {
      return {
        verified: false,
        message: '验证码不存在或已失效',
      };
    }

    // 检查是否过期
    if (Date.now() > entry.expiresAt) {
      this.codeStore.delete(userId);
      return {
        verified: false,
        message: '验证码已过期',
      };
    }

    // 验证验证码
    if (entry.code !== code) {
      return {
        verified: false,
        message: '验证码错误',
      };
    }

    // 验证成功,删除验证码
    this.codeStore.delete(userId);

    return {
      verified: true,
      message: '验证成功',
    };
  }

  /**
   * 发送阿里云短信
   *
   * @param phoneNumber - 手机号
   * @param code - 验证码
   */
  private async sendAliyunSMS(
    phoneNumber: string,
    code: string
  ): Promise<void> {
    // TODO: 实现阿里云SMS API调用
    // 需要安装 @alicloud/pop-core 依赖
    //
    // const Core = require('@alicloud/pop-core');
    // const client = new Core({
    //   accessKeyId: this.aliyunConfig.accessKeyId,
    //   accessKeySecret: this.aliyunConfig.accessKeySecret,
    //   endpoint: 'https://dysmsapi.aliyuncs.com',
    //   apiVersion: '2017-05-25',
    // });
    //
    // const params = {
    //   RegionId: 'cn-hangzhou',
    //   PhoneNumbers: phoneNumber,
    //   SignName: this.aliyunConfig.signName,
    //   TemplateCode: this.aliyunConfig.templateCode,
    //   TemplateParam: JSON.stringify({ code }),
    // };
    //
    // await client.request('SendSms', params, { method: 'POST' });

    throw new Error('阿里云SMS未实现,请使用Mock模式');
  }

  /**
   * 脱敏手机号
   *
   * @param phoneNumber - 手机号
   * @returns 脱敏后的手机号 (如: 138***7890)
   */
  private maskPhoneNumber(phoneNumber: string): string {
    if (phoneNumber.length < 7) {
      return phoneNumber;
    }
    const first = phoneNumber.slice(0, 3);
    const last = phoneNumber.slice(-4);
    return `手机号:${first}***${last}`;
  }

  /**
   * 清理过期的验证码
   */
  private cleanExpiredCodes(): void {
    const now = Date.now();
    for (const [userId, entry] of this.codeStore.entries()) {
      if (now > entry.expiresAt) {
        this.codeStore.delete(userId);
      }
    }
  }

  /**
   * 获取验证码有效期
   */
  getCodeExpiresIn(): number {
    return this.CODE_EXPIRES_IN;
  }
}
