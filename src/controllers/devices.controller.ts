/**
 * Devices Controller
 *
 * 设备管理 API:
 * - 获取设备列表
 * - 获取设备详情
 * - 获取设备数据
 * - 手动查询设备
 */

import { Controller, Get, Post } from '../decorators/controller';
import { Params, Query } from '../decorators/params';

/**
 * 设备信息
 */
export interface Device {
  /** 终端 MAC 地址 */
  mac: string;
  /** 设备 PID */
  pid: string;
  /** 设备名称 */
  name: string;
  /** 设备类型 */
  type: string;
  /** 协议 */
  protocol: string;
  /** 在线状态 */
  online: boolean;
  /** 最后上线时间 */
  lastOnlineAt?: Date;
  /** 最后数据时间 */
  lastDataAt?: Date;
}

/**
 * 设备数据查询参数
 */
export interface DeviceDataQuery {
  /** 开始时间 */
  startTime?: string;
  /** 结束时间 */
  endTime?: string;
  /** 每页数量 */
  limit?: number;
  /** 页码 */
  page?: number;
}

/**
 * Devices Controller
 */
@Controller('/api/devices')
export class DevicesController {
  /**
   * 获取设备列表
   *
   * GET /api/devices?mac={mac}&online={online}&limit={limit}&page={page}
   */
  @Get('/')
  async listDevices(
    @Query('mac') mac?: string,
    @Query('online') online?: string,
    @Query('limit') limit: string = '20',
    @Query('page') page: string = '1'
  ) {
    console.log(`[DevicesController] List devices: mac=${mac}, online=${online}`);

    // TODO: 从数据库查询设备列表
    const devices: Device[] = [
      {
        mac: '00:11:22:33:44:55',
        pid: 'device-1',
        name: '测试设备 1',
        type: 'sensor',
        protocol: 'modbus',
        online: true,
        lastOnlineAt: new Date(),
        lastDataAt: new Date(),
      },
    ];

    return {
      status: 'ok',
      data: {
        devices,
        total: devices.length,
        page: parseInt(page),
        limit: parseInt(limit),
      },
    };
  }

  /**
   * 获取设备详情
   *
   * GET /api/devices/:mac
   */
  @Get('/:mac')
  async getDevice(@Params('mac') mac: string) {
    console.log(`[DevicesController] Get device: ${mac}`);

    // TODO: 从数据库查询设备详情

    return {
      status: 'ok',
      data: {
        mac,
        pid: 'device-1',
        name: '测试设备 1',
        type: 'sensor',
        protocol: 'modbus',
        online: true,
        lastOnlineAt: new Date(),
        lastDataAt: new Date(),
      },
    };
  }

  /**
   * 获取设备历史数据
   *
   * GET /api/devices/:mac/data?startTime={start}&endTime={end}&limit={limit}
   */
  @Get('/:mac/data')
  async getDeviceData(
    @Params('mac') mac: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
    @Query('limit') limit: string = '100'
  ) {
    console.log(`[DevicesController] Get device data: ${mac}`, {
      startTime,
      endTime,
      limit,
    });

    // TODO: 从数据库查询设备历史数据

    return {
      status: 'ok',
      data: {
        mac,
        records: [],
        total: 0,
      },
    };
  }

  /**
   * 获取设备最新数据
   *
   * GET /api/devices/:mac/data/latest
   */
  @Get('/:mac/data/latest')
  async getLatestData(@Params('mac') mac: string) {
    console.log(`[DevicesController] Get latest data: ${mac}`);

    // TODO: 从缓存或数据库查询最新数据

    return {
      status: 'ok',
      data: {
        mac,
        dataPoints: [],
        timestamp: new Date(),
      },
    };
  }

  /**
   * 手动查询设备
   *
   * POST /api/devices/:mac/query
   */
  @Post('/:mac/query')
  async queryDevice(@Params('mac') mac: string) {
    console.log(`[DevicesController] Manual query: ${mac}`);

    // TODO: 触发手动查询
    // 1. 检查设备是否在线
    // 2. 发送查询指令到 Socket.IO 服务
    // 3. 等待查询结果或超时

    return {
      status: 'ok',
      message: 'Query initiated',
      data: {
        mac,
        queryId: `query-${Date.now()}`,
      },
    };
  }
}
