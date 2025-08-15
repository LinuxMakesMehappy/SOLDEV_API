/**
 * Integration tests for ErrorExplanationService
 * Tests the complete error explanation flow: validation → mapping → cache check → AI/fallback → response
 */

import { ErrorExplanationService, createErrorExplanationService } from '../../src/services/error-explanation-service';
import { ValidatedEnvironmentConfig } from '../../src/types/environment';
import { ErrorExplanation } from '../../src/types/api';

// Mock the cache service to control cache behavior in tests
jest.mock('../../src/services/cache-service');
jest.mock('../../src/services/fallback-service');

// Import mocked modules
import { CompositeCacheService } from '../../src/services/cache-service';
import { FallbackService } from '../../src/services/fallback-service';

const MockedCompositeCacheService = CompositeCacheService as jest.MockedClass<typeof CompositeCacheService>;
const MockedFallbackService = FallbackService as jest.MockedClass<typeof FallbackService>;

describe('ErrorExplanationService Integration Tests', () => {
  let service: ErrorExplanationService;
  let mockCacheService: jest.Mocked<CompositeCacheService>;
  let mockFallbackService: jest.Mocked<FallbackService>;
  let testConfig: ValidatedEnvironmentConfig;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create test configuration
    testConfig = {
      awsBedrock: {
        region: 'us-east-1',
        modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
        temperature: 0.1,
        maxTokens: 1000,
        timeoutMs: 5000
      },
      cache: {
        tableName: 'test-error-cache',
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
      }
    };

    // Create mock instances
    mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      getStatus: jest.fn().mockReturnValue({ primaryHealthy: true, fallbackSize: 0 })
    } as any;

    mockFallbackService = {
      explainError: jest.fn(),
      getServiceStats: jest.fn().mockReturnValue({
        aiAvailable: true,
        staticAvailable: true,
        consecutiveAIFailures: 0,
        lastAIAttempt: Date.now(),
        aiServicesCount: 1,
        preferredAIService: 'bedrock',
        staticErrorCodesCount: 10
      }),
      cleanup: jest.fn()
    } as any;

    // Setup mock constructors
    MockedCompositeCacheService.mockImplementation(() => mockCacheService);
    MockedFallbackService.mockImplementation(() => mockFallbackService);

    // Create service instance
    service = new ErrorExplanationService(testConfig);
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('Complete Error Explanation Flow', () => {
    it('should complete full flow with cache miss and AI response', async () => {
      // Arrange
      const errorCode = 6000;
      const expectedExplanation: ErrorExplanation = {
        code: errorCode,
        explanation: 'Custom program error indicating insufficient funds',
        fixes: [
          'Check account balance before transaction',
          'Verify token account has sufficient balance',
          'Add balance validation in your program logic'
        ],
        source: 'ai',
        confidence: 0.9
      };

      mockCacheService.get.mockResolvedValue(null); // Cache miss
      mockFallbackService.explainError.mockResolvedValue(expectedExplanation);
      mockCacheService.set.mockResolvedValue(undefined);

      // Act
      const result = await service.explainError(errorCode);

      // Assert
      expect(result).toEqual(expectedExplanation);
      
      // Verify the complete flow was executed
      expect(mockCacheService.get).toHaveBeenCalledWith('error_6000');
      expect(mockFallbackService.explainError).toHaveBeenCalledWith(
        errorCode,
        expect.stringContaining('Error type: custom')
      );
      expect(mockCacheService.set).toHaveBeenCalledWith(
        'error_6000',
        expectedExplanation,
        3600
      );
    });

    it('should return cached result when cache hit occurs', async () => {
      // Arrange
      const errorCode = 2000;
      const cachedExplanation: ErrorExplanation = {
        code: errorCode,
        explanation: 'Seeds constraint violation - cached result',
        fixes: ['Fix 1', 'Fix 2'],
        source: 'ai',
        confidence: 0.9
      };

      mockCacheService.get.mockResolvedValue(cachedExplanation);

      // Act
      const result = await service.explainError(errorCode);

      // Assert
      expect(result).toEqual({
        ...cachedExplanation,
        source: 'cache' // Should be marked as cache source
      });
      
      // Verify cache was checked but fallback was not called
      expect(mockCacheService.get).toHaveBeenCalledWith('error_2000');
      expect(mockFallbackService.explainError).not.toHaveBeenCalled();
      expect(mockCacheService.set).not.toHaveBeenCalled();
    });

    it('should handle hex string input correctly', async () => {
      // Arrange
      const hexInput = '0x1770'; // 6000 in hex
      const expectedExplanation: ErrorExplanation = {
        code: 6000,
        explanation: 'Hex input processed correctly',
        fixes: ['Fix for hex input'],
        source: 'ai',
        confidence: 0.8
      };

      mockCacheService.get.mockResolvedValue(null);
      mockFallbackService.explainError.mockResolvedValue(expectedExplanation);
      mockCacheService.set.mockResolvedValue(undefined);

      // Act
      const result = await service.explainError(hexInput);

      // Assert
      expect(result.code).toBe(6000);
      expect(mockFallbackService.explainError).toHaveBeenCalledWith(
        6000,
        expect.stringContaining('Original input: 0x1770')
      );
    });

    it('should handle different error code types correctly', async () => {
      // Test cases for different error types
      const testCases = [
        { code: 0, type: 'standard' },
        { code: 1, type: 'standard' },
        { code: 2000, type: 'anchor_constraint' },
        { code: 2001, type: 'anchor_constraint' },
        { code: 6000, type: 'custom' },
        { code: 7500, type: 'custom' }
      ];

      for (const testCase of testCases) {
        // Arrange
        mockCacheService.get.mockResolvedValue(null);
        mockFallbackService.explainError.mockResolvedValue({
          code: testCase.code,
          explanation: `Test explanation for ${testCase.type}`,
          fixes: ['Test fix'],
          source: 'ai',
          confidence: 0.8
        });

        // Act
        await service.explainError(testCase.code);

        // Assert
        expect(mockFallbackService.explainError).toHaveBeenCalledWith(
          testCase.code,
          expect.stringContaining(`Error type: ${testCase.type}`)
        );

        // Reset mocks for next iteration
        jest.clearAllMocks();
        MockedCompositeCacheService.mockImplementation(() => mockCacheService);
        MockedFallbackService.mockImplementation(() => mockFallbackService);
      }
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle cache service failures gracefully', async () => {
      // Arrange
      const errorCode = 1000;
      const expectedExplanation: ErrorExplanation = {
        code: errorCode,
        explanation: 'Explanation despite cache failure',
        fixes: ['Fix despite cache failure'],
        source: 'ai',
        confidence: 0.7
      };

      mockCacheService.get.mockRejectedValue(new Error('Cache service unavailable'));
      mockCacheService.set.mockRejectedValue(new Error('Cache service unavailable'));
      mockFallbackService.explainError.mockResolvedValue(expectedExplanation);

      // Act
      const result = await service.explainError(errorCode);

      // Assert
      expect(result).toEqual(expectedExplanation);
      expect(mockFallbackService.explainError).toHaveBeenCalled();
    });

    it('should handle fallback service failures with final fallback', async () => {
      // Arrange
      const errorCode = 5000;
      
      mockCacheService.get.mockResolvedValue(null);
      mockFallbackService.explainError.mockRejectedValue(new Error('All services failed'));

      // Act
      const result = await service.explainError(errorCode);

      // Assert
      expect(result.code).toBe(errorCode);
      expect(result.source).toBe('static');
      expect(result.explanation).toContain('Unable to process error code');
      expect(result.fixes).toContain('Try again in a few moments');
      expect(result.confidence).toBe(0.1);
    });

    it('should handle invalid input with appropriate error response', async () => {
      // Test cases for invalid inputs
      const invalidInputs = [
        -1,
        4294967296, // Exceeds u32 max
        'invalid_string',
        null,
        undefined
      ];

      for (const invalidInput of invalidInputs) {
        // Act
        const result = await service.explainError(invalidInput as any);

        // Assert
        expect(result.source).toBe('static');
        expect(result.explanation).toContain('invalid');
        expect(result.confidence).toBe(0.8);
        expect(result.fixes).toContain('Ensure error code is a number between 0 and 4294967295');
      }
    });

    it('should handle processing timeout correctly', async () => {
      // Arrange
      const errorCode = 3000;
      
      // Create service with very short timeout for testing
      const shortTimeoutConfig = {
        ...testConfig,
        logging: { level: 'debug' as const }
      };
      
      const shortTimeoutService = new ErrorExplanationService(shortTimeoutConfig);
      
      mockCacheService.get.mockResolvedValue(null);
      // Mock a long-running operation that exceeds timeout
      mockFallbackService.explainError.mockImplementation(() => 
        new Promise<ErrorExplanation>((resolve) => {
          setTimeout(() => {
            resolve({
              code: errorCode,
              explanation: 'This should timeout',
              fixes: ['This should not be reached'],
              source: 'ai',
              confidence: 0.9
            });
          }, 15000); // 15 seconds
        })
      );

      // Act
      const result = await shortTimeoutService.explainError(errorCode);

      // Assert
      expect(result.code).toBe(errorCode);
      expect(result.source).toBe('static');
      expect(result.explanation).toContain('Unable to process error code');
      expect(result.confidence).toBe(0.1);

      shortTimeoutService.cleanup();
    }, 15000); // Increase test timeout to 15 seconds
  });

  describe('Performance and Metrics', () => {
    it('should track performance metrics in debug mode', async () => {
      // Arrange
      const debugConfig = {
        ...testConfig,
        logging: { level: 'debug' as const }
      };
      
      const debugService = new ErrorExplanationService(debugConfig);
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();

      const errorCode = 1;
      mockCacheService.get.mockResolvedValue(null);
      mockFallbackService.explainError.mockResolvedValue({
        code: errorCode,
        explanation: 'Test explanation',
        fixes: ['Test fix'],
        source: 'ai',
        confidence: 0.9
      });

      // Act
      await debugService.explainError(errorCode);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ErrorExplanationService] Metrics:'),
        expect.objectContaining({
          errorCode: 1,
          totalTime: expect.stringMatching(/\d+ms/),
          validationTime: expect.stringMatching(/\d+ms/),
          cacheHit: false,
          source: 'ai'
        })
      );

      consoleSpy.mockRestore();
      debugService.cleanup();
    });

    it('should provide health status information', async () => {
      // Act
      const healthStatus = await service.getHealthStatus();

      // Assert
      expect(healthStatus).toEqual({
        healthy: true,
        services: {
          cache: true,
          fallback: expect.objectContaining({
            aiAvailable: true,
            staticAvailable: true
          })
        },
        timestamp: expect.any(Number)
      });
    });

    it('should provide performance metrics', () => {
      // Act
      const metrics = service.getPerformanceMetrics();

      // Assert
      expect(metrics).toEqual({
        cacheStatus: expect.objectContaining({
          primaryHealthy: true,
          fallbackSize: 0
        }),
        fallbackStats: expect.objectContaining({
          aiAvailable: true,
          staticAvailable: true
        })
      });
    });
  });

  describe('Context and Caching', () => {
    it('should include user context in processing', async () => {
      // Arrange
      const errorCode = 2001;
      const userContext = 'Transaction failed during token transfer';
      
      mockCacheService.get.mockResolvedValue(null);
      mockFallbackService.explainError.mockResolvedValue({
        code: errorCode,
        explanation: 'Context-aware explanation',
        fixes: ['Context-aware fix'],
        source: 'ai',
        confidence: 0.9
      });

      // Act
      await service.explainError(errorCode, userContext);

      // Assert
      expect(mockFallbackService.explainError).toHaveBeenCalledWith(
        errorCode,
        expect.stringContaining('User context: Transaction failed during token transfer')
      );
    });

    it('should generate appropriate cache keys', async () => {
      // Arrange
      const errorCode = 1500;
      
      mockCacheService.get.mockResolvedValue(null);
      mockFallbackService.explainError.mockResolvedValue({
        code: errorCode,
        explanation: 'Test explanation',
        fixes: ['Test fix'],
        source: 'ai',
        confidence: 0.8
      });

      // Act
      await service.explainError(errorCode);

      // Assert
      expect(mockCacheService.get).toHaveBeenCalledWith('error_1500');
      expect(mockCacheService.set).toHaveBeenCalledWith(
        'error_1500',
        expect.any(Object),
        3600
      );
    });
  });

  describe('Factory Function', () => {
    it('should create service instance correctly', () => {
      // Act
      const factoryService = createErrorExplanationService(testConfig);

      // Assert
      expect(factoryService).toBeInstanceOf(ErrorExplanationService);
      
      // Cleanup
      factoryService.cleanup();
    });
  });

  describe('Logging Levels', () => {
    it('should respect different logging levels', async () => {
      const logLevels: Array<'debug' | 'info' | 'warn' | 'error'> = ['debug', 'info', 'warn', 'error'];
      
      for (const level of logLevels) {
        // Arrange
        const levelConfig = { ...testConfig, logging: { level } };
        const levelService = new ErrorExplanationService(levelConfig);
        
        const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
        
        mockCacheService.get.mockResolvedValue({
          code: 100,
          explanation: 'Cached explanation',
          fixes: ['Cached fix'],
          source: 'ai',
          confidence: 0.9
        });

        // Act
        await levelService.explainError(100);

        // Assert - check if logging occurred based on level
        if (level === 'debug' || level === 'info') {
          expect(consoleSpy).toHaveBeenCalled();
        } else {
          expect(consoleSpy).not.toHaveBeenCalled();
        }

        consoleSpy.mockRestore();
        levelService.cleanup();
        jest.clearAllMocks();
        MockedCompositeCacheService.mockImplementation(() => mockCacheService);
        MockedFallbackService.mockImplementation(() => mockFallbackService);
      }
    });
  });
});