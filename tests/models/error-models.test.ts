/**
 * Unit tests for error models and validation
 * Requirement 1.4, 1.5: Input validation and sanitization testing
 */

import {
  ErrorCodeValidator,
  STANDARD_SOLANA_ERRORS,
  ANCHOR_CONSTRAINT_ERRORS
} from '../../src/models/error-models';

describe('ErrorCodeValidator', () => {
  describe('validate', () => {
    describe('valid numeric inputs', () => {
      it('should validate valid numeric error codes', () => {
        const testCases = [
          { input: 0, expected: { code: 0, type: 'standard' } },
          { input: 1, expected: { code: 1, type: 'standard' } },
          { input: 100, expected: { code: 100, type: 'standard' } },
          { input: 1999, expected: { code: 1999, type: 'standard' } },
          { input: 2000, expected: { code: 2000, type: 'anchor_constraint' } },
          { input: 2500, expected: { code: 2500, type: 'anchor_constraint' } },
          { input: 2999, expected: { code: 2999, type: 'anchor_constraint' } },
          { input: 3000, expected: { code: 3000, type: 'standard' } },
          { input: 5999, expected: { code: 5999, type: 'standard' } },
          { input: 6000, expected: { code: 6000, type: 'custom' } },
          { input: 9999, expected: { code: 9999, type: 'custom' } },
          { input: 4294967295, expected: { code: 4294967295, type: 'custom' } }
        ];

        testCases.forEach(({ input, expected }) => {
          const result = ErrorCodeValidator.validate(input);
          expect(result.code).toBe(expected.code);
          expect(result.type).toBe(expected.type);
          expect(result.originalInput).toBe(input);
        });
      });
    });

    describe('valid hex string inputs', () => {
      it('should validate hex strings with 0x prefix', () => {
        const testCases = [
          { input: '0x0', expected: { code: 0, type: 'standard' } },
          { input: '0x1', expected: { code: 1, type: 'standard' } },
          { input: '0x64', expected: { code: 100, type: 'standard' } },
          { input: '0x7D0', expected: { code: 2000, type: 'anchor_constraint' } },
          { input: '0x1770', expected: { code: 6000, type: 'custom' } },
          { input: '0xFFFFFFFF', expected: { code: 4294967295, type: 'custom' } }
        ];

        testCases.forEach(({ input, expected }) => {
          const result = ErrorCodeValidator.validate(input);
          expect(result.code).toBe(expected.code);
          expect(result.type).toBe(expected.type);
          expect(result.originalInput).toBe(input);
        });
      });

      it('should validate decimal strings', () => {
        const testCases = [
          { input: '0', expected: { code: 0, type: 'standard' } },
          { input: '1', expected: { code: 1, type: 'standard' } },
          { input: '100', expected: { code: 100, type: 'standard' } },
          { input: '2000', expected: { code: 2000, type: 'anchor_constraint' } },
          { input: '6000', expected: { code: 6000, type: 'custom' } },
          { input: '4294967295', expected: { code: 4294967295, type: 'custom' } }
        ];

        testCases.forEach(({ input, expected }) => {
          const result = ErrorCodeValidator.validate(input);
          expect(result.code).toBe(expected.code);
          expect(result.type).toBe(expected.type);
          expect(result.originalInput).toBe(input);
        });
      });

      it('should reject hex strings without 0x prefix', () => {
        const testCases = [
          'A0',  // Contains hex characters
          '7D0', // Contains hex characters
          'FF',  // Contains hex characters
          'FFFFFFFF' // Contains hex characters
        ];

        // These should now be treated as invalid since they contain non-decimal characters
        testCases.forEach((input) => {
          expect(() => ErrorCodeValidator.validate(input))
            .toThrow('Invalid error code format. String must be a valid decimal or hexadecimal number.');
        });
      });

      it('should handle mixed case hex strings with 0x prefix', () => {
        const validHexTestCases = [
          '0xaBcD',
          '0XaBcD'
        ];

        validHexTestCases.forEach(input => {
          const result = ErrorCodeValidator.validate(input);
          expect(result.code).toBe(43981); // 0xABCD = 43981
          expect(result.type).toBe('custom');
        });

        // These should now be treated as invalid since they don't have 0x prefix
        const invalidTestCases = [
          'AbCd',
          'ABCD',
          'abcd'
        ];

        invalidTestCases.forEach(input => {
          expect(() => ErrorCodeValidator.validate(input))
            .toThrow('Invalid error code format. String must be a valid decimal or hexadecimal number.');
        });
      });
    });

    describe('invalid inputs', () => {
      it('should reject negative numbers', () => {
        expect(() => ErrorCodeValidator.validate(-1))
          .toThrow('Invalid error code format. Must be a number between 0 and 4294967295.');
      });

      it('should reject numbers above u32 max', () => {
        expect(() => ErrorCodeValidator.validate(4294967296))
          .toThrow('Invalid error code format. Must be a number between 0 and 4294967295.');
      });

      it('should reject non-integer numbers', () => {
        expect(() => ErrorCodeValidator.validate(1.5))
          .toThrow('Invalid error code format. Must be a number between 0 and 4294967295.');
      });

      it('should reject invalid hex strings', () => {
        const invalidHexStrings = [
          'xyz',
          '0xGHI',
          'hello',
          '0x',
          '',
          '0xZZZ'
        ];

        invalidHexStrings.forEach(input => {
          expect(() => ErrorCodeValidator.validate(input))
            .toThrow('Invalid error code format. String must be a valid decimal or hexadecimal number.');
        });
      });

      it('should reject hex strings that exceed u32 max', () => {
        expect(() => ErrorCodeValidator.validate('0x100000000'))
          .toThrow('Invalid error code format. Must be a number between 0 and 4294967295.');
      });

      it('should reject non-string, non-number inputs', () => {
        const invalidInputs = [
          null,
          undefined,
          {},
          [],
          true,
          false
        ];

        invalidInputs.forEach(input => {
          expect(() => ErrorCodeValidator.validate(input as any))
            .toThrow('Invalid error code format. Must be a number or hex string.');
        });
      });
    });

    describe('error type classification', () => {
      it('should classify standard Solana errors (0-5999, excluding 2000-2999)', () => {
        const standardCodes = [0, 1, 100, 500, 1999, 3000, 5999];
        standardCodes.forEach(code => {
          const result = ErrorCodeValidator.validate(code);
          expect(result.type).toBe('standard');
        });
      });

      it('should classify Anchor constraint errors (2000-2999)', () => {
        const anchorCodes = [2000, 2001, 2500, 2999];
        anchorCodes.forEach(code => {
          const result = ErrorCodeValidator.validate(code);
          expect(result.type).toBe('anchor_constraint');
        });
      });

      it('should classify custom errors (6000+ and others)', () => {
        const customCodes = [6000, 9999, 10000, 4294967295];
        customCodes.forEach(code => {
          const result = ErrorCodeValidator.validate(code);
          expect(result.type).toBe('custom');
        });
      });
    });
  });
});

describe('STANDARD_SOLANA_ERRORS', () => {
  it('should contain expected standard error mappings', () => {
    expect(STANDARD_SOLANA_ERRORS[0]).toBeDefined();
    expect(STANDARD_SOLANA_ERRORS[0]!.name).toBe('Success');
    expect(STANDARD_SOLANA_ERRORS[0]!.category).toBe('system');

    expect(STANDARD_SOLANA_ERRORS[1]).toBeDefined();
    expect(STANDARD_SOLANA_ERRORS[1]!.name).toBe('InvalidInstructionData');
    expect(STANDARD_SOLANA_ERRORS[1]!.category).toBe('instruction');

    expect(STANDARD_SOLANA_ERRORS[100]).toBeDefined();
    expect(STANDARD_SOLANA_ERRORS[100]!.name).toBe('InstructionMissing');
    expect(STANDARD_SOLANA_ERRORS[100]!.category).toBe('instruction');
  });

  it('should have proper structure for all error entries', () => {
    Object.values(STANDARD_SOLANA_ERRORS).forEach(error => {
      expect(error).toHaveProperty('name');
      expect(error).toHaveProperty('description');
      expect(error).toHaveProperty('category');
      expect(error).toHaveProperty('commonCauses');
      expect(error).toHaveProperty('fixSuggestions');
      
      expect(typeof error.name).toBe('string');
      expect(typeof error.description).toBe('string');
      expect(['system', 'instruction', 'account', 'program']).toContain(error.category);
      expect(Array.isArray(error.commonCauses)).toBe(true);
      expect(Array.isArray(error.fixSuggestions)).toBe(true);
      expect(error.commonCauses.length).toBeGreaterThan(0);
      expect(error.fixSuggestions.length).toBeGreaterThan(0);
    });
  });
});

describe('ANCHOR_CONSTRAINT_ERRORS', () => {
  it('should contain expected Anchor constraint error mappings', () => {
    expect(ANCHOR_CONSTRAINT_ERRORS[2000]).toBeDefined();
    expect(ANCHOR_CONSTRAINT_ERRORS[2000]!.name).toBe('ConstraintSeeds');
    expect(ANCHOR_CONSTRAINT_ERRORS[2000]!.constraintType).toBe('seeds');

    expect(ANCHOR_CONSTRAINT_ERRORS[2001]).toBeDefined();
    expect(ANCHOR_CONSTRAINT_ERRORS[2001]!.name).toBe('ConstraintHasOne');
    expect(ANCHOR_CONSTRAINT_ERRORS[2001]!.constraintType).toBe('has_one');

    expect(ANCHOR_CONSTRAINT_ERRORS[2002]).toBeDefined();
    expect(ANCHOR_CONSTRAINT_ERRORS[2002]!.name).toBe('ConstraintSigner');
    expect(ANCHOR_CONSTRAINT_ERRORS[2002]!.constraintType).toBe('signer');
  });

  it('should have proper structure for all error entries', () => {
    Object.values(ANCHOR_CONSTRAINT_ERRORS).forEach(error => {
      expect(error).toHaveProperty('name');
      expect(error).toHaveProperty('description');
      expect(error).toHaveProperty('constraintType');
      expect(error).toHaveProperty('commonCauses');
      expect(error).toHaveProperty('fixSuggestions');
      
      expect(typeof error.name).toBe('string');
      expect(typeof error.description).toBe('string');
      expect(typeof error.constraintType).toBe('string');
      expect(Array.isArray(error.commonCauses)).toBe(true);
      expect(Array.isArray(error.fixSuggestions)).toBe(true);
      expect(error.commonCauses.length).toBeGreaterThan(0);
      expect(error.fixSuggestions.length).toBeGreaterThan(0);
    });
  });
});