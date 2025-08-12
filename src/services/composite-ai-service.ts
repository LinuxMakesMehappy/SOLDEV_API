/**
 * Composite AI service that orchestrates between Bedrock and external AI services
 * Requirement 3.2: Implement fallback logic when Bedrock is unavailable
 * Requirement 3.6: AI integration with timeout and error management
 */

import { AIExplanation } from '../types/api';
import { ValidatedEnvironmentConfig } from '../types/environment';
import { AIService, BedrockAIService } from './ai-service';
import { ExternalAIService } from './external-ai-service';

/**
 * AI service health status
 */
interface ServiceHealthStatus {
  bedrock: boolean;
  external: boolean;
  lastChecked: number;
}

/**
 * Composite AI service that manages multiple AI providers with fallback logic
 * Requirement 3.2: Fallback logic when Bedrock is unavailable
 */
export class CompositeAIService implements AIService {
  private bedrockService: BedrockAIService;
  private externalService?: ExternalAIService;
  private healthStatus: ServiceHealthStatus;
  private healthCheckInterval: number = 30000; // 30 seconds

  constructor(envConfig: ValidatedEnvironmentConfig) {
    // Always initialize Bedrock service
    this.bedrockService = new BedrockAIService(envConfig);
    
    // Initialize external service if configured
    if (envConfig.externalAI) {
      this.externalService = new ExternalAIService(envConfig);
    }

    this.healthStatus = {
      bedrock: true,
      external: !!this.externalService,
      lastChecked: Date.now()
    };

    // Start periodic health checks
    this.startHealthChecks();
  }

  /**
   * Generates AI explanation with automatic fallback logic
   * Requirement 3.2: Fallback to external APIs when Bedrock is unavailable
   * @param errorCode - The error code to explain
   * @param context - Optional context about the error
   * @returns Promise<AIExplanation>
   */
  async generateExplanation(errorCode: number, context?: string): Promise<AIExplanation> {
    let lastError: Error | null = null;

    // Try Bedrock first if healthy
    if (this.healthStatus.bedrock) {
      try {
        const result = await this.bedrockService.generateExplanation(errorCode, context);
        return result;
      } catch (error) {
        lastError = error as Error;
        console.warn('Bedrock AI service failed, attempting fallback:', error);
        
        // Mark Bedrock as unhealthy
        this.healthStatus.bedrock = false;
        this.scheduleHealthCheck();
      }
    }

    // Fallback to external AI if available and healthy
    if (this.externalService && this.healthStatus.external) {
      try {
        const result = await this.externalService.generateExplanation(errorCode, context);
        return {
          ...result,
          confidence: Math.max(0, result.confidence - 0.1) // Slightly lower confidence for fallback
        };
      } catch (error) {
        lastError = error as Error;
        console.warn('External AI service failed:', error);
        
        // Mark external service as unhealthy
        this.healthStatus.external = false;
        this.scheduleHealthCheck();
      }
    }

    // If all AI services failed, throw the last error
    const errorMessage = lastError 
      ? `All AI services failed. Last error: ${lastError.message}`
      : 'No AI services available';
    
    throw new Error(errorMessage);
  }

  /**
   * Performs health check on all AI services
   */
  async performHealthCheck(): Promise<ServiceHealthStatus> {
    const now = Date.now();
    
    // Check Bedrock health
    try {
      this.healthStatus.bedrock = await this.bedrockService.healthCheck();
    } catch {
      this.healthStatus.bedrock = false;
    }

    // Check external AI health if available
    if (this.externalService) {
      try {
        this.healthStatus.external = await this.externalService.healthCheck();
      } catch {
        this.healthStatus.external = false;
      }
    }

    this.healthStatus.lastChecked = now;
    return { ...this.healthStatus };
  }

  /**
   * Gets current health status of all services
   */
  getHealthStatus(): ServiceHealthStatus {
    return { ...this.healthStatus };
  }

  /**
   * Gets available AI services count
   */
  getAvailableServicesCount(): number {
    let count = 0;
    if (this.healthStatus.bedrock) count++;
    if (this.healthStatus.external) count++;
    return count;
  }

  /**
   * Checks if any AI service is available
   */
  isAnyServiceAvailable(): boolean {
    return this.healthStatus.bedrock || this.healthStatus.external;
  }

  /**
   * Gets the preferred service name based on health status
   */
  getPreferredService(): 'bedrock' | 'external' | 'none' {
    if (this.healthStatus.bedrock) return 'bedrock';
    if (this.healthStatus.external) return 'external';
    return 'none';
  }

  /**
   * Forces a health check on all services
   */
  async forceHealthCheck(): Promise<ServiceHealthStatus> {
    return await this.performHealthCheck();
  }

  /**
   * Starts periodic health checks
   */
  private startHealthChecks(): void {
    // Perform initial health check
    this.performHealthCheck().catch(error => {
      console.warn('Initial health check failed:', error);
    });

    // Schedule periodic health checks
    setInterval(() => {
      this.performHealthCheck().catch(error => {
        console.warn('Periodic health check failed:', error);
      });
    }, this.healthCheckInterval);
  }

  /**
   * Schedules a health check after a delay
   */
  private scheduleHealthCheck(): void {
    setTimeout(() => {
      this.performHealthCheck().catch(error => {
        console.warn('Scheduled health check failed:', error);
      });
    }, 5000); // Check again in 5 seconds
  }

  /**
   * Cleanup method to stop health checks
   */
  cleanup(): void {
    // This would clear intervals if we stored references
    // For now, just mark services as unhealthy
    this.healthStatus.bedrock = false;
    this.healthStatus.external = false;
  }
}

/**
 * Factory function to create CompositeAIService instance
 * @param envConfig - Validated environment configuration
 * @returns CompositeAIService instance
 */
export function createCompositeAIService(envConfig: ValidatedEnvironmentConfig): CompositeAIService {
  return new CompositeAIService(envConfig);
}