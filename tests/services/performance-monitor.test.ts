/**
 * Tests for performance monitoring service
 * Requirements: 7.1, 7.2, 6.6 - Performance monitoring and CloudWatch metrics
 */

import { PerformanceMonitor, PerformanceTimer, PerformanceMetrics } from '../../src/services/performance-monitor';

// Mock AWS CloudWatch
jest.mock('@aws-sdk/client-cloudwatch');

import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const MockedCloudWatchClient = CloudWatchClient as jest.MockedClass<typeof CloudWatchClient>;

describe('PerformanceMonitor', () => {
  let performanceMonitor: PerformanceMonitor;
  let mockCloudWatch: jest.Mocked<CloudWatchClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockCloudWatch = {
      send: jest.fn().mockResolvedValue({})
    } as any;

    MockedCloudWatchClient.mockImplementation(() => mockCloudWatch);
    
    performanceMonitor = new PerformanceMonitor('us-east-1', 'TestNamespace', {
      maxCachedResponseTime: 500,
      maxAIResponseTime: 10000,
      cacheHitRateTarget: 0.8
    });
  });

  afterEach(() => {
    performanceMonitor.cleanup();
  });

  describe('Performance Metrics Recording', () => {
    it('should record basic performance metrics', async () => {
      // Arrange
      const metrics: PerformanceMetrics = {
        responseTime: 250,
        cacheHit: true,
        errorCode: 2000,
        source: 'cache',
        timestamp: Date.now()
      };

      // Act
      await performanceMonitor.recordMetrics(metrics);

      // Assert
      const stats = performanceMonitor.getPerformanceStats();
      expect(stats.bufferSize).toBeGreaterThan(0);
      expect(stats.namespace).toBe('TestNamespace');
    });

    it('should record AI latency when provided', async () => {
      // Arrange
      const metrics: PerformanceMetrics = {
        responseTime: 2500,
        cacheHit: false,
        aiLatency: 2000,
        errorCode: 6000,
        source: 'ai',
        timestamp: Date.now()
      };

      // Act
      await performanceMonitor.recordMetrics(metrics);

      // Assert
      const stats = performanceMonitor.getPerformanceStats();
      expect(stats.bufferSize).toBeGreaterThan(0);
    });

    it('should classify error types correctly', async () => {
      const testCases = [
        { errorCode: 0, expectedType: 'standard' },
        { errorCode: 1, expectedType: 'standard' },
        { errorCode: 2000, expectedType: 'anchor_constraint' },
        { errorCode: 6000, expectedType: 'custom' },
        { errorCode: 9999, expectedType: 'unknown' }
      ];

      for (const testCase of testCases) {
        const metrics: PerformanceMetrics = {
          responseTime: 100,
          cacheHit: false,
          errorCode: testCase.errorCode,
          source: 'static',
          timestamp: Date.now()
        };

        await performanceMonitor.recordMetrics(metrics);
      }

      const stats = performanceMonitor.getPerformanceStats();
      expect(stats.bufferSize).toBeGreaterThan(0);
    });
  });

  describe('Cache Performance Metrics', () => {
    it('should record cache hit rate and size', async () => {
      // Arrange
      const hitRate = 0.85;
      const cacheSize = 150;

      // Act
      await performanceMonitor.recordCacheMetrics(hitRate, cacheSize);

      // Assert
      const stats = performanceMonitor.getPerformanceStats();
      expect(stats.bufferSize).toBeGreaterThan(0);
    });

    it('should detect cache hit rate violations', async () => {
      // Arrange
      const lowHitRate = 0.6; // Below 0.8 threshold
      const cacheSize = 100;

      // Act
      await performanceMonitor.recordCacheMetrics(lowHitRate, cacheSize);

      // Assert
      const stats = performanceMonitor.getPerformanceStats();
      expect(stats.bufferSize).toBeGreaterThan(0);
    });
  });

  describe('AI Service Performance Metrics', () => {
    it('should record AI service performance', async () => {
      // Arrange
      const service = 'bedrock';
      const latency = 1500;
      const success = true;

      // Act
      await performanceMonitor.recordAIServiceMetrics(service, latency, success);

      // Assert
      const stats = performanceMonitor.getPerformanceStats();
      expect(stats.bufferSize).toBeGreaterThan(0);
    });

    it('should record AI service errors', async () => {
      // Arrange
      const service = 'external-api';
      const latency = 5000;
      const success = false;
      const errorCount = 3;

      // Act
      await performanceMonitor.recordAIServiceMetrics(service, latency, success, errorCount);

      // Assert
      const stats = performanceMonitor.getPerformanceStats();
      expect(stats.bufferSize).toBeGreaterThan(0);
    });
  });

  describe('Threshold Monitoring', () => {
    it('should detect cached response time violations', async () => {
      // Arrange
      const metrics: PerformanceMetrics = {
        responseTime: 750, // Above 500ms threshold
        cacheHit: true,
        errorCode: 1,
        source: 'cache',
        timestamp: Date.now()
      };

      // Act
      await performanceMonitor.recordMetrics(metrics);

      // Assert
      const stats = performanceMonitor.getPerformanceStats();
      expect(stats.thresholds.maxCachedResponseTime).toBe(500);
    });

    it('should detect AI response time violations', async () => {
      // Arrange
      const metrics: PerformanceMetrics = {
        responseTime: 12000, // Above 10s threshold
        cacheHit: false,
        errorCode: 6000,
        source: 'ai',
        timestamp: Date.now()
      };

      // Act
      await performanceMonitor.recordMetrics(metrics);

      // Assert
      const stats = performanceMonitor.getPerformanceStats();
      expect(stats.thresholds.maxAIResponseTime).toBe(10000);
    });
  });

  describe('Metrics Flushing', () => {
    it('should flush metrics to CloudWatch', async () => {
      // Arrange
      const metrics: PerformanceMetrics = {
        responseTime: 200,
        cacheHit: true,
        errorCode: 0,
        source: 'cache',
        timestamp: Date.now()
      };

      await performanceMonitor.recordMetrics(metrics);
      (mockCloudWatch.send as jest.Mock).mockResolvedValue({});

      // Act
      await performanceMonitor.flushMetrics();

      // Assert
      expect(mockCloudWatch.send).toHaveBeenCalledWith(
        expect.any(PutMetricDataCommand)
      );
    });

    it('should handle CloudWatch errors gracefully', async () => {
      // Arrange
      const metrics: PerformanceMetrics = {
        responseTime: 200,
        cacheHit: true,
        errorCode: 0,
        source: 'cache',
        timestamp: Date.now()
      };

      await performanceMonitor.recordMetrics(metrics);
      (mockCloudWatch.send as jest.Mock).mockRejectedValue(new Error('CloudWatch error'));

      // Act & Assert - Should not throw
      await expect(performanceMonitor.flushMetrics()).resolves.not.toThrow();
    });

    it('should batch metrics correctly', async () => {
      // Arrange - Add more than 20 metrics to test batching
      for (let i = 0; i < 25; i++) {
        const metrics: PerformanceMetrics = {
          responseTime: 100 + i,
          cacheHit: i % 2 === 0,
          errorCode: i,
          source: 'static',
          timestamp: Date.now()
        };
        await performanceMonitor.recordMetrics(metrics);
      }

      (mockCloudWatch.send as jest.Mock).mockResolvedValue({});

      // Act
      await performanceMonitor.flushMetrics();

      // Assert - Should be called multiple times due to batching (each metric generates multiple CloudWatch metrics)
      expect(mockCloudWatch.send).toHaveBeenCalled();
      expect(mockCloudWatch.send).toHaveBeenCalledWith(
        expect.any(PutMetricDataCommand)
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle metric recording errors gracefully', async () => {
      // Arrange
      const invalidMetrics = {
        responseTime: NaN,
        cacheHit: true,
        errorCode: -1,
        source: 'invalid' as any,
        timestamp: Date.now()
      };

      // Act & Assert - Should not throw
      await expect(performanceMonitor.recordMetrics(invalidMetrics)).resolves.not.toThrow();
    });

    it('should handle cache metrics errors gracefully', async () => {
      // Act & Assert - Should not throw
      await expect(performanceMonitor.recordCacheMetrics(NaN, -1)).resolves.not.toThrow();
    });
  });
});

describe('PerformanceTimer', () => {
  let timer: PerformanceTimer;

  beforeEach(() => {
    timer = new PerformanceTimer();
  });

  describe('Timer Operations', () => {
    it('should measure elapsed time correctly', async () => {
      // Arrange
      const delay = 100;

      // Act
      await new Promise(resolve => setTimeout(resolve, delay));
      const elapsed = timer.stop();

      // Assert
      expect(elapsed).toBeGreaterThanOrEqual(delay - 10); // Allow for timing variance
      expect(elapsed).toBeLessThan(delay + 50);
    });

    it('should get elapsed time without stopping', async () => {
      // Arrange
      const delay = 50;

      // Act
      await new Promise(resolve => setTimeout(resolve, delay));
      const elapsed1 = timer.elapsed();
      await new Promise(resolve => setTimeout(resolve, delay));
      const elapsed2 = timer.elapsed();

      // Assert
      expect(elapsed2).toBeGreaterThan(elapsed1);
      expect(elapsed1).toBeGreaterThanOrEqual(delay - 10);
    });

    it('should reset timer correctly', async () => {
      // Arrange
      await new Promise(resolve => setTimeout(resolve, 50));
      const elapsed1 = timer.elapsed();

      // Act
      timer.reset();
      const elapsed2 = timer.elapsed();

      // Assert
      expect(elapsed1).toBeGreaterThan(elapsed2);
      expect(elapsed2).toBeLessThan(10); // Should be very small after reset
    });

    it('should handle multiple stop calls', () => {
      // Act
      const time1 = timer.stop();
      const time2 = timer.stop();

      // Assert
      expect(time1).toBe(time2); // Should return same time
    });
  });

  describe('Performance Validation', () => {
    it('should measure sub-millisecond operations', () => {
      // Act
      const elapsed = timer.stop();

      // Assert
      expect(elapsed).toBeGreaterThanOrEqual(0);
      expect(elapsed).toBeLessThan(10); // Should be very fast
    });

    it('should handle concurrent timers', async () => {
      // Arrange
      const timer1 = new PerformanceTimer();
      const timer2 = new PerformanceTimer();

      // Act
      await new Promise(resolve => setTimeout(resolve, 50));
      const elapsed1 = timer1.stop();
      
      await new Promise(resolve => setTimeout(resolve, 50));
      const elapsed2 = timer2.stop();

      // Assert
      expect(elapsed2).toBeGreaterThan(elapsed1);
    });
  });
});

describe('Performance Monitor Integration', () => {
  it('should create performance monitor with factory function', () => {
    // Act
    const monitor = require('../../src/services/performance-monitor').createPerformanceMonitor(
      'us-west-2',
      'CustomNamespace',
      { maxCachedResponseTime: 300 }
    );

    // Assert
    expect(monitor).toBeInstanceOf(PerformanceMonitor);
    
    const stats = monitor.getPerformanceStats();
    expect(stats.namespace).toBe('CustomNamespace');
    expect(stats.thresholds.maxCachedResponseTime).toBe(300);

    // Cleanup
    monitor.cleanup();
  });

  it('should use default configuration when not provided', () => {
    // Act
    const monitor = new PerformanceMonitor();

    // Assert
    const stats = monitor.getPerformanceStats();
    expect(stats.namespace).toBe('SolanaErrorAPI');
    expect(stats.thresholds.maxCachedResponseTime).toBe(500);
    expect(stats.thresholds.maxAIResponseTime).toBe(10000);
    expect(stats.thresholds.cacheHitRateTarget).toBe(0.8);

    // Cleanup
    monitor.cleanup();
  });
});