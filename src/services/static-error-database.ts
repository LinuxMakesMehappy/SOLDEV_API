/**
 * Static error database fallback service
 * Requirement 3.4: Static fallback when AI services are unavailable
 * Requirement 3.6: Fallback response mechanisms
 */

import { ErrorExplanation } from '../types/api';
import { STANDARD_SOLANA_ERRORS, ANCHOR_CONSTRAINT_ERRORS } from '../models/error-models';

/**
 * Static error explanation template
 */
interface StaticErrorTemplate {
  explanation: string;
  fixes: string[];
  category: string;
}

/**
 * Comprehensive static error database for common Anchor and Solana errors
 * This serves as the final fallback when AI services are unavailable
 */
export class StaticErrorDatabase {
  /**
   * Extended static error database with common custom Anchor errors
   * These are based on common patterns and community knowledge
   */
  private static readonly STATIC_ERROR_DATABASE: Record<number, StaticErrorTemplate> = {
    // Standard Solana errors (0-999)
    0: {
      explanation: 'Operation completed successfully with no errors.',
      fixes: ['No action needed - this indicates successful execution'],
      category: 'success'
    },
    1: {
      explanation: 'The instruction data provided is invalid or malformed. This typically occurs when the data passed to a program instruction doesn\'t match the expected format.',
      fixes: [
        'Verify instruction data serialization matches program expectations',
        'Check that all required parameters are provided with correct types',
        'Use anchor test to validate instruction format and data structure'
      ],
      category: 'instruction'
    },
    100: {
      explanation: 'A required instruction is missing from the transaction. This error indicates that the transaction is incomplete.',
      fixes: [
        'Review transaction structure for missing setup or prerequisite instructions',
        'Check program documentation for required instruction sequence',
        'Use solana logs to trace transaction execution and identify missing steps'
      ],
      category: 'instruction'
    },
    
    // Anchor constraint errors (2000-2999)
    2000: {
      explanation: 'Seeds constraint violation occurred during PDA (Program Derived Address) derivation. The provided seeds don\'t match the expected constraint.',
      fixes: [
        'Verify seed values exactly match the program constraint definition',
        'Check seed order and data types in PDA derivation',
        'Ensure correct program ID is used for findProgramAddress call'
      ],
      category: 'constraint'
    },
    2001: {
      explanation: 'HasOne constraint violation - the account relationship check failed. The account doesn\'t have the expected relationship to another account.',
      fixes: [
        'Verify the account has the expected relationship field set correctly',
        'Check that the correct related account is passed to the instruction',
        'Validate account data integrity and relationships before instruction execution'
      ],
      category: 'constraint'
    },
    2002: {
      explanation: 'Signer constraint violation - a required signature is missing. An account that should be a signer was not properly signed.',
      fixes: [
        'Ensure the account is marked as a signer in the transaction',
        'Verify the correct signer account is provided to the instruction',
        'Check the transaction signing process and wallet connection'
      ],
      category: 'constraint'
    },
    2003: {
      explanation: 'Mut constraint violation - an account marked as mutable was not provided as mutable in the instruction.',
      fixes: [
        'Mark the account as mutable (&mut) in the instruction context',
        'Verify account permissions allow modification',
        'Check that the account is not read-only in the transaction'
      ],
      category: 'constraint'
    },
    2004: {
      explanation: 'Owner constraint violation - the account is not owned by the expected program.',
      fixes: [
        'Verify the account is owned by the correct program',
        'Check account initialization and ownership transfer',
        'Ensure you\'re using the right account for this instruction'
      ],
      category: 'constraint'
    },
    
    // Common custom Anchor errors (6000+)
    6000: {
      explanation: 'Insufficient funds error - the account doesn\'t have enough balance for the requested operation.',
      fixes: [
        'Check account balance before attempting the transaction',
        'Verify token account has sufficient balance for the operation',
        'Add balance validation logic in your program before processing'
      ],
      category: 'custom'
    },
    6001: {
      explanation: 'Unauthorized access attempt - the caller doesn\'t have permission to perform this operation.',
      fixes: [
        'Verify the correct authority account is being used',
        'Check access control permissions in the program',
        'Ensure the signer has the required privileges for this action'
      ],
      category: 'custom'
    },
    6002: {
      explanation: 'Invalid account state - the account is not in the expected state for this operation.',
      fixes: [
        'Check the account\'s current state before the operation',
        'Verify account initialization and setup',
        'Ensure prerequisite operations have been completed'
      ],
      category: 'custom'
    },
    6003: {
      explanation: 'Arithmetic overflow or underflow occurred during calculation.',
      fixes: [
        'Add overflow/underflow checks before arithmetic operations',
        'Use checked arithmetic operations (checked_add, checked_sub, etc.)',
        'Validate input ranges to prevent overflow conditions'
      ],
      category: 'custom'
    },
    6004: {
      explanation: 'Invalid timestamp or time-based constraint violation.',
      fixes: [
        'Check system clock and timestamp validity',
        'Verify time-based constraints are within acceptable ranges',
        'Use Clock sysvar to get accurate on-chain time'
      ],
      category: 'custom'
    },
    6005: {
      explanation: 'Account already exists or duplicate initialization attempted.',
      fixes: [
        'Check if account already exists before initialization',
        'Use different seeds or account derivation if creating multiple accounts',
        'Implement proper account existence validation'
      ],
      category: 'custom'
    },
    6006: {
      explanation: 'Invalid program configuration or setup parameters.',
      fixes: [
        'Verify program configuration parameters are correct',
        'Check initialization values and constraints',
        'Review program setup documentation and requirements'
      ],
      category: 'custom'
    },
    6007: {
      explanation: 'Token mint or token account mismatch error.',
      fixes: [
        'Verify token account belongs to the expected mint',
        'Check token mint address matches program expectations',
        'Ensure correct token program is being used (Token or Token-2022)'
      ],
      category: 'custom'
    },
    6008: {
      explanation: 'Slippage tolerance exceeded - the price or amount changed beyond acceptable limits.',
      fixes: [
        'Increase slippage tolerance if market conditions are volatile',
        'Check current market prices before transaction execution',
        'Implement dynamic slippage calculation based on market conditions'
      ],
      category: 'custom'
    },
    6009: {
      explanation: 'Invalid oracle or price feed data.',
      fixes: [
        'Verify oracle account is providing valid price data',
        'Check price feed freshness and staleness thresholds',
        'Implement fallback price sources or validation mechanisms'
      ],
      category: 'custom'
    }
  };

  /**
   * Gets a static error explanation for the given error code
   * @param errorCode - The error code to look up
   * @returns ErrorExplanation or null if not found in static database
   */
  static getStaticExplanation(errorCode: number): ErrorExplanation | null {
    // First check if it's in our static database
    const staticError = this.STATIC_ERROR_DATABASE[errorCode];
    if (staticError) {
      return {
        code: errorCode,
        explanation: staticError.explanation,
        fixes: staticError.fixes,
        source: 'static',
        confidence: 0.9 // High confidence for known static errors
      };
    }

    // Fallback to standard Solana errors
    const standardError = STANDARD_SOLANA_ERRORS[errorCode];
    if (standardError) {
      return {
        code: errorCode,
        explanation: `${standardError.name}: ${standardError.description}`,
        fixes: standardError.fixSuggestions,
        source: 'static',
        confidence: 0.95 // Very high confidence for standard errors
      };
    }

    // Fallback to Anchor constraint errors
    const anchorError = ANCHOR_CONSTRAINT_ERRORS[errorCode];
    if (anchorError) {
      return {
        code: errorCode,
        explanation: `${anchorError.name}: ${anchorError.description}`,
        fixes: anchorError.fixSuggestions,
        source: 'static',
        confidence: 0.95 // Very high confidence for Anchor errors
      };
    }

    return null;
  }

  /**
   * Gets a generic fallback explanation for unknown error codes
   * @param errorCode - The error code that wasn't found
   * @returns Generic ErrorExplanation
   */
  static getGenericFallback(errorCode: number): ErrorExplanation {
    let explanation = '';
    let fixes: string[] = [];

    // Provide category-specific generic explanations
    if (errorCode >= 0 && errorCode <= 999) {
      explanation = `System error ${errorCode}. This appears to be a low-level Solana runtime error.`;
      fixes = [
        'Check Solana documentation for system error codes',
        'Review transaction structure and account setup',
        'Use solana logs to get more detailed error information'
      ];
    } else if (errorCode >= 2000 && errorCode <= 2999) {
      explanation = `Anchor constraint error ${errorCode}. This indicates a constraint validation failure in your Anchor program.`;
      fixes = [
        'Review your program\'s account constraints and validation rules',
        'Check that all required account relationships are properly set up',
        'Verify account data matches the expected constraints'
      ];
    } else if (errorCode >= 6000) {
      explanation = `Custom program error ${errorCode}. This is a program-specific error defined by the developer.`;
      fixes = [
        'Check the program\'s source code or documentation for this error code',
        'Review the specific conditions that trigger this error',
        'Contact the program developer or check community resources for guidance'
      ];
    } else {
      explanation = `Unknown error code ${errorCode}. This error is not recognized in the standard Solana or Anchor error ranges.`;
      fixes = [
        'Verify the error code is correct and properly formatted',
        'Check if this is a custom error from a specific program',
        'Use solana logs and anchor test for more detailed debugging information'
      ];
    }

    return {
      code: errorCode,
      explanation,
      fixes,
      source: 'static',
      confidence: 0.3 // Low confidence for generic fallbacks
    };
  }

  /**
   * Main method to get error explanation with fallback chain
   * @param errorCode - The error code to explain
   * @returns ErrorExplanation (never null, always provides some explanation)
   */
  static explainError(errorCode: number): ErrorExplanation {
    // Try to get specific static explanation first
    const staticExplanation = this.getStaticExplanation(errorCode);
    if (staticExplanation) {
      return staticExplanation;
    }

    // Fall back to generic explanation
    return this.getGenericFallback(errorCode);
  }

  /**
   * Checks if an error code has a specific static explanation
   * @param errorCode - The error code to check
   * @returns true if a specific explanation exists
   */
  static hasStaticExplanation(errorCode: number): boolean {
    return this.STATIC_ERROR_DATABASE[errorCode] !== undefined ||
           STANDARD_SOLANA_ERRORS[errorCode] !== undefined ||
           ANCHOR_CONSTRAINT_ERRORS[errorCode] !== undefined;
  }

  /**
   * Gets all available error codes in the static database
   * @returns Array of error codes that have static explanations
   */
  static getAvailableErrorCodes(): number[] {
    const staticCodes = Object.keys(this.STATIC_ERROR_DATABASE).map(Number);
    const standardCodes = Object.keys(STANDARD_SOLANA_ERRORS).map(Number);
    const anchorCodes = Object.keys(ANCHOR_CONSTRAINT_ERRORS).map(Number);
    
    return [...new Set([...staticCodes, ...standardCodes, ...anchorCodes])].sort((a, b) => a - b);
  }
}