/**
 * Data Query Routes (Phase 7 Day 2 + Phase 8.1 Day 2 更新)
 *
 * 数据查询 API 路由
 *
 * ✅ 已集成 JWT 认证中间件
 */

import { Elysia } from 'elysia';

// JWT 认证中间件
import { requireAuth } from '../middleware/jwt-auth.middleware';

// Schemas
import {
  GetLatestDataParamsSchema,
  GetLatestDataByNameParamsSchema,
  GetHistoryDataQuerySchema,
  GetAggregatedDataQuerySchema,
  GetTimeSeriesDataQuerySchema,
  GetRawDataQuerySchema,
  GetParsedDataQuerySchema,
  GetDataStatisticsParamsSchema,
  GetAvailableParametersParamsSchema,
  type GetLatestDataParams,
  type GetLatestDataByNameParams,
  type GetHistoryDataQuery,
  type GetAggregatedDataQuery,
  type GetTimeSeriesDataQuery,
  type GetRawDataQuery,
  type GetParsedDataQuery,
  type GetDataStatisticsParams,
  type GetAvailableParametersParams,
  type GetLatestDataResponse,
  type GetLatestDataByNameResponse,
  type GetHistoryDataResponse,
  type GetAggregatedDataResponse,
  type GetTimeSeriesDataResponse,
  type GetRawDataResponse,
  type GetParsedDataResponse,
  type GetDataStatisticsResponse,
  type GetAvailableParametersResponse,
} from '../schemas/data-query.schema';

// Services
import { DataApiService } from '../services/data-api.service';
import { mongodb } from '../database/mongodb';

// 延迟初始化服务实例（避免在模块加载时访问未连接的数据库）
let dataApiService: DataApiService | null = null;

function getDataApiService(): DataApiService {
  if (!dataApiService) {
    dataApiService = new DataApiService(mongodb.getDatabase());
  }
  return dataApiService;
}

// ============================================================================
// Elysia Routes (with JWT Authentication)
// ============================================================================

export const dataQueryRoutes = new Elysia({ prefix: '/api/data' })
  // 应用 JWT 认证中间件到所有路由
  .use(requireAuth)
  // ============================================================================
  // 最新数据查询
  // ============================================================================

  /**
   * GET /api/data/latest/:mac/:pid
   * 获取设备所有参数的最新数据
   */
  .get(
    '/latest/:mac/:pid',
    async ({ params }): Promise<GetLatestDataResponse> => {
      try {
        const data = await getDataApiService().getLatestData(params.mac, params.pid);

        return {
          status: 'ok',
          data: data.map((d) => ({
            name: d.name,
            value: d.value,
            unit: d.unit,
            timestamp: d.timestamp,
          })),
        };
      } catch (error) {
        console.error('Error getting latest data:', error);
        throw error;
      }
    },
    {
      params: GetLatestDataParamsSchema,
    }
  )

  /**
   * GET /api/data/latest/:mac/:pid/:name
   * 获取设备指定参数的最新数据
   */
  .get(
    '/latest/:mac/:pid/:name',
    async ({ params }): Promise<GetLatestDataByNameResponse> => {
      try {
        const data = await getDataApiService().getLatestDataByName(
          params.mac,
          params.pid,
          params.name
        );

        return {
          status: 'ok',
          data: data
            ? {
                name: data.name,
                value: data.value,
                unit: data.unit,
                timestamp: data.timestamp,
              }
            : null,
        };
      } catch (error) {
        console.error('Error getting latest data by name:', error);
        throw error;
      }
    },
    {
      params: GetLatestDataByNameParamsSchema,
    }
  )

  // ============================================================================
  // 历史数据查询
  // ============================================================================

  /**
   * GET /api/data/history
   * 获取历史数据（不聚合）
   */
  .get(
    '/history',
    async ({ query }): Promise<GetHistoryDataResponse> => {
      try {
        const data = await getDataApiService().getHistoryData({
          mac: query.mac,
          pid: query.pid,
          names: query.names,
          start: query.start,
          end: query.end,
          aggregate: query.aggregate,
          interval: query.interval,
        });

        return {
          status: 'ok',
          data,
        };
      } catch (error) {
        console.error('Error getting history data:', error);
        return {
          status: 'error',
          message: error instanceof Error ? error.message : '查询失败',
          data: undefined,
        };
      }
    },
    {
      query: GetHistoryDataQuerySchema,
    }
  )

  // ============================================================================
  // 聚合数据查询
  // ============================================================================

  /**
   * GET /api/data/aggregated
   * 获取聚合数据（统计信息）
   */
  .get(
    '/aggregated',
    async ({ query }): Promise<GetAggregatedDataResponse> => {
      try {
        const data = await getDataApiService().getAggregatedHistoryData({
          mac: query.mac,
          pid: query.pid,
          names: query.names,
          start: query.start,
          end: query.end,
          interval: query.interval,
        });

        return {
          status: 'ok',
          data,
        };
      } catch (error) {
        console.error('Error getting aggregated data:', error);
        return {
          status: 'error',
          message: error instanceof Error ? error.message : '查询失败',
          data: undefined,
        };
      }
    },
    {
      query: GetAggregatedDataQuerySchema,
    }
  )

  /**
   * GET /api/data/timeseries
   * 获取时间序列聚合数据（按时间间隔分组）
   */
  .get(
    '/timeseries',
    async ({ query }): Promise<GetTimeSeriesDataResponse> => {
      try {
        const data = await getDataApiService().getTimeSeriesAggregatedData({
          mac: query.mac,
          pid: query.pid,
          names: query.names,
          start: query.start,
          end: query.end,
          interval: query.interval,
        });

        return {
          status: 'ok',
          data,
        };
      } catch (error) {
        console.error('Error getting time series data:', error);
        return {
          status: 'error',
          message: error instanceof Error ? error.message : '查询失败',
          data: undefined,
        };
      }
    },
    {
      query: GetTimeSeriesDataQuerySchema,
    }
  )

  // ============================================================================
  // 原始/解析数据查询
  // ============================================================================

  /**
   * GET /api/data/raw
   * 获取原始数据（分页）
   */
  .get(
    '/raw',
    async ({ query }): Promise<GetRawDataResponse> => {
      try {
        const result = await getDataApiService().getRawData(
          query.mac,
          query.pid,
          query.start,
          query.end,
          {
            page: query.page,
            limit: query.limit,
          }
        );

        return {
          status: 'ok',
          data: result,
        };
      } catch (error) {
        console.error('Error getting raw data:', error);
        return {
          status: 'error',
          message: error instanceof Error ? error.message : '查询失败',
          data: undefined,
        };
      }
    },
    {
      query: GetRawDataQuerySchema,
    }
  )

  /**
   * GET /api/data/parsed
   * 获取解析数据（分页）
   */
  .get(
    '/parsed',
    async ({ query }): Promise<GetParsedDataResponse> => {
      try {
        const result = await getDataApiService().getParsedData(
          query.mac,
          query.pid,
          query.start,
          query.end,
          query.name,
          {
            page: query.page,
            limit: query.limit,
          }
        );

        return {
          status: 'ok',
          data: result,
        };
      } catch (error) {
        console.error('Error getting parsed data:', error);
        return {
          status: 'error',
          message: error instanceof Error ? error.message : '查询失败',
          data: undefined,
        };
      }
    },
    {
      query: GetParsedDataQuerySchema,
    }
  )

  // ============================================================================
  // 数据统计
  // ============================================================================

  /**
   * GET /api/data/statistics/:mac/:pid
   * 获取设备数据统计信息
   */
  .get(
    '/statistics/:mac/:pid',
    async ({ params }): Promise<GetDataStatisticsResponse> => {
      try {
        const stats = await getDataApiService().getDataStatistics(
          params.mac,
          params.pid
        );

        return {
          status: 'ok',
          data: stats,
        };
      } catch (error) {
        console.error('Error getting data statistics:', error);
        throw error;
      }
    },
    {
      params: GetDataStatisticsParamsSchema,
    }
  )

  /**
   * GET /api/data/parameters/:mac/:pid
   * 获取设备所有可用的参数名称
   */
  .get(
    '/parameters/:mac/:pid',
    async ({ params }): Promise<GetAvailableParametersResponse> => {
      try {
        const parameters = await getDataApiService().getAvailableParameters(
          params.mac,
          params.pid
        );

        return {
          status: 'ok',
          data: {
            mac: params.mac,
            pid: params.pid,
            parameters,
          },
        };
      } catch (error) {
        console.error('Error getting available parameters:', error);
        throw error;
      }
    },
    {
      params: GetAvailableParametersParamsSchema,
    }
  );
