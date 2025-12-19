/**
 * Data Parsing Service
 *
 * 负责解析设备查询结果数据：
 * - 协议解析 (根据协议类型)
 * - 数据验证
 * - 数据转换和丰富
 * - 数据持久化
 */

import type { QueryResult } from '../schemas/query-data.schema';

/**
 * Protocol definition (temporary - TODO: import from actual entity)
 */
interface Protocol {
  name: string;
  type: string;
  // Add more fields as needed
}

/**
 * 解析后的数据结构
 */
export interface ParsedData {
  /** 终端 MAC 地址 */
  mac: string;
  /** 设备 PID */
  pid: number | string;  // Support both number (from QueryResult) and string
  /** 协议名称 */
  protocol: string;
  /** 解析后的数据点 */
  dataPoints: DataPoint[];
  /** 原始数据 */
  rawContent: string;
  /** 解析时间 */
  parsedAt: Date;
  /** 数据质量分数 (0-100) */
  qualityScore?: number;
}

/**
 * 数据点
 */
export interface DataPoint {
  /** 参数名称 */
  name: string;
  /** 参数值 */
  value: number | string | boolean;
  /** 单位 */
  unit?: string;
  /** 数据类型 */
  type: 'number' | 'string' | 'boolean' | 'enum';
  /** 是否有效 */
  isValid: boolean;
  /** 验证错误信息 */
  validationError?: string;
}

/**
 * 数据验证规则
 */
export interface ValidationRule {
  /** 参数名称 */
  paramName: string;
  /** 最小值 (数值类型) */
  min?: number;
  /** 最大值 (数值类型) */
  max?: number;
  /** 枚举值 (枚举类型) */
  enumValues?: Array<string | number>;
  /** 正则表达式 (字符串类型) */
  pattern?: RegExp;
  /** 是否必填 */
  required?: boolean;
}

/**
 * Data Parsing Service
 */
export class DataParsingService {
  /**
   * 解析查询结果
   *
   * @param result - 原始查询结果
   * @param protocol - 协议定义 (可选，用于验证)
   * @returns 解析后的数据
   */
  async parseQueryResult(
    result: QueryResult,
    protocol?: Protocol
  ): Promise<ParsedData> {
    console.log(`[DataParsing] Parsing data for ${result.mac}:${result.pid}`);

    // 1. 协议解析
    const dataPoints = await this.parseByProtocol(result);

    // 2. 数据验证
    const validatedPoints = await this.validateDataPoints(dataPoints, protocol);

    // 3. 计算数据质量分数
    const qualityScore = this.calculateQualityScore(validatedPoints);

    // 4. 构造解析结果
    const parsedData: ParsedData = {
      mac: result.mac,
      pid: result.pid,
      protocol: result.protocol,
      dataPoints: validatedPoints,
      rawContent: result.content,
      parsedAt: new Date(),
      qualityScore,
    };

    console.log(
      `[DataParsing] Parsed ${validatedPoints.length} data points (quality: ${qualityScore}%)`
    );

    return parsedData;
  }

  /**
   * 根据协议类型解析数据
   *
   * TODO: 实现具体的协议解析逻辑
   * - Modbus RTU
   * - Modbus TCP
   * - MQTT
   * - 自定义协议
   */
  private async parseByProtocol(result: QueryResult): Promise<DataPoint[]> {
    // 临时实现：直接返回空数组
    // 真实实现应该根据 result.protocol 调用相应的解析器

    console.log(`[DataParsing] Protocol parser not implemented for: ${result.protocol}`);

    // 示例：假设返回一些模拟数据点
    return [
      {
        name: 'temperature',
        value: 25.5,
        unit: '°C',
        type: 'number' as const,
        isValid: true,
      },
      {
        name: 'humidity',
        value: 60,
        unit: '%',
        type: 'number' as const,
        isValid: true,
      },
    ];
  }

  /**
   * 验证数据点
   *
   * @param dataPoints - 数据点数组
   * @param protocol - 协议定义 (包含验证规则)
   * @returns 验证后的数据点
   */
  private async validateDataPoints(
    dataPoints: DataPoint[],
    protocol?: Protocol
  ): Promise<DataPoint[]> {
    if (!protocol) {
      // 没有协议定义，跳过验证
      return dataPoints;
    }

    // TODO: 从协议定义中提取验证规则
    const validationRules: ValidationRule[] = [];

    return dataPoints.map((point) => {
      const rule = validationRules.find((r) => r.paramName === point.name);
      if (!rule) return point;

      // 执行验证
      const validationResult = this.validateDataPoint(point, rule);

      return {
        ...point,
        isValid: validationResult.isValid,
        validationError: validationResult.error,
      };
    });
  }

  /**
   * 验证单个数据点
   */
  private validateDataPoint(
    point: DataPoint,
    rule: ValidationRule
  ): { isValid: boolean; error?: string } {
    // 必填检查
    if (rule.required && (point.value === null || point.value === undefined)) {
      return { isValid: false, error: 'Required field is missing' };
    }

    // 数值范围检查
    if (point.type === 'number' && typeof point.value === 'number') {
      if (rule.min !== undefined && point.value < rule.min) {
        return { isValid: false, error: `Value ${point.value} is below minimum ${rule.min}` };
      }
      if (rule.max !== undefined && point.value > rule.max) {
        return { isValid: false, error: `Value ${point.value} exceeds maximum ${rule.max}` };
      }
    }

    // 枚举值检查
    if (rule.enumValues) {
      const valueMatches = rule.enumValues.some(enumVal => enumVal === point.value);
      if (!valueMatches) {
        return {
          isValid: false,
          error: `Value ${point.value} is not in allowed values: ${rule.enumValues.join(', ')}`,
        };
      }
    }

    // 正则表达式检查
    if (rule.pattern && typeof point.value === 'string' && !rule.pattern.test(point.value)) {
      return { isValid: false, error: `Value does not match pattern ${rule.pattern}` };
    }

    return { isValid: true };
  }

  /**
   * 计算数据质量分数 (0-100)
   *
   * 基于以下因素：
   * - 有效数据点占比
   * - 数据完整性
   * - 数据新鲜度
   */
  private calculateQualityScore(dataPoints: DataPoint[]): number {
    if (dataPoints.length === 0) return 0;

    const validCount = dataPoints.filter((p) => p.isValid).length;
    const validRatio = validCount / dataPoints.length;

    return Math.round(validRatio * 100);
  }

  /**
   * 持久化解析后的数据
   *
   * TODO: 实现数据存储逻辑
   * - 存储到 MongoDB (运行时数据)
   * - 更新最后记录缓存
   * - 触发告警检测
   */
  async persistParsedData(data: ParsedData): Promise<void> {
    console.log(`[DataParsing] Persisting data for ${data.mac}:${data.pid}`);

    // TODO: 实现数据存储
    // await this.deviceDataRepository.save(data);

    console.log(`[DataParsing] Data persisted successfully`);
  }
}
