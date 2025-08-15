/**
 * Rate limiting middleware for Lambda functions
 * Requirements: 5.1, 5.3 - IP-based rate limiting with 100 requests per minute
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * Rate limit configuration interface
 */
export interface RateLimitConfig {
  requestsPerMinute: number;
  windowSizeMs: number;
  keyGenerator?: (event: APIGatewayProxyEvent) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  onLimitReached?: (key: string, limit: number, windowMs: number) => void;
}

/**
 * Rate limit entry for tracking requests
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
  firstRequest: number;
}

/**
 * Rate limit result interface
 */
export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfter?: number | undefined;
}

/**
 * In-memory rate limiter for Lambda functions
 * Requirement 5.1: IP-based rate limiting (100 requests per minute)
 */
export class InMemoryRateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private config: Required<RateLimitConfig>;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: RateLimitConfig) {
    this.config = {
      requestsPerMinute: config.requestsPerMinute,
      windowSizeMs: config.windowSizeMs || 60000, // 1 minute default
      keyGenerator: config.keyGenerator || this.defaultKeyGenerator,
      skipSuccessfulRequests: config.skipSuccessfulRequests || false,
      skipFailedRequests: config.skipFailedRequests || false,
      onLimitReached: config.onLimitReached || (() => {})
    };

    // Start cleanup process to remove expired entries
    this.startCleanup();
  }

  /**
   * Default key generator using client IP address
   * @param event - API Gateway event
   * @returns Rate limit key
   */
  private defaultKeyGenerator(event: APIGatewayProxyEvent): string {
    // Try to get real IP from various headers (for cases behind proxies/load balancers)
    const forwardedFor = event.headers['X-Forwarded-For'] || event.headers['x-forwarded-for'];
    const realIp = event.headers['X-Real-IP'] || event.headers['x-real-ip'];
    const cfConnectingIp = event.headers['CF-Connecting-IP'] || event.headers['cf-connecting-ip'];
    
    // Use the first available IP, fallback to sourceIp
    const clientIp = forwardedFor?.split(',')[0]?.trim() || 
                     realIp || 
                     cfConnectingIp || 
                     event.requestContext.identity.sourceIp || 
                     'unknown';

    return `ip:${clientIp}`;
  }

  /**
   * Check if request is allowed and update counters
   * @param event - API Gateway event
   * @returns Rate limit result
   */
  async checkLimit(event: APIGatewayProxyEvent): Promise<RateLimitResult> {
    const key = this.config.keyGenerator(event);
    const now = Date.now();
    
    // Get or create entry for this key
    let entry = this.store.get(key);
    
    if (!entry || now >= entry.resetTime) {
      // Create new entry or reset expired entry
      entry = {
        count: 0,
        resetTime: now + this.config.windowSizeMs,
        firstRequest: now
      };
      this.store.set(key, entry);
    }

    // Check if limit is exceeded
    const allowed = entry.count < this.config.requestsPerMinute;
    
    if (allowed) {
      // Increment counter for allowed requests
      entry.count++;
    } else {
      // Call limit reached callback
      this.config.onLimitReached(key, this.config.requestsPerMinute, this.config.windowSizeMs);
    }

    const remaining = Math.max(0, this.config.requestsPerMinute - entry.count);
    const retryAfter = allowed ? undefined : Math.ceil((entry.resetTime - now) / 1000);

    const result: RateLimitResult = {
      allowed,
      limit: this.config.requestsPerMinute,
      remaining,
      resetTime: entry.resetTime
    };

    if (retryAfter !== undefined) {
      result.retryAfter = retryAfter;
    }

    return result;
  }

  /**
   * Update rate limit after request completion (for conditional counting)
   * @param event - API Gateway event
   * @param statusCode - HTTP status code of the response
   */
  async updateAfterRequest(event: APIGatewayProxyEvent, statusCode: number): Promise<void> {
    const key = this.config.keyGenerator(event);
    const entry = this.store.get(key);
    
    if (!entry) return;

    const isSuccess = statusCode >= 200 && statusCode < 300;
    const isFailure = statusCode >= 400;

    // Decrement counter if we should skip this request type
    if ((isSuccess && this.config.skipSuccessfulRequests) ||
        (isFailure && this.config.skipFailedRequests)) {
      entry.count = Math.max(0, entry.count - 1);
    }
  }

  /**
   * Get current rate limit status for a key
   * @param event - API Gateway event
   * @returns Current rate limit status
   */
  getStatus(event: APIGatewayProxyEvent): RateLimitResult {
    const key = this.config.keyGenerator(event);
    const entry = this.store.get(key);
    const now = Date.now();

    if (!entry || now >= entry.resetTime) {
      return {
        allowed: true,
        limit: this.config.requestsPerMinute,
        remaining: this.config.requestsPerMinute,
        resetTime: now + this.config.windowSizeMs
      };
    }

    const remaining = Math.max(0, this.config.requestsPerMinute - entry.count);
    const allowed = entry.count < this.config.requestsPerMinute;
    const retryAfter = allowed ? undefined : Math.ceil((entry.resetTime - now) / 1000);

    const result: RateLimitResult = {
      allowed,
      limit: this.config.requestsPerMinute,
      remaining,
      resetTime: entry.resetTime
    };

    if (retryAfter !== undefined) {
      result.retryAfter = retryAfter;
    }

    return result;
  }

  /**
   * Reset rate limit for a specific key
   * @param event - API Gateway event
   */
  reset(event: APIGatewayProxyEvent): void {
    const key = this.config.keyGenerator(event);
    this.store.delete(key);
  }

  /**
   * Get current store statistics
   * @returns Store statistics
   */
  getStats(): {
    totalKeys: number;
    totalRequests: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  } {
    let totalRequests = 0;
    let oldestEntry: number | null = null;
    let newestEntry: number | null = null;

    for (const entry of this.store.values()) {
      totalRequests += entry.count;
      
      if (oldestEntry === null || entry.firstRequest < oldestEntry) {
        oldestEntry = entry.firstRequest;
      }
      
      if (newestEntry === null || entry.firstRequest > newestEntry) {
        newestEntry = entry.firstRequest;
      }
    }

    return {
      totalKeys: this.store.size,
      totalRequests,
      oldestEntry,
      newestEntry
    };
  }

  /**
   * Start cleanup process to remove expired entries
   */
  private startCleanup(): void {
    // Clean up every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Clean up expired entries from the store
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.resetTime) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.store.delete(key);
    }
  }

  /**
   * Destroy the rate limiter and clean up resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}

/**
 * Rate limiting middleware function
 * Requirement 5.3: Proper HTTP 429 responses when rate limits are exceeded
 */
export function createRateLimitMiddleware(config: RateLimitConfig) {
  const rateLimiter = new InMemoryRateLimiter(config);

  return {
    rateLimiter,
    
    /**
     * Check rate limit before processing request
     * @param event - API Gateway event
     * @returns Rate limit result or null if allowed
     */
    async checkRateLimit(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult | null> {
      const result = await rateLimiter.checkLimit(event);

      if (!result.allowed) {
        // Return 429 Too Many Requests response
        return {
          statusCode: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': result.limit.toString(),
            'X-RateLimit-Remaining': result.remaining.toString(),
            'X-RateLimit-Reset': Math.floor(result.resetTime / 1000).toString(),
            'Retry-After': result.retryAfter?.toString() || '60',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
          },
          body: JSON.stringify({
            error: 'Too Many Requests',
            message: `Rate limit exceeded. Maximum ${result.limit} requests per minute allowed.`,
            retryAfter: result.retryAfter,
            timestamp: new Date().toISOString()
          })
        };
      }

      return null; // Request is allowed
    },

    /**
     * Add rate limit headers to successful responses
     * @param response - API Gateway response
     * @param event - API Gateway event
     * @returns Modified response with rate limit headers
     */
    async addRateLimitHeaders(
      response: APIGatewayProxyResult, 
      event: APIGatewayProxyEvent
    ): Promise<APIGatewayProxyResult> {
      const status = rateLimiter.getStatus(event);
      
      // Update rate limit after request if needed
      await rateLimiter.updateAfterRequest(event, response.statusCode);

      return {
        ...response,
        headers: {
          ...response.headers,
          'X-RateLimit-Limit': status.limit.toString(),
          'X-RateLimit-Remaining': status.remaining.toString(),
          'X-RateLimit-Reset': Math.floor(status.resetTime / 1000).toString()
        }
      };
    },

    /**
     * Get rate limiter statistics
     */
    getStats: () => rateLimiter.getStats(),

    /**
     * Cleanup resources
     */
    destroy: () => rateLimiter.destroy()
  };
}

/**
 * Default rate limiter instance for the API
 * Requirement 5.1: 100 requests per minute rate limiting
 */
export const defaultRateLimiter = createRateLimitMiddleware({
  requestsPerMinute: 100,
  windowSizeMs: 60000, // 1 minute
  onLimitReached: (key: string, limit: number) => {
    console.warn(`Rate limit exceeded for ${key}: ${limit} requests per minute`);
  }
});

/**
 * Custom rate limiter for specific endpoints
 */
export function createCustomRateLimiter(requestsPerMinute: number, windowSizeMs?: number) {
  return createRateLimitMiddleware({
    requestsPerMinute,
    windowSizeMs: windowSizeMs || 60000,
    onLimitReached: (key: string, limit: number) => {
      console.warn(`Custom rate limit exceeded for ${key}: ${limit} requests per minute`);
    }
  });
}