/**
 * Config API Controller (Phase 4.2 Day 4)
 *
 * 用户配置 API 控制器
 * 对接老系统集合: user.layouts, user.aggregations
 *
 * Endpoints:
 * 1. GET  /api/config/layout/:id        - 获取用户布局配置
 * 2. PUT  /api/config/layout/:id        - 更新用户布局配置
 * 3. GET  /api/config/aggregation/:id   - 获取用户聚合配置
 */

import { Controller, Get, Put } from '../decorators/controller';
import { Params, Body, User } from '../decorators/params';
import { mongodb } from '../database/mongodb';
import { ConfigApiService } from '../services/config-api.service';
import { DataApiService } from '../services/data-api.service';
import { TerminalApiService } from '../services/terminal-api.service';
import {
  LayoutIdParamsSchema,
  type LayoutIdParams,
  UpdateUserLayoutRequestSchema,
  type UpdateUserLayoutRequest,
  AggregationIdParamsSchema,
  type AggregationIdParams,
} from '../schemas/config.schema';

/**
 * 统一响应格式
 */
interface ApiResponse<T = unknown> {
  status: 'ok' | 'error';
  message?: string;
  data: T | null;
}

@Controller('/api/config')
export class ConfigApiController {
  private configService: ConfigApiService;
  private dataService: DataApiService;
  private terminalService: TerminalApiService;

  constructor() {
    this.configService = new ConfigApiService(mongodb.getDatabase());
    this.dataService = new DataApiService(mongodb.getDatabase());
    this.terminalService = new TerminalApiService(mongodb.getDatabase());
  }

  // ============================================================================
  // 用户布局配置 API
  // ============================================================================

  /**
   * GET /api/config/layout/:id
   *
   * 获取用户布局配置（包含实时数据）
   *
   * 对应老系统 getUserLayout 功能
   *
   * @param params - 路径参数 { id: layoutId }
   * @param userId - 当前用户 ID (from JWT)
   * @returns 布局配置（Layout[].result 包含实时数据）
   */
  @Get('/layout/:id')
  async getUserLayout(
    @Params(LayoutIdParamsSchema) params: LayoutIdParams,
    @User('userId') userId: string
  ): Promise<ApiResponse> {
    try {
      const { id: layoutId } = params;

      // 获取布局配置
      const layout = await this.configService.getUserLayout(userId, layoutId);

      if (!layout) {
        return {
          status: 'error',
          message: `Layout '${layoutId}' not found for current user`,
          data: null,
        };
      }

      // 实时数据注入（Phase 4.2 Day 5）
      // 为每个布局项注入最新设备数据
      for (const item of layout.Layout) {
        try {
          const data = await this.dataService.getLatestDataByName(
            item.bind.mac,
            item.bind.pid,
            item.bind.name
          );
          // 注入实时数据到 result 字段（与老系统保持一致）
          item.result = data ? {
            name: data.name,
            value: data.value,
            unit: data.unit,
            parseValue: data.parseValue,
            alarm: data.alarm,
          } : null;
        } catch (error) {
          // 如果单个数据获取失败，不影响整体布局
          item.result = null;
        }
      }

      return {
        status: 'ok',
        data: layout,
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to get layout',
        data: null,
      };
    }
  }

  /**
   * PUT /api/config/layout/:id
   *
   * 更新用户布局配置
   *
   * 对应老系统 setUserLayout 功能
   *
   * @param params - 路径参数 { id: layoutId }
   * @param body - 请求体 { data: { type, bg, Layout } }
   * @param userId - 当前用户 ID (from JWT)
   * @returns 操作结果
   */
  @Put('/layout/:id')
  async updateUserLayout(
    @Params(LayoutIdParamsSchema) params: LayoutIdParams,
    @Body(UpdateUserLayoutRequestSchema) body: UpdateUserLayoutRequest,
    @User('userId') userId: string
  ): Promise<ApiResponse> {
    try {
      const { id: layoutId } = params;
      const { type, bg, Layout } = body.data;

      // 验证布局项数量
      if (Layout.length > 50) {
        return {
          status: 'error',
          message: 'Maximum 50 layout items allowed per layout',
          data: null,
        };
      }

      // 更新或创建布局配置
      const success = await this.configService.setUserLayout(
        userId,
        layoutId,
        type,
        bg,
        Layout
      );

      if (!success) {
        return {
          status: 'error',
          message: 'Failed to update layout',
          data: null,
        };
      }

      return {
        status: 'ok',
        message: 'Layout updated successfully',
        data: {
          layoutId,
          itemCount: Layout.length,
        },
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to update layout',
        data: null,
      };
    }
  }

  // ============================================================================
  // 用户聚合配置 API
  // ============================================================================

  /**
   * GET /api/config/aggregation/:id
   *
   * 获取用户聚合配置（包含设备状态和实时数据）
   *
   * 对应老系统 getAggregation 功能
   *
   * @param params - 路径参数 { id: aggregationId }
   * @param userId - 当前用户 ID (from JWT)
   * @returns 聚合配置（aggregations[] 包含在线状态和最新数据）
   */
  @Get('/aggregation/:id')
  async getUserAggregation(
    @Params(AggregationIdParamsSchema) params: AggregationIdParams,
    @User('userId') userId: string
  ): Promise<ApiResponse> {
    try {
      const { id: aggregationId } = params;

      // 获取聚合配置
      const aggregation = await this.configService.getUserAggregation(
        userId,
        aggregationId
      );

      if (!aggregation) {
        return {
          status: 'error',
          message: `Aggregation '${aggregationId}' not found for current user`,
          data: null,
        };
      }

      // 实时状态注入（Phase 4.2 Day 5）
      // 批量获取所有设备的终端信息和数据
      const deviceMacs = aggregation.aggregations.map((d) => d.DevMac);
      const terminals = await this.terminalService.getTerminalsByMacs(deviceMacs);

      // 构建 MAC 到终端信息的映射
      const terminalMap = new Map(terminals.map((t) => [t.mac, t]));

      // 为每个聚合设备注入状态和数据
      for (const device of aggregation.aggregations) {
        const terminal = terminalMap.get(device.DevMac);

        // 注入终端在线状态
        device.online = terminal?.online || false;
        device.lastSeen = terminal?.lastOnline || null;

        // 注入最新设备数据（如果有 pid）
        if (device.pid !== undefined && device.pid >= 0) {
          try {
            const dataList = await this.dataService.getLatestData(
              device.DevMac,
              device.pid
            );
            device.data = dataList.map((d) => ({
              name: d.name,
              value: d.value,
              unit: d.unit,
              parseValue: d.parseValue,
              alarm: d.alarm,
            }));
          } catch (error) {
            device.data = [];
          }
        } else {
          device.data = [];
        }
      }

      return {
        status: 'ok',
        data: aggregation,
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to get aggregation',
        data: null,
      };
    }
  }

  // ============================================================================
  // 辅助端点 (未来扩展)
  // ============================================================================

  /**
   * GET /api/config/layouts
   *
   * 获取用户所有布局配置 (未来扩展)
   *
   * @param userId - 当前用户 ID (from JWT)
   * @returns 布局配置列表
   */
  @Get('/layouts')
  async getUserLayouts(
    @User('userId') userId: string
  ): Promise<ApiResponse> {
    try {
      const layouts = await this.configService.getUserLayouts(userId);

      return {
        status: 'ok',
        data: {
          count: layouts.length,
          layouts: layouts.map((layout) => ({
            id: layout.id,
            type: layout.type,
            itemCount: layout.Layout.length,
            bg: layout.bg,
          })),
        },
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to get layouts',
        data: null,
      };
    }
  }

  /**
   * GET /api/config/aggregations
   *
   * 获取用户所有聚合配置 (未来扩展)
   *
   * @param userId - 当前用户 ID (from JWT)
   * @returns 聚合配置列表
   */
  @Get('/aggregations')
  async getUserAggregations(
    @User('userId') userId: string
  ): Promise<ApiResponse> {
    try {
      const aggregations = await this.configService.getUserAggregations(userId);

      return {
        status: 'ok',
        data: {
          count: aggregations.length,
          aggregations: aggregations.map((agg) => ({
            id: agg.id,
            name: agg.name,
            deviceCount: agg.aggregations.length,
          })),
        },
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to get aggregations',
        data: null,
      };
    }
  }
}
