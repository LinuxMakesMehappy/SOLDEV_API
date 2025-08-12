/**
 * Unit tests for External AI service
 * Requirement 3.5: Write unit tests for fallback scenarios and external API integration
 */

import { ExternalAIService, createExternalAIService } from '../../src/services/external-ai-service';
import { ValidatedEnvironmentConfig } from '../../src/types/environment';

// Mock fetch globally
global.fetch = jest.fn();

describe('ExternalAIService', () => {
  let service: ExternalAIService;
  let mockConfig: ValidatedEnvironmentConfig;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

    // Mock configuration
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

    service = new ExternalAIService(mockConfig);
  });

  afterEach(() => {
    // Clean up
  });

  describe('constructor', () => {
    it('should initialize with external AI configuration', () => {
      expect(service).toBeInstanceOf(ExternalAIService);
    });

    it('should throw error when external AI config is missing', () => {
      const configWithoutExternalAI = { ...mockConfig };
      delete configWithoutExternalAI.externalAI;

      expect(() => new ExternalAIService(configWithoutExternalAI)).toThrow('External AI configuration is required');
    });
  });

  describe('generateExplanation', () => {
    it('should generate explanation for standard error code', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              explanation: 'This error indicates that the instruction data provided is invalid or malformed',
              fixes: [
                'Verify instruction data serialization matches program expectations',
                'Check that all required parameters are provided',
                'Use anchor test to validate instruction format'
              ]
            })
          }
        }]
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const result = await service.generateExplanation(1);

      expect(result).toEqual({
        explanation: 'This error indicates that the instruction data provided is invalid or malformed',
        fixes: [
          'Verify instruction data serialization matches program expectations',
          'Check that all required parameters are provided',
          'Use anchor test to validate instruction format'
        ],
        confidence: expect.any(Number),
        model: 'gpt-3.5-turbo',
        tokens: expect.any(Number)
      });

      expect(result.confidence).toBeGreaterThan(0.6);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should generate explanation with context', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              explanation: 'Context-aware explanation for token transfer error',
              fixes: [
                'Check token account balance',
                'Verify token mint authority'
              ]
            })
          }
        }]
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const result = await service.generateExplanation(6000, 'Token transfer operation');

      expect(result.explanation).toContain('Context-aware explanation');
      expect(result.fixes).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
            'Content-Type': 'application/json'
          }),
          body: expect.stringContaining('Token transfer operation')
        })
      );
    });

    it('should handle non-JSON response format', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: `Explanation: This is a custom error from your Solana program
            Fix 1: Check the program logs for more details
            Fix 2: Verify account states before transaction`
          }
        }]
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const result = await service.generateExplanation(7500);

      expect(result.explanation).toContain('custom error');
      expect(result.fixes).toHaveLength(2);
      expect(result.confidence).toBeLessThan(0.7); // Lower confidence for non-JSON
    });

    it('should pad fixes if less than 2 provided', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              explanation: 'Error explanation',
              fixes: ['Only one fix provided']
            })
          }
        }]
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const result = await service.generateExplanation(1000);

      expect(result.fixes).toHaveLength(2);
      expect(result.fixes[1]).toBe('Check Solana program logs for additional context');
    });

    it('should limit fixes to maximum of 3', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              explanation: 'Error explanation',
              fixes: [
                'Fix 1',
                'Fix 2', 
                'Fix 3',
                'Fix 4',
                'Fix 5'
              ]
            })
          }
        }]
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const result = await service.generateExplanation(1000);

      expect(result.fixes).toHaveLength(3);
    });

    it('should handle API timeout', async () => {
      // Mock a timeout by rejecting after delay
      mockFetch.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), 100)
        )
      );

      await expect(service.generateExplanation(1000)).rejects.toThrow('External AI service failed after 3 attempts');
    });

    it('should handle HTTP error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { message: 'Invalid API key' } })
      } as Response);

      await expect(service.generateExplanation(1000)).rejects.toThrow('External AI API error (401): Invalid API key');
    });

    it('should handle API error responses', async () => {
      const mockResponse = {
        error: {
          message: 'Rate limit exceeded',
          type: 'rate_limit_error'
        }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      } as Response);

      await expect(service.generateExplanation(1000)).rejects.toThrow('External AI API error: Rate limit exceeded');
    });

    it('should handle empty response', async () => {
      const mockResponse = {
        choices: []
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const result = await service.generateExplanation(1000);

      // Should fallback to default response
      expect(result.explanation).toContain('Error code 1000');
      expect(result.fixes).toHaveLength(2);
    });

    it('should retry on transient errors', async () => {
      // Create fresh service to avoid interference
      const freshService = new ExternalAIService(mockConfig);
      
      // First two calls fail, third succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Service unavailable'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: JSON.stringify({
                  explanation: 'Success after retry',
                  fixes: ['Fix 1', 'Fix 2']
                })
              }
            }]
          })
        } as Response);

      const result = await freshService.generateExplanation(1000);

      expect(result.explanation).toBe('Success after retry');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry on authentication errors', async () => {
      const freshService = new ExternalAIService(mockConfig);
      mockFetch.mockRejectedValue(new Error('Invalid API key'));

      await expect(freshService.generateExplanation(1000)).rejects.toThrow('Invalid API key');
      expect(mockFetch).toHaveBeenCalledTimes(1); // No retries
    });

    it('should fail after max retries', async () => {
      // Create a fresh service to avoid interference from previous tests
      const freshService = new ExternalAIService(mockConfig);
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(freshService.generateExplanation(1000)).rejects.toThrow('External AI service failed after 3 attempts');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should calculate higher confidence for quality responses', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              explanation: 'This is a detailed Solana-specific error explanation that mentions Anchor framework specifics',
              fixes: [
                'Use anchor test to validate your program',
                'Check solana logs for transaction details',
                'Verify account initialization'
              ]
            })
          }
        }]
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const result = await service.generateExplanation(1000);

      expect(result.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('rate limiting', () => {
    it('should track rate limit state', () => {
      const status = service.getRateLimitStatus();
      
      expect(status).toHaveProperty('requests');
      expect(status).toHaveProperty('resetTime');
      expect(status).toHaveProperty('isLimited');
      expect(status.requests).toBe(0);
      expect(status.isLimited).toBe(false);
    });

    it('should enforce rate limits', async () => {
      // Mock successful responses
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                explanation: 'Test explanation',
                fixes: ['Fix 1', 'Fix 2']
              })
            }
          }]
        })
      } as Response);

      // Make 60 requests to hit rate limit
      const promises = [];
      for (let i = 0; i < 60; i++) {
        promises.push(service.generateExplanation(i));
      }
      await Promise.all(promises);

      // 61st request should be rate limited
      await expect(service.generateExplanation(61)).rejects.toThrow('Rate limit exceeded');
    });

    it('should reset rate limit after time window', async () => {
      jest.useFakeTimers();
      
      // Mock successful response
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                explanation: 'Test explanation',
                fixes: ['Fix 1', 'Fix 2']
              })
            }
          }]
        })
      } as Response);

      // Hit rate limit
      const promises = [];
      for (let i = 0; i < 60; i++) {
        promises.push(service.generateExplanation(i));
      }
      await Promise.all(promises);

      // Should be rate limited
      await expect(service.generateExplanation(61)).rejects.toThrow('Rate limit exceeded');

      // Fast-forward time by 1 minute
      jest.advanceTimersByTime(60000);

      // Should work again after reset
      const result = await service.generateExplanation(62);
      expect(result.explanation).toBe('Test explanation');
      
      jest.useRealTimers();
    });
  });

  describe('healthCheck', () => {
    it('should return true when service is healthy', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                explanation: 'Health check response',
                fixes: ['Fix 1', 'Fix 2']
              })
            }
          }]
        })
      } as Response);

      const result = await service.healthCheck();

      expect(result).toBe(true);
    });

    it('should return false when service is unhealthy', async () => {
      const freshService = new ExternalAIService(mockConfig);
      mockFetch.mockRejectedValue(new Error('Service error'));

      const result = await freshService.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('createExternalAIService factory', () => {
    it('should create ExternalAIService instance', () => {
      const service = createExternalAIService(mockConfig);

      expect(service).toBeInstanceOf(ExternalAIService);
    });
  });

  describe('error handling edge cases', () => {
    it('should handle malformed JSON in response', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Invalid JSON: { explanation: "test" fixes: ["fix1"] }'
          }
        }]
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const result = await service.generateExplanation(1000);

      // Should fallback to text parsing - the content doesn't contain "Error code 1000"
      expect(result.explanation).toBeTruthy();
      expect(result.fixes).toHaveLength(2);
    });

    it('should handle network errors', async () => {
      const freshService = new ExternalAIService(mockConfig);
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(freshService.generateExplanation(1000)).rejects.toThrow('External AI service failed after 3 attempts');
    });

    it('should handle response parsing errors', async () => {
      const freshService = new ExternalAIService(mockConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        json: async () => { throw new Error('Invalid JSON'); }
      } as any);

      await expect(freshService.generateExplanation(1000)).rejects.toThrow('External AI service failed after 3 attempts');
    });
  });

  describe('prompt building', () => {
    it('should build correct prompt structure', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                explanation: 'Test explanation',
                fixes: ['Fix 1', 'Fix 2']
              })
            }
          }]
        })
      } as Response);

      await service.generateExplanation(1000);

      const call = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(call?.[1]?.body as string);
      
      expect(requestBody.model).toBe('gpt-3.5-turbo');
      expect(requestBody.max_tokens).toBe(1000);
      expect(requestBody.temperature).toBe(0.3);
      expect(requestBody.messages[0].role).toBe('user');
      expect(requestBody.messages[0].content).toContain('Error Code: 1000');
      expect(requestBody.messages[0].content).toContain('Solana blockchain developer assistant');
    });
  });
});