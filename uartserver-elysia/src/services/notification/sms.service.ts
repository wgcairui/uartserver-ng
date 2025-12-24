/**
 * Aliyun SMS Service
 *
 * 阿里云短信服务：
 * - 短信发送
 * - 签名和模板管理
 * - 错误处理和重试
 * - Mock 模式支持（测试环境）
 *
 * API 文档: https://help.aliyun.com/document_detail/101414.html
 */

import { createHmac } from 'node:crypto';
import { config } from '../../config';

/**
 * 短信发送参数
 */
export interface SmsParams {
  /** 短信签名（可选,使用默认签名） */
  SignName?: string;
  /** 地域 ID（可选,使用默认地域） */
  RegionId?: string;
  /** 模板代码 */
  TemplateCode: string;
  /** 模板参数（JSON 字符串） */
  TemplateParam: string;
}

/**
 * 阿里云 SMS API 响应
 */
export interface AliyunSmsResponse {
  /** 请求 ID */
  RequestId: string;
  /** 发送回执 ID */
  BizId?: string;
  /** 状态码 */
  Code?: string;
  /** 状态描述 */
  Message?: string;
}

/**
 * Aliyun SMS Service
 */
export class SmsService {
  /** AccessKey ID */
  private readonly accessKeyId: string;

  /** AccessKey Secret */
  private readonly accessKeySecret: string;

  /** 是否为 Mock 模式 */
  private readonly mockMode: boolean;

  /** API Base URL */
  private readonly baseUrl = 'https://dysmsapi.aliyuncs.com';

  /** API 版本 */
  private readonly apiVersion = '2017-05-25';

  /** 默认地域 ID */
  private readonly defaultRegionId: string;

  /** 默认短信签名 */
  private readonly defaultSignName: string;

  constructor(options?: {
    accessKeyId?: string;
    accessKeySecret?: string;
    regionId?: string;
    signName?: string;
    mockMode?: boolean;
  }) {
    this.accessKeyId = (options?.accessKeyId ?? config.ALISMS_ID) || '';
    this.accessKeySecret = (options?.accessKeySecret ?? config.ALISMS_SECRET) || '';
    this.defaultRegionId = options?.regionId ?? config.SMS_REGION_ID ?? 'cn-hangzhou';
    this.defaultSignName = options?.signName ?? config.SMS_SIGN_NAME ?? '雷迪司科技湖北有限公司';
    this.mockMode = options?.mockMode ?? (config.NODE_ENV !== 'production');

    if (!this.mockMode && (!this.accessKeyId || !this.accessKeySecret)) {
      console.warn('[SmsService] AccessKey not configured, using mock mode');
      (this as any).mockMode = true;
    }

    console.log(`[SmsService] Initialized (mock: ${this.mockMode})`);
  }

  /**
   * 验证手机号格式（中国大陆）
   * 格式: 1 + 10位数字
   */
  private isValidPhoneNumber(tel: string): boolean {
    return /^1\d{10}$/.test(tel.trim());
  }

  /**
   * 发送短信
   *
   * @param phoneNumbers - 手机号列表
   * @param params - 短信参数
   * @returns API 响应
   */
  async sendSms(phoneNumbers: string[], params: SmsParams): Promise<AliyunSmsResponse> {
    // 过滤无效手机号
    const validPhones = phoneNumbers.filter((tel) => this.isValidPhoneNumber(tel));

    if (validPhones.length === 0) {
      throw new Error('没有有效的手机号码');
    }

    if (validPhones.length < phoneNumbers.length) {
      console.warn(
        `[SmsService] 过滤掉 ${phoneNumbers.length - validPhones.length} 个无效手机号`
      );
    }

    if (this.mockMode) {
      return this.mockSendSms(validPhones, params);
    }

    try {
      // 应用默认值
      const signName = params.SignName ?? this.defaultSignName;
      const regionId = params.RegionId ?? this.defaultRegionId;

      // 构建请求参数
      const requestParams = {
        Action: 'SendSms',
        PhoneNumbers: validPhones.join(','),
        SignName: signName,
        RegionId: regionId,
        TemplateCode: params.TemplateCode,
        TemplateParam: params.TemplateParam,
        // 公共参数
        Format: 'JSON',
        Version: this.apiVersion,
        AccessKeyId: this.accessKeyId,
        SignatureMethod: 'HMAC-SHA1',
        Timestamp: this.getTimestamp(),
        SignatureVersion: '1.0',
        SignatureNonce: this.generateNonce(),
      };

      // 生成签名
      const signature = this.generateSignature(requestParams);

      // 构建 URL
      const queryString = this.buildQueryString({ ...requestParams, Signature: signature });
      const url = `${this.baseUrl}/?${queryString}`;

      // 发送请求
      const response = await fetch(url, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }

      const result = (await response.json()) as AliyunSmsResponse;

      // 检查阿里云 API 错误
      if (result.Code && result.Code !== 'OK') {
        throw new Error(`Aliyun SMS Error: ${result.Code} - ${result.Message}`);
      }

      console.log(`[SmsService] SMS sent successfully: BizId=${result.BizId}`);

      return result;
    } catch (error) {
      console.error('[SmsService] Failed to send SMS:', error);
      throw error;
    }
  }

  /**
   * 生成签名
   */
  private generateSignature(params: Record<string, string>): string {
    // 1. 排序参数
    const sortedParams = Object.keys(params)
      .sort()
      .map((key) => `${this.percentEncode(key)}=${this.percentEncode(params[key]!)}`);

    // 2. 构建待签名字符串
    const canonicalizedQueryString = sortedParams.join('&');
    const stringToSign = `GET&${this.percentEncode('/')}&${this.percentEncode(canonicalizedQueryString)}`;

    // 3. 计算签名
    const hmac = createHmac('sha1', `${this.accessKeySecret}&`);
    hmac.update(stringToSign);
    const signature = hmac.digest('base64');

    return signature;
  }

  /**
   * URL 编码（符合阿里云规范）
   */
  private percentEncode(str: string): string {
    return encodeURIComponent(str)
      .replace(/!/g, '%21')
      .replace(/'/g, '%27')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29')
      .replace(/\*/g, '%2A');
  }

  /**
   * 构建查询字符串
   */
  private buildQueryString(params: Record<string, string>): string {
    return Object.keys(params)
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key]!)}`)
      .join('&');
  }

  /**
   * 获取时间戳（ISO 8601 格式）
   */
  private getTimestamp(): string {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  /**
   * 生成随机数
   */
  private generateNonce(): string {
    return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  }

  /**
   * Mock 模式：模拟发送短信
   */
  private mockSendSms(phoneNumbers: string[], params: SmsParams): AliyunSmsResponse {
    console.log('[SmsService] Mock sending SMS:', {
      phoneNumbers,
      SignName: params.SignName,
      TemplateCode: params.TemplateCode,
      TemplateParam: params.TemplateParam,
    });

    return {
      RequestId: `mock-${Date.now()}`,
      BizId: `biz-${Date.now()}`,
      Code: 'OK',
      Message: 'OK',
    };
  }
}

/**
 * 全局短信服务实例
 */
export const smsService = new SmsService();
