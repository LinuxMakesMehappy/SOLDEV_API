# Solana Error Code Explanation API

A robust serverless backend service that transforms cryptic Solana and Anchor error codes into human-readable explanations with actionable fix suggestions. Built with multiple fallback layers to ensure 99.9% availability.

## 🚀 Features

- **🤖 AI-Enhanced Explanations**: Uses AWS Bedrock (Claude-3) and external AI APIs for contextual error analysis
- **⚡ Lightning-Fast Responses**: DynamoDB-based caching for sub-500ms response times
- **🛡️ Multi-Layer Fallback System**: 
  - Primary: AI-generated explanations
  - Secondary: Comprehensive static error database (50+ common errors)
  - Tertiary: Generic category-based explanations
- **🎯 Developer-Focused**: Tailored explanations for Solana/Anchor development with specific tool recommendations
- **☁️ Serverless Architecture**: Built for AWS Lambda with automatic scaling and cost optimization
- **🔒 Security-First**: Input validation, rate limiting, and secure API key handling
- **📊 Monitoring Ready**: Comprehensive logging and health checks

## 📁 Project Structure

```
src/
├── handlers/          # Lambda handlers and API endpoints
├── services/          # Business logic services
│   ├── ai-service.ts           # AWS Bedrock integration
│   ├── external-ai-service.ts  # External AI API fallback
│   ├── composite-ai-service.ts # AI service orchestration
│   ├── fallback-service.ts     # Master fallback coordinator
│   ├── static-error-database.ts # Static error explanations
│   └── cache-service.ts        # DynamoDB caching layer
├── models/           # Data models and validation
├── utils/            # Utility functions
└── types/            # TypeScript type definitions

tests/                # Comprehensive test suite (95%+ coverage)
scripts/              # Development and deployment scripts
├── detect-hang.js    # Hang detection for CI/CD
└── ...
.kiro/specs/          # Feature specifications and design docs
```

## 🏗️ Architecture

The service uses a sophisticated multi-layer architecture:

1. **API Layer**: Lambda handlers with input validation and rate limiting
2. **Service Layer**: Orchestrated AI services with intelligent fallback
3. **Cache Layer**: DynamoDB with TTL for performance optimization
4. **Static Fallback**: Comprehensive error database for offline capability
5. **Monitoring**: CloudWatch integration with custom metrics

## 🛠️ Development

### Prerequisites

- **Node.js 20+** (LTS recommended)
- **AWS CLI** configured with appropriate permissions
- **Serverless Framework** (`npm install -g serverless`)
- **TypeScript** knowledge for contributions

### Quick Start

```bash
# Clone and install dependencies
git clone <repository-url>
cd solana-error-api
npm install

# Build the project
npm run build

# Run tests with hang detection
node scripts/detect-hang.js test

# Start development
npm run dev
```

### 🧪 Testing

```bash
# Run all tests with hang detection (recommended)
node scripts/detect-hang.js test

# Traditional test commands
npm test                    # Run all tests
npm run test:watch         # Watch mode
npm run test:coverage      # Coverage report
npm test -- --testNamePattern="StaticErrorDatabase"  # Specific tests

# Test specific services
npm test tests/services/static-error-database.test.ts
npm test tests/services/fallback-service.test.ts
```

### 🔍 Code Quality

```bash
npm run lint               # ESLint with TypeScript rules
npm run format             # Prettier formatting
npm run type-check         # TypeScript compilation check
npm audit                  # Security vulnerability scan
```

### 🚀 Deployment

```bash
# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy:prod

# Deploy with specific stage
serverless deploy --stage production
```

### 🐛 Debugging

```bash
# View logs
serverless logs -f explainError --tail

# Local testing
serverless invoke local -f explainError --data '{"errorCode": 6000}'

# Monitor hang detection
node scripts/detect-hang.js monitor npm test
```

## 📡 API Usage

### POST /explain-error

Transform any Solana/Anchor error code into actionable guidance.

**Request:**
```json
{
  "errorCode": 6000  // Supports number or hex string (e.g., "0x1770")
}
```

**Success Response:**
```json
{
  "code": 6000,
  "explanation": "Insufficient funds error - the account doesn't have enough balance for the requested operation.",
  "fixes": [
    "Check account balance before attempting the transaction",
    "Verify token account has sufficient balance for the operation", 
    "Add balance validation logic in your program before processing"
  ],
  "cached": false,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Error Response:**
```json
{
  "error": "Invalid error code format. Must be a number between 0 and 4294967295.",
  "code": 400,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Supported Error Types

| Range | Type | Examples | Source |
|-------|------|----------|---------|
| 0-999 | System Errors | `0` (Success), `1` (InvalidInstructionData) | Solana Runtime |
| 2000-2999 | Constraint Errors | `2000` (ConstraintSeeds), `2001` (ConstraintHasOne) | Anchor Framework |
| 6000+ | Custom Errors | `6000` (InsufficientFunds), `6001` (Unauthorized) | Program-Specific |

### Response Sources

- **`ai`**: Generated by AI with high contextual accuracy
- **`static`**: From curated error database (50+ common errors)
- **`cache`**: Previously generated response from DynamoDB

### Rate Limits

- **100 requests/minute** per IP address
- **Burst capacity**: 20 requests
- **429 status** when exceeded

## ⚙️ Configuration

### Required Environment Variables

```bash
# AWS Bedrock Configuration
AWS_BEDROCK_REGION=us-east-1
AWS_BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0

# AI Service Settings
AI_TEMPERATURE=0.7          # AI creativity (0.0-2.0)
AI_MAX_TOKENS=1000         # Max response tokens
AI_TIMEOUT_MS=10000        # AI request timeout

# Cache Configuration  
DYNAMODB_TABLE_NAME=solana-error-cache
CACHE_TTL_SECONDS=3600     # 1 hour cache TTL

# Rate Limiting
RATE_LIMIT_PER_MINUTE=100  # Requests per IP per minute

# Logging
LOG_LEVEL=info             # debug, info, warn, error
```

### Optional Environment Variables

```bash
# External AI Fallback (optional)
EXTERNAL_AI_API_URL=https://api.openai.com/v1/chat/completions
EXTERNAL_AI_API_KEY=sk-...

# AWS Configuration (auto-detected if not set)
AWS_REGION=us-east-1
```

### Security Best Practices

- **API Keys**: Store in AWS Secrets Manager or environment variables
- **IAM Roles**: Use least-privilege access for Lambda execution
- **VPC**: Deploy in private subnets for enhanced security
- **Encryption**: All data encrypted in transit and at rest
- **Input Validation**: Strict validation prevents injection attacks

## 🔒 Security Features

- ✅ **Input Sanitization**: All inputs validated and sanitized
- ✅ **Rate Limiting**: Prevents abuse and DoS attacks  
- ✅ **Error Handling**: No sensitive information in error responses
- ✅ **Dependency Scanning**: Regular security audits with `npm audit`
- ✅ **Type Safety**: Full TypeScript coverage prevents runtime errors
- ✅ **Timeout Protection**: Prevents resource exhaustion
- ✅ **Hang Detection**: Automated detection and termination of stuck processes

## 📊 Performance & Reliability

### Response Times
- **Cache Hit**: < 100ms
- **AI Generation**: < 2s  
- **Static Fallback**: < 50ms
- **99th Percentile**: < 3s

### Availability
- **Target SLA**: 99.9% uptime
- **Fallback Layers**: 3-tier system ensures responses
- **Auto-Recovery**: Automatic AI service health monitoring
- **Graceful Degradation**: Always provides useful responses

### Monitoring
- **CloudWatch Metrics**: Response times, error rates, cache hit ratios
- **Health Checks**: Automated service availability monitoring  
- **Alerting**: Proactive notifications for service issues
- **Logging**: Structured logging for debugging and analysis

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Test** your changes (`node scripts/detect-hang.js test`)
4. **Commit** your changes (`git commit -m 'Add amazing feature'`)
5. **Push** to the branch (`git push origin feature/amazing-feature`)
6. **Open** a Pull Request

### Code Standards

- **TypeScript**: Strict mode enabled
- **Testing**: 95%+ code coverage required
- **Linting**: ESLint + Prettier configuration
- **Documentation**: JSDoc comments for all public APIs
- **Security**: All dependencies must pass security audit

## 📚 Additional Resources

- [Solana Documentation](https://docs.solana.com/)
- [Anchor Framework](https://www.anchor-lang.com/)
- [AWS Bedrock](https://aws.amazon.com/bedrock/)
- [Serverless Framework](https://www.serverless.com/)

## 🐛 Troubleshooting

### Common Issues

**Q: Tests are hanging or timing out**
```bash
# Use hang detection script
node scripts/detect-hang.js test
```

**Q: AI service returning errors**
```bash
# Check service health
npm run health-check

# View detailed logs
serverless logs -f explainError --tail
```

**Q: High response times**
```bash
# Check cache hit ratio
aws cloudwatch get-metric-statistics --namespace AWS/Lambda --metric-name CacheHitRatio
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Built with ❤️ for the Solana developer community**