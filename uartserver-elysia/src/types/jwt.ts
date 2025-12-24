/**
 * JWT 相关类型定义
 */

/**
 * JWT Payload 基础接口
 * 包含标准的 JWT 声明
 */
export interface JwtPayload {
  /** 用户 ID */
  userId: string;

  /** 用户名 */
  username?: string;

  /** 用户角色 */
  role?: string;

  /** Subject - JWT 标准字段（备用 userId） */
  sub?: string;

  /** Issued At - 签发时间戳 */
  iat?: number;

  /** Expiration Time - 过期时间戳 */
  exp?: number;

  /** JWT ID - 唯一标识符 */
  jti?: string;

  /** Issuer - 签发者 */
  iss?: string;

  /** Audience - 接收者 */
  aud?: string | string[];

  /** Not Before - 生效时间戳 */
  nbf?: number;

  /** 其他自定义字段 */
  [key: string]: any;
}

/**
 * JWT 验证结果
 */
export interface JwtVerifyResult {
  /** 是否验证成功 */
  valid: boolean;

  /** 解码后的 payload */
  payload?: JwtPayload;

  /** 错误信息 */
  error?: string;

  /** 错误类型 */
  errorType?: 'expired' | 'invalid' | 'malformed' | 'unknown';
}

/**
 * JWT 生成选项
 */
export interface JwtSignOptions {
  /** 过期时间（例如：'7d', '24h', '60s'） */
  expiresIn?: string | number;

  /** 签发者 */
  issuer?: string;

  /** 接收者 */
  audience?: string | string[];

  /** JWT ID */
  jwtid?: string;

  /** Subject */
  subject?: string;

  /** Not Before（延迟生效时间） */
  notBefore?: string | number;

  /** 算法 */
  algorithm?: 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512';
}

/**
 * 从 JWT payload 中提取用户 ID
 * 兼容多种可能的字段名
 */
export function extractUserId(payload: any): string | undefined {
  return payload?.userId || payload?.sub || payload?.id || payload?.user_id;
}

/**
 * 从 JWT payload 中提取用户名
 * 兼容多种可能的字段名
 */
export function extractUsername(payload: any): string | undefined {
  return payload?.username || payload?.name || payload?.user_name;
}

/**
 * 检查 JWT 是否过期
 */
export function isJwtExpired(payload: JwtPayload): boolean {
  if (!payload.exp) {
    return false; // 没有过期时间，视为永不过期
  }

  const now = Math.floor(Date.now() / 1000);
  return payload.exp < now;
}

/**
 * 检查 JWT 是否还未生效
 */
export function isJwtNotYetValid(payload: JwtPayload): boolean {
  if (!payload.nbf) {
    return false; // 没有 nbf，视为立即生效
  }

  const now = Math.floor(Date.now() / 1000);
  return payload.nbf > now;
}

/**
 * 获取 JWT 剩余有效时间（秒）
 */
export function getJwtRemainingTime(payload: JwtPayload): number | null {
  if (!payload.exp) {
    return null; // 永不过期
  }

  const now = Math.floor(Date.now() / 1000);
  const remaining = payload.exp - now;
  return remaining > 0 ? remaining : 0;
}
