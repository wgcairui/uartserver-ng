/**
 * Terminal Operation Service (领域服务)
 * 封装终端操作的业务逻辑，协调 Entity 和 Infrastructure Service
 */

import type { TerminalEntity } from './terminal.entity';
import { socketIoService } from '../services/socket-io.service';
import type { InstructQueryResult, OprateDtuResult } from '../services/socket-io.service';
import type { DtuOperationType } from '../types/socket-events';
import { logger } from '../utils/logger';

/**
 * 查询参数
 */
export interface QueryParams {
  pid: number; // 设备 PID
  protocol: string; // 协议名称
  DevMac: string; // 设备 MAC (可能与终端 MAC 不同)
  content: string; // 查询指令内容
  Interval: number; // 查询间隔 (ms)
}

/**
 * 终端操作领域服务
 *
 * 职责：
 * 1. 使用 TerminalEntity 的业务规则进行验证
 * 2. 协调基础设施层的 Socket.IO 调用
 * 3. 处理错误和日志
 * 4. 提供统一的操作接口
 */
class TerminalOperationService {
  /**
   * 查询终端设备数据
   *
   * @param terminal - 终端实体
   * @param params - 查询参数
   * @returns 查询结果
   * @throws Error 如果终端不满足查询条件
   */
  async query(terminal: TerminalEntity, params: QueryParams): Promise<InstructQueryResult> {
    // 业务规则验证
    if (!terminal.canQuery()) {
      const errors = terminal.getQueryValidationErrors();
      const errorMsg = `终端 ${terminal.mac} 无法查询: ${errors.join(', ')}`;
      logger.warn(errorMsg);
      throw new Error(errorMsg);
    }

    // 检查目标设备是否在线
    if (terminal.online && !terminal.isMountDeviceOnline(params.pid)) {
      logger.warn(`终端 ${terminal.mac} 的挂载设备 ${params.pid} 离线`);
      // 不抛出异常，让查询尝试执行（可能会走缓存）
    }

    // 调用基础设施层
    try {
      logger.debug(`Querying terminal ${terminal.mac}, device ${params.pid}, protocol ${params.protocol}`);

      const result = await socketIoService.InstructQuery(
        terminal.mac,
        params.pid,
        params.protocol,
        params.DevMac,
        params.content,
        params.Interval
      );

      if (result.ok === 1) {
        logger.debug(`Query successful for terminal ${terminal.mac}, device ${params.pid}`);
      } else {
        logger.warn(`Query failed for terminal ${terminal.mac}, device ${params.pid}: ${result.msg}`);
      }

      return result;
    } catch (error) {
      logger.error(`Query error for terminal ${terminal.mac}:`, error);
      throw error;
    }
  }

  /**
   * 重启 DTU
   *
   * @param terminal - 终端实体
   * @param operatedBy - 操作人
   * @returns 操作结果
   * @throws Error 如果终端不满足操作条件
   */
  async restart(terminal: TerminalEntity, operatedBy: string = 'system'): Promise<OprateDtuResult> {
    return this.operate(terminal, 'restart', undefined, operatedBy);
  }

  /**
   * 重启 485 接口
   *
   * @param terminal - 终端实体
   * @param operatedBy - 操作人
   * @returns 操作结果
   * @throws Error 如果终端不满足操作条件
   */
  async restart485(terminal: TerminalEntity, operatedBy: string = 'system'): Promise<OprateDtuResult> {
    return this.operate(terminal, 'restart485', undefined, operatedBy);
  }

  /**
   * 更新挂载设备配置
   *
   * @param terminal - 终端实体
   * @param content - 配置内容
   * @param operatedBy - 操作人
   * @returns 操作结果
   * @throws Error 如果终端不满足操作条件
   */
  async updateMount(
    terminal: TerminalEntity,
    content: any,
    operatedBy: string = 'system'
  ): Promise<OprateDtuResult> {
    return this.operate(terminal, 'updateMount', content, operatedBy);
  }

  /**
   * 透传自定义指令
   *
   * @param terminal - 终端实体
   * @param content - 指令内容
   * @param operatedBy - 操作人
   * @returns 操作结果
   * @throws Error 如果终端不满足操作条件
   */
  async sendInstruct(
    terminal: TerminalEntity,
    content: any,
    operatedBy: string = 'system'
  ): Promise<OprateDtuResult> {
    return this.operate(terminal, 'OprateInstruct', content, operatedBy);
  }

  /**
   * 设置终端参数
   *
   * @param terminal - 终端实体
   * @param content - 参数内容
   * @param operatedBy - 操作人
   * @returns 操作结果
   * @throws Error 如果终端不满足操作条件
   */
  async setTerminal(
    terminal: TerminalEntity,
    content: any,
    operatedBy: string = 'system'
  ): Promise<OprateDtuResult> {
    return this.operate(terminal, 'setTerminal', content, operatedBy);
  }

  /**
   * 获取终端信息
   *
   * @param terminal - 终端实体
   * @param operatedBy - 操作人
   * @returns 操作结果
   * @throws Error 如果终端不满足操作条件
   */
  async getTerminal(
    terminal: TerminalEntity,
    operatedBy: string = 'system'
  ): Promise<OprateDtuResult> {
    return this.operate(terminal, 'getTerminal', undefined, operatedBy);
  }

  /**
   * 执行 DTU 操作（私有方法）
   *
   * @param terminal - 终端实体
   * @param type - 操作类型
   * @param content - 操作参数
   * @param operatedBy - 操作人
   * @returns 操作结果
   * @throws Error 如果终端不满足操作条件
   */
  private async operate(
    terminal: TerminalEntity,
    type: DtuOperationType,
    content?: any,
    operatedBy: string = 'system'
  ): Promise<OprateDtuResult> {
    // 业务规则验证
    if (!terminal.canOperate()) {
      const errors = terminal.getOperationValidationErrors();
      const errorMsg = `终端 ${terminal.mac} 无法执行操作 ${type}: ${errors.join(', ')}`;
      logger.warn(errorMsg);
      throw new Error(errorMsg);
    }

    // 调用基础设施层
    try {
      logger.debug(`Operating terminal ${terminal.mac}, type: ${type}, by: ${operatedBy}`);

      const result = await socketIoService.OprateDTU(
        terminal.mac,
        type,
        content,
        operatedBy
      );

      if (result.ok === 1) {
        logger.info(`Operation ${type} successful for terminal ${terminal.mac}`);
      } else {
        logger.warn(`Operation ${type} failed for terminal ${terminal.mac}: ${result.msg}`);
      }

      return result;
    } catch (error) {
      logger.error(`Operation ${type} error for terminal ${terminal.mac}:`, error);
      throw error;
    }
  }
}

/**
 * 导出单例实例
 */
export const terminalOperationService = new TerminalOperationService();
