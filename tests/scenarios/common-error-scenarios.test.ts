/**
 * Comprehensive test suite for common error scenarios
 * Requirements: 4.1, 4.2, 4.3, 4.4 - Testing common Anchor error codes, standard Solana errors, 
 * Anchor constraint errors, and custom error scenarios
 */

import { ErrorExplanationService } from '../../src/services/error-explanation-service';
import { ValidatedEnvironmentConfig } from '../../src/types/environment';
import { ErrorExplanation } from '../../src/types/api';
import { StaticErrorDatabase } from '../../src/services/static-error-database';

// Mock external services for controlled testing
jest.mock('../../src/services/cache-service');
jest.mock('../../src/services/fallback-service');

import { CompositeCacheService } from '../../src/services/cache-service';
import { FallbackService } from '../../src/services/fallback-service';

const MockedCompositeCacheService = CompositeCacheService as jest.MockedClass<typeof CompositeCacheService>;
const MockedFallbackService = FallbackService as jest.MockedClass<typeof FallbackService>;

describe('Common Error Scenarios Test Suite', () => {
  let service: ErrorExplanationService;
  let mockCacheService: jest.Mocked<CompositeCacheService>;
  let mockFallbackService: jest.Mocked<FallbackService>;
  let testConfig: ValidatedEnvironmentConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    testConfig = {
      awsBedrock: {
        region: 'us-east-1',
        modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
        temperature: 0.1,
        maxTokens: 1000,
        timeoutMs: 5000
      },
      cache: {
        tableName: 'test-error-cache',
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

    mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      getStatus: jest.fn().mockReturnValue({ primaryHealthy: true, fallbackSize: 0 })
    } as any;

    mockFallbackService = {
      explainError: jest.fn(),
      getServiceStats: jest.fn().mockReturnValue({
        aiAvailable: true,
        staticAvailable: true,
        consecutiveAIFailures: 0,
        lastAIAttempt: Date.now(),
        aiServicesCount: 1,
        preferredAIService: 'bedrock',
        staticErrorCodesCount: 10
      }),
      cleanup: jest.fn()
    } as any;

    MockedCompositeCacheService.mockImplementation(() => mockCacheService);
    MockedFallbackService.mockImplementation(() => mockFallbackService);

    service = new ErrorExplanationService(testConfig);
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('Standard Solana Errors (Requirement 4.2)', () => {
    /**
     * Test standard Solana errors (0, 1, 100) with expected static responses
     */
    
    it('should handle error code 0 (Success) correctly', async () => {
      // Arrange
      const errorCode = 0;
      mockCacheService.get.mockResolvedValue(null);
      
      // Use static database response for success
      const expectedResponse = StaticErrorDatabase.getStaticExplanation(errorCode);
      mockFallbackService.explainError.mockResolvedValue(expectedResponse!);

      // Act
      const result = await service.explainError(errorCode);

      // Assert
      expect(result.code).toBe(0);
      expect(result.explanation).toContain('Operation completed successfully');
      expect(result.fixes).toContain('No action needed - this indicates successful execution');
      expect(result.source).toBe('static');
      expect(mockFallbackService.explainError).toHaveBeenCalledWith(
        0,
        expect.stringContaining('Error type: standard')
      );
    });

    it('should handle error code 1 (InvalidInstructionData) correctly', async () => {
      // Arrange
      const errorCode = 1;
      mockCacheService.get.mockResolvedValue(null);
      
      const expectedResponse = StaticErrorDatabase.getStaticExplanation(errorCode);
      mockFallbackService.explainError.mockResolvedValue(expectedResponse!);

      // Act
      const result = await service.explainError(errorCode);

      // Assert
      expect(result.code).toBe(1);
      expect(result.explanation).toContain('instruction data provided is invalid');
      expect(result.fixes).toContain('Verify instruction data serialization matches program expectations');
      expect(result.fixes.some(fix => fix.includes('anchor test'))).toBe(true);
      expect(result.source).toBe('static');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should handle error code 100 (InstructionMissing) correctly', async () => {
      // Arrange
      const errorCode = 100;
      mockCacheService.get.mockResolvedValue(null);
      
      const expectedResponse = StaticErrorDatabase.getStaticExplanation(errorCode);
      mockFallbackService.explainError.mockResolvedValue(expectedResponse!);

      // Act
      const result = await service.explainError(errorCode);

      // Assert
      expect(result.code).toBe(100);
      expect(result.explanation).toContain('required instruction is missing');
      expect(result.fixes.some(fix => fix.includes('Review transaction structure'))).toBe(true);
      expect(result.fixes.some(fix => fix.includes('solana logs'))).toBe(true);
      expect(result.source).toBe('static');
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('Anchor Constraint Errors (Requirement 4.3)', () => {
    /**
     * Test Anchor constraint errors (2000, 2001, 2002) with expected responses
     */

    it('should handle error code 2000 (ConstraintSeeds) correctly', async () => {
      // Arrange
      const errorCode = 2000;
      mockCacheService.get.mockResolvedValue(null);
      
      const expectedResponse = StaticErrorDatabase.getStaticExplanation(errorCode);
      mockFallbackService.explainError.mockResolvedValue(expectedResponse!);

      // Act
      const result = await service.explainError(errorCode);

      // Assert
      expect(result.code).toBe(2000);
      expect(result.explanation).toContain('Seeds constraint violation');
      expect(result.explanation).toContain('PDA');
      expect(result.fixes).toContain('Verify seed values exactly match the program constraint definition');
      expect(result.fixes.some(fix => fix.includes('findProgramAddress'))).toBe(true);
      expect(result.source).toBe('static');
      expect(mockFallbackService.explainError).toHaveBeenCalledWith(
        2000,
        expect.stringContaining('Error type: anchor_constraint')
      );
    });

    it('should handle error code 2001 (ConstraintHasOne) correctly', async () => {
      // Arrange
      const errorCode = 2001;
      mockCacheService.get.mockResolvedValue(null);
      
      const expectedResponse = StaticErrorDatabase.getStaticExplanation(errorCode);
      mockFallbackService.explainError.mockResolvedValue(expectedResponse!);

      // Act
      const result = await service.explainError(errorCode);

      // Assert
      expect(result.code).toBe(2001);
      expect(result.explanation).toContain('HasOne constraint violation');
      expect(result.explanation).toContain('account relationship check failed');
      expect(result.fixes.some(fix => fix.includes('relationship field'))).toBe(true);
      expect(result.fixes.some(fix => fix.includes('correct related account'))).toBe(true);
      expect(result.source).toBe('static');
    });

    it('should handle error code 2002 (ConstraintSigner) correctly', async () => {
      // Arrange
      const errorCode = 2002;
      mockCacheService.get.mockResolvedValue(null);
      
      const expectedResponse = StaticErrorDatabase.getStaticExplanation(errorCode);
      mockFallbackService.explainError.mockResolvedValue(expectedResponse!);

      // Act
      const result = await service.explainError(errorCode);

      // Assert
      expect(result.code).toBe(2002);
      expect(result.explanation).toContain('Signer constraint violation');
      expect(result.explanation).toContain('signature');
      expect(result.fixes.some(fix => fix.includes('marked as a signer'))).toBe(true);
      expect(result.fixes.some(fix => fix.includes('signing process'))).toBe(true);
      expect(result.source).toBe('static');
    });

    it('should handle additional Anchor constraint errors (2003, 2004)', async () => {
      const constraintErrors = [
        { code: 2003, name: 'ConstraintMut' },
        { code: 2004, name: 'ConstraintOwner' }
      ];

      for (const errorCase of constraintErrors) {
        // Arrange
        mockCacheService.get.mockResolvedValue(null);
        
        const expectedResponse = StaticErrorDatabase.getStaticExplanation(errorCase.code);
        mockFallbackService.explainError.mockResolvedValue(expectedResponse!);

        // Act
        const result = await service.explainError(errorCase.code);

        // Assert
        expect(result.code).toBe(errorCase.code);
        expect(result.explanation).toContain('constraint violation');
        expect(result.source).toBe('static');
        expect(result.fixes.length).toBeGreaterThan(0);

        // Reset mocks for next iteration
        jest.clearAllMocks();
        MockedCompositeCacheService.mockImplementation(() => mockCacheService);
        MockedFallbackService.mockImplementation(() => mockFallbackService);
      }
    });
  });

  describe('Custom Error Scenarios with Mocked AI Responses (Requirement 4.4)', () => {
    /**
     * Test custom error scenarios (6000+) with mocked AI responses
     */

    it('should handle error code 6000 (Insufficient Funds) with AI response', async () => {
      // Arrange
      const errorCode = 6000;
      const mockAIResponse: ErrorExplanation = {
        code: errorCode,
        explanation: 'Insufficient funds error - the account doesn\'t have enough balance for the requested operation. This is a common error in DeFi applications when trying to transfer or spend more tokens than available.',
        fixes: [
          'Check account balance before attempting the transaction using getBalance() or getTokenAccountBalance()',
          'Verify token account has sufficient balance for the operation including fees',
          'Add balance validation logic in your program before processing transfers',
          'Consider implementing slippage protection for variable-amount operations'
        ],
        source: 'ai',
        confidence: 0.92
      };

      mockCacheService.get.mockResolvedValue(null);
      mockFallbackService.explainError.mockResolvedValue(mockAIResponse);

      // Act
      const result = await service.explainError(errorCode);

      // Assert
      expect(result.code).toBe(6000);
      expect(result.explanation).toContain('Insufficient funds');
      expect(result.explanation).toContain('DeFi applications');
      expect(result.fixes.some(fix => fix.includes('Check account balance'))).toBe(true);
      expect(result.fixes.some(fix => fix.includes('balance validation'))).toBe(true);
      expect(result.source).toBe('ai');
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(mockFallbackService.explainError).toHaveBeenCalledWith(
        6000,
        expect.stringContaining('Error type: custom')
      );
    });

    it('should handle error code 6001 (Unauthorized Access) with AI response', async () => {
      // Arrange
      const errorCode = 6001;
      const mockAIResponse: ErrorExplanation = {
        code: errorCode,
        explanation: 'Unauthorized access attempt - the caller doesn\'t have permission to perform this operation. This typically occurs when an account tries to execute a privileged instruction without proper authority.',
        fixes: [
          'Verify the correct authority account is being used as a signer',
          'Check access control permissions and roles in the program',
          'Ensure the signer has the required privileges for this specific action',
          'Review program documentation for required authority patterns'
        ],
        source: 'ai',
        confidence: 0.89
      };

      mockCacheService.get.mockResolvedValue(null);
      mockFallbackService.explainError.mockResolvedValue(mockAIResponse);

      // Act
      const result = await service.explainError(errorCode);

      // Assert
      expect(result.code).toBe(6001);
      expect(result.explanation).toContain('Unauthorized access');
      expect(result.explanation).toContain('privileged instruction');
      expect(result.fixes.some(fix => fix.includes('authority account'))).toBe(true);
      expect(result.fixes.some(fix => fix.includes('access control'))).toBe(true);
      expect(result.source).toBe('ai');
    });

    it('should handle error code 6002 (Invalid Account State) with AI response', async () => {
      // Arrange
      const errorCode = 6002;
      const mockAIResponse: ErrorExplanation = {
        code: errorCode,
        explanation: 'Invalid account state - the account is not in the expected state for this operation. This often happens when trying to use an account before proper initialization or after it has been closed.',
        fixes: [
          'Check the account\'s current state and initialization status',
          'Verify account setup and prerequisite operations have been completed',
          'Ensure the account hasn\'t been closed or deactivated',
          'Add state validation checks before performing operations'
        ],
        source: 'ai',
        confidence: 0.87
      };

      mockCacheService.get.mockResolvedValue(null);
      mockFallbackService.explainError.mockResolvedValue(mockAIResponse);

      // Act
      const result = await service.explainError(errorCode);

      // Assert
      expect(result.code).toBe(6002);
      expect(result.explanation).toContain('Invalid account state');
      expect(result.explanation).toContain('initialization');
      expect(result.fixes.some(fix => fix.includes('current state'))).toBe(true);
      expect(result.source).toBe('ai');
    });

    it('should handle error code 6003 (Arithmetic Overflow) with AI response', async () => {
      // Arrange
      const errorCode = 6003;
      const mockAIResponse: ErrorExplanation = {
        code: errorCode,
        explanation: 'Arithmetic overflow or underflow occurred during calculation. This happens when mathematical operations exceed the maximum or minimum values for the data type being used.',
        fixes: [
          'Add overflow/underflow checks before arithmetic operations using checked_add(), checked_sub(), etc.',
          'Use appropriate data types that can handle the expected value ranges',
          'Validate input ranges to prevent overflow conditions before calculations',
          'Consider using BigInt or decimal libraries for high-precision calculations'
        ],
        source: 'ai',
        confidence: 0.94
      };

      mockCacheService.get.mockResolvedValue(null);
      mockFallbackService.explainError.mockResolvedValue(mockAIResponse);

      // Act
      const result = await service.explainError(errorCode);

      // Assert
      expect(result.code).toBe(6003);
      expect(result.explanation).toContain('Arithmetic overflow');
      expect(result.explanation).toContain('mathematical operations');
      expect(result.fixes.some(fix => fix.includes('checked_add'))).toBe(true);
      expect(result.fixes.some(fix => fix.includes('BigInt'))).toBe(true);
      expect(result.source).toBe('ai');
    });

    it('should handle error code 6007 (Token Mint Mismatch) with AI response', async () => {
      // Arrange
      const errorCode = 6007;
      const mockAIResponse: ErrorExplanation = {
        code: errorCode,
        explanation: 'Token mint or token account mismatch error. This occurs when a token account doesn\'t belong to the expected mint, or when the wrong token program is being used.',
        fixes: [
          'Verify token account belongs to the expected mint address',
          'Check token mint address matches program expectations and configuration',
          'Ensure correct token program is being used (Token Program vs Token-2022)',
          'Validate token account and mint relationship before operations'
        ],
        source: 'ai',
        confidence: 0.91
      };

      mockCacheService.get.mockResolvedValue(null);
      mockFallbackService.explainError.mockResolvedValue(mockAIResponse);

      // Act
      const result = await service.explainError(errorCode);

      // Assert
      expect(result.code).toBe(6007);
      expect(result.explanation).toContain('Token mint');
      expect(result.explanation).toContain('mismatch');
      expect(result.fixes.some(fix => fix.includes('token account belongs'))).toBe(true);
      expect(result.fixes.some(fix => fix.includes('Token-2022'))).toBe(true);
      expect(result.source).toBe('ai');
    });
  });

  describe('Additional Common Error Scenarios (10+ total)', () => {
    /**
     * Test additional common error scenarios to meet the 10+ requirement
     */

    it('should handle high-frequency custom errors with appropriate AI responses', async () => {
      const commonCustomErrors = [
        {
          code: 6004,
          mockResponse: {
            explanation: 'Invalid timestamp or time-based constraint violation. The operation was attempted outside the allowed time window.',
            fixes: [
              'Check system clock and timestamp validity using Clock sysvar',
              'Verify time-based constraints are within acceptable ranges',
              'Ensure operation is performed within the allowed time window'
            ]
          }
        },
        {
          code: 6005,
          mockResponse: {
            explanation: 'Account already exists or duplicate initialization attempted. This prevents overwriting existing account data.',
            fixes: [
              'Check if account already exists before initialization',
              'Use different seeds or account derivation for multiple accounts',
              'Implement proper account existence validation logic'
            ]
          }
        },
        {
          code: 6008,
          mockResponse: {
            explanation: 'Slippage tolerance exceeded - the price or amount changed beyond acceptable limits during execution.',
            fixes: [
              'Increase slippage tolerance if market conditions are volatile',
              'Check current market prices before transaction execution',
              'Implement dynamic slippage calculation based on market conditions'
            ]
          }
        },
        {
          code: 6009,
          mockResponse: {
            explanation: 'Invalid oracle or price feed data. The price information is stale, corrupted, or unavailable.',
            fixes: [
              'Verify oracle account is providing valid and fresh price data',
              'Check price feed staleness thresholds and update frequency',
              'Implement fallback price sources or validation mechanisms'
            ]
          }
        }
      ];

      for (const errorCase of commonCustomErrors) {
        // Arrange
        mockCacheService.get.mockResolvedValue(null);
        
        const aiResponse: ErrorExplanation = {
          code: errorCase.code,
          explanation: errorCase.mockResponse.explanation,
          fixes: errorCase.mockResponse.fixes,
          source: 'ai',
          confidence: 0.88
        };
        
        mockFallbackService.explainError.mockResolvedValue(aiResponse);

        // Act
        const result = await service.explainError(errorCase.code);

        // Assert
        expect(result.code).toBe(errorCase.code);
        expect(result.explanation).toBe(errorCase.mockResponse.explanation);
        expect(result.fixes).toEqual(errorCase.mockResponse.fixes);
        expect(result.source).toBe('ai');
        expect(result.confidence).toBeGreaterThan(0.8);

        // Reset mocks for next iteration
        jest.clearAllMocks();
        MockedCompositeCacheService.mockImplementation(() => mockCacheService);
        MockedFallbackService.mockImplementation(() => mockFallbackService);
      }
    });

    it('should handle edge case error codes with fallback responses', async () => {
      const edgeCaseErrors = [
        { code: 999, type: 'standard' },
        { code: 2999, type: 'anchor_constraint' },
        { code: 9999, type: 'custom' }
      ];

      for (const errorCase of edgeCaseErrors) {
        // Arrange
        mockCacheService.get.mockResolvedValue(null);
        
        // Mock fallback to generic response for unknown codes
        const fallbackResponse = StaticErrorDatabase.getGenericFallback(errorCase.code);
        mockFallbackService.explainError.mockResolvedValue(fallbackResponse);

        // Act
        const result = await service.explainError(errorCase.code);

        // Assert
        expect(result.code).toBe(errorCase.code);
        expect(result.source).toBe('static');
        expect(result.explanation).toContain(errorCase.code.toString());
        expect(result.fixes.length).toBeGreaterThan(0);
        expect(result.confidence).toBeLessThan(0.5); // Low confidence for generic fallbacks

        // Reset mocks for next iteration
        jest.clearAllMocks();
        MockedCompositeCacheService.mockImplementation(() => mockCacheService);
        MockedFallbackService.mockImplementation(() => mockFallbackService);
      }
    });
  });

  describe('Input Format Variations', () => {
    /**
     * Test different input formats (hex, decimal) for common error codes
     */

    it('should handle hex input format for common errors', async () => {
      const hexTestCases = [
        { hex: '0x0', decimal: 0 },
        { hex: '0x1', decimal: 1 },
        { hex: '0x7D0', decimal: 2000 },
        { hex: '0x1770', decimal: 6000 }
      ];

      for (const testCase of hexTestCases) {
        // Arrange
        mockCacheService.get.mockResolvedValue(null);
        
        const expectedResponse = StaticErrorDatabase.getStaticExplanation(testCase.decimal) ||
                                StaticErrorDatabase.getGenericFallback(testCase.decimal);
        mockFallbackService.explainError.mockResolvedValue(expectedResponse);

        // Act
        const result = await service.explainError(testCase.hex);

        // Assert
        expect(result.code).toBe(testCase.decimal);
        expect(mockFallbackService.explainError).toHaveBeenCalledWith(
          testCase.decimal,
          expect.stringContaining(`Original input: ${testCase.hex}`)
        );

        // Reset mocks for next iteration
        jest.clearAllMocks();
        MockedCompositeCacheService.mockImplementation(() => mockCacheService);
        MockedFallbackService.mockImplementation(() => mockFallbackService);
      }
    });

    it('should handle string numeric input for common errors', async () => {
      const stringTestCases = ['0', '1', '6000']; // Simplified test cases

      for (const stringCode of stringTestCases) {
        // Arrange
        const numericCode = parseInt(stringCode, 10);
        mockCacheService.get.mockResolvedValue(null);
        
        const expectedResponse = StaticErrorDatabase.getStaticExplanation(numericCode) ||
                                StaticErrorDatabase.getGenericFallback(numericCode);
        mockFallbackService.explainError.mockResolvedValue(expectedResponse);

        // Act
        const result = await service.explainError(stringCode);

        // Assert
        expect(result.code).toBe(numericCode);
        expect(result.explanation).toBeDefined();
        expect(result.fixes).toBeDefined();
        expect(result.fixes.length).toBeGreaterThan(0);

        // Reset mocks for next iteration
        jest.clearAllMocks();
        MockedCompositeCacheService.mockImplementation(() => mockCacheService);
        MockedFallbackService.mockImplementation(() => mockFallbackService);
      }
    });
  });

  describe('Performance and Caching for Common Scenarios', () => {
    /**
     * Test caching behavior for frequently requested error codes
     */

    it('should cache and retrieve common error explanations efficiently', async () => {
      const commonErrorCodes = [0, 1, 100, 2000, 2001, 2002, 6000, 6001];

      for (const errorCode of commonErrorCodes) {
        // Test cache miss scenario
        mockCacheService.get.mockResolvedValue(null);
        
        const mockResponse: ErrorExplanation = {
          code: errorCode,
          explanation: `Test explanation for error ${errorCode}`,
          fixes: [`Test fix for error ${errorCode}`],
          source: 'ai',
          confidence: 0.9
        };
        
        mockFallbackService.explainError.mockResolvedValue(mockResponse);

        // Act - First call (cache miss)
        await service.explainError(errorCode);

        // Assert - Cache should be populated
        expect(mockCacheService.set).toHaveBeenCalledWith(
          `error_${errorCode}`,
          mockResponse,
          3600
        );

        // Setup for cache hit scenario
        jest.clearAllMocks();
        MockedCompositeCacheService.mockImplementation(() => mockCacheService);
        MockedFallbackService.mockImplementation(() => mockFallbackService);
        
        mockCacheService.get.mockResolvedValue(mockResponse);

        // Act - Second call (cache hit)
        const result2 = await service.explainError(errorCode);

        // Assert - Should return cached result without calling fallback
        expect(result2.source).toBe('cache');
        expect(mockFallbackService.explainError).not.toHaveBeenCalled();
        expect(mockCacheService.set).not.toHaveBeenCalled();

        // Reset for next iteration
        jest.clearAllMocks();
        MockedCompositeCacheService.mockImplementation(() => mockCacheService);
        MockedFallbackService.mockImplementation(() => mockFallbackService);
      }
    });

    it('should handle concurrent requests for the same error code', async () => {
      // Arrange
      const errorCode = 6000;
      const mockResponse: ErrorExplanation = {
        code: errorCode,
        explanation: 'Concurrent test explanation',
        fixes: ['Concurrent test fix'],
        source: 'ai',
        confidence: 0.9
      };

      mockCacheService.get.mockResolvedValue(null);
      mockFallbackService.explainError.mockResolvedValue(mockResponse);

      // Act - Make multiple concurrent requests
      const promises = Array(5).fill(null).map(() => service.explainError(errorCode));
      const results = await Promise.all(promises);

      // Assert - All requests should return the same result
      results.forEach(result => {
        expect(result.code).toBe(errorCode);
        expect(result.explanation).toBe('Concurrent test explanation');
      });

      // Cache should be called for each request (no request deduplication in this implementation)
      expect(mockCacheService.get).toHaveBeenCalledTimes(5);
    });
  });

  describe('Error Response Quality Validation', () => {
    /**
     * Validate that error responses meet quality standards
     */

    it('should ensure all common error responses have required fields and quality', async () => {
      const testErrorCodes = [0, 1, 100, 2000, 2001, 2002, 6000, 6001, 6002, 6003];

      for (const errorCode of testErrorCodes) {
        // Arrange
        mockCacheService.get.mockResolvedValue(null);
        
        const staticResponse = StaticErrorDatabase.getStaticExplanation(errorCode);
        const mockResponse = staticResponse || {
          code: errorCode,
          explanation: `Quality test explanation for error ${errorCode}`,
          fixes: [`Quality test fix 1 for error ${errorCode}`, `Quality test fix 2 for error ${errorCode}`],
          source: 'ai' as const,
          confidence: 0.85
        };
        
        mockFallbackService.explainError.mockResolvedValue(mockResponse);

        // Act
        const result = await service.explainError(errorCode);

        // Assert - Quality checks
        expect(result.code).toBe(errorCode);
        expect(result.explanation).toBeDefined();
        expect(result.explanation.length).toBeGreaterThan(10); // Meaningful explanation
        expect(result.fixes).toBeDefined();
        expect(result.fixes.length).toBeGreaterThan(0); // At least one fix
        expect(result.fixes.every(fix => fix.length > 5)).toBe(true); // Meaningful fixes
        expect(result.source).toMatch(/^(ai|static|cache)$/);
        expect(result.confidence).toBeGreaterThan(0);
        expect(result.confidence).toBeLessThanOrEqual(1);

        // Reset for next iteration
        jest.clearAllMocks();
        MockedCompositeCacheService.mockImplementation(() => mockCacheService);
        MockedFallbackService.mockImplementation(() => mockFallbackService);
      }
    });

    it('should ensure Solana-specific terminology is used in responses', async () => {
      // Solana-specific terms that should appear in responses
      // const solanaTerms = [
      //   'anchor', 'solana', 'program', 'instruction', 'account', 
      //   'transaction', 'signer', 'PDA', 'constraint', 'token'
      // ];

      const testCases = [
        { code: 1, expectedTerms: ['instruction', 'anchor test'] },
        { code: 2000, expectedTerms: ['PDA', 'seeds', 'findProgramAddress'] },
        { code: 6000, expectedTerms: ['account', 'balance'] }
      ];

      for (const testCase of testCases) {
        // Arrange
        mockCacheService.get.mockResolvedValue(null);
        
        const staticResponse = StaticErrorDatabase.getStaticExplanation(testCase.code);
        mockFallbackService.explainError.mockResolvedValue(staticResponse!);

        // Act
        const result = await service.explainError(testCase.code);

        // Assert - Check for Solana-specific terminology
        const fullText = `${result.explanation} ${result.fixes.join(' ')}`.toLowerCase();
        
        testCase.expectedTerms.forEach(term => {
          expect(fullText).toContain(term.toLowerCase());
        });

        // Reset for next iteration
        jest.clearAllMocks();
        MockedCompositeCacheService.mockImplementation(() => mockCacheService);
        MockedFallbackService.mockImplementation(() => mockFallbackService);
      }
    });
  });
});