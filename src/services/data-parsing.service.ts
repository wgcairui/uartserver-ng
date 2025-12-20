/**
 * Data Parsing Service
 *
 * 负责解析设备查询结果数据：
 * - RS232 协议解析 (使用 RS232Parser 策略)
 * - RS485/Modbus 协议解析 (使用 RS485Parser 策略)
 * - 数据类型转换 (bit2, utf8, hex/short, float)
 * - 数据验证和质量评分
 */

import type { IProtocolParser, ParsingContext } from './parsers';
import { RS232Parser, RS485Parser } from './parsers';
import type {
  QueryResult,
  ProtocolInstruct,
  ParsedArgument,
} from './data-parsing.types';

// 重新导出类型以保持向后兼容
export type {
  InstructQueryResult,
  QueryResult,
  ProtocolInstruct,
  FormResize,
  ParsedArgument,
} from './data-parsing.types';

/**
 * Data Parsing Service
 *
 * 使用策略模式处理不同协议类型的解析
 */
export class DataParsingService {
  /**
   * 协议指令缓存
   * 键: 协议名称
   * 值: Map<指令名称, 指令配置>
   */
  private protocolInstructCache: Map<string, Map<string, ProtocolInstruct>> = new Map();

  /**
   * 指令内容到指令名称的映射
   * 键: 指令内容 (十六进制字符串,如 "0300010002")
   * 值: 指令名称
   */
  private contentToNameCache: Map<string, string> = new Map();

  /**
   * 状态映射表缓存
   * 键: 单位名称
   * 值: Map<状态值, 状态描述>
   */
  private stateMapCache: Map<string, Map<string, string>> = new Map();

  /**
   * 解析器策略映射
   * 键: 通讯类型 (232 或 485)
   * 值: 对应的解析器策略实例
   */
  private parsers: Map<232 | 485, IProtocolParser>;

  constructor() {
    // 初始化解析器策略
    this.parsers = new Map([
      [232, new RS232Parser()],
      [485, new RS485Parser()],
    ]);
  }

  /**
   * 解析查询结果 (主入口)
   *
   * 使用策略模式根据通讯类型选择对应的解析器
   *
   * @param queryResult - 查询结果
   * @returns 解析后的数据点数组
   */
  async parse(queryResult: QueryResult): Promise<ParsedArgument[]> {
    const { type, contents, protocol, pid } = queryResult;

    // 获取对应的解析器策略
    const parser = this.parsers.get(type);
    if (!parser) {
      console.error(`不支持的通讯类型: ${type}`);
      return [];
    }

    // 构建解析上下文
    const context: ParsingContext = {
      protocol,
      pid,
      protocolInstructMap: this.protocolInstructCache,
      contentToNameMap: this.contentToNameCache,
      stateMapCache: this.stateMapCache,
    };

    // 使用策略执行解析
    const result = await parser.parse(contents, context);

    // 过滤掉状态值但没有映射的数据点
    return result.filter((el) => !el.issimulate || el.parseValue);
  }


  /**
   * 设置协议指令缓存 (用于测试或手动配置)
   *
   * @param protocolName - 协议名称
   * @param instructMap - 指令映射表
   */
  public setProtocolInstruct(
    protocolName: string,
    instructMap: Map<string, ProtocolInstruct>
  ): void {
    this.protocolInstructCache.set(protocolName, instructMap);
  }

  /**
   * 设置指令内容到名称的映射 (用于测试或手动配置)
   *
   * @param content - 指令内容
   * @param name - 指令名称
   */
  public setContentToName(content: string, name: string): void {
    this.contentToNameCache.set(content, name);
  }

  /**
   * 设置状态映射表 (用于测试或手动配置)
   *
   * @param unitName - 单位名称
   * @param stateMap - 状态映射表
   */
  public setStateMap(unitName: string, stateMap: Map<string, string>): void {
    this.stateMapCache.set(unitName, stateMap);
  }
}
