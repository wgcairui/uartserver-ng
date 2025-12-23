/**
 * bcrypt 密码加密工具
 *
 * 提供安全的密码加密、验证和强度检查功能
 */

import bcrypt from 'bcrypt';

/**
 * bcrypt 配置
 */
const BCRYPT_CONFIG = {
  /** salt 轮数 (影响加密强度和性能) */
  saltRounds: 12,

  /** 最小密码长度 */
  minLength: 8,

  /** 最大密码长度 */
  maxLength: 128,

  /** 密码强度要求 */
  requirements: {
    /** 必须包含小写字母 */
    hasLowercase: true,
    /** 必须包含大写字母 */
    hasUppercase: true,
    /** 必须包含数字 */
    hasNumber: true,
    /** 必须包含特殊字符 */
    hasSpecial: true,
    /** 特殊字符列表 */
    specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  },
} as const;

/**
 * 密码强度验证结果
 */
export interface PasswordValidationResult {
  /** 是否有效 */
  isValid: boolean;
  /** 错误信息列表 */
  errors: string[];
  /** 强度评分 (0-100) */
  score: number;
  /** 强度等级 */
  strength: 'weak' | 'medium' | 'strong' | 'very-strong';
}

/**
 * 加密密码
 *
 * @param password - 明文密码
 * @param saltRounds - salt 轮数 (可选，默认使用配置值)
 * @returns Promise<string> 加密后的密码哈希
 *
 * @example
 * ```typescript
 * const hash = await hashPassword('user123!');
 * console.log(hash); // $2b$12$...
 * ```
 */
export async function hashPassword(
  password: string,
  saltRounds: number = BCRYPT_CONFIG.saltRounds,
): Promise<string> {
  // 基础验证
  if (!password) {
    throw new Error('Password is required');
  }

  if (password.length < BCRYPT_CONFIG.minLength) {
    throw new Error(`Password must be at least ${BCRYPT_CONFIG.minLength} characters long`);
  }

  if (password.length > BCRYPT_CONFIG.maxLength) {
    throw new Error(`Password must be no more than ${BCRYPT_CONFIG.maxLength} characters long`);
  }

  try {
    const hash = await bcrypt.hash(password, saltRounds);
    return hash;
  } catch (error) {
    console.error('Error hashing password:', error);
    throw new Error('Failed to hash password');
  }
}

/**
 * 验证密码
 *
 * @param password - 明文密码
 * @param hash - 密码哈希
 * @returns Promise<boolean> 验证结果
 *
 * @example
 * ```typescript
 * const isValid = await verifyPassword('user123!', hash);
 * console.log(isValid); // true/false
 * ```
 */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  try {
    const isValid = await bcrypt.compare(password, hash);
    return isValid;
  } catch (error) {
    console.error('Error verifying password:', error);
    return false;
  }
}

/**
 * 验证密码强度
 *
 * @param password - 明文密码
 * @returns PasswordValidationResult 验证结果
 *
 * @example
 * ```typescript
 * const result = validatePasswordStrength('user123!');
 * console.log(result);
 * // {
 * //   isValid: true,
 * //   errors: [],
 * //   score: 75,
 * //   strength: 'strong'
 * // }
 * ```
 */
export function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = [];
  let score = 0;

  // 基础长度检查
  if (!password) {
    return {
      isValid: false,
      errors: ['Password is required'],
      score: 0,
      strength: 'weak',
    };
  }

  // 长度检查
  if (password.length < BCRYPT_CONFIG.minLength) {
    errors.push(`Password must be at least ${BCRYPT_CONFIG.minLength} characters long`);
  } else {
    // 长度加分
    score += Math.min(password.length * 2, 30);
  }

  // 字符类型检查
  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = new RegExp(
    `[${BCRYPT_CONFIG.requirements.specialChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`,
  ).test(password);

  // 强度要求检查
  if (BCRYPT_CONFIG.requirements.hasLowercase && !hasLowercase) {
    errors.push('Password must contain at least one lowercase letter');
  } else if (hasLowercase) {
    score += 15;
  }

  if (BCRYPT_CONFIG.requirements.hasUppercase && !hasUppercase) {
    errors.push('Password must contain at least one uppercase letter');
  } else if (hasUppercase) {
    score += 15;
  }

  if (BCRYPT_CONFIG.requirements.hasNumber && !hasNumber) {
    errors.push('Password must contain at least one number');
  } else if (hasNumber) {
    score += 15;
  }

  if (BCRYPT_CONFIG.requirements.hasSpecial && !hasSpecial) {
    errors.push(`Password must contain at least one special character (${BCRYPT_CONFIG.requirements.specialChars})`);
  } else if (hasSpecial) {
    score += 15;
  }

  // 多样性加分 (不同字符类型的组合)
  const diversityScore = [hasLowercase, hasUppercase, hasNumber, hasSpecial].filter(Boolean).length;
  score += diversityScore * 5;

  // 避免常见密码模式
  const commonPatterns = [
    /^123/i,           // 以123开头
    /abc/i,            // 包含abc
    /password/i,       // 包含password
    /qwerty/i,         // 包含qwerty
    /(.)\1{2,}/,       // 重复字符3次或更多
  ];

  for (const pattern of commonPatterns) {
    if (pattern.test(password)) {
      score -= 10;
      if (!errors.find(e => e.includes('common patterns'))) {
        errors.push('Password contains common patterns, avoid using easily guessable sequences');
      }
    }
  }

  // 计算强度等级
  let strength: PasswordValidationResult['strength'];
  if (score < 30) {
    strength = 'weak';
  } else if (score < 60) {
    strength = 'medium';
  } else if (score < 80) {
    strength = 'strong';
  } else {
    strength = 'very-strong';
  }

  // 确保分数在 0-100 范围内
  score = Math.max(0, Math.min(100, score));

  return {
    isValid: errors.length === 0,
    errors,
    score,
    strength,
  };
}

/**
 * 生成随机密码
 *
 * @param length - 密码长度 (默认 12)
 * @param options - 密码生成选项
 * @returns 生成的随机密码
 *
 * @example
 * ```typescript
 * const password = generateRandomPassword(16, {
 *   includeSpecial: true,
 *   excludeSimilar: true,
 * });
 * console.log(password); // 'a7!K9$mP2xR#'
 * ```
 */
export function generateRandomPassword(
  length: number = 12,
  options: {
    includeLowercase?: boolean;
    includeUppercase?: boolean;
    includeNumbers?: boolean;
    includeSpecial?: boolean;
    excludeSimilar?: boolean; // 排除相似字符 (0O, l1, etc.)
  } = {},
): string {
  const {
    includeLowercase = true,
    includeUppercase = true,
    includeNumbers = true,
    includeSpecial = true,
    excludeSimilar = false,
  } = options;

  let charset = '';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  // 排除相似字符
  const filter = (str: string) => {
    if (!excludeSimilar) return str;
    return str.replace(/[0Ol1]/g, '');
  };

  if (includeLowercase) charset += filter(lowercase);
  if (includeUppercase) charset += filter(uppercase);
  if (includeNumbers) charset += filter(numbers);
  if (includeSpecial) charset += filter(special);

  if (!charset) {
    throw new Error('At least one character type must be included');
  }

  let password = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);

  for (let i = 0; i < length; i++) {
    password += charset[array[i] % charset.length];
  }

  // 确保密码包含每种要求的字符类型
  if (includeLowercase && !/[a-z]/.test(password)) {
    password = password.slice(0, -1) + lowercase[Math.floor(Math.random() * lowercase.length)];
  }
  if (includeUppercase && !/[A-Z]/.test(password)) {
    password = password.slice(0, -1) + uppercase[Math.floor(Math.random() * uppercase.length)];
  }
  if (includeNumbers && !/\d/.test(password)) {
    password = password.slice(0, -1) + numbers[Math.floor(Math.random() * numbers.length)];
  }
  if (includeSpecial && !/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
    password = password.slice(0, -1) + special[Math.floor(Math.random() * special.length)];
  }

  return password;
}

/**
 * 检查密码是否需要更新 (基于当前安全标准)
 *
 * @param hash - 密码哈希
 * @param currentSaltRounds - 当前的 salt 轮数
 * @returns 是否需要重新加密密码
 */
export function shouldRehashPassword(hash: string, currentSaltRounds: number = BCRYPT_CONFIG.saltRounds): boolean {
  try {
    // 从哈希中提取 salt 轮数
    const matches = hash.match(/^\$2[ab]\$(\d+)\$/);
    if (!matches) {
      return true; // 无法识别格式，需要重新加密
    }

    const hashRounds = parseInt(matches[1], 10);
    return hashRounds < currentSaltRounds;
  } catch (error) {
    console.error('Error checking password hash:', error);
    return true; // 出错时返回 true，建议重新加密
  }
}

/**
 * 生成密码提示 (不泄露实际密码)
 *
 * @param password - 密码
 * @returns 密码提示信息
 *
 * @example
 * ```typescript
 * const hint = generatePasswordHint('MySecret123!');
 * console.log(hint); // 'Password starts with "M", has 11 characters'
 * ```
 */
export function generatePasswordHint(password: string): string {
  if (!password) {
    return 'No password provided';
  }

  const hints: string[] = [];

  // 长度提示
  hints.push(`${password.length} characters long`);

  // 首字符提示
  hints.push(`starts with "${password[0]}"`);

  // 字符类型提示
  const types = [];
  if (/[a-z]/.test(password)) types.push('lowercase');
  if (/[A-Z]/.test(password)) types.push('uppercase');
  if (/\d/.test(password)) types.push('numbers');
  if (/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) types.push('special');

  if (types.length > 0) {
    hints.push(`contains ${types.join(', ')}`);
  }

  return `Password ${hints.join(', ')}`;
}