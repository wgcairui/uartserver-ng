/**
 * 实体类型定义索引
 * 统一导出所有数据库实体类型
 */

// Terminal 相关实体
export type {
  Terminal,
  MountDevice,
  IccidInfo,
  RegisterTerminal,
  RegisterDevice,
  WebSocketTerminal,
  TerminalUpdate,
  TerminalFilter,
} from './terminal.entity';

// Node 相关实体
export type {
  NodeClient,
  NodeRunInfo,
  NodeClientUpdate,
  NodeClientFilter,
} from './node.entity';

// 数据结果相关实体
export type {
  ContentData,
  TerminalClientResults,
  ResultItem,
  SaveResultItem,
  TerminalClientResult,
  TerminalClientResultSingle,
  QueryDataRequest,
  ResultFilter,
  ResultPaginationOptions,
} from './result.entity';
