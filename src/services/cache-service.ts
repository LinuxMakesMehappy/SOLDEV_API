/**
 * DynamoDB cache service for storing and retrieving error explanations
 * Requirements: 2.7, 7.5, 3.3
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  GetCommand, 
  PutCommand, 
  GetCommandInput,
  PutCommandInput 
} from '@aws-sdk/lib-dynamodb';
import { ValidatedEnvironmentConfig } from '../types/environment';
import { CacheItem } from '../models/error-models';

/**
 * Error explanation model for cache operations
 */
export interface ErrorExplanation {
  code: number;
  explanation: string;
  fixes: string[];
  source: 'cache' | 'ai' | 'static';
  confidence?: number;
}

/**
 * Cache service interface
 */
export interface CacheService {
  get(key: string): Promise<ErrorExplanation | null>;
  set(key: string, value: ErrorExplanation, ttl: number): Promise<void>;
}

/**
 * DynamoDB-based cache service implementation
 * Requirement 2.7: Caching with TTL support for performance optimization
 */
export class DynamoDBCacheService implements CacheService {
  private readonly client: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly defaultTtlSeconds: number;

  constructor(config: ValidatedEnvironmentConfig) {
    // Create DynamoDB client with proper configuration
    // Requirement 3.3: Configurable environment variables
    const dynamoClient = new DynamoDBClient({
      region: config.aws.region,
      // Use default credential chain (IAM roles, environment variables, etc.)
    });

    this.client = DynamoDBDocumentClient.from(dynamoClient, {
      marshallOptions: {
        convertEmptyValues: false,
        removeUndefinedValues: true,
        convertClassInstanceToMap: false,
      },
      unmarshallOptions: {
        wrapNumbers: false,
      },
    });

    this.tableName = config.cache.tableName;
    this.defaultTtlSeconds = config.cache.ttlSeconds;
  }

  /**
   * Retrieves cached error explanation
   * Requirement 7.5: Fast cache retrieval for performance
   * @param key - Cache key (typically "error_{errorCode}")
   * @returns ErrorExplanation or null if not found/expired
   */
  async get(key: string): Promise<ErrorExplanation | null> {
    try {
      const params: GetCommandInput = {
        TableName: this.tableName,
        Key: {
          errorCode: key,
        },
      };

      const command = new GetCommand(params);
      const result = await this.client.send(command);

      if (!result.Item) {
        return null;
      }

      const item = result.Item as CacheItem;

      // Check if item has expired (additional safety check beyond DynamoDB TTL)
      const now = Math.floor(Date.now() / 1000);
      if (item.ttl && item.ttl < now) {
        return null;
      }

      return {
        code: parseInt(key.replace('error_', ''), 10),
        explanation: item.explanation,
        fixes: item.fixes,
        source: 'cache',
        confidence: item.source === 'ai' ? 0.9 : 1.0,
      };
    } catch (error) {
      // Log error but don't throw - cache failures should not break the API
      console.error('Cache get operation failed:', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error',
        tableName: this.tableName,
      });
      return null;
    }
  }

  /**
   * Stores error explanation in cache with TTL
   * Requirement 2.7: Cache storage with automatic expiration
   * @param key - Cache key (typically "error_{errorCode}")
   * @param value - Error explanation to cache
   * @param ttl - Time to live in seconds (optional, uses default if not provided)
   */
  async set(key: string, value: ErrorExplanation, ttl?: number): Promise<void> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const expirationTime = now + (ttl || this.defaultTtlSeconds);

      const item: CacheItem = {
        errorCode: key,
        explanation: value.explanation,
        fixes: value.fixes,
        createdAt: now,
        ttl: expirationTime,
        source: value.source === 'cache' ? 'ai' : value.source, // Don't store 'cache' as source
      };

      const params: PutCommandInput = {
        TableName: this.tableName,
        Item: item,
        // Use conditional write to prevent race conditions
        ConditionExpression: 'attribute_not_exists(errorCode) OR #ttl < :now',
        ExpressionAttributeNames: {
          '#ttl': 'ttl',
        },
        ExpressionAttributeValues: {
          ':now': now,
        },
      };

      const command = new PutCommand(params);
      await this.client.send(command);
    } catch (error) {
      // Log error but don't throw - cache failures should not break the API
      console.error('Cache set operation failed:', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error',
        tableName: this.tableName,
      });
      // Don't throw error - cache failures should be graceful
    }
  }

  /**
   * Generates cache key for error code
   * @param errorCode - Error code number
   * @returns Formatted cache key
   */
  static generateCacheKey(errorCode: number): string {
    return `error_${errorCode}`;
  }

  /**
   * Health check method to verify DynamoDB connectivity
   * @returns Promise<boolean> indicating if cache is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Try to get a non-existent item to test connectivity directly
      const testKey = `health_check_${Date.now()}`;
      const params: GetCommandInput = {
        TableName: this.tableName,
        Key: {
          errorCode: testKey,
        },
      };

      const command = new GetCommand(params);
      await this.client.send(command);
      return true;
    } catch (error) {
      console.error('Cache health check failed:', error);
      return false;
    }
  }
}

/**
 * In-memory fallback cache for when DynamoDB is unavailable
 * Requirement 3.3: Fallback mechanisms for reliability
 */
export class InMemoryCacheService implements CacheService {
  private readonly cache = new Map<string, { value: ErrorExplanation; expiry: number }>();
  private readonly defaultTtlSeconds: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(defaultTtlSeconds: number = 3600) {
    this.defaultTtlSeconds = defaultTtlSeconds;
    
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  async get(key: string): Promise<ErrorExplanation | null> {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }

    // Check expiry
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    return {
      ...item.value,
      source: 'cache',
    };
  }

  async set(key: string, value: ErrorExplanation, ttl?: number): Promise<void> {
    const expiryTime = Date.now() + (ttl || this.defaultTtlSeconds) * 1000;
    
    this.cache.set(key, {
      value: {
        ...value,
        source: value.source === 'cache' ? 'ai' : value.source,
      },
      expiry: expiryTime,
    });
  }

  /**
   * Removes expired entries from memory
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clears all cached items
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Stops cleanup interval and clears cache
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }

  /**
   * Gets current cache size
   */
  size(): number {
    return this.cache.size;
  }
}

/**
 * Composite cache service that uses DynamoDB with in-memory fallback
 * Requirement 3.3: Fallback mechanisms for reliability
 */
export class CompositeCacheService implements CacheService {
  private readonly primaryCache: DynamoDBCacheService;
  private readonly fallbackCache: InMemoryCacheService;
  private primaryHealthy = true;

  constructor(config: ValidatedEnvironmentConfig) {
    this.primaryCache = new DynamoDBCacheService(config);
    this.fallbackCache = new InMemoryCacheService(config.cache.ttlSeconds);
  }

  async get(key: string): Promise<ErrorExplanation | null> {
    // Try primary cache first
    if (this.primaryHealthy) {
      try {
        // Call the primary cache's internal method directly to catch actual errors
        const result = await this.getPrimaryWithError(key);
        if (result) {
          // Also cache in memory for faster subsequent access
          await this.fallbackCache.set(key, result);
          return result;
        }
      } catch (error) {
        console.warn('Primary cache failed, using fallback:', error);
        this.primaryHealthy = false;
        // Schedule health check
        setTimeout(() => this.checkPrimaryHealth(), 30000);
      }
    }

    // Fallback to in-memory cache
    return this.fallbackCache.get(key);
  }

  /**
   * Internal method to get from primary cache that can throw errors
   */
  private async getPrimaryWithError(key: string): Promise<ErrorExplanation | null> {
    const params: GetCommandInput = {
      TableName: this.primaryCache['tableName'],
      Key: {
        errorCode: key,
      },
    };

    const command = new GetCommand(params);
    const result = await this.primaryCache['client'].send(command);

    if (!result.Item) {
      return null;
    }

    const item = result.Item as CacheItem;

    // Check if item has expired
    const now = Math.floor(Date.now() / 1000);
    if (item.ttl && item.ttl < now) {
      return null;
    }

    return {
      code: parseInt(key.replace('error_', ''), 10),
      explanation: item.explanation,
      fixes: item.fixes,
      source: 'cache',
      confidence: item.source === 'ai' ? 0.9 : 1.0,
    };
  }

  async set(key: string, value: ErrorExplanation, ttl?: number): Promise<void> {
    // Always cache in memory for immediate access
    await this.fallbackCache.set(key, value, ttl);

    // Try to cache in primary if healthy
    if (this.primaryHealthy) {
      try {
        await this.setPrimaryWithError(key, value, ttl);
      } catch (error) {
        console.warn('Primary cache set failed:', error);
        this.primaryHealthy = false;
        // Schedule health check
        setTimeout(() => this.checkPrimaryHealth(), 30000);
      }
    }
  }

  /**
   * Internal method to set in primary cache that can throw errors
   */
  private async setPrimaryWithError(key: string, value: ErrorExplanation, ttl?: number): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const expirationTime = now + (ttl || this.primaryCache['defaultTtlSeconds']);

    const item: CacheItem = {
      errorCode: key,
      explanation: value.explanation,
      fixes: value.fixes,
      createdAt: now,
      ttl: expirationTime,
      source: value.source === 'cache' ? 'ai' : value.source,
    };

    const params: PutCommandInput = {
      TableName: this.primaryCache['tableName'],
      Item: item,
      ConditionExpression: 'attribute_not_exists(errorCode) OR #ttl < :now',
      ExpressionAttributeNames: {
        '#ttl': 'ttl',
      },
      ExpressionAttributeValues: {
        ':now': now,
      },
    };

    const command = new PutCommand(params);
    await this.primaryCache['client'].send(command);
  }

  /**
   * Checks if primary cache is healthy and updates status
   */
  private async checkPrimaryHealth(): Promise<void> {
    try {
      const isHealthy = await this.primaryCache.healthCheck();
      this.primaryHealthy = isHealthy;
      if (isHealthy) {
        console.info('Primary cache is healthy again');
      }
    } catch (error) {
      console.warn('Primary cache health check failed:', error);
      this.primaryHealthy = false;
    }
  }

  /**
   * Gets cache status information
   */
  getStatus(): { primaryHealthy: boolean; fallbackSize: number } {
    return {
      primaryHealthy: this.primaryHealthy,
      fallbackSize: this.fallbackCache.size(),
    };
  }
}