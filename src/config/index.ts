/**
 * 应用配置管理
 * 集中管理所有环境变量和配置项
 */

import { z } from 'zod';

/**
 * 环境配置 Schema
 * 使用 Zod 进行运行时类型验证
 */
const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('9010').transform(Number),
  HOST: z.string().default('0.0.0.0'),

  // MongoDB
  MONGODB_URI: z.string().default('mongodb://localhost:27017/uart_server'),

  // PostgreSQL
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.string().default('5432').transform(Number),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('pg123456'),

  // Redis
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.string().default('6379').transform(Number),
  REDIS_PASSWORD: z.string().default(''),
  REDIS_DB: z.string().default('0').transform(Number),

  // JWT
  JWT_SECRET: z.string().default('your-super-secret-jwt-key-change-this-in-production'),

  // Node Client Authentication
  NODE_SECRET: z.string().default('your-node-client-secret-change-this-in-production'),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_PRETTY: z.string().default('true').transform(val => val === 'true'),

  // Performance
  WORKER_POOL_SIZE: z.string().default('4').transform(Number),
  BATCH_WRITE_SIZE: z.string().default('1000').transform(Number),
  BATCH_WRITE_INTERVAL: z.string().default('1000').transform(Number),

  // Aliyun OSS
  ALIOSS_ID: z.string().optional(),
  ALIOSS_SECRET: z.string().optional(),
  ALIOSS_BUCKET: z.string().optional(),
  ALIOSS_ENDPOINT: z.string().optional(),

  // Aliyun IoT
  ALIIOT_ID: z.string().optional(),
  ALIIOT_SECRET: z.string().optional(),

  // Aliyun SMS
  ALISMS_ID: z.string().optional(),
  ALISMS_SECRET: z.string().optional(),

  // Tencent Map
  TENCETMAP_KEY: z.string().optional(),
  TENCETMAP_URL: z.string().optional(),
  TENCETMAP_SK: z.string().optional(),

  // WeChat Public Account
  WXP_ID: z.string().optional(),
  WXP_SECRET: z.string().optional(),

  // WeChat Open Platform
  WXO_ID: z.string().optional(),
  WXO_SECRET: z.string().optional(),

  // WeChat Mini Program
  WXA_ID: z.string().optional(),
  WXA_SECRET: z.string().optional(),

  // WeChat Video Account
  WXV_ID: z.string().optional(),
  WXV_SECRET: z.string().optional(),

  // Email
  EMAIL_ID: z.string().optional(),
  EMAIL_SECRET: z.string().optional(),

  // HF Service
  HF_ID: z.string().optional(),
  HF_SECRET: z.string().optional(),
});

/**
 * 环境变量类型
 */
export type Env = z.infer<typeof envSchema>;

/**
 * 加载并验证环境变量
 */
function loadEnv(): Env {
  try {
    // Bun 自动加载 .env 文件到 process.env
    const parsed = envSchema.parse(process.env);

    // 生产环境安全检查
    if (parsed.NODE_ENV === 'production') {
      // 检查 JWT Secret 是否使用默认值
      if (parsed.JWT_SECRET.includes('change-this')) {
        throw new Error(
          '🚨 安全错误: 生产环境不能使用默认的 JWT_SECRET！\n' +
          '   请在环境变量或 .env 文件中设置一个强密钥。\n' +
          '   建议使用至少 32 个字符的随机字符串。'
        );
      }

      // 检查 JWT Secret 长度
      if (parsed.JWT_SECRET.length < 32) {
        console.warn(
          '⚠️  警告: JWT_SECRET 长度少于 32 个字符，建议使用更长的密钥以提高安全性。'
        );
      }

      // 检查 Node Secret 是否使用默认值
      if (parsed.NODE_SECRET.includes('change-this')) {
        throw new Error(
          '🚨 安全错误: 生产环境不能使用默认的 NODE_SECRET！\n' +
          '   请在环境变量或 .env 文件中设置一个强密钥用于 Node 客户端认证。\n' +
          '   建议使用至少 32 个字符的随机字符串。'
        );
      }

      // 检查 Node Secret 长度
      if (parsed.NODE_SECRET.length < 32) {
        console.warn(
          '⚠️  警告: NODE_SECRET 长度少于 32 个字符，建议使用更长的密钥以提高安全性。'
        );
      }
    }

    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('环境变量验证失败:');
      error.issues.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      throw new Error('环境变量配置错误，请检查 .env 文件');
    }
    throw error;
  }
}

/**
 * 全局配置对象
 */
export const config = loadEnv();

/**
 * 派生配置 - 从环境变量计算得出的配置
 */
export const derivedConfig = {
  /**
   * 是否为生产环境
   */
  isProduction: config.NODE_ENV === 'production',

  /**
   * 是否为开发环境
   */
  isDevelopment: config.NODE_ENV === 'development',

  /**
   * 是否为测试环境
   */
  isTest: config.NODE_ENV === 'test',

  /**
   * 完整的服务器地址
   */
  get serverUrl(): string {
    return `http://${config.HOST}:${config.PORT}`;
  },

  /**
   * PostgreSQL 连接 URL
   */
  get postgresUrl(): string {
    return `postgresql://${config.DB_USER}:${config.DB_PASSWORD}@${config.DB_HOST}:${config.DB_PORT}/uart_server`;
  },

  /**
   * Redis 连接配置
   */
  get redisConfig() {
    return {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
      db: config.REDIS_DB,
    };
  },

  /**
   * Aliyun OSS 是否配置
   */
  get hasOSS(): boolean {
    return !!(config.ALIOSS_ID && config.ALIOSS_SECRET && config.ALIOSS_BUCKET);
  },

  /**
   * Aliyun IoT 是否配置
   */
  get hasIoT(): boolean {
    return !!(config.ALIIOT_ID && config.ALIIOT_SECRET);
  },

  /**
   * 微信公众号是否配置
   */
  get hasWXP(): boolean {
    return !!(config.WXP_ID && config.WXP_SECRET);
  },

  /**
   * 邮件服务是否配置
   */
  get hasEmail(): boolean {
    return !!(config.EMAIL_ID && config.EMAIL_SECRET);
  },
};

/**
 * 打印配置摘要（隐藏敏感信息）
 */
export function printConfigSummary(): void {
  console.log('📋 配置摘要:');
  console.log(`  环境: ${config.NODE_ENV}`);
  console.log(`  端口: ${config.PORT}`);
  console.log(`  MongoDB: ${config.MONGODB_URI}`);
  console.log(`  PostgreSQL: ${config.DB_HOST}:${config.DB_PORT}`);
  console.log(`  Redis: ${config.REDIS_HOST}:${config.REDIS_PORT}`);
  console.log(`  日志级别: ${config.LOG_LEVEL}`);
  console.log(`  功能开关:`);
  console.log(`    - Aliyun OSS: ${derivedConfig.hasOSS ? '✓' : '✗'}`);
  console.log(`    - Aliyun IoT: ${derivedConfig.hasIoT ? '✓' : '✗'}`);
  console.log(`    - 微信公众号: ${derivedConfig.hasWXP ? '✓' : '✗'}`);
  console.log(`    - 邮件服务: ${derivedConfig.hasEmail ? '✓' : '✗'}`);
}
