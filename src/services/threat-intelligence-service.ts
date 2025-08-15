/**
 * Threat Intelligence Service for real-time security threat detection
 * Enhancement to Task 11 security measures based on senior dev review
 */

import { logger } from '../utils/logger';

/**
 * Threat signature interface for pattern matching
 */
export interface ThreatSignature {
  id: string;
  type: 'xss' | 'sql_injection' | 'command_injection' | 'path_traversal' | 'malware' | 'phishing';
  pattern: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  source: string;
  lastUpdated: Date;
}

/**
 * Threat intelligence feed response
 */
interface ThreatFeedResponse {
  indicators: Array<{
    indicator: string;
    type: string;
    description: string;
    created: string;
  }>;
  pulse_info: {
    name: string;
    description: string;
    created: string;
  };
}

/**
 * Compiled threat patterns for efficient matching
 */
interface CompiledThreatPatterns {
  xss: RegExp[];
  sql_injection: RegExp[];
  command_injection: RegExp[];
  path_traversal: RegExp[];
  malware: RegExp[];
  phishing: RegExp[];
}

/**
 * Simple cache interface for threat intelligence
 */
interface ThreatCache {
  get(key: string): Promise<ThreatSignature[] | null>;
  set(key: string, value: ThreatSignature[], ttl: number): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * In-memory cache implementation for threat intelligence
 */
class InMemoryThreatCache implements ThreatCache {
  private cache = new Map<string, { value: ThreatSignature[]; expiry: number }>();

  async get(key: string): Promise<ThreatSignature[] | null> {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }

  async set(key: string, value: ThreatSignature[], ttl: number): Promise<void> {
    const expiry = Date.now() + (ttl * 1000);
    this.cache.set(key, { value, expiry });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }
}

/**
 * Threat Intelligence Service for dynamic security pattern updates
 */
export class ThreatIntelligenceService {
  private static readonly CACHE_KEY = 'threat_signatures';
  private static readonly CACHE_TTL = 86400; // 24 hours
  private static cache: ThreatCache = new InMemoryThreatCache();

  // Method to set cache for testing
  static setCache(cache: ThreatCache): void {
    this.cache = cache;
  }

  /**
   * Get latest threat signatures from external feeds
   */
  static async getLatestSignatures(): Promise<CompiledThreatPatterns> {
    try {
      // Try to get from cache first
      const cached = await this.cache.get(this.CACHE_KEY);
      if (cached) {
        logger.debug('Using cached threat signatures');
        return this.compilePatterns(cached);
      }

      // Fetch from external feeds
      logger.info('Fetching latest threat signatures from external feeds');
      const signatures = await this.fetchThreatSignatures();
      
      // Cache the signatures
      await this.cache.set(this.CACHE_KEY, signatures, this.CACHE_TTL);
      
      return this.compilePatterns(signatures);
    } catch (error) {
      logger.warn('Failed to fetch threat signatures, using fallback patterns', error instanceof Error ? error : new Error(String(error)));
      return this.getFallbackPatterns();
    }
  }

  /**
   * Fetch threat signatures from multiple feeds
   */
  private static async fetchThreatSignatures(): Promise<ThreatSignature[]> {
    const signatures: ThreatSignature[] = [];
    
    // Fetch from AlienVault OTX (primary feed)
    try {
      const otxSignatures = await this.fetchFromOTX();
      signatures.push(...otxSignatures);
    } catch (error) {
      logger.warn('Failed to fetch from OTX feed', error instanceof Error ? error : new Error(String(error)));
    }

    // Add more feeds as needed
    // Note: In production, you would implement additional feed parsers

    // Add some curated high-risk patterns
    signatures.push(...this.getCuratedPatterns());

    logger.info(`Fetched ${signatures.length} threat signatures`);
    return signatures;
  }

  /**
   * Fetch signatures from AlienVault OTX
   */
  private static async fetchFromOTX(): Promise<ThreatSignature[]> {
    // Note: This is a simplified implementation
    // In production, you would need proper OTX API integration
    const mockOTXResponse: ThreatFeedResponse = {
      indicators: [
        {
          indicator: '<script[^>]*>.*?</script>',
          type: 'xss',
          description: 'XSS script tag pattern',
          created: new Date().toISOString()
        },
        {
          indicator: '(union|select|insert|delete|drop)\\s+',
          type: 'sql_injection',
          description: 'SQL injection keywords',
          created: new Date().toISOString()
        }
      ],
      pulse_info: {
        name: 'Web Application Threats',
        description: 'Common web application attack patterns',
        created: new Date().toISOString()
      }
    };

    return mockOTXResponse.indicators.map(indicator => ({
      id: `otx_${Date.now()}_${Math.random()}`,
      type: indicator.type as ThreatSignature['type'],
      pattern: indicator.indicator,
      severity: 'high' as const,
      description: indicator.description,
      source: 'AlienVault OTX',
      lastUpdated: new Date(indicator.created)
    }));
  }

  /**
   * Get curated high-risk patterns
   */
  private static getCuratedPatterns(): ThreatSignature[] {
    return [
      {
        id: 'curated_xss_1',
        type: 'xss',
        pattern: 'javascript:\\s*[^\\s]',
        severity: 'critical',
        description: 'JavaScript protocol XSS attempt',
        source: 'Curated',
        lastUpdated: new Date()
      },
      {
        id: 'curated_sqli_1',
        type: 'sql_injection',
        pattern: '\\b(waitfor|delay)\\s+',
        severity: 'critical',
        description: 'SQL time-based injection',
        source: 'Curated',
        lastUpdated: new Date()
      },
      {
        id: 'curated_cmd_1',
        type: 'command_injection',
        pattern: ';\\s*(rm|del|format)\\s+',
        severity: 'critical',
        description: 'Destructive command injection',
        source: 'Curated',
        lastUpdated: new Date()
      },
      {
        id: 'curated_path_1',
        type: 'path_traversal',
        pattern: '(\\.\\.[/\\\\]){3,}',
        severity: 'high',
        description: 'Deep path traversal attempt',
        source: 'Curated',
        lastUpdated: new Date()
      }
    ];
  }

  /**
   * Compile threat signatures into efficient RegExp patterns
   */
  private static compilePatterns(signatures: ThreatSignature[]): CompiledThreatPatterns {
    const patterns: CompiledThreatPatterns = {
      xss: [],
      sql_injection: [],
      command_injection: [],
      path_traversal: [],
      malware: [],
      phishing: []
    };

    for (const signature of signatures) {
      try {
        const regex = new RegExp(signature.pattern, 'gi');
        patterns[signature.type].push(regex);
      } catch (error) {
        logger.warn(`Invalid regex pattern: ${signature.pattern}`, { signatureId: signature.id });
      }
    }

    return patterns;
  }

  /**
   * Get fallback patterns when external feeds are unavailable
   */
  private static getFallbackPatterns(): CompiledThreatPatterns {
    return {
      xss: [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /javascript:\s*[^;]/gi,
        /on\w+\s*=\s*['"]/gi
      ],
      sql_injection: [
        /(\b(SELECT|INSERT|UPDATE|DELETE|DROP)\s+)/gi,
        /(\b(UNION|OR|AND)\s+)/gi,
        /(;\s*(DROP|DELETE)\s+)/gi
      ],
      command_injection: [
        /(;\s*(rm|cat|ls|ps|kill)\s+)/gi,
        /(\|\s*(rm|cat|ls)\s+)/gi,
        /(\&\&\s*(rm|del)\s+)/gi
      ],
      path_traversal: [
        /(\.\.[\/\\]){2,}/g,
        /[\/\\]etc[\/\\]passwd/gi,
        /[\/\\]windows[\/\\]system32/gi
      ],
      malware: [],
      phishing: []
    };
  }

  /**
   * Check if input matches any threat patterns
   */
  static async detectThreats(input: string): Promise<Array<{
    type: string;
    pattern: string;
    severity: string;
    description: string;
  }>> {
    const patterns = await this.getLatestSignatures();
    const threats: Array<{
      type: string;
      pattern: string;
      severity: string;
      description: string;
    }> = [];

    for (const [type, regexList] of Object.entries(patterns)) {
      for (const regex of regexList) {
        if (regex.test(input)) {
          threats.push({
            type,
            pattern: regex.source,
            severity: 'high', // Default severity
            description: `Potential ${type.replace('_', ' ')} detected`
          });
        }
      }
    }

    return threats;
  }

  /**
   * Get threat intelligence statistics
   */
  static async getStats(): Promise<{
    totalSignatures: number;
    lastUpdated: Date | null;
    feedSources: string[];
    cacheHit: boolean;
  }> {
    try {
      const cached = await this.cache.get(this.CACHE_KEY);
      const signatures = cached || [];
      
      return {
        totalSignatures: signatures.length,
        lastUpdated: signatures.length > 0 ? signatures[0]?.lastUpdated || null : null,
        feedSources: [...new Set(signatures.map(s => s.source))],
        cacheHit: !!cached
      };
    } catch (error) {
      return {
        totalSignatures: 0,
        lastUpdated: null,
        feedSources: [],
        cacheHit: false
      };
    }
  }

  /**
   * Force refresh of threat signatures
   */
  static async refreshSignatures(): Promise<void> {
    logger.info('Force refreshing threat signatures');
    
    // Clear cache
    await this.cache.delete(this.CACHE_KEY);
    
    // Fetch fresh signatures
    await this.getLatestSignatures();
    
    logger.info('Threat signatures refreshed successfully');
  }
}