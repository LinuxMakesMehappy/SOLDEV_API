/**
 * AWS Bedrock AI integration service for Solana error code explanations
 * Requirement 3.1: AWS Bedrock as primary AI provider
 * Requirement 3.3: Configurable environment variables for API keys and settings
 * Requirement 3.6: AI integration with timeout and error management
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { AIExplanation } from '../types/api';
import { ValidatedEnvironmentConfig } from '../types/environment';

/**
 * Bedrock service configuration interface
 */
export interface BedrockConfig {
  modelId: string;
  region: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}

/**
 * AI service interface for error explanation generation
 */
export interface AIService {
  generateExplanation(errorCode: number, context?: string): Promise<AIExplanation>;
}

/**
 * AWS Bedrock AI service implementation
 * Requirement 3.1: Implement Bedrock client with proper authentication and region configuration
 */
export class BedrockAIService implements AIService {
  private client: BedrockRuntimeClient;
  private config: BedrockConfig;

  constructor(envConfig: ValidatedEnvironmentConfig) {
    this.config = {
      modelId: envConfig.awsBedrock.modelId,
      region: envConfig.awsBedrock.region,
      maxTokens: envConfig.awsBedrock.maxTokens,
      temperature: envConfig.awsBedrock.temperature,
      timeoutMs: envConfig.awsBedrock.timeoutMs
    };

    // Initialize Bedrock client with proper authentication and region
    this.client = new BedrockRuntimeClient({
      region: this.config.region,
      requestHandler: {
        requestTimeout: this.config.timeoutMs
      }
    });
  }

  /**
   * Generates AI explanation for Solana error code
   * Requirement 3.6: Request/response handling with timeout and error management
   * @param errorCode - The error code to explain
   * @param context - Optional context about the error
   * @returns Promise<AIExplanation>
   */
  async generateExplanation(errorCode: number, context?: string): Promise<AIExplanation> {
    try {
      const prompt = this.buildPrompt(errorCode, context);
      const response = await this.invokeModel(prompt);
      
      return this.parseResponse(response, errorCode);
    } catch (error) {
      throw new Error(`Bedrock AI service error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Creates AI prompt template for Solana error explanations
   * Requirement 3.1: Create AI prompt template for Solana error explanations
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
   * Invokes Bedrock model with proper error handling and timeout
   * Requirement 3.6: Add request/response handling with timeout and error management
   */
  private async invokeModel(prompt: string): Promise<string> {
    const requestBody = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    };

    const command = new InvokeModelCommand({
      modelId: this.config.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody)
    });

    // Add timeout handling
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Bedrock request timeout after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);
    });

    try {
      const response = await Promise.race([
        this.client.send(command),
        timeoutPromise
      ]);

      // Clear timeout if request completed successfully
      if (timeoutId) clearTimeout(timeoutId);

      if (!response.body) {
        throw new Error('Empty response from Bedrock');
      }

      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      
      if (!responseBody.content || !responseBody.content[0] || !responseBody.content[0].text) {
        throw new Error('Invalid response format from Bedrock');
      }

      return responseBody.content[0].text;
    } catch (error) {
      // Clear timeout on error
      if (timeoutId) clearTimeout(timeoutId);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Unknown error occurred during Bedrock invocation');
    }
  }

  /**
   * Parses AI response and extracts explanation and fixes
   * Requirement 3.6: Response handling with error management
   */
  private parseResponse(response: string, errorCode: number): AIExplanation {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      if (!parsed.explanation || !Array.isArray(parsed.fixes)) {
        throw new Error('Invalid response structure');
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
        model: this.config.modelId,
        tokens: this.estimateTokens(response)
      };
    } catch (error) {
      // Fallback parsing for non-JSON responses
      return this.parseNonJsonResponse(response, errorCode);
    }
  }

  /**
   * Fallback parser for non-JSON responses
   */
  private parseNonJsonResponse(response: string, errorCode: number): AIExplanation {
    const lines = response.split('\n').filter(line => line.trim());
    
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
      confidence: 0.5, // Lower confidence for fallback parsing
      model: this.config.modelId,
      tokens: this.estimateTokens(response)
    };
  }

  /**
   * Calculates confidence score based on response quality
   */
  private calculateConfidence(explanation: string, fixes: string[]): number {
    let confidence = 0.7; // Base confidence

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

    return Math.min(confidence, 1.0);
  }

  /**
   * Estimates token count for response
   */
  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Health check method to verify Bedrock connectivity
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
}

/**
 * Factory function to create BedrockAIService instance
 * @param envConfig - Validated environment configuration
 * @returns BedrockAIService instance
 */
export function createBedrockAIService(envConfig: ValidatedEnvironmentConfig): BedrockAIService {
  return new BedrockAIService(envConfig);
}