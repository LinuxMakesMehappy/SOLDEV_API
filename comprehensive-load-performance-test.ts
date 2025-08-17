/**
 * Comprehensive Load and Performance Testing Suite for Solana Debug API
 * Tests performance, scalability, reliability, and resource efficiency
 */

import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler } from '../src/handlers/lambda-handler';

interface PerformanceTestCase {
  name: string;
  description: string;
  concurrent: number;
  requests: number;
  payload: any;
  expectedResponseTime: number; // in milliseconds
  expectedSuccessRate: number; // percentage
}

interface LoadTestResults {
  testName: string;
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
  successRate: number;
  errorTypes: Record<string, number>;
  memoryUsage: {
    initial: number;
    peak: number;
    final: number;
    leakDetected: boolean;
  };
}

interface StressTestResults {
  breakingPoint: number;
  maxConcurrentUsers: number;
  degradationThreshold: number;
  recoveryTime: number;
  stabilityScore: number;
}

class ComprehensiveLoadTester {
  private results: LoadTestResults[] = [];
  private stressResults: StressTestResults | null = null;

  // Performance test scenarios
  private performanceTests: PerformanceTestCase[] = [
    {
      name: 'Light Load Test',
      description: 'Simulate normal usage with light load',
      concurrent: 5,
      requests: 50,
      payload: { errorCode: 6000 },
      expectedResponseTime: 2000,
      expectedSuccessRate: 99
    },
    {
      name: 'Medium Load Test',
      description: 'Simulate moderate usage patterns',
      concurrent: 25,
      requests: 250,
      payload: { errorCode: 2001 },
      expectedResponseTime: 3000,
      expectedSuccessRate: 98
    },
    {
      name: 'Heavy Load Test',
      description: 'Simulate peak usage conditions',
      concurrent: 50,
      requests: 500,
      payload: { errorCode: 1 },
      expectedResponseTime: 5000,
      expectedSuccessRate: 95
    },
    {
      name: 'Burst Load Test',
      description: 'Test handling of sudden traffic spikes',
      concurrent: 100,
      requests: 200,
      payload: { errorCode: 6001 },
      expectedResponseTime: 8000,
      expectedSuccessRate: 90
    },
    {
      name: 'Mixed Error Codes Test',
      description: 'Test with various error codes to stress different code paths',
      concurrent: 30,
      requests: 300,
      payload: null, // Will be randomized
      expectedResponseTime: 4000,
      expectedSuccessRate: 96
    },
    {
      name: 'Cache Stress Test',
      description: 'Test cache performance with repeated requests',
      concurrent: 20,
      requests: 1000,
      payload: { errorCode: 6000 }, // Same error code to test caching
      expectedResponseTime: 500, // Should be fast due to caching
      expectedSuccessRate: 99
    },
    {
      name: 'Long Duration Test',
      description: 'Test system stability over extended period',
      concurrent: 10,
      requests: 2000,
      payload: { errorCode: 2000 },
      expectedResponseTime: 3000,
      expectedSuccessRate: 98
    }
  ];

  private createMockEvent(payload: any, requestId?: string): APIGatewayProxyEvent {
    return {
      httpMethod: 'POST',
      path: '/explain-error',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LoadTester/1.0',
        'X-Forwarded-For': `192.168.1.${Math.floor(Math.random() * 255)}`
      },
      multiValueHeaders: {},
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      pathParameters: null,
      stageVariables: null,
      requestContext: {
        requestId: requestId || 'load-test-' + Date.now() + '-' + Math.random(),
        stage: 'test',
        httpMethod: 'POST',
        path: '/explain-error',
        protocol: 'HTTPS',
        requestTime: new Date().toISOString(),
        requestTimeEpoch: Date.now(),
        identity: {
          sourceIp: `192.168.1.${Math.floor(Math.random() * 255)}`,
          userAgent: 'LoadTester/1.0'
        } as any,
        accountId: 'test-account',
        apiId: 'test-api',
        resourceId: 'test-resource',
        resourcePath: '/explain-error'
      } as any,
      body: JSON.stringify(payload),
      isBase64Encoded: false
    };
  }

  private createMockContext(): Context {
    return {
      callbackWaitsForEmptyEventLoop: false,
      functionName: 'solana-error-api-load-test',
      functionVersion: '1',
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:load-test',
      memoryLimitInMB: '512',
      awsRequestId: 'load-test-' + Date.now(),
      logGroupName: '/aws/lambda/load-test',
      logStreamName: 'load-test-stream',
      getRemainingTimeInMillis: () => 30000,
      done: () => {},
      fail: () => {},
      succeed: () => {}
    };
  }

  private getRandomErrorCode(): number {
    const errorCodes = [0, 1, 2000, 2001, 2002, 6000, 6001, 6002, 6003, 6004, 6005];
    return errorCodes[Math.floor(Math.random() * errorCodes.length)];
  }

  private getMemoryUsage(): number {
    const used = process.memoryUsage();
    return Math.round(used.heapUsed / 1024 / 1024 * 100) / 100; // MB
  }

  private calculatePercentile(values: number[], percentile: number): number {
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile / 100) - 1;
    return sorted[Math.max(0, index)];
  }

  async runLoadTest(testCase: PerformanceTestCase): Promise<LoadTestResults> {
    console.log(`\n🚀 Starting ${testCase.name}...`);
    console.log(`   Concurrent: ${testCase.concurrent}, Total Requests: ${testCase.requests}`);
    
    const initialMemory = this.getMemoryUsage();
    const responseTimes: number[] = [];
    const results: any[] = [];
    const errorTypes: Record<string, number> = {};
    let peakMemory = initialMemory;

    const batchSize = testCase.concurrent;
    const totalBatches = Math.ceil(testCase.requests / batchSize);
    
    const startTime = Date.now();
    
    for (let batch = 0; batch < totalBatches; batch++) {
      const currentBatchSize = Math.min(batchSize, testCase.requests - (batch * batchSize));
      const batchPromises: Promise<any>[] = [];
      
      for (let i = 0; i < currentBatchSize; i++) {
        const payload = testCase.payload || { errorCode: this.getRandomErrorCode() };
        const requestId = `${testCase.name}-batch${batch}-req${i}`;
        
        const requestStart = Date.now();
        const promise = handler(this.createMockEvent(payload, requestId), this.createMockContext())
          .then(result => {
            const requestEnd = Date.now();
            const responseTime = requestEnd - requestStart;
            responseTimes.push(responseTime);
            
            // Track memory usage
            const currentMemory = this.getMemoryUsage();
            peakMemory = Math.max(peakMemory, currentMemory);
            
            return { result, responseTime, success: result.statusCode === 200 };
          })
          .catch(error => {
            const requestEnd = Date.now();
            const responseTime = requestEnd - requestStart;
            responseTimes.push(responseTime);
            
            const errorType = error.name || 'Unknown';
            errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
            
            return { result: null, responseTime, success: false, error };
          });
        
        batchPromises.push(promise);
      }
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Progress reporting
      const progress = ((batch + 1) / totalBatches * 100).toFixed(1);
      process.stdout.write(`\r   Progress: ${progress}% (Batch ${batch + 1}/${totalBatches})`);
      
      // Small delay between batches to avoid overwhelming
      if (batch < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    const endTime = Date.now();
    const totalDuration = endTime - startTime;
    const finalMemory = this.getMemoryUsage();
    
    console.log('\n   ✅ Test completed');
    
    // Calculate metrics
    const successfulRequests = results.filter(r => r.success).length;
    const failedRequests = results.length - successfulRequests;
    const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const medianResponseTime = this.calculatePercentile(responseTimes, 50);
    const p95ResponseTime = this.calculatePercentile(responseTimes, 95);
    const p99ResponseTime = this.calculatePercentile(responseTimes, 99);
    const minResponseTime = Math.min(...responseTimes);
    const maxResponseTime = Math.max(...responseTimes);
    const requestsPerSecond = (results.length / totalDuration) * 1000;
    const successRate = (successfulRequests / results.length) * 100;
    
    // Memory leak detection
    const memoryIncrease = finalMemory - initialMemory;
    const leakDetected = memoryIncrease > (initialMemory * 0.5); // 50% increase threshold
    
    const loadTestResult: LoadTestResults = {
      testName: testCase.name,
      totalRequests: results.length,
      successfulRequests,
      failedRequests,
      averageResponseTime: Math.round(averageResponseTime * 100) / 100,
      medianResponseTime,
      p95ResponseTime,
      p99ResponseTime,
      minResponseTime,
      maxResponseTime,
      requestsPerSecond: Math.round(requestsPerSecond * 100) / 100,
      successRate: Math.round(successRate * 100) / 100,
      errorTypes,
      memoryUsage: {
        initial: initialMemory,
        peak: peakMemory,
        final: finalMemory,
        leakDetected
      }
    };
    
    this.results.push(loadTestResult);
    this.displayTestResults(loadTestResult, testCase);
    
    return loadTestResult;
  }

  private displayTestResults(result: LoadTestResults, testCase: PerformanceTestCase): void {
    console.log(`\n📊 Results for ${result.testName}:`);
    console.log(`   Total Requests: ${result.totalRequests}`);
    console.log(`   Successful: ${result.successfulRequests} (${result.successRate}%)`);
    console.log(`   Failed: ${result.failedRequests}`);
    console.log(`   Requests/sec: ${result.requestsPerSecond}`);
    
    console.log(`\n⏱️  Response Times:`);
    console.log(`   Average: ${result.averageResponseTime}ms`);
    console.log(`   Median: ${result.medianResponseTime}ms`);
    console.log(`   95th percentile: ${result.p95ResponseTime}ms`);
    console.log(`   99th percentile: ${result.p99ResponseTime}ms`);
    console.log(`   Min: ${result.minResponseTime}ms`);
    console.log(`   Max: ${result.maxResponseTime}ms`);
    
    console.log(`\n💾 Memory Usage:`);
    console.log(`   Initial: ${result.memoryUsage.initial}MB`);
    console.log(`   Peak: ${result.memoryUsage.peak}MB`);
    console.log(`   Final: ${result.memoryUsage.final}MB`);
    console.log(`   Memory leak: ${result.memoryUsage.leakDetected ? '⚠️  DETECTED' : '✅ None'}`);
    
    // Performance assessment
    const responseTimePass = result.averageResponseTime <= testCase.expectedResponseTime;
    const successRatePass = result.successRate >= testCase.expectedSuccessRate;
    
    console.log(`\n🎯 Performance Assessment:`);
    console.log(`   Response Time: ${responseTimePass ? '✅ PASS' : '❌ FAIL'} (${result.averageResponseTime}ms vs ${testCase.expectedResponseTime}ms expected)`);
    console.log(`   Success Rate: ${successRatePass ? '✅ PASS' : '❌ FAIL'} (${result.successRate}% vs ${testCase.expectedSuccessRate}% expected)`);
    
    if (Object.keys(result.errorTypes).length > 0) {
      console.log(`\n❌ Error Types:`);
      Object.entries(result.errorTypes).forEach(([type, count]) => {
        console.log(`   ${type}: ${count}`);
      });
    }
  }

  async runStressTest(): Promise<StressTestResults> {
    console.log('\n🔥 Starting Stress Test - Finding Breaking Point...\n');
    
    let currentConcurrency = 10;
    let breakingPoint = 0;
    let maxConcurrentUsers = 0;
    let degradationThreshold = 0;
    const maxConcurrency = 200;
    const testDuration = 30000; // 30 seconds per test
    
    while (currentConcurrency <= maxConcurrency) {
      console.log(`\n🧪 Testing with ${currentConcurrency} concurrent users...`);
      
      const startTime = Date.now();
      const results: any[] = [];
      const responseTimes: number[] = [];
      
      // Run stress test for specified duration
      while (Date.now() - startTime < testDuration) {
        const batchPromises: Promise<any>[] = [];
        
        for (let i = 0; i < currentConcurrency; i++) {
          const payload = { errorCode: this.getRandomErrorCode() };
          const requestStart = Date.now();
          
          const promise = handler(this.createMockEvent(payload), this.createMockContext())
            .then(result => {
              const responseTime = Date.now() - requestStart;
              responseTimes.push(responseTime);
              return { success: result.statusCode === 200, responseTime };
            })
            .catch(error => {
              const responseTime = Date.now() - requestStart;
              responseTimes.push(responseTime);
              return { success: false, responseTime };
            });
          
          batchPromises.push(promise);
        }
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // Small delay to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Analyze results
      const successRate = (results.filter(r => r.success).length / results.length) * 100;
      const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const p95ResponseTime = this.calculatePercentile(responseTimes, 95);
      
      console.log(`   Success Rate: ${successRate.toFixed(1)}%`);
      console.log(`   Average Response Time: ${averageResponseTime.toFixed(2)}ms`);
      console.log(`   95th Percentile: ${p95ResponseTime}ms`);
      
      // Determine if this is the breaking point
      const isBreakingPoint = successRate < 80 || averageResponseTime > 10000 || p95ResponseTime > 15000;
      
      if (isBreakingPoint && breakingPoint === 0) {
        breakingPoint = currentConcurrency;
        console.log(`   🔥 BREAKING POINT DETECTED at ${currentConcurrency} concurrent users`);
      }
      
      if (successRate >= 95 && averageResponseTime < 5000) {
        maxConcurrentUsers = currentConcurrency;
      }
      
      if (successRate < 95 && degradationThreshold === 0) {
        degradationThreshold = currentConcurrency;
      }
      
      if (breakingPoint > 0 && currentConcurrency > breakingPoint + 20) {
        break; // Stop testing after finding breaking point
      }
      
      currentConcurrency += 10;
    }
    
    // Test recovery time
    console.log('\n⚡ Testing Recovery Time...');
    const recoveryStart = Date.now();
    let recovered = false;
    
    while (Date.now() - recoveryStart < 60000 && !recovered) { // Max 60 seconds
      const testResult = await handler(this.createMockEvent({ errorCode: 6000 }), this.createMockContext());
      if (testResult.statusCode === 200) {
        recovered = true;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const recoveryTime = recovered ? Date.now() - recoveryStart : 60000;
    
    // Calculate stability score
    const stabilityScore = Math.max(0, 100 - (breakingPoint ? (200 - breakingPoint) / 2 : 0) - (recoveryTime / 1000));
    
    this.stressResults = {
      breakingPoint: breakingPoint || maxConcurrency,
      maxConcurrentUsers,
      degradationThreshold,
      recoveryTime,
      stabilityScore: Math.round(stabilityScore)
    };
    
    this.displayStressResults();
    return this.stressResults;
  }

  private displayStressResults(): void {
    if (!this.stressResults) return;
    
    console.log('\n' + '='.repeat(60));
    console.log('🔥 STRESS TEST RESULTS');
    console.log('='.repeat(60));
    
    console.log(`\n📈 Scalability Metrics:`);
    console.log(`   Breaking Point: ${this.stressResults.breakingPoint} concurrent users`);
    console.log(`   Max Stable Concurrency: ${this.stressResults.maxConcurrentUsers} users`);
    console.log(`   Degradation Threshold: ${this.stressResults.degradationThreshold} users`);
    console.log(`   Recovery Time: ${this.stressResults.recoveryTime}ms`);
    console.log(`   Stability Score: ${this.stressResults.stabilityScore}/100`);
    
    // Scalability assessment
    if (this.stressResults.maxConcurrentUsers >= 50) {
      console.log(`\n✅ SCALABILITY: EXCELLENT - Can handle high concurrent load`);
    } else if (this.stressResults.maxConcurrentUsers >= 25) {
      console.log(`\n🟡 SCALABILITY: GOOD - Can handle moderate concurrent load`);
    } else {
      console.log(`\n❌ SCALABILITY: POOR - Limited concurrent capacity`);
    }
  }

  async runComprehensivePerformanceTest(): Promise<void> {
    console.log('🚀 Starting Comprehensive Load and Performance Test Suite...\n');
    console.log('This will test the API under various load conditions and stress scenarios.\n');
    
    // Run all performance tests
    for (const testCase of this.performanceTests) {
      await this.runLoadTest(testCase);
      
      // Cool down period between tests
      console.log('   💤 Cooling down...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Run stress test
    await this.runStressTest();
    
    // Generate comprehensive report
    this.generateComprehensiveReport();
  }

  private generateComprehensiveReport(): void {
    console.log('\n' + '='.repeat(80));
    console.log('📊 COMPREHENSIVE PERFORMANCE AND LOAD TEST REPORT');
    console.log('='.repeat(80));
    
    // Overall statistics
    const totalRequests = this.results.reduce((sum, r) => sum + r.totalRequests, 0);
    const totalSuccessful = this.results.reduce((sum, r) => sum + r.successfulRequests, 0);
    const overallSuccessRate = (totalSuccessful / totalRequests) * 100;
    const avgResponseTime = this.results.reduce((sum, r) => sum + r.averageResponseTime, 0) / this.results.length;
    
    console.log(`\n📈 OVERALL STATISTICS:`);
    console.log(`   Total Requests Processed: ${totalRequests.toLocaleString()}`);
    console.log(`   Overall Success Rate: ${overallSuccessRate.toFixed(2)}%`);
    console.log(`   Average Response Time: ${avgResponseTime.toFixed(2)}ms`);
    
    // Performance summary by test
    console.log(`\n📋 TEST SUMMARY:`);
    this.results.forEach((result, index) => {
      const status = result.successRate >= 95 && result.averageResponseTime <= 5000 ? '✅' : '❌';
      console.log(`   ${status} ${result.testName}: ${result.successRate.toFixed(1)}% success, ${result.averageResponseTime.toFixed(0)}ms avg`);
    });
    
    // Memory analysis
    const memoryLeaks = this.results.filter(r => r.memoryUsage.leakDetected).length;
    console.log(`\n💾 MEMORY ANALYSIS:`);
    console.log(`   Memory Leaks Detected: ${memoryLeaks}/${this.results.length} tests`);
    console.log(`   Memory Management: ${memoryLeaks === 0 ? '✅ EXCELLENT' : '⚠️  NEEDS ATTENTION'}`);
    
    // Performance grade
    const performanceGrade = this.calculatePerformanceGrade();
    console.log(`\n🏆 OVERALL PERFORMANCE GRADE: ${performanceGrade}`);
    
    // Recommendations
    this.generateRecommendations();
    
    console.log('\n' + '='.repeat(80));
  }

  private calculatePerformanceGrade(): string {
    const passedTests = this.results.filter(r => r.successRate >= 95 && r.averageResponseTime <= 5000).length;
    const passRate = (passedTests / this.results.length) * 100;
    
    if (passRate >= 90) return 'A+ - EXCELLENT PERFORMANCE';
    if (passRate >= 80) return 'A - VERY GOOD PERFORMANCE';
    if (passRate >= 70) return 'B - GOOD PERFORMANCE';
    if (passRate >= 60) return 'C - ACCEPTABLE PERFORMANCE';
    return 'D - POOR PERFORMANCE';
  }

  private generateRecommendations(): void {
    console.log(`\n💡 PERFORMANCE RECOMMENDATIONS:`);
    
    const avgResponseTime = this.results.reduce((sum, r) => sum + r.averageResponseTime, 0) / this.results.length;
    const minSuccessRate = Math.min(...this.results.map(r => r.successRate));
    const memoryLeaks = this.results.filter(r => r.memoryUsage.leakDetected).length;
    
    if (avgResponseTime > 3000) {
      console.log('   🔧 Consider implementing additional caching layers');
      console.log('   🔧 Optimize AI service response times');
      console.log('   🔧 Consider using connection pooling for external services');
    }
    
    if (minSuccessRate < 95) {
      console.log('   🔧 Implement circuit breakers for external dependencies');
      console.log('   🔧 Add retry mechanisms with exponential backoff');
      console.log('   🔧 Improve error handling and fallback mechanisms');
    }
    
    if (memoryLeaks > 0) {
      console.log('   🔧 Review memory management in service implementations');
      console.log('   🔧 Add proper cleanup in finally blocks');
      console.log('   🔧 Monitor memory usage in production');
    }
    
    if (this.stressResults && this.stressResults.maxConcurrentUsers < 50) {
      console.log('   🔧 Consider horizontal scaling strategies');
      console.log('   🔧 Implement request queuing for high load periods');
      console.log('   🔧 Optimize Lambda cold start times');
    }
    
    if (this.stressResults && this.stressResults.recoveryTime > 10000) {
      console.log('   🔧 Implement health checks and auto-recovery mechanisms');
      console.log('   🔧 Add monitoring and alerting for performance degradation');
    }
  }
}

// Main execution
async function runComprehensiveLoadTests(): Promise<void> {
  const tester = new ComprehensiveLoadTester();
  
  try {
    await tester.runComprehensivePerformanceTest();
    
    console.log('\n🎯 FINAL PERFORMANCE ASSESSMENT:');
    console.log('   The comprehensive load testing has completed successfully.');
    console.log('   Review the detailed results above for performance optimization opportunities.');
    
  } catch (error) {
    console.error('💥 Load test suite failed:', error);
  }
}

// Export for use in other test files
export { ComprehensiveLoadTester, PerformanceTestCase, LoadTestResults };

// Run if called directly
if (require.main === module) {
  runComprehensiveLoadTests();
}