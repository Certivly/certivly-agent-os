import { JsonObject } from './types';
import { getAgentContext } from './context';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export interface LogEntry {
  timestamp: string;
  eventType: string;
  component: string;
  severity: LogLevel;
  correlationId?: string;
  sessionId?: string;
  message: string;
  meta?: JsonObject;
}

export interface Logger {
  debug(component: string, eventType: string, message: string, meta?: JsonObject): void;
  info(component: string, eventType: string, message: string, meta?: JsonObject): void;
  warn(component: string, eventType: string, message: string, meta?: JsonObject): void;
  error(component: string, eventType: string, message: string, meta?: JsonObject): void;
}

export class JsonLogger implements Logger {
  private log(severity: LogLevel, component: string, eventType: string, message: string, meta?: JsonObject) {
    const ctx = getAgentContext();
    
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      eventType,
      component,
      severity,
      correlationId: ctx?.requestId,
      sessionId: ctx?.sessionId,
      message,
      meta,
    };
    
    if (severity === LogLevel.ERROR) {
      console.error(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
  }

  debug(component: string, eventType: string, message: string, meta?: JsonObject): void {
    this.log(LogLevel.DEBUG, component, eventType, message, meta);
  }

  info(component: string, eventType: string, message: string, meta?: JsonObject): void {
    this.log(LogLevel.INFO, component, eventType, message, meta);
  }

  warn(component: string, eventType: string, message: string, meta?: JsonObject): void {
    this.log(LogLevel.WARN, component, eventType, message, meta);
  }

  error(component: string, eventType: string, message: string, meta?: JsonObject): void {
    this.log(LogLevel.ERROR, component, eventType, message, meta);
  }
}

export const logger = new JsonLogger();
