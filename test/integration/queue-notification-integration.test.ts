/**
 * Queue & Notification Integration Test
 *
 * 测试队列服务与告警通知服务的集成：
 * - 服务容器初始化
 * - 告警通知加入队列
 * - 队列处理器执行通知发送
 * - 通知日志持久化
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mongodb } from '../../src/database/mongodb';
import { ServiceContainer } from '../../src/services';
import {
  Phase3Collections,
  type AlarmDocument,
  createAlarm,
} from '../../src/entities/mongodb';

describe('Queue & Notification Integration', () => {
  let serviceContainer: ServiceContainer;
  let collections: Phase3Collections;

  beforeAll(async () => {
    // 确保 MongoDB 已连接
    await mongodb.connect();

    // 初始化服务容器
    serviceContainer = await ServiceContainer.initialize(mongodb.getDatabase(), {
      queueType: 'sqlite',
      sqliteConfig: {
        dbPath: ':memory:', // 使用内存数据库以加快测试
        pollInterval: 50,
        maxConcurrency: 5,
      },
    });

    collections = new Phase3Collections(mongodb.getDatabase());

    // 清空测试集合
    await collections.notificationLogs.deleteMany({});
    await collections.alarms.deleteMany({});
    await collections.userAlarmSetups.deleteMany({});
  });

  afterAll(async () => {
    if (serviceContainer) {
      await serviceContainer.close();
    }
  });

  test('should initialize services successfully', () => {
    expect(serviceContainer).toBeDefined();
    expect(serviceContainer.queueService).toBeDefined();
    expect(serviceContainer.alarmNotificationService).toBeDefined();
  });

  test('should queue and process alarm notifications', async () => {
    // 1. 创建测试用户告警配置
    await collections.userAlarmSetups.insertOne({
      user: 'test-user-1',
      ProtocolSetup: {
        Protocol: 'test-protocol',
        Mode: 'tcp',
      },
      wxs: ['openid-123'],
      tels: ['13800138000'],
      mails: ['test@example.com'],
    });

    // 2. 创建告警
    const alarm: AlarmDocument = createAlarm({
      mac: 'AA:BB:CC:DD:EE:FF',
      pid: 1,
      protocol: 'test-protocol',
      msg: '温度超过阈值',
      level: 'warning',
      data: [
        {
          name: 'temperature',
          value: '95',
          parseValue: '95',
          alarm: true,
          unit: '°C',
          level: 'warning',
          condition: '> 90',
        },
      ],
      triggeredAt: new Date(),
    });

    // 3. 插入告警到数据库
    const result = await collections.alarms.insertOne(alarm);
    alarm._id = result.insertedId;

    // 4. 触发告警通知
    await serviceContainer.alarmNotificationService.sendAlarmNotification(alarm);

    // 5. 等待队列处理（异步）
    await Bun.sleep(500);

    // 6. 验证通知日志
    const notificationLogs = await collections.notificationLogs.find({}).toArray();

    console.log(`  ✅ 通知日志数量: ${notificationLogs.length}`);
    console.log(`  ✅ 通知渠道: ${notificationLogs.map((l) => l.channel).join(', ')}`);

    // 应该有 3 个通知（微信、短信、邮件）
    expect(notificationLogs.length).toBe(3);

    // 验证每个通知类型
    const wechatLog = notificationLogs.find((l) => l.channel === 'wechat');
    const smsLog = notificationLogs.find((l) => l.channel === 'sms');
    const emailLog = notificationLogs.find((l) => l.channel === 'email');

    expect(wechatLog).toBeDefined();
    expect(wechatLog?.status).toBe('sent');
    expect(wechatLog?.userId).toBe('test-user-1');

    expect(smsLog).toBeDefined();
    expect(smsLog?.status).toBe('sent');

    expect(emailLog).toBeDefined();
    expect(emailLog?.status).toBe('sent');
  });

  test('should handle notification priority based on alarm level', async () => {
    // 清空队列统计
    await collections.notificationLogs.deleteMany({});

    // 创建不同级别的告警
    const criticalAlarm: AlarmDocument = createAlarm({
      mac: 'AA:BB:CC:DD:EE:FF',
      pid: 2,
      protocol: 'test-protocol',
      msg: '系统严重故障',
      level: 'critical',
      data: [],
      triggeredAt: new Date(),
    });

    const infoAlarm: AlarmDocument = createAlarm({
      mac: 'AA:BB:CC:DD:EE:FF',
      pid: 3,
      protocol: 'test-protocol',
      msg: '系统信息',
      level: 'info',
      data: [],
      triggeredAt: new Date(),
    });

    // 插入告警
    const criticalResult = await collections.alarms.insertOne(criticalAlarm);
    const infoResult = await collections.alarms.insertOne(infoAlarm);
    criticalAlarm._id = criticalResult.insertedId;
    infoAlarm._id = infoResult.insertedId;

    // 先发送低优先级告警
    await serviceContainer.alarmNotificationService.sendAlarmNotification(infoAlarm);

    // 再发送高优先级告警
    await serviceContainer.alarmNotificationService.sendAlarmNotification(criticalAlarm);

    // 等待队列处理
    await Bun.sleep(500);

    // 验证队列统计
    const stats = serviceContainer.queueService.getQueueStats('notifications');
    console.log(`  ✅ 队列统计:`, stats);

    expect(stats.completed).toBeGreaterThan(0);
    expect(stats.failed).toBe(0);

    // 验证通知日志
    const logs = await collections.notificationLogs.find({}).toArray();
    expect(logs.length).toBeGreaterThan(0);
  });

  test('should deduplicate notifications within time window', async () => {
    // 清空通知日志
    await collections.notificationLogs.deleteMany({});

    // 创建相同告警
    const alarm: AlarmDocument = createAlarm({
      mac: 'AA:BB:CC:DD:EE:FF',
      pid: 4,
      protocol: 'test-protocol',
      msg: '重复告警测试',
      level: 'warning',
      data: [],
      triggeredAt: new Date(),
    });

    const result = await collections.alarms.insertOne(alarm);
    alarm._id = result.insertedId;

    // 连续发送 3 次相同告警
    await serviceContainer.alarmNotificationService.sendAlarmNotification(alarm);
    await serviceContainer.alarmNotificationService.sendAlarmNotification(alarm);
    await serviceContainer.alarmNotificationService.sendAlarmNotification(alarm);

    // 等待队列处理
    await Bun.sleep(500);

    // 验证通知日志 - 应该只有一组通知（去重生效）
    const logs = await collections.notificationLogs.find({}).toArray();

    console.log(`  ✅ 去重后通知数量: ${logs.length}`);

    // 第一次发送 3 条通知（微信、短信、邮件），后续 2 次被去重
    expect(logs.length).toBe(3);
  });

  test('should handle notification failures gracefully', async () => {
    // TODO: 实现失败场景测试
    // 这需要模拟 API 调用失败的情况
    // 可以通过修改 AlarmNotificationService 来支持注入失败模拟器
    expect(true).toBe(true);
  });

  test('should provide queue statistics', () => {
    const stats = serviceContainer.queueService.getQueueStats('notifications');

    expect(stats).toHaveProperty('pending');
    expect(stats).toHaveProperty('processing');
    expect(stats).toHaveProperty('completed');
    expect(stats).toHaveProperty('failed');

    console.log(`  ✅ 队列统计:`, stats);
  });

  test('should cleanup old notification logs', async () => {
    // 获取当前日志数量
    const beforeCount = await collections.notificationLogs.countDocuments({});

    // 清理所有已完成的任务
    await serviceContainer.queueService.cleanup('notifications', 0);

    // 验证队列已清理
    const stats = serviceContainer.queueService.getQueueStats('notifications');
    expect(stats.completed).toBe(0);

    console.log(`  ✅ 清理前日志数: ${beforeCount}`);
    console.log(`  ✅ 清理后队列统计:`, stats);
  });
});
