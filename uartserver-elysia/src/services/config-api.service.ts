/**
 * Config API Service (Phase 4.2 Day 4)
 *
 * 用户配置服务层 - 读取老系统数据
 * 对接老系统集合: user.layouts, user.aggregations
 */

import type { Db } from 'mongodb';

/**
 * 布局绑定设备 (对齐老系统 bind 类)
 */
export interface LegacyLayoutBind {
  mac: string;
  pid: number;
  name: string;
}

/**
 * 布局项 (对齐老系统 Layout 类)
 */
export interface LegacyLayoutItem {
  x: number;
  y: number;
  id: string;
  name: string;
  color: string;
  bind: LegacyLayoutBind;
  result?: {
    // 实时数据字段
    name: string;
    value: string | number;
    unit?: string;
    parseValue?: number;
    alarm?: boolean;
    [key: string]: unknown;
  } | null; // 注入的实时数据
}

/**
 * 用户布局配置 (对齐老系统 UserLayout)
 * Collection: user.layouts
 */
export interface LegacyUserLayout {
  _id?: any;
  user: string;
  type: string;
  id: string;
  bg?: string;
  Layout: LegacyLayoutItem[];
}

/**
 * 聚合设备 (对齐老系统 aggregation 类)
 */
export interface LegacyAggregationDevice {
  DevMac: string;
  name: string;
  Type: string;
  mountDev: string;
  protocol: string;
  pid: number;
  // 实时注入字段 (Phase 4.2 Day 5)
  online?: boolean; // 设备在线状态
  lastSeen?: Date | null; // 最后在线时间
  data?: Array<{
    // 设备最新数据
    name: string;
    value: string | number;
    unit?: string;
    parseValue?: number;
    alarm?: boolean;
    [key: string]: unknown;
  }>;
}

/**
 * 用户聚合配置 (对齐老系统 UserAggregation)
 * Collection: user.aggregations
 */
export interface LegacyUserAggregation {
  _id?: any;
  user: string;
  id: string;
  name: string;
  aggregations: LegacyAggregationDevice[];
}

/**
 * 配置 API 服务
 *
 * 提供用户布局和聚合配置管理
 * 所有操作基于老系统集合,确保数据兼容性
 */
export class ConfigApiService {
  private db: Db;

  // 老系统集合名称
  private readonly USER_LAYOUTS_COLLECTION = 'user.layouts';
  private readonly USER_AGGREGATIONS_COLLECTION = 'user.aggregations';

  constructor(db: Db) {
    this.db = db;
  }

  // ============================================================================
  // 用户布局配置
  // ============================================================================

  /**
   * 获取用户布局配置
   *
   * 对应老系统 getUserLayout 功能
   *
   * @param userId 用户 ID
   * @param layoutId 布局 ID
   * @returns 布局配置
   */
  async getUserLayout(
    userId: string,
    layoutId: string
  ): Promise<LegacyUserLayout | null> {
    const collection = this.db.collection<LegacyUserLayout>(
      this.USER_LAYOUTS_COLLECTION
    );

    return await collection.findOne({
      user: userId,
      id: layoutId,
    });
  }

  /**
   * 获取用户所有布局配置
   *
   * @param userId 用户 ID
   * @returns 布局配置列表
   */
  async getUserLayouts(userId: string): Promise<LegacyUserLayout[]> {
    const collection = this.db.collection<LegacyUserLayout>(
      this.USER_LAYOUTS_COLLECTION
    );

    return await collection.find({ user: userId }).toArray();
  }

  /**
   * 设置用户布局配置
   *
   * 对应老系统 setUserLayout 功能
   *
   * @param userId 用户 ID
   * @param layoutId 布局 ID
   * @param type 布局类型
   * @param bg 背景
   * @param Layout 布局项列表
   * @returns 是否成功
   */
  async setUserLayout(
    userId: string,
    layoutId: string,
    type: string,
    bg: string | undefined,
    Layout: LegacyLayoutItem[]
  ): Promise<boolean> {
    const collection = this.db.collection<LegacyUserLayout>(
      this.USER_LAYOUTS_COLLECTION
    );

    // 检查布局是否存在
    const existing = await collection.findOne({
      user: userId,
      id: layoutId,
    });

    const layoutDoc: LegacyUserLayout = {
      user: userId,
      id: layoutId,
      type,
      bg,
      Layout,
    };

    if (existing) {
      // 更新现有布局
      const result = await collection.updateOne(
        { user: userId, id: layoutId },
        { $set: layoutDoc }
      );
      return result.modifiedCount > 0 || result.matchedCount > 0;
    } else {
      // 创建新布局
      const result = await collection.insertOne(layoutDoc as any);
      return result.acknowledged;
    }
  }

  /**
   * 删除用户布局配置
   *
   * @param userId 用户 ID
   * @param layoutId 布局 ID
   * @returns 是否成功
   */
  async deleteUserLayout(userId: string, layoutId: string): Promise<boolean> {
    const collection = this.db.collection<LegacyUserLayout>(
      this.USER_LAYOUTS_COLLECTION
    );

    const result = await collection.deleteOne({
      user: userId,
      id: layoutId,
    });

    return result.deletedCount > 0;
  }

  /**
   * 检查布局是否存在
   *
   * @param userId 用户 ID
   * @param layoutId 布局 ID
   * @returns 是否存在
   */
  async layoutExists(userId: string, layoutId: string): Promise<boolean> {
    const collection = this.db.collection<LegacyUserLayout>(
      this.USER_LAYOUTS_COLLECTION
    );

    const count = await collection.countDocuments({
      user: userId,
      id: layoutId,
    });

    return count > 0;
  }

  // ============================================================================
  // 用户聚合配置
  // ============================================================================

  /**
   * 获取用户聚合配置
   *
   * 对应老系统 getAggregation 功能
   *
   * @param userId 用户 ID
   * @param aggregationId 聚合 ID
   * @returns 聚合配置
   */
  async getUserAggregation(
    userId: string,
    aggregationId: string
  ): Promise<LegacyUserAggregation | null> {
    const collection = this.db.collection<LegacyUserAggregation>(
      this.USER_AGGREGATIONS_COLLECTION
    );

    return await collection.findOne({
      user: userId,
      id: aggregationId,
    });
  }

  /**
   * 获取用户所有聚合配置
   *
   * @param userId 用户 ID
   * @returns 聚合配置列表
   */
  async getUserAggregations(userId: string): Promise<LegacyUserAggregation[]> {
    const collection = this.db.collection<LegacyUserAggregation>(
      this.USER_AGGREGATIONS_COLLECTION
    );

    return await collection.find({ user: userId }).toArray();
  }

  /**
   * 设置用户聚合配置 (未来扩展)
   *
   * @param userId 用户 ID
   * @param aggregationId 聚合 ID
   * @param name 聚合名称
   * @param aggregations 设备列表
   * @returns 是否成功
   */
  async setUserAggregation(
    userId: string,
    aggregationId: string,
    name: string,
    aggregations: LegacyAggregationDevice[]
  ): Promise<boolean> {
    const collection = this.db.collection<LegacyUserAggregation>(
      this.USER_AGGREGATIONS_COLLECTION
    );

    // 检查聚合是否存在
    const existing = await collection.findOne({
      user: userId,
      id: aggregationId,
    });

    const aggregationDoc: LegacyUserAggregation = {
      user: userId,
      id: aggregationId,
      name,
      aggregations,
    };

    if (existing) {
      // 更新现有聚合
      const result = await collection.updateOne(
        { user: userId, id: aggregationId },
        { $set: aggregationDoc }
      );
      return result.modifiedCount > 0 || result.matchedCount > 0;
    } else {
      // 创建新聚合
      const result = await collection.insertOne(aggregationDoc as any);
      return result.acknowledged;
    }
  }

  /**
   * 删除用户聚合配置
   *
   * @param userId 用户 ID
   * @param aggregationId 聚合 ID
   * @returns 是否成功
   */
  async deleteUserAggregation(
    userId: string,
    aggregationId: string
  ): Promise<boolean> {
    const collection = this.db.collection<LegacyUserAggregation>(
      this.USER_AGGREGATIONS_COLLECTION
    );

    const result = await collection.deleteOne({
      user: userId,
      id: aggregationId,
    });

    return result.deletedCount > 0;
  }

  /**
   * 检查聚合是否存在
   *
   * @param userId 用户 ID
   * @param aggregationId 聚合 ID
   * @returns 是否存在
   */
  async aggregationExists(
    userId: string,
    aggregationId: string
  ): Promise<boolean> {
    const collection = this.db.collection<LegacyUserAggregation>(
      this.USER_AGGREGATIONS_COLLECTION
    );

    const count = await collection.countDocuments({
      user: userId,
      id: aggregationId,
    });

    return count > 0;
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  /**
   * 统计用户布局数量
   *
   * @param userId 用户 ID
   * @returns 布局数量
   */
  async getUserLayoutCount(userId: string): Promise<number> {
    const collection = this.db.collection<LegacyUserLayout>(
      this.USER_LAYOUTS_COLLECTION
    );

    return await collection.countDocuments({ user: userId });
  }

  /**
   * 统计用户聚合数量
   *
   * @param userId 用户 ID
   * @returns 聚合数量
   */
  async getUserAggregationCount(userId: string): Promise<number> {
    const collection = this.db.collection<LegacyUserAggregation>(
      this.USER_AGGREGATIONS_COLLECTION
    );

    return await collection.countDocuments({ user: userId });
  }

  /**
   * 获取布局中的所有设备绑定
   *
   * @param layout 布局配置
   * @returns 设备绑定列表
   */
  getLayoutDeviceBindings(layout: LegacyUserLayout): LegacyLayoutBind[] {
    return layout.Layout.map((item) => item.bind);
  }

  /**
   * 获取聚合中的所有设备
   *
   * @param aggregation 聚合配置
   * @returns 设备列表
   */
  getAggregationDevices(
    aggregation: LegacyUserAggregation
  ): LegacyAggregationDevice[] {
    return aggregation.aggregations;
  }
}
