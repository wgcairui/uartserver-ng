/**
 * 协议解析器策略接口
 *
 * 使用策略模式处理不同类型的协议解析 (RS232 vs RS485/Modbus)
 */

import type {
  InstructQueryResult,
  ProtocolInstruct,
  ParsedArgument,
  ParsingContext,
} from '../data-parsing.types';

// 重新导出以简化导入路径
export type { ParsingContext };

/**
 * 协议解析器接口
 */
export interface IProtocolParser {
  /**
   * 解析指令查询结果
   *
   * @param contents 指令查询结果数组
   * @param context 解析上下文
   * @returns 解析后的参数数组
   */
  parse(
    contents: InstructQueryResult[],
    context: ParsingContext
  ): Promise<ParsedArgument[]>;
}
