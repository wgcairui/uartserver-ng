/**
 * Controller 装饰器系统
 * 使用 Map 存储路由元数据，无需 reflect-metadata
 */

import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * HTTP 方法类型
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';

/**
 * 路由元数据
 */
export interface RouteMetadata {
  method: HttpMethod;
  path: string;
  handler: string; // 方法名
  middlewares: Array<(request: FastifyRequest, reply: FastifyReply) => Promise<void> | void>;
}

/**
 * Controller 元数据
 */
export interface ControllerMetadata {
  basePath: string;
  routes: RouteMetadata[];
}

/**
 * 全局路由元数据存储
 * key: Controller 类构造函数
 * value: Controller 元数据
 */
export const ROUTE_METADATA = new Map<Function, ControllerMetadata>();

/**
 * 规范化路径
 * 确保路径以 / 开头，不以 / 结尾（除非是根路径）
 */
function normalizePath(path: string): string {
  if (!path || path === '/') return '/';

  // 确保以 / 开头
  let normalized = path.startsWith('/') ? path : `/${path}`;

  // 移除尾部 /
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/**
 * @Controller 装饰器
 * 用于标记一个类为 Controller 并设置基础路径
 *
 * @param basePath - 基础路径，默认为 '/'
 *
 * @example
 * ```typescript
 * @Controller('/api/users')
 * export class UserController {
 *   @Get('/')
 *   list() {
 *     return [];
 *   }
 * }
 * ```
 */
export function Controller(basePath: string = '/'): ClassDecorator {
  return function (target: Function) {
    const normalizedPath = normalizePath(basePath);

    // 获取或创建元数据
    let metadata = ROUTE_METADATA.get(target);
    if (!metadata) {
      metadata = {
        basePath: normalizedPath,
        routes: [],
      };
      ROUTE_METADATA.set(target, metadata);
    } else {
      metadata.basePath = normalizedPath;
    }
  };
}

/**
 * 创建 HTTP 方法装饰器的工厂函数
 */
function createMethodDecorator(method: HttpMethod) {
  return function (path: string = '/'): MethodDecorator {
    return function (
      target: any,
      propertyKey: string | symbol,
      descriptor: PropertyDescriptor
    ) {
      const constructor = target.constructor;
      const normalizedPath = normalizePath(path);

      // 获取或创建元数据
      let metadata = ROUTE_METADATA.get(constructor);
      if (!metadata) {
        metadata = {
          basePath: '/',
          routes: [],
        };
        ROUTE_METADATA.set(constructor, metadata);
      }

      // 添加路由
      metadata.routes.push({
        method,
        path: normalizedPath,
        handler: propertyKey as string,
        middlewares: [],
      });

      return descriptor;
    };
  };
}

/**
 * @Get 装饰器 - 标记 GET 请求处理方法
 *
 * @param path - 路由路径
 *
 * @example
 * ```typescript
 * @Get('/users')
 * async getUsers() {
 *   return [];
 * }
 * ```
 */
export const Get = createMethodDecorator('GET');

/**
 * @Post 装饰器 - 标记 POST 请求处理方法
 *
 * @param path - 路由路径
 *
 * @example
 * ```typescript
 * @Post('/users')
 * async createUser(@Body() data: CreateUserDto) {
 *   return { id: 1 };
 * }
 * ```
 */
export const Post = createMethodDecorator('POST');

/**
 * @Put 装饰器 - 标记 PUT 请求处理方法
 *
 * @param path - 路由路径
 *
 * @example
 * ```typescript
 * @Put('/users/:id')
 * async updateUser(@Params('id') id: string, @Body() data: UpdateUserDto) {
 *   return { id };
 * }
 * ```
 */
export const Put = createMethodDecorator('PUT');

/**
 * @Delete 装饰器 - 标记 DELETE 请求处理方法
 *
 * @param path - 路由路径
 *
 * @example
 * ```typescript
 * @Delete('/users/:id')
 * async deleteUser(@Params('id') id: string) {
 *   return { success: true };
 * }
 * ```
 */
export const Delete = createMethodDecorator('DELETE');

/**
 * @Patch 装饰器 - 标记 PATCH 请求处理方法
 *
 * @param path - 路由路径
 *
 * @example
 * ```typescript
 * @Patch('/users/:id')
 * async patchUser(@Params('id') id: string, @Body() data: Partial<UpdateUserDto>) {
 *   return { id };
 * }
 * ```
 */
export const Patch = createMethodDecorator('PATCH');
