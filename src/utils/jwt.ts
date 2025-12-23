/**
 * JWT (JSON Web Token) 工具函数
 *
 * 提供安全的 JWT 生成、验证和管理功能
 */

import jwt from 'jsonwebtoken';
import { config } from '../config';
import type { JWTPayload, UserDocument } from '../entities/mongodb/user.entity';

/**
 * JWT 配置
 */
const JWT_CONFIG = {
  /** 访问令牌有效期 (15分钟) */
  accessTokenExpiry: '15m',

  /** 刷新令牌有效期 (7天) */
  refreshTokenExpiry: '7d',

  /** 发行者 */
  issuer: 'uartserver-ng',

  /** 签名算法 */
  algorithm: 'HS256' as const,

  /** 密钥 (从环境变量获取) */
  get secret(): string {
    const secret = process.env.JWT_SECRET || config.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    return secret;
  },

  /** 刷新令牌密钥 (可以不同，增加安全性) */
  get refreshSecret(): string {
    return process.env.JWT_REFRESH_SECRET || config.JWT_REFRESH_SECRET || this.secret;
  },
} as const;

/**
 * 生成访问令牌
 *
 * @param user - 用户文档
 * @returns JWT 访问令牌
 */
export function generateAccessToken(user: UserDocument): string {
  const payload = {
    sub: user._id.toHexString(),
    username: user.username,
    role: user.role,
    permissions: user.permissions,
    devices: user.devices,
    type: 'access',
  };

  const token = jwt.sign(
    payload,
    JWT_CONFIG.secret,
    {
      expiresIn: JWT_CONFIG.accessTokenExpiry,
      algorithm: JWT_CONFIG.algorithm,
      issuer: JWT_CONFIG.issuer,
    },
  );

  return token;
}

/**
 * 生成刷新令牌
 *
 * @param user - 用户文档
 * @returns JWT 刷新令牌
 */
export function generateRefreshToken(user: UserDocument): string {
  const payload = {
    sub: user._id.toHexString(),
    username: user.username,
    role: user.role,
    permissions: user.permissions,
    devices: user.devices,
    type: 'refresh',
  };

  const token = jwt.sign(
    payload,
    JWT_CONFIG.refreshSecret,
    {
      expiresIn: JWT_CONFIG.refreshTokenExpiry,
      algorithm: JWT_CONFIG.algorithm,
      issuer: JWT_CONFIG.issuer,
    },
  );

  return token;
}

/**
 * 生成令牌对
 *
 * @param user - 用户文档
 * @returns 访问令牌和刷新令牌
 */
export function generateTokenPair(user: UserDocument): {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
} {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // 解码访问令牌获取过期时间
  const decoded = jwt.decode(accessToken) as jwt.JwtPayload;
  const expiresIn = decoded.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 900; // 默认15分钟

  return {
    accessToken,
    refreshToken,
    expiresIn,
  };
}

/**
 * 验证访问令牌
 *
 * @param token - JWT 访问令牌
 * @returns 解码后的载荷
 * @throws 当令牌无效时抛出错误
 */
export function verifyAccessToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, JWT_CONFIG.secret, {
      algorithms: [JWT_CONFIG.algorithm],
      issuer: JWT_CONFIG.issuer,
    }) as JWTPayload;

    // 验证令牌类型
    if (decoded.type !== 'access') {
      throw new Error('Invalid token type: expected access token');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Access token expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid access token');
    } else {
      throw error;
    }
  }
}

/**
 * 验证刷新令牌
 *
 * @param token - JWT 刷新令牌
 * @returns 解码后的载荷
 * @throws 当令牌无效时抛出错误
 */
export function verifyRefreshToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, JWT_CONFIG.refreshSecret, {
      algorithms: [JWT_CONFIG.algorithm],
      issuer: JWT_CONFIG.issuer,
    }) as JWTPayload;

    // 验证令牌类型
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type: expected refresh token');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Refresh token expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid refresh token');
    } else {
      throw error;
    }
  }
}

/**
 * 解码令牌 (不验证签名)
 *
 * @param token - JWT 令牌
 * @returns 解码后的载荷或 null
 */
export function decodeToken(token: string): jwt.JwtPayload | null {
  try {
    return jwt.decode(token) as jwt.JwtPayload;
  } catch (error) {
    return null;
  }
}

/**
 * 检查令牌是否即将过期
 *
 * @param token - JWT 令牌
 * @param thresholdMinutes - 阈值分钟数 (默认: 5分钟)
 * @returns 如果令牌在指定分钟内过期则返回 true
 */
export function isTokenExpiringSoon(token: string, thresholdMinutes: number = 5): boolean {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) {
    return true; // 无法解码，视为即将过期
  }

  const now = Math.floor(Date.now() / 1000);
  const threshold = thresholdMinutes * 60;

  return decoded.exp - now <= threshold;
}

/**
 * 从 Authorization 头部提取令牌
 *
 * @param authHeader - Authorization 头部值
 * @returns JWT 令牌或 null
 */
export function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader) {
    return null;
  }

  // 支持 "Bearer token" 格式
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // 直接返回令牌 (兼容性)
  return authHeader;
}

/**
 * 生成认证响应头
 *
 * @param tokens - 令牌对
 * @returns 包含令牌的响应头
 */
export function generateAuthHeaders(tokens: {
  accessToken: string;
  refreshToken: string;
}): Record<string, string> {
  return {
    'Authorization': `Bearer ${tokens.accessToken}`,
    'X-Refresh-Token': tokens.refreshToken,
  };
}

/**
 * 安全用户类型 (不包含敏感信息)
 */
export type SanitizedUser = Omit<UserDocument, 'passwordHash' | 'session'>;

/**
 * 清理用户敏感信息
 *
 * @param user - 用户文档
 * @returns 不包含敏感信息的用户对象
 */
export function sanitizeUser(user: UserDocument): SanitizedUser {
  const { passwordHash, session, ...sanitized } = user;
  return sanitized;
}

/**
 * 计算令牌剩余有效期
 *
 * @param token - JWT 令牌
 * @returns 剩余秒数，如果已过期返回 0
 */
export function getTokenRemainingTime(token: string): number {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) {
    return 0;
  }

  const now = Math.floor(Date.now() / 1000);
  return Math.max(0, decoded.exp - now);
}