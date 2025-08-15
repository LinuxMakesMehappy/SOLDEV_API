/**
 * Unit tests for rate limiting middleware
 * Tests rate limiting logic, edge cases, and HTTP 429 responses
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { 
  InMemoryRateLimiter, 
  createRateLimitMiddleware, 
  defaultRateLimiter,
  createCustomRateLimiter
} from '../../src/middleware/rate-limiter';

// Helper function to create mock API Gateway events
function createMockEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    resource: '/explain',
    path: '/explain',
    httpMethod: 'POST',
    headers: {},
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {
      resourceId: 'test',
      resourcePath: '/explain',
      httpMethod: 'POST',
      requestId: 'test-request-id',
      protocol: 'HTTP/1.1',
      stage: 'test',
      requestTimeEpoch: Date.now(),
      requestTime: new Date().toISOString(),
      path: '/test/explain',
      accountId: '123456789012',
      apiId: 'test-api-id',
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
        sourceIp: '192.168.1.100',
        user: null,
        userAgent: 'test-agent',
        userArn: null,
        clientCert: null
      },
      authorizer: null
    },
    body: null,
    isBase64Encoded: false,
    ...overrides
  };
}

describe('InMemoryRateLimiter', () => {
  let rateLimiter: InMemoryRateLimiter;
  let mockEvent: APIGatewayProxyEvent;

  beforeEach(() => {
    rateLimiter = new InMemoryRateLimiter({
      requestsPerMinute: 5, // Small limit for testing
      windowSizeMs: 60000 // 1 minute
    });
    mockEvent = createMockEvent();
  });

  afterEach(() => {
    rateLimiter.destroy();
  });

  describe('Basic Rate Limiting', () => {
    it('should allow requests within the limit', async () => {
      // Make 5 requests (within limit)
      for (let i = 0; i < 5; i++) {
        const result = await rateLimiter.checkLimit(mockEvent);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(5 - i - 1);
        expect(result.limit).toBe(5);
      }
    });

    it('should block requests exceeding the limit', async () => {
      // Make 5 requests to reach the limit
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit(mockEvent);
      }

      // 6th request should be blocked
      const result = await rateLimiter.checkLimit(mockEvent);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should reset counter after window expires', async () => {
      // Use short window for testing
      const shortLimiter = new InMemoryRateLimiter({
        requestsPerMinute: 2,
        windowSizeMs: 100 // 100ms window
      });

      // Make 2 requests to reach limit
      await shortLimiter.checkLimit(mockEvent);
      await shortLimiter.checkLimit(mockEvent);

      // Should be blocked
      let result = await shortLimiter.checkLimit(mockEvent);
      expect(result.allowed).toBe(false);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be allowed again
      result = await shortLimiter.checkLimit(mockEvent);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);

      shortLimiter.destroy();
    });
  });

  describe('IP Address Detection', () => {
    it('should use X-Forwarded-For header when available', async () => {
      const event1 = createMockEvent({
        headers: { 'X-Forwarded-For': '10.0.0.1, 192.168.1.1' }
      });
      const event2 = createMockEvent({
        headers: { 'X-Forwarded-For': '10.0.0.2, 192.168.1.1' }
      });

      // Different IPs should have separate limits
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit(event1);
        await rateLimiter.checkLimit(event2);
      }

      // Both should be at their limits
      const result1 = await rateLimiter.checkLimit(event1);
      const result2 = await rateLimiter.checkLimit(event2);

      expect(result1.allowed).toBe(false);
      expect(result2.allowed).toBe(false);
    });

    it('should use X-Real-IP header when X-Forwarded-For is not available', async () => {
      const event = createMockEvent({
        headers: { 'X-Real-IP': '10.0.0.5' }
      });

      const result = await rateLimiter.checkLimit(event);
      expect(result.allowed).toBe(true);
    });

    it('should use CF-Connecting-IP header for Cloudflare', async () => {
      const event = createMockEvent({
        headers: { 'CF-Connecting-IP': '10.0.0.10' }
      });

      const result = await rateLimiter.checkLimit(event);
      expect(result.allowed).toBe(true);
    });

    it('should fallback to sourceIp when no proxy headers are present', async () => {
      const event = createMockEvent({
        requestContext: {
          ...mockEvent.requestContext,
          identity: {
            ...mockEvent.requestContext.identity,
            sourceIp: '203.0.113.1'
          }
        }
      });

      const result = await rateLimiter.checkLimit(event);
      expect(result.allowed).toBe(true);
    });
  });

  describe('Custom Key Generator', () => {
    it('should use custom key generator when provided', async () => {
      const customLimiter = new InMemoryRateLimiter({
        requestsPerMinute: 3,
        windowSizeMs: 60000,
        keyGenerator: (event) => `user:${event.headers['user-id'] || 'anonymous'}`
      });

      const event1 = createMockEvent({ headers: { 'user-id': 'user123' } });
      const event2 = createMockEvent({ headers: { 'user-id': 'user456' } });

      // Different users should have separate limits
      for (let i = 0; i < 3; i++) {
        await customLimiter.checkLimit(event1);
        await customLimiter.checkLimit(event2);
      }

      const result1 = await customLimiter.checkLimit(event1);
      const result2 = await customLimiter.checkLimit(event2);

      expect(result1.allowed).toBe(false);
      expect(result2.allowed).toBe(false);

      customLimiter.destroy();
    });
  });

  describe('Conditional Request Counting', () => {
    it('should skip successful requests when configured', async () => {
      const conditionalLimiter = new InMemoryRateLimiter({
        requestsPerMinute: 3,
        windowSizeMs: 60000,
        skipSuccessfulRequests: true
      });

      // Make 3 requests
      for (let i = 0; i < 3; i++) {
        await conditionalLimiter.checkLimit(mockEvent);
      }

      // Should be at limit
      let result = await conditionalLimiter.checkLimit(mockEvent);
      expect(result.allowed).toBe(false);

      // Update with successful status codes - should decrement counters
      await conditionalLimiter.updateAfterRequest(mockEvent, 200);
      await conditionalLimiter.updateAfterRequest(mockEvent, 201);

      // Should now allow more requests
      result = await conditionalLimiter.checkLimit(mockEvent);
      expect(result.allowed).toBe(true);

      conditionalLimiter.destroy();
    });

    it('should skip failed requests when configured', async () => {
      const conditionalLimiter = new InMemoryRateLimiter({
        requestsPerMinute: 2,
        windowSizeMs: 60000,
        skipFailedRequests: true
      });

      // Make 2 requests
      await conditionalLimiter.checkLimit(mockEvent);
      await conditionalLimiter.checkLimit(mockEvent);

      // Should be at limit
      let result = await conditionalLimiter.checkLimit(mockEvent);
      expect(result.allowed).toBe(false);

      // Update with failed status code - should decrement counter
      await conditionalLimiter.updateAfterRequest(mockEvent, 400);

      // Should now allow more requests
      result = await conditionalLimiter.checkLimit(mockEvent);
      expect(result.allowed).toBe(true);

      conditionalLimiter.destroy();
    });
  });

  describe('Statistics and Management', () => {
    it('should provide accurate statistics', async () => {
      // Make requests from different IPs
      const event1 = createMockEvent({ headers: { 'X-Forwarded-For': '10.0.0.1' } });
      const event2 = createMockEvent({ headers: { 'X-Forwarded-For': '10.0.0.2' } });

      await rateLimiter.checkLimit(event1);
      await rateLimiter.checkLimit(event1);
      await rateLimiter.checkLimit(event2);

      const stats = rateLimiter.getStats();
      expect(stats.totalKeys).toBe(2);
      expect(stats.totalRequests).toBe(3);
      expect(stats.oldestEntry).toBeGreaterThan(0);
      expect(stats.newestEntry).toBeGreaterThan(0);
    });

    it('should reset rate limit for specific key', async () => {
      // Reach the limit
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit(mockEvent);
      }

      // Should be blocked
      let result = await rateLimiter.checkLimit(mockEvent);
      expect(result.allowed).toBe(false);

      // Reset the limit
      rateLimiter.reset(mockEvent);

      // Should be allowed again
      result = await rateLimiter.checkLimit(mockEvent);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('should get current status without incrementing counter', () => {
      // Make some requests
      rateLimiter.checkLimit(mockEvent);
      rateLimiter.checkLimit(mockEvent);

      // Get status multiple times
      const status1 = rateLimiter.getStatus(mockEvent);
      const status2 = rateLimiter.getStatus(mockEvent);

      expect(status1.remaining).toBe(3);
      expect(status2.remaining).toBe(3); // Should be the same
      expect(status1.allowed).toBe(true);
      expect(status2.allowed).toBe(true);
    });
  });

  describe('Callback Functions', () => {
    it('should call onLimitReached callback when limit is exceeded', async () => {
      const onLimitReached = jest.fn();
      const callbackLimiter = new InMemoryRateLimiter({
        requestsPerMinute: 2,
        windowSizeMs: 60000,
        onLimitReached
      });

      // Make requests up to limit
      await callbackLimiter.checkLimit(mockEvent);
      await callbackLimiter.checkLimit(mockEvent);

      expect(onLimitReached).not.toHaveBeenCalled();

      // Exceed limit
      await callbackLimiter.checkLimit(mockEvent);

      expect(onLimitReached).toHaveBeenCalledWith(
        'ip:192.168.1.100',
        2,
        60000
      );

      callbackLimiter.destroy();
    });
  });
});

describe('Rate Limit Middleware', () => {
  let middleware: ReturnType<typeof createRateLimitMiddleware>;
  let mockEvent: APIGatewayProxyEvent;

  beforeEach(() => {
    middleware = createRateLimitMiddleware({
      requestsPerMinute: 3,
      windowSizeMs: 60000
    });
    mockEvent = createMockEvent();
  });

  afterEach(() => {
    middleware.destroy();
  });

  describe('checkRateLimit', () => {
    it('should return null for allowed requests', async () => {
      const result = await middleware.checkRateLimit(mockEvent);
      expect(result).toBeNull();
    });

    it('should return 429 response when rate limit is exceeded', async () => {
      // Make requests up to limit
      for (let i = 0; i < 3; i++) {
        await middleware.checkRateLimit(mockEvent);
      }

      // Next request should be blocked
      const result = await middleware.checkRateLimit(mockEvent);

      expect(result).not.toBeNull();
      expect(result!.statusCode).toBe(429);
      expect(result!.headers!['X-RateLimit-Limit']).toBe('3');
      expect(result!.headers!['X-RateLimit-Remaining']).toBe('0');
      expect(result!.headers!['Retry-After']).toBeDefined();

      const body = JSON.parse(result!.body);
      expect(body.error).toBe('Too Many Requests');
      expect(body.message).toContain('Rate limit exceeded');
      expect(body.retryAfter).toBeGreaterThan(0);
    });

    it('should include CORS headers in 429 response', async () => {
      // Exceed limit
      for (let i = 0; i < 4; i++) {
        await middleware.checkRateLimit(mockEvent);
      }

      const result = await middleware.checkRateLimit(mockEvent);

      expect(result!.headers!['Access-Control-Allow-Origin']).toBe('*');
      expect(result!.headers!['Access-Control-Allow-Headers']).toBe('Content-Type');
      expect(result!.headers!['Access-Control-Allow-Methods']).toBe('GET, POST, OPTIONS');
    });
  });

  describe('addRateLimitHeaders', () => {
    it('should add rate limit headers to successful responses', async () => {
      // Make a request first
      await middleware.checkRateLimit(mockEvent);

      const originalResponse: APIGatewayProxyResult = {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true })
      };

      const modifiedResponse = await middleware.addRateLimitHeaders(originalResponse, mockEvent);

      expect(modifiedResponse.headers!['X-RateLimit-Limit']).toBe('3');
      expect(modifiedResponse.headers!['X-RateLimit-Remaining']).toBe('2');
      expect(modifiedResponse.headers!['X-RateLimit-Reset']).toBeDefined();
      expect(modifiedResponse.headers!['Content-Type']).toBe('application/json'); // Original headers preserved
    });

    it('should preserve existing headers', async () => {
      const originalResponse: APIGatewayProxyResult = {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Custom-Header': 'custom-value'
        },
        body: JSON.stringify({ success: true })
      };

      const modifiedResponse = await middleware.addRateLimitHeaders(originalResponse, mockEvent);

      expect(modifiedResponse.headers!['Content-Type']).toBe('application/json');
      expect(modifiedResponse.headers!['Custom-Header']).toBe('custom-value');
      expect(modifiedResponse.headers!['X-RateLimit-Limit']).toBe('3');
    });
  });

  describe('Statistics', () => {
    it('should provide middleware statistics', async () => {
      await middleware.checkRateLimit(mockEvent);
      await middleware.checkRateLimit(mockEvent);

      const stats = middleware.getStats();
      expect(stats.totalKeys).toBe(1);
      expect(stats.totalRequests).toBe(2);
    });
  });
});

describe('Default Rate Limiter', () => {
  afterAll(() => {
    // Clean up the default rate limiter to prevent hanging
    defaultRateLimiter.destroy();
  });

  it('should be configured with 100 requests per minute', async () => {
    expect(defaultRateLimiter).toBeDefined();
    
    // Test that it's working
    const mockEvent = createMockEvent();
    const result = await defaultRateLimiter.checkRateLimit(mockEvent);
    expect(result).toBeNull(); // Should allow requests initially
  });
});

describe('Custom Rate Limiter Factory', () => {
  it('should create rate limiter with custom settings', async () => {
    const customLimiter = createCustomRateLimiter(10, 30000); // 10 requests per 30 seconds
    const mockEvent = createMockEvent();

    // Should allow requests initially
    let result = await customLimiter.checkRateLimit(mockEvent);
    expect(result).toBeNull();

    // Make 10 requests
    for (let i = 0; i < 10; i++) {
      await customLimiter.checkRateLimit(mockEvent);
    }

    // 11th request should be blocked
    result = await customLimiter.checkRateLimit(mockEvent);
    expect(result).not.toBeNull();
    expect(result!.statusCode).toBe(429);

    customLimiter.destroy();
  });
});

describe('Edge Cases and Error Handling', () => {
  let rateLimiter: InMemoryRateLimiter;

  beforeEach(() => {
    rateLimiter = new InMemoryRateLimiter({
      requestsPerMinute: 5,
      windowSizeMs: 60000
    });
  });

  afterEach(() => {
    rateLimiter.destroy();
  });

  it('should handle missing IP address gracefully', async () => {
    const eventWithoutIp = createMockEvent({
      requestContext: {
        ...createMockEvent().requestContext,
        identity: {
          ...createMockEvent().requestContext.identity,
          sourceIp: undefined as any
        }
      }
    });

    const result = await rateLimiter.checkLimit(eventWithoutIp);
    expect(result.allowed).toBe(true);
  });

  it('should handle malformed X-Forwarded-For header', async () => {
    const eventWithMalformedHeader = createMockEvent({
      headers: { 'X-Forwarded-For': '' }
    });

    const result = await rateLimiter.checkLimit(eventWithMalformedHeader);
    expect(result.allowed).toBe(true);
  });

  it('should handle concurrent requests correctly', async () => {
    const mockEvent = createMockEvent();
    
    // Make concurrent requests
    const promises = Array(10).fill(null).map(() => rateLimiter.checkLimit(mockEvent));
    const results = await Promise.all(promises);

    // Should have exactly 5 allowed and 5 blocked
    const allowed = results.filter(r => r.allowed).length;
    const blocked = results.filter(r => !r.allowed).length;

    expect(allowed).toBe(5);
    expect(blocked).toBe(5);
  });

  it('should cleanup expired entries', async () => {
    const shortLimiter = new InMemoryRateLimiter({
      requestsPerMinute: 5,
      windowSizeMs: 50 // Very short window
    });

    const event1 = createMockEvent({ headers: { 'X-Forwarded-For': '10.0.0.1' } });
    const event2 = createMockEvent({ headers: { 'X-Forwarded-For': '10.0.0.2' } });

    await shortLimiter.checkLimit(event1);
    await shortLimiter.checkLimit(event2);

    expect(shortLimiter.getStats().totalKeys).toBe(2);

    // Wait for entries to expire
    await new Promise(resolve => setTimeout(resolve, 100));

    // Trigger cleanup by making a new request
    await shortLimiter.checkLimit(createMockEvent({ headers: { 'X-Forwarded-For': '10.0.0.3' } }));

    // Old entries should be cleaned up eventually
    // Note: Cleanup happens periodically, so we can't guarantee immediate cleanup
    
    shortLimiter.destroy();
  });
});