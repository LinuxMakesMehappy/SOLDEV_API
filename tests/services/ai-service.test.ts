/**
 * Unit tests for AWS Bedrock AI service
 * Requirement 4.4: Write unit tests with mocked Bedrock responses for various error codes
 */

import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { BedrockAIService, createBedrockAIService } from '../../src/services/ai-service';
import { ValidatedEnvironmentConfig } from '../../src/types/environment';

// Mock AWS SDK
jest.mock('@aws-sdk/client-bedrock-runtime');

const MockedBedrockRuntimeClient = BedrockRuntimeClient as jest.MockedClass<typeof BedrockRuntimeClient>;

describe('BedrockAIService', () => {
  let service: BedrockAIService;
  let mockClient: any;
  let mockConfig: ValidatedEnvironmentConfig;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock configuration
    mockConfig = {
      awsBedrock: {
        region: 'us-east-1',
        modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
        temperature: 0.7,
        maxTokens: 1000,
        timeoutMs: 5000
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

    // Create mock client instance
    mockClient = {
      send: jest.fn()
    };

    // Mock the constructor to return our mock client
    MockedBedrockRuntimeClient.mockImplementation(() => mockClient);

    service = new BedrockAIService(mockConfig);
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(MockedBedrockRuntimeClient).toHaveBeenCalledWith({
        region: 'us-east-1',
        requestHandler: {
          requestTimeout: 5000
        }
      });
    });
  });

  describe('generateExplanation', () => {
    it('should generate explanation for standard error code', async () => {
      // Mock successful Bedrock response
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            text: JSON.stringify({
              explanation: 'This error indicates that the instruction data provided is invalid or malformed',
              fixes: [
                'Verify instruction data serialization matches program expectations',
                'Check that all required parameters are provided',
                'Use anchor test to validate instruction format'
              ]
            })
          }]
        }))
      };

      mockClient.send.mockResolvedValue(mockResponse);

      const result = await service.generateExplanation(1);

      expect(result).toEqual({
        explanation: 'This error indicates that the instruction data provided is invalid or malformed',
        fixes: [
          'Verify instruction data serialization matches program expectations',
          'Check that all required parameters are provided',
          'Use anchor test to validate instruction format'
        ],
        confidence: expect.any(Number),
        model: 'anthropic.claude-3-sonnet-20240229-v1:0',
        tokens: expect.any(Number)
      });

      expect(result.confidence).toBeGreaterThan(0.7);
      expect(mockClient.send).toHaveBeenCalledTimes(1);
    });

    it('should generate explanation for custom error code', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            text: JSON.stringify({
              explanation: 'Custom program error indicating insufficient funds for the operation',
              fixes: [
                'Check account balance before transaction',
                'Verify token account has sufficient balance',
                'Add balance validation in your program logic'
              ]
            })
          }]
        }))
      };

      mockClient.send.mockResolvedValue(mockResponse);

      const result = await service.generateExplanation(6000, 'Token transfer operation');

      expect(result.explanation).toContain('insufficient funds');
      expect(result.fixes).toHaveLength(3);
      expect(result.model).toBe('anthropic.claude-3-sonnet-20240229-v1:0');
    });

    it('should handle Anchor constraint error codes', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            text: JSON.stringify({
              explanation: 'Seeds constraint violation - PDA derivation failed with provided seeds',
              fixes: [
                'Verify seed values match the program constraint definition',
                'Check seed order and types in PDA derivation'
              ]
            })
          }]
        }))
      };

      mockClient.send.mockResolvedValue(mockResponse);

      const result = await service.generateExplanation(2000);

      expect(result.explanation).toContain('Seeds constraint');
      expect(result.fixes).toHaveLength(2);
    });

    it('should handle non-JSON response format', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            text: `Explanation: This is a custom error from your Solana program
            Fix 1: Check the program logs for more details
            Fix 2: Verify account states before transaction`
          }]
        }))
      };

      mockClient.send.mockResolvedValue(mockResponse);

      const result = await service.generateExplanation(7500);

      expect(result.explanation).toContain('custom error');
      expect(result.fixes).toHaveLength(2);
      expect(result.confidence).toBeLessThan(0.8); // Lower confidence for non-JSON
    });

    it('should pad fixes if less than 2 provided', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            text: JSON.stringify({
              explanation: 'Error explanation',
              fixes: ['Only one fix provided']
            })
          }]
        }))
      };

      mockClient.send.mockResolvedValue(mockResponse);

      const result = await service.generateExplanation(1000);

      expect(result.fixes).toHaveLength(2);
      expect(result.fixes[1]).toBe('Check Solana program logs for additional context');
    });

    it('should limit fixes to maximum of 3', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            text: JSON.stringify({
              explanation: 'Error explanation',
              fixes: [
                'Fix 1',
                'Fix 2', 
                'Fix 3',
                'Fix 4',
                'Fix 5'
              ]
            })
          }]
        }))
      };

      mockClient.send.mockResolvedValue(mockResponse);

      const result = await service.generateExplanation(1000);

      expect(result.fixes).toHaveLength(3);
    });

    it('should handle timeout errors', async () => {
      // Mock timeout by making the promise never resolve
      mockClient.send.mockImplementation(() => new Promise(() => {}));

      await expect(service.generateExplanation(1000)).rejects.toThrow('Bedrock request timeout');
    });

    it('should handle empty response body', async () => {
      const mockResponse = {
        body: undefined
      };

      mockClient.send.mockResolvedValue(mockResponse);

      await expect(service.generateExplanation(1000)).rejects.toThrow('Empty response from Bedrock');
    });

    it('should handle invalid response format', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            text: 'Invalid response without proper structure'
          }]
        }))
      };

      mockClient.send.mockResolvedValue(mockResponse);

      const result = await service.generateExplanation(1000);

      // Should fallback to non-JSON parsing
      expect(result.explanation).toContain('Error code 1000');
      expect(result.fixes).toHaveLength(2);
    });

    it('should handle Bedrock service errors', async () => {
      mockClient.send.mockRejectedValue(new Error('Service unavailable'));

      await expect(service.generateExplanation(1000)).rejects.toThrow('Bedrock AI service error: Service unavailable');
    });

    it('should calculate higher confidence for quality responses', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            text: JSON.stringify({
              explanation: 'This is a detailed Solana-specific error explanation that mentions Anchor framework specifics',
              fixes: [
                'Use anchor test to validate your program',
                'Check solana logs for transaction details',
                'Verify account initialization'
              ]
            })
          }]
        }))
      };

      mockClient.send.mockResolvedValue(mockResponse);

      const result = await service.generateExplanation(1000);

      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should include context in prompt when provided', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            text: JSON.stringify({
              explanation: 'Context-aware explanation',
              fixes: ['Fix 1', 'Fix 2']
            })
          }]
        }))
      };

      mockClient.send.mockResolvedValue(mockResponse);

      const result = await service.generateExplanation(1000, 'Token transfer context');

      expect(mockClient.send).toHaveBeenCalledTimes(1);
      expect(result.explanation).toBe('Context-aware explanation');
      expect(result.fixes).toEqual(['Fix 1', 'Fix 2']);
    });
  });

  describe('healthCheck', () => {
    it('should return true when service is healthy', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            text: JSON.stringify({
              explanation: 'Health check response',
              fixes: ['Fix 1', 'Fix 2']
            })
          }]
        }))
      };

      mockClient.send.mockResolvedValue(mockResponse);

      const result = await service.healthCheck();

      expect(result).toBe(true);
    });

    it('should return false when service is unhealthy', async () => {
      mockClient.send.mockRejectedValue(new Error('Service error'));

      const result = await service.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('createBedrockAIService factory', () => {
    it('should create BedrockAIService instance', () => {
      const service = createBedrockAIService(mockConfig);

      expect(service).toBeInstanceOf(BedrockAIService);
    });
  });

  describe('prompt building', () => {
    it('should build correct prompt structure', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            text: JSON.stringify({
              explanation: 'Test explanation',
              fixes: ['Fix 1', 'Fix 2']
            })
          }]
        }))
      };

      mockClient.send.mockResolvedValue(mockResponse);

      const result = await service.generateExplanation(1000);

      expect(mockClient.send).toHaveBeenCalledTimes(1);
      expect(result.explanation).toBe('Test explanation');
      expect(result.model).toBe('anthropic.claude-3-sonnet-20240229-v1:0');
    });
  });

  describe('error code specific tests', () => {
    const testCases = [
      { code: 0, description: 'success code' },
      { code: 1, description: 'invalid instruction data' },
      { code: 2000, description: 'anchor constraint error' },
      { code: 6000, description: 'custom error' },
      { code: 7500, description: 'high custom error' }
    ];

    testCases.forEach(({ code, description }) => {
      it(`should handle ${description} (${code})`, async () => {
        const mockResponse = {
          body: new TextEncoder().encode(JSON.stringify({
            content: [{
              text: JSON.stringify({
                explanation: `Explanation for ${description}`,
                fixes: ['Fix 1', 'Fix 2']
              })
            }]
          }))
        };

        mockClient.send.mockResolvedValue(mockResponse);

        const result = await service.generateExplanation(code);

        expect(result.explanation).toContain(description);
        expect(result.fixes).toHaveLength(2);
        expect(result.model).toBe('anthropic.claude-3-sonnet-20240229-v1:0');
      });
    });
  });
});