/**
 * Environment configuration types and validation for the Solana Error API
 */

/**
 * Environment configuration interface
 * Requirement 5.5: Secure handling of configuration and API keys
 */
export interface EnvironmentConfig {
  // AI Configuration
  AWS_BEDROCK_REGION: string;
  AWS_BEDROCK_MODEL_ID: string;
  AI_TEMPERATURE: string;
  AI_MAX_TOKENS: string;
  AI_TIMEOUT_MS: string;
  
  // External AI Fallback
  EXTERNAL_AI_API_URL?: string;
  EXTERNAL_AI_API_KEY?: string;
  
  // Cache Configuration
  DYNAMODB_TABLE_NAME: string;
  CACHE_TTL_SECONDS: string;
  
  // Rate Limiting
  RATE_LIMIT_PER_MINUTE: string;
  
  // Logging
  LOG_LEVEL: string;
  
  // AWS Configuration
  AWS_REGION?: string;
}

/**
 * Parsed and validated environment configuration
 */
export interface ValidatedEnvironmentConfig {
  // AI Configuration
  awsBedrock: {
    region: string;
    modelId: string;
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
  };
  
  // External AI Fallback
  externalAI?: {
    apiUrl: string;
    apiKey: string;
  };
  
  // Cache Configuration
  cache: {
    tableName: string;
    ttlSeconds: number;
  };
  
  // Rate Limiting
  rateLimit: {
    requestsPerMinute: number;
  };
  
  // Logging
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
  };
  
  // AWS Configuration
  aws: {
    region: string;
  };
}

/**
 * Environment configuration validator and parser
 * Requirement 3.3: Configurable environment variables for API keys and settings
 */
export class EnvironmentValidator {
  private static readonly REQUIRED_FIELDS: (keyof EnvironmentConfig)[] = [
    'AWS_BEDROCK_REGION',
    'AWS_BEDROCK_MODEL_ID',
    'AI_TEMPERATURE',
    'AI_MAX_TOKENS',
    'AI_TIMEOUT_MS',
    'DYNAMODB_TABLE_NAME',
    'CACHE_TTL_SECONDS',
    'RATE_LIMIT_PER_MINUTE',
    'LOG_LEVEL'
  ];

  private static readonly VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error'];

  /**
   * Validates and parses environment configuration
   * @param env - Raw environment variables (defaults to process.env)
   * @returns ValidatedEnvironmentConfig
   * @throws Error if validation fails
   */
  static validate(env: Record<string, string | undefined> = process.env): ValidatedEnvironmentConfig {
    // Check required fields
    const missing = this.REQUIRED_FIELDS.filter(field => !env[field]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // Validate and parse numeric values
    const temperature = this.parseFloat(env['AI_TEMPERATURE']!, 'AI_TEMPERATURE', 0, 2);
    const maxTokens = this.parseInt(env['AI_MAX_TOKENS']!, 'AI_MAX_TOKENS', 1, 4000);
    const timeoutMs = this.parseInt(env['AI_TIMEOUT_MS']!, 'AI_TIMEOUT_MS', 1000, 30000);
    const ttlSeconds = this.parseInt(env['CACHE_TTL_SECONDS']!, 'CACHE_TTL_SECONDS', 60, 86400);
    const requestsPerMinute = this.parseInt(env['RATE_LIMIT_PER_MINUTE']!, 'RATE_LIMIT_PER_MINUTE', 1, 10000);

    // Validate log level
    const logLevel = env['LOG_LEVEL']!.toLowerCase();
    if (!this.VALID_LOG_LEVELS.includes(logLevel)) {
      throw new Error(`Invalid LOG_LEVEL: ${env['LOG_LEVEL']}. Must be one of: ${this.VALID_LOG_LEVELS.join(', ')}`);
    }

    // Validate external AI configuration (if provided)
    let externalAI: ValidatedEnvironmentConfig['externalAI'] | undefined;
    if (env['EXTERNAL_AI_API_URL'] || env['EXTERNAL_AI_API_KEY']) {
      if (!env['EXTERNAL_AI_API_URL'] || !env['EXTERNAL_AI_API_KEY']) {
        throw new Error('Both EXTERNAL_AI_API_URL and EXTERNAL_AI_API_KEY must be provided if using external AI');
      }
      
      if (!this.isValidUrl(env['EXTERNAL_AI_API_URL'])) {
        throw new Error('EXTERNAL_AI_API_URL must be a valid HTTPS URL');
      }

      externalAI = {
        apiUrl: env['EXTERNAL_AI_API_URL'],
        apiKey: env['EXTERNAL_AI_API_KEY']
      };
    }

    const config: ValidatedEnvironmentConfig = {
      awsBedrock: {
        region: env['AWS_BEDROCK_REGION']!,
        modelId: env['AWS_BEDROCK_MODEL_ID']!,
        temperature,
        maxTokens,
        timeoutMs
      },
      cache: {
        tableName: env['DYNAMODB_TABLE_NAME']!,
        ttlSeconds
      },
      rateLimit: {
        requestsPerMinute
      },
      logging: {
        level: logLevel as 'debug' | 'info' | 'warn' | 'error'
      },
      aws: {
        region: env['AWS_REGION'] || env['AWS_BEDROCK_REGION']!
      }
    };

    if (externalAI) {
      config.externalAI = externalAI;
    }

    return config;
  }

  /**
   * Parses and validates integer environment variable
   */
  private static parseInt(value: string, name: string, min: number, max: number): number {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      throw new Error(`${name} must be a valid integer, got: ${value}`);
    }
    if (parsed < min || parsed > max) {
      throw new Error(`${name} must be between ${min} and ${max}, got: ${parsed}`);
    }
    return parsed;
  }

  /**
   * Parses and validates float environment variable
   */
  private static parseFloat(value: string, name: string, min: number, max: number): number {
    const parsed = parseFloat(value);
    if (isNaN(parsed)) {
      throw new Error(`${name} must be a valid number, got: ${value}`);
    }
    if (parsed < min || parsed > max) {
      throw new Error(`${name} must be between ${min} and ${max}, got: ${parsed}`);
    }
    return parsed;
  }

  /**
   * Validates URL format (must be HTTPS)
   */
  private static isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }
}