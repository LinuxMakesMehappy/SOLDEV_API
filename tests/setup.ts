// Jest setup file for global test configuration
import { jest } from '@jest/globals';

// Mock AWS SDK clients globally
jest.mock('@aws-sdk/client-bedrock-runtime');
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('@aws-sdk/client-ssm');

// Set test environment variables
process.env['NODE_ENV'] = 'test';
process.env['AWS_REGION'] = 'us-east-1';
process.env['AWS_BEDROCK_REGION'] = 'us-east-1';
process.env['DYNAMODB_TABLE_NAME'] = 'test-solana-error-cache';
process.env['AWS_BEDROCK_MODEL_ID'] = 'anthropic.claude-3-sonnet-20240229-v1:0';
process.env['AI_TEMPERATURE'] = '0.1';
process.env['AI_MAX_TOKENS'] = '1000';
process.env['AI_TIMEOUT_MS'] = '10000';
process.env['CACHE_TTL_SECONDS'] = '3600';
process.env['RATE_LIMIT_PER_MINUTE'] = '100';
process.env['LOG_LEVEL'] = 'error';