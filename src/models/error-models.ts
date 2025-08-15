/**
 * Core data models for error code processing and validation
 */

/**
 * Validated error code model after input processing
 * Requirement 1.1, 1.2: Error code validation and type classification
 */
export interface ValidatedErrorCode {
  code: number;
  originalInput: string | number;
  type: 'standard' | 'anchor_constraint' | 'custom';
}

/**
 * Standard Solana error mapping model
 * Requirement 2.1, 2.2: Standard Solana error mappings (0-9999)
 */
export interface StandardError {
  name: string;
  description: string;
  category: 'system' | 'instruction' | 'account' | 'program';
  commonCauses: string[];
  fixSuggestions: string[];
}

/**
 * Anchor constraint error model
 * Requirement 2.2: Anchor constraint error mappings (2000-2999)
 */
export interface AnchorError {
  name: string;
  description: string;
  constraintType: string;
  commonCauses: string[];
  fixSuggestions: string[];
}

/**
 * Cache item model for DynamoDB storage
 * Requirement 2.7: Caching with TTL support
 */
export interface CacheItem {
  errorCode: string; // Partition key
  explanation: string;
  fixes: string[];
  createdAt: number;
  ttl: number; // TTL attribute for automatic cleanup
  source: 'ai' | 'static' | 'mapped';
}

/**
 * Error code validator class
 * Requirement 1.4, 1.5: Input validation and sanitization
 */
export class ErrorCodeValidator {
  private static readonly MAX_U32 = 4294967295;
  private static readonly MIN_U32 = 0;

  /**
   * Validates and converts error code input to ValidatedErrorCode
   * @param input - Raw error code input (number or string)
   * @returns ValidatedErrorCode or throws validation error
   */
  static validate(input: number | string): ValidatedErrorCode {
    let code: number;
    const originalInput = input;

    // Handle numeric input
    if (typeof input === 'number') {
      if (!Number.isInteger(input) || input < this.MIN_U32 || input > this.MAX_U32) {
        throw new Error('Invalid error code format. Must be a number between 0 and 4294967295.');
      }
      code = input;
    }
    // Handle string input (decimal or hex format)
    else if (typeof input === 'string') {
      // Check if it's a hex string (starts with 0x)
      if (input.toLowerCase().startsWith('0x')) {
        const cleanInput = input.slice(2);
        
        // Validate hex format
        if (!/^[0-9a-f]+$/i.test(cleanInput)) {
          throw new Error('Invalid error code format. String must be a valid decimal or hexadecimal number.');
        }

        code = parseInt(cleanInput, 16);
      }
      // Otherwise treat as decimal string
      else {
        // Validate decimal format
        if (!/^\d+$/.test(input)) {
          throw new Error('Invalid error code format. String must be a valid decimal or hexadecimal number.');
        }

        code = parseInt(input, 10);
      }
      
      if (code < this.MIN_U32 || code > this.MAX_U32) {
        throw new Error('Invalid error code format. Must be a number between 0 and 4294967295.');
      }
    }
    else {
      throw new Error('Invalid error code format. Must be a number or hex string.');
    }

    return {
      code,
      originalInput,
      type: this.classifyErrorType(code)
    };
  }

  /**
   * Classifies error code type based on Solana/Anchor conventions
   * @param code - Validated error code number
   * @returns Error type classification
   */
  private static classifyErrorType(code: number): 'standard' | 'anchor_constraint' | 'custom' {
    // Check Anchor constraint errors first (they have priority over standard range)
    if (code >= 2000 && code <= 2999) {
      return 'anchor_constraint';
    }
    // Custom Anchor errors (6000+) - Requirement 2.3
    if (code >= 6000) {
      return 'custom';
    }
    // Standard Solana errors (0-5999) excluding Anchor constraint range
    if (code >= 0 && code <= 5999 && !(code >= 2000 && code <= 2999)) {
      return 'standard';
    }
    return 'custom';
  }
}

/**
 * Standard Solana error mappings
 * Requirement 2.1: Predefined mappings for standard errors (0-9999)
 */
export const STANDARD_SOLANA_ERRORS: Record<number, StandardError> = {
  0: {
    name: 'Success',
    description: 'No error occurred - operation completed successfully',
    category: 'system',
    commonCauses: ['Normal operation completion'],
    fixSuggestions: ['No action needed - this indicates success']
  },
  1: {
    name: 'InvalidInstructionData',
    description: 'The instruction data provided is invalid or malformed',
    category: 'instruction',
    commonCauses: [
      'Incorrect serialization of instruction data',
      'Missing required parameters',
      'Data type mismatch'
    ],
    fixSuggestions: [
      'Verify instruction data serialization matches program expectations',
      'Check that all required parameters are provided',
      'Use anchor test to validate instruction format'
    ]
  },
  100: {
    name: 'InstructionMissing',
    description: 'A required instruction is missing from the transaction',
    category: 'instruction',
    commonCauses: [
      'Transaction missing required setup instructions',
      'Incomplete transaction building'
    ],
    fixSuggestions: [
      'Review transaction structure for missing instructions',
      'Check program documentation for required instruction sequence',
      'Use solana logs to trace transaction execution'
    ]
  }
};

/**
 * Anchor constraint error mappings
 * Requirement 2.2: Anchor constraint error mappings (2000-2999)
 */
export const ANCHOR_CONSTRAINT_ERRORS: Record<number, AnchorError> = {
  2000: {
    name: 'ConstraintSeeds',
    description: 'Seeds constraint violation - PDA derivation failed',
    constraintType: 'seeds',
    commonCauses: [
      'Incorrect seed values provided',
      'Seed order mismatch',
      'Wrong program ID used for derivation'
    ],
    fixSuggestions: [
      'Verify seed values match the program constraint definition',
      'Check seed order and types in PDA derivation',
      'Ensure correct program ID is used for findProgramAddress'
    ]
  },
  2001: {
    name: 'ConstraintHasOne',
    description: 'HasOne constraint violation - account relationship check failed',
    constraintType: 'has_one',
    commonCauses: [
      'Account does not have expected relationship',
      'Wrong account provided in instruction',
      'Account data corruption'
    ],
    fixSuggestions: [
      'Verify the account has the expected relationship field',
      'Check that correct account is passed to instruction',
      'Validate account data integrity before instruction'
    ]
  },
  2002: {
    name: 'ConstraintSigner',
    description: 'Signer constraint violation - required signature missing',
    constraintType: 'signer',
    commonCauses: [
      'Account not signed when signature required',
      'Wrong signer account provided',
      'Missing signature in transaction'
    ],
    fixSuggestions: [
      'Ensure account is marked as signer in transaction',
      'Verify correct signer account is provided',
      'Check transaction signing process'
    ]
  }
};