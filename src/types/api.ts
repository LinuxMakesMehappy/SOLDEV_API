/**
 * API request and response type definitions for the Solana Error Code Explanation API
 */

/**
 * Request interface for error code explanation endpoint
 * Requirement 1.1: Accept error codes as number or string (hex format)
 */
export interface ErrorRequest {
  errorCode: number | string;
}

/**
 * Successful response interface for error code explanation
 * Requirement 7.3: Response format with code, explanation, and fixes
 */
export interface ErrorResponse {
  code: number;
  explanation: string;
  fixes: string[];
  cached?: boolean;
  timestamp: string;
}

/**
 * Error response interface for failed requests
 * Requirement 7.4: Appropriate HTTP status codes and error messages
 */
export interface ErrorResponseError {
  error: string;
  code: number;
  timestamp: string;
}

/**
 * Internal error explanation model used throughout the system
 * Requirement 2.4, 2.5: AI-generated explanations with source tracking
 */
export interface ErrorExplanation {
  code: number;
  explanation: string;
  fixes: string[];
  source: 'cache' | 'ai' | 'static';
  confidence?: number;
}

/**
 * AI service response model
 * Requirement 3.1: AI integration response structure
 */
export interface AIExplanation {
  explanation: string;
  fixes: string[];
  confidence: number;
  model: string;
  tokens: number;
}