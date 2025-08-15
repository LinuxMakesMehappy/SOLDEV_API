/**
 * Unit tests for global error handling system
 * Requirements: 5.4, 6.6, 7.4 - Error handling and logging tests
 */

import { 
  GlobalErrorHandler, 
  APIError, 
  ErrorFactory, 
  ErrorCategory, 
  ErrorSeverity 
} from '../../src/utils/error-handler';

describe('GlobalErrorHandler', () => {
  let errorHandler: GlobalErrorHandler;

  beforeEach(() => {
    errorHandler = GlobalErrorHandler.getInstance();
    errorHandler.resetErrorStats();
    jest.clearAllMocks();
  });

  describe('Error Categorization', () => {
    test('should categorize validation errors correctly', () => {
      const error = new Error('Invalid error code format');
      const response = errorHandler.handleError(error);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Invalid error code format');
    });

    test('should categorize rate limit errors correctly', () => {
      const error = new Error('Rate limit exceeded');
      const response = errorHandler.handleError(error);

      expect(response.statusCode).toBe(429);
      expect(response.headers?.['Retry-After']).toBe('60');
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Rate limit exceeded');
    });

    test('should categorize timeout errors correctly', () => {
      const error = new Error('Request timed out');
      const response = errorHandler.handleError(error);

      expect(response.statusCode).toBe(504);
      expect(response.headers?.['Retry-After']).toBe('5');
      const body = JSON.parse(response.body);
      expect(body.error).toContain('timed out');
    });

    test('should categorize service unavailable errors correctly', () => {
      const error = new Error('Service unavailable');
      const response = errorHandler.handleError(error);

      expect(response.statusCode).toBe(503);
      expect(response.headers?.['Retry-After']).toBe('30');
      const body = JSON.parse(response.body);
      expect(body.error).toContain('temporarily unavailable');
    });

    test('should categorize AI service errors correctly', () => {
      const error = new Error('Bedrock service error');
      const response = errorHandler.handleError(error);

      expect(response.statusCode).toBe(503);
      expect(response.headers?.['Retry-After']).toBe('30');
      const body = JSON.parse(response.body);
      expect(body.error).toContain('temporarily unavailable');
    });

    test('should categorize cache errors correctly', () => {
      const error = new Error('DynamoDB connection failed');
      const response = errorHandler.handleError(error);

      expect(response.statusCode).toBe(503);
      expect(response.headers?.['Retry-After']).toBe('10');
      const body = JSON.parse(response.body);
      expect(body.error).toContain('temporarily unavailable');
    });

    test('should categorize external API errors correctly', () => {
      const error = new Error('External API failed');
      const response = errorHandler.handleError(error);

      expect(response.statusCode).toBe(503);
      expect(response.headers?.['Retry-After']).toBe('15');
      const body = JSON.parse(response.body);
      expect(body.error).toContain('temporarily unavailable');
    });

    test('should handle unknown errors with internal error category', () => {
      const error = new Error('Something unexpected happened');
      const response = errorHandler.handleError(error);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Internal server error');
    });

    test('should handle non-Error objects', () => {
      const error = 'String error';
      const response = errorHandler.handleError(error);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('unexpected error');
    });
  });

  describe('APIError Handling', () => {
    test('should handle APIError instances correctly', () => {
      const apiError = new APIError({
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.LOW,
        statusCode: 400,
        message: 'Test validation error',
        userMessage: 'Custom user message',
        retryable: false,
        context: { field: 'errorCode' }
      });

      const response = errorHandler.handleError(apiError);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Custom user message');
      expect(body.code).toBe(400);
    });

    test('should preserve context from APIError', () => {
      const apiError = new APIError({
        category: ErrorCategory.TIMEOUT,
        severity: ErrorSeverity.MEDIUM,
        statusCode: 504,
        message: 'Test timeout',
        userMessage: 'Request timed out',
        retryable: true,
        context: { operation: 'test' }
      });

      const response = errorHandler.handleError(apiError, { requestId: '123' });

      expect(response.statusCode).toBe(504);
      expect(response.headers?.['Retry-After']).toBe('5');
    });
  });

  describe('Error Statistics', () => {
    test('should track error statistics', () => {
      // Get the singleton instance and reset stats for this test
      const testErrorHandler = GlobalErrorHandler.getInstance();
      testErrorHandler.resetErrorStats();
      
      const error1 = new Error('Invalid input');
      const error2 = new Error('Rate limit exceeded');
      const error3 = new Error('Invalid format');

      testErrorHandler.handleError(error1);
      testErrorHandler.handleError(error2);
      testErrorHandler.handleError(error3);

      const stats = testErrorHandler.getErrorStats();
      expect(stats['totalErrors']).toBe(3);
      expect(stats['errorsByCategory']['validation']).toBe(2);
      expect(stats['errorsByCategory']['rate_limit']).toBe(1);
    });

    test('should reset error statistics', () => {
      const error = new Error('Test error');
      errorHandler.handleError(error);

      let stats = errorHandler.getErrorStats();
      expect(stats['totalErrors']).toBe(1);

      errorHandler.resetErrorStats();
      stats = errorHandler.getErrorStats();
      expect(stats['totalErrors']).toBe(0);
    });
  });

  describe('CORS Headers', () => {
    test('should include CORS headers in all responses', () => {
      const error = new Error('Test error');
      const response = errorHandler.handleError(error);

      expect(response.headers).toMatchObject({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': expect.any(String),
        'Access-Control-Allow-Methods': expect.any(String)
      });
    });
  });

  describe('Response Format', () => {
    test('should return properly formatted error response', () => {
      const error = new Error('Test error');
      const response = errorHandler.handleError(error);

      expect(response).toMatchObject({
        statusCode: expect.any(Number),
        headers: expect.any(Object),
        body: expect.any(String)
      });

      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        error: expect.any(String),
        code: expect.any(Number),
        timestamp: expect.any(String)
      });

      // Validate timestamp format
      expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    });
  });
});

describe('ErrorFactory', () => {
  test('should create validation error', () => {
    const error = ErrorFactory.validation('Invalid input');

    expect(error).toBeInstanceOf(APIError);
    expect(error.category).toBe(ErrorCategory.VALIDATION);
    expect(error.severity).toBe(ErrorSeverity.LOW);
    expect(error.statusCode).toBe(400);
    expect(error.retryable).toBe(false);
  });

  test('should create rate limit error', () => {
    const error = ErrorFactory.rateLimit('Too many requests', 60);

    expect(error).toBeInstanceOf(APIError);
    expect(error.category).toBe(ErrorCategory.RATE_LIMIT);
    expect(error.severity).toBe(ErrorSeverity.MEDIUM);
    expect(error.statusCode).toBe(429);
    expect(error.retryable).toBe(true);
    expect(error.context['retryAfter']).toBe(60);
  });

  test('should create timeout error', () => {
    const error = ErrorFactory.timeout('Request timeout');

    expect(error).toBeInstanceOf(APIError);
    expect(error.category).toBe(ErrorCategory.TIMEOUT);
    expect(error.severity).toBe(ErrorSeverity.MEDIUM);
    expect(error.statusCode).toBe(504);
    expect(error.retryable).toBe(true);
  });

  test('should create service unavailable error', () => {
    const error = ErrorFactory.serviceUnavailable('Service down');

    expect(error).toBeInstanceOf(APIError);
    expect(error.category).toBe(ErrorCategory.SERVICE_UNAVAILABLE);
    expect(error.severity).toBe(ErrorSeverity.HIGH);
    expect(error.statusCode).toBe(503);
    expect(error.retryable).toBe(true);
  });

  test('should create internal error', () => {
    const error = ErrorFactory.internal('Internal failure');

    expect(error).toBeInstanceOf(APIError);
    expect(error.category).toBe(ErrorCategory.INTERNAL);
    expect(error.severity).toBe(ErrorSeverity.HIGH);
    expect(error.statusCode).toBe(500);
    expect(error.retryable).toBe(true);
  });

  test('should include context in created errors', () => {
    const context = { operation: 'test', userId: '123' };
    const error = ErrorFactory.validation('Test error', context);

    expect(error.context).toEqual(context);
  });
});

describe('APIError', () => {
  test('should create APIError with all properties', () => {
    const errorInfo = {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.LOW,
      statusCode: 400,
      message: 'Test error',
      userMessage: 'User friendly message',
      retryable: false,
      context: { field: 'test' }
    };

    const error = new APIError(errorInfo);

    expect(error.name).toBe('APIError');
    expect(error.message).toBe('Test error');
    expect(error.category).toBe(ErrorCategory.VALIDATION);
    expect(error.severity).toBe(ErrorSeverity.LOW);
    expect(error.statusCode).toBe(400);
    expect(error.userMessage).toBe('User friendly message');
    expect(error.retryable).toBe(false);
    expect(error.context).toEqual({ field: 'test' });
    expect(error.timestamp).toBeInstanceOf(Date);
  });

  test('should maintain proper stack trace', () => {
    const error = ErrorFactory.internal('Test error');
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('APIError');
  });

  test('should handle missing context', () => {
    const errorInfo = {
      category: ErrorCategory.INTERNAL,
      severity: ErrorSeverity.HIGH,
      statusCode: 500,
      message: 'Test error',
      userMessage: 'User message',
      retryable: true
    };

    const error = new APIError(errorInfo);
    expect(error.context).toEqual({});
  });
});

describe('Error Logging', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test('should log errors with appropriate severity', () => {
    const errorHandler = GlobalErrorHandler.getInstance();
    
    const criticalError = new APIError({
      category: ErrorCategory.INTERNAL,
      severity: ErrorSeverity.CRITICAL,
      statusCode: 500,
      message: 'Critical error',
      userMessage: 'Critical error occurred',
      retryable: false
    });

    errorHandler.handleError(criticalError);

    expect(consoleSpy).toHaveBeenCalledWith(
      '[CRITICAL ERROR]',
      expect.objectContaining({
        severity: ErrorSeverity.CRITICAL,
        message: 'Critical error'
      })
    );
  });

  test('should log structured error information', () => {
    const errorHandler = GlobalErrorHandler.getInstance();
    const error = new Error('Test error');
    const context = { requestId: '123', operation: 'test' };

    errorHandler.handleError(error, context);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        timestamp: expect.any(String),
        category: expect.any(String),
        severity: expect.any(String),
        statusCode: expect.any(Number),
        message: 'Test error',
        context: expect.objectContaining(context)
      })
    );
  });
});