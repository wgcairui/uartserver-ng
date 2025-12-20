# 系数表达式支持评估报告

**评估日期**: 2025-12-20
**当前状态**: 新系统仅支持数字系数
**风险等级**: 🟡 中等（需确认生产使用情况）

---

## 执行摘要

新系统当前仅支持**数字系数**（如 `"0.1"`），不支持**函数表达式系数**（如 `"(val, val * 0.1)"`）。需要统计生产环境使用情况以决定是否需要实现。

**关键问题**:
- ❓ 生产环境有多少协议使用函数表达式系数？
- ❓ 这些表达式的复杂度如何？
- ❓ 是否可以转换为预定义函数？

**建议**:
1. 统计数据库中使用函数表达式的协议数量
2. 分析这些表达式的实际用途
3. 评估安全的替代方案

---

## 当前实现对比

### 老系统实现

**文件**: `midwayuartserver/src/util/util.ts:163-170`

**支持的系数格式**:

| 格式 | 示例 | 说明 |
|------|------|------|
| 纯数字 | `"0.1"` | 直接乘法：`val * 0.1` |
| 函数表达式 | `"(val, val * 0.1)"` | 动态执行表达式 |
| 复杂表达式 | `"(x, Math.round(x * 100))"` | 支持 JavaScript 函数 |

**处理逻辑**:
```typescript
// 情况1: 数字系数
if (Number(fun)) return (Number(fun) * val) as number;

// 情况2: 函数表达式（使用动态代码执行）
else {
  const [arg, ...f] = fun.replace(/(^\(|\)$)/g, '').split(',');
  const Fun = /* 动态创建函数 */;
  return Fun(val) as number | string;
}
```

### 新系统实现

**文件**: `src/utils/data-parsing.utils.ts:203-216`

**支持的系数格式**:

| 格式 | 示例 | 说明 |
|------|------|------|
| 纯数字 | `"0.1"` | 直接乘法：`val * 0.1` ✅ |
| 函数表达式 | `"(val, val * 0.1)"` | **不支持** ❌ |

**处理逻辑**:
```typescript
export function parseCoefficient(coefficient: string, value: number): number {
  // 仅支持数字系数
  const numCoefficient = Number(coefficient);
  if (!isNaN(numCoefficient)) {
    return numCoefficient * value;
  }

  // 不支持函数表达式,返回原值
  console.warn(`不支持的系数格式: ${coefficient}, 返回原值`);
  return value;
}
```

**行为差异**:
- 输入: `bl = "(val, val * 0.1)"`, `rawValue = 100`
- 老系统输出: `10` ✅
- 新系统输出: `100` (原值) ⚠️ + 警告日志

---

## 风险评估

### 场景分析

| 场景 | 数字系数 | 函数表达式 | 新系统兼容性 |
|------|---------|-----------|------------|
| 简单缩放 | `"0.1"` | `"(val, val * 0.1)"` | ⚠️ 需迁移 |
| 单位转换 | `"0.001"` | `"(val, val / 1000)"` | ⚠️ 需迁移 |
| 取整 | N/A | `"(x, Math.round(x))"` | ❌ 不兼容 |
| 自定义公式 | N/A | `"(t, (t - 32) * 5/9)"` | ❌ 不兼容 |

### 风险等级

| 使用场景 | 风险 | 缓解措施 |
|---------|------|---------|
| 所有协议都用数字系数 | 🟢 低 | 无需处理 |
| 少数协议用简单表达式 | 🟡 中 | 迁移到数字系数 |
| 多数协议用复杂表达式 | 🔴 高 | 需实现表达式支持 |

---

## 数据统计需求

### 需要收集的数据

1. **协议总数**: 生产环境中配置的协议总数
2. **使用函数表达式的协议数**: `bl` 字段包含 `(` 或 `,` 的协议
3. **表达式复杂度分布**:
   - 简单乘法: `(val, val * 0.1)`
   - 简单除法: `(val, val / 10)`
   - 使用 Math 函数: `(x, Math.round(x))`
   - 复杂公式: `(t, (t - 32) * 5 / 9)`

### 建议的数据库查询

```sql
-- 查询使用函数表达式的协议
SELECT 
  protocol,
  name,
  bl as coefficient,
  COUNT(*) OVER() as total_count
FROM protocol_instruct_form
WHERE bl LIKE '%(%' OR bl LIKE '%,%';

-- 统计使用频率
SELECT 
  CASE 
    WHEN bl LIKE '%(%' OR bl LIKE '%,%' THEN 'Expression'
    ELSE 'Number'
  END as coefficient_type,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM protocol_instruct_form
GROUP BY coefficient_type;
```

---

## 替代方案

### 方案 1: 预定义转换函数映射 ⭐

**适用场景**: 函数表达式种类有限，可以预定义

**实现**:
```typescript
// 预定义常用的转换函数
const COEFFICIENT_TRANSFORMS = {
  'multiply': (val: number, factor: number) => val * factor,
  'divide': (val: number, divisor: number) => val / divisor,
  'round': (val: number) => Math.round(val),
  'fahrenheit_to_celsius': (val: number) => (val - 32) * 5 / 9,
} as const;

// 数据库中存储转换类型 + 参数
// 示例: bl = "multiply:0.1" 或 bl = "fahrenheit_to_celsius"
export function parseCoefficient(coefficient: string, value: number): number {
  // 数字系数
  const numCoefficient = Number(coefficient);
  if (!isNaN(numCoefficient)) {
    return numCoefficient * value;
  }

  // 预定义转换
  const [transform, param] = coefficient.split(':');
  if (transform in COEFFICIENT_TRANSFORMS) {
    const fn = COEFFICIENT_TRANSFORMS[transform as keyof typeof COEFFICIENT_TRANSFORMS];
    return param ? fn(value, Number(param)) : fn(value);
  }

  console.warn(`不支持的系数格式: ${coefficient}`);
  return value;
}
```

**优点**: ✅ 安全、✅ 可控、✅ 性能好
**缺点**: ❌ 需要迁移数据库、❌ 灵活性有限

### 方案 2: 有限表达式解析器

**适用场景**: 需要支持简单数学表达式

**实现**: 使用安全的表达式解析库（如 `mathjs`）
```typescript
import { evaluate } from 'mathjs';

export function parseCoefficient(coefficient: string, value: number): number {
  const numCoefficient = Number(coefficient);
  if (!isNaN(numCoefficient)) {
    return numCoefficient * value;
  }

  // 解析表达式: "(val, val * 0.1)" → "val * 0.1"
  const match = coefficient.match(/^\((\w+),\s*(.+)\)$/);
  if (match) {
    const [, varName, expression] = match;
    try {
      // 使用 mathjs 安全求值
      return evaluate(expression, { [varName]: value });
    } catch (error) {
      console.error(`表达式求值失败: ${coefficient}`, error);
    }
  }

  return value;
}
```

**优点**: ✅ 灵活、✅ 相对安全（沙箱执行）
**缺点**: ❌ 依赖外部库、⚠️ 性能略差

### 方案 3: 不实现，手动迁移

**适用场景**: 使用函数表达式的协议很少

**策略**:
1. 统计使用函数表达式的协议
2. 逐个转换为数字系数（如果可能）
3. 不可转换的使用预定义函数

**优点**: ✅ 无需开发、✅ 系统简单
**缺点**: ❌ 需要人工迁移、⚠️ 可能有遗漏

---

## 决策矩阵

| 使用比例 | 复杂度 | 建议方案 |
|---------|--------|---------|
| < 5% | 简单 | 方案 3 (手动迁移) |
| < 5% | 复杂 | 方案 1 (预定义函数) |
| 5-20% | 简单 | 方案 1 (预定义函数) |
| 5-20% | 复杂 | 方案 2 (表达式解析器) |
| > 20% | 任何 | 方案 2 (表达式解析器) |

---

## 后续行动

### 立即行动 (本周)

1. ✅ **已完成**: 评估报告生成
2. ⏳ **进行中**: 数据库查询统计
   - 连接生产数据库
   - 运行统计查询
   - 分析表达式类型分布

### 短期行动 (1-2 周)

1. **决策实施方案**:
   - 根据统计结果选择方案
   - 评估开发工作量
   - 制定迁移计划（如需要）

2. **风险沟通**:
   - 通知相关团队当前限制
   - 确认迁移时间窗口
   - 准备回滚方案

### 中期行动 (1-2 月)

1. **实施选定方案**:
   - 开发功能（如需要）
   - 添加测试覆盖
   - 更新文档

2. **数据迁移**（如需要）:
   - 备份原始配置
   - 批量转换系数格式
   - 验证转换结果

---

## 结论

### 当前状态

- **新系统**: 仅支持数字系数，安全但功能受限
- **兼容性**: ⚠️ 与使用函数表达式的协议不兼容
- **风险**: 🟡 中等（取决于生产使用情况）

### 关键决策点

需要基于生产数据回答：
1. ❓ 有多少协议使用函数表达式？
2. ❓ 这些表达式是否可以转换为数字系数？
3. ❓ 是否值得投入开发时间实现表达式支持？

### 建议

**优先级 P1**: 
- 📊 执行数据库统计查询
- 📋 整理使用函数表达式的协议清单
- 📈 分析表达式复杂度分布

**优先级 P2** (基于 P1 结果):
- 🛠️ 实施选定的技术方案
- 📝 更新文档和迁移指南
- ✅ 添加相关测试

---

**报告生成时间**: 2025-12-20
**评估人**: Claude Sonnet 4.5
**下一步**: 执行数据库统计查询
**状态**: ⏳ 等待数据收集
