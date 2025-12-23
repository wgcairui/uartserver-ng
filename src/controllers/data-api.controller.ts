/**
 * Data API Controller (Phase 4.2 Day 2)
 *
 * 数据查询 API 控制器 - 6 个端点
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { Controller, Get, Post } from '../decorators/controller';
import { Params, Query, Body } from '../decorators/params';
import { mongodb } from '../database/mongodb';
import { DataApiService } from '../services/data-api.service';
import { UserApiService } from '../services/user-api.service';
import type { UserDocument } from '../entities/mongodb';
import {
  MacPidParamsSchema,
  type MacPidParams,
  MacPidNameParamsSchema,
  type MacPidNameParams,
  HistoryDataQuerySchema,
  type HistoryDataQuery,
  SingleParamHistoryQuerySchema,
  type SingleParamHistoryQuery,
  RawDataQuerySchema,
  type RawDataQuery,
  ParsedDataQuerySchema,
  type ParsedDataQuery,
  RefreshTimeoutRequestSchema,
  type RefreshTimeoutRequest,
  validateTimeRange,
  validateAggregation,
} from '../schemas/data.schema';

/**
 * 数据查询 API 控制器
 *
 * 端点清单:
 * - GET  /api/data/latest/:mac/:pid          - 获取最新数据
 * - GET  /api/data/history/:mac/:pid         - 获取历史数据
 * - GET  /api/data/:mac/:pid/:name           - 获取指定参数数据
 * - GET  /api/data/raw                       - 获取原始数据（分页）
 * - GET  /api/data/parsed                    - 获取解析数据（分页）
 * - POST /api/data/:mac/:pid/refresh-timeout - 设置刷新超时
 */
@Controller('/api/data')
export class DataApiController {
  private dataService: DataApiService;
  private userService: UserApiService;

  constructor() {
    this.dataService = new DataApiService(mongodb.getDatabase());
    this.userService = new UserApiService(mongodb.getDatabase());
  }

  /**
   * 获取设备最新数据
   * GET /api/data/latest/:mac/:pid
   *
   * 返回设备所有参数的最新值（单例数据）
   */
  @Get('/latest/:mac/:pid')
  async getLatestData(
    @Params(MacPidParamsSchema) params: MacPidParams,
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const user = request.user as UserDocument;
    if (!user) {
      return reply.status(401).send({
        status: 'error',
        message: 'Unauthorized',
        data: null,
      });
    }

    const { mac, pid } = params;

    // 检查权限
    const isBound = await this.userService.isDeviceBound(user._id.toHexString(), mac);
    if (!isBound && user.role !== 'admin') {
      return reply.status(403).send({
        status: 'error',
        message: 'Device access denied',
        data: null,
      });
    }

    // 获取最新数据
    const data = await this.dataService.getLatestData(mac, pid);

    if (data.length === 0) {
      return reply.status(404).send({
        status: 'error',
        message: 'No data available for this device',
        data: null,
      });
    }

    return reply.send({
      status: 'ok',
      data: data.map((d) => ({
        name: d.name,
        value: d.value,
        unit: d.unit,
        timestamp: d.timestamp.getTime(),
      })),
    });
  }

  /**
   * 获取历史数据
   * GET /api/data/history/:mac/:pid
   *
   * Query 参数:
   * - name: 参数名称（可选，支持多个，逗号分隔）
   * - start: 开始时间（Unix 时间戳，毫秒）
   * - end: 结束时间（Unix 时间戳，毫秒）
   * - aggregate: 是否聚合（可选，默认 false）
   * - interval: 聚合间隔（秒，可选）
   */
  @Get('/history/:mac/:pid')
  async getHistoryData(
    @Params(MacPidParamsSchema) params: MacPidParams,
    @Query(HistoryDataQuerySchema) query: HistoryDataQuery,
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const user = request.user as UserDocument;
    if (!user) {
      return reply.status(401).send({
        status: 'error',
        message: 'Unauthorized',
        data: null,
      });
    }

    const { mac, pid } = params;
    const { name, start, end, aggregate, interval } = query;

    // 检查权限
    const isBound = await this.userService.isDeviceBound(user._id.toHexString(), mac);
    if (!isBound && user.role !== 'admin') {
      return reply.status(403).send({
        status: 'error',
        message: 'Device access denied',
        data: null,
      });
    }

    // 验证时间范围
    const timeValidation = validateTimeRange(start, end);
    if (!timeValidation.valid) {
      return reply.status(400).send({
        status: 'error',
        message: timeValidation.error,
        data: null,
      });
    }

    // 验证聚合参数
    if (aggregate) {
      const aggValidation = validateAggregation(aggregate, interval);
      if (!aggValidation.valid) {
        return reply.status(400).send({
          status: 'error',
          message: aggValidation.error,
          data: null,
        });
      }
    }

    try {
      // 根据是否聚合选择不同的查询方法
      if (aggregate && interval) {
        // 时间序列聚合
        const data = await this.dataService.getTimeSeriesAggregatedData({
          mac,
          pid,
          names: name,
          start,
          end,
          aggregate: true,
          interval,
        });

        return reply.send({
          status: 'ok',
          data: data.map((d) => ({
            timestamp: d.timestamp.getTime(),
            name: d.name,
            avg: d.avg,
            count: d.count,
          })),
        });
      } else if (aggregate) {
        // 统计聚合
        const data = await this.dataService.getAggregatedHistoryData({
          mac,
          pid,
          names: name,
          start,
          end,
          aggregate: true,
        });

        return reply.send({
          status: 'ok',
          data,
        });
      } else {
        // 不聚合，返回原始历史数据点
        const data = await this.dataService.getHistoryData({
          mac,
          pid,
          names: name,
          start,
          end,
        });

        return reply.send({
          status: 'ok',
          data: data.map((d) => ({
            timestamp: d.timestamp.getTime(),
            name: d.name,
            value: d.value,
            unit: d.unit,
          })),
        });
      }
    } catch (error: any) {
      return reply.status(500).send({
        status: 'error',
        message: error.message || 'Failed to query history data',
        data: null,
      });
    }
  }

  /**
   * 获取指定参数的历史数据
   * GET /api/data/:mac/:pid/:name
   *
   * Query 参数:
   * - start: 开始时间（Unix 时间戳，毫秒）
   * - end: 结束时间（Unix 时间戳，毫秒）
   * - aggregate: 是否聚合（可选，默认 false）
   * - interval: 聚合间隔（秒，可选）
   */
  @Get('/:mac/:pid/:name')
  async getSingleParamData(
    @Params(MacPidNameParamsSchema) params: MacPidNameParams,
    @Query(SingleParamHistoryQuerySchema) query: SingleParamHistoryQuery,
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const user = request.user as UserDocument;
    if (!user) {
      return reply.status(401).send({
        status: 'error',
        message: 'Unauthorized',
        data: null,
      });
    }

    const { mac, pid, name } = params;
    const { start, end, aggregate, interval } = query;

    // 检查权限
    const isBound = await this.userService.isDeviceBound(user._id.toHexString(), mac);
    if (!isBound && user.role !== 'admin') {
      return reply.status(403).send({
        status: 'error',
        message: 'Device access denied',
        data: null,
      });
    }

    // 验证时间范围
    const timeValidation = validateTimeRange(start, end);
    if (!timeValidation.valid) {
      return reply.status(400).send({
        status: 'error',
        message: timeValidation.error,
        data: null,
      });
    }

    // 验证聚合参数
    if (aggregate) {
      const aggValidation = validateAggregation(aggregate, interval);
      if (!aggValidation.valid) {
        return reply.status(400).send({
          status: 'error',
          message: aggValidation.error,
          data: null,
        });
      }
    }

    try {
      if (aggregate && interval) {
        // 时间序列聚合
        const data = await this.dataService.getTimeSeriesAggregatedData({
          mac,
          pid,
          names: [name],
          start,
          end,
          aggregate: true,
          interval,
        });

        return reply.send({
          status: 'ok',
          data: data.map((d) => ({
            timestamp: d.timestamp.getTime(),
            avg: d.avg,
            count: d.count,
          })),
        });
      } else if (aggregate) {
        // 统计聚合
        const data = await this.dataService.getAggregatedHistoryData({
          mac,
          pid,
          names: [name],
          start,
          end,
          aggregate: true,
        });

        return reply.send({
          status: 'ok',
          data: data[0] || null,
        });
      } else {
        // 不聚合
        const data = await this.dataService.getHistoryData({
          mac,
          pid,
          names: [name],
          start,
          end,
        });

        return reply.send({
          status: 'ok',
          data: data.map((d) => ({
            timestamp: d.timestamp.getTime(),
            value: d.value,
            unit: d.unit,
          })),
        });
      }
    } catch (error: any) {
      return reply.status(500).send({
        status: 'error',
        message: error.message || 'Failed to query parameter data',
        data: null,
      });
    }
  }

  /**
   * 获取原始数据（分页）
   * GET /api/data/raw
   *
   * Query 参数:
   * - mac: 设备 MAC 地址
   * - pid: 协议 ID
   * - start: 开始时间（Unix 时间戳，毫秒）
   * - end: 结束时间（Unix 时间戳，毫秒）
   * - page: 页码（可选，默认 1）
   * - limit: 每页数量（可选，默认 100）
   */
  @Get('/raw')
  async getRawData(
    @Query(RawDataQuerySchema) query: RawDataQuery,
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const user = request.user as UserDocument;
    if (!user) {
      return reply.status(401).send({
        status: 'error',
        message: 'Unauthorized',
        data: null,
      });
    }

    const { mac, pid, start, end, page, limit } = query;

    // 检查权限
    const isBound = await this.userService.isDeviceBound(user._id.toHexString(), mac);
    if (!isBound && user.role !== 'admin') {
      return reply.status(403).send({
        status: 'error',
        message: 'Device access denied',
        data: null,
      });
    }

    // 验证时间范围
    const timeValidation = validateTimeRange(start, end);
    if (!timeValidation.valid) {
      return reply.status(400).send({
        status: 'error',
        message: timeValidation.error,
        data: null,
      });
    }

    try {
      const result = await this.dataService.getRawData(mac, pid, start, end, {
        page,
        limit,
      });

      return reply.send({
        status: 'ok',
        data: result.data.map((d) => ({
          data: d.data,
          timestamp: d.timestamp.getTime(),
        })),
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
      });
    } catch (error: any) {
      return reply.status(500).send({
        status: 'error',
        message: error.message || 'Failed to query raw data',
        data: null,
      });
    }
  }

  /**
   * 获取解析数据（分页）
   * GET /api/data/parsed
   *
   * Query 参数:
   * - mac: 设备 MAC 地址
   * - pid: 协议 ID
   * - name: 参数名称（可选）
   * - start: 开始时间（Unix 时间戳，毫秒）
   * - end: 结束时间（Unix 时间戳，毫秒）
   * - page: 页码（可选，默认 1）
   * - limit: 每页数量（可选，默认 100）
   */
  @Get('/parsed')
  async getParsedData(
    @Query(ParsedDataQuerySchema) query: ParsedDataQuery,
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const user = request.user as UserDocument;
    if (!user) {
      return reply.status(401).send({
        status: 'error',
        message: 'Unauthorized',
        data: null,
      });
    }

    const { mac, pid, name, start, end, page, limit } = query;

    // 检查权限
    const isBound = await this.userService.isDeviceBound(user._id.toHexString(), mac);
    if (!isBound && user.role !== 'admin') {
      return reply.status(403).send({
        status: 'error',
        message: 'Device access denied',
        data: null,
      });
    }

    // 验证时间范围
    const timeValidation = validateTimeRange(start, end);
    if (!timeValidation.valid) {
      return reply.status(400).send({
        status: 'error',
        message: timeValidation.error,
        data: null,
      });
    }

    try {
      const result = await this.dataService.getParsedData(
        mac,
        pid,
        start,
        end,
        name,
        {
          page,
          limit,
        }
      );

      return reply.send({
        status: 'ok',
        data: result.data.map((d) => ({
          name: d.name,
          value: d.value,
          unit: d.unit,
          timestamp: d.timestamp.getTime(),
        })),
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
      });
    } catch (error: any) {
      return reply.status(500).send({
        status: 'error',
        message: error.message || 'Failed to query parsed data',
        data: null,
      });
    }
  }

  /**
   * 设置数据刷新超时
   * POST /api/data/:mac/:pid/refresh-timeout
   *
   * Body:
   * - data.interval: 刷新间隔（毫秒，可选）
   *
   * 注意：此端点主要用于兼容老系统，新系统可能使用不同的机制
   */
  @Post('/:mac/:pid/refresh-timeout')
  async setRefreshTimeout(
    @Params(MacPidParamsSchema) params: MacPidParams,
    @Body(RefreshTimeoutRequestSchema) body: RefreshTimeoutRequest,
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const user = request.user as UserDocument;
    if (!user) {
      return reply.status(401).send({
        status: 'error',
        message: 'Unauthorized',
        data: null,
      });
    }

    const { mac, pid } = params;
    const { interval } = body.data;

    // 检查权限
    const isBound = await this.userService.isDeviceBound(user._id.toHexString(), mac);
    if (!isBound && user.role !== 'admin') {
      return reply.status(403).send({
        status: 'error',
        message: 'Device access denied',
        data: null,
      });
    }

    // TODO: 实现刷新超时逻辑（可能需要 Redis 或其他机制）
    // 这里先返回成功，具体实现取决于系统架构

    return reply.send({
      status: 'ok',
      message: 'Refresh timeout updated',
      data: {
        mac,
        pid,
        interval: interval || 0,
      },
    });
  }
}
