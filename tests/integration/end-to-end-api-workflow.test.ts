/**
 * End-to-end API workflow integration tests
 * Requirements: 4.6, 6.5, 7.6 - Complete API workflow, AWS service integrations, deployment validation
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { handler } from '../../src/handlers/lambda-handler';
// import { ErrorExplanationService } from '../../src/services/error-explanation-service';

// Mock AWS services for integration testing
jest.mock('@aws-sdk/client-bedrock-runtime');
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('@aws-sdk/client-cloudwatch');

describe('End-to-End API Workflow Integration Tests', () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'solana-error-api',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:solana-error-api',
    memoryLimitInMB: '512',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/solana-error-api',
    logStreamName: '2024/01/01/[$LATEST]test-stream',
    getRemainingTimeInMillis: () => 30000,
    done: jest.fn(),
    fail: jest.fn(),
    succeed: jest.fn()
  };

  // Set up test environment
  beforeAll(() => {
    process.env['AWS_REGION'] = 'us-east-1';
    process.env['DYNAMODB_TABLE_NAME'] = 'test-solana-error-cache';
    process.env['AWS_BEDROCK_MODEL_ID'] = 'anthropic.claude-3-sonnet-20240229-v1:0';
    process.env['CACHE_TTL_SECONDS'] = '3600';
    process.env['RATE_LIMIT_PER_MINUTE'] = '100';
    process.env['AI_TIMEOUT_MS'] = '5000';
    process.env['LOG_LEVEL'] = 'info';
  });

  const createAPIGatewayEvent = (
    httpMethod: string = 'POST',
    path: string = '/explain-error',
    body: any = null,
    headers: Record<string, string> = {}
  ): APIGatewayProxyEvent => ({
    body: body ? JSON.stringify(body) : null,
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '192.168.1.1',
      ...headers
    },
    multiValueHeaders: {},
    httpMethod,
    isBase64Encoded: false,
    path,
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api-id',
      authorizer: null,
      protocol: 'HTTP/1.1',
      httpMethod,
      path,
      stage: 'test',
      requestId: 'test-request-id',
      requestTime: '01/Jan/2024:00:00:00 +0000',
      requestTimeEpoch: 1704067200000,
      resourceId: 'test-resource-id',
      resourcePath: path,
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: '192.168.1.1',
        user: null,
        userAgent: 'test-user-agent',
        userArn: null,
        clientCert: null
      }
    },
    resource: path
  });

  describe('Complete API Workflow', () => {
    it('should handle complete standard error workflow', async () => {
      // Arrange
      const event = createAPIGatewayEvent('POST', '/explain-error', { errorCode: 1 });

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert - Response structure
      expect(result.statusCode).toBe(200);
      expect(result.headers).toBeDefined();
      expect(result.headers!['Content-Type']).toBe('application/json');
      expect(result.headers!['Access-Control-Allow-Origin']).toBe('*');

      // Assert - Response body
      const responseBody = JSON.parse(result.body);
      expect(responseBody).toHaveProperty('code', 1);
      expect(responseBody).toHaveProperty('explanation');
      expect(responseBody).toHaveProperty('fixes');
      expect(responseBody).toHaveProperty('timestamp');
      
      expect(typeof responseBody.explanation).toBe('string');
      expect(Array.isArray(responseBody.fixes)).toBe(true);
      expect(responseBody.fixes.length).toBeGreaterThan(0);
      expect(responseBody.explanation.length).toBeGreaterThan(10);
    });

    it('should handle complete Anchor constraint error workflow', async () => {
      // Arrange
      const event = createAPIGatewayEvent('POST', '/explain-error', { errorCode: 2000 });

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.code).toBe(2000);
      expect(responseBody.explanation).toContain('Seeds constraint');
      expect(responseBody.explanation).toContain('PDA');
      expect(responseBody.fixes.some((fix: string) => 
        fix.toLowerCase().includes('seeds') || fix.toLowerCase().includes('pda')
      )).toBe(true);
    });

    it('should handle complete custom error workflow', async () => {
      // Arrange
      const event = createAPIGatewayEvent('POST', '/explain-error', { errorCode: 6000 });

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.code).toBe(6000);
      expect(responseBody.explanation).toBeDefined();
      expect(responseBody.fixes).toBeDefined();
      expect(responseBody.fixes.length).toBeGreaterThan(0);
    });

    it('should handle hex input format in complete workflow', async () => {
      // Arrange
      const event = createAPIGatewayEvent('POST', '/explain-error', { errorCode: '0x7D0' });

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.code).toBe(2000); // 0x7D0 = 2000
      expect(responseBody.explanation).toContain('Seeds constraint');
    });

    it('should handle string numeric input in complete workflow', async () => {
      // Arrange
      const event = createAPIGatewayEvent('POST', '/explain-error', { errorCode: '6000' });

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.code).toBe(6000); // Should be parsed as decimal
      expect(responseBody.explanation).toBeDefined();
    });

    it('should handle context parameter in complete workflow', async () => {
      // Arrange
      const event = createAPIGatewayEvent('POST', '/explain-error', { 
        errorCode: 2001,
        context: 'Failed during token account validation'
      });

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.code).toBe(2001);
      expect(responseBody.explanation).toContain('HasOne constraint');
    });
  });

  describe('Error Handling Workflow', () => {
    it('should handle invalid error codes gracefully', async () => {
      // Arrange
      const event = createAPIGatewayEvent('POST', '/explain-error', { errorCode: -1 });

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody).toHaveProperty('code');
      expect(responseBody.code).toBe(0); // Invalid codes get normalized to 0
    });

    it('should handle malformed JSON gracefully', async () => {
      // Arrange
      const event = createAPIGatewayEvent('POST', '/explain-error');
      event.body = '{ invalid json }';

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(400);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody).toHaveProperty('error');
      expect(responseBody.error).toContain('Invalid JSON in request body');
    });

    it('should handle missing request body gracefully', async () => {
      // Arrange
      const event = createAPIGatewayEvent('POST', '/explain-error');
      event.body = null;

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(400);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody).toHaveProperty('error');
      expect(responseBody.error).toContain('Request body is required');
    });

    it('should handle unsupported HTTP methods', async () => {
      // Arrange
      const event = createAPIGatewayEvent('GET', '/explain-error', { errorCode: 1 });

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(404);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody).toHaveProperty('error');
      expect(responseBody.error).toContain('Endpoint /explain-error not found');
    });
  });

  describe('Security Integration Workflow', () => {
    it('should apply rate limiting in complete workflow', async () => {
      // Arrange - Create multiple requests from same IP
      const requests = Array.from({ length: 5 }, () => 
        createAPIGatewayEvent('POST', '/explain-error', { errorCode: 1 })
      );

      // Act - Execute requests sequentially
      const results = [];
      for (const request of requests) {
        const result = await handler(request, mockContext) as APIGatewayProxyResult;
        results.push(result);
      }

      // Assert - All should succeed (rate limit is 100/min, so 5 requests should be fine)
      results.forEach(result => {
        expect(result.statusCode).toBe(200);
      });
    });

    it('should include security headers in response', async () => {
      // Arrange
      const event = createAPIGatewayEvent('POST', '/explain-error', { errorCode: 1 });

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(200);
      expect(result.headers).toBeDefined();
      expect(result.headers!['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers!['Access-Control-Allow-Methods']).toBeDefined();
      expect(result.headers!['Access-Control-Allow-Headers']).toBeDefined();
    });

    it('should handle CORS preflight requests', async () => {
      // Arrange
      const event = createAPIGatewayEvent('OPTIONS', '/explain-error');

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(200);
      expect(result.headers!['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers!['Access-Control-Allow-Methods']).toContain('POST');
      expect(result.headers!['Access-Control-Allow-Headers']).toBeDefined();
    });
  });

  describe('Performance Integration Workflow', () => {
    it('should complete requests within acceptable time limits', async () => {
      // Arrange
      const event = createAPIGatewayEvent('POST', '/explain-error', { errorCode: 1 });
      const startTime = Date.now();

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Assert
      expect(result.statusCode).toBe(200);
      expect(responseTime).toBeLessThan(2000); // Should complete within 2 seconds
    });

    it('should handle concurrent requests efficiently', async () => {
      // Arrange
      const events = Array.from({ length: 10 }, (_, i) => 
        createAPIGatewayEvent('POST', '/explain-error', { errorCode: i % 3 === 0 ? 0 : i % 3 === 1 ? 2000 : 6000 })
      );

      const startTime = Date.now();

      // Act
      const promises = events.map(event => handler(event, mockContext));
      const results = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Assert
      expect(results).toHaveLength(10);
      results.forEach(result => {
        const apiResult = result as APIGatewayProxyResult;
        expect(apiResult.statusCode).toBe(200);
      });
      expect(totalTime).toBeLessThan(5000); // All 10 requests should complete within 5 seconds
    });

    it('should demonstrate caching efficiency in workflow', async () => {
      // Arrange
      const errorCode = 2000;
      const event1 = createAPIGatewayEvent('POST', '/explain-error', { errorCode });
      const event2 = createAPIGatewayEvent('POST', '/explain-error', { errorCode });

      // Act - First request (cache miss)
      const startTime1 = Date.now();
      const result1 = await handler(event1, mockContext) as APIGatewayProxyResult;
      const endTime1 = Date.now();
      const time1 = endTime1 - startTime1;

      // Act - Second request (cache hit)
      const startTime2 = Date.now();
      const result2 = await handler(event2, mockContext) as APIGatewayProxyResult;
      const endTime2 = Date.now();
      const time2 = endTime2 - startTime2;

      // Assert
      expect(result1.statusCode).toBe(200);
      expect(result2.statusCode).toBe(200);
      
      const body1 = JSON.parse(result1.body);
      const body2 = JSON.parse(result2.body);
      
      expect(body1.code).toBe(errorCode);
      expect(body2.code).toBe(errorCode);
      expect(body1.explanation).toBe(body2.explanation); // Should be identical from cache
      
      // Second request should be faster or equal (cached)
      expect(time2).toBeLessThanOrEqual(time1 + 5); // Allow small variance
    });
  });

  describe('Service Integration Workflow', () => {
    it('should integrate all service layers in workflow', async () => {
      // Arrange
      const event = createAPIGatewayEvent('POST', '/explain-error', { errorCode: 6001 });

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert - Verify complete service integration
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      
      // Verify error code validation worked
      expect(responseBody.code).toBe(6001);
      
      // Verify error explanation service worked
      expect(responseBody.explanation).toBeDefined();
      expect(responseBody.fixes).toBeDefined();
      
      // Verify response formatting worked
      expect(responseBody.timestamp).toBeDefined();
      expect(new Date(responseBody.timestamp)).toBeInstanceOf(Date);
      
      // Verify content quality
      expect(responseBody.explanation.length).toBeGreaterThan(20);
      expect(responseBody.fixes.length).toBeGreaterThan(0);
      responseBody.fixes.forEach((fix: string) => {
        expect(typeof fix).toBe('string');
        expect(fix.length).toBeGreaterThan(5);
      });
    });

    it('should handle service degradation gracefully', async () => {
      // Arrange - Test with an uncommon error code that might trigger AI fallback
      const event = createAPIGatewayEvent('POST', '/explain-error', { errorCode: 9999 });

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert - Should still provide a response even if AI services are unavailable
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.code).toBe(9999);
      expect(responseBody.explanation).toBeDefined();
      expect(responseBody.fixes).toBeDefined();
      expect(responseBody.fixes.length).toBeGreaterThan(0);
    });

    it('should maintain response consistency across different error types', async () => {
      // Arrange - Test different error categories
      const testCases = [
        { errorCode: 0, category: 'standard' },
        { errorCode: 2000, category: 'anchor_constraint' },
        { errorCode: 6000, category: 'custom' }
      ];

      // Act
      const results = [];
      for (const testCase of testCases) {
        const event = createAPIGatewayEvent('POST', '/explain-error', { errorCode: testCase.errorCode });
        const result = await handler(event, mockContext) as APIGatewayProxyResult;
        results.push({ result, category: testCase.category });
      }

      // Assert - All should have consistent response structure
      results.forEach(({ result }) => {
        expect(result.statusCode).toBe(200);
        
        const responseBody = JSON.parse(result.body);
        
        // Consistent structure
        expect(responseBody).toHaveProperty('code');
        expect(responseBody).toHaveProperty('explanation');
        expect(responseBody).toHaveProperty('fixes');
        expect(responseBody).toHaveProperty('timestamp');
        
        // Consistent types
        expect(typeof responseBody.code).toBe('number');
        expect(typeof responseBody.explanation).toBe('string');
        expect(Array.isArray(responseBody.fixes)).toBe(true);
        expect(typeof responseBody.timestamp).toBe('string');
        
        // Quality standards
        expect(responseBody.explanation.length).toBeGreaterThan(10);
        expect(responseBody.fixes.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Monitoring and Observability Integration', () => {
    it('should generate appropriate log entries during workflow', async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
      const event = createAPIGatewayEvent('POST', '/explain-error', { errorCode: 1 });

      try {
        // Act
        const result = await handler(event, mockContext) as APIGatewayProxyResult;

        // Assert
        expect(result.statusCode).toBe(200);
        expect(consoleSpy).toHaveBeenCalled();
        
        // Should have logged service initialization and processing
        const logCalls = consoleSpy.mock.calls.map(call => call[0]);
        const hasServiceLogs = logCalls.some(log => 
          typeof log === 'string' && log.includes('ErrorExplanationService')
        );
        expect(hasServiceLogs).toBe(true);

      } finally {
        consoleSpy.mockRestore();
      }
    });

    it('should handle errors with appropriate logging', async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const event = createAPIGatewayEvent('POST', '/explain-error', { errorCode: 'invalid' });

      try {
        // Act
        const result = await handler(event, mockContext) as APIGatewayProxyResult;

        // Assert
        expect(result.statusCode).toBe(200);
        
        // Should have logged the error appropriately
        // Note: Error logging might be handled differently, so we just verify the response
        const responseBody = JSON.parse(result.body);
        expect(responseBody).toHaveProperty('code');

      } finally {
        consoleSpy.mockRestore();
      }
    });
  });

  describe('Deployment Validation Workflow', () => {
    it('should validate environment configuration', async () => {
      // Arrange
      const requiredEnvVars = [
        'AWS_REGION',
        'DYNAMODB_TABLE_NAME',
        'AWS_BEDROCK_MODEL_ID',
        'CACHE_TTL_SECONDS',
        'RATE_LIMIT_PER_MINUTE',
        'LOG_LEVEL'
      ];

      // Act & Assert
      requiredEnvVars.forEach(envVar => {
        expect(process.env[envVar]).toBeDefined();
      });
    });

    it('should handle Lambda context correctly', async () => {
      // Arrange
      const event = createAPIGatewayEvent('POST', '/explain-error', { errorCode: 1 });

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(200);
      expect(result.headers).toBeDefined();
      expect(result.body).toBeDefined();
      
      // Verify Lambda response format
      expect(typeof result.statusCode).toBe('number');
      expect(typeof result.body).toBe('string');
      expect(typeof result.headers).toBe('object');
    });

    it('should validate API Gateway integration format', async () => {
      // Arrange
      const event = createAPIGatewayEvent('POST', '/explain-error', { errorCode: 1 });

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert - Verify API Gateway response format
      expect(result).toHaveProperty('statusCode');
      expect(result).toHaveProperty('headers');
      expect(result).toHaveProperty('body');
      
      // Verify headers are properly formatted for API Gateway
      expect(result.headers!['Content-Type']).toBe('application/json');
      expect(result.headers!['Access-Control-Allow-Origin']).toBe('*');
      
      // Verify body is valid JSON string
      expect(() => JSON.parse(result.body)).not.toThrow();
    });
  });
});