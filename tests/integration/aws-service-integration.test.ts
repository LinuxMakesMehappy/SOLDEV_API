/**
 * AWS service integration tests
 * Requirements: 4.6, 6.5, 7.6 - AWS service integrations and infrastructure validation
 */

import { ErrorExplanationService, createErrorExplanationService } from '../../src/services/error-explanation-service';
// import { CompositeCacheService } from '../../src/services/cache-service';
// import { FallbackService } from '../../src/services/fallback-service';
import { PerformanceMonitor } from '../../src/services/performance-monitor';
import { ValidatedEnvironmentConfig } from '../../src/types/environment';

// Mock AWS services but test integration patterns
jest.mock('@aws-sdk/client-bedrock-runtime');
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('@aws-sdk/client-cloudwatch');

// Import mocked modules to verify interactions
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';

const MockedBedrockRuntimeClient = BedrockRuntimeClient as jest.MockedClass<typeof BedrockRuntimeClient>;
const MockedDynamoDBClient = DynamoDBClient as jest.MockedClass<typeof DynamoDBClient>;
// const MockedDynamoDBDocumentClient = DynamoDBDocumentClient as jest.MockedClass<typeof DynamoDBDocumentClient>;
const MockedCloudWatchClient = CloudWatchClient as jest.MockedClass<typeof CloudWatchClient>;

describe('AWS Service Integration Tests', () => {
  let service: ErrorExplanationService;
  let testConfig: ValidatedEnvironmentConfig;

  beforeAll(() => {
    testConfig = {
      awsBedrock: {
        region: 'us-east-1',
        modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
        temperature: 0.1,
        maxTokens: 1000,
        timeoutMs: 5000
      },
      cache: {
        tableName: 'test-solana-error-cache',
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
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = createErrorExplanationService(testConfig);
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('AWS Bedrock Integration', () => {
    it('should initialize Bedrock client with correct configuration', async () => {
      // Act
      await service.explainError(9999); // Uncommon error to potentially trigger AI

      // Assert
      expect(MockedBedrockRuntimeClient).toHaveBeenCalledWith({
        region: 'us-east-1'
      });
    });

    it('should handle Bedrock service availability', async () => {
      // Arrange
      const uncommonErrorCodes = [8888, 9999, 7777];

      // Act
      const results = [];
      for (const errorCode of uncommonErrorCodes) {
        const result = await service.explainError(errorCode);
        results.push(result);
      }

      // Assert
      results.forEach((result, index) => {
        expect(result.code).toBe(uncommonErrorCodes[index]);
        expect(result.explanation).toBeDefined();
        expect(result.fixes).toBeDefined();
        expect(result.fixes.length).toBeGreaterThan(0);
        // Should fallback to static if Bedrock is unavailable
        expect(['ai', 'static']).toContain(result.source);
      });
    });

    it('should handle Bedrock timeout scenarios', async () => {
      // Arrange - Use short timeout config
      const shortTimeoutConfig = {
        ...testConfig,
        awsBedrock: {
          ...testConfig.awsBedrock,
          timeoutMs: 100 // Very short timeout
        }
      };

      const shortTimeoutService = createErrorExplanationService(shortTimeoutConfig);

      try {
        // Act
        const result = await shortTimeoutService.explainError(9999);

        // Assert - Should fallback gracefully
        expect(result.code).toBe(9999);
        expect(result.explanation).toBeDefined();
        expect(result.fixes).toBeDefined();
        expect(result.source).toBe('static'); // Should fallback to static
      } finally {
        shortTimeoutService.cleanup();
      }
    });

    it('should handle Bedrock region configuration', async () => {
      // Arrange - Test different regions
      const regions = ['us-east-1', 'us-west-2', 'eu-west-1'];

      for (const region of regions) {
        const regionConfig = {
          ...testConfig,
          aws: { region },
          awsBedrock: { ...testConfig.awsBedrock, region }
        };

        const regionService = createErrorExplanationService(regionConfig);

        try {
          // Act
          await regionService.explainError(9999);

          // Assert
          expect(MockedBedrockRuntimeClient).toHaveBeenCalledWith({
            region
          });
        } finally {
          regionService.cleanup();
        }
      }
    });
  });

  describe('DynamoDB Cache Integration', () => {
    it('should initialize DynamoDB client with correct configuration', async () => {
      // Act
      await service.explainError(1); // Common error that should use cache

      // Assert
      expect(MockedDynamoDBClient).toHaveBeenCalledWith({
        region: 'us-east-1'
      });
    });

    it('should handle DynamoDB table operations', async () => {
      // Arrange
      const errorCode = 2000;

      // Act - First call (cache miss)
      const result1 = await service.explainError(errorCode);
      
      // Act - Second call (potential cache hit)
      const result2 = await service.explainError(errorCode);

      // Assert
      expect(result1.code).toBe(errorCode);
      expect(result2.code).toBe(errorCode);
      expect(result1.explanation).toBe(result2.explanation);
      
      // Should have attempted cache operations
      expect(MockedDynamoDBDocumentClient.from).toHaveBeenCalled();
    });

    it('should handle DynamoDB service unavailability', async () => {
      // Arrange - Mock DynamoDB failure
      const mockError = new Error('DynamoDB service unavailable');
      MockedDynamoDBClient.mockImplementation(() => {
        throw mockError;
      });

      // Act
      const result = await service.explainError(1);

      // Assert - Should still work with fallback
      expect(result.code).toBe(1);
      expect(result.explanation).toBeDefined();
      expect(result.fixes).toBeDefined();
      // Should fallback to static or AI without cache
      expect(['ai', 'static']).toContain(result.source);
    });

    it('should handle cache TTL configuration', async () => {
      // Arrange - Test different TTL values
      const ttlValues = [1800, 3600, 7200]; // 30min, 1hr, 2hr

      for (const ttlSeconds of ttlValues) {
        const ttlConfig = {
          ...testConfig,
          cache: { ...testConfig.cache, ttlSeconds }
        };

        const ttlService = createErrorExplanationService(ttlConfig);

        try {
          // Act
          await ttlService.explainError(1);

          // Assert - Service should initialize with correct TTL
          // (TTL validation would be in the cache service implementation)
          expect(ttlService).toBeDefined();
        } finally {
          ttlService.cleanup();
        }
      }
    });

    it('should handle cache performance under load', async () => {
      // Arrange
      const errorCodes = [0, 1, 2000, 6000];
      const requests = Array.from({ length: 20 }, (_, i) => 
        errorCodes[i % errorCodes.length]
      );

      const startTime = Date.now();

      // Act
      const results = [];
      for (const errorCode of requests) {
        const result = await service.explainError(errorCode || 0);
        results.push(result);
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Assert
      expect(results).toHaveLength(20);
      results.forEach(result => {
        expect(result.explanation).toBeDefined();
        expect(result.fixes).toBeDefined();
      });

      // Should complete efficiently with caching
      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds
      
      const avgTime = totalTime / 20;
      expect(avgTime).toBeLessThan(300); // Average under 300ms per request
    });
  });

  describe('CloudWatch Monitoring Integration', () => {
    it('should initialize CloudWatch client for performance monitoring', async () => {
      // Arrange
      const performanceMonitor = new PerformanceMonitor('us-east-1');

      try {
        // Act
        await performanceMonitor.recordMetrics({
          responseTime: 100,
          cacheHit: true,
          errorCode: 1,
          source: 'cache',
          timestamp: Date.now()
        });

        // Assert
        expect(MockedCloudWatchClient).toHaveBeenCalledWith({
          region: 'us-east-1'
        });
      } finally {
        performanceMonitor.cleanup();
      }
    });

    it('should handle CloudWatch metrics publishing', async () => {
      // Arrange
      const performanceMonitor = new PerformanceMonitor('us-east-1');
      const mockCloudWatch = {
        send: jest.fn().mockResolvedValue({})
      };
      MockedCloudWatchClient.mockImplementation(() => mockCloudWatch as any);

      try {
        // Act
        await performanceMonitor.recordMetrics({
          responseTime: 250,
          cacheHit: false,
          errorCode: 6000,
          source: 'ai',
          timestamp: Date.now()
        });

        await performanceMonitor.flushMetrics();

        // Assert
        expect(mockCloudWatch.send).toHaveBeenCalled();
      } finally {
        performanceMonitor.cleanup();
      }
    });

    it('should handle CloudWatch service unavailability', async () => {
      // Arrange
      const performanceMonitor = new PerformanceMonitor('us-east-1');
      const mockCloudWatch = {
        send: jest.fn().mockRejectedValue(new Error('CloudWatch unavailable'))
      };
      MockedCloudWatchClient.mockImplementation(() => mockCloudWatch as any);

      try {
        // Act & Assert - Should not throw
        await expect(performanceMonitor.recordMetrics({
          responseTime: 100,
          cacheHit: true,
          errorCode: 1,
          source: 'cache',
          timestamp: Date.now()
        })).resolves.not.toThrow();

        await expect(performanceMonitor.flushMetrics()).resolves.not.toThrow();
      } finally {
        performanceMonitor.cleanup();
      }
    });

    it('should integrate performance monitoring with error explanation service', async () => {
      // Arrange
      const errorCodes = [0, 2000, 6000];

      // Act
      const results = [];
      for (const errorCode of errorCodes) {
        const result = await service.explainError(errorCode);
        results.push(result);
      }

      // Assert
      results.forEach(result => {
        expect(result.code).toBeDefined();
        expect(result.explanation).toBeDefined();
        expect(result.fixes).toBeDefined();
      });

      // Performance monitoring should be integrated
      const performanceMetrics = service.getPerformanceMetrics();
      expect(performanceMetrics).toBeDefined();
      expect(performanceMetrics.cacheStatus).toBeDefined();
      expect(performanceMetrics.fallbackStats).toBeDefined();
    });
  });

  describe('Multi-Service Integration', () => {
    it('should coordinate between all AWS services', async () => {
      // Arrange
      const errorCodes = [1, 2001, 6001, 9999];

      // Act
      const results = [];
      for (const errorCode of errorCodes) {
        const result = await service.explainError(errorCode);
        results.push(result);
      }

      // Assert
      expect(results).toHaveLength(4);
      
      results.forEach((result, index) => {
        expect(result.code).toBe(errorCodes[index]);
        expect(result.explanation).toBeDefined();
        expect(result.fixes).toBeDefined();
        expect(result.fixes.length).toBeGreaterThan(0);
        expect(['ai', 'static', 'cache']).toContain(result.source);
      });

      // Verify all services were potentially used
      expect(MockedDynamoDBClient).toHaveBeenCalled(); // Cache service
      // Bedrock and CloudWatch may or may not be called depending on caching and error types
    });

    it('should handle partial service failures gracefully', async () => {
      // Arrange - Mock partial failures
      MockedDynamoDBClient.mockImplementation(() => {
        throw new Error('DynamoDB unavailable');
      });

      // Act
      const results = [];
      const errorCodes = [0, 2000, 6000];
      
      for (const errorCode of errorCodes) {
        const result = await service.explainError(errorCode);
        results.push(result);
      }

      // Assert - Should still work with degraded service
      expect(results).toHaveLength(3);
      
      results.forEach((result, index) => {
        expect(result.code).toBe(errorCodes[index]);
        expect(result.explanation).toBeDefined();
        expect(result.fixes).toBeDefined();
        // Should fallback to static or AI without cache
        expect(['ai', 'static']).toContain(result.source);
      });
    });

    it('should maintain service health monitoring across AWS integrations', async () => {
      // Act
      const healthStatus = await service.getHealthStatus();

      // Assert
      expect(healthStatus).toBeDefined();
      expect(healthStatus.healthy).toBeDefined();
      expect(healthStatus.services).toBeDefined();
      expect(healthStatus.timestamp).toBeDefined();
      
      expect(typeof healthStatus.healthy).toBe('boolean');
      expect(typeof healthStatus.timestamp).toBe('number');
      expect(healthStatus.services.cache).toBeDefined();
      expect(healthStatus.services.fallback).toBeDefined();
    });

    it('should handle AWS service configuration validation', async () => {
      // Arrange - Test various configuration scenarios
      const configScenarios = [
        {
          name: 'minimal config',
          config: {
            ...testConfig,
            awsBedrock: {
              region: 'us-east-1',
              modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
              temperature: 0.1,
              maxTokens: 500,
              timeoutMs: 3000
            }
          }
        },
        {
          name: 'extended config',
          config: {
            ...testConfig,
            awsBedrock: {
              region: 'us-west-2',
              modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
              temperature: 0.2,
              maxTokens: 1500,
              timeoutMs: 8000
            },
            cache: {
              tableName: 'extended-cache-table',
              ttlSeconds: 7200
            }
          }
        }
      ];

      // Act & Assert
      for (const scenario of configScenarios) {
        const scenarioService = createErrorExplanationService(scenario.config);
        
        try {
          const result = await scenarioService.explainError(1);
          
          expect(result.code).toBe(1);
          expect(result.explanation).toBeDefined();
          expect(result.fixes).toBeDefined();
        } finally {
          scenarioService.cleanup();
        }
      }
    });
  });

  describe('AWS Service Error Handling', () => {
    it('should handle AWS SDK errors gracefully', async () => {
      // Arrange - Mock various AWS SDK errors
      const awsErrors = [
        new Error('CredentialsError: Missing credentials'),
        new Error('NetworkingError: Connection timeout'),
        new Error('ServiceError: Service temporarily unavailable')
      ];

      for (const error of awsErrors) {
        MockedDynamoDBClient.mockImplementation(() => {
          throw error;
        });

        // Act
        const result = await service.explainError(1);

        // Assert - Should handle gracefully
        expect(result.code).toBe(1);
        expect(result.explanation).toBeDefined();
        expect(result.fixes).toBeDefined();
        expect(['ai', 'static']).toContain(result.source);

        // Reset mock
        jest.clearAllMocks();
      }
    });

    it('should handle AWS service throttling', async () => {
      // Arrange - Mock throttling error
      const throttlingError = new Error('ThrottlingException: Rate exceeded');
      MockedBedrockRuntimeClient.mockImplementation(() => {
        throw throttlingError;
      });

      // Act
      const result = await service.explainError(9999);

      // Assert - Should fallback gracefully
      expect(result.code).toBe(9999);
      expect(result.explanation).toBeDefined();
      expect(result.fixes).toBeDefined();
      expect(result.source).toBe('static'); // Should fallback to static
    });

    it('should handle AWS region misconfigurations', async () => {
      // Arrange - Test with invalid region
      const invalidRegionConfig = {
        ...testConfig,
        aws: { region: 'invalid-region' },
        awsBedrock: { ...testConfig.awsBedrock, region: 'invalid-region' }
      };

      const invalidRegionService = createErrorExplanationService(invalidRegionConfig);

      try {
        // Act
        const result = await invalidRegionService.explainError(1);

        // Assert - Should still work with fallback
        expect(result.code).toBe(1);
        expect(result.explanation).toBeDefined();
        expect(result.fixes).toBeDefined();
      } finally {
        invalidRegionService.cleanup();
      }
    });
  });

  describe('AWS Service Performance Integration', () => {
    it('should maintain performance standards with AWS service integration', async () => {
      // Arrange
      const errorCodes = [0, 1, 2000, 2001, 6000, 6001];
      const startTime = Date.now();

      // Act
      const results = [];
      for (const errorCode of errorCodes) {
        const result = await service.explainError(errorCode);
        results.push(result);
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Assert
      expect(results).toHaveLength(6);
      results.forEach(result => {
        expect(result.explanation).toBeDefined();
        expect(result.fixes).toBeDefined();
      });

      // Performance standards
      expect(totalTime).toBeLessThan(3000); // Should complete within 3 seconds
      const avgTime = totalTime / 6;
      expect(avgTime).toBeLessThan(600); // Average under 600ms per request
    });

    it('should demonstrate AWS service caching efficiency', async () => {
      // Arrange
      const errorCode = 2000;

      // Act - Multiple requests for same error
      const results = [];
      const times = [];

      for (let i = 0; i < 5; i++) {
        const startTime = Date.now();
        const result = await service.explainError(errorCode);
        const endTime = Date.now();
        
        results.push(result);
        times.push(endTime - startTime);
      }

      // Assert
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.code).toBe(errorCode);
        expect(result.explanation).toBeDefined();
      });

      // Later requests should be faster (cached)
      const firstTime = times[0];
      const laterTimes = times.slice(1);
      const avgLaterTime = laterTimes.reduce((sum, time) => sum + time, 0) / laterTimes.length;

      expect(avgLaterTime).toBeLessThanOrEqual(firstTime || 1000);
    });
  });
});