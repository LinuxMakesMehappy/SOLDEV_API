/**
 * Fallback service that provides error explanations when AI services are unavailable
 * Requirement 3.4: Static fallback when AI services are unavailable
 * Requirement 3.6: Fallback response mechanisms
 */

import { ErrorExplanation, AIExplanation } from '../types/api';
import { ValidatedEnvironmentConfig } from '../types/environment';
import { StaticErrorDatabase } from './static-error-database';
import { CompositeAIService } from './composite-ai-service';

/**
 * Service availability status
 */
interface ServiceAvailability {
  ai: boolean;
  static: boolean;
  lastAIAttempt: number;
  consecutiveAIFailures: number;
}

/**
 * Fallback service configuration
 */
interface FallbackConfig {
  maxAIRetries: number;
  aiRetryDelay: number;
  aiTimeoutMs: number;
  fallbackToStaticAfterFailures: number;
}

/**
 * Fallback service that orchestrates between AI services and static database
 * Provides comprehensive error explanations with intelligent fallback logic
 */
export class FallbackService {
  private aiService: CompositeAIService;
  private availability: ServiceAvailability;
  private config: FallbackConfig;
  private recoveryTimer?: NodeJS.Timeout | undefined;

  constructor(envConfig: ValidatedEnvironmentConfig) {
    this.aiService = new CompositeAIService(envConfig);
    
    this.availability = {
      ai: true,
      static: true, // Static database is always available
      lastAIAttempt: 0,
      consecutiveAIFailures: 0
    };

    this.config = {
      maxAIRetries: 2,
      aiRetryDelay: 1000, // 1 second
      aiTimeoutMs: envConfig.awsBedrock.timeoutMs || 10000,
      fallbackToStaticAfterFailures: 3
    };
  }

  /**
   * Gets error explanation with comprehensive fallback logic
   * Requirement 3.4: Static fallback when AI services are unavailable
   * @param errorCode - The error code to explain
   * @param context - Optional context about the error
   * @returns Promise<ErrorExplanation>
   */
  async explainError(errorCode: number, context?: string): Promise<ErrorExplanation> {
    // Check if we should skip AI due to consecutive failures
    const shouldSkipAI = this.availability.consecutiveAIFailures >= this.config.fallbackToStaticAfterFailures;
    
    // Try AI services first if available and not in failure mode
    if (this.availability.ai && !shouldSkipAI) {
      try {
        const aiExplanation = await this.tryAIExplanation(errorCode, context);
        if (aiExplanation) {
          // Reset failure count on success
          this.availability.consecutiveAIFailures = 0;
          this.availability.lastAIAttempt = Date.now();
          
          return {
            code: errorCode,
            explanation: aiExplanation.explanation,
            fixes: aiExplanation.fixes,
            source: 'ai',
            confidence: aiExplanation.confidence
          };
        }
      } catch (error) {
        console.warn(`AI service failed for error code ${errorCode}:`, error);
        this.handleAIFailure();
      }
    }

    // Fallback to static database
    console.log(`Using static fallback for error code ${errorCode}`);
    return this.getStaticExplanation(errorCode);
  }

  /**
   * Attempts to get AI explanation with timeout and retry logic
   * @param errorCode - The error code to explain
   * @param context - Optional context
   * @returns Promise<AIExplanation | null>
   */
  private async tryAIExplanation(errorCode: number, context?: string): Promise<AIExplanation | null> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxAIRetries; attempt++) {
      try {
        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('AI request timeout')), this.config.aiTimeoutMs);
        });

        // Race between AI request and timeout
        const aiPromise = this.aiService.generateExplanation(errorCode, context);
        const result = await Promise.race([aiPromise, timeoutPromise]);

        return result;
      } catch (error) {
        lastError = error as Error;
        console.warn(`AI attempt ${attempt} failed:`, error);

        // Wait before retry (except on last attempt)
        if (attempt < this.config.maxAIRetries) {
          await this.delay(this.config.aiRetryDelay * attempt);
        }
      }
    }

    // All attempts failed
    throw lastError || new Error('AI service unavailable');
  }

  /**
   * Gets static explanation from the static database
   * @param errorCode - The error code to explain
   * @returns ErrorExplanation
   */
  private getStaticExplanation(errorCode: number): ErrorExplanation {
    return StaticErrorDatabase.explainError(errorCode);
  }

  /**
   * Handles AI service failure by updating availability status
   */
  private handleAIFailure(): void {
    this.availability.consecutiveAIFailures++;
    this.availability.lastAIAttempt = Date.now();

    // Mark AI as unavailable after too many failures
    if (this.availability.consecutiveAIFailures >= this.config.fallbackToStaticAfterFailures) {
      this.availability.ai = false;
      console.warn(`AI service marked as unavailable after ${this.availability.consecutiveAIFailures} consecutive failures`);
      
      // Schedule recovery check
      this.scheduleAIRecoveryCheck();
    }
  }

  /**
   * Schedules a check to see if AI services have recovered
   */
  private scheduleAIRecoveryCheck(): void {
    // Clear any existing timer
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
    }

    const recoveryDelay = 60000; // 1 minute
    
    this.recoveryTimer = setTimeout(async () => {
      try {
        // Try a simple health check
        const healthStatus = await this.aiService.forceHealthCheck();
        
        if (healthStatus.bedrock || healthStatus.external) {
          console.log('AI service recovery detected, resetting failure count');
          this.availability.ai = true;
          this.availability.consecutiveAIFailures = 0;
        } else {
          // Schedule another check
          this.scheduleAIRecoveryCheck();
        }
      } catch (error) {
        console.warn('AI recovery check failed:', error);
        // Schedule another check
        this.scheduleAIRecoveryCheck();
      }
    }, recoveryDelay);
  }

  /**
   * Gets the current service availability status
   * @returns ServiceAvailability
   */
  getAvailability(): ServiceAvailability {
    return { ...this.availability };
  }

  /**
   * Checks if static explanation is available for the error code
   * @param errorCode - The error code to check
   * @returns boolean
   */
  hasStaticExplanation(errorCode: number): boolean {
    return StaticErrorDatabase.hasStaticExplanation(errorCode);
  }

  /**
   * Gets all available error codes in the static database
   * @returns Array of error codes
   */
  getAvailableStaticErrorCodes(): number[] {
    return StaticErrorDatabase.getAvailableErrorCodes();
  }

  /**
   * Forces AI service availability check
   * @returns Promise<boolean> - true if any AI service is available
   */
  async checkAIAvailability(): Promise<boolean> {
    try {
      const healthStatus = await this.aiService.forceHealthCheck();
      const isAvailable = healthStatus.bedrock || healthStatus.external;
      
      if (isAvailable && !this.availability.ai) {
        // AI services recovered
        this.availability.ai = true;
        this.availability.consecutiveAIFailures = 0;
        console.log('AI services are now available');
      } else if (!isAvailable && this.availability.ai) {
        // AI services went down
        this.availability.ai = false;
        console.warn('AI services are currently unavailable');
      }
      
      return isAvailable;
    } catch (error) {
      console.warn('AI availability check failed:', error);
      return false;
    }
  }

  /**
   * Gets service statistics for monitoring
   * @returns Service statistics object
   */
  getServiceStats() {
    return {
      aiAvailable: this.availability.ai,
      staticAvailable: this.availability.static,
      consecutiveAIFailures: this.availability.consecutiveAIFailures,
      lastAIAttempt: this.availability.lastAIAttempt,
      aiServicesCount: this.aiService.getAvailableServicesCount(),
      preferredAIService: this.aiService.getPreferredService(),
      staticErrorCodesCount: StaticErrorDatabase.getAvailableErrorCodes().length
    };
  }

  /**
   * Utility method to create a delay
   * @param ms - Milliseconds to delay
   * @returns Promise that resolves after the delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup method to stop background processes
   */
  cleanup(): void {
    // Clear any pending recovery timer
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = undefined;
    }
    
    this.aiService.cleanup();
  }
}

/**
 * Factory function to create FallbackService instance
 * @param envConfig - Validated environment configuration
 * @returns FallbackService instance
 */
export function createFallbackService(envConfig: ValidatedEnvironmentConfig): FallbackService {
  return new FallbackService(envConfig);
}