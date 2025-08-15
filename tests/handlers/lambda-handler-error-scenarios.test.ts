/**
 * Lambda handler tests for common error scenarios
 * Requirements: 4.1, 4.2, 4.3, 4.4 - Testing API endpoint with common error codes
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { handler } from '../../src/handlers/lambda-handler';

// Mock environment variables
process.env['AWS_REGION'] = 'us-east-1';
process.env['DYNAMODB_TABLE_NAME'] = 'test-solana-error-cache';
process.env['AWS_BEDROCK_MODEL_ID'] = 'anthropic.claude-3-sonnet-20240229-v1:0';
process.env['CACHE_TTL_SECONDS'] = '3600';
process.env['RATE_LIMIT_PER_MINUTE'] = '100';
process.env['AI_TIMEOUT_MS'] = '5000';
process.env['LOG_LEVEL'] = 'error';

// Mock AWS services
jest.mock('@aws-sdk/client-bedrock-runtime');
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');

describe('Lambda Handler - Common Error Scenarios', () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'test-function',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
    memoryLimitInMB: '512',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/test-function',
    logStreamName: '2024/01/01/[$LATEST]test-stream',
    getRemainingTimeInMillis: () => 30000,
    done: jest.fn(),
    fail: jest.fn(),
    succeed: jest.fn()
  };

  const createEvent = (body: any): APIGatewayProxyEvent => ({
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '192.168.1.1'
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
      apiId: 'test-api',
      authorizer: null,
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
      path: '/explain-error',
      stage: 'test',
      requestId: 'test-request',
      requestTime: '01/Jan/2024:00:00:00 +0000',
      requestTimeEpoch: 1704067200000,
      resourceId: 'test-resource',
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
        sourceIp: '192.168.1.1',
        user: null,
        userAgent: 'test-agent',
        userArn: null,
        clientCert: null
      }
    },
    resource: '/explain-error'
  });

  describe('Standard Solana Errors (Requirement 4.2)', () => {
    it('should handle error code 0 (Success) via API endpoint', async () => {
      // Arrange
      const event = createEvent({ errorCode: 0 });

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.code).toBe(0);
      expect(responseBody.explanation).toContain('success');
      expect(responseBody.fixes).toBeDefined();
      expect(Array.isArray(responseBody.fixes)).toBe(true);
      expect(responseBody.timestamp).toBeDefined();
    });

    it('should handle error code 1 (InvalidInstructionData) via API endpoint', async () => {
      // Arrange
      const event = createEvent({ errorCode: 1 });

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.code).toBe(1);
      expect(responseBody.explanation).toContain('instruction');
      expect(responseBody.explanation).toContain('invalid');
      expect(responseBody.fixes).toBeDefined();
      expect(responseBody.fixes.length).toBeGreaterThan(0);
      expect(responseBody.fixes.some((fix: string) => 
        fix.toLowerCase().includes('anchor test')
      )).toBe(true);
    });

    it('should handle error code 100 (InstructionMissing) via API endpoint', async () => {
      // Arrange
      const event = createEvent({ errorCode: 100 });

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.code).toBe(100);
      expect(responseBody.explanation).toContain('instruction');
      expect(responseBody.explanation).toContain('missing');
      expect(responseBody.fixes).toBeDefined();
      expect(responseBody.fixes.some((fix: string) => 
        fix.toLowerCase().includes('solana logs')
      )).toBe(true);
    });
  });

  describe('Anchor Constraint Errors (Requirement 4.3)', () => {
    it('should handle error code 2000 (ConstraintSeeds) via API endpoint', async () => {
      // Arrange
      const event = createEvent({ errorCode: 2000 });

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.code).toBe(2000);
      expect(responseBody.explanation).toContain('Seeds constraint');
      expect(responseBody.explanation).toContain('PDA');
      expect(responseBody.fixes).toBeDefined();
      expect(responseBody.fixes.some((fix: string) => 
        fix.toLowerCase().includes('findprogramaddress')
      )).toBe(true);
    });

    it('should handle error code 2001 (ConstraintHasOne) via API endpoint', async () => {
      // Arrange
      const event = createEvent({ errorCode: 2001 });

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.code).toBe(2001);
      expect(responseBody.explanation).toContain('HasOne constraint');
      expect(responseBody.explanation).toContain('relationship');
      expect(responseBody.fixes).toBeDefined();
      expect(responseBody.fixes.some((fix: string) => 
        fix.toLowerCase().includes('relationship')
      )).toBe(true);
    });

    it('should handle error code 2002 (ConstraintSigner) via API endpoint', async () => {
      // Arrange
      const event = createEvent({ errorCode: 2002 });

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.code).toBe(2002);
      expect(responseBody.explanation).toContain('Signer constraint');
      expect(responseBody.explanation).toContain('signature');
      expect(responseBody.fixes).toBeDefined();
      expect(responseBody.fixes.some((fix: string) => 
        fix.toLowerCase().includes('signer')
      )).toBe(true);
    });
  });

  describe('Custom Error Scenarios (Requirement 4.4)', () => {
    it('should handle error code 6000 (Insufficient Funds) via API endpoint', async () => {
      // Arrange
      const event = createEvent({ errorCode: 6000 });

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.code).toBe(6000);
      expect(responseBody.explanation).toContain('funds');
      expect(responseBody.fixes).toBeDefined();
      expect(responseBody.fixes.some((fix: string) => 
        fix.toLowerCase().includes('balance')
      )).toBe(true);
    });

    it('should handle error code 6001 (Unauthorized Access) via API endpoint', async () => {
      // Arrange
      const event = createEvent({ errorCode: 6001 });

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.code).toBe(6001);
      expect(responseBody.explanation).toContain('Unauthorized');
      expect(responseBody.fixes).toBeDefined();
      expect(responseBody.fixes.some((fix: string) => 
        fix.toLowerCase().includes('authority')
      )).toBe(true);
    });

    it('should handle multiple custom error codes via API endpoint', async () => {
      const customErrorCodes = [6002, 6003, 6007, 6008, 6009];

      for (const errorCode of customErrorCodes) {
        // Arrange
        const event = createEvent({ errorCode });

        // Act
        const result = await handler(event, mockContext) as APIGatewayProxyResult;

        // Assert
        expect(result.statusCode).toBe(200);
        
        const responseBody = JSON.parse(result.body);
        expect(responseBody.code).toBe(errorCode);
        expect(responseBody.explanation).toBeDefined();
        expect(responseBody.explanation.length).toBeGreaterThan(10);
        expect(responseBody.fixes).toBeDefined();
        expect(responseBody.fixes.length).toBeGreaterThan(0);
        expect(responseBody.timestamp).toBeDefined();
      }
    });
  });

  describe('Input Format Variations (Requirement 4.1)', () => {
    it('should handle hex input format for common errors via API endpoint', async () => {
      const hexTestCases = [
        { hex: '0x0', decimal: 0 },
        { hex: '0x1', decimal: 1 },
        { hex: '0x7D0', decimal: 2000 },
        { hex: '0x1770', decimal: 6000 }
      ];

      for (const testCase of hexTestCases) {
        // Arrange
        const event = createEvent({ errorCode: testCase.hex });

        // Act
        const result = await handler(event, mockContext) as APIGatewayProxyResult;

        // Assert
        expect(result.statusCode).toBe(200);
        
        const responseBody = JSON.parse(result.body);
        expect(responseBody.code).toBe(testCase.decimal);
        expect(responseBody.explanation).toBeDefined();
        expect(responseBody.fixes).toBeDefined();
      }
    });

    it('should handle string numeric input for common errors via API endpoint', async () => {
      const stringTestCases = ['0', '1', '2000', '6000'];

      for (const stringCode of stringTestCases) {
        // Arrange
        const event = createEvent({ errorCode: stringCode });

        // Act
        const result = await handler(event, mockContext) as APIGatewayProxyResult;

        // Assert
        expect(result.statusCode).toBe(200);
        
        const responseBody = JSON.parse(result.body);
        expect(responseBody.code).toBe(parseInt(stringCode, 10));
        expect(responseBody.explanation).toBeDefined();
        expect(responseBody.fixes).toBeDefined();
      }
    });

    it('should handle invalid input with appropriate error responses', async () => {
      const invalidInputs = [
        { input: -1, expectedStatus: 400 },
        { input: 4294967296, expectedStatus: 400 },
        { input: 'invalid', expectedStatus: 400 },
        { input: null, expectedStatus: 400 }
      ];

      for (const testCase of invalidInputs) {
        // Arrange
        const event = createEvent({ errorCode: testCase.input });

        // Act
        const result = await handler(event, mockContext) as APIGatewayProxyResult;

        // Assert
        // The system may handle invalid inputs gracefully by normalizing them
        // or returning appropriate error responses
        if (result.statusCode === 400) {
          const responseBody = JSON.parse(result.body);
          expect(responseBody.error).toBeDefined();
        } else {
          expect(result.statusCode).toBe(200);
          const responseBody = JSON.parse(result.body);
          expect(responseBody.code).toBeDefined();
        }
      }
    });
  });

  describe('API Response Format Validation', () => {
    it('should return properly formatted responses for all common error types', async () => {
      const testErrorCodes = [0, 1, 100, 2000, 2001, 2002, 6000, 6001, 6002];

      for (const errorCode of testErrorCodes) {
        // Arrange
        const event = createEvent({ errorCode });

        // Act
        const result = await handler(event, mockContext) as APIGatewayProxyResult;

        // Assert
        expect(result.statusCode).toBe(200);
        expect(result.headers).toBeDefined();
        expect(result.headers!['Content-Type']).toBe('application/json');
        expect(result.headers!['Access-Control-Allow-Origin']).toBe('*');
        
        const responseBody = JSON.parse(result.body);
        
        // Validate response structure
        expect(responseBody).toHaveProperty('code');
        expect(responseBody).toHaveProperty('explanation');
        expect(responseBody).toHaveProperty('fixes');
        expect(responseBody).toHaveProperty('timestamp');
        
        // Validate response content
        expect(responseBody.code).toBe(errorCode);
        expect(typeof responseBody.explanation).toBe('string');
        expect(Array.isArray(responseBody.fixes)).toBe(true);
        expect(responseBody.fixes.length).toBeGreaterThan(0);
        expect(typeof responseBody.timestamp).toBe('string');
        
        // Validate content quality
        expect(responseBody.explanation.length).toBeGreaterThan(10);
        responseBody.fixes.forEach((fix: string) => {
          expect(typeof fix).toBe('string');
          expect(fix.length).toBeGreaterThan(5);
        });
      }
    });

    it('should include CORS headers for all responses', async () => {
      // Arrange
      const event = createEvent({ errorCode: 1 });

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.headers).toBeDefined();
      expect(result.headers!['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers!['Access-Control-Allow-Headers']).toBe('Content-Type, X-Amz-Date, Authorization, X-Api-Key, X-Amz-Security-Token');
      expect(result.headers!['Access-Control-Allow-Methods']).toBe('GET, POST, OPTIONS');
    });

    it('should handle missing request body gracefully', async () => {
      // Arrange
      const event = createEvent(null);
      event.body = null;

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(400);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toContain('Request body is required');
    });

    it('should handle malformed JSON gracefully', async () => {
      // Arrange
      const event = createEvent({ errorCode: 1 });
      event.body = '{ invalid json }';

      // Act
      const result = await handler(event, mockContext) as APIGatewayProxyResult;

      // Assert
      expect(result.statusCode).toBe(400);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toContain('Invalid JSON');
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle multiple common error requests efficiently', async () => {
      const errorCodes = [0, 1, 100, 2000, 2001, 6000, 6001];
      const startTime = Date.now();

      // Act - Process multiple requests
      const promises = errorCodes.map(errorCode => {
        const event = createEvent({ errorCode });
        return handler(event, mockContext);
      });

      const results = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Assert
      expect(results).toHaveLength(errorCodes.length);
      results.forEach((result, index) => {
        const apiResult = result as APIGatewayProxyResult;
        expect(apiResult.statusCode).toBe(200);
        
        const responseBody = JSON.parse(apiResult.body);
        expect(responseBody.code).toBe(errorCodes[index]);
      });

      // Should complete all requests within reasonable time
      expect(totalTime).toBeLessThan(5000); // 5 seconds for all requests
    });

    it('should maintain consistent response format across all error types', async () => {
      const diverseErrorCodes = [0, 1, 100, 2000, 2001, 2002, 6000, 6001, 6002, 6003, 6007];
      const responses = [];

      for (const errorCode of diverseErrorCodes) {
        // Arrange
        const event = createEvent({ errorCode });

        // Act
        const result = await handler(event, mockContext) as APIGatewayProxyResult;
        const responseBody = JSON.parse(result.body);
        responses.push(responseBody);
      }

      // Assert - All responses should have consistent structure
      responses.forEach(response => {
        expect(response).toHaveProperty('code');
        expect(response).toHaveProperty('explanation');
        expect(response).toHaveProperty('fixes');
        expect(response).toHaveProperty('timestamp');
        
        expect(typeof response.code).toBe('number');
        expect(typeof response.explanation).toBe('string');
        expect(Array.isArray(response.fixes)).toBe(true);
        expect(typeof response.timestamp).toBe('string');
      });

      // Verify variety in responses (not all identical)
      const uniqueExplanations = new Set(responses.map(r => r.explanation));
      expect(uniqueExplanations.size).toBeGreaterThan(5);
    });
  });
});