/**
 * Logger 工具
 * 简单的日志封装，生产环境可以替换为更强大的日志库
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerOptions {
  level: LogLevel;
  timestamp: boolean;
}

class Logger {
  private options: LoggerOptions = {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    timestamp: true,
  };

  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.options.level);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  private formatMessage(level: LogLevel, message: string, ..._args: any[]): string {
    const timestamp = this.options.timestamp ? `[${this.getTimestamp()}]` : '';
    const levelStr = `[${level.toUpperCase()}]`;
    return `${timestamp} ${levelStr} ${message}`;
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message), ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message), ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message), ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message), ...args);
    }
  }

  setLevel(level: LogLevel): void {
    this.options.level = level;
  }

  setTimestamp(enabled: boolean): void {
    this.options.timestamp = enabled;
  }
}

export const logger = new Logger();
