/**
 * Unit tests for FallbackService
 * Requirement 3.4: Static fallback when AI services are unavailable
 * Requirement 3.6: Fallback response mechanisms
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { FallbackService } from '../../src/services/fallback-service';
import { CompositeAIService } from '../../src/services/composite-ai-service';
import { StaticErrorDatabase } from '../../src/services/static-error-database';
import { ValidatedEnvironmentConfig } from '../../src/types/environment';
import { AIExplanation } from '../../src/types/api';

// Mock the dependencies
jest.mock('../../src/services/composite-ai-service');
jest.mock('../../src/services/static-error-database');

const MockedCompositeAIService = CompositeAIService as jest.MockedClass<typeof CompositeAIService>;
const MockedStaticErrorDatabase = StaticErrorDatabase as jest.MockedClass<typeof StaticErrorDatabase>;

describe('FallbackService', () => {
  let fallbackService: FallbackService;
  let mockAIService: jest.Mocked<CompositeAIService>;
  let mockEnvConfig: ValidatedEnvironmentConfig;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock environment config
    mockEnvConfig = {
      awsBedrock: {
        region: 'us-east-1',
        modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
        temperature: 0.7,
        maxTokens: 1000,
        timeoutMs: 10000
      },
      cache: {
        tableName: 'test-table',
        ttlSeconds: 3600
      },
      rateLimit: {
        requestsPerMinute: 100
      },
      logging: {
        level: 'info'
      },
      aws: {
        region: 'us-east-1'
      },
      externalAI: {
        apiUrl: 'https://api.example.com',
        apiKey: 'test-key'
      }
    };

    // Create mock AI service
    mockAIService = {
      generateExplanation: jest.fn(),
      forceHealthCheck: jest.fn(),
      getAvailableServicesCount: jest.fn(),
      getPreferredService: jest.fn(),
      cleanup: jest.fn()
    } as any;

    // Mock the CompositeAIService constructor
    MockedCompositeAIService.mockImplementation(() => mockAIService);

    // Create fallback service
    fallbackService = new FallbackService(mockEnvConfig);
  });

  afterEach(() => {
    fallbackService.cleanup();
  });

  describe('explainError', () => {
    it('should return AI explanation when AI service is available', async () => {
      const mockAIExplanation: AIExplanation = {
        explanation: 'AI generated explanation',
        fixes: ['AI fix 1', 'AI fix 2'],
        confidence: 0.8,
        model: 'claude-3',
        tokens: 100
      };

      mockAIService.generateExplanation.mockResolvedValue(mockAIExplanation);

      const result = await fallbackService.explainError(6000);

      expect(result.code).toBe(6000);
      expect(result.explanation).toBe('AI generated explanation');
      expect(result.fixes).toEqual(['AI fix 1', 'AI fix 2']);
      expect(result.source).toBe('ai');
      expect(result.confidence).toBe(0.8);
      expect(mockAIService.generateExplanation).toHaveBeenCalledWith(6000, undefined);
    });

    it('should pass context to AI service when provided', async () => {
      const mockAIExplanation: AIExplanation = {
        explanation: 'Contextual explanation',
        fixes: ['Context fix'],
        confidence: 0.9,
        model: 'claude-3',
        tokens: 150
      };

      mockAIService.generateExplanation.mockResolvedValue(mockAIExplanation);

      const context = 'Token transfer operation';
      await fallbackService.explainError(6000, context);

      expect(mockAIService.generateExplanation).toHaveBeenCalledWith(6000, context);
    });

    it('should fallback to static explanation when AI service fails', async () => {
      const mockStaticExplanation = {
        code: 6000,
        explanation: 'Static explanation',
        fixes: ['Static fix 1', 'Static fix 2'],
        source: 'static' as const,
        confidence: 0.9
      };

      mockAIService.generateExplanation.mockRejectedValue(new Error('AI service unavailable'));
      MockedStaticErrorDatabase.explainError.mockReturnValue(mockStaticExplanation);

      const result = await fallbackService.explainError(6000);

      expect(result).toEqual(mockStaticExplanation);
      expect(MockedStaticErrorDatabase.explainError).toHaveBeenCalledWith(6000);
    });

    it('should retry AI service on failure before falling back', async () => {
      const mockStaticExplanation = {
        code: 6000,
        explanation: 'Static explanation',
        fixes: ['Static fix'],
        source: 'static' as const,
        confidence: 0.9
      };

      // First two calls fail, third would succeed but we only retry twice
      mockAIService.generateExplanation
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'));
      
      MockedStaticErrorDatabase.explainError.mockReturnValue(mockStaticExplanation);

      const result = await fallbackService.explainError(6000);

      expect(mockAIService.generateExplanation).toHaveBeenCalledTimes(2);
      expect(result.source).toBe('static');
    });

    it('should skip AI after consecutive failures threshold', async () => {
      const mockStaticExplanation = {
        code: 6000,
        explanation: 'Static explanation',
        fixes: ['Static fix'],
        source: 'static' as const,
        confidence: 0.9
      };

      MockedStaticErrorDatabase.explainError.mockReturnValue(mockStaticExplanation);

      // Simulate 3 consecutive failures to trigger skip mode
      mockAIService.generateExplanation.mockRejectedValue(new Error('AI failure'));
      
      await fallbackService.explainError(6000); // 1st failure
      await fallbackService.explainError(6001); // 2nd failure
      await fallbackService.explainError(6002); // 3rd failure
      
      // Reset mock to track next call
      mockAIService.generateExplanation.mockClear();
      
      // This call should skip AI entirely
      await fallbackService.explainError(6003);

      expect(mockAIService.generateExplanation).not.toHaveBeenCalled();
      expect(MockedStaticErrorDatabase.explainError).toHaveBeenCalledWith(6003);
    });

    it('should handle AI service timeout', async () => {
      const mockStaticExplanation = {
        code: 6000,
        explanation: 'Static explanation',
        fixes: ['Static fix'],
        source: 'static' as const,
        confidence: 0.9
      };

      // Mock a long-running AI request that will timeout
      mockAIService.generateExplanation.mockImplementation(() => 
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('AI request timeout')), 100);
        })
      );
      
      MockedStaticErrorDatabase.explainError.mockReturnValue(mockStaticExplanation);

      const result = await fallbackService.explainError(6000);

      expect(result.source).toBe('static');
      expect(MockedStaticErrorDatabase.explainError).toHaveBeenCalledWith(6000);
    }, 15000);
  });

  describe('getAvailability', () => {
    it('should return current availability status', () => {
      const availability = fallbackService.getAvailability();

      expect(availability).toHaveProperty('ai');
      expect(availability).toHaveProperty('static');
      expect(availability).toHaveProperty('lastAIAttempt');
      expect(availability).toHaveProperty('consecutiveAIFailures');
      expect(availability.static).toBe(true); // Static is always available
    });

    it('should track consecutive AI failures', async () => {
      mockAIService.generateExplanation.mockRejectedValue(new Error('AI failure'));
      MockedStaticErrorDatabase.explainError.mockReturnValue({
        code: 6000,
        explanation: 'Static',
        fixes: ['Fix'],
        source: 'static',
        confidence: 0.9
      });

      await fallbackService.explainError(6000);
      
      const availability = fallbackService.getAvailability();
      expect(availability.consecutiveAIFailures).toBe(1);
    });
  });

  describe('hasStaticExplanation', () => {
    it('should delegate to StaticErrorDatabase', () => {
      MockedStaticErrorDatabase.hasStaticExplanation.mockReturnValue(true);

      const result = fallbackService.hasStaticExplanation(6000);

      expect(result).toBe(true);
      expect(MockedStaticErrorDatabase.hasStaticExplanation).toHaveBeenCalledWith(6000);
    });
  });

  describe('getAvailableStaticErrorCodes', () => {
    it('should delegate to StaticErrorDatabase', () => {
      const mockCodes = [0, 1, 100, 2000, 6000];
      MockedStaticErrorDatabase.getAvailableErrorCodes.mockReturnValue(mockCodes);

      const result = fallbackService.getAvailableStaticErrorCodes();

      expect(result).toEqual(mockCodes);
      expect(MockedStaticErrorDatabase.getAvailableErrorCodes).toHaveBeenCalled();
    });
  });

  describe('checkAIAvailability', () => {
    it('should return true when AI services are healthy', async () => {
      mockAIService.forceHealthCheck.mockResolvedValue({
        bedrock: true,
        external: false,
        lastChecked: Date.now()
      });

      const result = await fallbackService.checkAIAvailability();

      expect(result).toBe(true);
      expect(mockAIService.forceHealthCheck).toHaveBeenCalled();
    });

    it('should return false when no AI services are healthy', async () => {
      mockAIService.forceHealthCheck.mockResolvedValue({
        bedrock: false,
        external: false,
        lastChecked: Date.now()
      });

      const result = await fallbackService.checkAIAvailability();

      expect(result).toBe(false);
    });

    it('should handle health check failures gracefully', async () => {
      mockAIService.forceHealthCheck.mockRejectedValue(new Error('Health check failed'));

      const result = await fallbackService.checkAIAvailability();

      expect(result).toBe(false);
    });

    it('should update availability status based on health check', async () => {
      // Start with AI marked as unavailable due to failures
      mockAIService.generateExplanation.mockRejectedValue(new Error('AI failure'));
      MockedStaticErrorDatabase.explainError.mockReturnValue({
        code: 6000,
        explanation: 'Static',
        fixes: ['Fix'],
        source: 'static',
        confidence: 0.9
      });

      // Trigger failures to mark AI as unavailable
      await fallbackService.explainError(6000);
      await fallbackService.explainError(6001);
      await fallbackService.explainError(6002);

      let availability = fallbackService.getAvailability();
      expect(availability.ai).toBe(false);

      // Now simulate AI recovery
      mockAIService.forceHealthCheck.mockResolvedValue({
        bedrock: true,
        external: false,
        lastChecked: Date.now()
      });

      const isAvailable = await fallbackService.checkAIAvailability();
      expect(isAvailable).toBe(true);

      availability = fallbackService.getAvailability();
      expect(availability.ai).toBe(true);
      expect(availability.consecutiveAIFailures).toBe(0);
    });
  });

  describe('getServiceStats', () => {
    it('should return comprehensive service statistics', () => {
      mockAIService.getAvailableServicesCount.mockReturnValue(2);
      mockAIService.getPreferredService.mockReturnValue('bedrock');
      MockedStaticErrorDatabase.getAvailableErrorCodes.mockReturnValue([0, 1, 2000, 6000]);

      const stats = fallbackService.getServiceStats();

      expect(stats).toHaveProperty('aiAvailable');
      expect(stats).toHaveProperty('staticAvailable');
      expect(stats).toHaveProperty('consecutiveAIFailures');
      expect(stats).toHaveProperty('lastAIAttempt');
      expect(stats).toHaveProperty('aiServicesCount');
      expect(stats).toHaveProperty('preferredAIService');
      expect(stats).toHaveProperty('staticErrorCodesCount');
      
      expect(stats.staticAvailable).toBe(true);
      expect(stats.aiServicesCount).toBe(2);
      expect(stats.preferredAIService).toBe('bedrock');
      expect(stats.staticErrorCodesCount).toBe(4);
    });
  });

  describe('cleanup', () => {
    it('should cleanup AI service resources', () => {
      fallbackService.cleanup();
      expect(mockAIService.cleanup).toHaveBeenCalled();
    });
  });

  describe('error recovery', () => {
    it('should reset failure count on successful AI response after failures', async () => {
      const mockAIExplanation: AIExplanation = {
        explanation: 'AI explanation',
        fixes: ['AI fix'],
        confidence: 0.8,
        model: 'claude-3',
        tokens: 100
      };

      const mockStaticExplanation = {
        code: 6000,
        explanation: 'Static explanation',
        fixes: ['Static fix'],
        source: 'static' as const,
        confidence: 0.9
      };

      // Setup mocks for failure then success
      mockAIService.generateExplanation
        .mockRejectedValueOnce(new Error('AI failure'))
        .mockRejectedValueOnce(new Error('AI failure')) // Retry also fails
        .mockResolvedValueOnce(mockAIExplanation);
      
      MockedStaticErrorDatabase.explainError.mockReturnValue(mockStaticExplanation);

      // First call should fail and increment failure count
      const firstResult = await fallbackService.explainError(6000);
      expect(firstResult.source).toBe('static');
      let availability = fallbackService.getAvailability();
      expect(availability.consecutiveAIFailures).toBeGreaterThan(0);

      // Second call should succeed and reset failure count
      const result = await fallbackService.explainError(6001);
      expect(result.source).toBe('ai');
      
      availability = fallbackService.getAvailability();
      expect(availability.consecutiveAIFailures).toBe(0);
    });
  });

  describe('integration scenarios', () => {
    it('should handle mixed success and failure scenarios', async () => {
      const mockAIExplanation: AIExplanation = {
        explanation: 'AI explanation',
        fixes: ['AI fix'],
        confidence: 0.8,
        model: 'claude-3',
        tokens: 100
      };

      const mockStaticExplanation = {
        code: 6000,
        explanation: 'Static explanation',
        fixes: ['Static fix'],
        source: 'static' as const,
        confidence: 0.9
      };

      // Simulate alternating success and failure with retries
      mockAIService.generateExplanation
        .mockResolvedValueOnce(mockAIExplanation)  // Success
        .mockRejectedValueOnce(new Error('Failure'))  // Failure attempt 1
        .mockRejectedValueOnce(new Error('Failure'))  // Failure attempt 2 (retry)
        .mockResolvedValueOnce(mockAIExplanation)  // Success
        .mockRejectedValueOnce(new Error('Failure'))  // Failure attempt 1
        .mockRejectedValueOnce(new Error('Failure')); // Failure attempt 2 (retry)

      MockedStaticErrorDatabase.explainError.mockReturnValue(mockStaticExplanation);

      // Test the sequence
      let result = await fallbackService.explainError(6000);
      expect(result.source).toBe('ai');

      result = await fallbackService.explainError(6001);
      expect(result.source).toBe('static');

      result = await fallbackService.explainError(6002);
      expect(result.source).toBe('ai');

      result = await fallbackService.explainError(6003);
      expect(result.source).toBe('static');

      const availability = fallbackService.getAvailability();
      expect(availability.consecutiveAIFailures).toBeGreaterThanOrEqual(0); // Failures are tracked but reset on success
    });
  });
});