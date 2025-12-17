/**
 * 路由加载器
 * 将装饰器元数据转换为 Fastify 路由
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ROUTE_METADATA, type ControllerMetadata } from '../decorators/controller';
import { PARAM_METADATA, type ParamMetadata } from '../decorators/params';

/**
 * Controller 构造函数类型
 */
type ControllerConstructor = new (...args: any[]) => any;

/**
 * 注册所有 Controllers 到 Fastify
 *
 * @param app - Fastify 实例
 * @param controllers - Controller 类数组
 *
 * @example
 * ```typescript
 * const app = Fastify();
 * registerControllers(app, [UserController, PostController]);
 * ```
 */
export function registerControllers(
  app: FastifyInstance,
  controllers: ControllerConstructor[]
): void {
  for (const ControllerClass of controllers) {
    registerController(app, ControllerClass);
  }
}

/**
 * 注册单个 Controller
 */
function registerController(
  app: FastifyInstance,
  ControllerClass: ControllerConstructor
): void {
  // 获取 Controller 元数据
  const controllerMetadata = ROUTE_METADATA.get(ControllerClass);
  if (!controllerMetadata) {
    console.warn(`Controller ${ControllerClass.name} has no metadata`);
    return;
  }

  // 获取参数元数据
  const paramMetadata = PARAM_METADATA.get(ControllerClass);

  // 创建 Controller 实例
  const controllerInstance = new ControllerClass();

  // 注册所有路由
  for (const route of controllerMetadata.routes) {
    registerRoute(
      app,
      controllerMetadata,
      route.method,
      route.path,
      route.handler,
      controllerInstance,
      paramMetadata
    );
  }
}

/**
 * 注册单个路由
 */
function registerRoute(
  app: FastifyInstance,
  controllerMetadata: ControllerMetadata,
  method: string,
  path: string,
  handlerName: string,
  controllerInstance: any,
  paramMetadata?: Map<string, ParamMetadata[]>
): void {
  // 组合完整路径
  const fullPath = combinePath(controllerMetadata.basePath, path);

  // 获取处理函数
  const handlerMethod = controllerInstance[handlerName];
  if (typeof handlerMethod !== 'function') {
    console.warn(`Handler ${handlerName} is not a function`);
    return;
  }

  // 获取参数元数据
  const methodParams = paramMetadata?.get(handlerName) || [];

  // 创建 Fastify 路由处理器
  const fastifyHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    // 提取参数
    const args = extractParameters(request, reply, methodParams);

    // 调用 Controller 方法
    const result = await handlerMethod.apply(controllerInstance, args);

    // 返回结果
    return result;
  };

  // 注册路由到 Fastify
  const methodLower = method.toLowerCase() as 'get' | 'post' | 'put' | 'delete' | 'patch';
  app[methodLower](fullPath, fastifyHandler);
}

/**
 * 组合基础路径和路由路径
 */
function combinePath(basePath: string, routePath: string): string {
  // 移除 basePath 的尾部斜杠
  const base = basePath.endsWith('/') && basePath !== '/' ? basePath.slice(0, -1) : basePath;

  // 确保 routePath 以斜杠开头
  const route = routePath.startsWith('/') ? routePath : `/${routePath}`;

  // 组合路径
  if (base === '/') {
    return route;
  }

  // 特殊情况：如果 route 是 '/'，直接返回 basePath
  if (route === '/') {
    return base;
  }

  return `${base}${route}`;
}

/**
 * 从请求中提取参数
 */
function extractParameters(
  request: FastifyRequest,
  reply: FastifyReply,
  paramMetadata: ParamMetadata[]
): any[] {
  // 按参数索引排序
  const sortedParams = [...paramMetadata].sort((a, b) => a.index - b.index);

  // 提取每个参数
  return sortedParams.map((param) => extractParameter(request, reply, param));
}

/**
 * 提取单个参数
 */
function extractParameter(
  request: FastifyRequest,
  reply: FastifyReply,
  param: ParamMetadata
): any {
  switch (param.type) {
    case 'body':
      return extractBodyParameter(request, param.propertyKey);

    case 'query':
      return extractQueryParameter(request, param.propertyKey);

    case 'params':
      return extractParamsParameter(request, param.propertyKey);

    case 'user':
      return extractUserParameter(request, param.propertyKey);

    case 'headers':
      return extractHeadersParameter(request, param.propertyKey);

    default:
      return undefined;
  }
}

/**
 * 提取 Body 参数
 */
function extractBodyParameter(request: FastifyRequest, propertyKey?: string): any {
  const body = request.body;

  if (!propertyKey) {
    return body;
  }

  if (body && typeof body === 'object') {
    return (body as any)[propertyKey];
  }

  return undefined;
}

/**
 * 提取 Query 参数
 */
function extractQueryParameter(request: FastifyRequest, propertyKey?: string): any {
  const query = request.query;

  if (!propertyKey) {
    return query;
  }

  if (query && typeof query === 'object') {
    return (query as any)[propertyKey];
  }

  return undefined;
}

/**
 * 提取 Params 参数
 */
function extractParamsParameter(request: FastifyRequest, propertyKey?: string): any {
  const params = request.params;

  if (!propertyKey) {
    return params;
  }

  if (params && typeof params === 'object') {
    return (params as any)[propertyKey];
  }

  return undefined;
}

/**
 * 提取 User 参数
 */
function extractUserParameter(request: FastifyRequest, propertyKey?: string): any {
  const user = request.user;

  if (!propertyKey) {
    return user;
  }

  if (user && typeof user === 'object') {
    return (user as any)[propertyKey];
  }

  return undefined;
}

/**
 * 提取 Headers 参数
 */
function extractHeadersParameter(request: FastifyRequest, propertyKey?: string): any {
  const headers = request.headers;

  if (!propertyKey) {
    return headers;
  }

  return headers[propertyKey.toLowerCase()];
}
