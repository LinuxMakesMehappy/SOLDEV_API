/**
 * Structured logging system with CloudWatch integration
 * Requirements: 5.4, 6.6, 7.4 - CloudWatch logging and monitoring
 */

/**
 * Log levels for structured logging
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  CRITICAL = 'critical'
}

/**
 * Log context interface for structured logging
 */
export interface LogContext {
  requestId?: string;
  userId?: string;
  errorCode?: number;
  duration?: number;
  cacheHit?: boolean;
  source?: string;
  [key: string]: any;
}

/**
 * Structured log entry interface
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Logger configuration interface
 */
export interface LoggerConfig {
  service: string;
  level: LogLevel;
  enableCloudWatch: boolean;
  enableConsole: boolean;
  enableMetrics: boolean;
}

/**
 * Structured logger class with CloudWatch integration
 */
export class StructuredLogger {
  private config: LoggerConfig;
  private metrics: Map<string, number> = new Map();
  private lastMetricsReset: Date = new Date();

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      service: 'solana-error-api',
      level: LogLevel.INFO,
      enableCloudWatch: true,
      enableConsole: true,
      enableMetrics: true,
      ...config
    };
  }

  /**
   * Log debug message
   * @param message - Log message
   * @param context - Additional context
   */
  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log info message
   * @param message - Log message
   * @param context - Additional context
   */
  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log warning message
   * @param message - Log message
   * @param context - Additional context
   */
  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log error message
   * @param message - Log message
   * @param context - Additional context
   * @param error - Error object
   */
  error(message: string, context?: LogContext, error?: Error): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  /**
   * Log critical message
   * @param message - Log message
   * @param context - Additional context
   * @param error - Error object
   */
  critical(message: string, context?: LogContext, error?: Error): void {
    this.log(LogLevel.CRITICAL, message, context, error);
  }

  /**
   * Core logging method
   * @param level - Log level
   * @param message - Log message
   * @param context - Additional context
   * @param error - Error object
   */
  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    // Check if log level is enabled
    if (!this.shouldLog(level)) {
      return;
    }

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.config.service,
      context: context || {}
    };

    // Add error information if provided
    if (error) {
      logEntry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack || ''
      };
    }

    // Output to console if enabled
    if (this.config.enableConsole) {
      this.logToConsole(logEntry);
    }

    // Send to CloudWatch if enabled
    if (this.config.enableCloudWatch) {
      this.logToCloudWatch(logEntry);
    }

    // Track metrics if enabled
    if (this.config.enableMetrics) {
      this.trackMetrics(level, context);
    }
  }

  /**
   * Check if log level should be logged
   * @param level - Log level to check
   * @returns Whether to log
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.CRITICAL];
    const currentLevelIndex = levels.indexOf(this.config.level);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Log to console with appropriate formatting
   * @param logEntry - Log entry to output
   */
  private logToConsole(logEntry: LogEntry): void {
    const logData = {
      timestamp: logEntry.timestamp,
      level: logEntry.level,
      service: logEntry.service,
      message: logEntry.message,
      ...logEntry.context,
      ...(logEntry.error && { error: logEntry.error })
    };

    switch (logEntry.level) {
      case LogLevel.DEBUG:
        console.debug(`[${logEntry.service.toUpperCase()}] ${logEntry.message}`, logData);
        break;
      case LogLevel.INFO:
        console.info(`[${logEntry.service.toUpperCase()}] ${logEntry.message}`, logData);
        break;
      case LogLevel.WARN:
        console.warn(`[${logEntry.service.toUpperCase()}] ${logEntry.message}`, logData);
        break;
      case LogLevel.ERROR:
        console.error(`[${logEntry.service.toUpperCase()}] ${logEntry.message}`, logData);
        break;
      case LogLevel.CRITICAL:
        console.error(`[${logEntry.service.toUpperCase()}] CRITICAL: ${logEntry.message}`, logData);
        break;
    }
  }

  /**
   * Send log to CloudWatch (in production, this would use AWS SDK)
   * @param logEntry - Log entry to send
   */
  private logToCloudWatch(logEntry: LogEntry): void {
    // In a real implementation, this would use AWS CloudWatch Logs SDK
    // For now, we'll format it as a CloudWatch-compatible JSON log
    const cloudWatchLog = {
      '@timestamp': logEntry.timestamp,
      '@level': logEntry.level,
      '@service': logEntry.service,
      '@message': logEntry.message,
      '@fields': logEntry.context,
      ...(logEntry.error && { '@error': logEntry.error })
    };

    // In production, you would use:
    // await cloudWatchLogs.putLogEvents({
    //   logGroupName: `/aws/lambda/${this.config.service}`,
    //   logStreamName: context.logStreamName,
    //   logEvents: [{
    //     timestamp: Date.now(),
    //     message: JSON.stringify(cloudWatchLog)
    //   }]
    // }).promise();

    // For development/testing, we'll just format it properly
    if (process.env['NODE_ENV'] !== 'test') {
      console.log('CloudWatch Log:', JSON.stringify(cloudWatchLog));
    }
  }

  /**
   * Track metrics for monitoring
   * @param level - Log level
   * @param context - Log context
   */
  private trackMetrics(level: LogLevel, context?: LogContext): void {
    // Track log level metrics
    const levelKey = `log_${level}`;
    this.metrics.set(levelKey, (this.metrics.get(levelKey) || 0) + 1);

    // Track specific metrics from context
    if (context) {
      if (context.cacheHit !== undefined) {
        const cacheKey = context.cacheHit ? 'cache_hit' : 'cache_miss';
        this.metrics.set(cacheKey, (this.metrics.get(cacheKey) || 0) + 1);
      }

      if (context.source) {
        const sourceKey = `source_${context.source}`;
        this.metrics.set(sourceKey, (this.metrics.get(sourceKey) || 0) + 1);
      }

      if (context.duration) {
        this.trackDurationMetric(context.duration);
      }
    }

    // Reset metrics every hour
    const now = new Date();
    if (now.getTime() - this.lastMetricsReset.getTime() > 3600000) {
      this.publishMetrics();
      this.metrics.clear();
      this.lastMetricsReset = now;
    }
  }

  /**
   * Track duration metrics with percentiles
   * @param duration - Duration in milliseconds
   */
  private trackDurationMetric(duration: number): void {
    // Track duration buckets for percentile calculation
    const buckets = [
      { name: 'duration_0_100ms', min: 0, max: 100 },
      { name: 'duration_100_500ms', min: 100, max: 500 },
      { name: 'duration_500_1000ms', min: 500, max: 1000 },
      { name: 'duration_1000_5000ms', min: 1000, max: 5000 },
      { name: 'duration_5000ms_plus', min: 5000, max: Infinity }
    ];

    for (const bucket of buckets) {
      if (duration >= bucket.min && duration < bucket.max) {
        this.metrics.set(bucket.name, (this.metrics.get(bucket.name) || 0) + 1);
        break;
      }
    }
  }

  /**
   * Publish metrics to CloudWatch (in production)
   */
  private publishMetrics(): void {
    if (this.metrics.size === 0) return;

    const metricsData = Array.from(this.metrics.entries()).map(([name, value]) => ({
      MetricName: name,
      Value: value,
      Unit: 'Count',
      Timestamp: new Date()
    }));

    // In production, you would use:
    // await cloudWatch.putMetricData({
    //   Namespace: 'SolanaErrorAPI',
    //   MetricData: metricsData
    // }).promise();

    if (process.env['NODE_ENV'] !== 'test') {
      console.log('CloudWatch Metrics:', JSON.stringify(metricsData, null, 2));
    }
  }

  /**
   * Get current metrics for monitoring
   * @returns Current metrics
   */
  public getMetrics(): Record<string, number> {
    return Object.fromEntries(this.metrics.entries());
  }

  /**
   * Reset metrics manually
   */
  public resetMetrics(): void {
    this.metrics.clear();
    this.lastMetricsReset = new Date();
  }

  /**
   * Create child logger with additional context
   * @param context - Additional context for child logger
   * @returns Child logger instance
   */
  public child(context: LogContext): ChildLogger {
    return new ChildLogger(this, context);
  }

  /**
   * Update logger configuration
   * @param config - New configuration
   */
  public updateConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Child logger that inherits from parent with additional context
 */
export class ChildLogger {
  constructor(
    private parent: StructuredLogger,
    private baseContext: LogContext
  ) {}

  debug(message: string, context?: LogContext): void {
    this.parent.debug(message, { ...this.baseContext, ...context });
  }

  info(message: string, context?: LogContext): void {
    this.parent.info(message, { ...this.baseContext, ...context });
  }

  warn(message: string, context?: LogContext): void {
    this.parent.warn(message, { ...this.baseContext, ...context });
  }

  error(message: string, context?: LogContext, error?: Error): void {
    this.parent.error(message, { ...this.baseContext, ...context }, error);
  }

  critical(message: string, context?: LogContext, error?: Error): void {
    this.parent.critical(message, { ...this.baseContext, ...context }, error);
  }
}

/**
 * Default logger instance
 */
export const logger = new StructuredLogger({
  service: 'solana-error-api',
  level: (process.env['LOG_LEVEL'] as LogLevel) || LogLevel.INFO,
  enableCloudWatch: process.env['NODE_ENV'] === 'production',
  enableConsole: true,
  enableMetrics: true
});

/**
 * Performance logging utility
 */
export class PerformanceLogger {
  private startTime: number;
  private logger: StructuredLogger;
  private context: LogContext;

  constructor(logger: StructuredLogger, operation: string, context?: LogContext) {
    this.startTime = Date.now();
    this.logger = logger;
    this.context = { operation, ...context };
  }

  /**
   * End performance measurement and log result
   * @param additionalContext - Additional context to include
   */
  end(additionalContext?: LogContext): void {
    const duration = Date.now() - this.startTime;
    const finalContext = { 
      ...this.context, 
      duration, 
      ...additionalContext 
    };

    if (duration > 5000) {
      this.logger.warn('Slow operation detected', finalContext);
    } else if (duration > 1000) {
      this.logger.info('Operation completed', finalContext);
    } else {
      this.logger.debug('Operation completed', finalContext);
    }
  }
}

/**
 * Create performance logger
 * @param operation - Operation name
 * @param context - Additional context
 * @returns Performance logger instance
 */
export function createPerformanceLogger(operation: string, context?: LogContext): PerformanceLogger {
  return new PerformanceLogger(logger, operation, context);
}