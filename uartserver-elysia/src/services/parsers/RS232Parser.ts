/**
 * RS232 协议解析器策略
 *
 * 处理 RS232 串口通信的数据解析
 * - UTF8 字符串解析
 * - 支持分割模式 (split) 和切片模式 (slice)
 * - 结束符验证 (\r)
 */

import type {
  IProtocolParser,
  ParsingContext,
} from './IProtocolParser';
import type {
  InstructQueryResult,
  ParsedArgument,
} from '../data-parsing.types';

export class RS232Parser implements IProtocolParser {
  async parse(
    contents: InstructQueryResult[],
    context: ParsingContext
  ): Promise<ParsedArgument[]> {
    const { protocol, protocolInstructMap, stateMapCache } = context;

    // 获取协议指令映射
    const instructMap = protocolInstructMap.get(protocol);
    if (!instructMap) {
      return [];
    }

    // 过滤有效的查询结果
    const filteredItems = contents.filter((el) => {
      // 1. 指令必须在协议中
      if (!instructMap.has(el.content)) {
        return false;
      }

      // 2. 结束符 \r (ASCII 13) 必须只出现一次且在结尾
      const crIndex = el.buffer.data.findIndex((byte) => byte === 13);
      return crIndex === el.buffer.data.length - 1;
    });

    // 解析每个有效的查询结果
    const execItems = await Promise.all(
      filteredItems.map(async (el) => {
        const instructs = instructMap.get(el.content)!;

        // 转换 Buffer 为 UTF8 字符串,裁剪开头和结尾
        const startIdx = instructs.shift ? instructs.shiftNum || 0 : 0;
        const endIdx = instructs.pop
          ? el.buffer.data.length - (instructs.popNum || 0)
          : el.buffer.data.length;

        const parseStr = Buffer.from(el.buffer.data)
          .toString('utf8', startIdx, endIdx)
          .replace(/(#)/g, ''); // 移除 # 符号

        if (instructs.isSplit) {
          // 分割模式: 使用分隔符分割字符串
          const splitStr = instructs.splitStr ?? ' ';
          const parts = parseStr.split(splitStr);

          return await Promise.all(
            instructs.formResize.map(async (field) => {
              const { start } = this.parseRegex(field.regx!);
              const value = parts[start];

              return {
                name: field.name,
                value,
                parseValue: field.isState
                  ? await this.parseUnit(field.unit!, value, stateMapCache)
                  : value,
                unit: field.unit,
                issimulate: field.isState || false,
              } as ParsedArgument;
            })
          );
        } else {
          // 切片模式: 根据起始和结束位置提取
          return await Promise.all(
            instructs.formResize.map(async (field) => {
              const { start, end } = this.parseRegex(field.regx!);
              const value = parseStr.slice(start, end).trim();

              return {
                name: field.name,
                value,
                parseValue: field.isState
                  ? await this.parseUnit(field.unit!, value, stateMapCache)
                  : value,
                unit: field.unit,
                issimulate: field.isState || false,
              } as ParsedArgument;
            })
          );
        }
      })
    );

    // 展平并转换数字字符串
    return execItems.flat().map((item) => {
      if (!item.issimulate && this.isNumberString(item.parseValue)) {
        item.parseValue = parseFloat(item.parseValue).toString();
      }
      return item;
    });
  }

  /**
   * 解析正则表达式格式的索引
   *
   * 重要：老系统使用 1-based 索引（人类友好），需转换为 0-based（数组索引）
   *
   * @param regx 格式: "1" | "1-2" | "1-4-2"
   * @returns { start, end, step }
   *
   * @example
   * "1"     → { start: 0, end: 1, step: 1 }    // 第1个元素
   * "1-2"   → { start: 0, end: 2, step: 2 }    // 第1个元素开始，读2个
   * "3-2"   → { start: 2, end: 4, step: 2 }    // 第3个元素开始，读2个
   * "1-4-2" → { start: 0, end: 4, step: 2 }    // 第1个元素开始，到第4个，步长2
   */
  private parseRegex(regx: string): { start: number; end: number; step: number } {
    const parts = regx.split('-').map((p) => parseInt(p, 10));

    if (parts.length === 1) {
      // 单索引: "1" → start=0, end=1, step=1
      const start = parts[0] - 1; // 1-based → 0-based
      return { start, end: start + 1, step: 1 };
    } else if (parts.length === 2) {
      // 双参数: "1-2" → start=0, end=2, step=2
      const start = parts[0] - 1; // 1-based → 0-based
      const len = parts[1];
      return { start, end: start + len, step: len };
    } else if (parts.length === 3) {
      // 三参数: "1-4-2" → start=0, end=4, step=2 (自定义step)
      const start = parts[0] - 1; // 1-based → 0-based
      const end = parts[1];
      const step = parts[2];
      return { start, end, step };
    }

    return { start: 0, end: 0, step: 0 };
  }

  /**
   * 根据单位映射解析状态值
   *
   * @param unit 单位/状态类型
   * @param value 原始值
   * @param stateMapCache 状态映射缓存
   * @returns 映射后的状态值
   */
  private async parseUnit(
    unit: string,
    value: string,
    stateMapCache: Map<string, Map<string, string>>
  ): Promise<string> {
    const stateMap = stateMapCache.get(unit);
    if (!stateMap) {
      return value;
    }

    return stateMap.get(value) ?? value;
  }

  /**
   * 检查字符串是否为数字格式
   *
   * @param str 待检查的字符串
   * @returns 是否为数字
   */
  private isNumberString(str: string): boolean {
    return /^-?\d+(\.\d+)?$/.test(str);
  }
}
