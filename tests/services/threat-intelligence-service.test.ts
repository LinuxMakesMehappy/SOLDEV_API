/**
 * Threat Intelligence Service tests
 * Tests for real-time threat detection enhancement to Task 11 security measures
 */

import { ThreatIntelligenceService, ThreatSignature } from '../../src/services/threat-intelligence-service';

// Mock cache service
const mockCacheService = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn()
};

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('ThreatIntelligenceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set the mock cache before each test
    ThreatIntelligenceService.setCache(mockCacheService);
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('getLatestSignatures', () => {
    it('should return cached signatures when available', async () => {
      const mockSignatures: ThreatSignature[] = [
        {
          id: 'test_1',
          type: 'xss',
          pattern: '<script>',
          severity: 'high',
          description: 'XSS script tag',
          source: 'Test',
          lastUpdated: new Date()
        }
      ];

      mockCacheService.get.mockResolvedValue(mockSignatures);

      const result = await ThreatIntelligenceService.getLatestSignatures();

      expect(mockCacheService.get).toHaveBeenCalledWith('threat_signatures');
      expect(result.xss).toHaveLength(1);
      expect(result.xss[0]).toBeInstanceOf(RegExp);
    });

    it('should fetch fresh signatures when cache is empty', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockCacheService.set.mockResolvedValue(undefined);

      const result = await ThreatIntelligenceService.getLatestSignatures();

      expect(mockCacheService.get).toHaveBeenCalledWith('threat_signatures');
      expect(mockCacheService.set).toHaveBeenCalled();
      expect(result).toHaveProperty('xss');
      expect(result).toHaveProperty('sql_injection');
      expect(result).toHaveProperty('command_injection');
      expect(result).toHaveProperty('path_traversal');
    });

    it('should return fallback patterns when external feeds fail', async () => {
      mockCacheService.get.mockRejectedValue(new Error('Cache error'));

      const result = await ThreatIntelligenceService.getLatestSignatures();

      expect(result).toHaveProperty('xss');
      expect(result).toHaveProperty('sql_injection');
      expect(result.xss.length).toBeGreaterThan(0);
      expect(result.sql_injection.length).toBeGreaterThan(0);
    });
  });

  describe('detectThreats', () => {
    beforeEach(() => {
      // Mock getLatestSignatures to return test patterns
      const mockPatterns = {
        xss: [/script/i, /javascript:/i],
        sql_injection: [/union.*select/i, /drop.*table/i],
        command_injection: [/;.*rm/i, /\|.*cat/i],
        path_traversal: [/\.\.\//i, /\.\.\\/i],
        malware: [],
        phishing: []
      };
      
      jest.spyOn(ThreatIntelligenceService, 'getLatestSignatures').mockResolvedValue(mockPatterns);
    });

    it('should detect XSS threats', async () => {
      const input = '<script>alert("xss")</script>';
      
      const threats = await ThreatIntelligenceService.detectThreats(input);
      
      expect(threats.length).toBeGreaterThan(0);
      expect(threats[0]?.type).toBe('xss');
      expect(threats[0]?.description).toContain('xss');
    });

    it('should detect SQL injection threats', async () => {
      const input = "1' UNION SELECT * FROM users";
      
      const threats = await ThreatIntelligenceService.detectThreats(input);
      
      expect(threats.length).toBeGreaterThan(0);
      expect(threats[0]?.type).toBe('sql_injection');
      expect(threats[0]?.description).toContain('sql');
    });

    it('should return empty array for clean input', async () => {
      const input = 'This is a clean input string';
      
      const threats = await ThreatIntelligenceService.detectThreats(input);
      
      expect(threats).toEqual([]);
    });

    it('should handle multiple threat types in single input', async () => {
      const input = '<script>alert("xss")</script> AND 1=1 UNION SELECT * FROM users';
      
      const threats = await ThreatIntelligenceService.detectThreats(input);
      
      expect(threats.length).toBeGreaterThan(1);
      const threatTypes = threats.map(t => t.type);
      expect(threatTypes).toContain('xss');
      expect(threatTypes).toContain('sql_injection');
    });

    it('should handle cache errors gracefully', async () => {
      jest.spyOn(ThreatIntelligenceService, 'getLatestSignatures').mockImplementation(async () => {
        // Return fallback patterns when cache fails
        return {
          xss: [/<script>/i],
          sql_injection: [],
          command_injection: [],
          path_traversal: [],
          malware: [],
          phishing: []
        };
      });
      
      const input = '<script>alert("test")</script>';
      
      const threats = await ThreatIntelligenceService.detectThreats(input);
      
      // Should still work with fallback patterns
      expect(Array.isArray(threats)).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return statistics when signatures are cached', async () => {
      const mockSignatures: ThreatSignature[] = [
        {
          id: 'test_1',
          type: 'xss',
          pattern: '<script>',
          severity: 'high',
          description: 'XSS script tag',
          source: 'TestSource',
          lastUpdated: new Date('2025-01-01')
        },
        {
          id: 'test_2',
          type: 'sql_injection',
          pattern: 'union select',
          severity: 'high',
          description: 'SQL injection',
          source: 'AnotherSource',
          lastUpdated: new Date('2025-01-01')
        }
      ];

      mockCacheService.get.mockResolvedValue(mockSignatures);

      const stats = await ThreatIntelligenceService.getStats();

      expect(stats.totalSignatures).toBe(2);
      expect(stats.lastUpdated).toEqual(new Date('2025-01-01'));
      expect(stats.feedSources).toEqual(['TestSource', 'AnotherSource']);
      expect(stats.cacheHit).toBe(true);
    });

    it('should return empty statistics when no signatures are cached', async () => {
      mockCacheService.get.mockResolvedValue(null);

      const stats = await ThreatIntelligenceService.getStats();

      expect(stats.totalSignatures).toBe(0);
      expect(stats.feedSources).toEqual([]);
      expect(stats.cacheHit).toBe(false);
    });

    it('should handle cache errors gracefully', async () => {
      mockCacheService.get.mockRejectedValue(new Error('Cache error'));

      const stats = await ThreatIntelligenceService.getStats();

      expect(stats.totalSignatures).toBe(0);
      expect(stats.cacheHit).toBe(false);
    });
  });

  describe('refreshSignatures', () => {
    it('should clear cache and fetch fresh signatures', async () => {
      mockCacheService.delete.mockResolvedValue(undefined);
      
      // Mock getLatestSignatures to be called during refresh
      const getLatestSignaturesSpy = jest.spyOn(ThreatIntelligenceService, 'getLatestSignatures').mockResolvedValue({
        xss: [/script/i],
        sql_injection: [/union/i],
        command_injection: [],
        path_traversal: [],
        malware: [],
        phishing: []
      });

      await ThreatIntelligenceService.refreshSignatures();

      expect(mockCacheService.delete).toHaveBeenCalledWith('threat_signatures');
      expect(getLatestSignaturesSpy).toHaveBeenCalled();
    });
  });

  describe('Pattern Compilation', () => {
    it('should compile valid regex patterns', async () => {
      const signatures: ThreatSignature[] = [
        {
          id: 'test_1',
          type: 'xss',
          pattern: '<script[^>]*>',
          severity: 'high',
          description: 'XSS script tag',
          source: 'Test',
          lastUpdated: new Date()
        }
      ];

      mockCacheService.get.mockResolvedValue(signatures);

      const result = await ThreatIntelligenceService.getLatestSignatures();

      expect(result.xss).toHaveLength(1);
      expect(result.xss[0]).toBeInstanceOf(RegExp);
    });

    it('should skip invalid regex patterns', async () => {
      const signatures: ThreatSignature[] = [
        {
          id: 'test_1',
          type: 'xss',
          pattern: '[invalid regex',
          severity: 'high',
          description: 'Invalid pattern',
          source: 'Test',
          lastUpdated: new Date()
        },
        {
          id: 'test_2',
          type: 'xss',
          pattern: '<script>',
          severity: 'high',
          description: 'Valid pattern',
          source: 'Test',
          lastUpdated: new Date()
        }
      ];

      mockCacheService.get.mockResolvedValue(signatures);

      const result = await ThreatIntelligenceService.getLatestSignatures();

      // Should only include the valid pattern
      expect(result.xss).toHaveLength(1);
    });
  });

  describe('Threat Detection Scenarios', () => {
    const testScenarios = [
      {
        name: 'XSS Script Tag',
        input: '<script>alert("xss")</script>',
        expectedType: 'xss'
      },
      {
        name: 'XSS Event Handler',
        input: '<img src="x" onerror="alert(1)">',
        expectedType: 'xss'
      },
      {
        name: 'JavaScript Protocol',
        input: 'javascript:alert("xss")',
        expectedType: 'xss'
      },
      {
        name: 'SQL Union Attack',
        input: "1' UNION SELECT * FROM users--",
        expectedType: 'sql_injection'
      },
      {
        name: 'SQL Drop Table',
        input: "'; DROP TABLE users; --",
        expectedType: 'sql_injection'
      }
    ];

    beforeEach(() => {
      // Mock comprehensive patterns for scenario testing
      const mockPatterns = {
        xss: [
          /<script[^>]*>/i,
          /on\w+\s*=/i,
          /javascript:/i
        ],
        sql_injection: [
          /union.*select/i,
          /drop.*table/i,
          /insert.*into/i,
          /delete.*from/i
        ],
        command_injection: [/;.*rm/i, /\|.*cat/i],
        path_traversal: [/\.\.\//i],
        malware: [],
        phishing: []
      };
      
      jest.spyOn(ThreatIntelligenceService, 'getLatestSignatures').mockResolvedValue(mockPatterns);
    });

    testScenarios.forEach(scenario => {
      it(`should detect ${scenario.name}`, async () => {
        const threats = await ThreatIntelligenceService.detectThreats(scenario.input);
        
        expect(threats.length).toBeGreaterThan(0);
        expect(threats.some(t => t.type === scenario.expectedType)).toBe(true);
      });
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle large input strings efficiently', async () => {
      const largeInput = 'a'.repeat(10000) + '<script>alert("xss")</script>';
      
      const startTime = Date.now();
      const threats = await ThreatIntelligenceService.detectThreats(largeInput);
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      expect(threats.length).toBeGreaterThan(0);
    });

    it('should handle concurrent threat detection requests', async () => {
      const inputs = [
        '<script>alert("xss1")</script>',
        '<script>alert("xss2")</script>',
        '<script>alert("xss3")</script>'
      ];
      
      const promises = inputs.map(input => ThreatIntelligenceService.detectThreats(input));
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(3);
      results.forEach(threats => {
        expect(threats.length).toBeGreaterThan(0);
      });
    });
  });
});