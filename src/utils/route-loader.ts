/**
 * 路由加载器
 * 将装饰器元数据转换为 Fastify 路由
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ROUTE_METADATA, type ControllerMetadata } from '../decorators/controller';
import { PARAM_METADATA, type ParamMetadata } from '../decorators/params';
import {
  VALIDATION_METADATA,
  validateData,
  formatValidationError,
  type ValidateTarget,
} from '../decorators/validate';
import '../types'; // 导入 Fastify 类型扩展

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

  // 获取验证元数据
  const validationMetadata = VALIDATION_METADATA.get(ControllerClass);

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
      paramMetadata,
      validationMetadata
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
  paramMetadata?: Map<string, ParamMetadata[]>,
  validationMetadata?: Map<string, any>
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

  // 获取验证元数据
  const validation = validationMetadata?.get(handlerName);

  // 创建 Fastify 路由处理器
  const fastifyHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. 如果有验证配置，先进行验证
    if (validation) {
      const validationResult = performValidation(request, validation.config);

      if (!validationResult.success) {
        // 验证失败
        if (validation.config.throwOnError) {
          throw validationResult.error;
        }

        // 返回错误响应
        return {
          status: 'error',
          message: validationResult.message,
          data: null,
        };
      }
    }

    try {
      // 2. 提取参数（可能包含验证）
      const args = extractParameters(request, reply, methodParams);

      // 3. 调用 Controller 方法
      const result = await handlerMethod.apply(controllerInstance, args);

      // 4. 返回结果
      return result;
    } catch (error) {
      // 捕获参数验证失败的错误
      if (error instanceof Error && error.message.includes('参数验证失败')) {
        return {
          status: 'error',
          message: error.message.replace('参数验证失败: ', ''),
          data: null,
        };
      }
      // 其他错误继续抛出
      throw error;
    }
  };

  // 注册路由到 Fastify
  const methodLower = method.toLowerCase() as 'get' | 'post' | 'put' | 'delete' | 'patch';
  app[methodLower](fullPath, fastifyHandler);
}

/**
 * 执行验证
 */
function performValidation(
  request: FastifyRequest,
  config: { schema: any; target?: ValidateTarget; throwOnError?: boolean }
): { success: true } | { success: false; message: string; error: any } {
  // 确定验证目标数据
  let targetData: unknown;
  switch (config.target) {
    case 'query':
      targetData = request.query;
      break;
    case 'params':
      targetData = request.params;
      break;
    case 'body':
    default:
      targetData = request.body;
      break;
  }

  // 执行验证
  const validationResult = validateData(targetData, config.schema);

  if (!validationResult.success) {
    return {
      success: false,
      message: formatValidationError(validationResult.error),
      error: validationResult.error,
    };
  }

  return { success: true };
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
 * 提取单个参数（支持 Zod 验证）
 */
function extractParameter(
  request: FastifyRequest,
  _reply: FastifyReply,
  param: ParamMetadata
): any {
  let data: any;

  // 1. 根据参数类型提取数据
  switch (param.type) {
    case 'body':
      data = extractBodyParameter(request, param.propertyKey);
      break;

    case 'query':
      data = extractQueryParameter(request, param.propertyKey);
      break;

    case 'params':
      data = extractParamsParameter(request, param.propertyKey);
      break;

    case 'user':
      data = extractUserParameter(request, param.propertyKey);
      break;

    case 'headers':
      data = extractHeadersParameter(request, param.propertyKey);
      break;

    default:
      data = undefined;
  }

  // 2. 如果参数装饰器中提供了 schema，则验证数据
  if (param.schema) {
    const validationResult = validateData(data, param.schema);

    if (!validationResult.success) {
      // 验证失败，抛出格式化的错误
      const errorMessage = formatValidationError(validationResult.error);
      throw new Error(`参数验证失败: ${errorMessage}`);
    }

    // 返回验证后的数据
    return validationResult.data;
  }

  // 3. 没有 schema，直接返回原始数据
  return data;
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
