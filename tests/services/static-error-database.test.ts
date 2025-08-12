/**
 * Unit tests for StaticErrorDatabase
 * Requirement 3.4: Static fallback when AI services are unavailable
 * Requirement 3.6: Fallback response mechanisms
 */

import { describe, it, expect } from '@jest/globals';
import { StaticErrorDatabase } from '../../src/services/static-error-database';

describe('StaticErrorDatabase', () => {
  describe('getStaticExplanation', () => {
    it('should return explanation for known static error codes', () => {
      const explanation = StaticErrorDatabase.getStaticExplanation(6000);
      
      expect(explanation).not.toBeNull();
      expect(explanation!.code).toBe(6000);
      expect(explanation!.explanation).toContain('Insufficient funds');
      expect(explanation!.fixes).toHaveLength(3);
      expect(explanation!.source).toBe('static');
      expect(explanation!.confidence).toBe(0.9);
    });

    it('should return explanation for standard Solana errors', () => {
      const explanation = StaticErrorDatabase.getStaticExplanation(1);
      
      expect(explanation).not.toBeNull();
      expect(explanation!.code).toBe(1);
      expect(explanation!.explanation).toContain('instruction data');
      expect(explanation!.fixes).toHaveLength(3);
      expect(explanation!.source).toBe('static');
      expect(explanation!.confidence).toBe(0.9); // Static database has priority
    });

    it('should return explanation for Anchor constraint errors', () => {
      const explanation = StaticErrorDatabase.getStaticExplanation(2000);
      
      expect(explanation).not.toBeNull();
      expect(explanation!.code).toBe(2000);
      expect(explanation!.explanation).toContain('Seeds constraint');
      expect(explanation!.fixes).toHaveLength(3);
      expect(explanation!.source).toBe('static');
      expect(explanation!.confidence).toBe(0.9); // Static database has priority
    });

    it('should return null for unknown error codes', () => {
      const explanation = StaticErrorDatabase.getStaticExplanation(9999);
      expect(explanation).toBeNull();
    });

    it('should prioritize static database over standard errors for overlapping codes', () => {
      // Error code 0 exists in both static database and standard errors
      const explanation = StaticErrorDatabase.getStaticExplanation(0);
      
      expect(explanation).not.toBeNull();
      expect(explanation!.explanation).toContain('Operation completed successfully');
      expect(explanation!.confidence).toBe(0.9); // Static database confidence
    });
  });

  describe('getGenericFallback', () => {
    it('should provide system error fallback for codes 0-999', () => {
      const explanation = StaticErrorDatabase.getGenericFallback(500);
      
      expect(explanation.code).toBe(500);
      expect(explanation.explanation).toContain('System error 500');
      expect(explanation.fixes).toHaveLength(3);
      expect(explanation.source).toBe('static');
      expect(explanation.confidence).toBe(0.3);
    });

    it('should provide constraint error fallback for codes 2000-2999', () => {
      const explanation = StaticErrorDatabase.getGenericFallback(2500);
      
      expect(explanation.code).toBe(2500);
      expect(explanation.explanation).toContain('Anchor constraint error 2500');
      expect(explanation.fixes).toHaveLength(3);
      expect(explanation.source).toBe('static');
      expect(explanation.confidence).toBe(0.3);
    });

    it('should provide custom error fallback for codes 6000+', () => {
      const explanation = StaticErrorDatabase.getGenericFallback(7000);
      
      expect(explanation.code).toBe(7000);
      expect(explanation.explanation).toContain('Custom program error 7000');
      expect(explanation.fixes).toHaveLength(3);
      expect(explanation.source).toBe('static');
      expect(explanation.confidence).toBe(0.3);
    });

    it('should provide unknown error fallback for other codes', () => {
      const explanation = StaticErrorDatabase.getGenericFallback(1500);
      
      expect(explanation.code).toBe(1500);
      expect(explanation.explanation).toContain('Unknown error code 1500');
      expect(explanation.fixes).toHaveLength(3);
      expect(explanation.source).toBe('static');
      expect(explanation.confidence).toBe(0.3);
    });
  });

  describe('explainError', () => {
    it('should return specific explanation when available', () => {
      const explanation = StaticErrorDatabase.explainError(6001);
      
      expect(explanation.code).toBe(6001);
      expect(explanation.explanation).toContain('Unauthorized access');
      expect(explanation.source).toBe('static');
      expect(explanation.confidence).toBe(0.9);
    });

    it('should return generic fallback when specific explanation not available', () => {
      const explanation = StaticErrorDatabase.explainError(8000);
      
      expect(explanation.code).toBe(8000);
      expect(explanation.explanation).toContain('Custom program error 8000');
      expect(explanation.source).toBe('static');
      expect(explanation.confidence).toBe(0.3);
    });

    it('should never return null - always provide some explanation', () => {
      const testCodes = [0, 1, 100, 2000, 2500, 6000, 7000, 9999, -1, 999999];
      
      testCodes.forEach(code => {
        const explanation = StaticErrorDatabase.explainError(code);
        expect(explanation).not.toBeNull();
        expect(explanation.code).toBe(code);
        expect(explanation.explanation).toBeTruthy();
        expect(explanation.fixes.length).toBeGreaterThanOrEqual(1);
        expect(explanation.source).toBe('static');
      });
    });
  });

  describe('hasStaticExplanation', () => {
    it('should return true for known static error codes', () => {
      expect(StaticErrorDatabase.hasStaticExplanation(6000)).toBe(true);
      expect(StaticErrorDatabase.hasStaticExplanation(6001)).toBe(true);
      expect(StaticErrorDatabase.hasStaticExplanation(6009)).toBe(true);
    });

    it('should return true for standard Solana errors', () => {
      expect(StaticErrorDatabase.hasStaticExplanation(0)).toBe(true);
      expect(StaticErrorDatabase.hasStaticExplanation(1)).toBe(true);
      expect(StaticErrorDatabase.hasStaticExplanation(100)).toBe(true);
    });

    it('should return true for Anchor constraint errors', () => {
      expect(StaticErrorDatabase.hasStaticExplanation(2000)).toBe(true);
      expect(StaticErrorDatabase.hasStaticExplanation(2001)).toBe(true);
      expect(StaticErrorDatabase.hasStaticExplanation(2002)).toBe(true);
    });

    it('should return false for unknown error codes', () => {
      expect(StaticErrorDatabase.hasStaticExplanation(9999)).toBe(false);
      expect(StaticErrorDatabase.hasStaticExplanation(1500)).toBe(false);
      expect(StaticErrorDatabase.hasStaticExplanation(8000)).toBe(false);
    });
  });

  describe('getAvailableErrorCodes', () => {
    it('should return sorted array of all available error codes', () => {
      const codes = StaticErrorDatabase.getAvailableErrorCodes();
      
      expect(Array.isArray(codes)).toBe(true);
      expect(codes.length).toBeGreaterThan(0);
      
      // Check that it's sorted
      for (let i = 1; i < codes.length; i++) {
        expect(codes[i]!).toBeGreaterThan(codes[i - 1]!);
      }
      
      // Check that it includes known codes
      expect(codes).toContain(0);
      expect(codes).toContain(1);
      expect(codes).toContain(100);
      expect(codes).toContain(2000);
      expect(codes).toContain(2001);
      expect(codes).toContain(6000);
      expect(codes).toContain(6009);
    });

    it('should not contain duplicates', () => {
      const codes = StaticErrorDatabase.getAvailableErrorCodes();
      const uniqueCodes = [...new Set(codes)];
      
      expect(codes.length).toBe(uniqueCodes.length);
    });
  });

  describe('error explanation quality', () => {
    it('should provide meaningful explanations for all static errors', () => {
      const codes = StaticErrorDatabase.getAvailableErrorCodes();
      
      codes.forEach(code => {
        const explanation = StaticErrorDatabase.getStaticExplanation(code);
        expect(explanation).not.toBeNull();
        expect(explanation!.explanation.length).toBeGreaterThan(20);
        expect(explanation!.fixes.length).toBeGreaterThanOrEqual(1);
        expect(explanation!.fixes.every(fix => fix.length > 10)).toBe(true);
      });
    });

    it('should provide Solana-specific fix suggestions', () => {
      const explanation = StaticErrorDatabase.explainError(1);
      const fixText = explanation.fixes.join(' ').toLowerCase();
      
      expect(fixText).toMatch(/anchor|solana|instruction|program/);
    });

    it('should provide different explanations for different error categories', () => {
      const systemError = StaticErrorDatabase.explainError(1);
      const constraintError = StaticErrorDatabase.explainError(2000);
      const customError = StaticErrorDatabase.explainError(6000);
      
      expect(systemError.explanation).not.toBe(constraintError.explanation);
      expect(constraintError.explanation).not.toBe(customError.explanation);
      expect(systemError.explanation).not.toBe(customError.explanation);
    });
  });

  describe('confidence levels', () => {
    it('should assign appropriate confidence levels', () => {
      // Static database entries should have high confidence
      const staticExplanation = StaticErrorDatabase.getStaticExplanation(6000);
      expect(staticExplanation!.confidence).toBe(0.9);
      
      // Standard errors (when not overridden by static) should have very high confidence
      const standardExplanation = StaticErrorDatabase.getStaticExplanation(1);
      expect(standardExplanation!.confidence).toBe(0.9); // Static database takes priority
      
      // Generic fallbacks should have low confidence
      const genericExplanation = StaticErrorDatabase.getGenericFallback(9999);
      expect(genericExplanation.confidence).toBe(0.3);
    });
  });

  describe('edge cases', () => {
    it('should handle boundary error codes correctly', () => {
      const testCases = [
        { code: 0, shouldHaveSpecific: true },
        { code: 999, shouldHaveSpecific: false },
        { code: 1999, shouldHaveSpecific: false },
        { code: 2000, shouldHaveSpecific: true },
        { code: 2999, shouldHaveSpecific: false },
        { code: 5999, shouldHaveSpecific: false },
        { code: 6000, shouldHaveSpecific: true }
      ];
      
      testCases.forEach(({ code, shouldHaveSpecific }) => {
        const hasSpecific = StaticErrorDatabase.hasStaticExplanation(code);
        expect(hasSpecific).toBe(shouldHaveSpecific);
        
        const explanation = StaticErrorDatabase.explainError(code);
        expect(explanation).not.toBeNull();
        expect(explanation.code).toBe(code);
      });
    });

    it('should handle negative error codes gracefully', () => {
      const explanation = StaticErrorDatabase.explainError(-1);
      
      expect(explanation.code).toBe(-1);
      expect(explanation.explanation).toContain('Unknown error code -1');
      expect(explanation.source).toBe('static');
      expect(explanation.confidence).toBe(0.3);
    });

    it('should handle very large error codes gracefully', () => {
      const explanation = StaticErrorDatabase.explainError(4294967295);
      
      expect(explanation.code).toBe(4294967295);
      expect(explanation.explanation).toContain('Custom program error');
      expect(explanation.source).toBe('static');
      expect(explanation.confidence).toBe(0.3);
    });
  });
});