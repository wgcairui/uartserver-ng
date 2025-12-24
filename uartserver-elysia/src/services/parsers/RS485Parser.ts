/**
 * RS485/Modbus 协议解析器策略
 *
 * 处理 Modbus RTU 协议的数据解析
 * - PID 验证
 * - 功能码匹配
 * - 数据长度校验
 * - 支持多种数据类型: bit2, utf8, hex/short, float
 */

import type {
  IProtocolParser,
  ParsingContext,
} from './IProtocolParser';
import type {
  InstructQueryResult,
  ParsedArgument,
  ProtocolInstruct,
} from '../data-parsing.types';
import { parseCoefficient, hexToSingle } from '../../utils/data-parsing.utils';

export class RS485Parser implements IProtocolParser {
  async parse(
    contents: InstructQueryResult[],
    context: ParsingContext
  ): Promise<ParsedArgument[]> {
    const { protocol, pid, protocolInstructMap, contentToNameMap, stateMapCache } = context;

    if (pid === undefined) {
      console.error('RS485 解析需要 PID');
      return [];
    }

    // 获取协议指令映射
    const instructMap = protocolInstructMap.get(protocol);
    if (!instructMap) {
      console.warn(`协议 ${protocol} 未缓存, 返回空映射表`);
      return [];
    }

    // 过滤有效的查询结果 (仅支持标准 Modbus 协议)
    const resultFilter: InstructQueryResult[] = [];

    await Promise.all(
      contents.map(async (el) => {
        const instructName = contentToNameMap.get(el.content);

        if (!instructName) {
          return; // 指令不在映射表中
        }

        const protocolInstruct = instructMap.get(instructName);
        if (!protocolInstruct) {
          return;
        }

        // 仅支持标准 Modbus 协议
        if (protocolInstruct.noStandard) {
          console.warn(`非标协议暂不支持: ${instructName}`);
          return;
        }

        // 标准 Modbus 协议校验
        const responsePid = el.buffer.data[0];
        // 功能码在 content 的第 2-4 位 (跳过 PID 的前 2 位)
        // content 格式: [PID(2位)] + [功能码(2位)] + [地址+数据] + [CRC(4位)]
        const functionCode = parseInt(el.content.slice(2, 4), 16);
        const resFunctionCode = el.buffer.data[1];
        const resLength = el.buffer.data[2];

        // 验证: PID一致, 功能码一致, 数据长度一致
        if (
          responsePid === pid &&
          resFunctionCode === functionCode &&
          resLength === el.buffer.data.length - 5
        ) {
          resultFilter.push(el);
        }
      })
    );

    // 转换数据类型
    const parseInstructResultType = await Promise.all(
      resultFilter.map(async (el) => {
        const instructName = contentToNameMap.get(el.content)!;
        const instructs = instructMap.get(instructName)!;

        // 裁剪数据 (默认: 跳过前3字节[PID+功能码+长度], 去掉后2字节[CRC])
        const startIdx = instructs.shift ? instructs.shiftNum || 0 : 3;
        const endIdx = instructs.pop
          ? el.buffer.data.length - (instructs.popNum || 0)
          : el.buffer.data.length - 2;

        const data = el.buffer.data.slice(startIdx, endIdx);

        let bufferData: number[] = [];

        switch (instructs.resultType) {
          case 'bit2':
            // 线圈状态: 10进制->2进制,翻转,补0至8位
            bufferData = data
              .map((byte) =>
                byte
                  .toString(2)
                  .padStart(8, '0')
                  .split('')
                  .reverse()
                  .map((bit) => Number(bit))
              )
              .flat();
            break;
          default:
            bufferData = data;
            break;
        }

        return {
          instructName,
          bufferData,
        };
      })
    );

    // 解析数据点
    const resultPromise = parseInstructResultType
      .map(({ instructName, bufferData }) => {
        const instructs = instructMap.get(instructName)!;
        const buffer = Buffer.from(bufferData);

        return instructs.formResize.map(async (field) => {
          const result: ParsedArgument = {
            name: field.name,
            value: '',
            parseValue: '',
            unit: field.unit,
            issimulate: field.isState || false,
          };

          const { start, end, step } = this.parseRegex(field.regx!);

          switch (instructs.resultType) {
            case 'bit2':
              // 布尔值 (线圈状态)
              try {
                result.value =
                  buffer.length > start ? buffer[start].toString() : undefined;
              } catch (error) {
                console.error('bit2 解析错误:', { buffer, start, error });
                result.value = undefined;
              }
              break;

            case 'utf8':
              // ASCII 字符串
              result.value =
                buffer.length >= end
                  ? buffer.slice(start, end).toString('utf8')
                  : undefined;
              break;

            case 'hex':
            case 'short':
              // 整数 (大端序)
              if (buffer.length < end || start < 0) {
                result.value = undefined;
                break;
              }

              try {
                const rawValue = buffer.readIntBE(start, step);
                const coefficient = field.bl || '1';
                const convertedValue = parseCoefficient(coefficient, rawValue);

                // 当应用了系数（非 "1"）时，保持小数格式以表明这是缩放后的值
                result.value =
                  typeof convertedValue === 'string'
                    ? convertedValue
                    : coefficient !== '1'
                    ? convertedValue.toFixed(1)
                    : Number.isInteger(convertedValue)
                    ? convertedValue.toString()
                    : convertedValue.toFixed(1);
              } catch (error) {
                console.error('整数解析错误:', {
                  start,
                  step,
                  buffer,
                  error,
                });
                result.value = undefined;
              }
              break;

            case 'float':
              // IEEE 754 单精度浮点数
              result.value = hexToSingle(buffer.slice(start, end)).toFixed(2);
              break;
          }

          // 应用状态映射
          if (result.value) {
            result.parseValue = result.issimulate
              ? await this.parseUnit(result.unit!, result.value, stateMapCache)
              : result.value;
          }

          return result;
        });
      })
      .flat();

    const result = await Promise.all(resultPromise);
    return result;
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
   * "1"     → { start: 0, end: 1, step: 1 }    // 第1个字节
   * "1-2"   → { start: 0, end: 2, step: 2 }    // 第1个字节开始，读2字节
   * "3-2"   → { start: 2, end: 4, step: 2 }    // 第3个字节开始，读2字节
   * "1-4-2" → { start: 0, end: 4, step: 2 }    // 第1个字节开始，到第4个，步长2
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
}
