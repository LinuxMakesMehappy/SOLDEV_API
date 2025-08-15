/**
 * Performance monitoring service for tracking API metrics and performance
 * Requirements: 7.1, 7.2, 6.6 - Response time monitoring and CloudWatch metrics
 */

import { CloudWatchClient, PutMetricDataCommand, MetricDatum, StandardUnit } from '@aws-sdk/client-cloudwatch';

/**
 * Performance metrics interface
 */
export interface PerformanceMetrics {
  responseTime: number;
  cacheHit: boolean;
  aiLatency?: number;
  errorCode: number;
  source: 'cache' | 'ai' | 'static';
  timestamp: number;
}

/**
 * Performance thresholds configuration
 */
export interface PerformanceThresholds {
  maxCachedResponseTime: number; // 500ms for cached responses
  maxAIResponseTime: number; // 10s for AI responses
  cacheHitRateTarget: number; // 80% cache hit rate target
}

/**
 * Performance monitoring service
 */
export class PerformanceMonitor {
  private cloudWatch: CloudWatchClient;
  private namespace: string;
  private thresholds: PerformanceThresholds;
  private metricsBuffer: MetricDatum[] = [];
  private bufferFlushInterval: NodeJS.Timeout | null = null;

  constructor(
    region: string = 'us-east-1',
    namespace: string = 'SolanaErrorAPI',
    thresholds: Partial<PerformanceThresholds> = {}
  ) {
    this.cloudWatch = new CloudWatchClient({ region });
    this.namespace = namespace;
    this.thresholds = {
      maxCachedResponseTime: 500, // 500ms
      maxAIResponseTime: 10000, // 10s
      cacheHitRateTarget: 0.8, // 80%
      ...thresholds
    };

    // Start buffer flush interval (every 60 seconds)
    this.startBufferFlush();
  }

  /**
   * Record performance metrics for an API request
   */
  async recordMetrics(metrics: PerformanceMetrics): Promise<void> {
    try {
      const timestamp = new Date(metrics.timestamp);

      // Core performance metrics
      this.addMetricToBuffer('ResponseTime', metrics.responseTime, StandardUnit.Milliseconds, timestamp);
      this.addMetricToBuffer('CacheHit', metrics.cacheHit ? 1 : 0, StandardUnit.Count, timestamp);
      
      // Source-specific metrics
      this.addMetricToBuffer(`${metrics.source}Requests`, 1, StandardUnit.Count, timestamp);
      
      // AI latency if available
      if (metrics.aiLatency !== undefined) {
        this.addMetricToBuffer('AILatency', metrics.aiLatency, StandardUnit.Milliseconds, timestamp);
      }

      // Error code distribution
      this.addMetricToBuffer('ErrorCodeRequests', 1, StandardUnit.Count, timestamp, [
        { Name: 'ErrorCode', Value: metrics.errorCode.toString() },
        { Name: 'ErrorType', Value: this.classifyErrorType(metrics.errorCode) }
      ]);

      // Performance threshold violations
      await this.checkThresholds(metrics);

    } catch (error) {
      console.error('[PerformanceMonitor] Failed to record metrics:', error);
    }
  }

  /**
   * Record cache performance metrics
   */
  async recordCacheMetrics(hitRate: number, size: number): Promise<void> {
    try {
      const timestamp = new Date();
      
      this.addMetricToBuffer('CacheHitRate', hitRate * 100, StandardUnit.Percent, timestamp);
      this.addMetricToBuffer('CacheSize', size, StandardUnit.Count, timestamp);
      
      // Check cache performance
      if (hitRate < this.thresholds.cacheHitRateTarget) {
        this.addMetricToBuffer('CacheHitRateViolation', 1, StandardUnit.Count, timestamp);
      }

    } catch (error) {
      console.error('[PerformanceMonitor] Failed to record cache metrics:', error);
    }
  }

  /**
   * Record AI service performance metrics
   */
  async recordAIServiceMetrics(
    service: string,
    latency: number,
    success: boolean,
    errorCount: number = 0
  ): Promise<void> {
    try {
      const timestamp = new Date();
      
      this.addMetricToBuffer('AIServiceLatency', latency, StandardUnit.Milliseconds, timestamp, [
        { Name: 'Service', Value: service }
      ]);
      
      this.addMetricToBuffer('AIServiceSuccess', success ? 1 : 0, StandardUnit.Count, timestamp, [
        { Name: 'Service', Value: service }
      ]);
      
      if (errorCount > 0) {
        this.addMetricToBuffer('AIServiceErrors', errorCount, StandardUnit.Count, timestamp, [
          { Name: 'Service', Value: service }
        ]);
      }

    } catch (error) {
      console.error('[PerformanceMonitor] Failed to record AI service metrics:', error);
    }
  }

  /**
   * Get current performance statistics
   */
  getPerformanceStats(): {
    thresholds: PerformanceThresholds;
    bufferSize: number;
    namespace: string;
  } {
    return {
      thresholds: this.thresholds,
      bufferSize: this.metricsBuffer.length,
      namespace: this.namespace
    };
  }

  /**
   * Flush metrics buffer to CloudWatch
   */
  async flushMetrics(): Promise<void> {
    if (this.metricsBuffer.length === 0) {
      return;
    }

    try {
      // CloudWatch accepts max 20 metrics per request
      const batches = this.chunkArray(this.metricsBuffer, 20);
      
      for (const batch of batches) {
        const command = new PutMetricDataCommand({
          Namespace: this.namespace,
          MetricData: batch
        });
        
        await this.cloudWatch.send(command);
      }

      console.log(`[PerformanceMonitor] Flushed ${this.metricsBuffer.length} metrics to CloudWatch`);
      this.metricsBuffer = [];

    } catch (error) {
      console.error('[PerformanceMonitor] Failed to flush metrics:', error);
      // Keep metrics in buffer for retry
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
      this.bufferFlushInterval = null;
    }
    
    // Flush remaining metrics
    this.flushMetrics().catch(error => {
      console.error('[PerformanceMonitor] Failed to flush metrics during cleanup:', error);
    });
  }

  /**
   * Add metric to buffer
   */
  private addMetricToBuffer(
    metricName: string,
    value: number,
    unit: StandardUnit,
    timestamp: Date,
    dimensions: Array<{ Name: string; Value: string }> = []
  ): void {
    this.metricsBuffer.push({
      MetricName: metricName,
      Value: value,
      Unit: unit,
      Timestamp: timestamp,
      Dimensions: dimensions.length > 0 ? dimensions : undefined
    });
  }

  /**
   * Check performance thresholds and record violations
   */
  private async checkThresholds(metrics: PerformanceMetrics): Promise<void> {
    const timestamp = new Date(metrics.timestamp);

    // Check cached response time threshold
    if (metrics.cacheHit && metrics.responseTime > this.thresholds.maxCachedResponseTime) {
      this.addMetricToBuffer('CachedResponseTimeViolation', 1, StandardUnit.Count, timestamp);
    }

    // Check AI response time threshold
    if (metrics.source === 'ai' && metrics.responseTime > this.thresholds.maxAIResponseTime) {
      this.addMetricToBuffer('AIResponseTimeViolation', 1, StandardUnit.Count, timestamp);
    }
  }

  /**
   * Classify error type for metrics
   */
  private classifyErrorType(errorCode: number): string {
    if (errorCode >= 0 && errorCode <= 999) {
      return 'standard';
    } else if (errorCode >= 2000 && errorCode <= 2999) {
      return 'anchor_constraint';
    } else if (errorCode >= 6000) {
      return 'custom';
    } else {
      return 'unknown';
    }
  }

  /**
   * Start buffer flush interval
   */
  private startBufferFlush(): void {
    this.bufferFlushInterval = setInterval(() => {
      this.flushMetrics().catch(error => {
        console.error('[PerformanceMonitor] Scheduled flush failed:', error);
      });
    }, 60000); // Flush every 60 seconds
  }

  /**
   * Chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}

/**
 * Performance timer utility for measuring execution time
 */
export class PerformanceTimer {
  private startTime: number;
  private endTime?: number;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Stop the timer and return elapsed time in milliseconds
   */
  stop(): number {
    this.endTime = Date.now();
    return this.endTime - this.startTime;
  }

  /**
   * Get elapsed time without stopping the timer
   */
  elapsed(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Reset the timer
   */
  reset(): void {
    this.startTime = Date.now();
    delete this.endTime;
  }
}

/**
 * Factory function to create performance monitor
 */
export function createPerformanceMonitor(
  region?: string,
  namespace?: string,
  thresholds?: Partial<PerformanceThresholds>
): PerformanceMonitor {
  return new PerformanceMonitor(region, namespace, thresholds);
}