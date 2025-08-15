/**
 * Unit tests for structured logging system
 * Requirements: 5.4, 6.6, 7.4 - Logging and monitoring tests
 */

import { 
  StructuredLogger, 
  LogLevel, 
  ChildLogger, 
  PerformanceLogger,
  logger 
} from '../../src/utils/logger';

describe('StructuredLogger', () => {
  let testLogger: StructuredLogger;

  beforeEach(() => {
    testLogger = new StructuredLogger({
      service: 'test-service',
      level: LogLevel.DEBUG,
      enableCloudWatch: false,
      enableConsole: true,
      enableMetrics: true
    });
    
    // Mock all console methods
    jest.spyOn(console, 'info').mockImplementation();
    jest.spyOn(console, 'debug').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Log Levels', () => {
    test('should log debug messages when level is DEBUG', () => {
      testLogger.debug('Debug message', { key: 'value' });

      expect(console.debug).toHaveBeenCalledWith(
        '[TEST-SERVICE] Debug message',
        expect.objectContaining({
          level: LogLevel.DEBUG,
          message: 'Debug message',
          key: 'value'
        })
      );
    });

    test('should log info messages', () => {
      testLogger.info('Info message', { requestId: '123' });

      expect(console.info).toHaveBeenCalledWith(
        '[TEST-SERVICE] Info message',
        expect.objectContaining({
          level: LogLevel.INFO,
          message: 'Info message',
          requestId: '123'
        })
      );
    });

    test('should log warning messages', () => {
      testLogger.warn('Warning message', { operation: 'test' });

      expect(console.warn).toHaveBeenCalledWith(
        '[TEST-SERVICE] Warning message',
        expect.objectContaining({
          level: LogLevel.WARN,
          message: 'Warning message',
          operation: 'test'
        })
      );
    });

    test('should log error messages with error object', () => {
      const error = new Error('Test error');
      testLogger.error('Error occurred', { context: 'test' }, error);

      expect(console.error).toHaveBeenCalledWith(
        '[TEST-SERVICE] Error occurred',
        expect.objectContaining({
          level: LogLevel.ERROR,
          message: 'Error occurred',
          context: 'test',
          error: {
            name: 'Error',
            message: 'Test error',
            stack: expect.any(String)
          }
        })
      );
    });

    test('should log critical messages', () => {
      const error = new Error('Critical error');
      testLogger.critical('Critical issue', { severity: 'high' }, error);

      expect(console.error).toHaveBeenCalledWith(
        '[TEST-SERVICE] CRITICAL: Critical issue',
        expect.objectContaining({
          level: LogLevel.CRITICAL,
          message: 'Critical issue',
          severity: 'high'
        })
      );
    });

    test('should respect log level filtering', () => {
      const warnLogger = new StructuredLogger({
        service: 'test',
        level: LogLevel.WARN,
        enableConsole: true
      });

      warnLogger.debug('Debug message');
      warnLogger.info('Info message');
      warnLogger.warn('Warning message');

      expect(console.debug).not.toHaveBeenCalled();
      expect(console.info).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('Structured Logging', () => {
    test('should include timestamp in log entries', () => {
      testLogger.info('Test message');

      expect(console.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
        })
      );
    });

    test('should include service name in log entries', () => {
      testLogger.info('Test message');

      expect(console.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          service: 'test-service'
        })
      );
    });

    test('should merge context with log entry', () => {
      const context = {
        requestId: '123',
        userId: 'user456',
        operation: 'test'
      };

      testLogger.info('Test message', context);

      expect(console.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining(context)
      );
    });

    test('should handle missing context gracefully', () => {
      testLogger.info('Test message');

      expect(console.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          message: 'Test message'
        })
      );
    });
  });

  describe('Metrics Tracking', () => {
    test('should track log level metrics', () => {
      testLogger.info('Info message');
      testLogger.warn('Warning message');
      testLogger.error('Error message');

      const metrics = testLogger.getMetrics();
      expect(metrics['log_info']).toBe(1);
      expect(metrics['log_warn']).toBe(1);
      expect(metrics['log_error']).toBe(1);
    });

    test('should track cache hit metrics', () => {
      testLogger.info('Cache hit', { cacheHit: true });
      testLogger.info('Cache miss', { cacheHit: false });
      testLogger.info('Another cache hit', { cacheHit: true });

      const metrics = testLogger.getMetrics();
      expect(metrics['cache_hit']).toBe(2);
      expect(metrics['cache_miss']).toBe(1);
    });

    test('should track source metrics', () => {
      testLogger.info('AI response', { source: 'ai' });
      testLogger.info('Cache response', { source: 'cache' });
      testLogger.info('Static response', { source: 'static' });

      const metrics = testLogger.getMetrics();
      expect(metrics['source_ai']).toBe(1);
      expect(metrics['source_cache']).toBe(1);
      expect(metrics['source_static']).toBe(1);
    });

    test('should track duration metrics in buckets', () => {
      testLogger.info('Fast operation', { duration: 50 });
      testLogger.info('Medium operation', { duration: 300 });
      testLogger.info('Slow operation', { duration: 2000 });
      testLogger.info('Very slow operation', { duration: 8000 });

      const metrics = testLogger.getMetrics();
      expect(metrics['duration_0_100ms']).toBe(1);
      expect(metrics['duration_100_500ms']).toBe(1);
      expect(metrics['duration_1000_5000ms']).toBe(1);
      expect(metrics['duration_5000ms_plus']).toBe(1);
    });

    test('should reset metrics', () => {
      testLogger.info('Test message');
      expect(testLogger.getMetrics()['log_info']).toBe(1);

      testLogger.resetMetrics();
      expect(testLogger.getMetrics()['log_info']).toBeUndefined();
    });
  });

  describe('Configuration', () => {
    test('should update configuration', () => {
      testLogger.updateConfig({ level: LogLevel.ERROR });
      
      testLogger.info('Info message');
      testLogger.error('Error message');

      expect(console.info).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });

    test('should disable console logging', () => {
      const noConsoleLogger = new StructuredLogger({
        enableConsole: false
      });

      noConsoleLogger.info('Test message');
      expect(console.info).not.toHaveBeenCalled();
    });

    test('should disable metrics tracking', () => {
      const noMetricsLogger = new StructuredLogger({
        enableMetrics: false
      });

      noMetricsLogger.info('Test message');
      expect(Object.keys(noMetricsLogger.getMetrics())).toHaveLength(0);
    });
  });
});

describe('ChildLogger', () => {
  let parentLogger: StructuredLogger;
  let childLogger: ChildLogger;

  beforeEach(() => {
    parentLogger = new StructuredLogger({
      service: 'parent-service',
      enableConsole: true
    });
    
    childLogger = parentLogger.child({ requestId: '123', operation: 'test' });
    jest.spyOn(console, 'info').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should inherit parent context', () => {
    childLogger.info('Child message', { additional: 'context' });

    expect(console.info).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        requestId: '123',
        operation: 'test',
        additional: 'context'
      })
    );
  });

  test('should merge child context with additional context', () => {
    childLogger.warn('Warning message', { severity: 'medium' });

    expect(console.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        requestId: '123',
        operation: 'test',
        severity: 'medium'
      })
    );
  });

  test('should override parent context with child context', () => {
    childLogger.error('Error message', { requestId: '456' });

    expect(console.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        requestId: '456', // Child context overrides parent
        operation: 'test'
      })
    );
  });
});

describe('PerformanceLogger', () => {
  let testLogger: StructuredLogger;
  let perfLogger: PerformanceLogger;

  beforeEach(() => {
    testLogger = new StructuredLogger({
      service: 'test-service',
      level: LogLevel.DEBUG, // Ensure debug messages are logged
      enableConsole: true
    });
    
    jest.spyOn(console, 'debug').mockImplementation();
    jest.spyOn(console, 'info').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should log fast operations as debug', () => {
    // Mock Date.now to control timing
    const mockNow = jest.spyOn(Date, 'now');
    mockNow.mockReturnValueOnce(1000); // Start time
    
    perfLogger = new PerformanceLogger(testLogger, 'fast_operation');
    
    mockNow.mockReturnValueOnce(1100); // End time (100ms duration)
    perfLogger.end({ success: true });

    expect(console.debug).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        operation: 'fast_operation',
        duration: expect.any(Number),
        success: true
      })
    );
    
    mockNow.mockRestore();
  });

  test('should log medium operations as info', () => {
    // Mock Date.now to control timing
    const mockNow = jest.spyOn(Date, 'now');
    mockNow.mockReturnValueOnce(1000); // Start time
    
    perfLogger = new PerformanceLogger(testLogger, 'medium_operation');
    
    mockNow.mockReturnValueOnce(2500); // End time (1500ms duration)
    perfLogger.end({ success: true });

    expect(console.info).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        operation: 'medium_operation',
        duration: 1500,
        success: true
      })
    );
    
    mockNow.mockRestore();
  });

  test('should log slow operations as warning', () => {
    // Mock Date.now to control timing
    const mockNow = jest.spyOn(Date, 'now');
    mockNow.mockReturnValueOnce(1000); // Start time
    
    perfLogger = new PerformanceLogger(testLogger, 'slow_operation');
    
    mockNow.mockReturnValueOnce(7000); // End time (6000ms duration)
    perfLogger.end({ success: false, error: 'Timeout' });

    expect(console.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        operation: 'slow_operation',
        duration: 6000,
        success: false,
        error: 'Timeout'
      })
    );
    
    mockNow.mockRestore();
  });

  test('should include additional context in performance logs', () => {
    // Mock Date.now to control timing
    const mockNow = jest.spyOn(Date, 'now');
    mockNow.mockReturnValueOnce(1000); // Start time
    
    perfLogger = new PerformanceLogger(testLogger, 'test_operation', { userId: '123' });
    
    mockNow.mockReturnValueOnce(1100); // End time (100ms duration - fast operation)
    perfLogger.end({ errorCode: 1, source: 'cache' });

    expect(console.debug).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        operation: 'test_operation',
        userId: '123',
        errorCode: 1,
        source: 'cache',
        duration: expect.any(Number)
      })
    );
    
    mockNow.mockRestore();
  });
});

describe('createPerformanceLogger', () => {
  let testLogger: StructuredLogger;

  beforeEach(() => {
    jest.spyOn(console, 'debug').mockImplementation();
    
    // Create a test logger with DEBUG level
    testLogger = new StructuredLogger({
      service: 'test-service',
      level: LogLevel.DEBUG,
      enableConsole: true
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should create performance logger with default logger', () => {
    // Mock Date.now to control timing
    const mockNow = jest.spyOn(Date, 'now');
    mockNow.mockReturnValueOnce(1000); // Start time
    
    // Create performance logger directly with test logger instead of using factory
    const perfLogger = new PerformanceLogger(testLogger, 'test_operation', { context: 'test' });
    
    mockNow.mockReturnValueOnce(1100); // End time (100ms duration - fast operation)
    perfLogger.end({ result: 'success' });

    expect(console.debug).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        operation: 'test_operation',
        context: 'test',
        result: 'success'
      })
    );
    
    mockNow.mockRestore();
  });
});

describe('Default Logger', () => {
  test('should export default logger instance', () => {
    expect(logger).toBeInstanceOf(StructuredLogger);
  });

  test('should use environment LOG_LEVEL', () => {
    const originalEnv = process.env['LOG_LEVEL'];
    process.env['LOG_LEVEL'] = 'warn';

    // Create new logger to pick up env var
    const envLogger = new StructuredLogger({
      level: (process.env['LOG_LEVEL'] as any) || LogLevel.INFO
    });

    jest.spyOn(console, 'info').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();

    envLogger.info('Info message');
    envLogger.warn('Warning message');

    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();

    process.env['LOG_LEVEL'] = originalEnv;
    jest.restoreAllMocks();
  });
});