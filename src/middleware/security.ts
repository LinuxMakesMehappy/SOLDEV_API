/**
 * Security middleware for comprehensive input sanitization and security headers
 * Requirements: 5.2, 5.3, 5.6 - HTTPS enforcement, input sanitization, security headers
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { logger } from '../utils/logger';
import { ThreatIntelligenceService } from '../services/threat-intelligence-service';

/**
 * Security configuration interface
 */
export interface SecurityConfig {
  enforceHttps: boolean;
  maxRequestSize: number; // in bytes
  allowedOrigins: string[];
  enableSecurityHeaders: boolean;
  sanitizeInput: boolean;
  blockSuspiciousPatterns: boolean;
}

/**
 * Security violation types for logging and monitoring
 */
export enum SecurityViolationType {
  HTTPS_REQUIRED = 'HTTPS_REQUIRED',
  REQUEST_TOO_LARGE = 'REQUEST_TOO_LARGE',
  INVALID_ORIGIN = 'INVALID_ORIGIN',
  SUSPICIOUS_PATTERN = 'SUSPICIOUS_PATTERN',
  INVALID_CONTENT_TYPE = 'INVALID_CONTENT_TYPE',
  MALFORMED_JSON = 'MALFORMED_JSON',
  XSS_ATTEMPT = 'XSS_ATTEMPT',
  SQL_INJECTION_ATTEMPT = 'SQL_INJECTION_ATTEMPT',
  COMMAND_INJECTION_ATTEMPT = 'COMMAND_INJECTION_ATTEMPT',
  THREAT_INTELLIGENCE_MATCH = 'THREAT_INTELLIGENCE_MATCH'
}

/**
 * Security violation result
 */
export interface SecurityViolation {
  type: SecurityViolationType;
  message: string;
  details?: any;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Input sanitization patterns for detecting malicious content
 */
const SUSPICIOUS_PATTERNS = {
  // XSS patterns - more specific to avoid false positives
  xss: [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:\s*[^;]/gi,
    /on\w+\s*=\s*['"]/gi,
    /<iframe\b[^>]*src\s*=\s*['"]/gi,
    /<object\b[^>]*data\s*=\s*['"]/gi,
    /<embed\b[^>]*src\s*=\s*['"]/gi,
    /<svg\b[^>]*onload\s*=/gi,
    /<body\b[^>]*onload\s*=/gi
  ],
  
  // SQL injection patterns - more specific
  sqlInjection: [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\s+)/gi,
    /(\b(OR|AND)\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?)/gi,
    /(;\s*(DROP|DELETE|INSERT|UPDATE)\s+)/gi,
    /(\b(WAITFOR|DELAY)\s+)/gi,
    /(EXEC\s+xp_cmdshell)/gi,
    /('\s+(OR|AND)\s+')/gi
  ],
  
  // Command injection patterns - more specific
  commandInjection: [
    /(;\s*(rm|cat|ls|ps|kill|chmod|chown|sudo|su)\s+)/gi,
    /(\|\s*(rm|cat|ls|ps|kill|chmod|chown|sudo|su)\s+)/gi,
    /(\&\&\s*(rm|cat|ls|ps|kill|chmod|chown|sudo|su)\s+)/gi,
    /(`[^`]*rm\s+)/gi,
    /(\$\([^)]*rm\s+)/gi
  ],
  
  // Path traversal patterns
  pathTraversal: [
    /(\.\.[\/\\]){2,}/g,
    /[\/\\]etc[\/\\]passwd/gi,
    /[\/\\]windows[\/\\]system32/gi
  ]
};

/**
 * Security headers to add to all responses
 * Requirement 5.2: Security headers implementation
 */
const SECURITY_HEADERS = {
  // Prevent clickjacking
  'X-Frame-Options': 'DENY',
  
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',
  
  // Enable XSS protection
  'X-XSS-Protection': '1; mode=block',
  
  // Referrer policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  
  // Content Security Policy
  'Content-Security-Policy': "default-src 'none'; script-src 'none'; object-src 'none'; base-uri 'none';",
  
  // Strict Transport Security (HSTS)
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  
  // Permissions policy
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()'
};

/**
 * Input sanitizer class for comprehensive input validation
 */
export class InputSanitizer {
  /**
   * Sanitize string input by removing/escaping dangerous characters
   * @param input - Raw string input
   * @returns Sanitized string
   */
  static sanitizeString(input: string): string {
    if (typeof input !== 'string') {
      return String(input);
    }

    return input
      // Remove null bytes
      .replace(/\0/g, '')
      // Escape HTML entities
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;')
      // Remove control characters except newline, carriage return, and tab
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Limit length to prevent DoS
      .substring(0, 10000);
  }

  /**
   * Validate and sanitize JSON input with threat intelligence
   * @param jsonString - Raw JSON string
   * @returns Parsed and sanitized object
   */
  static async sanitizeJson(jsonString: string): Promise<any> {
    if (!jsonString || typeof jsonString !== 'string') {
      throw new Error('Invalid JSON input');
    }

    // Check for suspicious patterns before parsing (now async)
    const violations = await this.detectSuspiciousPatterns(jsonString);
    if (violations.length > 0) {
      const criticalViolations = violations.filter(v => v.severity === 'critical' || v.severity === 'high');
      if (criticalViolations.length > 0 && criticalViolations[0]) {
        throw new Error(`Security violation detected: ${criticalViolations[0].message}`);
      }
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonString);
    } catch (error) {
      throw new Error('Malformed JSON input');
    }

    // Recursively sanitize object properties
    return this.sanitizeObject(parsed);
  }

  /**
   * Recursively sanitize object properties
   * @param obj - Object to sanitize
   * @returns Sanitized object
   */
  private static sanitizeObject(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }

    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }

    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Sanitize both key and value
        const sanitizedKey = this.sanitizeString(key);
        sanitized[sanitizedKey] = this.sanitizeObject(value);
      }
      return sanitized;
    }

    return obj;
  }

  /**
   * Detect suspicious patterns in input using static and dynamic threat intelligence
   * @param input - Input string to check
   * @returns Array of security violations
   */
  static async detectSuspiciousPatterns(input: string): Promise<SecurityViolation[]> {
    const violations: SecurityViolation[] = [];

    // Always check static patterns first (existing implementation)
    violations.push(...this.detectStaticPatterns(input));

    // Check dynamic threat intelligence patterns (additional layer)
    try {
      const threats = await ThreatIntelligenceService.detectThreats(input);
      for (const threat of threats) {
        violations.push({
          type: SecurityViolationType.THREAT_INTELLIGENCE_MATCH,
          message: `Threat intelligence match: ${threat.description}`,
          details: { 
            threatType: threat.type,
            pattern: threat.pattern,
            severity: threat.severity,
            source: 'threat_intelligence'
          },
          severity: threat.severity as SecurityViolation['severity']
        });
      }
    } catch (error) {
      // Static patterns already added above, so we still have protection
      logger.warn('Failed to check threat intelligence, using static patterns only', error instanceof Error ? error : new Error(String(error)));
    }

    return violations;
  }

  /**
   * Detect suspicious patterns using static patterns (original implementation)
   * @param input - Input string to check
   * @returns Array of security violations
   */
  private static detectStaticPatterns(input: string): SecurityViolation[] {
    const violations: SecurityViolation[] = [];

    // Check XSS patterns
    for (const pattern of SUSPICIOUS_PATTERNS.xss) {
      if (pattern.test(input)) {
        violations.push({
          type: SecurityViolationType.XSS_ATTEMPT,
          message: 'Potential XSS attack detected',
          details: { pattern: pattern.source },
          severity: 'high'
        });
      }
    }

    // Check SQL injection patterns
    for (const pattern of SUSPICIOUS_PATTERNS.sqlInjection) {
      if (pattern.test(input)) {
        violations.push({
          type: SecurityViolationType.SQL_INJECTION_ATTEMPT,
          message: 'Potential SQL injection detected',
          details: { pattern: pattern.source },
          severity: 'critical'
        });
      }
    }

    // Check command injection patterns
    for (const pattern of SUSPICIOUS_PATTERNS.commandInjection) {
      if (pattern.test(input)) {
        violations.push({
          type: SecurityViolationType.COMMAND_INJECTION_ATTEMPT,
          message: 'Potential command injection detected',
          details: { pattern: pattern.source },
          severity: 'critical'
        });
      }
    }

    // Check path traversal patterns
    for (const pattern of SUSPICIOUS_PATTERNS.pathTraversal) {
      if (pattern.test(input)) {
        violations.push({
          type: SecurityViolationType.SUSPICIOUS_PATTERN,
          message: 'Potential path traversal detected',
          details: { pattern: pattern.source },
          severity: 'high'
        });
      }
    }

    return violations;
  }
}

/**
 * Security middleware class for comprehensive request validation
 */
export class SecurityMiddleware {
  private config: SecurityConfig;
  private violationCounts = new Map<string, number>();

  constructor(config: SecurityConfig) {
    this.config = config;
  }

  /**
   * Validate request security and return error response if violations found
   * @param event - API Gateway event
   * @returns Security violation response or null if valid
   */
  async validateRequest(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult | null> {
    const violations: SecurityViolation[] = [];
    const clientIp = this.getClientIp(event);

    try {
      // 1. HTTPS enforcement
      if (this.config.enforceHttps) {
        const httpsViolation = this.validateHttps(event);
        if (httpsViolation) violations.push(httpsViolation);
      }

      // 2. Request size validation
      const sizeViolation = this.validateRequestSize(event);
      if (sizeViolation) violations.push(sizeViolation);

      // 3. Origin validation
      const originViolation = this.validateOrigin(event);
      if (originViolation) violations.push(originViolation);

      // 4. Content type validation
      const contentTypeViolation = this.validateContentType(event);
      if (contentTypeViolation) violations.push(contentTypeViolation);

      // 5. Input sanitization and suspicious pattern detection with threat intelligence
      if (this.config.sanitizeInput && event.body) {
        const inputViolations = await this.validateInput(event.body);
        violations.push(...inputViolations);
      }

      // Log violations
      if (violations.length > 0) {
        this.logSecurityViolations(violations, clientIp, event);
        
        // Track violation counts per IP
        const currentCount = this.violationCounts.get(clientIp) || 0;
        this.violationCounts.set(clientIp, currentCount + violations.length);

        // Return error response for critical violations
        const criticalViolations = violations.filter(v => 
          v.severity === 'critical' || v.severity === 'high'
        );
        
        if (criticalViolations.length > 0 && criticalViolations[0]) {
          return this.createSecurityErrorResponse(criticalViolations[0]);
        }
      }

      return null; // No violations or only low-severity violations

    } catch (error) {
      logger.error('Security validation error', { clientIp }, error instanceof Error ? error : new Error(String(error)));
      
      // Return generic error to avoid information disclosure
      return this.createSecurityErrorResponse({
        type: SecurityViolationType.SUSPICIOUS_PATTERN,
        message: 'Request validation failed',
        severity: 'high'
      });
    }
  }

  /**
   * Add security headers to response
   * @param response - Original response
   * @returns Response with security headers
   */
  addSecurityHeaders(response: APIGatewayProxyResult): APIGatewayProxyResult {
    if (!this.config.enableSecurityHeaders) {
      return response;
    }

    return {
      ...response,
      headers: {
        ...response.headers,
        ...SECURITY_HEADERS
      }
    };
  }

  /**
   * Validate HTTPS enforcement
   */
  private validateHttps(event: APIGatewayProxyEvent): SecurityViolation | null {
    const protocol = event.headers['X-Forwarded-Proto'] || 
                    event.headers['x-forwarded-proto'] || 
                    'https'; // Default to https for Lambda

    if (protocol.toLowerCase() !== 'https') {
      return {
        type: SecurityViolationType.HTTPS_REQUIRED,
        message: 'HTTPS is required for all requests',
        severity: 'high'
      };
    }

    return null;
  }

  /**
   * Validate request size
   */
  private validateRequestSize(event: APIGatewayProxyEvent): SecurityViolation | null {
    const bodySize = event.body ? Buffer.byteLength(event.body, 'utf8') : 0;
    
    if (bodySize > this.config.maxRequestSize) {
      return {
        type: SecurityViolationType.REQUEST_TOO_LARGE,
        message: `Request size ${bodySize} exceeds maximum allowed ${this.config.maxRequestSize}`,
        details: { size: bodySize, maxSize: this.config.maxRequestSize },
        severity: 'high'
      };
    }

    return null;
  }

  /**
   * Validate origin header
   */
  private validateOrigin(event: APIGatewayProxyEvent): SecurityViolation | null {
    const origin = event.headers['Origin'] || event.headers['origin'];
    
    if (origin && this.config.allowedOrigins.length > 0) {
      const isAllowed = this.config.allowedOrigins.some(allowed => 
        allowed === '*' || origin === allowed || origin.endsWith(allowed)
      );
      
      if (!isAllowed) {
        return {
          type: SecurityViolationType.INVALID_ORIGIN,
          message: `Origin ${origin} is not allowed`,
          details: { origin, allowedOrigins: this.config.allowedOrigins },
          severity: 'high'
        };
      }
    }

    return null;
  }

  /**
   * Validate content type for POST requests
   */
  private validateContentType(event: APIGatewayProxyEvent): SecurityViolation | null {
    if (event.httpMethod === 'POST' && event.body) {
      const contentType = event.headers['Content-Type'] || event.headers['content-type'];
      
      if (!contentType || !contentType.includes('application/json')) {
        return {
          type: SecurityViolationType.INVALID_CONTENT_TYPE,
          message: 'Content-Type must be application/json for POST requests',
          details: { contentType },
          severity: 'high'
        };
      }
    }

    return null;
  }

  /**
   * Validate input for suspicious patterns with threat intelligence
   */
  private async validateInput(body: string): Promise<SecurityViolation[]> {
    if (!this.config.blockSuspiciousPatterns) {
      return [];
    }

    return await InputSanitizer.detectSuspiciousPatterns(body);
  }

  /**
   * Get client IP address from event
   */
  private getClientIp(event: APIGatewayProxyEvent): string {
    const forwardedFor = event.headers['X-Forwarded-For'] || event.headers['x-forwarded-for'];
    const realIp = event.headers['X-Real-IP'] || event.headers['x-real-ip'];
    const cfConnectingIp = event.headers['CF-Connecting-IP'] || event.headers['cf-connecting-ip'];
    
    return forwardedFor?.split(',')[0]?.trim() || 
           realIp || 
           cfConnectingIp || 
           event.requestContext.identity.sourceIp || 
           'unknown';
  }

  /**
   * Log security violations
   */
  private logSecurityViolations(
    violations: SecurityViolation[], 
    clientIp: string, 
    event: APIGatewayProxyEvent
  ): void {
    const criticalCount = violations.filter(v => v.severity === 'critical').length;
    const highCount = violations.filter(v => v.severity === 'high').length;
    
    const logLevel = criticalCount > 0 ? 'error' : highCount > 0 ? 'warn' : 'info';
    
    logger[logLevel]('Security violations detected', {
      clientIp,
      violationCount: violations.length,
      criticalCount,
      highCount,
      violations: violations.map(v => ({
        type: v.type,
        message: v.message,
        severity: v.severity
      })),
      userAgent: event.headers['User-Agent'] || 'unknown',
      path: event.path,
      method: event.httpMethod
    });
  }

  /**
   * Create security error response
   */
  private createSecurityErrorResponse(violation: SecurityViolation): APIGatewayProxyResult {
    const statusCode = violation.severity === 'critical' ? 403 : 400;
    
    const response = {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: JSON.stringify({
        error: 'Request blocked due to security policy violation',
        code: statusCode,
        timestamp: new Date().toISOString()
      })
    };

    return this.addSecurityHeaders(response);
  }

  /**
   * Get violation statistics
   */
  getViolationStats(): {
    totalIps: number;
    totalViolations: number;
    topViolators: Array<{ ip: string; count: number }>;
  } {
    const totalViolations = Array.from(this.violationCounts.values()).reduce((sum, count) => sum + count, 0);
    const topViolators = Array.from(this.violationCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, count }));

    return {
      totalIps: this.violationCounts.size,
      totalViolations,
      topViolators
    };
  }

  /**
   * Reset violation statistics
   */
  resetViolationStats(): void {
    this.violationCounts.clear();
  }
}

/**
 * Default security middleware instance
 * Requirements: 5.2, 5.3, 5.6 - Default security configuration
 */
export const defaultSecurityMiddleware = new SecurityMiddleware({
  enforceHttps: true,
  maxRequestSize: 1024 * 1024, // 1MB
  allowedOrigins: ['*'], // Allow all origins for public API
  enableSecurityHeaders: true,
  sanitizeInput: true,
  blockSuspiciousPatterns: true
});

/**
 * Create custom security middleware with specific configuration
 */
export function createSecurityMiddleware(config: Partial<SecurityConfig>): SecurityMiddleware {
  const defaultConfig: SecurityConfig = {
    enforceHttps: true,
    maxRequestSize: 1024 * 1024, // 1MB
    allowedOrigins: ['*'],
    enableSecurityHeaders: true,
    sanitizeInput: true,
    blockSuspiciousPatterns: true
  };

  return new SecurityMiddleware({ ...defaultConfig, ...config });
}