/**
 * Main error explanation service that orchestrates all components
 * Requirements: 2.4, 2.5, 2.6, 7.1, 7.2
 */

import { ErrorExplanation } from '../types/api';
import { ValidatedErrorCode, ErrorCodeValidator } from '../models/error-models';
import { ValidatedEnvironmentConfig } from '../types/environment';
import { CacheService, CompositeCacheService } from './cache-service';
import { FallbackService } from './fallback-service';
import { PerformanceMonitor, PerformanceMetrics } from './performance-monitor';

/**
 * Service flow metrics for monitoring and debugging
 */
interface ServiceFlowMetrics {
  validationTime: number;
  mappingTime: number;
  cacheCheckTime: number;
  aiProcessingTime: number;
  totalTime: number;
  cacheHit: boolean;
  source: 'cache' | 'ai' | 'static';
  errorCode: number;
}

/**
 * Error explanation service configuration
 */
interface ErrorExplanationServiceConfig {
  enableMetrics: boolean;
  enableDetailedLogging: boolean;
  maxProcessingTimeMs: number;
}

/**
 * Main error explanation service that orchestrates the complete flow:
 * validation → mapping → cache check → AI/fallback → response
 * 
 * Requirements:
 * - 2.4: AI-generated explanations with context
 * - 2.5: Caching for performance optimization
 * - 2.6: Fallback mechanisms for reliability
 * - 7.1: Fast response times (<500ms cached, <10s AI)
 * - 7.2: Comprehensive error handling and logging
 */
export class ErrorExplanationService {
  private cacheService: CacheService;
  private fallbackService: FallbackService;
  private config: ErrorExplanationServiceConfig;
  private envConfig: ValidatedEnvironmentConfig;
  private performanceMonitor: PerformanceMonitor;

  constructor(envConfig: ValidatedEnvironmentConfig) {
    this.envConfig = envConfig;
    this.cacheService = new CompositeCacheService(envConfig);
    this.fallbackService = new FallbackService(envConfig);
    this.performanceMonitor = new PerformanceMonitor(envConfig.aws.region);
    
    this.config = {
      enableMetrics: envConfig.logging.level === 'debug',
      enableDetailedLogging: ['debug', 'info'].includes(envConfig.logging.level),
      maxProcessingTimeMs: 10000 // 10 seconds max processing time
    };

    this.logInfo('ErrorExplanationService initialized', {
      cacheEnabled: true,
      fallbackEnabled: true,
      metricsEnabled: this.config.enableMetrics
    });
  }

  /**
   * Main method to explain an error code with complete orchestration
   * Requirement 2.4, 2.5, 2.6: Complete error explanation flow
   * @param errorCodeInput - Raw error code input (number or string)
   * @param context - Optional context about the error
   * @returns Promise<ErrorExplanation>
   */
  async explainError(errorCodeInput: number | string, context?: string): Promise<ErrorExplanation> {
    const startTime = Date.now();
    let metrics: Partial<ServiceFlowMetrics> = {
      errorCode: 0,
      cacheHit: false,
      source: 'static'
    };

    try {
      // Step 1: Input validation and sanitization
      // Requirement 7.2: Comprehensive error handling
      const validationStart = Date.now();
      const validatedCode = this.validateInput(errorCodeInput);
      metrics.validationTime = Date.now() - validationStart;
      metrics.errorCode = validatedCode.code;

      this.logDebug('Input validation completed', {
        originalInput: errorCodeInput,
        validatedCode: validatedCode.code,
        type: validatedCode.type,
        validationTime: metrics.validationTime
      });

      // Step 2: Error code mapping and classification
      // Requirement 2.4: Error code mapping and classification
      const mappingStart = Date.now();
      const mappingContext = this.createMappingContext(validatedCode, context);
      metrics.mappingTime = Date.now() - mappingStart;

      this.logDebug('Error code mapping completed', {
        errorCode: validatedCode.code,
        type: validatedCode.type,
        mappingTime: metrics.mappingTime
      });

      // Step 3: Cache lookup
      // Requirement 2.5: Cache check for performance optimization
      const cacheStart = Date.now();
      const cacheKey = this.generateCacheKey(validatedCode.code, mappingContext);
      const cachedResult = await this.checkCache(cacheKey);
      metrics.cacheCheckTime = Date.now() - cacheStart;

      if (cachedResult) {
        metrics.cacheHit = true;
        metrics.source = 'cache';
        metrics.totalTime = Date.now() - startTime;

        this.logInfo('Cache hit - returning cached result', {
          errorCode: validatedCode.code,
          cacheKey,
          totalTime: metrics.totalTime
        });

        if (this.config.enableMetrics) {
          this.logMetrics(metrics as ServiceFlowMetrics);
        }

        return cachedResult;
      }

      this.logDebug('Cache miss - proceeding to AI/fallback', {
        errorCode: validatedCode.code,
        cacheKey,
        cacheCheckTime: metrics.cacheCheckTime
      });

      // Step 4: AI/Fallback processing
      // Requirement 2.6: AI integration with fallback mechanisms
      const aiStart = Date.now();
      const explanation = await this.processWithAIOrFallback(validatedCode, mappingContext);
      metrics.aiProcessingTime = Date.now() - aiStart;
      metrics.source = explanation.source;

      // Step 5: Cache the result for future requests
      // Requirement 2.5: Store result in cache
      await this.cacheResult(cacheKey, explanation);

      metrics.totalTime = Date.now() - startTime;

      this.logInfo('Error explanation completed', {
        errorCode: validatedCode.code,
        source: explanation.source,
        totalTime: metrics.totalTime,
        aiProcessingTime: metrics.aiProcessingTime
      });

      if (this.config.enableMetrics) {
        this.logMetrics(metrics as ServiceFlowMetrics);
      }

      // Record performance metrics
      await this.recordPerformanceMetrics(validatedCode.code, metrics as ServiceFlowMetrics, explanation);

      return explanation;

    } catch (error) {
      metrics.totalTime = Date.now() - startTime;
      
      this.logError('Error explanation failed', {
        errorCodeInput,
        error: error instanceof Error ? error.message : 'Unknown error',
        totalTime: metrics.totalTime
      });

      // Requirement 7.2: Comprehensive error handling with fallback
      return this.handleServiceError(error, metrics.errorCode || 0);
    }
  }

  /**
   * Validates and sanitizes input error code
   * Requirement 7.2: Input validation and error handling
   * @param input - Raw error code input
   * @returns ValidatedErrorCode
   */
  private validateInput(input: number | string): ValidatedErrorCode {
    try {
      return ErrorCodeValidator.validate(input);
    } catch (error) {
      this.logError('Input validation failed', {
        input,
        error: error instanceof Error ? error.message : 'Unknown validation error'
      });
      throw new Error(`Invalid error code: ${error instanceof Error ? error.message : 'Unknown validation error'}`);
    }
  }

  /**
   * Creates mapping context for error processing
   * @param validatedCode - Validated error code
   * @param userContext - Optional user-provided context
   * @returns Mapping context string
   */
  private createMappingContext(validatedCode: ValidatedErrorCode, userContext?: string): string {
    const contexts = [
      `Error type: ${validatedCode.type}`,
      `Original input: ${validatedCode.originalInput}`
    ];

    if (userContext) {
      contexts.push(`User context: ${userContext}`);
    }

    // Add type-specific context
    if (validatedCode.type === 'standard') {
      contexts.push('Standard Solana runtime error');
    } else if (validatedCode.type === 'anchor_constraint') {
      contexts.push('Anchor framework constraint violation');
    } else if (validatedCode.type === 'custom') {
      contexts.push('Custom program-specific error');
    }

    return contexts.join('; ');
  }

  /**
   * Generates cache key for error code and context
   * @param errorCode - Error code number
   * @param _context - Mapping context (currently unused, reserved for future context-aware caching)
   * @returns Cache key string
   */
  private generateCacheKey(errorCode: number, _context: string): string {
    // For now, we'll use simple error code-based caching
    // In the future, we could include context hash for more granular caching
    return `error_${errorCode}`;
  }

  /**
   * Checks cache for existing explanation
   * Requirement 2.5: Cache lookup for performance
   * @param cacheKey - Cache key to lookup
   * @returns Promise<ErrorExplanation | null>
   */
  private async checkCache(cacheKey: string): Promise<ErrorExplanation | null> {
    try {
      const result = await this.cacheService.get(cacheKey);
      if (result) {
        // Ensure the result has the cache source
        return {
          ...result,
          source: 'cache'
        };
      }
      return null;
    } catch (error) {
      this.logWarn('Cache lookup failed, proceeding without cache', {
        cacheKey,
        error: error instanceof Error ? error.message : 'Unknown cache error'
      });
      return null;
    }
  }

  /**
   * Processes error with AI or fallback services
   * Requirement 2.6: AI integration with comprehensive fallback
   * @param validatedCode - Validated error code
   * @param context - Mapping context
   * @returns Promise<ErrorExplanation>
   */
  private async processWithAIOrFallback(validatedCode: ValidatedErrorCode, context: string): Promise<ErrorExplanation> {
    try {
      // Create timeout promise to enforce processing time limits
      // Requirement 7.1: Response time constraints
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Processing timeout after ${this.config.maxProcessingTimeMs}ms`));
        }, this.config.maxProcessingTimeMs);
      });

      // Race between processing and timeout
      const processingPromise = this.fallbackService.explainError(validatedCode.code, context);
      const result = await Promise.race([processingPromise, timeoutPromise]);

      return result;
    } catch (error) {
      this.logError('AI/Fallback processing failed', {
        errorCode: validatedCode.code,
        error: error instanceof Error ? error.message : 'Unknown processing error'
      });
      
      // Final fallback - should never fail
      return {
        code: validatedCode.code,
        explanation: `Unable to process error code ${validatedCode.code}. This may be a temporary service issue.`,
        fixes: [
          'Try again in a few moments',
          'Check Solana documentation for this error code',
          'Use solana logs for more detailed error information'
        ],
        source: 'static',
        confidence: 0.1
      };
    }
  }

  /**
   * Caches the explanation result
   * Requirement 2.5: Cache storage for future requests
   * @param cacheKey - Cache key
   * @param explanation - Explanation to cache
   */
  private async cacheResult(cacheKey: string, explanation: ErrorExplanation): Promise<void> {
    try {
      await this.cacheService.set(cacheKey, explanation, this.envConfig.cache.ttlSeconds);
      this.logDebug('Result cached successfully', {
        cacheKey,
        source: explanation.source
      });
    } catch (error) {
      this.logWarn('Failed to cache result', {
        cacheKey,
        error: error instanceof Error ? error.message : 'Unknown cache error'
      });
      // Don't throw - caching failures should not break the service
    }
  }

  /**
   * Handles service errors with appropriate fallback responses
   * Requirement 7.2: Comprehensive error handling
   * @param error - The error that occurred
   * @param errorCode - The error code being processed
   * @returns ErrorExplanation fallback response
   */
  private handleServiceError(error: unknown, errorCode: number): ErrorExplanation {
    const errorMessage = error instanceof Error ? error.message : 'Unknown service error';
    
    // Provide different fallback responses based on error type
    if (errorMessage.includes('timeout')) {
      return {
        code: errorCode,
        explanation: 'Request timed out while processing the error code. The service may be experiencing high load.',
        fixes: [
          'Try again in a few moments',
          'Check if the error code is valid',
          'Use solana logs for immediate debugging'
        ],
        source: 'static',
        confidence: 0.2
      };
    }

    if (errorMessage.includes('Invalid error code')) {
      return {
        code: errorCode,
        explanation: 'The provided error code format is invalid. Please check the error code and try again.',
        fixes: [
          'Ensure error code is a number between 0 and 4294967295',
          'For hex format, use "0x" prefix (e.g., "0x1770")',
          'Verify the error code from your transaction logs'
        ],
        source: 'static',
        confidence: 0.8
      };
    }

    // Generic service error fallback
    return {
      code: errorCode,
      explanation: 'A service error occurred while processing your request. Please try again.',
      fixes: [
        'Try again in a few moments',
        'Check if your error code is valid',
        'Contact support if the issue persists'
      ],
      source: 'static',
      confidence: 0.1
    };
  }

  /**
   * Gets service health status for monitoring
   * @returns Service health information
   */
  async getHealthStatus(): Promise<{
    healthy: boolean;
    services: {
      cache: boolean;
      fallback: any;
    };
    timestamp: number;
  }> {
    try {
      const fallbackStats = this.fallbackService.getServiceStats();
      
      return {
        healthy: true,
        services: {
          cache: true, // Composite cache always reports healthy
          fallback: fallbackStats
        },
        timestamp: Date.now()
      };
    } catch (error) {
      this.logError('Health check failed', {
        error: error instanceof Error ? error.message : 'Unknown health check error'
      });
      
      return {
        healthy: false,
        services: {
          cache: false,
          fallback: null
        },
        timestamp: Date.now()
      };
    }
  }

  /**
   * Gets service performance metrics
   * @returns Performance metrics object
   */
  getPerformanceMetrics(): {
    cacheStatus: any;
    fallbackStats: any;
  } {
    return {
      cacheStatus: (this.cacheService as CompositeCacheService).getStatus(),
      fallbackStats: this.fallbackService.getServiceStats()
    };
  }

  /**
   * Record performance metrics for monitoring
   */
  private async recordPerformanceMetrics(
    errorCode: number,
    metrics: ServiceFlowMetrics,
    explanation: ErrorExplanation
  ): Promise<void> {
    try {
      const performanceMetrics: PerformanceMetrics = {
        responseTime: metrics.totalTime,
        cacheHit: metrics.cacheHit,
        aiLatency: metrics.aiProcessingTime,
        errorCode,
        source: explanation.source as 'cache' | 'ai' | 'static',
        timestamp: Date.now()
      };

      await this.performanceMonitor.recordMetrics(performanceMetrics);
    } catch (error) {
      this.logError('Failed to record performance metrics', {
        error: error instanceof Error ? error.message : 'Unknown metrics error'
      });
    }
  }

  /**
   * Cleanup method to properly shutdown the service
   */
  cleanup(): void {
    this.logInfo('Cleaning up ErrorExplanationService');
    this.fallbackService.cleanup();
    this.performanceMonitor.cleanup();
  }

  // Logging methods with different levels
  // Requirement 7.2: Comprehensive logging throughout the service

  private logDebug(message: string, data?: any): void {
    if (this.envConfig.logging.level === 'debug') {
      console.debug(`[ErrorExplanationService] ${message}`, data || '');
    }
  }

  private logInfo(message: string, data?: any): void {
    if (['debug', 'info'].includes(this.envConfig.logging.level)) {
      console.info(`[ErrorExplanationService] ${message}`, data || '');
    }
  }

  private logWarn(message: string, data?: any): void {
    if (['debug', 'info', 'warn'].includes(this.envConfig.logging.level)) {
      console.warn(`[ErrorExplanationService] ${message}`, data || '');
    }
  }

  private logError(message: string, data?: any): void {
    console.error(`[ErrorExplanationService] ${message}`, data || '');
  }

  private logMetrics(metrics: ServiceFlowMetrics): void {
    console.info(`[ErrorExplanationService] Metrics:`, {
      errorCode: metrics.errorCode,
      totalTime: `${metrics.totalTime}ms`,
      validationTime: `${metrics.validationTime}ms`,
      mappingTime: `${metrics.mappingTime}ms`,
      cacheCheckTime: `${metrics.cacheCheckTime}ms`,
      aiProcessingTime: `${metrics.aiProcessingTime}ms`,
      cacheHit: metrics.cacheHit,
      source: metrics.source,
      performance: metrics.totalTime < 500 ? 'excellent' : metrics.totalTime < 2000 ? 'good' : 'slow'
    });
  }
}

/**
 * Factory function to create ErrorExplanationService instance
 * @param envConfig - Validated environment configuration
 * @returns ErrorExplanationService instance
 */
export function createErrorExplanationService(envConfig: ValidatedEnvironmentConfig): ErrorExplanationService {
  return new ErrorExplanationService(envConfig);
}