/**
 * Comprehensive Security Penetration Test Suite for Solana Debug API
 * Tests all major attack vectors and security vulnerabilities
 */

import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler } from '../src/handlers/lambda-handler';

interface SecurityTestCase {
  name: string;
  category: 'XSS' | 'SQL_INJECTION' | 'COMMAND_INJECTION' | 'PATH_TRAVERSAL' | 'DOS' | 'BUFFER_OVERFLOW' | 'CSRF' | 'HEADER_INJECTION';
  payload: any;
  expectedResult: 'BLOCKED' | 'ALLOWED';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
}

interface SecurityTestResults {
  totalTests: number;
  passed: number;
  failed: number;
  criticalFailures: number;
  vulnerabilities: SecurityTestCase[];
  performanceMetrics: {
    averageResponseTime: number;
    maxResponseTime: number;
    minResponseTime: number;
  };
}

class ComprehensiveSecurityTester {
  private results: SecurityTestResults = {
    totalTests: 0,
    passed: 0,
    failed: 0,
    criticalFailures: 0,
    vulnerabilities: [],
    performanceMetrics: {
      averageResponseTime: 0,
      maxResponseTime: 0,
      minResponseTime: Infinity
    }
  };

  private responseTimes: number[] = [];

  // Comprehensive attack payloads
  private securityTestCases: SecurityTestCase[] = [
    // XSS Attacks
    {
      name: 'XSS Script Tag Injection',
      category: 'XSS',
      payload: { errorCode: '<script>alert("XSS")</script>' },
      expectedResult: 'BLOCKED',
      severity: 'HIGH',
      description: 'Basic script tag injection attempt'
    },
    {
      name: 'XSS Event Handler Injection',
      category: 'XSS',
      payload: { errorCode: '<img src="x" onerror="alert(document.cookie)">' },
      expectedResult: 'BLOCKED',
      severity: 'HIGH',
      description: 'Event handler XSS attempt'
    },
    {
      name: 'XSS JavaScript Protocol',
      category: 'XSS',
      payload: { errorCode: 'javascript:alert("XSS")' },
      expectedResult: 'BLOCKED',
      severity: 'HIGH',
      description: 'JavaScript protocol injection'
    },
    {
      name: 'XSS SVG Injection',
      category: 'XSS',
      payload: { errorCode: '<svg onload="alert(1)">test</svg>' },
      expectedResult: 'BLOCKED',
      severity: 'HIGH',
      description: 'SVG-based XSS attack'
    },
    {
      name: 'XSS Data URI',
      category: 'XSS',
      payload: { errorCode: 'data:text/html,<script>alert("XSS")</script>' },
      expectedResult: 'BLOCKED',
      severity: 'HIGH',
      description: 'Data URI XSS attack'
    },

    // SQL Injection Attacks
    {
      name: 'SQL Union Injection',
      category: 'SQL_INJECTION',
      payload: { errorCode: "1' UNION SELECT * FROM users--" },
      expectedResult: 'BLOCKED',
      severity: 'CRITICAL',
      description: 'SQL UNION injection attempt'
    },
    {
      name: 'SQL Boolean Injection',
      category: 'SQL_INJECTION',
      payload: { errorCode: "1' OR '1'='1'--" },
      expectedResult: 'BLOCKED',
      severity: 'CRITICAL',
      description: 'Boolean-based SQL injection'
    },
    {
      name: 'SQL Time-based Injection',
      category: 'SQL_INJECTION',
      payload: { errorCode: "1'; WAITFOR DELAY '00:00:05'--" },
      expectedResult: 'BLOCKED',
      severity: 'CRITICAL',
      description: 'Time-based blind SQL injection'
    },
    {
      name: 'SQL Stacked Queries',
      category: 'SQL_INJECTION',
      payload: { errorCode: "1; DROP TABLE users; --" },
      expectedResult: 'BLOCKED',
      severity: 'CRITICAL',
      description: 'Stacked SQL queries attack'
    },

    // Command Injection Attacks
    {
      name: 'Command Injection Semicolon',
      category: 'COMMAND_INJECTION',
      payload: { errorCode: 'test; rm -rf /' },
      expectedResult: 'BLOCKED',
      severity: 'CRITICAL',
      description: 'Command injection using semicolon'
    },
    {
      name: 'Command Injection Pipe',
      category: 'COMMAND_INJECTION',
      payload: { errorCode: 'test | cat /etc/passwd' },
      expectedResult: 'BLOCKED',
      severity: 'CRITICAL',
      description: 'Command injection using pipe'
    },
    {
      name: 'Command Injection Backticks',
      category: 'COMMAND_INJECTION',
      payload: { errorCode: 'test `whoami`' },
      expectedResult: 'BLOCKED',
      severity: 'CRITICAL',
      description: 'Command injection using backticks'
    },
    {
      name: 'Command Injection Subshell',
      category: 'COMMAND_INJECTION',
      payload: { errorCode: 'test $(id)' },
      expectedResult: 'BLOCKED',
      severity: 'CRITICAL',
      description: 'Command injection using subshell'
    },

    // Path Traversal Attacks
    {
      name: 'Path Traversal Unix',
      category: 'PATH_TRAVERSAL',
      payload: { errorCode: '../../../etc/passwd' },
      expectedResult: 'BLOCKED',
      severity: 'HIGH',
      description: 'Unix path traversal attack'
    },
    {
      name: 'Path Traversal Windows',
      category: 'PATH_TRAVERSAL',
      payload: { errorCode: '..\\..\\..\\windows\\system32\\config\\sam' },
      expectedResult: 'BLOCKED',
      severity: 'HIGH',
      description: 'Windows path traversal attack'
    },
    {
      name: 'Path Traversal Encoded',
      category: 'PATH_TRAVERSAL',
      payload: { errorCode: '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd' },
      expectedResult: 'BLOCKED',
      severity: 'HIGH',
      description: 'URL-encoded path traversal'
    },

    // DoS Attacks
    {
      name: 'Large Payload DoS',
      category: 'DOS',
      payload: { errorCode: 'A'.repeat(1000000) },
      expectedResult: 'BLOCKED',
      severity: 'MEDIUM',
      description: 'Large payload DoS attack'
    },
    {
      name: 'Deep Nested JSON DoS',
      category: 'DOS',
      payload: JSON.parse('{"a":'.repeat(1000) + '{}' + '}'.repeat(1000)),
      expectedResult: 'BLOCKED',
      severity: 'MEDIUM',
      description: 'Deeply nested JSON DoS'
    },

    // Buffer Overflow Attempts
    {
      name: 'Buffer Overflow Attempt',
      category: 'BUFFER_OVERFLOW',
      payload: { errorCode: 'A'.repeat(65536) },
      expectedResult: 'BLOCKED',
      severity: 'HIGH',
      description: 'Buffer overflow attempt'
    },

    // Header Injection Attacks
    {
      name: 'CRLF Injection',
      category: 'HEADER_INJECTION',
      payload: { errorCode: "test\r\nSet-Cookie: malicious=true" },
      expectedResult: 'BLOCKED',
      severity: 'MEDIUM',
      description: 'CRLF header injection'
    },

    // Edge Cases and Bypass Attempts
    {
      name: 'Null Byte Injection',
      category: 'PATH_TRAVERSAL',
      payload: { errorCode: '../../../etc/passwd\x00.jpg' },
      expectedResult: 'BLOCKED',
      severity: 'HIGH',
      description: 'Null byte injection bypass'
    },
    {
      name: 'Unicode Bypass Attempt',
      category: 'XSS',
      payload: { errorCode: '\u003cscript\u003ealert(1)\u003c/script\u003e' },
      expectedResult: 'BLOCKED',
      severity: 'HIGH',
      description: 'Unicode encoding bypass'
    }
  ];

  private createMockEvent(payload: any): APIGatewayProxyEvent {
    return {
      httpMethod: 'POST',
      path: '/explain-error',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SecurityTester/1.0',
        'X-Forwarded-For': '192.168.1.100'
      },
      multiValueHeaders: {},
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      pathParameters: null,
      stageVariables: null,
      requestContext: {
        requestId: 'test-request-' + Date.now(),
        stage: 'test',
        httpMethod: 'POST',
        path: '/explain-error',
        protocol: 'HTTPS',
        requestTime: new Date().toISOString(),
        requestTimeEpoch: Date.now(),
        identity: {
          sourceIp: '192.168.1.100',
          userAgent: 'SecurityTester/1.0'
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
      functionName: 'solana-error-api-test',
      functionVersion: '1',
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test',
      memoryLimitInMB: '512',
      awsRequestId: 'test-request-' + Date.now(),
      logGroupName: '/aws/lambda/test',
      logStreamName: 'test-stream',
      getRemainingTimeInMillis: () => 30000,
      done: () => {},
      fail: () => {},
      succeed: () => {}
    };
  }

  async runSecurityTest(testCase: SecurityTestCase): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      const event = this.createMockEvent(testCase.payload);
      const context = this.createMockContext();
      
      const result = await handler(event, context);
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      this.responseTimes.push(responseTime);
      this.updatePerformanceMetrics(responseTime);

      // Check if the request was properly blocked
      const isBlocked = result.statusCode === 400 || result.statusCode === 403 || result.statusCode === 429;
      const testPassed = (testCase.expectedResult === 'BLOCKED' && isBlocked) || 
                        (testCase.expectedResult === 'ALLOWED' && !isBlocked);

      if (!testPassed) {
        this.results.vulnerabilities.push(testCase);
        if (testCase.severity === 'CRITICAL') {
          this.results.criticalFailures++;
        }
        this.results.failed++;
        
        console.error(`❌ SECURITY VULNERABILITY DETECTED: ${testCase.name}`);
        console.error(`   Category: ${testCase.category}`);
        console.error(`   Severity: ${testCase.severity}`);
        console.error(`   Expected: ${testCase.expectedResult}, Got: ${isBlocked ? 'BLOCKED' : 'ALLOWED'}`);
        console.error(`   Response: ${result.statusCode} - ${JSON.stringify(JSON.parse(result.body))}`);
        
        return false;
      } else {
        this.results.passed++;
        console.log(`✅ ${testCase.name} - PASSED (${responseTime}ms)`);
        return true;
      }
    } catch (error) {
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      this.responseTimes.push(responseTime);
      
      console.error(`💥 ERROR in test ${testCase.name}:`, error);
      this.results.failed++;
      return false;
    }
  }

  private updatePerformanceMetrics(responseTime: number): void {
    this.results.performanceMetrics.maxResponseTime = Math.max(
      this.results.performanceMetrics.maxResponseTime, 
      responseTime
    );
    this.results.performanceMetrics.minResponseTime = Math.min(
      this.results.performanceMetrics.minResponseTime, 
      responseTime
    );
    this.results.performanceMetrics.averageResponseTime = 
      this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
  }

  async runComprehensiveSecuritySuite(): Promise<SecurityTestResults> {
    console.log('🔒 Starting Comprehensive Security Penetration Test Suite...\n');
    
    this.results.totalTests = this.securityTestCases.length;
    
    // Run tests in parallel batches to simulate real attack scenarios
    const batchSize = 5;
    for (let i = 0; i < this.securityTestCases.length; i += batchSize) {
      const batch = this.securityTestCases.slice(i, i + batchSize);
      console.log(`\n📦 Running batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(this.securityTestCases.length/batchSize)}...`);
      
      await Promise.all(batch.map(testCase => this.runSecurityTest(testCase)));
      
      // Small delay between batches to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.generateSecurityReport();
    return this.results;
  }

  private generateSecurityReport(): void {
    console.log('\n' + '='.repeat(80));
    console.log('📊 COMPREHENSIVE SECURITY PENETRATION TEST REPORT');
    console.log('='.repeat(80));
    
    console.log(`\n📈 TEST SUMMARY:`);
    console.log(`   Total Tests: ${this.results.totalTests}`);
    console.log(`   Passed: ${this.results.passed} (${((this.results.passed/this.results.totalTests)*100).toFixed(1)}%)`);
    console.log(`   Failed: ${this.results.failed} (${((this.results.failed/this.results.totalTests)*100).toFixed(1)}%)`);
    console.log(`   Critical Failures: ${this.results.criticalFailures}`);
    
    console.log(`\n⚡ PERFORMANCE METRICS:`);
    console.log(`   Average Response Time: ${this.results.performanceMetrics.averageResponseTime.toFixed(2)}ms`);
    console.log(`   Max Response Time: ${this.results.performanceMetrics.maxResponseTime}ms`);
    console.log(`   Min Response Time: ${this.results.performanceMetrics.minResponseTime}ms`);
    
    if (this.results.vulnerabilities.length > 0) {
      console.log(`\n🚨 SECURITY VULNERABILITIES DETECTED:`);
      this.results.vulnerabilities.forEach((vuln, index) => {
        console.log(`   ${index + 1}. ${vuln.name} (${vuln.severity})`);
        console.log(`      Category: ${vuln.category}`);
        console.log(`      Description: ${vuln.description}`);
      });
    } else {
      console.log(`\n✅ NO SECURITY VULNERABILITIES DETECTED`);
    }
    
    // Security grade calculation
    const securityGrade = this.calculateSecurityGrade();
    console.log(`\n🏆 OVERALL SECURITY GRADE: ${securityGrade}`);
    
    console.log('\n' + '='.repeat(80));
  }

  private calculateSecurityGrade(): string {
    if (this.results.criticalFailures > 0) return 'F - CRITICAL VULNERABILITIES';
    if (this.results.failed === 0) return 'A+ - EXCELLENT SECURITY';
    if (this.results.failed <= 2) return 'A - VERY GOOD SECURITY';
    if (this.results.failed <= 5) return 'B - GOOD SECURITY';
    if (this.results.failed <= 10) return 'C - ACCEPTABLE SECURITY';
    return 'D - POOR SECURITY';
  }

  // Additional specialized tests
  async runRateLimitingTest(): Promise<void> {
    console.log('\n🚦 Testing Rate Limiting...');
    
    const event = this.createMockEvent({ errorCode: 6000 });
    const context = this.createMockContext();
    
    // Send 150 requests rapidly (should trigger rate limiting at 100/min)
    const promises = Array.from({ length: 150 }, (_, i) => 
      handler({ ...event, requestContext: { ...event.requestContext, requestId: `rate-test-${i}` } }, context)
    );
    
    const results = await Promise.all(promises);
    const rateLimitedRequests = results.filter(r => r.statusCode === 429).length;
    
    console.log(`   Rate limited requests: ${rateLimitedRequests}/150`);
    console.log(`   Rate limiting ${rateLimitedRequests >= 50 ? '✅ WORKING' : '❌ NOT WORKING'}`);
  }

  async runConcurrencyTest(): Promise<void> {
    console.log('\n⚡ Testing Concurrency Handling...');
    
    const event = this.createMockEvent({ errorCode: 6000 });
    const context = this.createMockContext();
    
    // Test with high concurrency
    const concurrentRequests = 50;
    const startTime = Date.now();
    
    const promises = Array.from({ length: concurrentRequests }, (_, i) => 
      handler({ ...event, requestContext: { ...event.requestContext, requestId: `concurrent-test-${i}` } }, context)
    );
    
    const results = await Promise.all(promises);
    const endTime = Date.now();
    
    const successfulRequests = results.filter(r => r.statusCode === 200).length;
    const totalTime = endTime - startTime;
    
    console.log(`   Concurrent requests: ${concurrentRequests}`);
    console.log(`   Successful: ${successfulRequests}`);
    console.log(`   Total time: ${totalTime}ms`);
    console.log(`   Average time per request: ${(totalTime/concurrentRequests).toFixed(2)}ms`);
    console.log(`   Concurrency handling ${successfulRequests >= concurrentRequests * 0.8 ? '✅ GOOD' : '❌ POOR'}`);
  }
}

// Main execution
async function runComprehensiveSecurityTests(): Promise<void> {
  const tester = new ComprehensiveSecurityTester();
  
  try {
    // Run main security test suite
    const results = await tester.runComprehensiveSecuritySuite();
    
    // Run additional specialized tests
    await tester.runRateLimitingTest();
    await tester.runConcurrencyTest();
    
    // Final assessment
    console.log('\n🎯 FINAL SECURITY ASSESSMENT:');
    
    if (results.criticalFailures === 0 && results.failed <= 2) {
      console.log('✅ API SECURITY STATUS: PRODUCTION READY');
      console.log('   The API demonstrates robust security measures against common attack vectors.');
    } else if (results.criticalFailures === 0) {
      console.log('⚠️  API SECURITY STATUS: NEEDS MINOR IMPROVEMENTS');
      console.log('   The API has good security but some edge cases need attention.');
    } else {
      console.log('❌ API SECURITY STATUS: CRITICAL VULNERABILITIES DETECTED');
      console.log('   The API has critical security issues that must be addressed before production.');
    }
    
  } catch (error) {
    console.error('💥 Security test suite failed:', error);
  }
}

// Export for use in other test files
export { ComprehensiveSecurityTester, SecurityTestCase, SecurityTestResults };

// Run if called directly
if (require.main === module) {
  runComprehensiveSecurityTests();
}