/**
 * Template System Logger
 * Centralized logging for template operations, transformations, and errors
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  category: string;
  message: string;
  metadata?: Record<string, any>;
}

class TemplateLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private enabled = true;

  constructor() {
    // Enable logging in development
    this.enabled = import.meta.env.DEV;
  }

  private log(level: LogLevel, category: string, message: string, metadata?: Record<string, any>) {
    if (!this.enabled) return;

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      category,
      message,
      metadata,
    };

    this.logs.push(entry);

    // Keep logs within limit
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Console output with color coding
    const colors = {
      debug: 'color: #9CA3AF',
      info: 'color: #3B82F6',
      warn: 'color: #F59E0B',
      error: 'color: #EF4444',
    };

    console.log(
      `%c[${level.toUpperCase()}] ${category}: ${message}`,
      colors[level],
      metadata || ''
    );
  }

  debug(category: string, message: string, metadata?: Record<string, any>) {
    this.log('debug', category, message, metadata);
  }

  info(category: string, message: string, metadata?: Record<string, any>) {
    this.log('info', category, message, metadata);
  }

  warn(category: string, message: string, metadata?: Record<string, any>) {
    this.log('warn', category, message, metadata);
  }

  error(category: string, message: string, metadata?: Record<string, any>) {
    this.log('error', category, message, metadata);
  }

  // Get logs by category
  getLogsByCategory(category: string): LogEntry[] {
    return this.logs.filter(log => log.category === category);
  }

  // Get logs by level
  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter(log => log.level === level);
  }

  // Get recent logs
  getRecentLogs(count: number = 50): LogEntry[] {
    return this.logs.slice(-count);
  }

  // Clear all logs
  clearLogs() {
    this.logs = [];
  }

  // Export logs as JSON
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  // Get error summary
  getErrorSummary(): { category: string; count: number }[] {
    const errors = this.logs.filter(log => log.level === 'error');
    const summary = errors.reduce((acc, log) => {
      const existing = acc.find(item => item.category === log.category);
      if (existing) {
        existing.count++;
      } else {
        acc.push({ category: log.category, count: 1 });
      }
      return acc;
    }, [] as { category: string; count: number }[]);
    
    return summary.sort((a, b) => b.count - a.count);
  }
}

// Singleton instance
export const templateLogger = new TemplateLogger();

// Convenience exports
export const logTemplateSelection = (templateId: string, templateName: string) => {
  templateLogger.info('Template', 'Template selected', { templateId, templateName });
};

export const logFieldMapping = (
  templateId: string,
  fieldKey: string,
  remotionProp: string,
  transformation?: string | null
) => {
  templateLogger.debug('FieldMapping', 'Field mapped', {
    templateId,
    fieldKey,
    remotionProp,
    transformation,
  });
};

export const logTransformation = (
  fieldKey: string,
  inputValue: any,
  outputValue: any,
  transformationFunction: string
) => {
  templateLogger.debug('Transformation', 'Field transformed', {
    fieldKey,
    inputValue,
    outputValue,
    transformationFunction,
  });
};

export const logTransformationError = (
  fieldKey: string,
  inputValue: any,
  transformationFunction: string,
  error: string
) => {
  templateLogger.error('Transformation', 'Transformation failed', {
    fieldKey,
    inputValue,
    transformationFunction,
    error,
  });
};

export const logMissingMapping = (templateId: string, fieldKey: string) => {
  templateLogger.warn('FieldMapping', 'Missing field mapping', {
    templateId,
    fieldKey,
  });
};

export const logComponentLoad = (componentId: string, success: boolean) => {
  if (success) {
    templateLogger.info('Component', 'Component loaded', { componentId });
  } else {
    templateLogger.error('Component', 'Component failed to load', { componentId });
  }
};

export const logPreviewRender = (componentId: string, props: Record<string, any>) => {
  templateLogger.debug('Preview', 'Preview rendering', { componentId, props });
};

export const logCustomizationChange = (fieldKey: string, oldValue: any, newValue: any) => {
  templateLogger.debug('Customization', 'Field customized', {
    fieldKey,
    oldValue,
    newValue,
  });
};
