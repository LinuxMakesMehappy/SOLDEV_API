/**
 * Unit tests for DynamoDB cache service
 * Requirements: 2.7, 7.5, 3.3
 */

import { 
  DynamoDBCacheService, 
  InMemoryCacheService, 
  CompositeCacheService,
  ErrorExplanation 
} from '../../src/services/cache-service';
import { ValidatedEnvironmentConfig } from '../../src/types/environment';

// Mock AWS SDK with proper hoisting
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn().mockReturnValue({
      send: jest.fn(),
    }),
  },
  GetCommand: jest.fn().mockImplementation((params) => ({ input: params })),
  PutCommand: jest.fn().mockImplementation((params) => ({ input: params })),
}));

describe('DynamoDBCacheService', () => {
  let cacheService: DynamoDBCacheService;
  let mockConfig: ValidatedEnvironmentConfig;
  let mockSend: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Get the mocked send function
    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    mockSend = DynamoDBDocumentClient.from().send;
    
    mockConfig = {
      awsBedrock: {
        region: 'us-east-1',
        modelId: 'test-model',
        temperature: 0.7,
        maxTokens: 1000,
        timeoutMs: 5000,
      },
      cache: {
        tableName: 'test-cache-table',
        ttlSeconds: 3600,
      },
      rateLimit: {
        requestsPerMinute: 100,
      },
      logging: {
        level: 'info',
      },
      aws: {
        region: 'us-east-1',
      },
    };

    cacheService = new DynamoDBCacheService(mockConfig);
  });

  describe('get', () => {
    it('should return cached error explanation when item exists', async () => {
      // Arrange
      const key = 'error_6000';
      const mockItem = {
        errorCode: key,
        explanation: 'Test explanation',
        fixes: ['Fix 1', 'Fix 2'],
        createdAt: Math.floor(Date.now() / 1000),
        ttl: Math.floor(Date.now() / 1000) + 3600,
        source: 'ai',
      };

      mockSend.mockResolvedValueOnce({
        Item: mockItem,
      });

      // Act
      const result = await cacheService.get(key);

      // Assert
      expect(result).toEqual({
        code: 6000,
        explanation: 'Test explanation',
        fixes: ['Fix 1', 'Fix 2'],
        source: 'cache',
        confidence: 0.9,
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            TableName: 'test-cache-table',
            Key: { errorCode: key },
          },
        })
      );
    });

    it('should return null when item does not exist', async () => {
      // Arrange
      const key = 'error_6000';
      mockSend.mockResolvedValueOnce({});

      // Act
      const result = await cacheService.get(key);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when item has expired', async () => {
      // Arrange
      const key = 'error_6000';
      const expiredItem = {
        errorCode: key,
        explanation: 'Test explanation',
        fixes: ['Fix 1'],
        createdAt: Math.floor(Date.now() / 1000) - 7200,
        ttl: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
        source: 'ai',
      };

      mockSend.mockResolvedValueOnce({
        Item: expiredItem,
      });

      // Act
      const result = await cacheService.get(key);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null and log error when DynamoDB operation fails', async () => {
      // Arrange
      const key = 'error_6000';
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockSend.mockRejectedValueOnce(new Error('DynamoDB error'));

      // Act
      const result = await cacheService.get(key);

      // Assert
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Cache get operation failed:',
        expect.objectContaining({
          key,
          error: 'DynamoDB error',
          tableName: 'test-cache-table',
        })
      );

      consoleSpy.mockRestore();
    });
  });

  describe('set', () => {
    it('should store error explanation with TTL', async () => {
      // Arrange
      const key = 'error_6000';
      const value: ErrorExplanation = {
        code: 6000,
        explanation: 'Test explanation',
        fixes: ['Fix 1', 'Fix 2'],
        source: 'ai',
        confidence: 0.9,
      };
      const ttl = 1800; // 30 minutes

      mockSend.mockResolvedValueOnce({});

      // Act
      await cacheService.set(key, value, ttl);

      // Assert
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'test-cache-table',
            Item: expect.objectContaining({
              errorCode: key,
              explanation: 'Test explanation',
              fixes: ['Fix 1', 'Fix 2'],
              source: 'ai',
              createdAt: expect.any(Number),
              ttl: expect.any(Number),
            }),
            ConditionExpression: 'attribute_not_exists(errorCode) OR #ttl < :now',
          }),
        })
      );
    });

    it('should use default TTL when not specified', async () => {
      // Arrange
      const key = 'error_6000';
      const value: ErrorExplanation = {
        code: 6000,
        explanation: 'Test explanation',
        fixes: ['Fix 1'],
        source: 'static',
      };

      mockSend.mockResolvedValueOnce({});

      // Act
      await cacheService.set(key, value);

      // Assert
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'test-cache-table',
            Item: expect.objectContaining({
              errorCode: key,
              explanation: 'Test explanation',
              fixes: ['Fix 1'],
              source: 'static',
              createdAt: expect.any(Number),
              ttl: expect.any(Number),
            }),
          }),
        })
      );
    });

    it('should not throw error when DynamoDB operation fails', async () => {
      // Arrange
      const key = 'error_6000';
      const value: ErrorExplanation = {
        code: 6000,
        explanation: 'Test explanation',
        fixes: ['Fix 1'],
        source: 'ai',
      };

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockSend.mockRejectedValueOnce(new Error('DynamoDB error'));

      // Act & Assert
      await expect(cacheService.set(key, value)).resolves.not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Cache set operation failed:',
        expect.objectContaining({
          key,
          error: 'DynamoDB error',
        })
      );

      consoleSpy.mockRestore();
    });
  });

  describe('generateCacheKey', () => {
    it('should generate correct cache key format', () => {
      expect(DynamoDBCacheService.generateCacheKey(6000)).toBe('error_6000');
      expect(DynamoDBCacheService.generateCacheKey(0)).toBe('error_0');
      expect(DynamoDBCacheService.generateCacheKey(2001)).toBe('error_2001');
    });
  });

  describe('healthCheck', () => {
    it('should return true when cache is healthy', async () => {
      // Arrange
      mockSend.mockResolvedValueOnce({});

      // Act
      const result = await cacheService.healthCheck();

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when cache is unhealthy', async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      // Mock the get operation to fail, which is what healthCheck calls
      mockSend.mockRejectedValueOnce(new Error('Connection failed'));

      // Act
      const result = await cacheService.healthCheck();

      // Assert
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('Cache health check failed:', expect.any(Error));

      consoleSpy.mockRestore();
    });
  });
});

describe('InMemoryCacheService', () => {
  let cacheService: InMemoryCacheService;

  beforeEach(() => {
    jest.useFakeTimers();
    cacheService = new InMemoryCacheService(3600);
  });

  afterEach(() => {
    cacheService.destroy();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('get and set', () => {
    it('should store and retrieve values correctly', async () => {
      // Arrange
      const key = 'error_6000';
      const value: ErrorExplanation = {
        code: 6000,
        explanation: 'Test explanation',
        fixes: ['Fix 1', 'Fix 2'],
        source: 'ai',
      };

      // Act
      await cacheService.set(key, value);
      const result = await cacheService.get(key);

      // Assert
      expect(result).toEqual({
        code: 6000,
        explanation: 'Test explanation',
        fixes: ['Fix 1', 'Fix 2'],
        source: 'cache',
      });
    });

    it('should return null for non-existent keys', async () => {
      // Act
      const result = await cacheService.get('non-existent');

      // Assert
      expect(result).toBeNull();
    });

    it('should return null for expired items', async () => {
      // Arrange
      const key = 'error_6000';
      const value: ErrorExplanation = {
        code: 6000,
        explanation: 'Test explanation',
        fixes: ['Fix 1'],
        source: 'ai',
      };

      // Act
      await cacheService.set(key, value, -1); // Already expired
      const result = await cacheService.get(key);

      // Assert
      expect(result).toBeNull();
    });

    it('should respect custom TTL', async () => {
      // Arrange
      const key = 'error_6000';
      const value: ErrorExplanation = {
        code: 6000,
        explanation: 'Test explanation',
        fixes: ['Fix 1'],
        source: 'ai',
      };

      // Act
      await cacheService.set(key, value, 1); // 1 second TTL
      
      // Should be available immediately
      let result = await cacheService.get(key);
      expect(result).not.toBeNull();

      // Fast forward time
      jest.advanceTimersByTime(1100);
      result = await cacheService.get(key);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('utility methods', () => {
    it('should track cache size correctly', async () => {
      expect(cacheService.size()).toBe(0);

      await cacheService.set('key1', { code: 1, explanation: 'test', fixes: [], source: 'ai' });
      expect(cacheService.size()).toBe(1);

      await cacheService.set('key2', { code: 2, explanation: 'test', fixes: [], source: 'ai' });
      expect(cacheService.size()).toBe(2);

      cacheService.clear();
      expect(cacheService.size()).toBe(0);
    });

    it('should clear all cached items', async () => {
      // Arrange
      await cacheService.set('key1', { code: 1, explanation: 'test', fixes: [], source: 'ai' });
      await cacheService.set('key2', { code: 2, explanation: 'test', fixes: [], source: 'ai' });

      // Act
      cacheService.clear();

      // Assert
      expect(cacheService.size()).toBe(0);
      expect(await cacheService.get('key1')).toBeNull();
      expect(await cacheService.get('key2')).toBeNull();
    });
  });
});

describe('CompositeCacheService', () => {
  let compositeCacheService: CompositeCacheService;
  let mockConfig: ValidatedEnvironmentConfig;
  let mockSend: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Get the mocked send function
    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    mockSend = DynamoDBDocumentClient.from().send;
    
    mockConfig = {
      awsBedrock: {
        region: 'us-east-1',
        modelId: 'test-model',
        temperature: 0.7,
        maxTokens: 1000,
        timeoutMs: 5000,
      },
      cache: {
        tableName: 'test-cache-table',
        ttlSeconds: 3600,
      },
      rateLimit: {
        requestsPerMinute: 100,
      },
      logging: {
        level: 'info',
      },
      aws: {
        region: 'us-east-1',
      },
    };

    compositeCacheService = new CompositeCacheService(mockConfig);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('get', () => {
    it('should return from primary cache when healthy', async () => {
      // Arrange
      const key = 'error_6000';
      const mockItem = {
        errorCode: key,
        explanation: 'Primary cache explanation',
        fixes: ['Fix 1'],
        createdAt: Math.floor(Date.now() / 1000),
        ttl: Math.floor(Date.now() / 1000) + 3600,
        source: 'ai',
      };

      mockSend.mockResolvedValueOnce({ Item: mockItem });

      // Act
      const result = await compositeCacheService.get(key);

      // Assert
      expect(result).toEqual({
        code: 6000,
        explanation: 'Primary cache explanation',
        fixes: ['Fix 1'],
        source: 'cache',
        confidence: 0.9,
      });
    });

    it('should fallback to in-memory cache when primary fails', async () => {
      // Arrange
      const key = 'error_6000';
      const value: ErrorExplanation = {
        code: 6000,
        explanation: 'Fallback explanation',
        fixes: ['Fix 1'],
        source: 'ai',
      };

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Pre-populate fallback cache by setting first (this should succeed)
      mockSend.mockResolvedValueOnce({}); // For the set operation
      await compositeCacheService.set(key, value);
      
      // Now make primary cache fail on get
      mockSend.mockRejectedValueOnce(new Error('DynamoDB error'));

      // Act
      const result = await compositeCacheService.get(key);

      // Assert
      expect(result).toEqual({
        code: 6000,
        explanation: 'Fallback explanation',
        fixes: ['Fix 1'],
        source: 'cache',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'Primary cache failed, using fallback:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('set', () => {
    it('should store in both caches when primary is healthy', async () => {
      // Arrange
      const key = 'error_6000';
      const value: ErrorExplanation = {
        code: 6000,
        explanation: 'Test explanation',
        fixes: ['Fix 1'],
        source: 'ai',
      };

      mockSend.mockResolvedValueOnce({});

      // Act
      await compositeCacheService.set(key, value);

      // Assert
      expect(mockSend).toHaveBeenCalled(); // Primary cache called
      
      // Verify fallback cache has the item by getting it
      const result = await compositeCacheService.get(key);
      expect(result).not.toBeNull();
    });

    it('should continue working when primary cache set fails', async () => {
      // Arrange
      const key = 'error_6000';
      const value: ErrorExplanation = {
        code: 6000,
        explanation: 'Test explanation',
        fixes: ['Fix 1'],
        source: 'ai',
      };

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      mockSend.mockRejectedValueOnce(new Error('DynamoDB error'));

      // Act
      await compositeCacheService.set(key, value);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        'Primary cache set failed:',
        expect.any(Error)
      );

      // Fallback cache should still work - test by getting the item
      // Since primary failed, it should get from fallback (no DynamoDB call)
      const result = await compositeCacheService.get(key);
      expect(result).toEqual({
        code: 6000,
        explanation: 'Test explanation',
        fixes: ['Fix 1'],
        source: 'cache',
      });

      consoleSpy.mockRestore();
    });
  });

  describe('getStatus', () => {
    it('should return cache status information', () => {
      // Act
      const status = compositeCacheService.getStatus();

      // Assert
      expect(status).toEqual({
        primaryHealthy: expect.any(Boolean),
        fallbackSize: expect.any(Number),
      });
    });
  });
});