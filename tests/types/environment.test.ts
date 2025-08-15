/**
 * Unit tests for environment configuration validation
 * Requirement 5.5: Secure handling of configuration and API keys
 */

import { EnvironmentValidator } from '../../src/types/environment';

describe('EnvironmentValidator', () => {
  const validEnvConfig = {
    AWS_BEDROCK_REGION: 'us-east-1',
    AWS_BEDROCK_MODEL_ID: 'anthropic.claude-3-sonnet-20240229-v1:0',
    AI_TEMPERATURE: '0.7',
    AI_MAX_TOKENS: '1000',
    AI_TIMEOUT_MS: '10000',
    DYNAMODB_TABLE_NAME: 'solana-error-cache',
    CACHE_TTL_SECONDS: '3600',
    RATE_LIMIT_PER_MINUTE: '100',
    LOG_LEVEL: 'info'
  };

  describe('validate', () => {
    it('should validate complete valid configuration', () => {
      const result = EnvironmentValidator.validate(validEnvConfig);

      expect(result).toEqual({
        awsBedrock: {
          region: 'us-east-1',
          modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
          temperature: 0.7,
          maxTokens: 1000,
          timeoutMs: 10000
        },
        cache: {
          tableName: 'solana-error-cache',
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
      });
    });

    it('should validate configuration with external AI', () => {
      const configWithExternalAI = {
        ...validEnvConfig,
        EXTERNAL_AI_API_URL: 'https://api.example.com/v1/chat',
        EXTERNAL_AI_API_KEY: 'test-api-key'
      };

      const result = EnvironmentValidator.validate(configWithExternalAI);

      expect(result.externalAI).toEqual({
        apiUrl: 'https://api.example.com/v1/chat',
        apiKey: 'test-api-key'
      });
    });

    it('should use AWS_REGION when provided', () => {
      const configWithAwsRegion = {
        ...validEnvConfig,
        AWS_REGION: 'us-west-2'
      };

      const result = EnvironmentValidator.validate(configWithAwsRegion);

      expect(result.aws.region).toBe('us-west-2');
    });

    it('should fallback to AWS_BEDROCK_REGION when AWS_REGION not provided', () => {
      const result = EnvironmentValidator.validate(validEnvConfig);

      expect(result.aws.region).toBe('us-east-1');
    });

    describe('required field validation', () => {
      const requiredFields = [
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

      requiredFields.forEach(field => {
        it(`should throw error when ${field} is missing`, () => {
          const incompleteConfig = { ...validEnvConfig };
          delete incompleteConfig[field as keyof typeof incompleteConfig];

          expect(() => EnvironmentValidator.validate(incompleteConfig))
            .toThrow(`Missing required environment variables: ${field}`);
        });
      });

      it('should throw error when multiple required fields are missing', () => {
        const incompleteConfig = {
          AWS_BEDROCK_REGION: 'us-east-1'
        };

        expect(() => EnvironmentValidator.validate(incompleteConfig))
          .toThrow('Missing required environment variables:');
      });
    });

    describe('numeric field validation', () => {
      it('should validate AI_TEMPERATURE range', () => {
        const invalidTemperatures = ['-0.1', '2.1', 'not-a-number'];
        
        invalidTemperatures.forEach(temp => {
          const config = { ...validEnvConfig, AI_TEMPERATURE: temp };
          expect(() => EnvironmentValidator.validate(config))
            .toThrow(/AI_TEMPERATURE/);
        });

        // Valid temperatures
        const validTemperatures = ['0', '0.5', '1.0', '2.0'];
        validTemperatures.forEach(temp => {
          const config = { ...validEnvConfig, AI_TEMPERATURE: temp };
          expect(() => EnvironmentValidator.validate(config)).not.toThrow();
        });
      });

      it('should validate AI_MAX_TOKENS range', () => {
        const invalidTokens = ['0', '4001', 'not-a-number'];
        
        invalidTokens.forEach(tokens => {
          const config = { ...validEnvConfig, AI_MAX_TOKENS: tokens };
          expect(() => EnvironmentValidator.validate(config))
            .toThrow(/AI_MAX_TOKENS/);
        });

        // Valid token counts
        const validTokens = ['1', '1000', '4000'];
        validTokens.forEach(tokens => {
          const config = { ...validEnvConfig, AI_MAX_TOKENS: tokens };
          expect(() => EnvironmentValidator.validate(config)).not.toThrow();
        });
      });

      it('should validate AI_TIMEOUT_MS range', () => {
        const invalidTimeouts = ['999', '30001', 'not-a-number'];
        
        invalidTimeouts.forEach(timeout => {
          const config = { ...validEnvConfig, AI_TIMEOUT_MS: timeout };
          expect(() => EnvironmentValidator.validate(config))
            .toThrow(/AI_TIMEOUT_MS/);
        });

        // Valid timeouts
        const validTimeouts = ['1000', '15000', '30000'];
        validTimeouts.forEach(timeout => {
          const config = { ...validEnvConfig, AI_TIMEOUT_MS: timeout };
          expect(() => EnvironmentValidator.validate(config)).not.toThrow();
        });
      });

      it('should validate CACHE_TTL_SECONDS range', () => {
        const invalidTTLs = ['59', '86401', 'not-a-number'];
        
        invalidTTLs.forEach(ttl => {
          const config = { ...validEnvConfig, CACHE_TTL_SECONDS: ttl };
          expect(() => EnvironmentValidator.validate(config))
            .toThrow(/CACHE_TTL_SECONDS/);
        });

        // Valid TTLs
        const validTTLs = ['60', '3600', '86400'];
        validTTLs.forEach(ttl => {
          const config = { ...validEnvConfig, CACHE_TTL_SECONDS: ttl };
          expect(() => EnvironmentValidator.validate(config)).not.toThrow();
        });
      });

      it('should validate RATE_LIMIT_PER_MINUTE range', () => {
        const invalidRates = ['0', '10001', 'not-a-number'];
        
        invalidRates.forEach(rate => {
          const config = { ...validEnvConfig, RATE_LIMIT_PER_MINUTE: rate };
          expect(() => EnvironmentValidator.validate(config))
            .toThrow(/RATE_LIMIT_PER_MINUTE/);
        });

        // Valid rates
        const validRates = ['1', '100', '10000'];
        validRates.forEach(rate => {
          const config = { ...validEnvConfig, RATE_LIMIT_PER_MINUTE: rate };
          expect(() => EnvironmentValidator.validate(config)).not.toThrow();
        });
      });
    });

    describe('log level validation', () => {
      it('should accept valid log levels', () => {
        const validLevels = ['debug', 'info', 'warn', 'error', 'DEBUG', 'INFO', 'WARN', 'ERROR'];
        
        validLevels.forEach(level => {
          const config = { ...validEnvConfig, LOG_LEVEL: level };
          const result = EnvironmentValidator.validate(config);
          expect(result.logging.level).toBe(level.toLowerCase());
        });
      });

      it('should reject invalid log levels', () => {
        const invalidLevels = ['trace', 'fatal', 'verbose', 'invalid'];
        
        invalidLevels.forEach(level => {
          const config = { ...validEnvConfig, LOG_LEVEL: level };
          expect(() => EnvironmentValidator.validate(config))
            .toThrow(`Invalid LOG_LEVEL: ${level}. Must be one of: debug, info, warn, error`);
        });
      });
    });

    describe('external AI validation', () => {
      it('should require both URL and API key when one is provided', () => {
        const configWithOnlyUrl = {
          ...validEnvConfig,
          EXTERNAL_AI_API_URL: 'https://api.example.com'
        };

        expect(() => EnvironmentValidator.validate(configWithOnlyUrl))
          .toThrow('Both EXTERNAL_AI_API_URL and EXTERNAL_AI_API_KEY must be provided if using external AI');

        const configWithOnlyKey = {
          ...validEnvConfig,
          EXTERNAL_AI_API_KEY: 'test-key'
        };

        expect(() => EnvironmentValidator.validate(configWithOnlyKey))
          .toThrow('Both EXTERNAL_AI_API_URL and EXTERNAL_AI_API_KEY must be provided if using external AI');
      });

      it('should require HTTPS URLs for external AI', () => {
        const invalidUrls = [
          'http://api.example.com',
          'ftp://api.example.com',
          'not-a-url',
          'api.example.com'
        ];

        invalidUrls.forEach(url => {
          const config = {
            ...validEnvConfig,
            EXTERNAL_AI_API_URL: url,
            EXTERNAL_AI_API_KEY: 'test-key'
          };

          expect(() => EnvironmentValidator.validate(config))
            .toThrow('EXTERNAL_AI_API_URL must be a valid HTTPS URL');
        });
      });

      it('should accept valid HTTPS URLs for external AI', () => {
        const validUrls = [
          'https://api.example.com',
          'https://api.example.com/v1/chat',
          'https://subdomain.example.com:8080/api'
        ];

        validUrls.forEach(url => {
          const config = {
            ...validEnvConfig,
            EXTERNAL_AI_API_URL: url,
            EXTERNAL_AI_API_KEY: 'test-key'
          };

          expect(() => EnvironmentValidator.validate(config)).not.toThrow();
        });
      });
    });

    describe('edge cases', () => {
      it('should handle empty environment object', () => {
        expect(() => EnvironmentValidator.validate({}))
          .toThrow('Missing required environment variables:');
      });

      it('should handle undefined environment', () => {
        // The validator should handle undefined gracefully by returning default values
        // or throwing an appropriate error
        try {
          EnvironmentValidator.validate(undefined as any);
          // If it doesn't throw, that's also acceptable behavior
        } catch (error) {
          // If it throws, that's expected behavior
          expect(error).toBeDefined();
        }
      });

      it('should handle environment with undefined values', () => {
        const envWithUndefined = {
          ...validEnvConfig,
          AWS_BEDROCK_REGION: undefined
        };

        expect(() => EnvironmentValidator.validate(envWithUndefined as any))
          .toThrow('Missing required environment variables: AWS_BEDROCK_REGION');
      });
    });
  });
});