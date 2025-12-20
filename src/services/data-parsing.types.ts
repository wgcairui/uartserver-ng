/**
 * 数据解析服务类型定义
 *
 * 独立类型文件,避免循环依赖
 */

/**
 * 指令查询结果
 */
export interface InstructQueryResult {
  /** 查询指令内容 (十六进制字符串) */
  content: string;
  /** 返回的数据 Buffer */
  buffer: {
    data: number[];
  };
}

/**
 * 查询结果 (完整)
 */
export interface QueryResult {
  /** 终端 MAC 地址 */
  mac: string;
  /** 设备 PID */
  pid: number;
  /** 协议名称/ID */
  protocol: string;
  /** 通讯类型 (232 或 485) */
  type: 232 | 485;
  /** 指令查询结果数组 */
  contents: InstructQueryResult[];
  /** 查询耗时 (ms) */
  useTime: number;
}

/**
 * 协议指令定义
 */
export interface ProtocolInstruct {
  /** 指令名称 */
  name: string;
  /** 是否非标协议 */
  noStandard?: boolean;
  /** 返回数据类型 */
  resultType: 'bit2' | 'utf8' | 'hex' | 'short' | 'float';
  /** 是否裁剪开头 */
  shift?: boolean;
  /** 裁剪开头字节数 */
  shiftNum?: number;
  /** 是否裁剪结尾 */
  pop?: boolean;
  /** 裁剪结尾字节数 */
  popNum?: number;
  /** 是否分割模式 */
  isSplit?: boolean;
  /** 分割字符 */
  splitStr?: string;
  /** 数据点配置 */
  formResize: FormResize[];
}

/**
 * 数据点配置
 */
export interface FormResize {
  /** 数据点名称 */
  name: string;
  /** 位置正则 (如 "0", "0-4", "0-4-2") */
  regx?: string;
  /** 单位 */
  unit?: string;
  /** 是否状态值 */
  isState: boolean;
  /** 系数 (字符串表示,如 "0.1" 或 "1") */
  bl?: string;
}

/**
 * 解析后的数据点
 */
export interface ParsedArgument {
  /** 数据点名称 */
  name: string;
  /** 原始值 */
  value: string | undefined;
  /** 解析后的值 (应用系数/状态映射后) */
  parseValue: string;
  /** 单位 */
  unit?: string;
  /** 是否状态值 */
  issimulate: boolean;
}

/**
 * 解析上下文 - 提供解析器所需的共享数据
 */
export interface ParsingContext {
  /** 协议名称 */
  protocol: string;

  /** 设备 PID (仅 RS485 需要) */
  pid?: number;

  /** 协议指令映射表: Map<protocol, Map<instructName, config>> */
  protocolInstructMap: Map<string, Map<string, ProtocolInstruct>>;

  /** 指令内容到指令名称的映射: Map<content, instructName> */
  contentToNameMap: Map<string, string>;

  /** 状态映射缓存: Map<unit, Map<value, label>> */
  stateMapCache: Map<string, Map<string, string>>;
}
