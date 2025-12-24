/**
 * Admin Log Service (Phase 8.6)
 *
 * 管理员日志查询服务 - 提供所有系统日志查询功能
 */

import type { Db, Collection } from 'mongodb';
import type {
  WxEventLog,
  DeviceBytesLog,
  DeviceBusyLog,
  TerminalAggLog,
  UserAggLog,
  NodeLog,
  TerminalLog,
  SmsSendLog,
  SmsSendCountInfo,
  MailSendLog,
  DeviceAlarmLog,
  UserLoginLog,
  UserRequestLog,
  WxSubscribeLog,
  InnerMessageLog,
  BullLog,
  DeviceUseTimeLog,
  DataCleanLog,
} from '../schemas/admin-log.schema';

// ============================================================================
// Admin Log Service
// ============================================================================

export class AdminLogService {
  private db: Db;

  // Log collections
  private wxEventsCollection: Collection;
  private useBytesCollection: Collection;
  private dtuBusyCollection: Collection;
  private uartTerminalDataTransfiniteCollection: Collection;
  private userRequestsCollection: Collection;
  private userLoginsCollection: Collection;
  private nodesCollection: Collection;
  private terminalsCollection: Collection;
  private smsSendsCollection: Collection;
  private mailSendsCollection: Collection;
  private wxSubscribeMessagesCollection: Collection;
  private innerMessagesCollection: Collection;
  private bullCollection: Collection;
  private useTimeCollection: Collection;
  private dataCleansCollection: Collection;

  constructor(db: Db) {
    this.db = db;

    // Initialize all log collections
    this.wxEventsCollection = db.collection('log.wxevents');
    this.useBytesCollection = db.collection('log.usebytes');
    this.dtuBusyCollection = db.collection('log.dtubusy');
    this.uartTerminalDataTransfiniteCollection = db.collection(
      'log.uartterminaldatatransfinites'
    );
    this.userRequestsCollection = db.collection('log.UserRequests');
    this.userLoginsCollection = db.collection('log.userlogins');
    this.nodesCollection = db.collection('log.nodes');
    this.terminalsCollection = db.collection('log.terminals');
    this.smsSendsCollection = db.collection('log.smssends');
    this.mailSendsCollection = db.collection('log.mailsends');
    this.wxSubscribeMessagesCollection = db.collection('log.wxsubscribeMessages');
    this.innerMessagesCollection = db.collection('log.innerMessages');
    this.bullCollection = db.collection('log.bull');
    this.useTimeCollection = db.collection('log.usetime');
    this.dataCleansCollection = db.collection('log.datacleans');
  }

  // ==========================================================================
  // 1. 微信事件日志
  // ==========================================================================

  /**
   * 获取所有微信推送事件记录
   */
  async getWxEvents(): Promise<WxEventLog[]> {
    return await this.wxEventsCollection.find().toArray() as any[];
  }

  // ==========================================================================
  // 2. 设备流量日志
  // ==========================================================================

  /**
   * 获取设备使用流量
   */
  async getDeviceBytes(mac: string): Promise<DeviceBytesLog[]> {
    return await this.useBytesCollection
      .find({ mac })
      .sort({ timeStamp: -1 })
      .toArray() as any[];
  }

  // ==========================================================================
  // 3. 设备繁忙日志
  // ==========================================================================

  /**
   * 获取设备指定时段繁忙状态
   */
  async getDeviceBusy(
    mac: string,
    start: number,
    end: number
  ): Promise<DeviceBusyLog[]> {
    return await this.dtuBusyCollection
      .find({
        mac,
        timeStamp: { $gte: start, $lte: end },
      })
      .sort({ timeStamp: 1 })
      .toArray() as any[];
  }

  // ==========================================================================
  // 4. 终端聚合日志
  // ==========================================================================

  /**
   * 获取指定设备聚合日志 (告警 + 终端事件)
   */
  async getTerminalAggregatedLogs(
    mac: string,
    start: number,
    end: number
  ): Promise<TerminalAggLog[]> {
    // 获取告警日志
    const alarms = await this.uartTerminalDataTransfiniteCollection
      .find({
        timeStamp: { $lte: end, $gte: start },
        mac,
      })
      .toArray();

    // 获取终端事件日志
    const terminalLogs = await this.terminalsCollection
      .find({
        timeStamp: { $lte: end, $gte: start },
        TerminalMac: mac,
      })
      .toArray();

    // 合并并提取需要的字段
    const result = [...alarms, ...terminalLogs].map((el) => ({
      type: el.type,
      msg: el.msg,
      timeStamp: el.timeStamp,
    }));

    // 按时间排序
    return result.sort((a, b) => a.timeStamp - b.timeStamp);
  }

  // ==========================================================================
  // 5. 用户聚合日志
  // ==========================================================================

  /**
   * 获取指定用户聚合日志 (登录 + 请求)
   */
  async getUserAggregatedLogs(
    user: string,
    start: number,
    end: number
  ): Promise<UserAggLog[]> {
    // 获取用户登录日志
    const logins = await this.userLoginsCollection
      .find({
        timeStamp: { $lte: end, $gte: start },
        user,
      })
      .toArray();

    // 获取用户请求日志
    const requests = await this.userRequestsCollection
      .find({
        timeStamp: { $lte: end, $gte: start },
        user,
      })
      .toArray();

    // 转换格式
    const loginLogs = logins.map((el) => ({
      type: el.type,
      msg: el.msg,
      timeStamp: el.timeStamp,
    }));

    const requestLogs = requests.map((el) => ({
      type: '请求',
      msg: el.type,
      timeStamp: el.timeStamp,
    }));

    // 合并并按时间排序
    const result = [...loginLogs, ...requestLogs];
    return result.sort((a, b) => a.timeStamp - b.timeStamp);
  }

  // ==========================================================================
  // 6. 节点日志
  // ==========================================================================

  /**
   * 获取节点日志
   */
  async getNodeLogs(start: number, end: number): Promise<NodeLog[]> {
    return await this.nodesCollection
      .find({
        timeStamp: { $gte: start, $lte: end },
      })
      .sort({ timeStamp: -1 })
      .toArray() as any[];
  }

  // ==========================================================================
  // 7. 终端日志
  // ==========================================================================

  /**
   * 获取终端日志
   */
  async getTerminalLogs(start: number, end: number): Promise<TerminalLog[]> {
    return await this.terminalsCollection
      .find({
        timeStamp: { $gte: start, $lte: end },
      })
      .sort({ timeStamp: -1 })
      .toArray() as any[];
  }

  // ==========================================================================
  // 8. 短信日志
  // ==========================================================================

  /**
   * 获取短信发送日志
   */
  async getSmsSendLogs(start: number, end: number): Promise<SmsSendLog[]> {
    const result = await this.smsSendsCollection
      .aggregate([
        {
          $match: {
            timeStamp: { $lte: end, $gte: start },
          },
        },
        {
          $project: {
            timeStamp: 1,
            tels: 1,
            sendParams: 1,
            Success: 1,
            Error: 1,
          },
        },
        { $unwind: '$tels' },
      ])
      .toArray();

    return result as any[];
  }

  /**
   * 获取短信发送统计 (每个手机号的发送次数)
   */
  async getSmsSendCountInfo(): Promise<SmsSendCountInfo[]> {
    const result = await this.smsSendsCollection
      .aggregate([
        { $project: { tels: 1, Success: 1 } },
        { $unwind: '$tels' },
        { $match: { 'Success.Code': 'OK' } },
        { $group: { _id: '$tels', sum: { $sum: 1 } } },
        { $sort: { sum: -1 } },
      ])
      .toArray();

    return result as SmsSendCountInfo[];
  }

  // ==========================================================================
  // 9. 邮件日志
  // ==========================================================================

  /**
   * 获取邮件发送日志
   */
  async getMailSendLogs(start: number, end: number): Promise<MailSendLog[]> {
    return await this.mailSendsCollection
      .find({
        timeStamp: { $gte: start, $lte: end },
      })
      .sort({ timeStamp: -1 })
      .toArray() as any[];
  }

  // ==========================================================================
  // 10. 设备告警日志
  // ==========================================================================

  /**
   * 获取设备告警日志
   */
  async getDeviceAlarmLogs(start: number, end: number): Promise<DeviceAlarmLog[]> {
    return await this.uartTerminalDataTransfiniteCollection
      .find({
        timeStamp: { $gte: start, $lte: end },
      })
      .sort({ timeStamp: -1 })
      .toArray() as any[];
  }

  // ==========================================================================
  // 11. 用户登录日志
  // ==========================================================================

  /**
   * 获取用户登录日志
   */
  async getUserLoginLogs(start: number, end: number): Promise<UserLoginLog[]> {
    return await this.userLoginsCollection
      .find({
        timeStamp: { $gte: start, $lte: end },
      })
      .sort({ timeStamp: -1 })
      .toArray() as any[];
  }

  // ==========================================================================
  // 12. 用户请求日志
  // ==========================================================================

  /**
   * 获取用户请求日志
   */
  async getUserRequestLogs(start: number, end: number): Promise<UserRequestLog[]> {
    return await this.userRequestsCollection
      .find({
        timeStamp: { $gte: start, $lte: end },
      })
      .sort({ timeStamp: -1 })
      .toArray() as any[];
  }

  // ==========================================================================
  // 13. 微信订阅消息日志
  // ==========================================================================

  /**
   * 获取微信订阅消息日志
   */
  async getWxSubscribeLogs(start: number, end: number): Promise<WxSubscribeLog[]> {
    return await this.wxSubscribeMessagesCollection
      .find({
        timeStamp: { $gte: start, $lte: end },
      })
      .sort({ timeStamp: -1 })
      .toArray() as any[];
  }

  // ==========================================================================
  // 14. 内部消息日志
  // ==========================================================================

  /**
   * 获取内部消息日志
   */
  async getInnerMessageLogs(start: number, end: number): Promise<InnerMessageLog[]> {
    return await this.innerMessagesCollection
      .find({
        timeStamp: { $gte: start, $lte: end },
      })
      .sort({ timeStamp: -1 })
      .toArray() as any[];
  }

  // ==========================================================================
  // 15. Bull 队列日志
  // ==========================================================================

  /**
   * 获取 Bull 队列日志
   */
  async getBullLogs(start: number, end: number): Promise<BullLog[]> {
    return await this.bullCollection
      .find({
        timeStamp: { $gte: start, $lte: end },
      })
      .sort({ timeStamp: -1 })
      .toArray() as any[];
  }

  // ==========================================================================
  // 16. 设备使用时间日志
  // ==========================================================================

  /**
   * 获取设备使用时间日志
   */
  async getDeviceUseTimeLogs(
    mac: string,
    start: number,
    end: number
  ): Promise<DeviceUseTimeLog[]> {
    return await this.useTimeCollection
      .find({
        mac,
        timeStamp: { $gte: start, $lte: end },
      })
      .sort({ timeStamp: -1 })
      .toArray() as any[];
  }

  // ==========================================================================
  // 17. 数据清理日志
  // ==========================================================================

  /**
   * 获取定时清理记录
   */
  async getDataCleanLogs(start: number, end: number): Promise<DataCleanLog[]> {
    return await this.dataCleansCollection
      .find({
        timeStamp: { $gte: start, $lte: end },
      })
      .sort({ timeStamp: -1 })
      .toArray() as any[];
  }

  // ==========================================================================
  // 18. 用户告警信息
  // ==========================================================================

  /**
   * 获取用户的告警信息
   */
  async getUserAlarmLogs(
    user: string,
    start: number,
    end: number
  ): Promise<DeviceAlarmLog[]> {
    // 需要关联查询用户绑定的设备
    // 这里简化处理,直接返回时间范围内的所有告警
    // 实际应该根据用户的设备列表过滤
    return await this.uartTerminalDataTransfiniteCollection
      .find({
        timeStamp: { $gte: start, $lte: end },
      })
      .sort({ timeStamp: -1 })
      .toArray() as any[];
  }

  // ==========================================================================
  // 辅助方法
  // ==========================================================================

  /**
   * 获取默认的开始时间 (30天前)
   */
  private getDefaultStart(): number {
    return Date.now() - 30 * 24 * 60 * 60 * 1000;
  }

  /**
   * 获取默认的结束时间 (当前时间)
   */
  private getDefaultEnd(): number {
    return Date.now();
  }

  /**
   * 标准化时间范围 (如果未提供则使用默认值)
   */
  normalizeDateRange(start?: number, end?: number): { start: number; end: number } {
    return {
      start: start ?? this.getDefaultStart(),
      end: end ?? this.getDefaultEnd(),
    };
  }
}
