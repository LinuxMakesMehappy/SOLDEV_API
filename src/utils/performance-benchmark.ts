/**
 * Performance benchmarking utilities for load testing and performance validation
 * Requirements: 7.1, 7.2 - Performance benchmarks and load testing scenarios
 */

import { ErrorExplanationService } from '../services/error-explanation-service';
import { PerformanceTimer } from '../services/performance-monitor';

/**
 * Benchmark configuration
 */
export interface BenchmarkConfig {
  concurrentRequests: number;
  totalRequests: number;
  errorCodes: number[];
  warmupRequests?: number;
  timeoutMs?: number;
}

/**
 * Benchmark results
 */
export interface BenchmarkResults {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  medianResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  requestsPerSecond: number;
  cacheHitRate: number;
  totalDuration: number;
  errorDistribution: Record<string, number>;
}

/**
 * Individual request result
 */
interface RequestResult {
  success: boolean;
  responseTime: number;
  errorCode: number;
  cacheHit: boolean;
  error?: string | undefined;
}

/**
 * Performance benchmark runner
 */
export class PerformanceBenchmark {
  private service: ErrorExplanationService;

  constructor(service: ErrorExplanationService) {
    this.service = service;
  }

  /**
   * Run performance benchmark
   */
  async runBenchmark(config: BenchmarkConfig): Promise<BenchmarkResults> {
    console.log(`[PerformanceBenchmark] Starting benchmark with ${config.totalRequests} requests, ${config.concurrentRequests} concurrent`);

    // Warmup phase
    if (config.warmupRequests && config.warmupRequests > 0) {
      console.log(`[PerformanceBenchmark] Running ${config.warmupRequests} warmup requests`);
      await this.runWarmup(config.warmupRequests, config.errorCodes);
    }

    const timer = new PerformanceTimer();
    const results: RequestResult[] = [];

    // Run benchmark in batches to control concurrency
    const batchSize = config.concurrentRequests;
    const totalBatches = Math.ceil(config.totalRequests / batchSize);

    for (let batch = 0; batch < totalBatches; batch++) {
      const batchStart = batch * batchSize;
      const batchEnd = Math.min(batchStart + batchSize, config.totalRequests);
      const batchSize_actual = batchEnd - batchStart;

      console.log(`[PerformanceBenchmark] Running batch ${batch + 1}/${totalBatches} (${batchSize_actual} requests)`);

      // Create batch of concurrent requests
      const batchPromises = Array.from({ length: batchSize_actual }, () => {
        const errorCode = config.errorCodes[Math.floor(Math.random() * config.errorCodes.length)] || 0;
        return this.runSingleRequest(errorCode, config.timeoutMs || 10000);
      });

      // Execute batch concurrently
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Process batch results
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          const errorCode = config.errorCodes[index % config.errorCodes.length];
          results.push({
            success: false,
            responseTime: config.timeoutMs || 10000,
            errorCode: errorCode || 0,
            cacheHit: false,
            error: result.reason?.message || 'Unknown error'
          });
        }
      });

      // Small delay between batches to avoid overwhelming the system
      if (batch < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const totalDuration = timer.stop();
    
    console.log(`[PerformanceBenchmark] Benchmark completed in ${totalDuration}ms`);
    
    return this.calculateResults(results, totalDuration);
  }

  /**
   * Run load test with increasing load
   */
  async runLoadTest(
    maxConcurrency: number = 50,
    stepSize: number = 5,
    stepDuration: number = 30000, // 30 seconds per step
    errorCodes: number[] = [0, 1, 2000, 6000]
  ): Promise<Record<number, BenchmarkResults>> {
    console.log(`[PerformanceBenchmark] Starting load test up to ${maxConcurrency} concurrent requests`);

    const results: Record<number, BenchmarkResults> = {};

    for (let concurrency = stepSize; concurrency <= maxConcurrency; concurrency += stepSize) {
      console.log(`[PerformanceBenchmark] Testing with ${concurrency} concurrent requests`);

      const requestsPerStep = Math.floor((stepDuration / 1000) * concurrency); // Approximate requests for the duration
      
      const config: BenchmarkConfig = {
        concurrentRequests: concurrency,
        totalRequests: requestsPerStep,
        errorCodes,
        timeoutMs: 15000
      };

      try {
        const stepResult = await this.runBenchmark(config);
        results[concurrency] = stepResult;

        // Check if performance is degrading significantly
        if (stepResult.averageResponseTime > 5000 || stepResult.failedRequests / stepResult.totalRequests > 0.1) {
          console.warn(`[PerformanceBenchmark] Performance degradation detected at ${concurrency} concurrent requests`);
        }

      } catch (error) {
        console.error(`[PerformanceBenchmark] Load test failed at ${concurrency} concurrent requests:`, error);
        break;
      }

      // Cool down between steps
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return results;
  }

  /**
   * Run cache performance test
   */
  async runCachePerformanceTest(errorCodes: number[] = [0, 1, 2000, 6000]): Promise<{
    coldCache: BenchmarkResults;
    warmCache: BenchmarkResults;
    cacheEfficiency: number;
  }> {
    console.log('[PerformanceBenchmark] Running cache performance test');

    // Test with cold cache
    console.log('[PerformanceBenchmark] Testing cold cache performance');
    const coldCacheConfig: BenchmarkConfig = {
      concurrentRequests: 10,
      totalRequests: 100,
      errorCodes,
      timeoutMs: 10000
    };
    const coldCache = await this.runBenchmark(coldCacheConfig);

    // Test with warm cache (same error codes)
    console.log('[PerformanceBenchmark] Testing warm cache performance');
    const warmCacheConfig: BenchmarkConfig = {
      concurrentRequests: 10,
      totalRequests: 100,
      errorCodes, // Same error codes to hit cache
      timeoutMs: 5000
    };
    const warmCache = await this.runBenchmark(warmCacheConfig);

    const cacheEfficiency = warmCache.cacheHitRate > 0 ? 
      (coldCache.averageResponseTime / warmCache.averageResponseTime) : 1;

    return {
      coldCache,
      warmCache,
      cacheEfficiency
    };
  }

  /**
   * Run single request and measure performance
   */
  private async runSingleRequest(errorCode: number, timeoutMs: number = 10000): Promise<RequestResult> {
    const timer = new PerformanceTimer();
    
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
      });

      const requestPromise = this.service.explainError(errorCode);
      
      const result = await Promise.race([requestPromise, timeoutPromise]);
      const responseTime = timer.stop();

      return {
        success: true,
        responseTime,
        errorCode,
        cacheHit: result.source === 'cache'
      };

    } catch (error) {
      const responseTime = timer.stop();
      return {
        success: false,
        responseTime,
        errorCode,
        cacheHit: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Run warmup requests
   */
  private async runWarmup(warmupRequests: number, errorCodes: number[]): Promise<void> {
    const warmupPromises = Array.from({ length: warmupRequests }, () => {
      const errorCode = errorCodes[Math.floor(Math.random() * errorCodes.length)] || 0;
      return this.service.explainError(errorCode).catch(() => {
        // Ignore warmup errors
      });
    });

    await Promise.allSettled(warmupPromises);
  }

  /**
   * Calculate benchmark results from individual request results
   */
  private calculateResults(results: RequestResult[], totalDuration: number): BenchmarkResults {
    const successfulResults = results.filter(r => r.success);
    const responseTimes = successfulResults.map(r => r.responseTime).sort((a, b) => a - b);
    
    const totalRequests = results.length;
    const successfulRequests = successfulResults.length;
    const failedRequests = totalRequests - successfulRequests;
    
    const cacheHits = successfulResults.filter(r => r.cacheHit).length;
    const cacheHitRate = successfulRequests > 0 ? cacheHits / successfulRequests : 0;

    // Calculate percentiles
    const p95Index = Math.max(0, Math.floor(responseTimes.length * 0.95) - 1);
    const p99Index = Math.max(0, Math.floor(responseTimes.length * 0.99) - 1);
    const medianIndex = Math.max(0, Math.floor(responseTimes.length * 0.5) - 1);

    // Error distribution
    const errorDistribution: Record<string, number> = {};
    results.filter(r => !r.success).forEach(r => {
      const error = r.error || 'Unknown error';
      errorDistribution[error] = (errorDistribution[error] || 0) + 1;
    });

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime: responseTimes.length > 0 ? 
        responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length : 0,
      medianResponseTime: responseTimes.length > 0 ? (responseTimes[medianIndex] || 0) : 0,
      p95ResponseTime: responseTimes.length > 0 ? (responseTimes[p95Index] || 0) : 0,
      p99ResponseTime: responseTimes.length > 0 ? (responseTimes[p99Index] || 0) : 0,
      minResponseTime: responseTimes.length > 0 ? (responseTimes[0] || 0) : 0,
      maxResponseTime: responseTimes.length > 0 ? (responseTimes[responseTimes.length - 1] || 0) : 0,
      requestsPerSecond: totalDuration > 0 ? (successfulRequests / totalDuration) * 1000 : 0,
      cacheHitRate,
      totalDuration,
      errorDistribution
    };
  }
}

/**
 * Factory function to create performance benchmark
 */
export function createPerformanceBenchmark(service: ErrorExplanationService): PerformanceBenchmark {
  return new PerformanceBenchmark(service);
}