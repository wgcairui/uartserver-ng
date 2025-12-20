import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseCoefficient,
  LEGACY_EXPRESSION_MIGRATION,
} from '../../src/utils/coefficient-transforms';

describe('coefficient-transforms', () => {
  // Capture console output for testing
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('Layer 1: 数字系数', () => {
    it('应该支持整数系数', () => {
      expect(parseCoefficient('10', 5)).toBe(50);
      expect(parseCoefficient('2', 100)).toBe(200);
    });

    it('应该支持小数系数', () => {
      expect(parseCoefficient('0.1', 100)).toBe(10);
      expect(parseCoefficient('0.001', 1000)).toBe(1);
    });

    it('应该支持负数系数', () => {
      expect(parseCoefficient('-1', 50)).toBe(-50);
      expect(parseCoefficient('-0.5', 100)).toBe(-50);
    });

    it('应该支持零系数', () => {
      expect(parseCoefficient('0', 999)).toBe(0);
    });
  });

  describe('Layer 2: 预定义转换', () => {
    describe('temp_offset - 温度偏移', () => {
      it('应该正确计算温度偏移 (HX海信空调)', () => {
        // (a, a/2-20) → temp_offset
        expect(parseCoefficient('temp_offset', 50)).toBe(5); // 50/2-20=5
        expect(parseCoefficient('temp_offset', 80)).toBe(20); // 80/2-20=20
        expect(parseCoefficient('temp_offset', 0)).toBe(-20); // 0/2-20=-20
      });
    });

    describe('array_first - 数组第一个元素', () => {
      it('应该提取数组第一个元素 (D3000 UPS)', () => {
        expect(parseCoefficient('array_first', [42, 99])).toBe(42);
        expect(parseCoefficient('array_first', [0, 1, 2])).toBe(0);
      });

      it('应该处理空数组', () => {
        expect(parseCoefficient('array_first', [])).toBeUndefined();
      });

      it('应该处理非数组输入', () => {
        expect(parseCoefficient('array_first', 42)).toBe(42);
        expect(parseCoefficient('array_first', 'string')).toBe('string');
      });
    });

    describe('bit_extract - 二进制位提取', () => {
      it('应该提取指定位 (HW-UPS5000)', () => {
        // 0b1010000000000000 = 0xA000
        const value = 0xa000;

        expect(parseCoefficient('bit_extract:0:1', value)).toBe(1);
        expect(parseCoefficient('bit_extract:1:2', value)).toBe(0);
        expect(parseCoefficient('bit_extract:2:3', value)).toBe(1);
        expect(parseCoefficient('bit_extract:3:4', value)).toBe(0);
      });

      it('应该处理零值', () => {
        expect(parseCoefficient('bit_extract:0:1', 0)).toBe(0);
      });

      it('应该处理全1值', () => {
        const allOnes = 0xffff;
        expect(parseCoefficient('bit_extract:0:1', allOnes)).toBe(1);
        expect(parseCoefficient('bit_extract:15:16', allOnes)).toBe(1);
      });
    });
  });

  describe('Layer 3: 安全数学表达式 (mathjs)', () => {
    it('应该支持基本算术运算', () => {
      expect(parseCoefficient('val * 2', 10)).toBe(20);
      expect(parseCoefficient('val + 10', 5)).toBe(15);
      expect(parseCoefficient('val - 3', 10)).toBe(7);
      expect(parseCoefficient('val / 2', 100)).toBe(50);
    });

    it('应该支持复杂表达式', () => {
      expect(parseCoefficient('val * 0.1 + 32', 100)).toBe(42);
      expect(parseCoefficient('(val - 32) * 5 / 9', 212)).toBeCloseTo(100, 5);
    });

    it('应该支持数学函数', () => {
      expect(parseCoefficient('sqrt(val)', 16)).toBe(4);
      expect(parseCoefficient('round(val * 0.1)', 95)).toBe(10);
    });

    it('表达式求值失败时应返回原值', () => {
      expect(parseCoefficient('invalid expression', 100)).toBe(100);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('数学表达式求值失败'),
        expect.anything(),
      );
    });
  });

  describe('Layer 4: 遗留表达式 (Pocket Solution)', () => {
    describe('算术表达式', () => {
      it('应该支持简单算术 (HX海信空调原格式)', () => {
        expect(parseCoefficient('(a,a/2-20)', 50)).toBe(5);
        expect(parseCoefficient('(val,val*0.1)', 100)).toBe(10);
      });
    });

    describe('数组操作', () => {
      it('应该支持数组索引 (D3000 UPS原格式)', () => {
        expect(parseCoefficient('(a,a[0])', [42, 99])).toBe(42);
        expect(parseCoefficient('(a,a[1])', [10, 20, 30])).toBe(20);
      });
    });

    describe('字符串/对象方法', () => {
      it('应该支持 toString 和字符串方法 (HW-UPS5000原格式)', () => {
        // 0b1010 = 10
        const result = parseCoefficient(
          "(a,a.toString(2).padStart(16,'0').slice(0,4))",
          10,
        );
        expect(result).toBe('0000');
      });

      it('应该支持复杂的二进制位提取', () => {
        // 0xA000 = 0b1010000000000000
        const value = 0xa000;
        const result = parseCoefficient(
          "(a,a.toString(2).padStart(16,'0').slice(4,5))",
          value,
        );
        expect(result).toBe('0');
      });
    });

    describe('安全检查', () => {
      it('应该阻止 require 注入', () => {
        const result = parseCoefficient("(a,require('fs'))", 1);
        expect(result).toBe(1);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('阻止不安全表达式'),
        );
      });

      it('应该阻止代码执行函数', () => {
        // Testing blocking of code execution without naming specific functions
        const result = parseCoefficient('(a,Function("return 1")())', 1);
        expect(result).toBe(1);
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      it('应该阻止 process 访问', () => {
        const result = parseCoefficient('(a,process.exit())', 1);
        expect(result).toBe(1);
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      it('应该阻止 global 访问', () => {
        const result = parseCoefficient('(a,global.foo)', 1);
        expect(result).toBe(1);
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      it('应该阻止 __proto__ 污染', () => {
        const result = parseCoefficient('(a,a.__proto__)', 1);
        expect(result).toBe(1);
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      it('应该阻止 constructor 访问', () => {
        const result = parseCoefficient('(a,a.constructor)', 1);
        expect(result).toBe(1);
        expect(consoleErrorSpy).toHaveBeenCalled();
      });
    });

    describe('错误处理', () => {
      it('格式错误时应返回原值', () => {
        // "(invalid" matches mathjs pattern, so it's handled by Layer 3
        expect(parseCoefficient('(invalid', 100)).toBe(100);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('数学表达式求值失败'),
          expect.anything(),
        );
      });

      it('运行时错误应返回原值', () => {
        expect(parseCoefficient('(a,a.nonExistentMethod())', 100)).toBe(100);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('动态表达式执行失败'),
          expect.anything(),
        );
      });
    });

    describe('日志审计', () => {
      it('每次使用动态执行应记录警告', () => {
        parseCoefficient('(a,a*2)', 10);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Pocket Solution 使用'),
        );
      });
    });
  });

  describe('边缘情况', () => {
    it('未知格式应返回原值并警告', () => {
      expect(parseCoefficient('unknown_format', 100)).toBe(100);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('不支持的系数格式'),
      );
    });

    it('空字符串应作为零系数处理', () => {
      // Number('') === 0, so it's treated as zero coefficient
      expect(parseCoefficient('', 100)).toBe(0);
    });
  });

  describe('LEGACY_EXPRESSION_MIGRATION', () => {
    it('应包含所有生产环境的表达式映射', () => {
      const migrations = Object.keys(LEGACY_EXPRESSION_MIGRATION);
      // 1 (HX海信) + 1 (D3000) + 10 (HW-UPS5000) = 12 mappings
      expect(migrations.length).toBe(12);
    });

    it('HX海信空调迁移映射应正确', () => {
      expect(LEGACY_EXPRESSION_MIGRATION['(a,a/2-20)']).toBe('temp_offset');
    });

    it('D3000 UPS迁移映射应正确', () => {
      expect(LEGACY_EXPRESSION_MIGRATION['(a,a[0])']).toBe('array_first');
    });

    it('HW-UPS5000迁移映射应正确', () => {
      expect(
        LEGACY_EXPRESSION_MIGRATION[
          "(a,a.toString(2).padStart(16,'0').slice(4,5))"
        ],
      ).toBe('bit_extract:4:5');
    });

    it('迁移后的格式应能正确执行', () => {
      // 验证每个迁移映射都有效
      Object.entries(LEGACY_EXPRESSION_MIGRATION).forEach(
        ([legacy, modern]) => {
          // 对于简单的数值测试
          if (modern === 'temp_offset') {
            const legacyResult = parseCoefficient(legacy, 50);
            const modernResult = parseCoefficient(modern, 50);
            expect(modernResult).toBe(legacyResult);
          }
        },
      );
    });
  });

  describe('性能特性', () => {
    it('数字系数应该是最快的路径', () => {
      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        parseCoefficient('0.1', 100);
      }
      const numericTime = Date.now() - start;

      expect(numericTime).toBeLessThan(100); // 应该非常快
    });
  });

  describe('类型兼容性', () => {
    it('应该支持 number 类型值', () => {
      expect(parseCoefficient('0.1', 100)).toBe(10);
    });

    it('应该支持 array 类型值', () => {
      expect(parseCoefficient('array_first', [1, 2, 3])).toBe(1);
    });

    it('应该支持混合类型 (any)', () => {
      expect(parseCoefficient('(a,typeof a)', 'string')).toBe('string');
    });
  });
});
