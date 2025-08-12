/**
 * External AI API fallback service for Solana error code explanations
 * Requirement 3.2: External AI API fallback when Bedrock is unavailable
 * Requirement 3.5: Rate limit handling and retry mechanisms for external APIs
 * Requirement 3.6: AI integration with timeout and error management
 */

import { AIExplanation } from '../types/api';
import { ValidatedEnvironmentConfig } from '../types/environment';
import { AIService } from './ai-service';

/**
 * External AI service configuration interface
 */
export interface ExternalAIConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
}

/**
 * Rate limiting interface for external API calls
 */
interface RateLimitState {
  requests: number;
  resetTime: number;
  isLimited: boolean;
}

/**
 * External AI API response interface
 */
interface ExternalAIResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
    text?: string;
  }>;
  error?: {
    message: string;
    type: string;
    code?: string;
  };
}

/**
 * External AI service implementation with fallback capabilities
 * Requirement 3.2: Implement fallback logic when Bedrock is unavailable
 */
export class ExternalAIService implements AIService {
  private config: ExternalAIConfig;
  private rateLimitState: RateLimitState;

  constructor(envConfig: ValidatedEnvironmentConfig) {
    if (!envConfig.externalAI) {
      throw new Error('External AI configuration is required');
    }

    this.config = {
      apiUrl: envConfig.externalAI.apiUrl,
      apiKey: envConfig.externalAI.apiKey,
      model: 'gpt-3.5-turbo', // Default model
      timeout: 10000, // 10 seconds
      maxRetries: 3,
      retryDelay: 1000 // 1 second
    };

    this.rateLimitState = {
      requests: 0,
      resetTime: Date.now() + 60000, // Reset every minute
      isLimited: false
    };
  }

  /**
   * Generates AI explanation for Solana error code using external API
   * Requirement 3.6: Request/response handling with timeout and error management
   * @param errorCode - The error code to explain
   * @param context - Optional context about the error
   * @returns Promise<AIExplanation>
   */
  async generateExplanation(errorCode: number, context?: string): Promise<AIExplanation> {
    // Check rate limiting
    this.checkRateLimit();
    if (this.rateLimitState.isLimited) {
      throw new Error('Rate limit exceeded for external AI API. Please try again later.');
    }

    const prompt = this.buildPrompt(errorCode, context);
    
    let lastError: Error | null = null;
    
    // Retry mechanism
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.makeAPIRequest(prompt);
        this.updateRateLimit();
        return this.parseResponse(response, errorCode);
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on rate limit or authentication errors
        if (this.isNonRetryableError(error as Error)) {
          throw error;
        }
        
        // Wait before retry (exponential backoff)
        if (attempt < this.config.maxRetries) {
          await this.delay(this.config.retryDelay * Math.pow(2, attempt - 1));
        }
      }
    }

    throw new Error(`External AI service failed after ${this.config.maxRetries} attempts: ${lastError?.message}`);
  }

  /**
   * Creates AI prompt template for Solana error explanations
   * Requirement 3.2: Create AI prompt template for external AI service
   */
  private buildPrompt(errorCode: number, context?: string): string {
    const contextSection = context ? `\nContext: ${context}` : '';
    
    return `You are a Solana blockchain developer assistant. Explain the following Anchor error code in simple terms and provide 2-3 practical fix suggestions.

Error Code: ${errorCode}${contextSection}

Format your response as JSON with this exact structure:
{
  "explanation": "Brief, clear explanation of what this error means",
  "fixes": [
    "Specific actionable suggestion",
    "Alternative approach or additional check",
    "Tool or debugging technique"
  ]
}

Focus on Solana/Anchor-specific solutions and mention relevant tools like 'anchor test', 'solana logs', or common pitfalls. Keep explanations concise and actionable.`;
  }

  /**
   * Makes HTTP request to external AI API with timeout handling
   * Requirement 3.5: Add request/response handling with timeout and error management
   */
  private async makeAPIRequest(prompt: string): Promise<ExternalAIResponse> {
    const requestBody = {
      model: this.config.model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 1000,
      temperature: 0.3
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'User-Agent': 'Solana-Error-API/1.0.0'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as any;
        throw new Error(`External AI API error (${response.status}): ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json() as ExternalAIResponse;
      
      if (data.error) {
        throw new Error(`External AI API error: ${data.error.message}`);
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`External AI API request timeout after ${this.config.timeout}ms`);
      }
      
      throw error;
    }
  }

  /**
   * Parses external AI response and extracts explanation and fixes
   * Requirement 3.6: Response handling with error management
   */
  private parseResponse(response: ExternalAIResponse, errorCode: number): AIExplanation {
    try {
      // Extract content from response
      let content = '';
      if (response.choices && response.choices.length > 0) {
        const choice = response.choices[0];
        content = choice?.message?.content || choice?.text || '';
      }

      if (!content) {
        throw new Error('Empty response from external AI API');
      }

      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.parseNonJsonResponse(content, errorCode);
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      if (!parsed.explanation || !Array.isArray(parsed.fixes)) {
        return this.parseNonJsonResponse(content, errorCode);
      }

      // Ensure we have at least 2 fixes, pad with generic ones if needed
      const fixes = parsed.fixes.slice(0, 3); // Limit to 3 fixes
      while (fixes.length < 2) {
        fixes.push('Check Solana program logs for additional context');
      }

      return {
        explanation: parsed.explanation.trim(),
        fixes: fixes.map((fix: string) => fix.trim()),
        confidence: this.calculateConfidence(parsed.explanation, fixes),
        model: this.config.model,
        tokens: this.estimateTokens(content)
      };
    } catch (error) {
      // Fallback parsing for non-JSON responses
      return this.parseNonJsonResponse(response.choices?.[0]?.message?.content || '', errorCode);
    }
  }

  /**
   * Fallback parser for non-JSON responses
   */
  private parseNonJsonResponse(content: string, errorCode: number): AIExplanation {
    const lines = content.split('\n').filter(line => line.trim());
    
    let explanation = `Error code ${errorCode} encountered`;
    const fixes: string[] = [];

    // Try to extract explanation and fixes from text
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.toLowerCase().includes('explanation:')) {
        explanation = trimmed.replace(/explanation:\s*/i, '');
      } else if (trimmed.toLowerCase().includes('fix') && trimmed.includes(':')) {
        const fix = trimmed.replace(/fix\s*\d*:\s*/i, '');
        if (fix && fixes.length < 3) {
          fixes.push(fix);
        }
      }
    }

    // Ensure minimum fixes
    if (fixes.length === 0) {
      fixes.push('Check Solana program logs for more details');
      fixes.push('Verify account states and transaction parameters');
    }

    return {
      explanation,
      fixes,
      confidence: 0.4, // Lower confidence for fallback parsing
      model: this.config.model,
      tokens: this.estimateTokens(content)
    };
  }

  /**
   * Calculates confidence score based on response quality
   */
  private calculateConfidence(explanation: string, fixes: string[]): number {
    let confidence = 0.6; // Base confidence for external AI

    // Increase confidence for detailed explanations
    if (explanation.length > 50) confidence += 0.1;
    if (explanation.toLowerCase().includes('solana') || explanation.toLowerCase().includes('anchor')) {
      confidence += 0.1;
    }

    // Increase confidence for quality fixes
    if (fixes.length >= 2) confidence += 0.05;
    if (fixes.some(fix => fix.toLowerCase().includes('anchor test') || fix.toLowerCase().includes('solana logs'))) {
      confidence += 0.05;
    }

    return Math.min(confidence, 0.9); // Cap at 0.9 for external AI
  }

  /**
   * Estimates token count for response
   */
  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Checks and updates rate limiting state
   * Requirement 3.5: Rate limit handling for external APIs
   */
  private checkRateLimit(): void {
    const now = Date.now();
    
    // Reset rate limit window if expired
    if (now >= this.rateLimitState.resetTime) {
      this.rateLimitState.requests = 0;
      this.rateLimitState.resetTime = now + 60000; // Next minute
      this.rateLimitState.isLimited = false;
    }
    
    // Check if rate limited (assuming 60 requests per minute limit)
    if (this.rateLimitState.requests >= 60) {
      this.rateLimitState.isLimited = true;
    }
  }

  /**
   * Updates rate limit counter after successful request
   */
  private updateRateLimit(): void {
    this.rateLimitState.requests++;
  }

  /**
   * Determines if an error should not be retried
   */
  private isNonRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('rate limit') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('invalid api key') ||
      message.includes('authentication')
    );
  }

  /**
   * Utility method for delays in retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Health check method to verify external AI connectivity
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Test with a simple error code
      await this.generateExplanation(0, 'health check');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets current rate limit status
   */
  getRateLimitStatus(): { requests: number; resetTime: number; isLimited: boolean } {
    return { ...this.rateLimitState };
  }
}

/**
 * Factory function to create ExternalAIService instance
 * @param envConfig - Validated environment configuration
 * @returns ExternalAIService instance
 */
export function createExternalAIService(envConfig: ValidatedEnvironmentConfig): ExternalAIService {
  return new ExternalAIService(envConfig);
}