/**
 * Main Lambda handler for the Solana Error Code Explanation API
 * Requirements: 6.1, 6.2, 7.4 - Lambda function with API Gateway integration
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { ErrorRequest, ErrorResponse, ErrorResponseError } from '../types/api';
import { EnvironmentValidator } from '../types/environment';
import { createErrorExplanationService } from '../services/error-explanation-service';
import { defaultRateLimiter } from '../middleware/rate-limiter';
import { defaultSecurityMiddleware, InputSanitizer } from '../middleware/security';
import { ThreatIntelligenceService } from '../services/threat-intelligence-service';
import { globalErrorHandler, ErrorFactory } from '../utils/error-handler';
import { logger, createPerformanceLogger } from '../utils/logger';

// Global service instances (reused across warm Lambda invocations)
let errorExplanationService: ReturnType<typeof createErrorExplanationService> | null = null;
let isInitialized = false;

/**
 * Initialize services on cold start
 * Requirement 6.4: Cold start optimization
 */
async function initializeServices(): Promise<void> {
  if (isInitialized) return;

  const perfLogger = createPerformanceLogger('service_initialization');

  try {
    logger.info('Initializing services...');

    // Validate environment configuration
    const envConfig = EnvironmentValidator.validate();
    logger.info('Environment configuration validated');

    // Initialize error explanation service
    errorExplanationService = createErrorExplanationService(envConfig);
    logger.info('Error explanation service initialized');

    isInitialized = true;
    perfLogger.end({ success: true });
  } catch (error) {
    logger.error('Service initialization failed', {}, error instanceof Error ? error : new Error(String(error)));
    perfLogger.end({ success: false, error: error instanceof Error ? error.message : String(error) });
    throw ErrorFactory.internal('Service initialization failed', { error: String(error) });
  }
}

/**
 * Create CORS headers for responses with security considerations
 * Requirements: 6.2, 5.2 - CORS headers with security headers
 */
function createCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Amz-Date, Authorization, X-Api-Key, X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400'
  };
}

/**
 * Create error response with proper formatting and security headers
 * Requirements: 7.4, 5.2 - HTTP status codes with security headers
 */
function createErrorResponse(
  statusCode: number,
  error: string,
  code?: number
): APIGatewayProxyResult {
  const errorResponse: ErrorResponseError = {
    error,
    code: code || statusCode,
    timestamp: new Date().toISOString()
  };

  logger.warn('Creating error response', {
    statusCode,
    error,
    code: code || statusCode
  });

  const response = {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...createCorsHeaders()
    },
    body: JSON.stringify(errorResponse)
  };

  // Add security headers to error responses
  return defaultSecurityMiddleware.addSecurityHeaders(response);
}

/**
 * Create success response with proper formatting and security headers
 * Requirements: 7.3, 5.2 - Response format with security headers
 */
function createSuccessResponse(
  explanation: any,
  cached: boolean = false
): APIGatewayProxyResult {
  const response: ErrorResponse = {
    code: explanation.code,
    explanation: explanation.explanation,
    fixes: explanation.fixes,
    cached,
    timestamp: new Date().toISOString()
  };

  const apiResponse = {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      ...createCorsHeaders()
    },
    body: JSON.stringify(response)
  };

  // Add security headers to success responses
  return defaultSecurityMiddleware.addSecurityHeaders(apiResponse);
}

/**
 * Handle OPTIONS requests for CORS preflight with security headers
 * Requirements: 6.2, 5.2 - CORS support with security headers
 */
function handleOptionsRequest(): APIGatewayProxyResult {
  const response = {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      ...createCorsHeaders()
    },
    body: ''
  };

  // Add security headers to OPTIONS responses
  return defaultSecurityMiddleware.addSecurityHeaders(response);
}

/**
 * Validate and parse request body with security sanitization and threat intelligence
 * Requirements: 1.1, 5.2 - Accept error codes with input sanitization
 */
async function parseRequestBody(body: string | null): Promise<ErrorRequest> {
  if (!body) {
    throw ErrorFactory.validation('Request body is required');
  }

  // Sanitize and validate JSON input with threat intelligence
  let parsedBody: any;
  try {
    parsedBody = await InputSanitizer.sanitizeJson(body);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Security violation')) {
      throw ErrorFactory.validation('Request blocked due to security policy violation');
    }
    throw ErrorFactory.validation('Invalid JSON in request body');
  }

  if (!parsedBody || typeof parsedBody !== 'object') {
    throw ErrorFactory.validation('Request body must be a JSON object');
  }

  if (!('errorCode' in parsedBody)) {
    throw ErrorFactory.validation('Missing required field: errorCode');
  }

  const { errorCode } = parsedBody;

  // Validate errorCode type
  if (typeof errorCode !== 'number' && typeof errorCode !== 'string') {
    throw ErrorFactory.validation('errorCode must be a number or string');
  }

  logger.debug('Request body parsed and sanitized successfully');
  return { errorCode };
}

/**
 * Handle POST requests to /explain-error endpoint
 * Requirements: 1.1, 2.4, 2.5, 2.6 - Error code processing with AI and caching
 */
async function handleExplainErrorRequest(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const perfLogger = createPerformanceLogger('explain_error_request');
  const requestId = event.requestContext.requestId;
  const requestLogger = logger.child({ requestId });

  try {
    // Parse and validate request body with threat intelligence
    const request = await parseRequestBody(event.body);
    requestLogger.info('Processing error code');

    // Get error explanation from service
    const explanation = await errorExplanationService!.explainError(request.errorCode);
    
    // Determine if response was cached
    const cached = explanation.source === 'cache';
    
    requestLogger.info('Error explanation completed', {
      errorCode: explanation.code,
      source: explanation.source,
      cached,
      cacheHit: cached
    });

    perfLogger.end({ 
      success: true, 
      errorCode: explanation.code, 
      source: explanation.source,
      cacheHit: cached
    });

    return createSuccessResponse(explanation, cached);

  } catch (error) {
    requestLogger.error('Error processing request', {}, error instanceof Error ? error : new Error(String(error)));
    perfLogger.end({ success: false, error: error instanceof Error ? error.message : String(error) });
    
    // Use global error handler for consistent error processing
    return globalErrorHandler.handleError(error, { requestId, endpoint: '/explain-error' });
  }
}

/**
 * Handle health check requests
 * Requirement 6.6: Health monitoring endpoint
 */
async function handleHealthCheck(): Promise<APIGatewayProxyResult> {
  const perfLogger = createPerformanceLogger('health_check');
  
  try {
    if (!errorExplanationService) {
      logger.error('Health check failed - service not initialized');
      perfLogger.end({ success: false, error: 'Service not initialized' });
      return createErrorResponse(503, 'Service not initialized');
    }

    const healthStatus = await errorExplanationService.getHealthStatus();
    
    logger.info('Health check completed', {
      healthy: healthStatus.healthy,
      services: healthStatus.services
    });

    perfLogger.end({ success: true, healthy: healthStatus.healthy });
    
    // Get threat intelligence statistics
    const threatStats = await ThreatIntelligenceService.getStats();

    const healthResponse = {
      statusCode: healthStatus.healthy ? 200 : 503,
      headers: {
        'Content-Type': 'application/json',
        ...createCorsHeaders()
      },
      body: JSON.stringify({
        status: healthStatus.healthy ? 'healthy' : 'unhealthy',
        services: healthStatus.services,
        errorStats: globalErrorHandler.getErrorStats(),
        securityStats: defaultSecurityMiddleware.getViolationStats(),
        rateLimitStats: defaultRateLimiter.getStats(),
        threatIntelligence: threatStats,
        timestamp: new Date().toISOString()
      })
    };

    // Add security headers to health check response
    return defaultSecurityMiddleware.addSecurityHeaders(healthResponse);
  } catch (error) {
    logger.error('Health check failed', {}, error instanceof Error ? error : new Error(String(error)));
    perfLogger.end({ success: false, error: error instanceof Error ? error.message : String(error) });
    return globalErrorHandler.handleError(error, { endpoint: '/health' });
  }
}

/**
 * Main Lambda handler function
 * Requirements: 6.1, 6.2, 7.4 - Complete API Gateway integration
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const requestId = context.awsRequestId;
  const requestLogger = logger.child({ requestId });
  const perfLogger = createPerformanceLogger('lambda_handler', { requestId });

  // Set Lambda context for better logging
  requestLogger.info('Request received', {
    httpMethod: event.httpMethod,
    path: event.path,
    sourceIp: event.requestContext.identity.sourceIp,
    userAgent: event.headers['User-Agent'] || 'unknown'
  });

  // Legacy logging format for tests
  console.info('[Lambda] Request received:', {
    httpMethod: event.httpMethod,
    path: event.path,
    sourceIp: event.requestContext.identity.sourceIp
  });

  try {
    // Initialize services on cold start
    await initializeServices();

    // Apply security validation first
    // Requirements: 5.2, 5.3, 5.6 - Security middleware validation
    const securityViolation = await defaultSecurityMiddleware.validateRequest(event);
    if (securityViolation) {
      requestLogger.warn('Security violation detected', { 
        sourceIp: event.requestContext.identity.sourceIp,
        statusCode: securityViolation.statusCode
      });
      perfLogger.end({ success: false, error: 'Security violation' });
      return securityViolation;
    }

    // Handle CORS preflight requests
    // Requirement 6.2: CORS support
    if (event.httpMethod === 'OPTIONS') {
      requestLogger.info('Handling CORS preflight request');
      perfLogger.end({ success: true, endpoint: 'OPTIONS' });
      return handleOptionsRequest();
    }

    // Validate HTTP method
    // Requirement 6.2: HTTP method validation
    if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
      requestLogger.warn('Invalid HTTP method', { method: event.httpMethod });
      // Legacy logging format for tests
      console.warn('[Lambda] Invalid HTTP method:', event.httpMethod);
      perfLogger.end({ success: false, error: 'Invalid HTTP method' });
      throw ErrorFactory.validation(`Method ${event.httpMethod} not allowed`);
    }

    // Apply rate limiting
    // Requirement 5.1: Rate limiting middleware
    const rateLimitResult = await defaultRateLimiter.checkRateLimit(event);
    if (rateLimitResult) {
      requestLogger.warn('Rate limit exceeded', { 
        sourceIp: event.requestContext.identity.sourceIp 
      });
      perfLogger.end({ success: false, error: 'Rate limit exceeded' });
      // Add security headers to rate limit response
      return defaultSecurityMiddleware.addSecurityHeaders(rateLimitResult);
    }

    // Route requests based on path and method
    let response: APIGatewayProxyResult;

    if (event.path === '/health' && event.httpMethod === 'GET') {
      // Health check endpoint
      requestLogger.info('Processing health check request');
      response = await handleHealthCheck();
    } else if (event.path === '/explain-error' && event.httpMethod === 'POST') {
      // Main error explanation endpoint
      requestLogger.info('Processing explain-error request');
      response = await handleExplainErrorRequest(event);
    } else {
      // Unknown endpoint
      requestLogger.warn('Unknown endpoint', { path: event.path });
      perfLogger.end({ success: false, error: 'Unknown endpoint' });
      throw ErrorFactory.validation(`Endpoint ${event.path} not found`);
    }

    // Add rate limit headers to response
    // Requirement 5.3: Rate limit headers in responses
    response = await defaultRateLimiter.addRateLimitHeaders(response, event);

    // Ensure security headers are added to final response
    // Requirement 5.2: Security headers on all responses
    response = defaultSecurityMiddleware.addSecurityHeaders(response);

    requestLogger.info('Request completed', {
      statusCode: response.statusCode,
      success: response.statusCode < 400
    });

    perfLogger.end({ 
      success: response.statusCode < 400, 
      statusCode: response.statusCode 
    });

    return response;

  } catch (error) {
    requestLogger.error('Unhandled error in Lambda handler', {}, error instanceof Error ? error : new Error(String(error)));
    perfLogger.end({ success: false, error: error instanceof Error ? error.message : String(error) });
    
    // Use global error handler for consistent error processing
    return globalErrorHandler.handleError(error, { requestId, handler: 'main' });
  }
};

/**
 * Lambda cleanup handler (called on container shutdown)
 */
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, cleaning up...');
  
  if (errorExplanationService) {
    errorExplanationService.cleanup();
  }
  
  defaultRateLimiter.destroy();
  
  // Reset security violation statistics
  defaultSecurityMiddleware.resetViolationStats();
  
  // Reset error statistics
  globalErrorHandler.resetErrorStats();
  
  logger.info('Cleanup completed');
});
