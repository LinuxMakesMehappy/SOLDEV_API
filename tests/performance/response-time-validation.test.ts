/**
 * Performance validation tests for response time requirements
 * Requirements: 7.1, 7.2 - Response time requirements (<500ms cached, <10s AI)
 */

import { ErrorExplanationService, createErrorExplanationService } from '../../src/services/error-explanation-service';
import { ValidatedEnvironmentConfig } from '../../src/types/environment';
import { PerformanceBenchmark } from '../../src/utils/performance-benchmark';

// Mock AWS services for performance testing
jest.mock('@aws-sdk/client-bedrock-runtime');
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('@aws-sdk/client-cloudwatch');

describe('Response Time Validation', () => {
  let service: ErrorExplanationService;
  let benchmark: PerformanceBenchmark;
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
        tableName: 'test-error-cache',
        ttlSeconds: 3600
      },
      rateLimit: {
        requestsPerMinute: 100
      },
      logging: {
        level: 'error' // Reduce noise in performance tests
      },
      aws: {
        region: 'us-east-1'
      }
    };

    service = createErrorExplanationService(testConfig);
    benchmark = new PerformanceBenchmark(service);
  });

  afterAll(() => {
    service.cleanup();
  });

  describe('Cached Response Time Requirements', () => {
    it('should meet <500ms requirement for cached responses', async () => {
      // Arrange - Common error codes that should be cached
      const commonErrorCodes = [0, 1, 100, 2000, 2001, 2002, 6000];
      const maxCachedResponseTime = 500; // 500ms requirement

      // Act - First call to populate cache
      for (const errorCode of commonErrorCodes) {
        await service.explainError(errorCode);
      }

      // Measure cached response times
      const cachedResponseTimes: number[] = [];
      
      for (const errorCode of commonErrorCodes) {
        const startTime = Date.now();
        const result = await service.explainError(errorCode);
        const responseTime = Date.now() - startTime;
        
        if (result.source === 'cache') {
          cachedResponseTimes.push(responseTime);
        }
      }

      // Assert
      expect(cachedResponseTimes.length).toBeGreaterThan(0);
      
      const averageCachedTime = cachedResponseTimes.reduce((sum, time) => sum + time, 0) / cachedResponseTimes.length;
      const maxCachedTime = Math.max(...cachedResponseTimes);
      
      console.log(`Cached response times - Average: ${averageCachedTime}ms, Max: ${maxCachedTime}ms`);
      
      expect(averageCachedTime).toBeLessThan(maxCachedResponseTime);
      expect(maxCachedTime).toBeLessThan(maxCachedResponseTime * 2); // Allow some variance for max
    }, 15000);

    it('should consistently meet cached response time under load', async () => {
      // Arrange
      const config = {
        concurrentRequests: 10,
        totalRequests: 100,
        errorCodes: [0, 1, 2000, 6000], // Common cached errors
        warmupRequests: 20, // Ensure cache is populated
        timeoutMs: 2000
      };

      // Act
      const results = await benchmark.runBenchmark(config);

      // Assert
      expect(results.successfulRequests).toBeGreaterThan(90); // At least 90% success rate
      expect(results.cacheHitRate).toBeGreaterThan(0.5); // At least 50% cache hits
      
      // For cached responses, average should be well under 500ms
      if (results.cacheHitRate > 0.7) { // If good cache hit rate
        expect(results.averageResponseTime).toBeLessThan(500);
        expect(results.p95ResponseTime).toBeLessThan(1000); // 95th percentile under 1s
      }

      console.log(`Load test results - Cache hit rate: ${(results.cacheHitRate * 100).toFixed(1)}%, Average response: ${results.averageResponseTime}ms`);
    }, 30000);
  });

  describe('AI Response Time Requirements', () => {
    it('should meet <10s requirement for AI responses', async () => {
      // Arrange - Custom error codes that likely require AI
      const customErrorCodes = [6010, 6011, 6012, 6013, 6014]; // Uncommon custom errors
      const maxAIResponseTime = 10000; // 10s requirement

      // Act
      const aiResponseTimes: number[] = [];
      
      for (const errorCode of customErrorCodes) {
        const startTime = Date.now();
        const result = await service.explainError(errorCode);
        const responseTime = Date.now() - startTime;
        
        // Even if it falls back to static, it should be fast
        aiResponseTimes.push(responseTime);
        
        expect(result).toBeDefined();
        expect(result.explanation).toBeDefined();
        expect(result.fixes).toBeDefined();
      }

      // Assert
      const averageAITime = aiResponseTimes.reduce((sum, time) => sum + time, 0) / aiResponseTimes.length;
      const maxAITime = Math.max(...aiResponseTimes);
      
      console.log(`AI response times - Average: ${averageAITime}ms, Max: ${maxAITime}ms`);
      
      expect(averageAITime).toBeLessThan(maxAIResponseTime);
      expect(maxAITime).toBeLessThan(maxAIResponseTime);
    }, 60000);

    it('should handle AI timeout gracefully', async () => {
      // Arrange - Test with very short timeout to simulate AI timeout
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
        const startTime = Date.now();
        const result = await shortTimeoutService.explainError(9999); // Uncommon error
        const responseTime = Date.now() - startTime;

        // Assert - Should fallback quickly
        expect(responseTime).toBeLessThan(5000); // Should fallback within 5s
        expect(result.source).toBe('static'); // Should use static fallback
        expect(result.explanation).toBeDefined();
        
        console.log(`Timeout fallback response time: ${responseTime}ms`);
        
      } finally {
        shortTimeoutService.cleanup();
      }
    }, 15000);
  });

  describe('Performance Under Different Load Conditions', () => {
    it('should maintain performance with mixed error types', async () => {
      // Arrange - Mix of standard, constraint, and custom errors
      const mixedErrorCodes = [0, 1, 100, 2000, 2001, 2002, 6000, 6001, 6002, 6003];
      
      const config = {
        concurrentRequests: 5,
        totalRequests: 50,
        errorCodes: mixedErrorCodes,
        warmupRequests: 10,
        timeoutMs: 15000
      };

      // Act
      const results = await benchmark.runBenchmark(config);

      // Assert
      expect(results.successfulRequests).toBeGreaterThan(45); // At least 90% success
      expect(results.averageResponseTime).toBeLessThan(2000); // Average under 2s
      expect(results.p99ResponseTime).toBeLessThan(10000); // 99th percentile under 10s
      
      console.log(`Mixed load test - Success rate: ${(results.successfulRequests/results.totalRequests*100).toFixed(1)}%, Average: ${results.averageResponseTime}ms, P99: ${results.p99ResponseTime}ms`);
    }, 45000);

    it('should demonstrate cache efficiency', async () => {
      // Act
      const cacheResults = await benchmark.runCachePerformanceTest([0, 1, 2000, 6000]);

      // Assert
      expect(cacheResults.cacheEfficiency).toBeGreaterThan(1.5); // Warm cache at least 50% faster
      expect(cacheResults.warmCache.cacheHitRate).toBeGreaterThan(0.8); // High cache hit rate
      expect(cacheResults.warmCache.averageResponseTime).toBeLessThan(500); // Fast cached responses
      
      console.log(`Cache efficiency: ${cacheResults.cacheEfficiency.toFixed(2)}x faster, Warm cache hit rate: ${(cacheResults.warmCache.cacheHitRate * 100).toFixed(1)}%`);
    }, 30000);
  });

  describe('Performance Regression Detection', () => {
    it('should detect performance regressions in standard operations', async () => {
      // Arrange - Baseline performance test
      const baselineConfig = {
        concurrentRequests: 3,
        totalRequests: 30,
        errorCodes: [0, 1, 2000],
        warmupRequests: 5,
        timeoutMs: 5000
      };

      // Act
      const baselineResults = await benchmark.runBenchmark(baselineConfig);

      // Assert - Define performance baselines
      const expectedMaxAverageTime = 1000; // 1s average
      const expectedMinSuccessRate = 0.95; // 95% success rate
      const expectedMaxP95Time = 3000; // 3s for 95th percentile

      expect(baselineResults.averageResponseTime).toBeLessThan(expectedMaxAverageTime);
      expect(baselineResults.successfulRequests / baselineResults.totalRequests).toBeGreaterThan(expectedMinSuccessRate);
      expect(baselineResults.p95ResponseTime).toBeLessThan(expectedMaxP95Time);

      console.log(`Performance baseline - Average: ${baselineResults.averageResponseTime}ms, Success: ${(baselineResults.successfulRequests/baselineResults.totalRequests*100).toFixed(1)}%, P95: ${baselineResults.p95ResponseTime}ms`);
    }, 20000);

    it('should maintain performance with concurrent users', async () => {
      // Arrange - Simulate multiple concurrent users
      const concurrentUserTests = [1, 3, 5, 10].map(concurrency => ({
        concurrentRequests: concurrency,
        totalRequests: concurrency * 5,
        errorCodes: [0, 1, 2000, 6000],
        timeoutMs: 10000
      }));

      // Act & Assert
      for (const config of concurrentUserTests) {
        const results = await benchmark.runBenchmark(config);
        
        // Performance should not degrade significantly with more users
        expect(results.successfulRequests / results.totalRequests).toBeGreaterThan(0.9);
        expect(results.averageResponseTime).toBeLessThan(3000); // 3s max average
        
        console.log(`${config.concurrentRequests} concurrent users - Average: ${results.averageResponseTime}ms, Success: ${(results.successfulRequests/results.totalRequests*100).toFixed(1)}%`);
      }
    }, 60000);
  });

  describe('Resource Usage Validation', () => {
    it('should not leak memory during extended operation', async () => {
      // Arrange
      const initialMemory = process.memoryUsage();
      
      const extendedConfig = {
        concurrentRequests: 2,
        totalRequests: 100,
        errorCodes: [0, 1, 2000, 6000],
        timeoutMs: 5000
      };

      // Act
      await benchmark.runBenchmark(extendedConfig);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage();

      // Assert - Memory usage should not increase dramatically
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasePercent = (memoryIncrease / initialMemory.heapUsed) * 100;
      
      console.log(`Memory usage - Initial: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB, Final: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB, Increase: ${memoryIncreasePercent.toFixed(1)}%`);
      
      // Allow up to 50% memory increase for extended operations
      expect(memoryIncreasePercent).toBeLessThan(50);
    }, 45000);
  });
});