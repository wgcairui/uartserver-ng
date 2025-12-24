/**
 * Protocol Entity (Phase 4.2 Day 3)
 *
 * 协议定义和配置实体
 * 用于存储设备协议的定义、参数配置、告警配置等
 */

import type { ObjectId } from 'mongodb';

/**
 * 协议参数定义
 * 描述协议中的每个数据参数
 */
export interface ProtocolParameter {
  /** 参数名称（唯一标识）*/
  name: string;

  /** 参数显示名称 */
  label: string;

  /** 参数单位（可选）*/
  unit?: string;

  /** 参数数据类型 */
  dataType: 'number' | 'string' | 'boolean' | 'enum';

  /** 枚举值（当 dataType 为 enum 时）*/
  enumValues?: Array<{ value: string | number; label: string }>;

  /** 数值范围（当 dataType 为 number 时）*/
  min?: number;
  max?: number;

  /** 小数位数 */
  decimal?: number;

  /** 是否必填 */
  required?: boolean;

  /** 默认值 */
  defaultValue?: any;

  /** 参数描述 */
  description?: string;

  /** 排序顺序 */
  order?: number;
}

/**
 * 协议告警配置
 * 定义协议级别的告警规则
 */
export interface ProtocolAlarmConfig {
  /** 参数名称 */
  paramName: string;

  /** 告警类型 */
  alarmType: 'threshold' | 'range' | 'value' | 'offline';

  /** 告警级别 */
  level: 'info' | 'warning' | 'error' | 'critical';

  /** 阈值条件 */
  condition?: {
    operator: '>' | '>=' | '<' | '<=' | '==' | '!=' | 'between' | 'outside';
    value?: number;
    min?: number;
    max?: number;
  };

  /** 告警消息模板 */
  messageTemplate: string;

  /** 是否启用 */
  enabled: boolean;

  /** 静默时间（秒）*/
  silenceDuration?: number;
}

/**
 * 协议文档
 * 存储完整的协议定义
 */
export interface ProtocolDocument {
  _id: ObjectId;

  /** 协议名称（唯一标识）*/
  name: string;

  /** 协议显示名称 */
  displayName: string;

  /** 协议版本 */
  version: string;

  /** 协议描述 */
  description?: string;

  /** 协议类型 */
  type: 'modbus' | 'mqtt' | 'http' | 'tcp' | 'serial' | 'custom';

  /** 参数列表 */
  parameters: ProtocolParameter[];

  /** 告警配置列表 */
  alarmConfigs?: ProtocolAlarmConfig[];

  /** 是否激活 */
  active: boolean;

  /** 创建时间 */
  createdAt: Date;

  /** 更新时间 */
  updatedAt: Date;

  /** 创建者 */
  createdBy?: string;

  /** 最后更新者 */
  updatedBy?: string;
}

/**
 * 用户协议配置
 * 存储用户对特定协议的个性化配置
 */
export interface UserProtocolConfigDocument {
  _id: ObjectId;

  /** 用户 ID */
  userId: string;

  /** 协议名称 */
  protocol: string;

  /** 设备 MAC（可选，针对特定设备的配置）*/
  mac?: string;

  /** 设备 PID（可选）*/
  pid?: number;

  /** 自定义参数配置 */
  parameterConfigs?: Record<
    string,
    {
      /** 是否显示 */
      visible?: boolean;

      /** 自定义显示名称 */
      customLabel?: string;

      /** 自定义单位 */
      customUnit?: string;

      /** 显示顺序 */
      displayOrder?: number;

      /** 自定义颜色 */
      color?: string;
    }
  >;

  /** 自定义告警配置 */
  alarmOverrides?: Array<{
    paramName: string;
    enabled: boolean;
    level?: 'info' | 'warning' | 'error' | 'critical';
    condition?: {
      operator: string;
      value?: number;
      min?: number;
      max?: number;
    };
    customMessage?: string;
  }>;

  /** 刷新间隔（毫秒）*/
  refreshInterval?: number;

  /** 创建时间 */
  createdAt: Date;

  /** 更新时间 */
  updatedAt: Date;
}

// ============================================================================
// 集合名称和索引配置
// ============================================================================

/**
 * 协议集合名称
 */
export const PROTOCOL_COLLECTION = 'protocols';
export const USER_PROTOCOL_CONFIG_COLLECTION = 'user.protocol.configs';

/**
 * 协议索引
 */
export const PROTOCOL_INDEXES = [
  {
    key: { name: 1 },
    name: 'protocol_name_idx',
    unique: true,
  },
  {
    key: { type: 1, active: 1 },
    name: 'protocol_type_active_idx',
  },
  {
    key: { active: 1, updatedAt: -1 },
    name: 'protocol_active_updated_idx',
  },
];

/**
 * 用户协议配置索引
 */
export const USER_PROTOCOL_CONFIG_INDEXES = [
  {
    key: { userId: 1, protocol: 1, mac: 1, pid: 1 },
    name: 'user_protocol_config_unique_idx',
    unique: true,
    sparse: true,
  },
  {
    key: { userId: 1, protocol: 1 },
    name: 'user_protocol_idx',
  },
  {
    key: { userId: 1 },
    name: 'user_configs_idx',
  },
];

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 创建协议文档
 */
export function createProtocolDocument(
  name: string,
  displayName: string,
  type: ProtocolDocument['type'],
  parameters: ProtocolParameter[],
  options?: {
    version?: string;
    description?: string;
    alarmConfigs?: ProtocolAlarmConfig[];
    createdBy?: string;
  }
): Omit<ProtocolDocument, '_id'> {
  const now = new Date();
  return {
    name,
    displayName,
    version: options?.version || '1.0.0',
    description: options?.description,
    type,
    parameters,
    alarmConfigs: options?.alarmConfigs || [],
    active: true,
    createdAt: now,
    updatedAt: now,
    createdBy: options?.createdBy,
  };
}

/**
 * 创建用户协议配置文档
 */
export function createUserProtocolConfigDocument(
  userId: string,
  protocol: string,
  options?: {
    mac?: string;
    pid?: number;
    parameterConfigs?: UserProtocolConfigDocument['parameterConfigs'];
    alarmOverrides?: UserProtocolConfigDocument['alarmOverrides'];
    refreshInterval?: number;
  }
): Omit<UserProtocolConfigDocument, '_id'> {
  const now = new Date();
  return {
    userId,
    protocol,
    mac: options?.mac,
    pid: options?.pid,
    parameterConfigs: options?.parameterConfigs,
    alarmOverrides: options?.alarmOverrides,
    refreshInterval: options?.refreshInterval,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 验证参数值是否符合协议定义
 */
export function validateParameterValue(
  parameter: ProtocolParameter,
  value: any
): { valid: boolean; error?: string } {
  if (parameter.required && (value === undefined || value === null)) {
    return {
      valid: false,
      error: `Parameter '${parameter.name}' is required`,
    };
  }

  if (value === undefined || value === null) {
    return { valid: true };
  }

  // 类型验证
  switch (parameter.dataType) {
    case 'number':
      if (typeof value !== 'number' || isNaN(value)) {
        return {
          valid: false,
          error: `Parameter '${parameter.name}' must be a number`,
        };
      }
      // 范围验证
      if (parameter.min !== undefined && value < parameter.min) {
        return {
          valid: false,
          error: `Parameter '${parameter.name}' must be >= ${parameter.min}`,
        };
      }
      if (parameter.max !== undefined && value > parameter.max) {
        return {
          valid: false,
          error: `Parameter '${parameter.name}' must be <= ${parameter.max}`,
        };
      }
      break;

    case 'string':
      if (typeof value !== 'string') {
        return {
          valid: false,
          error: `Parameter '${parameter.name}' must be a string`,
        };
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        return {
          valid: false,
          error: `Parameter '${parameter.name}' must be a boolean`,
        };
      }
      break;

    case 'enum':
      if (!parameter.enumValues) {
        return { valid: true };
      }
      const validValues = parameter.enumValues.map((ev) => ev.value);
      if (!validValues.includes(value)) {
        return {
          valid: false,
          error: `Parameter '${parameter.name}' must be one of: ${validValues.join(', ')}`,
        };
      }
      break;
  }

  return { valid: true };
}

/**
 * 获取参数的默认值
 */
export function getParameterDefaultValue(parameter: ProtocolParameter): any {
  if (parameter.defaultValue !== undefined) {
    return parameter.defaultValue;
  }

  switch (parameter.dataType) {
    case 'number':
      return parameter.min !== undefined ? parameter.min : 0;
    case 'string':
      return '';
    case 'boolean':
      return false;
    case 'enum':
      return parameter.enumValues?.[0]?.value;
    default:
      return null;
  }
}
