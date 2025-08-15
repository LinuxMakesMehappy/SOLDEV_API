/**
 * Tests for performance benchmarking utilities
 * Requirements: 7.1, 7.2 - Performance benchmarks and load testing scenarios
 */

import { PerformanceBenchmark, BenchmarkConfig } from '../../src/utils/performance-benchmark';
import { ErrorExplanationService } from '../../src/services/error-explanation-service';
import { ErrorExplanation } from '../../src/types/api';

// Mock the error explanation service
jest.mock('../../src/services/error-explanation-service');

const MockedErrorExplanationService = ErrorExplanationService as jest.MockedClass<typeof ErrorExplanationService>;

describe('PerformanceBenchmark', () => {
  let benchmark: PerformanceBenchmark;
  let mockService: jest.Mocked<ErrorExplanationService>;
  // let testConfig: ValidatedEnvironmentConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    // Test configuration not needed for mocked service tests

    mockService = {
      explainError: jest.fn(),
      cleanup: jest.fn()
    } as any;

    MockedErrorExplanationService.mockImplementation(() => mockService);
    
    benchmark = new PerformanceBenchmark(mockService);
  });

  describe('Basic Benchmark Execution', () => {
    it('should run a basic benchmark successfully', async () => {
      // Arrange
      const config: BenchmarkConfig = {
        concurrentRequests: 2,
        totalRequests: 10,
        errorCodes: [0, 1, 2000],
        timeoutMs: 1000
      };

      const mockResponse: ErrorExplanation = {
        code: 0,
        explanation: 'Test explanation',
        fixes: ['Test fix'],
        source: 'static',
        confidence: 0.9
      };

      mockService.explainError.mockResolvedValue(mockResponse);

      // Act
      const results = await benchmark.runBenchmark(config);

      // Assert
      expect(results.totalRequests).toBe(10);
      expect(results.successfulRequests).toBe(10);
      expect(results.failedRequests).toBe(0);
      expect(results.averageResponseTime).toBeGreaterThan(0);
      expect(results.requestsPerSecond).toBeGreaterThan(0);
      expect(mockService.explainError).toHaveBeenCalledTimes(10);
    });

    it('should handle failed requests correctly', async () => {
      // Arrange
      const config: BenchmarkConfig = {
        concurrentRequests: 1,
        totalRequests: 5,
        errorCodes: [1000],
        timeoutMs: 100
      };

      mockService.explainError
        .mockResolvedValueOnce({
          code: 1000,
          explanation: 'Success',
          fixes: ['Fix'],
          source: 'static',
          confidence: 0.9
        })
        .mockRejectedValueOnce(new Error('Service error'))
        .mockResolvedValueOnce({
          code: 1000,
          explanation: 'Success',
          fixes: ['Fix'],
          source: 'static',
          confidence: 0.9
        })
        .mockRejectedValueOnce(new Error('Another error'))
        .mockResolvedValueOnce({
          code: 1000,
          explanation: 'Success',
          fixes: ['Fix'],
          source: 'static',
          confidence: 0.9
        });

      // Act
      const results = await benchmark.runBenchmark(config);

      // Assert
      expect(results.totalRequests).toBe(5);
      expect(results.successfulRequests).toBe(3);
      expect(results.failedRequests).toBe(2);
      expect(results.errorDistribution).toHaveProperty('Service error');
      expect(results.errorDistribution).toHaveProperty('Another error');
    });

    it('should handle timeout scenarios', async () => {
      // Arrange
      const config: BenchmarkConfig = {
        concurrentRequests: 1,
        totalRequests: 2,
        errorCodes: [1],
        timeoutMs: 50 // Very short timeout
      };

      // Mock slow responses
      mockService.explainError.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          code: 1,
          explanation: 'Slow response',
          fixes: ['Fix'],
          source: 'ai',
          confidence: 0.8
        }), 100)) // Longer than timeout
      );

      // Act
      const results = await benchmark.runBenchmark(config);

      // Assert
      expect(results.totalRequests).toBe(2);
      expect(results.failedRequests).toBe(2);
      expect(results.errorDistribution).toHaveProperty('Request timeout');
    });

    it('should run warmup requests when configured', async () => {
      // Arrange
      const config: BenchmarkConfig = {
        concurrentRequests: 1,
        totalRequests: 3,
        errorCodes: [0, 1],
        warmupRequests: 2,
        timeoutMs: 1000
      };

      mockService.explainError.mockResolvedValue({
        code: 0,
        explanation: 'Test',
        fixes: ['Fix'],
        source: 'static',
        confidence: 0.9
      });

      // Act
      const results = await benchmark.runBenchmark(config);

      // Assert
      expect(results.totalRequests).toBe(3);
      // Should have called explainError for warmup + actual requests
      expect(mockService.explainError).toHaveBeenCalledTimes(5); // 2 warmup + 3 actual
    });
  });

  describe('Performance Metrics Calculation', () => {
    it('should calculate response time percentiles correctly', async () => {
      // Arrange
      const config: BenchmarkConfig = {
        concurrentRequests: 1,
        totalRequests: 10,
        errorCodes: [0],
        timeoutMs: 5000
      };

      // Mock responses with varying response times
      let callCount = 0;
      mockService.explainError.mockImplementation(() => {
        const delay = Math.floor(Math.random() * 100) + 10; // 10-110ms
        callCount++;
        return new Promise(resolve => 
          setTimeout(() => resolve({
            code: 0,
            explanation: `Response ${callCount}`,
            fixes: ['Fix'],
            source: 'static',
            confidence: 0.9
          }), delay)
        );
      });

      // Act
      const results = await benchmark.runBenchmark(config);

      // Assert
      expect(results.totalRequests).toBe(10);
      expect(results.successfulRequests).toBe(10);
      expect(results.averageResponseTime).toBeGreaterThan(0);
      expect(results.medianResponseTime).toBeGreaterThan(0);
      expect(results.p95ResponseTime).toBeGreaterThan(results.medianResponseTime);
      expect(results.p99ResponseTime).toBeGreaterThanOrEqual(results.p95ResponseTime);
      expect(results.minResponseTime).toBeLessThan(results.maxResponseTime);
    });

    it('should calculate cache hit rate correctly', async () => {
      // Arrange
      const config: BenchmarkConfig = {
        concurrentRequests: 1,
        totalRequests: 10,
        errorCodes: [0],
        timeoutMs: 1000
      };

      // Mock 70% cache hits
      let callCount = 0;
      mockService.explainError.mockImplementation(() => {
        callCount++;
        const isCacheHit = callCount <= 7;
        return Promise.resolve({
          code: 0,
          explanation: 'Test',
          fixes: ['Fix'],
          source: isCacheHit ? 'cache' : 'ai',
          confidence: 0.9
        });
      });

      // Act
      const results = await benchmark.runBenchmark(config);

      // Assert
      expect(results.cacheHitRate).toBeCloseTo(0.7, 1);
    });

    it('should calculate requests per second correctly', async () => {
      // Arrange
      const config: BenchmarkConfig = {
        concurrentRequests: 5,
        totalRequests: 50,
        errorCodes: [0],
        timeoutMs: 1000
      };

      mockService.explainError.mockImplementation(() => 
        Promise.resolve({
          code: 0,
          explanation: 'Fast response',
          fixes: ['Fix'],
          source: 'cache',
          confidence: 0.9
        })
      );

      // Act
      const startTime = Date.now();
      const results = await benchmark.runBenchmark(config);
      const actualDuration = Date.now() - startTime;

      // Assert
      expect(results.requestsPerSecond).toBeGreaterThan(0);
      expect(results.totalDuration).toBeCloseTo(actualDuration, -2); // Within 100ms
    });
  });

  describe('Load Testing', () => {
    it('should run load test with increasing concurrency', async () => {
      // Arrange
      mockService.explainError.mockResolvedValue({
        code: 0,
        explanation: 'Load test response',
        fixes: ['Fix'],
        source: 'static',
        confidence: 0.9
      });

      // Act
      const results = await benchmark.runLoadTest(
        10, // maxConcurrency
        5,  // stepSize
        1000, // stepDuration (1 second for faster test)
        [0, 1]
      );

      // Assert
      expect(Object.keys(results)).toHaveLength(2); // 5 and 10 concurrency levels
      expect(results[5]).toBeDefined();
      expect(results[10]).toBeDefined();
      
      expect(results[5]?.totalRequests).toBeGreaterThan(0);
      expect(results[10]?.totalRequests).toBeGreaterThan(0);
    });

    it('should stop load test on performance degradation', async () => {
      // Arrange
      let callCount = 0;
      mockService.explainError.mockImplementation(() => {
        callCount++;
        // Simulate degrading performance
        const delay = callCount > 5 ? 1000 : 50; // Slow down after 5 calls
        
        return new Promise(resolve => 
          setTimeout(() => resolve({
            code: 0,
            explanation: 'Response',
            fixes: ['Fix'],
            source: 'ai',
            confidence: 0.9
          }), delay)
        );
      });

      // Act
      const results = await benchmark.runLoadTest(
        10, // maxConcurrency
        5, // stepSize
        1000, // stepDuration
        [0]
      );

      // Assert
      // Should have stopped early due to performance degradation
      expect(Object.keys(results).length).toBeLessThanOrEqual(2);
    });
  });

  describe('Cache Performance Testing', () => {
    it('should run cache performance test', async () => {
      // Arrange
      let callCount = 0;
      mockService.explainError.mockImplementation(() => {
        callCount++;
        // First 100 calls (cold cache) - slower
        // Next 100 calls (warm cache) - faster with cache hits
        const isWarmCache = callCount > 100;
        const delay = isWarmCache ? 50 : 200;
        
        return new Promise(resolve => 
          setTimeout(() => resolve({
            code: 0,
            explanation: 'Cache test response',
            fixes: ['Fix'],
            source: isWarmCache ? 'cache' : 'ai',
            confidence: 0.9
          }), delay)
        );
      });

      // Act
      const results = await benchmark.runCachePerformanceTest([0, 1]);

      // Assert
      expect(results.coldCache).toBeDefined();
      expect(results.warmCache).toBeDefined();
      expect(results.cacheEfficiency).toBeGreaterThan(1); // Warm cache should be faster
      
      expect(results.coldCache.cacheHitRate).toBe(0); // No cache hits in cold test
      expect(results.warmCache.cacheHitRate).toBeGreaterThan(0); // Some cache hits in warm test
      expect(results.warmCache.averageResponseTime).toBeLessThan(results.coldCache.averageResponseTime);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty error codes array', async () => {
      // Arrange
      const config: BenchmarkConfig = {
        concurrentRequests: 1,
        totalRequests: 1,
        errorCodes: [],
        timeoutMs: 1000
      };

      // Act
      const results = await benchmark.runBenchmark(config);

      // Assert
      expect(results.totalRequests).toBe(1);
      expect(results.failedRequests).toBe(1);
    });

    it('should handle zero total requests', async () => {
      // Arrange
      const config: BenchmarkConfig = {
        concurrentRequests: 1,
        totalRequests: 0,
        errorCodes: [0],
        timeoutMs: 1000
      };

      // Act
      const results = await benchmark.runBenchmark(config);

      // Assert
      expect(results.totalRequests).toBe(0);
      expect(results.successfulRequests).toBe(0);
      expect(results.failedRequests).toBe(0);
    });

    it('should handle concurrent requests greater than total requests', async () => {
      // Arrange
      const config: BenchmarkConfig = {
        concurrentRequests: 10,
        totalRequests: 5,
        errorCodes: [0],
        timeoutMs: 1000
      };

      mockService.explainError.mockResolvedValue({
        code: 0,
        explanation: 'Test',
        fixes: ['Fix'],
        source: 'static',
        confidence: 0.9
      });

      // Act
      const results = await benchmark.runBenchmark(config);

      // Assert
      expect(results.totalRequests).toBe(5);
      expect(results.successfulRequests).toBe(5);
    });
  });

  describe('Factory Function', () => {
    it('should create benchmark with factory function', () => {
      // Act
      const factoryBenchmark = require('../../src/utils/performance-benchmark').createPerformanceBenchmark(mockService);

      // Assert
      expect(factoryBenchmark).toBeInstanceOf(PerformanceBenchmark);
    });
  });
});