/**
 * Global error handling utilities for the Solana Error API
 * Requirements: 5.4, 6.6, 7.4 - Comprehensive error handling and logging
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import { ErrorResponseError } from '../types/api';

/**
 * Error categories for classification and handling
 */
export enum ErrorCategory {
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  RATE_LIMIT = 'rate_limit',
  SERVICE_UNAVAILABLE = 'service_unavailable',
  TIMEOUT = 'timeout',
  INTERNAL = 'internal',
  EXTERNAL_API = 'external_api',
  CACHE = 'cache',
  AI_SERVICE = 'ai_service'
}

/**
 * Error severity levels for logging and monitoring
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Structured error information for logging and monitoring
 */
export interface ErrorInfo {
  category: ErrorCategory;
  severity: ErrorSeverity;
  statusCode: number;
  message: string;
  userMessage: string;
  retryable: boolean;
  context?: Record<string, any>;
  originalError?: Error;
}

/**
 * Custom error class with enhanced information
 */
export class APIError extends Error {
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly statusCode: number;
  public readonly userMessage: string;
  public readonly retryable: boolean;
  public readonly context: Record<string, any>;
  public readonly timestamp: Date;

  constructor(errorInfo: ErrorInfo) {
    super(errorInfo.message);
    this.name = 'APIError';
    this.category = errorInfo.category;
    this.severity = errorInfo.severity;
    this.statusCode = errorInfo.statusCode;
    this.userMessage = errorInfo.userMessage;
    this.retryable = errorInfo.retryable;
    this.context = errorInfo.context || {};
    this.timestamp = new Date();

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, APIError);
    }
  }
}

/**
 * Global error handler class for consistent error processing
 */
export class GlobalErrorHandler {
  private static instance: GlobalErrorHandler;
  private errorCounts: Map<string, number> = new Map();
  private lastErrorReset: Date = new Date();

  private constructor() {}

  /**
   * Get singleton instance of GlobalErrorHandler
   */
  public static getInstance(): GlobalErrorHandler {
    if (!GlobalErrorHandler.instance) {
      GlobalErrorHandler.instance = new GlobalErrorHandler();
    }
    return GlobalErrorHandler.instance;
  }

  /**
   * Handle and categorize errors with appropriate responses
   * @param error - The error to handle
   * @param context - Additional context information
   * @returns API Gateway response
   */
  public handleError(error: unknown, context?: Record<string, any>): APIGatewayProxyResult {
    const errorInfo = this.categorizeError(error, context);
    
    // Log the error with structured information
    this.logError(errorInfo);
    
    // Track error metrics
    this.trackErrorMetrics(errorInfo);
    
    // Create appropriate API response
    return this.createErrorResponse(errorInfo);
  }

  /**
   * Categorize errors based on type and content
   * @param error - The error to categorize
   * @param context - Additional context
   * @returns ErrorInfo with categorization
   */
  private categorizeError(error: unknown, context?: Record<string, any>): ErrorInfo {
    // Handle APIError instances
    if (error instanceof APIError) {
      return {
        category: error.category,
        severity: error.severity,
        statusCode: error.statusCode,
        message: error.message,
        userMessage: error.userMessage,
        retryable: error.retryable,
        context: { ...error.context, ...context },
        originalError: error
      };
    }

    // Handle standard Error instances
    if (error instanceof Error) {
      return this.categorizeStandardError(error, context);
    }

    // Handle unknown error types
    return {
      category: ErrorCategory.INTERNAL,
      severity: ErrorSeverity.HIGH,
      statusCode: 500,
      message: 'Unknown error occurred',
      userMessage: 'An unexpected error occurred. Please try again.',
      retryable: true,
      context: { error: String(error), ...context }
    };
  }

  /**
   * Categorize standard Error instances based on message content
   * @param error - Standard Error instance
   * @param context - Additional context
   * @returns ErrorInfo with categorization
   */
  private categorizeStandardError(error: Error, context?: Record<string, any>): ErrorInfo {
    const message = error.message.toLowerCase();

    // Validation errors
    if (message.includes('invalid') || message.includes('required') || 
        message.includes('missing') || message.includes('malformed') ||
        message.includes('method') || message.includes('not allowed') ||
        message.includes('endpoint') || message.includes('not found')) {
      return {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.LOW,
        statusCode: message.includes('method') && message.includes('not allowed') ? 405 :
                   message.includes('endpoint') && message.includes('not found') ? 404 : 400,
        message: error.message,
        userMessage: error.message, // Use the specific error message for validation errors
        retryable: false,
        context: context || {},
        originalError: error
      };
    }

    // Rate limiting errors
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return {
        category: ErrorCategory.RATE_LIMIT,
        severity: ErrorSeverity.MEDIUM,
        statusCode: 429,
        message: error.message,
        userMessage: 'Rate limit exceeded. Please wait before making another request.',
        retryable: true,
        context: context || {},
        originalError: error
      };
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('timed out')) {
      return {
        category: ErrorCategory.TIMEOUT,
        severity: ErrorSeverity.MEDIUM,
        statusCode: 504,
        message: error.message,
        userMessage: 'Request timed out. Please try again.',
        retryable: true,
        context: context || {},
        originalError: error
      };
    }

    // AI service specific errors (check before general service errors)
    if (message.includes('bedrock') || message.includes('anthropic') || 
        message.includes('ai service') || message.includes('model')) {
      return {
        category: ErrorCategory.AI_SERVICE,
        severity: ErrorSeverity.HIGH,
        statusCode: 503,
        message: error.message,
        userMessage: 'AI service temporarily unavailable. Please try again later.',
        retryable: true,
        context: context || {},
        originalError: error
      };
    }

    // Cache errors (check before general service errors)
    if (message.includes('dynamodb') || message.includes('cache') || 
        message.includes('redis')) {
      return {
        category: ErrorCategory.CACHE,
        severity: ErrorSeverity.MEDIUM,
        statusCode: 503,
        message: error.message,
        userMessage: 'Cache service temporarily unavailable. Request may be slower.',
        retryable: true,
        context: context || {},
        originalError: error
      };
    }

    // External API errors (check for specific external API terms)
    if (message.includes('external api') || message.includes('external') || 
        message.includes('http')) {
      return {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        statusCode: 503,
        message: error.message,
        userMessage: 'External service temporarily unavailable. Please try again later.',
        retryable: true,
        context: context || {},
        originalError: error
      };
    }

    // Service unavailable errors (general catch-all)
    if (message.includes('unavailable') || message.includes('service') ||
        message.includes('connection') || message.includes('network')) {
      return {
        category: ErrorCategory.SERVICE_UNAVAILABLE,
        severity: ErrorSeverity.HIGH,
        statusCode: 503,
        message: error.message,
        userMessage: 'Service temporarily unavailable. Please try again later.',
        retryable: true,
        context: context || {},
        originalError: error
      };
    }

    // Default to internal error
    return {
      category: ErrorCategory.INTERNAL,
      severity: ErrorSeverity.HIGH,
      statusCode: 500,
      message: error.message,
      userMessage: 'Internal server error. Please try again.',
      retryable: true,
      context: context || {},
      originalError: error
    };
  }

  /**
   * Log error with structured information
   * @param errorInfo - Error information to log
   */
  private logError(errorInfo: ErrorInfo): void {
    const logData = {
      timestamp: new Date().toISOString(),
      category: errorInfo.category,
      severity: errorInfo.severity,
      statusCode: errorInfo.statusCode,
      message: errorInfo.message,
      userMessage: errorInfo.userMessage,
      retryable: errorInfo.retryable,
      context: errorInfo.context,
      stack: errorInfo.originalError?.stack
    };

    // Log based on severity level
    switch (errorInfo.severity) {
      case ErrorSeverity.CRITICAL:
        console.error('[CRITICAL ERROR]', logData);
        break;
      case ErrorSeverity.HIGH:
        console.error('[HIGH ERROR]', logData);
        break;
      case ErrorSeverity.MEDIUM:
        console.warn('[MEDIUM ERROR]', logData);
        break;
      case ErrorSeverity.LOW:
        console.info('[LOW ERROR]', logData);
        break;
      default:
        console.error('[ERROR]', logData);
    }
  }

  /**
   * Track error metrics for monitoring
   * @param errorInfo - Error information for metrics
   */
  private trackErrorMetrics(errorInfo: ErrorInfo): void {
    const fullKey = `${errorInfo.category}:${errorInfo.statusCode}`;
    
    // Track by full key only
    const currentCount = this.errorCounts.get(fullKey) || 0;
    this.errorCounts.set(fullKey, currentCount + 1);

    // Reset counters every hour
    const now = new Date();
    if (now.getTime() - this.lastErrorReset.getTime() > 3600000) {
      this.errorCounts.clear();
      this.lastErrorReset = now;
    }

    // Log metrics for high-frequency errors
    if (currentCount > 0 && currentCount % 10 === 0) {
      console.warn('[ERROR METRICS]', {
        errorType: fullKey,
        count: currentCount + 1,
        timeWindow: '1 hour',
        timestamp: now.toISOString()
      });
    }
  }

  /**
   * Create API Gateway error response
   * @param errorInfo - Error information
   * @returns API Gateway response
   */
  private createErrorResponse(errorInfo: ErrorInfo): APIGatewayProxyResult {
    const errorResponse: ErrorResponseError = {
      error: errorInfo.userMessage,
      code: errorInfo.statusCode,
      timestamp: new Date().toISOString()
    };

    // Add retry information for retryable errors
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Amz-Date, Authorization, X-Api-Key, X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };

    // Add retry-after header for retryable errors
    if (errorInfo.retryable) {
      const retryAfter = this.calculateRetryAfter(errorInfo);
      if (retryAfter > 0) {
        headers['Retry-After'] = retryAfter.toString();
      }
    }

    return {
      statusCode: errorInfo.statusCode,
      headers,
      body: JSON.stringify(errorResponse)
    };
  }

  /**
   * Calculate appropriate retry-after time based on error type
   * @param errorInfo - Error information
   * @returns Retry-after time in seconds
   */
  private calculateRetryAfter(errorInfo: ErrorInfo): number {
    switch (errorInfo.category) {
      case ErrorCategory.RATE_LIMIT:
        return 60; // 1 minute
      case ErrorCategory.TIMEOUT:
        return 5; // 5 seconds
      case ErrorCategory.SERVICE_UNAVAILABLE:
      case ErrorCategory.AI_SERVICE:
        return 30; // 30 seconds
      case ErrorCategory.CACHE:
        return 10; // 10 seconds
      case ErrorCategory.EXTERNAL_API:
        return 15; // 15 seconds
      default:
        return 0; // No retry-after for other errors
    }
  }

  /**
   * Get error statistics for monitoring
   * @returns Error statistics
   */
  public getErrorStats(): Record<string, any> {
    const stats: Record<string, any> = {
      totalErrors: 0,
      errorsByCategory: {},
      lastReset: this.lastErrorReset.toISOString()
    };

    for (const [key, count] of this.errorCounts.entries()) {
      // All keys are now full keys (category:statusCode)
      stats['totalErrors'] += count;
      const [category] = key.split(':');
      if (category) {
        stats['errorsByCategory'][category] = (stats['errorsByCategory'][category] || 0) + count;
      }
    }

    return stats;
  }

  /**
   * Reset error statistics
   */
  public resetErrorStats(): void {
    this.errorCounts.clear();
    this.lastErrorReset = new Date();
  }
}

/**
 * Convenience functions for creating specific error types
 */
export const ErrorFactory = {
  /**
   * Create validation error
   */
  validation: (message: string, context?: Record<string, any>): APIError => {
    // Determine status code based on message content
    const statusCode = message.includes('Method') && message.includes('not allowed') ? 405 :
                      message.includes('Endpoint') && message.includes('not found') ? 404 : 400;
    
    return new APIError({
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.LOW,
      statusCode,
      message,
      userMessage: message, // Use the specific message for validation errors
      retryable: false,
      context: context || {}
    });
  },

  /**
   * Create rate limit error
   */
  rateLimit: (message: string, retryAfter?: number, context?: Record<string, any>): APIError => {
    return new APIError({
      category: ErrorCategory.RATE_LIMIT,
      severity: ErrorSeverity.MEDIUM,
      statusCode: 429,
      message,
      userMessage: 'Rate limit exceeded. Please wait before making another request.',
      retryable: true,
      context: { retryAfter, ...context }
    });
  },

  /**
   * Create timeout error
   */
  timeout: (message: string, context?: Record<string, any>): APIError => {
    return new APIError({
      category: ErrorCategory.TIMEOUT,
      severity: ErrorSeverity.MEDIUM,
      statusCode: 504,
      message,
      userMessage: 'Request timed out. Please try again.',
      retryable: true,
      context: context || {}
    });
  },

  /**
   * Create service unavailable error
   */
  serviceUnavailable: (message: string, context?: Record<string, any>): APIError => {
    return new APIError({
      category: ErrorCategory.SERVICE_UNAVAILABLE,
      severity: ErrorSeverity.HIGH,
      statusCode: 503,
      message,
      userMessage: 'Service temporarily unavailable. Please try again later.',
      retryable: true,
      context: context || {}
    });
  },

  /**
   * Create internal error
   */
  internal: (message: string, context?: Record<string, any>): APIError => {
    return new APIError({
      category: ErrorCategory.INTERNAL,
      severity: ErrorSeverity.HIGH,
      statusCode: 500,
      message,
      userMessage: 'Internal server error. Please try again.',
      retryable: true,
      context: context || {}
    });
  }
};

/**
 * Global error handler instance
 */
export const globalErrorHandler = GlobalErrorHandler.getInstance();