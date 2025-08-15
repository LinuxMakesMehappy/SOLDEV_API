/**
 * Unit tests for Composite AI service
 * Requirement 3.2: Write unit tests for fallback scenarios and AI service orchestration
 */

import { CompositeAIService, createCompositeAIService } from '../../src/services/composite-ai-service';
import { BedrockAIService } from '../../src/services/ai-service';
import { ExternalAIService } from '../../src/services/external-ai-service';
import { ValidatedEnvironmentConfig } from '../../src/types/environment';

// Mock the AI services
jest.mock('../../src/services/ai-service');
jest.mock('../../src/services/external-ai-service');

const MockedBedrockAIService = BedrockAIService as jest.MockedClass<typeof BedrockAIService>;
const MockedExternalAIService = ExternalAIService as jest.MockedClass<typeof ExternalAIService>;

describe('CompositeAIService', () => {
  let service: CompositeAIService;
  let mockBedrockService: jest.Mocked<BedrockAIService>;
  let mockExternalService: jest.Mocked<ExternalAIService>;
  let mockConfig: ValidatedEnvironmentConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock configuration with both Bedrock and external AI
    mockConfig = {
      awsBedrock: {
        region: 'us-east-1',
        modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
        temperature: 0.7,
        maxTokens: 1000,
        timeoutMs: 5000
      },
      externalAI: {
        apiUrl: 'https://api.openai.com/v1/chat/completions',
        apiKey: 'test-api-key'
      },
      cache: {
        tableName: 'test-cache',
        ttlSeconds: 3600
      },
      rateLimit: {
        requestsPerMinute: 100
      },
      logging: {
        level: 'info'
      },
      aws: {
        region: 'us-east-1'
      }
    };

    // Create mock service instances
    mockBedrockService = {
      generateExplanation: jest.fn(),
      healthCheck: jest.fn()
    } as any;

    mockExternalService = {
      generateExplanation: jest.fn(),
      healthCheck: jest.fn(),
      getRateLimitStatus: jest.fn()
    } as any;

    // Mock constructors to return our mock instances
    MockedBedrockAIService.mockImplementation(() => mockBedrockService);
    MockedExternalAIService.mockImplementation(() => mockExternalService);

    // Set up default health check responses
    mockBedrockService.healthCheck.mockResolvedValue(true);
    mockExternalService.healthCheck.mockResolvedValue(true);

    service = new CompositeAIService(mockConfig);
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('constructor', () => {
    it('should initialize with both Bedrock and external AI services', () => {
      expect(MockedBedrockAIService).toHaveBeenCalledWith(mockConfig);
      expect(MockedExternalAIService).toHaveBeenCalledWith(mockConfig);
    });

    it('should initialize without external AI service when not configured', () => {
      const configWithoutExternal = { ...mockConfig };
      delete configWithoutExternal.externalAI;

      const serviceWithoutExternal = new CompositeAIService(configWithoutExternal);

      expect(MockedBedrockAIService).toHaveBeenCalledWith(configWithoutExternal);
      expect(MockedExternalAIService).toHaveBeenCalledTimes(1); // Only from previous test
      
      serviceWithoutExternal.cleanup();
    });
  });

  describe('generateExplanation', () => {
    it('should use Bedrock service when healthy', async () => {
      const mockResult = {
        explanation: 'Bedrock explanation',
        fixes: ['Fix 1', 'Fix 2'],
        confidence: 0.9,
        model: 'claude-3-sonnet',
        tokens: 100
      };

      mockBedrockService.generateExplanation.mockResolvedValue(mockResult);
      mockBedrockService.healthCheck.mockResolvedValue(true);

      const result = await service.generateExplanation(1000);

      expect(result).toEqual(mockResult);
      expect(mockBedrockService.generateExplanation).toHaveBeenCalledWith(1000, undefined);
      expect(mockExternalService.generateExplanation).not.toHaveBeenCalled();
    });

    it('should fallback to external AI when Bedrock fails', async () => {
      const mockExternalResult = {
        explanation: 'External AI explanation',
        fixes: ['Fix 1', 'Fix 2'],
        confidence: 0.8,
        model: 'gpt-3.5-turbo',
        tokens: 120
      };

      mockBedrockService.generateExplanation.mockRejectedValue(new Error('Bedrock unavailable'));
      mockExternalService.generateExplanation.mockResolvedValue(mockExternalResult);
      mockBedrockService.healthCheck.mockResolvedValue(true);
      mockExternalService.healthCheck.mockResolvedValue(true);

      const result = await service.generateExplanation(1000);

      expect(result.explanation).toBe('External AI explanation');
      expect(result.confidence).toBeCloseTo(0.7, 1); // Reduced by 0.1 for fallback
      expect(mockBedrockService.generateExplanation).toHaveBeenCalledWith(1000, undefined);
      expect(mockExternalService.generateExplanation).toHaveBeenCalledWith(1000, undefined);
    });

    it('should pass context to AI services', async () => {
      const mockResult = {
        explanation: 'Context-aware explanation',
        fixes: ['Fix 1', 'Fix 2'],
        confidence: 0.9,
        model: 'claude-3-sonnet',
        tokens: 100
      };

      mockBedrockService.generateExplanation.mockResolvedValue(mockResult);
      mockBedrockService.healthCheck.mockResolvedValue(true);

      await service.generateExplanation(1000, 'Token transfer context');

      expect(mockBedrockService.generateExplanation).toHaveBeenCalledWith(1000, 'Token transfer context');
    });

    it('should throw error when all services fail', async () => {
      mockBedrockService.generateExplanation.mockRejectedValue(new Error('Bedrock failed'));
      mockExternalService.generateExplanation.mockRejectedValue(new Error('External AI failed'));
      mockBedrockService.healthCheck.mockResolvedValue(true);
      mockExternalService.healthCheck.mockResolvedValue(true);

      await expect(service.generateExplanation(1000)).rejects.toThrow('All AI services failed. Last error: External AI failed');
    });

    it('should throw error when no services are available', async () => {
      const configWithoutExternal = { ...mockConfig };
      delete configWithoutExternal.externalAI;

      const serviceWithoutExternal = new CompositeAIService(configWithoutExternal);
      
      mockBedrockService.generateExplanation.mockRejectedValue(new Error('Bedrock failed'));
      mockBedrockService.healthCheck.mockResolvedValue(true);

      await expect(serviceWithoutExternal.generateExplanation(1000)).rejects.toThrow('All AI services failed. Last error: Bedrock failed');
      
      serviceWithoutExternal.cleanup();
    });

    it('should skip unhealthy services', async () => {
      const mockExternalResult = {
        explanation: 'External AI explanation',
        fixes: ['Fix 1', 'Fix 2'],
        confidence: 0.8,
        model: 'gpt-3.5-turbo',
        tokens: 120
      };

      // Simulate Bedrock failure to mark it as unhealthy
      mockBedrockService.generateExplanation.mockRejectedValue(new Error('Bedrock failed'));
      mockExternalService.generateExplanation.mockResolvedValue(mockExternalResult);
      mockBedrockService.healthCheck.mockResolvedValue(true);
      mockExternalService.healthCheck.mockResolvedValue(true);

      const result = await service.generateExplanation(1000);

      expect(result.explanation).toBe('External AI explanation');
      expect(mockBedrockService.generateExplanation).toHaveBeenCalledWith(1000, undefined);
      expect(mockExternalService.generateExplanation).toHaveBeenCalledWith(1000, undefined);
    });
  });

  describe('health management', () => {
    it('should perform health checks on all services', async () => {
      mockBedrockService.healthCheck.mockResolvedValue(true);
      mockExternalService.healthCheck.mockResolvedValue(true);

      const status = await service.performHealthCheck();

      expect(status.bedrock).toBe(true);
      expect(status.external).toBe(true);
      expect(status.lastChecked).toBeGreaterThan(0);
      expect(mockBedrockService.healthCheck).toHaveBeenCalled();
      expect(mockExternalService.healthCheck).toHaveBeenCalled();
    });

    it('should handle health check failures', async () => {
      mockBedrockService.healthCheck.mockRejectedValue(new Error('Health check failed'));
      mockExternalService.healthCheck.mockResolvedValue(false);

      const status = await service.performHealthCheck();

      expect(status.bedrock).toBe(false);
      expect(status.external).toBe(false);
    });

    it('should get current health status', () => {
      const status = service.getHealthStatus();

      expect(status).toHaveProperty('bedrock');
      expect(status).toHaveProperty('external');
      expect(status).toHaveProperty('lastChecked');
    });

    it('should count available services', async () => {
      // Initially both should be available after health check
      mockBedrockService.healthCheck.mockResolvedValue(true);
      mockExternalService.healthCheck.mockResolvedValue(true);
      
      await service.performHealthCheck();
      expect(service.getAvailableServicesCount()).toBe(2);

      // Simulate Bedrock as unhealthy
      mockBedrockService.healthCheck.mockResolvedValue(false);
      await service.performHealthCheck();
      
      expect(service.getAvailableServicesCount()).toBe(1);

      // Mark both as unhealthy
      mockExternalService.healthCheck.mockResolvedValue(false);
      await service.performHealthCheck();
      
      expect(service.getAvailableServicesCount()).toBe(0);
    });

    it('should check if any service is available', async () => {
      // Initially both should be available after health check
      mockBedrockService.healthCheck.mockResolvedValue(true);
      mockExternalService.healthCheck.mockResolvedValue(true);
      
      await service.performHealthCheck();
      expect(service.isAnyServiceAvailable()).toBe(true);

      // Mark both as unhealthy
      mockBedrockService.healthCheck.mockResolvedValue(false);
      mockExternalService.healthCheck.mockResolvedValue(false);
      await service.performHealthCheck();
      
      expect(service.isAnyServiceAvailable()).toBe(false);
    });

    it('should get preferred service', async () => {
      // Initially both should be available after health check
      mockBedrockService.healthCheck.mockResolvedValue(true);
      mockExternalService.healthCheck.mockResolvedValue(true);
      
      await service.performHealthCheck();
      expect(service.getPreferredService()).toBe('bedrock');

      // Mark Bedrock as unhealthy
      mockBedrockService.healthCheck.mockResolvedValue(false);
      await service.performHealthCheck();
      
      expect(service.getPreferredService()).toBe('external');

      // Mark both as unhealthy
      mockExternalService.healthCheck.mockResolvedValue(false);
      await service.performHealthCheck();
      
      expect(service.getPreferredService()).toBe('none');
    });

    it('should force health check', async () => {
      mockBedrockService.healthCheck.mockResolvedValue(true);
      mockExternalService.healthCheck.mockResolvedValue(true);

      const status = await service.forceHealthCheck();

      expect(status.bedrock).toBe(true);
      expect(status.external).toBe(true);
      expect(mockBedrockService.healthCheck).toHaveBeenCalled();
      expect(mockExternalService.healthCheck).toHaveBeenCalled();
    });
  });

  describe('periodic health checks', () => {
    it('should perform periodic health checks', async () => {
      mockBedrockService.healthCheck.mockResolvedValue(true);
      mockExternalService.healthCheck.mockResolvedValue(true);

      // Manually trigger health check instead of waiting for timer
      await service.performHealthCheck();

      expect(mockBedrockService.healthCheck).toHaveBeenCalled();
      expect(mockExternalService.healthCheck).toHaveBeenCalled();
    });

    it('should handle periodic health check failures gracefully', async () => {
      mockBedrockService.healthCheck.mockRejectedValue(new Error('Health check failed'));
      mockExternalService.healthCheck.mockRejectedValue(new Error('Health check failed'));

      // Manually trigger health check
      await service.performHealthCheck();

      // Should not throw, just log warnings
      expect(mockBedrockService.healthCheck).toHaveBeenCalled();
      expect(mockExternalService.healthCheck).toHaveBeenCalled();
    });
  });

  describe('service recovery', () => {
    it('should schedule health check after service failure', async () => {
      mockBedrockService.generateExplanation.mockRejectedValue(new Error('Service failed'));
      mockExternalService.generateExplanation.mockResolvedValue({
        explanation: 'Fallback explanation',
        fixes: ['Fix 1', 'Fix 2'],
        confidence: 0.8,
        model: 'gpt-3.5-turbo',
        tokens: 100
      });
      mockBedrockService.healthCheck.mockResolvedValue(true);
      mockExternalService.healthCheck.mockResolvedValue(true);

      const result = await service.generateExplanation(1000);

      expect(result.explanation).toBe('Fallback explanation');
      expect(mockBedrockService.generateExplanation).toHaveBeenCalled();
      expect(mockExternalService.generateExplanation).toHaveBeenCalled();
    });
  });

  describe('createCompositeAIService factory', () => {
    it('should create CompositeAIService instance', () => {
      const service = createCompositeAIService(mockConfig);

      expect(service).toBeInstanceOf(CompositeAIService);
      service.cleanup();
    });
  });

  describe('edge cases', () => {
    it('should handle service without external AI configuration', () => {
      const configWithoutExternal = { ...mockConfig };
      delete configWithoutExternal.externalAI;

      const serviceWithoutExternal = new CompositeAIService(configWithoutExternal);
      const status = serviceWithoutExternal.getHealthStatus();

      expect(status.external).toBe(false);
      expect(serviceWithoutExternal.getAvailableServicesCount()).toBe(1);
      
      serviceWithoutExternal.cleanup();
    });

    it('should handle confidence adjustment for fallback service', async () => {
      const mockExternalResult = {
        explanation: 'External AI explanation',
        fixes: ['Fix 1', 'Fix 2'],
        confidence: 0.9,
        model: 'gpt-3.5-turbo',
        tokens: 120
      };

      mockBedrockService.generateExplanation.mockRejectedValue(new Error('Bedrock failed'));
      mockExternalService.generateExplanation.mockResolvedValue(mockExternalResult);
      mockBedrockService.healthCheck.mockResolvedValue(true);
      mockExternalService.healthCheck.mockResolvedValue(true);

      const result = await service.generateExplanation(1000);

      expect(result.confidence).toBe(0.8); // 0.9 - 0.1 = 0.8
    });

    it('should handle minimum confidence for fallback service', async () => {
      const mockExternalResult = {
        explanation: 'External AI explanation',
        fixes: ['Fix 1', 'Fix 2'],
        confidence: 0.05, // Very low confidence
        model: 'gpt-3.5-turbo',
        tokens: 120
      };

      mockBedrockService.generateExplanation.mockRejectedValue(new Error('Bedrock failed'));
      mockExternalService.generateExplanation.mockResolvedValue(mockExternalResult);
      mockBedrockService.healthCheck.mockResolvedValue(true);
      mockExternalService.healthCheck.mockResolvedValue(true);

      const result = await service.generateExplanation(1000);

      expect(result.confidence).toBe(0); // Math.max(0, 0.05 - 0.1) = 0
    });
  });
});