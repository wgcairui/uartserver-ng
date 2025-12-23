/**
 * 微信认证服务
 *
 * 处理微信小程序和公众号的认证逻辑
 * 对齐老系统的微信登录流程
 */

import { mongodb } from '../database/mongodb';
import { Phase3Collections } from '../entities/mongodb';
import {
  WxUserDocument,
  createWxUser,
  WxMiniLoginResponse,
  WxUserInfoResponse,
  isWxUserBound,
  bindWxUserToSystem,
  unbindWxUser,
} from '../entities/mongodb/wx-user.entity';
import { UserDocument } from '../entities/mongodb/user.entity';
import { ObjectId, WithId } from 'mongodb';

/**
 * 微信认证服务
 */
export class WxAuthService {
  private collections: Phase3Collections;

  constructor() {
    this.collections = new Phase3Collections(mongodb.getDatabase());
  }

  /**
   * 微信小程序登录
   *
   * @param code - 登录凭证
   * @param appid - 小程序 AppID
   * @returns 登录结果
   */
  async wxMiniLogin(code: string, appid?: string): Promise<{
    user: WxUserDocument;
    isNewUser: boolean;
    systemUser: WithId<UserDocument> | null;
  }> {
    try {
      // 步骤 1: 通过 code 换取 session_key 和 openid
      const loginResponse = await this.code2Session(code, appid);

      if (loginResponse.errcode !== 0) {
        throw new Error(`微信登录失败: ${loginResponse.errmsg}`);
      }

      const { openid, session_key, expires_in, unionid } = loginResponse;

      // 步骤 2: 获取用户信息
      const userInfo = await this.getWxUserInfo(unionid || openid, appid);

      // 步骤 3: 查找或创建微信用户
      const wxUser = await this.findOrCreateWxUser({
        appid,
        openid,
        unionid,
        session_key,
        session_expires_in: expires_in,
        nickname: userInfo?.nickname,
        avatar_url: userInfo?.headimgurl,
        gender: userInfo?.sex,
        country: userInfo?.country,
        province: userInfo?.province,
        city: userInfo?.city,
        language: userInfo?.language,
      });

      // 步骤 4: 查找绑定的系统用户
      let systemUser: WithId<UserDocument> | null = null;
      if (isWxUserBound(wxUser)) {
        systemUser = await this.collections.users.findOne({
          _id: wxUser.system_user_id,
          isActive: true,
        });
      }

      return {
        user: wxUser,
        isNewUser: !wxUser._id,
        systemUser,
      };

    } catch (error) {
      console.error('微信小程序登录失败:', error);
      throw error;
    }
  }

  /**
   * 通过 code 获取 session_key
   *
   * @param code - 登录凭证
   * @param appid - 小程序 AppID
   * @returns 登录响应
   */
  private async code2Session(
    code: string,
    appid?: string
  ): Promise<WxMiniLoginResponse> {
    // 从配置获取 AppID 和 Secret
    const APPID = appid || process.env.WXA_ID;
    const SECRET = process.env.WXA_SECRET;

    if (!APPID || !SECRET) {
      throw new Error('微信小程序 AppID 和 Secret 未配置');
    }

    // 调用微信 API
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${APPID}&secret=${SECRET}&js_code=${code}&grant_type=authorization_code`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`微信 API 请求失败: ${response.statusText}`);
    }

    const data = await response.json() as WxMiniLoginResponse;

    return data;
  }

  /**
   * 获取微信用户信息
   *
   * @param openid - 用户 OpenID 或 UnionID
   * @param appid - AppID
   * @returns 用户信息
   */
  private async getWxUserInfo(
    openid: string,
    _appid?: string
  ): Promise<WxUserInfoResponse | null> {
    try {
      const ACCESS_TOKEN = process.env.WXA_ACCESS_TOKEN;
      if (!ACCESS_TOKEN) {
        console.warn('微信 access token 未配置，无法获取用户信息');
        return null;
      }

      const url = `https://api.weixin.qq.com/sns/userinfo?access_token=${ACCESS_TOKEN}&openid=${openid}`;

      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }

      return await response.json() as WxUserInfoResponse;
    } catch (error) {
      console.warn('获取微信用户信息失败:', error);
      return null;
    }
  }

  /**
   * 查找或创建微信用户
   *
   * @param userData - 用户数据
   * @returns 微信用户
   */
  private async findOrCreateWxUser(
    userData: Partial<WxUserDocument>
  ): Promise<WxUserDocument> {
    // 查找现有用户 (优先使用 UnionID)
    let wxUser: WxUserDocument | null = null;

    if (userData.unionid) {
      wxUser = await this.collections.wxUsers.findOne({
        unionid: userData.unionid,
        appid: userData.appid,
      });
    }

    // 如果没有 UnionID 或没找到，尝试用 OpenID
    if (!wxUser && userData.openid) {
      wxUser = await this.collections.wxUsers.findOne({
        openid: userData.openid,
        appid: userData.appid,
      });
    }

    if (wxUser) {
      // 更新现有用户
      const updateData = {
        ...userData,
        last_active_at: new Date(),
        updated_at: new Date(),
      };

      await this.collections.wxUsers.updateOne(
        { _id: wxUser._id },
        { $set: updateData }
      );

      return { ...wxUser, ...updateData };
    } else {
      // 创建新用户
      const newWxUser = createWxUser(userData);
      const result = await this.collections.wxUsers.insertOne(newWxUser as any);

      return {
        _id: result.insertedId,
        ...newWxUser,
      };
    }
  }

  /**
   * 绑定微信用户到系统用户
   *
   * @param wxUserId - 微信用户 ID
   * @param systemUserId - 系统用户 ID
   * @returns 绑定结果
   */
  async bindWxUser(
    wxUserId: string,
    systemUserId: string
  ): Promise<WxUserDocument> {
    const objectId = new ObjectId(wxUserId);
    const systemObjectId = new ObjectId(systemUserId);

    // 检查用户是否存在
    const wxUser = await this.collections.wxUsers.findOne({ _id: objectId });
    if (!wxUser) {
      throw new Error('微信用户不存在');
    }

    // 检查系统用户是否存在
    const systemUser = await this.collections.users.findOne({ _id: systemObjectId });
    if (!systemUser) {
      throw new Error('系统用户不存在');
    }

    // 检查是否已经绑定到其他账号
    const existingBinding = await this.collections.wxUsers.findOne({
      _id: { $ne: objectId },
      system_user_id: systemObjectId,
      binding_status: 'bound',
    });

    if (existingBinding) {
      throw new Error('该微信账号已绑定到其他系统账号');
    }

    // 执行绑定
    const updateData = bindWxUserToSystem(wxUser, systemObjectId);
    await this.collections.wxUsers.updateOne(
      { _id: objectId },
      { $set: updateData }
    );

    // 同时更新系统用户的微信关联
    await this.collections.users.updateOne(
      { _id: systemObjectId },
      {
        $set: {
          wxId: wxUser.unionid || wxUser.openid,
          updatedAt: new Date(),
        },
      }
    );

    // 获取更新后的用户
    const updatedWxUser = await this.collections.wxUsers.findOne({ _id: objectId });
    return updatedWxUser!;
  }

  /**
   * 解绑微信用户
   *
   * @param wxUserId - 微信用户 ID
   * @returns 解绑结果
   */
  async unbindWxUser(wxUserId: string): Promise<WxUserDocument> {
    const objectId = new ObjectId(wxUserId);

    const wxUser = await this.collections.wxUsers.findOne({ _id: objectId });
    if (!wxUser) {
      throw new Error('微信用户不存在');
    }

    // 执行解绑
    const updateData = unbindWxUser(wxUser);
    await this.collections.wxUsers.updateOne(
      { _id: objectId },
      { $set: updateData }
    );

    // 同时清除系统用户的微信关联
    if (wxUser.system_user_id) {
      await this.collections.users.updateOne(
        { _id: wxUser.system_user_id },
        {
          $unset: { wxId: '' },
          $set: {
            updatedAt: new Date(),
          },
        }
      );
    }

    // 获取更新后的用户
    const updatedWxUser = await this.collections.wxUsers.findOne({ _id: objectId });
    return updatedWxUser!;
  }

  /**
   * 根据微信 UnionID 查找用户
   *
   * @param unionid - 微信 UnionID
   * @param appid - AppID
   * @returns 微信用户
   */
  async findWxUserByUnionid(unionid: string, appid?: string): Promise<WxUserDocument | null> {
    const filter: any = { unionid };
    if (appid) {
      filter.appid = appid;
    }

    return this.collections.wxUsers.findOne(filter);
  }

  /**
   * 根据系统用户ID 查找绑定的微信用户
   *
   * @param systemUserId - 系统用户 ID
   * @returns 微信用户
   */
  async findWxUserBySystemUser(systemUserId: string): Promise<WxUserDocument | null> {
    return this.collections.wxUsers.findOne({
      system_user_id: new ObjectId(systemUserId),
      binding_status: 'bound',
    });
  }

  /**
   * 更新微信用户活跃时间
   *
   * @param wxUserId - 微信用户 ID
   */
  async updateLastActiveTime(wxUserId: string): Promise<void> {
    const objectId = new ObjectId(wxUserId);
    await this.collections.wxUsers.updateOne(
      { _id: objectId },
      {
        $set: {
          last_active_at: new Date(),
          updated_at: new Date(),
        },
      }
    );
  }

  /**
   * 获取微信用户统计信息
   *
   * @returns 统计数据
   */
  async getWxUserStats() {
    // 计算 7 天前的时间点 (移到 Promise.all 外部)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalStats,
      bindingStats,
      activeStats,
    ] = await Promise.all([
      // 总数统计
      this.collections.wxUsers.countDocuments(),

      // 绑定状态统计
      this.collections.wxUsers.aggregate([
        {
          $group: {
            _id: '$binding_status',
            count: { $sum: 1 },
          },
        },
      ]).toArray(),

      // 活跃用户统计 (7天内活跃)
      this.collections.wxUsers.countDocuments({
        last_active_at: { $gte: sevenDaysAgo },
      }),
    ]);

    const bindingCounts = bindingStats.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: totalStats,
      bound: bindingCounts.bound || 0,
      unbound: bindingCounts.unbound || 0,
      expired: bindingCounts.expired || 0,
      active: activeStats,
    };
  }

  /**
   * 清理过期的会话信息
   *
   * @param days - 过期天数
   * @returns 清理数量
   */
  async cleanupExpiredSessions(days: number = 30): Promise<number> {
    const expiredDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await this.collections.wxUsers.updateMany(
      {
        session_expires_in: { $lt: 1 },
        last_active_at: { $lt: expiredDate },
      },
      {
        $unset: { session_key: '', session_expires_in: '' },
        $set: { updated_at: new Date() },
      }
    );

    return result.modifiedCount;
  }
}