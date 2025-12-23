/**
 * 用户管理控制器
 *
 * 处理用户管理相关的 API，包括用户查询、更新、删除等操作
 */

import { ObjectId } from 'mongodb';
import { Controller, Get, Put, Delete, Post } from '../decorators/controller';
import { Body, Params, Query } from '../decorators/params';
import { Validate } from '../decorators/validate';
import { mongodb } from '../database/mongodb';
import { Phase3Collections } from '../entities/mongodb';
import {
  UserDocument,
  UserRole,
  DEFAULT_PERMISSIONS,
  hasPermission,
} from '../entities/mongodb/user.entity';
import { hashPassword } from '../utils/bcrypt';
import {
  UpdateUserRequestSchema,
  UserQuerySchema,
  ResetPasswordRequestSchema,
  type UpdateUserRequest,
  type UserQuery,
  type ResetPasswordRequest,
} from '../schemas/auth.schema';
import { FastifyRequest, FastifyReply } from 'fastify';
import { requireAdmin, requirePermissions } from '../middleware/auth';
import { PERMISSIONS } from '../entities/mongodb/user.entity';

/**
 * 用户管理控制器 (需要管理员权限)
 */
@Controller('/api/users')
export class UserController {
  private collections: Phase3Collections;

  constructor() {
    this.collections = new Phase3Collections(mongodb.getDatabase());
  }

  /**
   * 获取用户列表
   *
   * @param request - Fastify 请求对象
   * @param reply - Fastify 响应对象
   */
  @Get('/')
  async getUsers(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as UserQuery;
    const {
      page = 1,
      limit = 20,
      role,
      department,
      isActive,
      search,
    } = query;

    try {
      // 构建查询条件
      const filter: any = {};

      if (role) {
        filter.role = role;
      }

      if (department) {
        filter.department = department;
      }

      if (typeof isActive === 'boolean') {
        filter.isActive = isActive;
      }

      if (search) {
        filter.$or = [
          { username: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { displayName: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
        ];
      }

      // 分页查询
      const skip = (page - 1) * limit;

      const [users, total] = await Promise.all([
        this.collections.users
          .find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray(),
        this.collections.users.countDocuments(filter),
      ]);

      // 清理敏感信息
      const sanitizedUsers = users.map(user => {
        const { passwordHash, session, ...sanitized } = user;
        return {
          ...sanitized,
          id: sanitized._id.toHexString(),
        };
      });

      // 构建分页信息
      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      return reply.send({
        status: 'ok',
        data: {
          users: sanitizedUsers,
          pagination: {
            currentPage: page,
            totalPages,
            total,
            limit,
            hasNextPage,
            hasPrevPage,
          },
        },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    } catch (error) {
      console.error('Get users error:', error);
      return reply.status(500).send({
        status: 'error',
        message: '获取用户列表失败',
        code: 'GET_USERS_FAILED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  }

  /**
   * 获取用户详情
   *
   * @param request - Fastify 请求对象
   * @param reply - Fastify 响应对象
   */
  @Get('/:id')
  async getUserById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };

    try {
      // 验证 ObjectId
      if (!ObjectId.isValid(id)) {
        return reply.status(400).send({
          status: 'error',
          message: '无效的用户 ID',
          code: 'INVALID_USER_ID',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      const user = await this.collections.users.findOne({ _id: new ObjectId(id) });

      if (!user) {
        return reply.status(404).send({
          status: 'error',
          message: '用户不存在',
          code: 'USER_NOT_FOUND',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 清理敏感信息
      const { passwordHash, session, ...sanitized } = user;

      return reply.send({
        status: 'ok',
        data: {
          ...sanitized,
          id: sanitized._id.toHexString(),
        },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    } catch (error) {
      console.error('Get user error:', error);
      return reply.status(500).send({
        status: 'error',
        message: '获取用户信息失败',
        code: 'GET_USER_FAILED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  }

  /**
   * 更新用户信息
   *
   * @param request - Fastify 请求对象
   * @param reply - Fastify 响应对象
   */
  @Put('/:id')
  @Validate(UpdateUserRequestSchema)
  async updateUser(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { data } = request.body as UpdateUserRequest;
    const currentUser = request.user;

    try {
      // 验证 ObjectId
      if (!ObjectId.isValid(id)) {
        return reply.status(400).send({
          status: 'error',
          message: '无效的用户 ID',
          code: 'INVALID_USER_ID',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 获取目标用户
      const user = await this.collections.users.findOne({ _id: new ObjectId(id) });

      if (!user) {
        return reply.status(404).send({
          status: 'error',
          message: '用户不存在',
          code: 'USER_NOT_FOUND',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 权限检查：只有管理员可以修改其他用户，普通用户只能修改自己
      if (currentUser?.role !== 'admin' && currentUser?._id.toHexString() !== id) {
        return reply.status(403).send({
          status: 'error',
          message: '没有权限修改此用户',
          code: 'INSUFFICIENT_PERMISSIONS',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 构建更新数据
      const updateData: any = {
        updatedAt: new Date(),
      };

      if (data.email !== undefined) {
        // 检查邮箱是否已被其他用户使用
        const existingUser = await this.collections.users.findOne({
          _id: { $ne: new ObjectId(id) },
          email: data.email,
        });

        if (existingUser) {
          return reply.status(409).send({
            status: 'error',
            message: '邮箱已被其他用户使用',
            code: 'EMAIL_ALREADY_IN_USE',
            timestamp: new Date().toISOString(),
            requestId: request.id,
          });
        }

        updateData.email = data.email;
      }

      if (data.displayName !== undefined) {
        updateData.displayName = data.displayName;
      }

      if (data.phone !== undefined) {
        updateData.phone = data.phone;
      }

      if (data.department !== undefined) {
        updateData.department = data.department;
      }

      // 只有管理员可以修改角色和权限
      if (currentUser?.role === 'admin') {
        if (data.role !== undefined) {
          updateData.role = data.role;
          // 更新默认权限
          updateData.permissions = DEFAULT_PERMISSIONS[data.role];
        }

        if (data.permissions !== undefined) {
          updateData.permissions = data.permissions;
        }

        if (data.devices !== undefined) {
          updateData.devices = data.devices;
        }

        if (data.isActive !== undefined) {
          updateData.isActive = data.isActive;
        }
      }

      // 执行更新
      await this.collections.users.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );

      // 获取更新后的用户信息
      const updatedUser = await this.collections.users.findOne({ _id: new ObjectId(id) });

      // 清理敏感信息
      const { passwordHash, session, ...sanitized } = updatedUser!;

      return reply.send({
        status: 'ok',
        data: {
          ...sanitized,
          id: sanitized._id.toHexString(),
        },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    } catch (error) {
      console.error('Update user error:', error);
      return reply.status(500).send({
        status: 'error',
        message: '更新用户失败',
        code: 'UPDATE_USER_FAILED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  }

  /**
   * 删除用户 (仅管理员)
   *
   * @param request - Fastify 请求对象
   * @param reply - Fastify 响应对象
   */
  @Delete('/:id')
  async deleteUser(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const currentUser = request.user;

    try {
      // 验证 ObjectId
      if (!ObjectId.isValid(id)) {
        return reply.status(400).send({
          status: 'error',
          message: '无效的用户 ID',
          code: 'INVALID_USER_ID',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 权限检查：只有管理员可以删除用户
      if (currentUser?.role !== 'admin') {
        return reply.status(403).send({
          status: 'error',
          message: '只有管理员可以删除用户',
          code: 'INSUFFICIENT_PERMISSIONS',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 不能删除自己
      if (currentUser?._id.toHexString() === id) {
        return reply.status(400).send({
          status: 'error',
          message: '不能删除自己的账户',
          code: 'CANNOT_DELETE_SELF',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 检查用户是否存在
      const user = await this.collections.users.findOne({ _id: new ObjectId(id) });

      if (!user) {
        return reply.status(404).send({
          status: 'error',
          message: '用户不存在',
          code: 'USER_NOT_FOUND',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 执行软删除：设置为非激活状态
      await this.collections.users.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            isActive: false,
            isOnline: false,
            'session.refreshToken': undefined,
            updatedAt: new Date(),
          },
        }
      );

      return reply.send({
        status: 'ok',
        message: '用户已删除',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    } catch (error) {
      console.error('Delete user error:', error);
      return reply.status(500).send({
        status: 'error',
        message: '删除用户失败',
        code: 'DELETE_USER_FAILED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  }

  /**
   * 激活/禁用用户 (仅管理员)
   *
   * @param request - Fastify 请求对象
   * @param reply - Fastify 响应对象
   */
  @Post('/:id/activate')
  async activateUser(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { isActive } = request.body as { isActive: boolean };
    const currentUser = request.user;

    try {
      // 验证 ObjectId
      if (!ObjectId.isValid(id)) {
        return reply.status(400).send({
          status: 'error',
          message: '无效的用户 ID',
          code: 'INVALID_USER_ID',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 权限检查：只有管理员可以激活/禁用用户
      if (currentUser?.role !== 'admin') {
        return reply.status(403).send({
          status: 'error',
          message: '只有管理员可以激活/禁用用户',
          code: 'INSUFFICIENT_PERMISSIONS',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 检查用户是否存在
      const user = await this.collections.users.findOne({ _id: new ObjectId(id) });

      if (!user) {
        return reply.status(404).send({
          status: 'error',
          message: '用户不存在',
          code: 'USER_NOT_FOUND',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 不能禁用自己
      if (currentUser?._id.toHexString() === id && !isActive) {
        return reply.status(400).send({
          status: 'error',
          message: '不能禁用自己的账户',
          code: 'CANNOT_DISABLE_SELF',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 更新用户状态
      await this.collections.users.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            isActive,
            isOnline: isActive ? user.isOnline : false,
            'session.refreshToken': undefined, // 清除刷新令牌
            updatedAt: new Date(),
          },
        }
      );

      return reply.send({
        status: 'ok',
        message: isActive ? '用户已激活' : '用户已禁用',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    } catch (error) {
      console.error('Activate user error:', error);
      return reply.status(500).send({
        status: 'error',
        message: '操作失败',
        code: 'ACTIVATE_USER_FAILED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  }

  /**
   * 重置用户密码 (仅管理员)
   *
   * @param request - Fastify 请求对象
   * @param reply - Fastify 响应对象
   */
  @Post('/:id/reset-password')
  @Validate(ResetPasswordRequestSchema)
  async resetPassword(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { data } = request.body as ResetPasswordRequest;
    const currentUser = request.user;

    try {
      // 权限检查：只有管理员可以重置密码
      if (currentUser?.role !== 'admin') {
        return reply.status(403).send({
          status: 'error',
          message: '只有管理员可以重置用户密码',
          code: 'INSUFFICIENT_PERMISSIONS',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 验证 ObjectId
      if (!ObjectId.isValid(id)) {
        return reply.status(400).send({
          status: 'error',
          message: '无效的用户 ID',
          code: 'INVALID_USER_ID',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 检查用户是否存在
      const user = await this.collections.users.findOne({ _id: new ObjectId(id) });

      if (!user) {
        return reply.status(404).send({
          status: 'error',
          message: '用户不存在',
          code: 'USER_NOT_FOUND',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 加密新密码
      const newPasswordHash = await hashPassword(data.newPassword);

      // 更新密码并清除所有令牌
      await this.collections.users.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            passwordHash: newPasswordHash,
            'session.passwordChangedAt': new Date(),
            'session.refreshToken': undefined,
            isOnline: false,
            updatedAt: new Date(),
          },
        }
      );

      // 记录密码重置日志
      console.info('[AUTH PASSWORD_RESET]', {
        targetUserId: id,
        targetUsername: user.username,
        adminUserId: currentUser?._id.toHexString(),
        adminUsername: currentUser?.username,
        timestamp: new Date().toISOString(),
      });

      return reply.send({
        status: 'ok',
        message: '密码重置成功',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    } catch (error) {
      console.error('Reset password error:', error);
      return reply.status(500).send({
        status: 'error',
        message: '重置密码失败',
        code: 'RESET_PASSWORD_FAILED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  }

  /**
   * 获取用户统计信息 (仅管理员)
   *
   * @param request - Fastify 请求对象
   * @param reply - Fastify 响应对象
   */
  @Get('/stats')
  async getUserStats(request: FastifyRequest, reply: FastifyReply) {
    try {
      // 权限检查：只有管理员可以查看统计信息
      if (request.user?.role !== 'admin') {
        return reply.status(403).send({
          status: 'error',
          message: '只有管理员可以查看统计信息',
          code: 'INSUFFICIENT_PERMISSIONS',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // 聚合查询统计信息
      const [totalStats, roleStats, departmentStats] = await Promise.all([
        // 总体统计
        this.collections.users.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              active: { $sum: { $cond: ['$isActive', 1, 0] } },
              online: { $sum: { $cond: ['$isOnline', 1, 0] } },
            },
          },
        ]).toArray(),

        // 按角色统计
        this.collections.users.aggregate([
          {
            $group: {
              _id: '$role',
              count: { $sum: 1 },
            },
          },
        ]).toArray(),

        // 按部门统计
        this.collections.users.aggregate([
          {
            $match: { department: { $exists: true, $ne: null, $ne: '' } },
          },
          {
            $group: {
              _id: '$department',
              count: { $sum: 1 },
            },
          },
          {
            $sort: { count: -1 },
          },
        ]).toArray(),
      ]);

      const total = totalStats[0] || { total: 0, active: 0, online: 0 };

      // 转换角色统计为对象
      const byRole = roleStats.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {} as Record<string, number>);

      // 转换部门统计为对象
      const byDepartment = departmentStats.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {} as Record<string, number>);

      return reply.send({
        status: 'ok',
        data: {
          total: total.total,
          active: total.active,
          online: total.online,
          byRole,
          byDepartment,
        },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    } catch (error) {
      console.error('Get user stats error:', error);
      return reply.status(500).send({
        status: 'error',
        message: '获取统计信息失败',
        code: 'GET_STATS_FAILED',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  }
}