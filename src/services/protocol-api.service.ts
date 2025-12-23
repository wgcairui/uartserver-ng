/**
 * Protocol API Service (Phase 4.2 Day 3)
 *
 * 协议管理服务层 - 读取老系统数据
 * 对接老系统集合: device.protocols, device.constants, user.alarmsetups
 */

import type { Db } from 'mongodb';

/**
 * 老系统协议定义 (device.protocols 集合)
 */
export interface LegacyProtocol {
  _id?: any;
  Type: number; // 485 或 232
  Protocol: string; // 协议名称
  ProtocolType: string; // 'ups' | 'air' | 'em' | 'th' | 'io'
  instruct: LegacyInstruct[];
  remark?: string;
}

/**
 * 协议指令定义
 */
export interface LegacyInstruct {
  name: string; // 指令名称
  isUse: boolean;
  isSplit: boolean;
  splitStr: string;
  noStandard: boolean;
  scriptStart?: string;
  scriptEnd?: string;
  resultType: any;
  shift: boolean;
  shiftNum: number;
  pop: boolean;
  popNum: number;
  resize?: string;
  formResize: Array<{
    name: string;
    enName?: string;
    regx: string;
    bl: string;
    unit: string;
    isState: boolean;
  }>;
  remark?: string;
}

/**
 * 老系统协议常量 (device.constants 集合)
 */
export interface LegacyDevConstant {
  _id?: any;
  Protocol: string; // 协议名称
  ProtocolType: string;
  Constant?: any; // 常量配置 (WorkMode, Switch, Temperature, Humidity 等)
  Threshold?: Array<{
    name: string;
    min: number;
    max: number;
  }>;
  AlarmStat?: Array<{
    name: string;
    value: string;
    unit: string;
    alarmStat: string[];
  }>;
  ShowTag?: string[];
  OprateInstruct?: Array<{
    name: string;
    value: string;
    bl: string;
    readme: string;
    tag: string;
  }>;
}

/**
 * 老系统用户告警设置 (user.alarmsetups 集合)
 */
export interface LegacyUserAlarmSetup {
  _id?: any;
  user: string;
  tels: string[];
  mails: string[];
  wxs: string[];
  ProtocolSetup: Array<{
    Protocol: string;
    ShowTag?: string[];
    Threshold?: Array<{
      name: string;
      min: number;
      max: number;
    }>;
    AlarmStat?: Array<{
      name: string;
      alarmStat: string[];
    }>;
  }>;
}

/**
 * 协议 API 服务
 *
 * 提供协议查询和用户配置管理功能
 * 所有操作基于老系统集合,确保数据兼容性
 */
export class ProtocolApiService {
  private db: Db;

  // 老系统集合名称
  private readonly PROTOCOLS_COLLECTION = 'device.protocols';
  private readonly DEV_CONSTANTS_COLLECTION = 'device.constants';
  private readonly USER_ALARM_SETUPS_COLLECTION = 'user.alarmsetups';

  constructor(db: Db) {
    this.db = db;
  }

  // ============================================================================
  // 协议查询
  // ============================================================================

  /**
   * 获取协议定义
   *
   * @param protocolName 协议名称
   * @returns 协议详细信息
   */
  async getProtocol(protocolName: string): Promise<LegacyProtocol | null> {
    const collection = this.db.collection<LegacyProtocol>(this.PROTOCOLS_COLLECTION);

    return await collection.findOne({ Protocol: protocolName });
  }

  /**
   * 获取所有协议列表
   *
   * @param options 查询选项
   * @returns 协议列表
   */
  async getProtocols(options?: {
    type?: number; // 485 或 232
    protocolType?: string; // 'ups' | 'air' | 'em' | 'th' | 'io'
  }): Promise<LegacyProtocol[]> {
    const collection = this.db.collection<LegacyProtocol>(this.PROTOCOLS_COLLECTION);

    const query: any = {};
    if (options?.type) {
      query.Type = options.type;
    }
    if (options?.protocolType) {
      query.ProtocolType = options.protocolType;
    }

    return await collection.find(query).toArray();
  }

  /**
   * 检查协议是否存在
   *
   * @param protocolName 协议名称
   * @returns 是否存在
   */
  async protocolExists(protocolName: string): Promise<boolean> {
    const collection = this.db.collection<LegacyProtocol>(this.PROTOCOLS_COLLECTION);

    const count = await collection.countDocuments({ Protocol: protocolName });
    return count > 0;
  }

  // ============================================================================
  // 协议告警配置
  // ============================================================================

  /**
   * 获取协议告警配置
   *
   * 对应老系统 getAlarmProtocol 功能
   *
   * @param protocolName 协议名称
   * @returns 协议告警配置
   */
  async getProtocolAlarmConfig(protocolName: string): Promise<LegacyDevConstant | null> {
    const collection = this.db.collection<LegacyDevConstant>(this.DEV_CONSTANTS_COLLECTION);

    return await collection.findOne({ Protocol: protocolName });
  }

  /**
   * 获取协议阈值配置
   *
   * @param protocolName 协议名称
   * @returns 阈值配置列表
   */
  async getProtocolThresholds(protocolName: string): Promise<Array<{
    name: string;
    min: number;
    max: number;
  }>> {
    const config = await this.getProtocolAlarmConfig(protocolName);
    return config?.Threshold || [];
  }

  /**
   * 获取协议告警状态配置
   *
   * @param protocolName 协议名称
   * @returns 告警状态配置列表
   */
  async getProtocolAlarmStats(protocolName: string): Promise<Array<{
    name: string;
    value: string;
    unit: string;
    alarmStat: string[];
  }>> {
    const config = await this.getProtocolAlarmConfig(protocolName);
    return config?.AlarmStat || [];
  }

  // ============================================================================
  // 用户协议配置
  // ============================================================================

  /**
   * 获取用户协议告警配置
   *
   * 对应老系统 getUserAlarmProtocol 功能
   *
   * @param userId 用户 ID
   * @param protocolName 协议名称
   * @returns 用户协议配置
   */
  async getUserProtocolConfig(
    userId: string,
    protocolName: string
  ): Promise<{
    Protocol: string;
    ShowTag?: string[];
    Threshold?: Array<{ name: string; min: number; max: number }>;
    AlarmStat?: Array<{ name: string; alarmStat: string[] }>;
  } | null> {
    const collection = this.db.collection<LegacyUserAlarmSetup>(
      this.USER_ALARM_SETUPS_COLLECTION
    );

    const userSetup = await collection.findOne({ user: userId });

    if (!userSetup || !userSetup.ProtocolSetup) {
      return null;
    }

    // 查找特定协议的配置
    const protocolConfig = userSetup.ProtocolSetup.find(
      (setup) => setup.Protocol === protocolName
    );

    return protocolConfig || null;
  }

  /**
   * 获取用户所有协议配置
   *
   * @param userId 用户 ID
   * @returns 用户告警设置 (包含所有协议配置)
   */
  async getUserAlarmSetup(userId: string): Promise<LegacyUserAlarmSetup | null> {
    const collection = this.db.collection<LegacyUserAlarmSetup>(
      this.USER_ALARM_SETUPS_COLLECTION
    );

    return await collection.findOne({ user: userId });
  }

  /**
   * 更新用户协议配置
   *
   * 对应老系统 setUserSetupProtocol 功能
   *
   * @param userId 用户 ID
   * @param protocolName 协议名称
   * @param config 协议配置
   * @returns 是否成功
   */
  async updateUserProtocolConfig(
    userId: string,
    protocolName: string,
    config: {
      ShowTag?: string[];
      Threshold?: Array<{ name: string; min: number; max: number }>;
      AlarmStat?: Array<{ name: string; alarmStat: string[] }>;
    }
  ): Promise<boolean> {
    const collection = this.db.collection<LegacyUserAlarmSetup>(
      this.USER_ALARM_SETUPS_COLLECTION
    );

    // 检查用户设置是否存在
    const userSetup = await collection.findOne({ user: userId });

    if (!userSetup) {
      // 创建新的用户设置
      const newSetup: LegacyUserAlarmSetup = {
        user: userId,
        tels: [],
        mails: [],
        wxs: [],
        ProtocolSetup: [
          {
            Protocol: protocolName,
            ...config,
          },
        ],
      };

      const result = await collection.insertOne(newSetup as any);
      return result.acknowledged;
    }

    // 检查是否已有该协议配置
    const existingIndex = userSetup.ProtocolSetup.findIndex(
      (setup) => setup.Protocol === protocolName
    );

    if (existingIndex >= 0) {
      // 更新现有协议配置
      const updatePath = `ProtocolSetup.${existingIndex}`;
      const updateDoc: any = {};

      if (config.ShowTag !== undefined) {
        updateDoc[`${updatePath}.ShowTag`] = config.ShowTag;
      }
      if (config.Threshold !== undefined) {
        updateDoc[`${updatePath}.Threshold`] = config.Threshold;
      }
      if (config.AlarmStat !== undefined) {
        updateDoc[`${updatePath}.AlarmStat`] = config.AlarmStat;
      }

      const result = await collection.updateOne(
        { user: userId },
        { $set: updateDoc }
      );

      return result.modifiedCount > 0;
    } else {
      // 添加新协议配置
      const result = await collection.updateOne(
        { user: userId },
        {
          $push: {
            ProtocolSetup: {
              Protocol: protocolName,
              ...config,
            } as any,
          },
        }
      );

      return result.modifiedCount > 0;
    }
  }

  /**
   * 删除用户协议配置
   *
   * @param userId 用户 ID
   * @param protocolName 协议名称
   * @returns 是否成功
   */
  async deleteUserProtocolConfig(
    userId: string,
    protocolName: string
  ): Promise<boolean> {
    const collection = this.db.collection<LegacyUserAlarmSetup>(
      this.USER_ALARM_SETUPS_COLLECTION
    );

    const result = await collection.updateOne(
      { user: userId },
      {
        $pull: {
          ProtocolSetup: { Protocol: protocolName } as any,
        },
      }
    );

    return result.modifiedCount > 0;
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  /**
   * 获取协议显示标签
   *
   * @param protocolName 协议名称
   * @returns 显示标签列表
   */
  async getProtocolShowTags(protocolName: string): Promise<string[]> {
    const config = await this.getProtocolAlarmConfig(protocolName);
    return config?.ShowTag || [];
  }

  /**
   * 合并协议配置和用户配置
   *
   * 用户配置覆盖协议默认配置
   *
   * @param protocolName 协议名称
   * @param userId 用户 ID
   * @returns 合并后的配置
   */
  async getMergedProtocolConfig(protocolName: string, userId: string): Promise<{
    protocol: LegacyProtocol | null;
    defaultConfig: LegacyDevConstant | null;
    userConfig: any | null;
  }> {
    const [protocol, defaultConfig, userConfig] = await Promise.all([
      this.getProtocol(protocolName),
      this.getProtocolAlarmConfig(protocolName),
      this.getUserProtocolConfig(userId, protocolName),
    ]);

    return {
      protocol,
      defaultConfig,
      userConfig,
    };
  }
}
