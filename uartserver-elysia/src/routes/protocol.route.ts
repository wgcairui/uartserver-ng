/**
 * Protocol Routes (Phase 8.2)
 *
 * 协议管理 API 路由
 *
 * ✅ 已集成 JWT 认证中间件
 */

import { Elysia } from 'elysia';

// JWT 认证中间件
import { requireAuth } from '../middleware/jwt-auth.middleware';

// Schemas
import {
  GetProtocolParamsSchema,
  SendInstructionRequestSchema,
  UpdateUserProtocolSetupParamsSchema,
  UpdateUserProtocolSetupRequestSchema,
  GetTerminalProtocolParamsSchema,
  GetProtocolSetupParamsSchema,
  GetProtocolSetupQuerySchema,
  GetUserAlarmSetupParamsSchema,
  GetAlarmProtocolParamsSchema,
  type GetProtocolParams,
  type SendInstructionRequest,
  type UpdateUserProtocolSetupParams,
  type UpdateUserProtocolSetupRequest,
  type GetTerminalProtocolParams,
  type GetProtocolSetupParams,
  type GetProtocolSetupQuery,
  type GetUserAlarmSetupParams,
  type GetAlarmProtocolParams,
  type GetProtocolResponse,
  type SendInstructionResponse,
  type UpdateUserProtocolSetupResponse,
  type GetTerminalProtocolResponse,
  type GetProtocolSetupResponse,
  type GetUserAlarmSetupResponse,
  type GetAlarmProtocolResponse,
} from '../schemas/protocol.schema';

// Services
import { ProtocolApiService } from '../services/protocol-api.service';
import { UserService } from '../services/user.service';
import { mongodb } from '../database/mongodb';
import { Phase3Collections } from '../entities/mongodb';

// 延迟初始化服务实例
let protocolApiService: ProtocolApiService | null = null;
let userService: UserService | null = null;
let collections: Phase3Collections | null = null;

function getProtocolApiService(): ProtocolApiService {
  if (!protocolApiService) {
    protocolApiService = new ProtocolApiService(mongodb.getDatabase());
  }
  return protocolApiService;
}

function getUserService(): UserService {
  if (!userService) {
    userService = new UserService(mongodb.getDatabase());
  }
  return userService;
}

function getCollections(): Phase3Collections {
  if (!collections) {
    collections = new Phase3Collections(mongodb.getDatabase());
  }
  return collections;
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 解析系数
 * 将值根据系数公式进行转换
 *
 * @param bl 系数公式 (例如: "*10", "/100", "+5")
 * @param value 原始值
 * @returns 转换后的值
 */
function parseCoefficient(bl: string, value: number): number {
  if (!bl || bl.trim() === '') {
    return value;
  }

  const trimmed = bl.trim();

  // 乘法
  if (trimmed.startsWith('*')) {
    const multiplier = parseFloat(trimmed.substring(1));
    return value * multiplier;
  }

  // 除法
  if (trimmed.startsWith('/')) {
    const divisor = parseFloat(trimmed.substring(1));
    return value / divisor;
  }

  // 加法
  if (trimmed.startsWith('+')) {
    const addend = parseFloat(trimmed.substring(1));
    return value + addend;
  }

  // 减法
  if (trimmed.startsWith('-')) {
    const subtrahend = parseFloat(trimmed.substring(1));
    return value - subtrahend;
  }

  // 无法解析,返回原值
  return value;
}

// ============================================================================
// Elysia Routes (with JWT Authentication)
// ============================================================================

export const protocolRoutes = new Elysia({ prefix: '/api/protocols' })
  // 应用 JWT 认证中间件到所有路由
  .use(requireAuth)

  // ============================================================================
  // 协议查询
  // ============================================================================

  /**
   * GET /api/protocols/:code
   * 获取协议详情
   */
  .get(
    '/:code',
    async ({ params }): Promise<GetProtocolResponse> => {
      try {
        const protocol = await getProtocolApiService().getProtocol(params.code);

        if (!protocol) {
          return {
            status: 'ok',
            data: null as any, // 协议不存在时返回 null
          };
        }

        return {
          status: 'ok',
          data: protocol as any,
        };
      } catch (error) {
        console.error('Error getting protocol:', error);
        throw error;
      }
    },
    {
      params: GetProtocolParamsSchema,
    }
  )

  /**
   * GET /api/protocols/:code/alarm
   * 获取协议告警配置 (系统级)
   */
  .get(
    '/:code/alarm',
    async ({ params }): Promise<GetAlarmProtocolResponse> => {
      try {
        const alarmConfig =
          await getProtocolApiService().getProtocolAlarmConfig(params.code);

        if (!alarmConfig) {
          return {
            status: 'ok',
            data: {
              Protocol: params.code,
              ProtocolType: '',
            },
          };
        }

        return {
          status: 'ok',
          data: alarmConfig as any,
        };
      } catch (error) {
        console.error('Error getting alarm protocol:', error);
        throw error;
      }
    },
    {
      params: GetAlarmProtocolParamsSchema,
    }
  )

  /**
   * GET /api/protocols/:code/alarm-setup
   * 获取用户告警协议配置
   */
  .get(
    '/:code/alarm-setup',
    async ({ userId, params }): Promise<GetUserAlarmSetupResponse> => {
      try {
        const userConfig = await getProtocolApiService().getUserProtocolConfig(
          userId,
          params.code
        );

        return {
          status: 'ok',
          data: userConfig as any,
        };
      } catch (error) {
        console.error('Error getting user alarm setup:', error);
        throw error;
      }
    },
    {
      params: GetUserAlarmSetupParamsSchema,
    }
  )

  /**
   * GET /api/protocols/:code/setup
   * 获取协议配置 (系统 + 用户)
   */
  .get(
    '/:code/setup',
    async ({ userId, params, query }): Promise<GetProtocolSetupResponse> => {
      try {
        const { type } = query;

        // 获取系统默认配置
        const sysConfig =
          await getProtocolApiService().getProtocolAlarmConfig(params.code);

        // 获取用户自定义配置
        const userConfig = await getProtocolApiService().getUserProtocolConfig(
          userId,
          params.code
        );

        return {
          status: 'ok',
          data: {
            sys: sysConfig ? (sysConfig as any)[type] : [],
            user: userConfig ? (userConfig as any)[type] : [],
          },
        };
      } catch (error) {
        console.error('Error getting protocol setup:', error);
        throw error;
      }
    },
    {
      params: GetProtocolSetupParamsSchema,
      query: GetProtocolSetupQuerySchema,
    }
  )

  /**
   * GET /api/protocols/terminal/:mac/:pid
   * 获取终端指定 PID 的协议信息
   */
  .get(
    '/terminal/:mac/:pid',
    async ({ userId, params }): Promise<GetTerminalProtocolResponse> => {
      try {
        const { mac, pid } = params;

        // 检查用户是否有权限访问该设备
        const hasAccess = await getUserService().hasDeviceAccess(userId, mac);
        if (!hasAccess) {
          return {
            status: 'ok',
            data: null,
          };
        }

        // 获取终端信息
        const terminal = await getCollections().terminals.findOne({
          DevMac: mac,
        });

        if (!terminal || !terminal.mountDevs) {
          return {
            status: 'ok',
            data: null,
          };
        }

        // 查找指定 PID 的挂载设备
        const mountDev = terminal.mountDevs.find((dev) => dev.pid === pid);

        return {
          status: 'ok',
          data: mountDev
            ? {
                pid: mountDev.pid,
                protocol: mountDev.protocol,
                Type: mountDev.Type,
                protocolType: mountDev.protocolType,
                port: mountDev.port,
                remark: mountDev.remark,
              }
            : null,
        };
      } catch (error) {
        console.error('Error getting terminal protocol:', error);
        throw error;
      }
    },
    {
      params: GetTerminalProtocolParamsSchema,
    }
  )

  // ============================================================================
  // 协议操作
  // ============================================================================

  /**
   * POST /api/protocols/send-instruction
   * 发送协议指令到设备
   *
   * 注意: 该端点需要 Socket.IO 或 WebSocket 支持
   * 当前实现为 placeholder,需要后续集成实时通信层
   */
  .post(
    '/send-instruction',
    async ({ userId, body }): Promise<SendInstructionResponse> => {
      try {
        const { query, item } = body.data;

        // 检查用户是否绑定该设备
        const isBound = await getUserService().hasDeviceAccess(
          userId,
          query.DevMac
        );

        if (!isBound) {
          return {
            status: 'ok',
            message: '设备未绑定',
            data: { success: false },
          };
        }

        // 获取协议信息
        const protocol = await getProtocolApiService().getProtocol(
          query.protocol
        );

        if (!protocol) {
          return {
            status: 'ok',
            message: '协议不存在',
            data: { success: false },
          };
        }

        // 构造指令查询
        const eventName = 'oprate' + Date.now() + query.DevMac;
        let instructContent = item.value;

        // 检查操作指令是否含有自定义参数 (%i)
        if (/%i/.test(item.value)) {
          if (item.val === undefined) {
            return {
              status: 'ok',
              message: '缺少参数值',
              data: { success: false },
            };
          }

          const numVal = parseFloat(item.val);

          // 如果识别字为 %i%i,则把值转换为四个字节的hex字符串
          if (/%i%i/.test(item.value)) {
            const buffer = Buffer.allocUnsafe(2);
            const parsedValue = parseCoefficient(item.bl, numVal);
            buffer.writeIntBE(Math.round(parsedValue), 0, 2);
            instructContent = item.value.replace(
              /%i%i/,
              buffer.slice(0, 2).toString('hex')
            );
          } else {
            // 否则转换为两个字节
            const parsedValue = parseCoefficient(item.bl, numVal);
            const hexVal = Math.round(parsedValue).toString(16);
            instructContent = item.value.replace(
              /%i/,
              hexVal.length < 2 ? hexVal.padStart(2, '0') : hexVal
            );
          }
        }

        // TODO: 集成 Socket.IO / WebSocket 发送指令
        // const instructQuery = {
        //   protocol: query.protocol,
        //   DevMac: query.DevMac,
        //   pid: query.pid,
        //   type: protocol.Type,
        //   events: eventName,
        //   content: instructContent,
        // };
        // await socketIoService.InstructQuery(instructQuery);

        console.log('Send instruction:', {
          protocol: query.protocol,
          DevMac: query.DevMac,
          pid: query.pid,
          type: protocol.Type,
          events: eventName,
          content: instructContent,
        });

        // Placeholder: 返回成功响应
        return {
          status: 'ok',
          message: '指令已发送 (placeholder)',
          data: {
            success: true,
            event: eventName,
          },
        };
      } catch (error) {
        console.error('Error sending instruction:', error);
        throw error;
      }
    },
    {
      body: SendInstructionRequestSchema,
    }
  )

  /**
   * PUT /api/protocols/:code/user-setup
   * 更新用户协议配置
   */
  .put(
    '/:code/user-setup',
    async ({
      userId,
      params,
      body,
    }): Promise<UpdateUserProtocolSetupResponse> => {
      try {
        const { type, arg } = body.data;

        // 构造配置对象
        const config: any = {};
        config[type] = arg;

        // 更新用户配置
        const success = await getProtocolApiService().updateUserProtocolConfig(
          userId,
          params.code,
          config
        );

        // TODO: 清除 Redis 缓存
        // await redisService.setUserSetup(userId, params.code);

        return {
          status: 'ok',
          message: success ? '配置已更新' : '配置更新失败',
          data: { success },
        };
      } catch (error) {
        console.error('Error updating user protocol setup:', error);
        throw error;
      }
    },
    {
      params: UpdateUserProtocolSetupParamsSchema,
      body: UpdateUserProtocolSetupRequestSchema,
    }
  );
