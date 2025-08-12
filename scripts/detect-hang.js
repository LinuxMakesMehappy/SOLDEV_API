#!/usr/bin/env node

/**
 * Hang Detection Script for AI Assistant
 * Monitors for signs that the AI is stuck or unresponsive
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class HangDetector {
  constructor() {
    this.config = {
      maxTestTime: 120000, // 2 minutes max for any single test
      maxBuildTime: 300000, // 5 minutes max for build
      maxIdleTime: 30000, // 30 seconds max idle between operations
      logFile: 'hang-detection.log',
      patterns: {
        hung: [
          /Exceeded timeout of \d+ms for a test/,
          /Jest did not exit one second after/,
          /thrown: "Exceeded timeout/,
          /FAIL.*\(\d{2,}\.\d{3} s\)/, // Tests taking too long
          /A worker process has failed to exit gracefully/
        ],
        infinite: [
          /RUNS.*test\.ts/,
          /\s+RUNS\s+/, // Multiple RUNS lines indicate hanging
        ],
        memory: [
          /JavaScript heap out of memory/,
          /FATAL ERROR: Ineffective mark-compacts/
        ]
      }
    };
    
    this.state = {
      lastActivity: Date.now(),
      testStartTime: null,
      buildStartTime: null,
      consecutiveRuns: 0,
      isHung: false
    };
  }

  /**
   * Monitor a command execution for hang patterns
   */
  monitorCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      console.log(`🔍 Monitoring command: ${command} ${args.join(' ')}`);
      
      const startTime = Date.now();
      
      // Handle Windows command execution
      const isWindows = process.platform === 'win32';
      const cmd = isWindows ? 'cmd' : command;
      const cmdArgs = isWindows ? ['/c', command, ...args] : args;
      
      const childProcess = spawn(cmd, cmdArgs, {
        stdio: 'pipe',
        shell: isWindows,
        ...options
      });

      let stdout = '';
      let stderr = '';
      let lastOutputTime = Date.now();
      
      // Set up timeout monitoring
      const hangCheckInterval = setInterval(() => {
        const now = Date.now();
        const timeSinceLastOutput = now - lastOutputTime;
        const totalTime = now - startTime;
        
        // Check for various hang conditions
        if (this.detectHang(stdout, stderr, timeSinceLastOutput, totalTime)) {
          console.log('🚨 HANG DETECTED - Terminating process');
          clearInterval(hangCheckInterval);
          childProcess.kill('SIGKILL');
          reject(new Error('Process hung - terminated'));
          return;
        }
      }, 5000); // Check every 5 seconds

      childProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        lastOutputTime = Date.now();
        
        // Log real-time output with hang detection
        this.analyzeOutput(output);
        process.stdout.write(output);
      });

      childProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        lastOutputTime = Date.now();
        
        this.analyzeOutput(output);
        process.stderr.write(output);
      });

      childProcess.on('close', (code) => {
        clearInterval(hangCheckInterval);
        const duration = Date.now() - startTime;
        
        console.log(`\n⏱️  Process completed in ${duration}ms with code ${code}`);
        
        if (code === 0) {
          resolve({ stdout, stderr, duration, code });
        } else {
          reject(new Error(`Process failed with code ${code}`));
        }
      });

      childProcess.on('error', (error) => {
        clearInterval(hangCheckInterval);
        reject(error);
      });
    });
  }

  /**
   * Detect if the process is hung based on various criteria
   */
  detectHang(stdout, stderr, timeSinceLastOutput, totalTime) {
    const output = stdout + stderr;
    
    // Check for explicit hang patterns
    for (const pattern of this.config.patterns.hung) {
      if (pattern.test(output)) {
        this.logHang('Pattern match', pattern.toString());
        return true;
      }
    }

    // Check for infinite test runs
    const runsMatches = output.match(/RUNS\s+/g);
    if (runsMatches && runsMatches.length > 10) {
      this.logHang('Infinite test runs', `${runsMatches.length} RUNS detected`);
      return true;
    }

    // Check for timeout conditions
    if (timeSinceLastOutput > this.config.maxIdleTime) {
      this.logHang('Idle timeout', `No output for ${timeSinceLastOutput}ms`);
      return true;
    }

    if (totalTime > this.config.maxTestTime && output.includes('jest')) {
      this.logHang('Test timeout', `Test running for ${totalTime}ms`);
      return true;
    }

    if (totalTime > this.config.maxBuildTime && (output.includes('tsc') || output.includes('build'))) {
      this.logHang('Build timeout', `Build running for ${totalTime}ms`);
      return true;
    }

    // Check for memory issues
    for (const pattern of this.config.patterns.memory) {
      if (pattern.test(output)) {
        this.logHang('Memory issue', pattern.toString());
        return true;
      }
    }

    return false;
  }

  /**
   * Analyze output in real-time for hang indicators
   */
  analyzeOutput(output) {
    // Count consecutive RUNS
    if (output.includes('RUNS')) {
      this.state.consecutiveRuns++;
      if (this.state.consecutiveRuns > 5) {
        console.log(`⚠️  Warning: ${this.state.consecutiveRuns} consecutive RUNS detected`);
      }
    } else if (output.includes('PASS') || output.includes('FAIL')) {
      this.state.consecutiveRuns = 0;
    }

    // Update activity timestamp
    this.state.lastActivity = Date.now();
  }

  /**
   * Log hang detection events
   */
  logHang(type, details) {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - HANG DETECTED: ${type} - ${details}\n`;
    
    console.log(`🚨 ${logEntry.trim()}`);
    
    try {
      fs.appendFileSync(this.config.logFile, logEntry);
    } catch (error) {
      console.error('Failed to write to log file:', error.message);
    }
    
    this.state.isHung = true;
  }

  /**
   * Run tests with hang detection
   */
  async runTestsWithDetection(testPattern = '') {
    try {
      console.log('🧪 Running tests with hang detection...');
      
      const args = ['test'];
      if (testPattern) {
        args.push('--', testPattern);
      }
      
      const result = await this.monitorCommand('npm', args);
      console.log('✅ Tests completed successfully');
      return result;
      
    } catch (error) {
      console.error('❌ Tests failed or hung:', error.message);
      throw error;
    }
  }

  /**
   * Run build with hang detection
   */
  async runBuildWithDetection() {
    try {
      console.log('🔨 Running build with hang detection...');
      
      const result = await this.monitorCommand('npm', ['run', 'build']);
      console.log('✅ Build completed successfully');
      return result;
      
    } catch (error) {
      console.error('❌ Build failed or hung:', error.message);
      throw error;
    }
  }

  /**
   * Get hang detection report
   */
  getReport() {
    return {
      isHung: this.state.isHung,
      lastActivity: this.state.lastActivity,
      consecutiveRuns: this.state.consecutiveRuns,
      uptime: Date.now() - this.state.lastActivity
    };
  }
}

// CLI interface
if (require.main === module) {
  const detector = new HangDetector();
  const command = process.argv[2];
  const args = process.argv.slice(3);

  async function main() {
    try {
      switch (command) {
        case 'test':
          await detector.runTestsWithDetection(args[0]);
          break;
          
        case 'build':
          await detector.runBuildWithDetection();
          break;
          
        case 'monitor':
          if (args.length < 1) {
            console.error('Usage: node detect-hang.js monitor <command> [args...]');
            process.exit(1);
          }
          await detector.monitorCommand(args[0], args.slice(1));
          break;
          
        case 'report':
          console.log('📊 Hang Detection Report:');
          console.log(JSON.stringify(detector.getReport(), null, 2));
          break;
          
        default:
          console.log(`
🔍 Hang Detection Script

Usage:
  node detect-hang.js test [pattern]     - Run tests with hang detection
  node detect-hang.js build              - Run build with hang detection  
  node detect-hang.js monitor <cmd>      - Monitor any command
  node detect-hang.js report             - Show hang detection report

Examples:
  node detect-hang.js test external-ai-service.test.ts
  node detect-hang.js monitor npm test
  node detect-hang.js build
          `);
      }
    } catch (error) {
      console.error('💥 Script failed:', error.message);
      process.exit(1);
    }
  }

  main();
}

module.exports = HangDetector;