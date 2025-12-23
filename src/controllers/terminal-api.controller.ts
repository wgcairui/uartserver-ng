/**
 * Terminal API Controller (Phase 4.2)
 *
 * RESTful API 控制器for终端管理
 * 提供终端查询、更新、绑定、挂载设备管理等功能
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { Controller, Get, Post, Put, Delete } from '../decorators/controller';
import { Validate } from '../decorators/validate';
import { mongodb } from '../database/mongodb';
import { TerminalApiService } from '../services/terminal-api.service';
import type {
  MacParams,
  UpdateTerminalRequest,
  AddMountDeviceRequest,
  MacPidParams,
  TerminalQuery,
} from '../schemas/terminal.schema';
import {
  UpdateTerminalRequestSchema,
  AddMountDeviceRequestSchema,
  TerminalQuerySchema,
} from '../schemas/terminal.schema';
import { isAdmin } from '../middleware/auth';

/**
 * Terminal API 控制器 (Phase 4.2)
 *
 * 所有端点都需要认证，部分端点需要设备访问权限或管理员权限
 */
@Controller('/api/terminals')
export class TerminalApiController {
  private terminalService: TerminalApiService;

  constructor() {
    this.terminalService = new TerminalApiService(mongodb.getDatabase());
  }

  /**
   * GET /api/terminals - 获取用户绑定的终端列表
   *
   * 支持分页、过滤、关键词搜索
   * 权限：需要认证，返回用户绑定的设备或管理员返回所有设备
   */
  @Get('/')
  @Validate(TerminalQuerySchema, 'query')
  async getTerminals(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({
          status: 'error',
          message: '请先登录',
          code: 'UNAUTHORIZED',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      const query = request.query as TerminalQuery;

      // 确定设备范围：管理员可以查看所有设备，普通用户只能查看绑定的设备
      const deviceMacs = isAdmin(request)
        ? undefined // 管理员不限制 MAC 地址
        : user.devices || [];

      // 如果普通用户没有绑定任何设备，返回空列表
      if (!isAdmin(request) && (!deviceMacs || deviceMacs.length === 0)) {
        return reply.send({
          status: 'ok',
          data: {
            terminals: [],
            pagination: {
              total: 0,
              page: query.page || 1,
              limit: query.limit || 50,
              totalPages: 0,
            },
          },
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 查询终端列表
      const { terminals, total } = await this.terminalService.getTerminals(
        deviceMacs || [],
        {
          online: query.online,
          share: query.share,
          keyword: query.keyword,
          page: query.page,
          limit: query.limit,
        }
      );

      // 计算分页信息
      const page = query.page || 1;
      const limit = query.limit || 50;
      const totalPages = Math.ceil(total / limit);

      return reply.send({
        status: 'ok',
        data: {
          terminals,
          pagination: {
            total,
            page,
            limit,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
          },
        },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    } catch (error) {
      console.error('[TerminalApiController] Get terminals error:', error);
      return reply.status(500).send({
        status: 'error',
        message: '获取终端列表失败',
        code: 'GET_TERMINALS_FAILED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  }

  /**
   * GET /api/terminals/:mac - 获取单个终端详情
   *
   * 权限：需要认证 + 设备访问权限
   */
  @Get('/:mac')
  async getTerminal(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({
          status: 'error',
          message: '请先登录',
          code: 'UNAUTHORIZED',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      const { mac } = request.params as MacParams;

      // 权限检查：管理员或设备绑定用户
      const hasAccess = isAdmin(request) || user.devices?.includes(mac);
      if (!hasAccess) {
        return reply.status(403).send({
          status: 'error',
          message: '没有访问此终端的权限',
          code: 'DEVICE_ACCESS_DENIED',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 查询终端
      const terminal = await this.terminalService.getTerminal(mac);

      if (!terminal) {
        return reply.status(404).send({
          status: 'error',
          message: '终端不存在',
          code: 'TERMINAL_NOT_FOUND',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      return reply.send({
        status: 'ok',
        data: terminal,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    } catch (error) {
      console.error('[TerminalApiController] Get terminal error:', error);
      return reply.status(500).send({
        status: 'error',
        message: '获取终端详情失败',
        code: 'GET_TERMINAL_FAILED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  }

  /**
   * PUT /api/terminals/:mac - 修改终端信息
   *
   * 可修改：名称、GPS 坐标、备注、共享状态
   * 权限：需要认证 + 设备访问权限
   */
  @Put('/:mac')
  @Validate(UpdateTerminalRequestSchema)
  async updateTerminal(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({
          status: 'error',
          message: '请先登录',
          code: 'UNAUTHORIZED',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      const { mac } = request.params as MacParams;
      const { data } = request.body as UpdateTerminalRequest;

      // 权限检查：管理员或设备绑定用户
      const hasAccess = isAdmin(request) || user.devices?.includes(mac);
      if (!hasAccess) {
        return reply.status(403).send({
          status: 'error',
          message: '没有访问此终端的权限',
          code: 'DEVICE_ACCESS_DENIED',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 检查终端是否存在
      const exists = await this.terminalService.exists(mac);
      if (!exists) {
        return reply.status(404).send({
          status: 'error',
          message: '终端不存在',
          code: 'TERMINAL_NOT_FOUND',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 更新终端信息
      const success = await this.terminalService.updateTerminal(mac, data);

      if (!success) {
        return reply.status(500).send({
          status: 'error',
          message: '更新终端失败',
          code: 'UPDATE_TERMINAL_FAILED',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 获取更新后的终端信息
      const terminal = await this.terminalService.getTerminal(mac);

      return reply.send({
        status: 'ok',
        data: terminal,
        message: '终端信息已更新',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    } catch (error) {
      console.error('[TerminalApiController] Update terminal error:', error);
      return reply.status(500).send({
        status: 'error',
        message: '更新终端失败',
        code: 'UPDATE_TERMINAL_FAILED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  }

  /**
   * POST /api/terminals/:mac/bind - 绑定终端到当前用户
   *
   * 权限：需要认证，终端必须未被绑定或当前用户为管理员
   */
  @Post('/:mac/bind')
  async bindTerminal(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({
          status: 'error',
          message: '请先登录',
          code: 'UNAUTHORIZED',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      const { mac } = request.params as MacParams;

      // 检查终端是否存在
      const exists = await this.terminalService.exists(mac);
      if (!exists) {
        return reply.status(404).send({
          status: 'error',
          message: '终端不存在',
          code: 'TERMINAL_NOT_FOUND',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 检查终端是否已被绑定
      const isBound = await this.terminalService.isBound(mac);

      // 如果已被绑定，只有管理员可以继续绑定
      if (isBound && !isAdmin(request)) {
        return reply.status(403).send({
          status: 'error',
          message: '终端已被其他用户绑定',
          code: 'TERMINAL_ALREADY_BOUND',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 检查用户是否已绑定此设备
      if (user.devices?.includes(mac)) {
        return reply.status(400).send({
          status: 'error',
          message: '您已绑定此终端',
          code: 'ALREADY_BOUND',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 执行绑定
      const userId = user._id.toHexString();
      const success = await this.terminalService.bindTerminal(userId, mac);

      if (!success) {
        return reply.status(500).send({
          status: 'error',
          message: '绑定终端失败',
          code: 'BIND_TERMINAL_FAILED',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 如果是第一次绑定，设置为所有者
      if (!isBound) {
        await this.terminalService.setTerminalOwner(mac, userId);
      }

      return reply.send({
        status: 'ok',
        message: '终端绑定成功',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    } catch (error) {
      console.error('[TerminalApiController] Bind terminal error:', error);
      return reply.status(500).send({
        status: 'error',
        message: '绑定终端失败',
        code: 'BIND_TERMINAL_FAILED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  }

  /**
   * DELETE /api/terminals/:mac/bind - 解绑终端
   *
   * 权限：需要认证 + 设备访问权限
   */
  @Delete('/:mac/bind')
  async unbindTerminal(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({
          status: 'error',
          message: '请先登录',
          code: 'UNAUTHORIZED',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      const { mac } = request.params as MacParams;

      // 检查用户是否绑定了此设备
      const hasAccess = isAdmin(request) || user.devices?.includes(mac);
      if (!hasAccess) {
        return reply.status(403).send({
          status: 'error',
          message: '您没有绑定此终端',
          code: 'NOT_BOUND',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 执行解绑
      const userId = user._id.toHexString();
      const success = await this.terminalService.unbindTerminal(userId, mac);

      if (!success) {
        return reply.status(500).send({
          status: 'error',
          message: '解绑终端失败',
          code: 'UNBIND_TERMINAL_FAILED',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      return reply.send({
        status: 'ok',
        message: '终端解绑成功',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    } catch (error) {
      console.error('[TerminalApiController] Unbind terminal error:', error);
      return reply.status(500).send({
        status: 'error',
        message: '解绑终端失败',
        code: 'UNBIND_TERMINAL_FAILED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  }

  /**
   * POST /api/terminals/:mac/devices - 添加挂载设备
   *
   * 权限：需要认证 + 设备访问权限
   */
  @Post('/:mac/devices')
  @Validate(AddMountDeviceRequestSchema)
  async addMountDevice(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({
          status: 'error',
          message: '请先登录',
          code: 'UNAUTHORIZED',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      const { mac } = request.params as MacParams;
      const { data } = request.body as AddMountDeviceRequest;

      // 权限检查：管理员或设备绑定用户
      const hasAccess = isAdmin(request) || user.devices?.includes(mac);
      if (!hasAccess) {
        return reply.status(403).send({
          status: 'error',
          message: '没有访问此终端的权限',
          code: 'DEVICE_ACCESS_DENIED',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 添加挂载设备
      const success = await this.terminalService.addMountDevice(mac, {
        pid: data.pid,
        protocol: data.protocol,
        mountDev: data.mountDev,
        Type: data.Type,
        name: data.name,
        formResize: data.formResize,
        isState: data.isState,
        online: false, // 初始状态为离线
      });

      if (!success) {
        return reply.status(500).send({
          status: 'error',
          message: '添加挂载设备失败',
          code: 'ADD_MOUNT_DEVICE_FAILED',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 获取新添加的设备
      const mountDevice = await this.terminalService.getMountDevice(mac, data.pid);

      return reply.send({
        status: 'ok',
        data: mountDevice,
        message: '挂载设备已添加',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    } catch (error) {
      console.error('[TerminalApiController] Add mount device error:', error);

      // 处理 PID 已存在的错误
      if (error instanceof Error && error.message.includes('already exists')) {
        return reply.status(409).send({
          status: 'error',
          message: error.message,
          code: 'PID_ALREADY_EXISTS',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      return reply.status(500).send({
        status: 'error',
        message: '添加挂载设备失败',
        code: 'ADD_MOUNT_DEVICE_FAILED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  }

  /**
   * DELETE /api/terminals/:mac/devices/:pid - 删除挂载设备
   *
   * 权限：需要认证 + 设备访问权限
   */
  @Delete('/:mac/devices/:pid')
  async removeMountDevice(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({
          status: 'error',
          message: '请先登录',
          code: 'UNAUTHORIZED',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      const { mac, pid } = request.params as MacPidParams;

      // 权限检查：管理员或设备绑定用户
      const hasAccess = isAdmin(request) || user.devices?.includes(mac);
      if (!hasAccess) {
        return reply.status(403).send({
          status: 'error',
          message: '没有访问此终端的权限',
          code: 'DEVICE_ACCESS_DENIED',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 检查挂载设备是否存在
      const mountDevice = await this.terminalService.getMountDevice(mac, pid);
      if (!mountDevice) {
        return reply.status(404).send({
          status: 'error',
          message: '挂载设备不存在',
          code: 'MOUNT_DEVICE_NOT_FOUND',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 删除挂载设备
      const success = await this.terminalService.removeMountDevice(mac, pid);

      if (!success) {
        return reply.status(500).send({
          status: 'error',
          message: '删除挂载设备失败',
          code: 'REMOVE_MOUNT_DEVICE_FAILED',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      return reply.send({
        status: 'ok',
        message: '挂载设备已删除',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    } catch (error) {
      console.error('[TerminalApiController] Remove mount device error:', error);
      return reply.status(500).send({
        status: 'error',
        message: '删除挂载设备失败',
        code: 'REMOVE_MOUNT_DEVICE_FAILED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  }

  /**
   * GET /api/terminals/:mac/status - 获取终端在线状态
   *
   * 权限：需要认证 + 设备访问权限
   */
  @Get('/:mac/status')
  async getTerminalStatus(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({
          status: 'error',
          message: '请先登录',
          code: 'UNAUTHORIZED',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      const { mac } = request.params as MacParams;

      // 权限检查：管理员或设备绑定用户
      const hasAccess = isAdmin(request) || user.devices?.includes(mac);
      if (!hasAccess) {
        return reply.status(403).send({
          status: 'error',
          message: '没有访问此终端的权限',
          code: 'DEVICE_ACCESS_DENIED',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 查询终端
      const terminal = await this.terminalService.getTerminal(mac);

      if (!terminal) {
        return reply.status(404).send({
          status: 'error',
          message: '终端不存在',
          code: 'TERMINAL_NOT_FOUND',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      return reply.send({
        status: 'ok',
        data: {
          DevMac: terminal.DevMac,
          online: terminal.online,
          lastSeen: terminal.lastSeen,
          uptime: terminal.uptime,
          signal: terminal.signal,
        },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    } catch (error) {
      console.error('[TerminalApiController] Get terminal status error:', error);
      return reply.status(500).send({
        status: 'error',
        message: '获取终端状态失败',
        code: 'GET_TERMINAL_STATUS_FAILED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  }
}
