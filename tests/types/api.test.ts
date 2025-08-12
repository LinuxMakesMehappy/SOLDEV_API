/**
 * Unit tests for API type definitions
 * Requirement 7.3: Response format validation
 */

import {
  ErrorRequest,
  ErrorResponse,
  ErrorResponseError,
  ErrorExplanation,
  AIExplanation
} from '../../src/types/api';

describe('API Types', () => {
  describe('ErrorRequest', () => {
    it('should accept numeric error codes', () => {
      const request: ErrorRequest = {
        errorCode: 2000
      };

      expect(request.errorCode).toBe(2000);
      expect(typeof request.errorCode).toBe('number');
    });

    it('should accept string error codes', () => {
      const request: ErrorRequest = {
        errorCode: '0x1770'
      };

      expect(request.errorCode).toBe('0x1770');
      expect(typeof request.errorCode).toBe('string');
    });
  });

  describe('ErrorResponse', () => {
    it('should have correct structure for successful response', () => {
      const response: ErrorResponse = {
        code: 2000,
        explanation: 'Seeds constraint violation - PDA derivation failed',
        fixes: [
          'Verify seed values match the program constraint definition',
          'Check seed order and types in PDA derivation'
        ],
        cached: true,
        timestamp: '2024-01-01T00:00:00.000Z'
      };

      expect(response).toHaveProperty('code');
      expect(response).toHaveProperty('explanation');
      expect(response).toHaveProperty('fixes');
      expect(response).toHaveProperty('cached');
      expect(response).toHaveProperty('timestamp');

      expect(typeof response.code).toBe('number');
      expect(typeof response.explanation).toBe('string');
      expect(Array.isArray(response.fixes)).toBe(true);
      expect(typeof response.cached).toBe('boolean');
      expect(typeof response.timestamp).toBe('string');
    });

    it('should work without optional cached field', () => {
      const response: ErrorResponse = {
        code: 2000,
        explanation: 'Seeds constraint violation',
        fixes: ['Fix suggestion'],
        timestamp: '2024-01-01T00:00:00.000Z'
      };

      expect(response.cached).toBeUndefined();
      expect(response).toHaveProperty('code');
      expect(response).toHaveProperty('explanation');
      expect(response).toHaveProperty('fixes');
      expect(response).toHaveProperty('timestamp');
    });
  });

  describe('ErrorResponseError', () => {
    it('should have correct structure for error response', () => {
      const errorResponse: ErrorResponseError = {
        error: 'Invalid error code format',
        code: 400,
        timestamp: '2024-01-01T00:00:00.000Z'
      };

      expect(errorResponse).toHaveProperty('error');
      expect(errorResponse).toHaveProperty('code');
      expect(errorResponse).toHaveProperty('timestamp');

      expect(typeof errorResponse.error).toBe('string');
      expect(typeof errorResponse.code).toBe('number');
      expect(typeof errorResponse.timestamp).toBe('string');
    });
  });

  describe('ErrorExplanation', () => {
    it('should have correct structure with all fields', () => {
      const explanation: ErrorExplanation = {
        code: 2000,
        explanation: 'Seeds constraint violation',
        fixes: ['Fix 1', 'Fix 2'],
        source: 'ai',
        confidence: 0.95
      };

      expect(explanation).toHaveProperty('code');
      expect(explanation).toHaveProperty('explanation');
      expect(explanation).toHaveProperty('fixes');
      expect(explanation).toHaveProperty('source');
      expect(explanation).toHaveProperty('confidence');

      expect(typeof explanation.code).toBe('number');
      expect(typeof explanation.explanation).toBe('string');
      expect(Array.isArray(explanation.fixes)).toBe(true);
      expect(['cache', 'ai', 'static']).toContain(explanation.source);
      expect(typeof explanation.confidence).toBe('number');
    });

    it('should work without optional confidence field', () => {
      const explanation: ErrorExplanation = {
        code: 2000,
        explanation: 'Seeds constraint violation',
        fixes: ['Fix 1', 'Fix 2'],
        source: 'cache'
      };

      expect(explanation.confidence).toBeUndefined();
      expect(explanation).toHaveProperty('code');
      expect(explanation).toHaveProperty('explanation');
      expect(explanation).toHaveProperty('fixes');
      expect(explanation).toHaveProperty('source');
    });

    it('should accept all valid source types', () => {
      const sources: Array<'cache' | 'ai' | 'static'> = ['cache', 'ai', 'static'];

      sources.forEach(source => {
        const explanation: ErrorExplanation = {
          code: 2000,
          explanation: 'Test explanation',
          fixes: ['Fix'],
          source
        };

        expect(explanation.source).toBe(source);
      });
    });
  });

  describe('AIExplanation', () => {
    it('should have correct structure', () => {
      const aiExplanation: AIExplanation = {
        explanation: 'AI-generated explanation',
        fixes: ['AI fix 1', 'AI fix 2', 'AI fix 3'],
        confidence: 0.87,
        model: 'anthropic.claude-3-sonnet-20240229-v1:0',
        tokens: 150
      };

      expect(aiExplanation).toHaveProperty('explanation');
      expect(aiExplanation).toHaveProperty('fixes');
      expect(aiExplanation).toHaveProperty('confidence');
      expect(aiExplanation).toHaveProperty('model');
      expect(aiExplanation).toHaveProperty('tokens');

      expect(typeof aiExplanation.explanation).toBe('string');
      expect(Array.isArray(aiExplanation.fixes)).toBe(true);
      expect(typeof aiExplanation.confidence).toBe('number');
      expect(typeof aiExplanation.model).toBe('string');
      expect(typeof aiExplanation.tokens).toBe('number');
    });

    it('should validate confidence is between 0 and 1', () => {
      // This is more of a documentation test since TypeScript doesn't enforce ranges
      const validConfidences = [0, 0.5, 0.87, 1.0];
      
      validConfidences.forEach(confidence => {
        const aiExplanation: AIExplanation = {
          explanation: 'Test',
          fixes: ['Fix'],
          confidence,
          model: 'test-model',
          tokens: 100
        };

        expect(aiExplanation.confidence).toBe(confidence);
        expect(aiExplanation.confidence).toBeGreaterThanOrEqual(0);
        expect(aiExplanation.confidence).toBeLessThanOrEqual(1);
      });
    });

    it('should validate tokens is positive integer', () => {
      const validTokenCounts = [1, 100, 1000, 4000];
      
      validTokenCounts.forEach(tokens => {
        const aiExplanation: AIExplanation = {
          explanation: 'Test',
          fixes: ['Fix'],
          confidence: 0.8,
          model: 'test-model',
          tokens
        };

        expect(aiExplanation.tokens).toBe(tokens);
        expect(aiExplanation.tokens).toBeGreaterThan(0);
        expect(Number.isInteger(aiExplanation.tokens)).toBe(true);
      });
    });
  });

  describe('Type compatibility', () => {
    it('should allow ErrorExplanation to be converted to ErrorResponse', () => {
      const explanation: ErrorExplanation = {
        code: 2000,
        explanation: 'Test explanation',
        fixes: ['Fix 1', 'Fix 2'],
        source: 'ai',
        confidence: 0.9
      };

      // This should compile without errors
      const response: ErrorResponse = {
        code: explanation.code,
        explanation: explanation.explanation,
        fixes: explanation.fixes,
        cached: explanation.source === 'cache',
        timestamp: new Date().toISOString()
      };

      expect(response.code).toBe(explanation.code);
      expect(response.explanation).toBe(explanation.explanation);
      expect(response.fixes).toEqual(explanation.fixes);
      expect(response.cached).toBe(false); // source is 'ai', not 'cache'
    });

    it('should allow AIExplanation to be converted to ErrorExplanation', () => {
      const aiExplanation: AIExplanation = {
        explanation: 'AI explanation',
        fixes: ['AI fix 1', 'AI fix 2'],
        confidence: 0.85,
        model: 'test-model',
        tokens: 200
      };

      // This should compile without errors
      const explanation: ErrorExplanation = {
        code: 6000,
        explanation: aiExplanation.explanation,
        fixes: aiExplanation.fixes,
        source: 'ai',
        confidence: aiExplanation.confidence
      };

      expect(explanation.explanation).toBe(aiExplanation.explanation);
      expect(explanation.fixes).toEqual(aiExplanation.fixes);
      expect(explanation.confidence).toBe(aiExplanation.confidence);
      expect(explanation.source).toBe('ai');
    });
  });
});