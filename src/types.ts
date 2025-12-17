/**
 * Fastify 类型扩展
 * 扩展 FastifyRequest 接口以支持自定义属性
 */

import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * 已认证的用户信息
     * 由认证中间件设置
     */
    user?: {
      userId: string;
      username: string;
      [key: string]: any;
    };
  }
}
