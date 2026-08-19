/**
 * Singularity Live Diagnostic Logger Service
 * Captures, formats, categorizes, and streams application logs and telemetry in real time.
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'success' | 'debug';
export type LogCategory = 'all' | 'system' | 'audio' | 'network' | 'server' | 'desktop' | 'database';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  category: LogCategory;
  tag: string;
  message: string;
  data?: any;
}

type LogListener = (logs: LogEntry[]) => void;

class LoggerService {
  private logs: LogEntry[] = [];
  private maxLogs = 1500;
  private listeners = new Set<LogListener>();
  private originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug,
  };
  private isHooked = false;

  constructor() {
    this.initConsoleHook();
    this.addSystemLog('system', 'info', '[Singularity] Diagnostic Logger initialized.');
  }

  private detectCategory(tagOrMsg: string): LogCategory {
    const lower = tagOrMsg.toLowerCase();
    if (lower.includes('audio') || lower.includes('singularityengine') || lower.includes('dsp') || lower.includes('equalizer')) {
      return 'audio';
    }
    if (lower.includes('api') || lower.includes('stream') || lower.includes('network') || lower.includes('youtube') || lower.includes('deezer') || lower.includes('itunes') || lower.includes('innertube')) {
      return 'network';
    }
    if (lower.includes('server') || lower.includes('keep-alive') || lower.includes('express')) {
      return 'server';
    }
    if (lower.includes('electron') || lower.includes('discord') || lower.includes('tray') || lower.includes('desktop') || lower.includes('obs')) {
      return 'desktop';
    }
    if (lower.includes('db') || lower.includes('indexeddb') || lower.includes('database') || lower.includes('librarydb') || lower.includes('cache')) {
      return 'database';
    }
    return 'system';
  }

  public initConsoleHook() {
    if (this.isHooked || typeof window === 'undefined') return;
    this.isHooked = true;

    const formatArgument = (arg: any): string => {
      if (arg === null) return 'null';
      if (arg === undefined) return 'undefined';
      if (arg instanceof Error) {
        return `${arg.name}: ${arg.message}${arg.stack ? `\n${arg.stack}` : ''}`;
      }
      if (typeof arg === 'object') {
        try {
          // If object contains error property or message
          if (arg.message || arg.error || arg.status) {
            return JSON.stringify(arg, null, 2);
          }
          const str = JSON.stringify(arg, (k, v) => {
            if (v instanceof Error) {
              return { name: v.name, message: v.message, stack: v.stack };
            }
            return v;
          });
          return str === '{}' ? Object.prototype.toString.call(arg) : str;
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    };

    const capture = (level: LogLevel, originalFn: Function, args: any[]) => {
      // Always execute original console function
      originalFn.apply(console, args);

      try {
        const firstArg = args[0];
        let tag = 'APP';
        let message = '';

        if (typeof firstArg === 'string') {
          const match = firstArg.match(/^\[(.*?)\]/);
          if (match) {
            tag = match[1];
            message = args.map(formatArgument).join(' ');
          } else {
            message = args.map(formatArgument).join(' ');
          }
        } else {
          message = args.map(formatArgument).join(' ');
        }

        const category = this.detectCategory(tag + ' ' + message);

        const entry: LogEntry = {
          id: Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
          timestamp: Date.now(),
          level,
          category,
          tag,
          message,
          data: args.length > 1 ? args.slice(1) : undefined,
        };

        this.pushLog(entry);
      } catch {
        // Fallback silently if formatting fails
      }
    };

    console.log = (...args) => capture('info', this.originalConsole.log, args);
    console.info = (...args) => capture('info', this.originalConsole.info, args);
    console.warn = (...args) => capture('warn', this.originalConsole.warn, args);
    console.error = (...args) => capture('error', this.originalConsole.error, args);
    console.debug = (...args) => capture('debug', this.originalConsole.debug, args);
  }

  private pushLog(entry: LogEntry) {
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    this.notify();
  }

  public addSystemLog(category: LogCategory, level: LogLevel, message: string, data?: any) {
    const entry: LogEntry = {
      id: Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
      timestamp: Date.now(),
      level,
      category,
      tag: 'SYSTEM',
      message,
      data,
    };
    this.pushLog(entry);
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public clear() {
    this.logs = [];
    this.notify();
  }

  public subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    listener(this.getLogs());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const copy = this.getLogs();
    for (const listener of this.listeners) {
      try {
        listener(copy);
      } catch (err) {
        this.originalConsole.error('[LoggerService] Listener error:', err);
      }
    }
  }
}

export const loggerService = new LoggerService();
