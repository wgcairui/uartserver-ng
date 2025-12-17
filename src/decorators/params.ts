/**
 * 参数装饰器系统
 * 用于从 HTTP 请求中提取参数
 */

/**
 * 参数类型
 */
export type ParamType = 'body' | 'query' | 'params' | 'user' | 'headers';

/**
 * 参数元数据
 */
export interface ParamMetadata {
  type: ParamType;
  index: number; // 参数在方法中的索引位置
  propertyKey?: string; // 从对象中提取的属性键（可选）
}

/**
 * 全局参数元数据存储
 * key: Controller 类构造函数
 * value: Map<方法名, ParamMetadata[]>
 */
export const PARAM_METADATA = new Map<Function, Map<string, ParamMetadata[]>>();

/**
 * 创建参数装饰器的工厂函数
 */
function createParamDecorator(type: ParamType) {
  return function (propertyKey?: string): ParameterDecorator {
    return function (target: any, methodName: string | symbol, parameterIndex: number) {
      const constructor = target.constructor;

      // 获取或创建 Controller 的参数元数据
      let controllerMetadata = PARAM_METADATA.get(constructor);
      if (!controllerMetadata) {
        controllerMetadata = new Map<string, ParamMetadata[]>();
        PARAM_METADATA.set(constructor, controllerMetadata);
      }

      // 获取或创建方法的参数元数据数组
      const methodKey = methodName as string;
      let methodParams = controllerMetadata.get(methodKey);
      if (!methodParams) {
        methodParams = [];
        controllerMetadata.set(methodKey, methodParams);
      }

      // 添加参数元数据
      methodParams.push({
        type,
        index: parameterIndex,
        propertyKey,
      });

      // 按索引排序（从小到大）
      methodParams.sort((a, b) => a.index - b.index);
    };
  };
}

/**
 * @Body 装饰器 - 从请求体中提取数据
 *
 * @param propertyKey - 可选的属性键，如果提供，则只提取该属性
 *
 * @example
 * ```typescript
 * @Post('/users')
 * createUser(@Body() data: CreateUserDto) {
 *   // data 包含完整的请求体
 * }
 *
 * @Post('/users')
 * createUser(@Body('name') name: string, @Body('age') age: number) {
 *   // 分别提取 name 和 age
 * }
 * ```
 */
export const Body = createParamDecorator('body');

/**
 * @Query 装饰器 - 从查询字符串中提取参数
 *
 * @param propertyKey - 可选的属性键
 *
 * @example
 * ```typescript
 * @Get('/users')
 * listUsers(@Query('page') page: number, @Query('limit') limit: number) {
 *   return { page, limit };
 * }
 *
 * @Get('/users')
 * listUsers(@Query() query: any) {
 *   // query 包含所有查询参数
 * }
 * ```
 */
export const Query = createParamDecorator('query');

/**
 * @Params 装饰器 - 从路由参数中提取数据
 *
 * @param propertyKey - 可选的属性键
 *
 * @example
 * ```typescript
 * @Get('/users/:id')
 * getUser(@Params('id') id: string) {
 *   return { id };
 * }
 *
 * @Get('/posts/:mac/:pid')
 * getPost(@Params('mac') mac: string, @Params('pid') pid: number) {
 *   return { mac, pid };
 * }
 *
 * @Get('/users/:id')
 * getUser(@Params() params: any) {
 *   // params 包含所有路由参数
 * }
 * ```
 */
export const Params = createParamDecorator('params');

/**
 * @User 装饰器 - 从请求中提取已认证的用户信息
 *
 * @param propertyKey - 可选的属性键
 *
 * @example
 * ```typescript
 * @Get('/profile')
 * @Auth()
 * getProfile(@User() user: any) {
 *   // user 包含完整的用户信息
 * }
 *
 * @Post('/posts')
 * @Auth()
 * createPost(@User('userId') userId: string, @Body() data: CreatePostDto) {
 *   // 只提取 userId
 * }
 * ```
 */
export const User = createParamDecorator('user');

/**
 * @Headers 装饰器 - 从请求头中提取数据
 *
 * @param propertyKey - 可选的属性键
 *
 * @example
 * ```typescript
 * @Get('/test')
 * test(@Headers('user-agent') userAgent: string) {
 *   return { userAgent };
 * }
 *
 * @Get('/test')
 * test(@Headers() headers: any) {
 *   // headers 包含所有请求头
 * }
 * ```
 */
export const Headers = createParamDecorator('headers');
