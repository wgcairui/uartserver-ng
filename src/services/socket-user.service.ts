/**
 * 用户推送服务
 * 管理向浏览器用户推送设备更新、告警等实时消息
 */

import type { Server as SocketIOServer } from 'socket.io';
import { webSocketService } from './websocket.service';
import { logger } from '../utils/logger';
import type { DeviceUpdate } from '../types/websocket-events';
import { mongodb } from '../database/mongodb';

/**
 * 设备变更推送数据
 */
export interface MacUpdateData {
  mac: string;
  type: 'online' | 'offline' | 'config' | 'status';
  timestamp?: number;
  data?: any;
}

/**
 * 设备数据更新推送
 */
export interface MacDataUpdateData {
  mac: string;
  pid: number;
  data: any;
  timestamp: number;
}

/**
 * 告警推送数据
 */
export interface AlarmData {
  mac: string;
  pid?: number;
  type: 'timeout' | 'offline' | 'argument' | 'custom';
  level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  data?: any;
  timestamp: number;
}

/**
 * 用户推送服务类
 */
class SocketUserService {
  private io?: SocketIOServer;

  /**
   * 初始化服务
   */
  initialize(io: SocketIOServer): void {
    this.io = io;
    logger.info('SocketUserService initialized');
  }

  /**
   * 发送设备变更通知
   * @param mac - 设备 MAC 地址
   * @param data - 变更数据
   */
  async sendMacUpdate(mac: string, data?: Partial<MacUpdateData>): Promise<void> {
    try {
      const updateData: MacUpdateData = {
        mac,
        type: data?.type || 'status',
        timestamp: data?.timestamp || Date.now(),
        data: data?.data,
      };

      // 1. 推送给订阅了该设备的所有用户（所有 pid）
      // 查找该设备的所有挂载设备
      const terminal = await mongodb.getCollection('terminals').findOne({ DevMac: mac });

      if (terminal?.mountDevs) {
        for (const mountDev of terminal.mountDevs) {
          const room = `device_${mac}_${mountDev.pid}`;
          const deviceUpdate: DeviceUpdate = {
            type: 'status',
            mac,
            pid: mountDev.pid,
            timestamp: updateData.timestamp,
            data: updateData,
          };
          webSocketService.pushToRoom(room, deviceUpdate);
        }
      }

      // 2. 推送给订阅了全局设备变更的管理员（可选）
      // const adminRoom = 'MacUpdate';
      // webSocketService.pushToRoom(adminRoom, deviceUpdate);

      logger.debug(`Device update sent: ${mac}, type: ${updateData.type}`);
    } catch (error) {
      logger.error(`Failed to send device update for ${mac}:`, error);
    }
  }

  /**
   * 发送设备查询间隔变更通知
   * @param mac - 设备 MAC 地址
   * @param pid - 设备 PID
   * @param interval - 新的查询间隔 (ms)
   */
  async sendMacIntervalUpdate(mac: string, pid: number, interval: number): Promise<void> {
    try {
      const room = `device_${mac}_${pid}`;
      const update: DeviceUpdate = {
        type: 'config',
        mac,
        pid,
        timestamp: Date.now(),
        data: {
          interval,
          type: 'intervalUpdate',
        },
      };

      webSocketService.pushToRoom(room, update);
      logger.debug(`Interval update sent: ${mac}/${pid}, interval: ${interval}ms`);
    } catch (error) {
      logger.error(`Failed to send interval update for ${mac}/${pid}:`, error);
    }
  }

  /**
   * 发送设备数据更新
   * @param mac - 设备 MAC 地址
   * @param pid - 设备 PID
   * @param data - 数据内容
   */
  async sendMacDataUpdate(mac: string, pid: number, data: any): Promise<void> {
    try {
      const room = `device_${mac}_${pid}`;
      const update: DeviceUpdate = {
        type: 'data',
        mac,
        pid,
        timestamp: Date.now(),
        data,
      };

      webSocketService.pushToRoom(room, update);
      logger.debug(`Data update sent: ${mac}/${pid}`);
    } catch (error) {
      logger.error(`Failed to send data update for ${mac}/${pid}:`, error);
    }
  }

  /**
   * 发送告警通知
   * @param mac - 设备 MAC 地址
   * @param pid - 设备 PID（可选，0 表示终端级别）
   * @param alarmData - 告警数据
   */
  async sendMacAlarm(mac: string, pid: number, alarmData: Partial<AlarmData>): Promise<void> {
    try {
      // 1. 查找绑定了该设备的用户
      const users = await this.getBindMacUsers(mac);

      if (users.length === 0) {
        logger.debug(`No users bound to device ${mac}, skipping alarm`);
        return;
      }

      // 2. 构建告警推送数据
      const alarm: AlarmData = {
        mac,
        pid,
        type: alarmData.type || 'custom',
        level: alarmData.level || 'warning',
        message: alarmData.message || '设备告警',
        data: alarmData.data,
        timestamp: alarmData.timestamp || Date.now(),
      };

      // 3. 推送给所有绑定用户
      const update: DeviceUpdate = {
        type: 'alarm',
        mac,
        pid,
        timestamp: alarm.timestamp,
        data: alarm,
      };

      // 推送到设备房间（订阅了该设备的所有用户都能收到）
      const room = `device_${mac}_${pid}`;
      webSocketService.pushToRoom(room, update);

      logger.info(`Alarm sent to ${users.length} users: ${mac}/${pid}, type: ${alarm.type}, level: ${alarm.level}`);
    } catch (error) {
      logger.error(`Failed to send alarm for ${mac}/${pid}:`, error);
    }
  }

  /**
   * 通用用户消息推送
   * @param userIds - 用户 ID（单个或数组）
   * @param eventName - 事件名称
   * @param data - 数据内容
   */
  async toUserInfo(
    userIds: string | string[],
    eventName: string,
    data: any = {}
  ): Promise<void> {
    try {
      const users = Array.isArray(userIds) ? userIds : [userIds];

      // 通过 WebSocket 向用户发送自定义事件
      // 注意：这里假设用户已经通过 auth 注册，socket.data.userId 已设置
      for (const userId of users) {
        // 获取该用户的所有连接
        const userNamespace = this.io?.of('/user');
        if (!userNamespace) {
          logger.warn('User namespace not initialized');
          return;
        }

        const sockets = await userNamespace.fetchSockets();
        for (const socket of sockets) {
          if (socket.data.userId === userId) {
            socket.emit(eventName as any, data);
          }
        }
      }

      logger.debug(`Message sent to ${users.length} users, event: ${eventName}`);
    } catch (error) {
      logger.error(`Failed to send message to users:`, error);
    }
  }

  /**
   * 给 root 用户推送消息
   * @param message - 消息内容
   * @param type - 消息类型
   * @param userId - 用户 ID（默认 'root'）
   */
  async sendRootSocketMessage(
    message: string,
    type: string = 'message',
    userId: string = 'root'
  ): Promise<void> {
    try {
      await this.toUserInfo(userId, 'message', {
        type,
        message,
        timestamp: Date.now(),
      });
      logger.debug(`Root message sent: ${message}`);
    } catch (error) {
      logger.error('Failed to send root message:', error);
    }
  }

  /**
   * 为订阅的用户推送设备日志
   * @param mac - 设备 MAC 地址
   * @param logData - 日志数据
   */
  async sendMacListenMessage(
    mac: string,
    logData: { type: string; data: any }
  ): Promise<void> {
    try {
      // 推送给所有订阅了该设备的用户
      // 假设用户通过订阅 device_{mac}_listen 来接收日志
      const room = `device_${mac}_listen`;

      const update: DeviceUpdate = {
        type: 'log',
        mac,
        pid: 0,
        timestamp: Date.now(),
        data: logData,
      };

      webSocketService.pushToRoom(room, update);
      logger.debug(`Device log sent: ${mac}, type: ${logData.type}`);
    } catch (error) {
      logger.error(`Failed to send device log for ${mac}:`, error);
    }
  }

  /**
   * 获取绑定了指定设备的用户列表
   * @param mac - 设备 MAC 地址
   * @returns 用户 ID 数组
   */
  private async getBindMacUsers(mac: string): Promise<string[]> {
    try {
      const bindings = await mongodb
        .getCollection('user.terminalBindings')
        .find({ mac })
        .toArray();

      return bindings.map((b) => b.userId).filter(Boolean);
    } catch (error) {
      logger.error(`Failed to get bind users for ${mac}:`, error);
      return [];
    }
  }

  /**
   * 清理服务
   */
  cleanup(): void {
    this.io = undefined;
    logger.info('SocketUserService cleaned up');
  }
}

// 导出单例
export const socketUserService = new SocketUserService();
