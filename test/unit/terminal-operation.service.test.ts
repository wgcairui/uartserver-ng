/**
 * TerminalOperationService 单元测试
 * 测试领域服务的业务逻辑和验证规则
 */

import { describe, test, expect, beforeEach, mock, spyOn } from 'bun:test';
import { terminalOperationService } from '../../src/domain/terminal-operation.service';
import { socketIoService } from '../../src/services/socket-io.service';
import { createTerminalEntity, createOfflineTerminalEntity } from '../helpers/terminal-mock';

describe('TerminalOperationService', () => {
  // Mock socketIoService 方法
  const mockOprateDTU = spyOn(socketIoService, 'OprateDTU');
  const mockInstructQuery = spyOn(socketIoService, 'InstructQuery');

  beforeEach(() => {
    // 清空 mock 调用记录
    mockOprateDTU.mockClear();
    mockInstructQuery.mockClear();
  });

  // ============================================
  // 业务规则验证测试
  // ============================================

  describe('业务规则验证', () => {
    test('离线终端无法执行操作', async () => {
      const terminal = createOfflineTerminalEntity({
        DevMac: 'AA:BB:CC:DD:EE:01',
        online: false,
      });

      await expect(terminalOperationService.restart(terminal, 'test-user')).rejects.toThrow(
        '无法执行操作'
      );

      // 不应该调用基础设施层
      expect(mockOprateDTU).not.toHaveBeenCalled();
    });

    test('无挂载节点的终端无法执行操作', async () => {
      const terminal = createTerminalEntity({
        DevMac: 'AA:BB:CC:DD:EE:02',
        online: true,
        mountNode: '', // 无挂载节点
      });

      await expect(terminalOperationService.restart(terminal, 'test-user')).rejects.toThrow(
        '无法执行操作'
      );

      expect(mockOprateDTU).not.toHaveBeenCalled();
    });

    test('在线且有节点的终端可以执行操作', async () => {
      const terminal = createTerminalEntity({
        DevMac: 'AA:BB:CC:DD:EE:03',
        online: true,
        mountNode: 'node-test-01',
      });

      // Mock 成功响应
      mockOprateDTU.mockResolvedValue({ ok: 1, msg: '操作成功' });

      const result = await terminalOperationService.restart(terminal, 'test-user');

      expect(result.ok).toBe(1);
      expect(mockOprateDTU).toHaveBeenCalledWith(
        'AA:BB:CC:DD:EE:03',
        'restart',
        undefined,
        'test-user'
      );
    });

    test('查询操作对离线终端也允许（会走缓存）', async () => {
      const terminal = createOfflineTerminalEntity({
        DevMac: 'AA:BB:CC:DD:EE:04',
        online: false,
        mountNode: 'node-test-01',
      });

      // Mock 成功响应
      mockInstructQuery.mockResolvedValue({ ok: 1, msg: '查询成功' });

      const result = await terminalOperationService.query(terminal, {
        pid: 1,
        protocol: 'modbus',
        DevMac: 'AA:BB:CC:DD:EE:04',
        content: '01 03 00 00 00 01',
        Interval: 5000,
      });

      expect(result.ok).toBe(1);
      expect(mockInstructQuery).toHaveBeenCalled();
    });

    test('无节点的终端无法查询', async () => {
      const terminal = createOfflineTerminalEntity({
        DevMac: 'AA:BB:CC:DD:EE:05',
        online: false,
        mountNode: '', // 无节点
      });

      await expect(
        terminalOperationService.query(terminal, {
          pid: 1,
          protocol: 'modbus',
          DevMac: 'AA:BB:CC:DD:EE:05',
          content: '01 03 00 00 00 01',
          Interval: 5000,
        })
      ).rejects.toThrow('无法查询');

      expect(mockInstructQuery).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // DTU 操作方法测试
  // ============================================

  describe('DTU 操作方法', () => {
    const createOnlineTerminal = () =>
      createTerminalEntity({
        DevMac: 'AA:BB:CC:DD:EE:10',
        online: true,
        mountNode: 'node-test-01',
      });

    test('restart() 应该调用 OprateDTU with restart', async () => {
      const terminal = createOnlineTerminal();
      mockOprateDTU.mockResolvedValue({ ok: 1, msg: 'DTU 重启成功' });

      const result = await terminalOperationService.restart(terminal, 'admin');

      expect(result.ok).toBe(1);
      expect(result.msg).toBe('DTU 重启成功');
      expect(mockOprateDTU).toHaveBeenCalledWith(
        terminal.mac,
        'restart',
        undefined,
        'admin'
      );
    });

    test('restart485() 应该调用 OprateDTU with restart485', async () => {
      const terminal = createOnlineTerminal();
      mockOprateDTU.mockResolvedValue({ ok: 1, msg: '485 重启成功' });

      const result = await terminalOperationService.restart485(terminal, 'admin');

      expect(result.ok).toBe(1);
      expect(mockOprateDTU).toHaveBeenCalledWith(
        terminal.mac,
        'restart485',
        undefined,
        'admin'
      );
    });

    test('updateMount() 应该传递配置内容', async () => {
      const terminal = createOnlineTerminal();
      const mountConfig = { devices: [{ pid: 1, protocol: 'modbus' }] };
      mockOprateDTU.mockResolvedValue({ ok: 1, msg: '配置更新成功' });

      const result = await terminalOperationService.updateMount(terminal, mountConfig, 'admin');

      expect(result.ok).toBe(1);
      expect(mockOprateDTU).toHaveBeenCalledWith(
        terminal.mac,
        'updateMount',
        mountConfig,
        'admin'
      );
    });

    test('sendInstruct() 应该传递指令内容', async () => {
      const terminal = createOnlineTerminal();
      const instruct = { command: 'AT+RESET' };
      mockOprateDTU.mockResolvedValue({ ok: 1, msg: '指令发送成功' });

      const result = await terminalOperationService.sendInstruct(terminal, instruct, 'admin');

      expect(result.ok).toBe(1);
      expect(mockOprateDTU).toHaveBeenCalledWith(
        terminal.mac,
        'OprateInstruct',
        instruct,
        'admin'
      );
    });

    test('setTerminal() 应该传递参数内容', async () => {
      const terminal = createOnlineTerminal();
      const params = { heartbeat: 60 };
      mockOprateDTU.mockResolvedValue({ ok: 1, msg: '参数设置成功' });

      const result = await terminalOperationService.setTerminal(terminal, params, 'admin');

      expect(result.ok).toBe(1);
      expect(mockOprateDTU).toHaveBeenCalledWith(
        terminal.mac,
        'setTerminal',
        params,
        'admin'
      );
    });

    test('getTerminal() 不需要传递参数', async () => {
      const terminal = createOnlineTerminal();
      mockOprateDTU.mockResolvedValue({
        ok: 1,
        msg: '获取成功',
        data: { version: '1.0.0' },
      });

      const result = await terminalOperationService.getTerminal(terminal, 'admin');

      expect(result.ok).toBe(1);
      expect(result.data).toEqual({ version: '1.0.0' });
      expect(mockOprateDTU).toHaveBeenCalledWith(
        terminal.mac,
        'getTerminal',
        undefined,
        'admin'
      );
    });

    test('操作失败时应该返回失败结果', async () => {
      const terminal = createOnlineTerminal();
      mockOprateDTU.mockResolvedValue({ ok: 0, msg: 'Node 节点无响应' });

      const result = await terminalOperationService.restart(terminal, 'admin');

      expect(result.ok).toBe(0);
      expect(result.msg).toBe('Node 节点无响应');
    });

    test('操作抛出异常时应该向上传播', async () => {
      const terminal = createOnlineTerminal();
      mockOprateDTU.mockRejectedValue(new Error('网络错误'));

      await expect(terminalOperationService.restart(terminal, 'admin')).rejects.toThrow(
        '网络错误'
      );
    });
  });

  // ============================================
  // 查询方法测试
  // ============================================

  describe('查询方法', () => {
    test('query() 应该调用 InstructQuery 并传递正确参数', async () => {
      const terminal = createTerminalEntity({
        DevMac: 'AA:BB:CC:DD:EE:20',
        online: true,
        mountNode: 'node-test-01',
      });

      const queryParams = {
        pid: 1,
        protocol: 'modbus',
        DevMac: 'AA:BB:CC:DD:EE:20',
        content: '01 03 00 00 00 01',
        Interval: 5000,
      };

      mockInstructQuery.mockResolvedValue({
        ok: 1,
        msg: '查询成功',
        data: { value: 123 },
      });

      const result = await terminalOperationService.query(terminal, queryParams);

      expect(result.ok).toBe(1);
      expect(result.data).toEqual({ value: 123 });
      expect(mockInstructQuery).toHaveBeenCalledWith(
        terminal.mac,
        queryParams.pid,
        queryParams.protocol,
        queryParams.DevMac,
        queryParams.content,
        queryParams.Interval
      );
    });

    test('查询失败时应该返回失败结果', async () => {
      const terminal = createTerminalEntity({
        DevMac: 'AA:BB:CC:DD:EE:21',
        online: true,
        mountNode: 'node-test-01',
      });

      mockInstructQuery.mockResolvedValue({ ok: 0, msg: '设备无响应' });

      const result = await terminalOperationService.query(terminal, {
        pid: 1,
        protocol: 'modbus',
        DevMac: 'AA:BB:CC:DD:EE:21',
        content: '01 03 00 00 00 01',
        Interval: 5000,
      });

      expect(result.ok).toBe(0);
      expect(result.msg).toBe('设备无响应');
    });
  });

  // ============================================
  // 默认参数测试
  // ============================================

  describe('默认参数', () => {
    test('operatedBy 默认为 system', async () => {
      const terminal = createTerminalEntity({
        DevMac: 'AA:BB:CC:DD:EE:30',
        online: true,
        mountNode: 'node-test-01',
      });

      mockOprateDTU.mockResolvedValue({ ok: 1, msg: '成功' });

      // 不传递 operatedBy 参数
      await terminalOperationService.restart(terminal);

      expect(mockOprateDTU).toHaveBeenCalledWith(
        terminal.mac,
        'restart',
        undefined,
        'system' // 默认值
      );
    });
  });
});
