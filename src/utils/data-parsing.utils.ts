/**
 * 数据解析工具函数
 *
 * 提供 Modbus CRC16 校验、IEEE 754 浮点数转换等功能
 */

import { crc16modbus } from 'crc';

/**
 * 生成 Modbus CRC16 校验码
 *
 * @param address PID (设备地址)
 * @param instruct 指令 (十六进制字符串，不含 PID)
 * @returns 完整指令 (PID + 指令 + CRC16，CRC 字节翻转)
 *
 * @example
 * ```typescript
 * const result = crc16Modbus(1, '0300010002');
 * // result: '010300010002c40b' (PID=01, Instruct=0300010002, CRC=c40b)
 * ```
 */
export function crc16Modbus(address: number, instruct: string): string {
  // 拼接 PID + 指令
  const body = address.toString(16).padStart(2, '0') + instruct;

  // 计算 CRC16
  const crc = crc16modbus(Buffer.from(body, 'hex'))
    .toString(16)
    .padStart(4, '0');

  // CRC 字节翻转: ABCD -> CDAB
  const [a, b, c, d] = [...crc];

  return body + c + d + a + b;
}

/**
 * 十六进制 Buffer 转 IEEE 754 单精度浮点数
 *
 * IEEE 754 单精度格式 (32位):
 * - 符号位 (1位): 0=正数, 1=负数
 * - 指数位 (8位): 偏移 127
 * - 尾数位 (23位): 隐含前导 1
 *
 * @param buffer 4 字节 Buffer (大端序)
 * @returns 单精度浮点数
 *
 * @example
 * ```typescript
 * const buf = Buffer.from([0x42, 0x48, 0x00, 0x00]); // 50.0
 * const value = hexToSingle(buf);
 * // value: 50.0
 * ```
 */
export function hexToSingle(buffer: Buffer = Buffer.from([0, 0, 0, 0])): number {
  // 验证长度
  if (buffer.byteLength !== 4) {
    return 0;
  }

  // 转换为 32 位二进制字符串
  const hexString = buffer.toString('hex');
  const decimal = parseInt(hexString, 16);
  const binary = decimal.toString(2).padStart(32, '0');

  // 提取各部分
  const sign = binary.substring(0, 1); // 符号位
  const exponent = binary.substring(1, 9); // 指数位
  let mantissa = binary.substring(9); // 尾数位

  // 计算指数 (偏移量 127)
  const exponentValue = parseInt(exponent, 2) - 127;

  // 添加隐含的前导 1
  mantissa = '1' + mantissa;

  // 根据指数调整小数点位置
  if (exponentValue >= 0) {
    // 指数为正: 右移小数点
    const integerPart = mantissa.substring(0, exponentValue + 1);
    const fractionalPart = mantissa.substring(exponentValue + 1);
    mantissa = integerPart + '.' + fractionalPart;
  } else {
    // 指数为负: 左移小数点,前补 0
    mantissa = '0.' + '0'.repeat(-exponentValue - 1) + mantissa;
  }

  // 确保有小数点
  if (!mantissa.includes('.')) {
    mantissa = mantissa + '.0';
  }

  // 分割整数和小数部分
  const [integerStr, fractionalStr] = mantissa.split('.');

  // 转换整数部分
  const integerPart = parseInt(integerStr, 2);

  // 转换小数部分
  let fractionalPart = 0;
  for (let i = 0; i < fractionalStr.length; i++) {
    fractionalPart += parseInt(fractionalStr.charAt(i)) * Math.pow(2, -(i + 1));
  }

  // 合并整数和小数部分
  let result = integerPart + fractionalPart;

  // 应用符号
  if (parseInt(sign) === 1) {
    result = -result;
  }

  return parseFloat(result.toFixed(2));
}

/**
 * 单精度浮点数转 IEEE 754 十六进制 Buffer
 *
 * @param value 浮点数
 * @returns 4 字节 Buffer (大端序)
 *
 * @example
 * ```typescript
 * const buf = singleToHex(50.0);
 * // buf: Buffer<42 48 00 00>
 * ```
 */
export function singleToHex(value: number = 0): Buffer {
  if (value === 0) {
    return Buffer.from('00000000', 'hex');
  }

  let sign: number;
  let exponent: number;
  let mantissa: string;

  // 确定符号
  if (value > 0) {
    sign = 0;
  } else {
    sign = 1;
    value = -value;
  }

  // 转换为二进制
  mantissa = value.toString(2);

  // 计算指数
  if (parseInt(mantissa) >= 1) {
    if (!mantissa.includes('.')) {
      mantissa = mantissa + '.0';
    }
    exponent = mantissa.indexOf('.') - 1;
  } else {
    exponent = 1 - mantissa.indexOf('1');
  }

  // 调整尾数
  if (exponent >= 0) {
    mantissa = mantissa.replace('.', '');
  } else {
    mantissa = mantissa.substring(mantissa.indexOf('1'));
  }

  // 截取或补齐至 24 位 (含隐含的前导 1)
  if (mantissa.length > 24) {
    mantissa = mantissa.substring(0, 24);
  } else {
    mantissa = mantissa.padEnd(24, '0');
  }

  // 移除隐含的前导 1
  mantissa = mantissa.substring(1);

  // 计算带偏移的指数
  const exponentBinary = (exponent + 127).toString(2).padStart(8, '0');

  // 组合 IEEE 754 格式
  const ieee754Binary = sign + exponentBinary + mantissa;
  const ieee754Hex = parseInt(ieee754Binary, 2)
    .toString(16)
    .padStart(8, '0');

  return Buffer.from(ieee754Hex, 'hex');
}

/**
 * 应用系数转换 (仅支持数字系数)
 *
 * 注意: 旧系统支持函数表达式,但因安全考虑暂不实现
 * 如需函数表达式支持,请使用预定义的转换函数映射
 *
 * @param coefficient 系数字符串 (数字)
 * @param value 原始值
 * @returns 转换后的值
 *
 * @example
 * ```typescript
 * parseCoefficient('0.1', 100);  // 10
 * parseCoefficient('2', 50);     // 100
 * ```
 */
export function parseCoefficient(
  coefficient: string,
  value: number
): number {
  // 仅支持数字系数
  const numCoefficient = Number(coefficient);
  if (!isNaN(numCoefficient)) {
    return numCoefficient * value;
  }

  // 不支持函数表达式,返回原值
  console.warn(`不支持的系数格式: ${coefficient}, 返回原值`);
  return value;
}

/**
 * 填充字符串至指定长度
 *
 * @param text 原始字符串
 * @param fillChar 填充字符 (单个字符)
 * @param targetLength 目标长度
 * @param prepend true=前补齐, false=后补齐
 * @returns 填充后的字符串
 *
 * @example
 * ```typescript
 * fillString('abc', '0', 5, true);   // '00abc'
 * fillString('abc', '0', 5, false);  // 'abc00'
 * ```
 */
export function fillString(
  text: string,
  fillChar: string,
  targetLength: number,
  prepend: boolean
): string {
  if (text === '' || fillChar.length !== 1 || targetLength <= text.length) {
    return text;
  }

  const fillCount = targetLength - text.length;
  const padding = fillChar.repeat(fillCount);

  return prepend ? padding + text : text + padding;
}

/**
 * 整数转高低字节数组 (16位有符号整数)
 *
 * @param value 整数值 (-32768 ~ 32767)
 * @returns 2 字节数组 (大端序)
 *
 * @example
 * ```typescript
 * value2BytesInt16(1000);  // [0x03, 0xE8]
 * value2BytesInt16(-1000); // [0xFC, 0x18]
 * ```
 */
export function value2BytesInt16(value: number = 0): number[] {
  const buffer = Buffer.alloc(2);
  buffer.writeInt16BE(value, 0);
  return Array.from(buffer);
}
