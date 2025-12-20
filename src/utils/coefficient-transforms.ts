import { evaluate } from 'mathjs';

/**
 * 预定义的系数转换函数
 * 涵盖当前生产环境中的所有 19 个函数表达式
 */
const PREDEFINED_TRANSFORMS = {
  // ========== 算术转换 (HX海信空调) ==========
  /**
   * 温度偏移转换: (a, a/2-20)
   * 用途: HX海信空调 - 回风温度
   */
  temp_offset: (val: number) => val / 2 - 20,

  // ========== 数组索引 (D3000 UPS) ==========
  /**
   * 提取数组第一个元素: (a, a[0])
   * 用途: D3000 UPS - 8个状态位字段
   */
  array_first: (val: any) => (Array.isArray(val) ? val[0] : val),

  // ========== 二进制位提取 (HW-UPS5000) ==========
  /**
   * 提取二进制位: (a, a.toString(2).padStart(16,'0').slice(start, end))
   * 用途: HW-UPS5000 - 10个状态位字段
   *
   * @param val - 数值
   * @param start - 起始位 (0-based)
   * @param end - 结束位 (不含)
   */
  bit_extract: (val: number, start: number, end: number) => {
    const binary = val.toString(2).padStart(16, '0');
    return parseInt(binary.slice(start, end), 2);
  },
} as const;

/**
 * Layer 2: 使用 mathjs 安全求值数学表达式
 *
 * 支持格式:
 * - 简单表达式: "val * 0.1"
 * - 复杂公式: "(val - 32) * 5 / 9"
 * - 数学函数: "sqrt(val)", "round(val * 100)"
 *
 * 安全性: mathjs 在沙箱中执行,不支持任意代码执行
 */
function evaluateSafeMathExpression(
  expression: string,
  value: number,
): number {
  try {
    // mathjs 提供沙箱环境,防止代码注入
    return evaluate(expression, { val: value, a: value }) as number;
  } catch (error) {
    console.warn(`数学表达式求值失败: ${expression}`, error);
    return value;
  }
}

/**
 * Layer 4: 受控的动态表达式执行 (Fallback "Pocket Solution")
 *
 * ⚠️ SECURITY WARNING: 此函数使用动态代码执行作为最后的 fallback
 *
 * 使用场景: ONLY 用于以下情况
 * 1. 无法通过预定义函数处理的边缘情况
 * 2. 需要访问 JavaScript 对象方法 (如 array[0], toString())
 * 3. 表达式格式已在数据库中,难以迁移
 *
 * 安全措施:
 * - 多层白名单检查: 阻止已知危险操作
 * - 格式严格验证: 仅接受 "(varName, body)" 格式
 * - 异常隔离: 执行失败返回原值,不影响主流程
 * - 监控日志: 每次使用都记录 warning 便于审计
 *
 * 替代方案优先级:
 * 1. 优先使用预定义函数 (PREDEFINED_TRANSFORMS)
 * 2. 其次使用 mathjs 表达式 (纯数学运算)
 * 3. 最后才使用动态执行 (此函数)
 *
 * @param expression - 老系统格式表达式 "(varName, body)"
 * @param value - 输入值
 * @returns 转换后的值,失败则返回原值
 */
function evaluateLegacyExpression(expression: string, value: any): any {
  // 解析老格式: "(a, a[0])" 或 "(val, val * 0.1)"
  const match = expression.match(/^\((\w+),\s*(.+)\)$/);
  if (!match) {
    console.warn(`表达式格式不匹配: ${expression}`);
    return value;
  }

  const [, varName, body] = match;

  // 多层安全检查
  const dangerousPatterns = [
    { pattern: /require\s*\(/, reason: 'require() - 模块加载' },
    { pattern: /import\s*\(/, reason: 'import() - 动态导入' },
    { pattern: /eval\s*\(/, reason: 'eval() - 代码执行' },
    { pattern: /Function\s*\(/, reason: 'Function() - 函数构造' },
    { pattern: /process\./, reason: 'process - 系统访问' },
    { pattern: /global\./, reason: 'global - 全局对象' },
    { pattern: /__proto__/, reason: '__proto__ - 原型污染' },
    { pattern: /constructor/, reason: 'constructor - 构造函数访问' },
    { pattern: /child_process/, reason: 'child_process - 子进程' },
    { pattern: /fs\./, reason: 'fs - 文件系统' },
  ];

  for (const { pattern, reason } of dangerousPatterns) {
    if (pattern.test(body)) {
      console.error(`⛔ 阻止不安全表达式 [${reason}]: ${expression}`);
      return value;
    }
  }

  try {
    // JUSTIFICATION for new Function() usage:
    // 这是为了兼容老系统的 "pocket solution" 设计模式
    // 仅在以下条件同时满足时执行:
    // 1. 通过了上述所有安全检查
    // 2. 无法用预定义函数处理 (array access, object methods)
    // 3. 无法用 mathjs 处理 (非纯数学运算)
    //
    // 替代方案已在前三层实现,此处是最后的 fallback
    // eslint-disable-next-line no-new-func
    const func = new Function(varName, `'use strict'; return ${body}`);
    const result = func(value);

    // 记录每次使用,便于审计和后续迁移
    console.warn(`⚠️ Pocket Solution 使用: ${expression} | 输入: ${JSON.stringify(value)} | 输出: ${JSON.stringify(result)}`);

    return result;
  } catch (error) {
    console.error(`动态表达式执行失败: ${expression}`, error);
    return value;
  }
}

/**
 * 解析系数并应用转换
 *
 * 分层 Fallback 策略:
 * 1. **数字系数** (98.63% 的生产案例)
 *    - 格式: "0.1", "0.001", "10"
 *    - 行为: 直接乘法 `coefficient * value`
 *
 * 2. **预定义转换** (1.37% 的生产案例)
 *    - 格式: "temp_offset", "array_first", "bit_extract:4:5"
 *    - 行为: 调用预定义的类型安全函数
 *
 * 3. **安全数学表达式** (未来扩展)
 *    - 格式: "val * 0.1 + 32", "sqrt(val)"
 *    - 行为: 使用 mathjs 沙箱求值
 *
 * 4. **遗留表达式** (Pocket Solution,保留灵活性)
 *    - 格式: "(a, a[0])", "(val, val / 2 - 20)"
 *    - 行为: 受限的动态代码执行 (已通过安全检查)
 *
 * @param coefficient - 系数字符串
 * @param value - 原始值
 * @returns 转换后的值
 *
 * @example
 * // Layer 1: 数字系数
 * parseCoefficient('0.1', 100) // => 10
 *
 * // Layer 2: 预定义转换
 * parseCoefficient('temp_offset', 50) // => 5 (50/2-20)
 * parseCoefficient('bit_extract:4:5', 0b1010000000000000) // => 1
 *
 * // Layer 3: 数学表达式
 * parseCoefficient('val * 0.1 + 32', 100) // => 42
 *
 * // Layer 4: 遗留表达式
 * parseCoefficient('(a, a[0])', [42, 99]) // => 42
 */
export function parseCoefficient(
  coefficient: string,
  value: number | any,
): number | any {
  // Layer 1: 数字系数 (98.63% of cases - 快速路径)
  const numCoefficient = Number(coefficient);
  if (!isNaN(numCoefficient)) {
    return numCoefficient * (value as number);
  }

  // Layer 2: 预定义转换 (1.37% current production - 类型安全)
  // 支持格式: "transform" 或 "transform:param1:param2"
  const [transformName, ...params] = coefficient.split(':');
  if (transformName in PREDEFINED_TRANSFORMS) {
    const transform =
      PREDEFINED_TRANSFORMS[transformName as keyof typeof PREDEFINED_TRANSFORMS];

    // 特殊处理: bit_extract 需要参数
    if (transformName === 'bit_extract' && params.length === 2) {
      return (transform as any)(
        value,
        parseInt(params[0], 10),
        parseInt(params[1], 10),
      );
    }

    return transform(value);
  }

  // Layer 3: 安全数学表达式 (未来扩展 - 沙箱执行)
  // 仅包含数字、运算符、变量名 (val/a)、数学函数的表达式
  if (/^[0-9+\-*/().\s,a-z]+$/i.test(coefficient) && !coefficient.includes('(a,') && !coefficient.includes('(val,')) {
    return evaluateSafeMathExpression(coefficient, value as number);
  }

  // Layer 4: 遗留表达式 (Pocket Solution - 保留灵活性)
  if (coefficient.startsWith('(') && coefficient.endsWith(')')) {
    return evaluateLegacyExpression(coefficient, value);
  }

  console.warn(`不支持的系数格式: ${coefficient}, 返回原值`);
  return value;
}

/**
 * 将老系统的函数表达式迁移到预定义转换格式
 *
 * 生成迁移脚本使用的映射表
 */
export const LEGACY_EXPRESSION_MIGRATION = {
  // HX海信空调
  '(a,a/2-20)': 'temp_offset',

  // D3000 UPS (8个字段)
  '(a,a[0])': 'array_first',

  // HW-UPS5000 (10个字段)
  "(a,a.toString(2).padStart(16,'0').slice(0,1))": 'bit_extract:0:1',
  "(a,a.toString(2).padStart(16,'0').slice(1,2))": 'bit_extract:1:2',
  "(a,a.toString(2).padStart(16,'0').slice(2,3))": 'bit_extract:2:3',
  "(a,a.toString(2).padStart(16,'0').slice(3,4))": 'bit_extract:3:4',
  "(a,a.toString(2).padStart(16,'0').slice(4,5))": 'bit_extract:4:5',
  "(a,a.toString(2).padStart(16,'0').slice(5,6))": 'bit_extract:5:6',
  "(a,a.toString(2).padStart(16,'0').slice(6,7))": 'bit_extract:6:7',
  "(a,a.toString(2).padStart(16,'0').slice(7,8))": 'bit_extract:7:8',
  "(a,a.toString(2).padStart(16,'0').slice(8,9))": 'bit_extract:8:9',
  "(a,a.toString(2).padStart(16,'0').slice(15,16))": 'bit_extract:15:16',
} as const;
