/**
 * 数据结果实体定义
 * 完全兼容老系统 (midwayuartserver/src/mongo_entity/node.ts)
 */

/**
 * 内容数据（用于原始数据存储）
 */
export interface ContentData {
  /** 内容字符串 */
  content: string;
  /** 数据字节数组（Buffer） */
  data: number[];
}

/**
 * 终端客户端原始数据（存储在 client.results 集合）
 */
export interface TerminalClientResults {
  /** MongoDB _id */
  _id?: any;
  /** 内容数据数组 */
  contents: ContentData[];
}

/**
 * 解析结果数据项（详细版，用于单例存储）
 */
export interface ResultItem {
  /** 参数名称 */
  name: string;
  /** 原始值 */
  value: string;
  /** 解析后的值 */
  parseValue: string;
  /** 是否告警 */
  alarm?: boolean;
  /** 单位 */
  unit: string;
  /** 是否模拟数据 */
  issimulate: boolean;
}

/**
 * 保存的结果数据项（简化版，用于集合存储）
 */
export interface SaveResultItem {
  /** 参数名称 */
  name: string;
  /** 原始值 */
  value: string;
  /** 解析后的值 */
  parseValue: string;
}

/**
 * 终端客户端解析数据集合（存储在 client.resultcolltions 集合）
 */
export interface TerminalClientResult {
  /** MongoDB _id */
  _id?: any;
  /** 解析结果数据 */
  result: SaveResultItem[];
  /** 时间戳 */
  timeStamp: number;
  /** 协议 ID */
  pid: number;
  /** 设备 MAC 地址 */
  mac: string;
  /** 使用时间（处理耗时） */
  useTime: number;
  /** 父记录 ID */
  parentId: string;
  /** 是否包含告警（0=无，1=有） */
  hasAlarm: number;
}

/**
 * 终端客户端解析数据单例（存储在 client.resultsingles 集合）
 */
export interface TerminalClientResultSingle {
  /** MongoDB _id */
  _id?: any;
  /** 解析结果数据（详细版） */
  result: ResultItem[];
  /** 协议 ID */
  pid: number;
  /** 设备 MAC 地址 */
  mac: string;
  /** 时间字符串 */
  time: string;
  /** 查询间隔 */
  Interval: number;
  /** 使用时间（处理耗时） */
  useTime: number;
  /** 父记录 ID */
  parentId: string;
}

/**
 * 查询数据请求接口（用于 /api/terminal/queryData）
 */
export interface QueryDataRequest {
  /** 设备 MAC 地址 */
  mac: string;
  /** 协议 ID */
  pid: number;
  /** 时间戳 */
  timeStamp: number;
  /** 数据字符串 */
  data: string;
  /** 协议类型 */
  type: string;
}

/**
 * 结果查询过滤器
 */
export interface ResultFilter {
  mac?: string;
  pid?: number;
  timeStamp?: number;
  hasAlarm?: number;
  startTime?: number;
  endTime?: number;
}

/**
 * 结果分页查询选项
 */
export interface ResultPaginationOptions {
  page?: number;
  pageSize?: number;
  sortBy?: 'timeStamp' | 'mac' | 'pid';
  sortOrder?: 'asc' | 'desc';
}
