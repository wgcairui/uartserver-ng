/**
 * Device Type Service (Phase 8.3)
 *
 * 设备类型管理服务
 * 对接老系统集合: device.types
 */

import type { Db } from 'mongodb';

/**
 * 设备协议定义
 */
export interface DeviceProtocol {
  Type: number; // 485 或 232
  Protocol: string; // 协议名称
}

/**
 * 设备类型文档
 */
export interface DeviceTypeDocument {
  _id?: any;
  Type: string; // '485' 或 '232'
  DevModel: string; // 设备型号
  Protocols: DeviceProtocol[]; // 支持的协议列表
}

/**
 * 设备类型服务
 *
 * 提供设备类型查询功能
 */
export class DeviceTypeService {
  private db: Db;

  // 老系统集合名称
  private readonly DEVICE_TYPES_COLLECTION = 'device.types';

  constructor(db: Db) {
    this.db = db;
  }

  // ============================================================================
  // 设备类型查询
  // ============================================================================

  /**
   * 获取设备类型列表
   *
   * @param type 设备类型过滤 ('232' 或 '485')
   * @returns 设备类型列表
   */
  async getDeviceTypes(type?: string): Promise<DeviceTypeDocument[]> {
    const collection =
      this.db.collection<DeviceTypeDocument>(this.DEVICE_TYPES_COLLECTION);

    const query: any = {};
    if (type) {
      query.Type = type;
    }

    return await collection.find(query).toArray();
  }

  /**
   * 根据设备型号获取设备类型
   *
   * @param devModel 设备型号
   * @returns 设备类型文档
   */
  async getDeviceTypeByModel(
    devModel: string
  ): Promise<DeviceTypeDocument | null> {
    const collection =
      this.db.collection<DeviceTypeDocument>(this.DEVICE_TYPES_COLLECTION);

    return await collection.findOne({ DevModel: devModel });
  }

  /**
   * 检查设备型号是否存在
   *
   * @param devModel 设备型号
   * @returns 是否存在
   */
  async deviceTypeExists(devModel: string): Promise<boolean> {
    const collection =
      this.db.collection<DeviceTypeDocument>(this.DEVICE_TYPES_COLLECTION);

    const count = await collection.countDocuments({ DevModel: devModel });
    return count > 0;
  }

  /**
   * 添加或更新设备类型
   *
   * @param type 设备类型 ('232' 或 '485')
   * @param devModel 设备型号
   * @param protocols 支持的协议列表
   * @returns 是否成功
   */
  async upsertDeviceType(
    type: string,
    devModel: string,
    protocols: DeviceProtocol[]
  ): Promise<boolean> {
    const collection =
      this.db.collection<DeviceTypeDocument>(this.DEVICE_TYPES_COLLECTION);

    const result = await collection.updateOne(
      { Type: type, DevModel: devModel },
      {
        $set: {
          Protocols: protocols.map((p) => ({
            Protocol: p.Protocol,
            Type: p.Type,
          })),
        },
      },
      { upsert: true }
    );

    return result.acknowledged;
  }

  /**
   * 删除设备类型
   *
   * @param devModel 设备型号
   * @returns 是否成功
   */
  async deleteDeviceType(devModel: string): Promise<boolean> {
    const collection =
      this.db.collection<DeviceTypeDocument>(this.DEVICE_TYPES_COLLECTION);

    const result = await collection.deleteOne({ DevModel: devModel });

    return result.deletedCount > 0;
  }

  /**
   * 获取所有设备型号列表
   *
   * @returns 设备型号列表
   */
  async getAllDeviceModels(): Promise<string[]> {
    const collection =
      this.db.collection<DeviceTypeDocument>(this.DEVICE_TYPES_COLLECTION);

    const deviceTypes = await collection.find({}).toArray();
    return deviceTypes.map((dt) => dt.DevModel);
  }
}
