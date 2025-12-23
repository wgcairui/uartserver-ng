/**
 * Fastify 类型扩展
 * 扩展 FastifyRequest 接口以支持自定义属性
 */

import 'fastify';
import type { JWTPayload } from './entities/mongodb/user.entity';
import type { SanitizedUser } from './utils/jwt';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * 已认证的用户信息 (已移除敏感字段)
     * 由认证中间件设置
     */
    user?: SanitizedUser;

    /**
     * JWT 载荷
     */
    jwtPayload?: JWTPayload;
  }
}
