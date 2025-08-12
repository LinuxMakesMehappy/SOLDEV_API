# Deployment Guide

This guide covers deployment procedures, environment setup, and post-deployment verification for the Solana Error Code Explanation API.

## Pre-Deployment Checklist

### Code Quality
- [ ] All tests pass with hang detection: `node scripts/detect-hang.js test`
- [ ] Code coverage ≥ 95%: `npm run test:coverage`
- [ ] Linting passes: `npm run lint`
- [ ] TypeScript compilation succeeds: `npm run build`
- [ ] Security audit clean: `npm audit`

### Documentation
- [ ] README.md updated with new features
- [ ] CHANGELOG.md updated with version changes
- [ ] API documentation reflects current functionality
- [ ] Environment variables documented

### Security
- [ ] No hardcoded secrets in code
- [ ] Environment variables properly configured
- [ ] IAM roles follow least-privilege principle
- [ ] Security policy reviewed and updated

## Environment Setup

### Development Environment

```bash
# Required environment variables
export AWS_BEDROCK_REGION=us-east-1
export AWS_BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
export AI_TEMPERATURE=0.7
export AI_MAX_TOKENS=1000
export AI_TIMEOUT_MS=10000
export DYNAMODB_TABLE_NAME=solana-error-cache-dev
export CACHE_TTL_SECONDS=3600
export RATE_LIMIT_PER_MINUTE=100
export LOG_LEVEL=debug

# Optional external AI fallback
export EXTERNAL_AI_API_URL=https://api.openai.com/v1/chat/completions
export EXTERNAL_AI_API_KEY=sk-your-key-here
```

### Staging Environment

```bash
# Production-like settings with debug logging
export AWS_BEDROCK_REGION=us-east-1
export AWS_BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
export AI_TEMPERATURE=0.7
export AI_MAX_TOKENS=1000
export AI_TIMEOUT_MS=8000
export DYNAMODB_TABLE_NAME=solana-error-cache-staging
export CACHE_TTL_SECONDS=3600
export RATE_LIMIT_PER_MINUTE=100
export LOG_LEVEL=info
```

### Production Environment

```bash
# Optimized production settings
export AWS_BEDROCK_REGION=us-east-1
export AWS_BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
export AI_TEMPERATURE=0.7
export AI_MAX_TOKENS=1000
export AI_TIMEOUT_MS=8000
export DYNAMODB_TABLE_NAME=solana-error-cache-prod
export CACHE_TTL_SECONDS=3600
export RATE_LIMIT_PER_MINUTE=100
export LOG_LEVEL=warn
```

## Deployment Commands

### Deploy to Development

```bash
# Deploy with development configuration
serverless deploy --stage dev

# Verify deployment
serverless info --stage dev
```

### Deploy to Staging

```bash
# Deploy to staging for testing
serverless deploy --stage staging

# Run integration tests
npm run test:integration --stage staging
```

### Deploy to Production

```bash
# Final pre-deployment checks
npm run pre-deploy-check

# Deploy to production
serverless deploy --stage production

# Verify deployment
npm run post-deploy-verify --stage production
```

## Post-Deployment Verification

### Health Checks

```bash
# Test API endpoint
curl -X POST https://your-api-gateway-url/explain-error \
  -H "Content-Type: application/json" \
  -d '{"errorCode": 6000}'

# Expected response
{
  "code": 6000,
  "explanation": "Insufficient funds error...",
  "fixes": [...],
  "cached": false,
  "timestamp": "2024-01-12T..."
}
```

### Performance Testing

```bash
# Load testing with various error codes
for code in 0 1 2000 6000 9999; do
  curl -X POST https://your-api-gateway-url/explain-error \
    -H "Content-Type: application/json" \
    -d "{\"errorCode\": $code}" \
    -w "Time: %{time_total}s\n"
done
```

### Monitoring Setup

```bash
# Check CloudWatch logs
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/solana-error-api

# View recent logs
aws logs tail /aws/lambda/solana-error-api-production-explainError --follow
```

## Monitoring & Alerting

### CloudWatch Metrics

Monitor these key metrics:

- **Duration**: Response time percentiles (p50, p95, p99)
- **Errors**: Error rate and error types
- **Throttles**: Rate limiting events
- **Cache Hit Ratio**: DynamoDB cache effectiveness
- **AI Service Health**: Fallback activation frequency

### Alerts Configuration

```yaml
# CloudWatch Alarms
ErrorRateAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: SolanaErrorAPI-HighErrorRate
    MetricName: Errors
    Threshold: 5
    ComparisonOperator: GreaterThanThreshold
    EvaluationPeriods: 2
    Period: 300

ResponseTimeAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: SolanaErrorAPI-HighLatency
    MetricName: Duration
    Statistic: Average
    Threshold: 3000
    ComparisonOperator: GreaterThanThreshold
    EvaluationPeriods: 3
    Period: 300
```

## Rollback Procedures

### Quick Rollback

```bash
# Rollback to previous version
serverless rollback --timestamp TIMESTAMP --stage production

# Verify rollback
curl -X POST https://your-api-gateway-url/explain-error \
  -H "Content-Type: application/json" \
  -d '{"errorCode": 1}'
```

### Emergency Procedures

1. **Immediate Response**
   - Disable problematic Lambda function
   - Route traffic to backup region (if available)
   - Notify stakeholders

2. **Investigation**
   - Check CloudWatch logs for errors
   - Review recent deployments
   - Identify root cause

3. **Resolution**
   - Apply hotfix or rollback
   - Verify fix in staging first
   - Gradual traffic restoration

## Security Deployment Checklist

### Pre-Deployment Security

- [ ] **Secrets Management**: All secrets in environment variables or AWS Secrets Manager
- [ ] **IAM Roles**: Least-privilege access configured
- [ ] **VPC Configuration**: Private subnets and security groups configured
- [ ] **Encryption**: Data encryption in transit and at rest enabled
- [ ] **Rate Limiting**: Configured to prevent abuse

### Post-Deployment Security

- [ ] **Penetration Testing**: Basic security tests passed
- [ ] **Access Logs**: CloudTrail and API Gateway logging enabled
- [ ] **Monitoring**: Security alerts configured
- [ ] **Backup**: Data backup procedures verified

## Troubleshooting

### Common Issues

**Issue**: Lambda timeout errors
```bash
# Solution: Check AI service timeout configuration
export AI_TIMEOUT_MS=8000  # Reduce from 10000
```

**Issue**: High error rates
```bash
# Check CloudWatch logs
aws logs filter-log-events \
  --log-group-name /aws/lambda/solana-error-api-production-explainError \
  --filter-pattern "ERROR"
```

**Issue**: Cache misses
```bash
# Verify DynamoDB table configuration
aws dynamodb describe-table --table-name solana-error-cache-prod
```

### Debug Commands

```bash
# Local testing
serverless invoke local -f explainError --data '{"errorCode": 6000}'

# Remote testing
serverless invoke -f explainError --data '{"errorCode": 6000}' --stage production

# View logs
serverless logs -f explainError --tail --stage production
```

## Performance Optimization

### Post-Deployment Tuning

1. **Monitor Response Times**
   - Adjust AI timeout based on actual performance
   - Optimize cache TTL based on usage patterns
   - Fine-tune rate limiting thresholds

2. **Cost Optimization**
   - Review Lambda memory allocation
   - Optimize DynamoDB read/write capacity
   - Monitor AWS costs and usage

3. **Scaling Considerations**
   - Configure Lambda concurrency limits
   - Set up auto-scaling for DynamoDB
   - Plan for traffic spikes

## Success Criteria

Deployment is considered successful when:

- [ ] **Availability**: 99.9% uptime achieved
- [ ] **Performance**: 95% of requests < 2s response time
- [ ] **Error Rate**: < 1% error rate
- [ ] **Cache Hit Ratio**: > 80% cache hits
- [ ] **Security**: No security vulnerabilities detected
- [ ] **Monitoring**: All alerts and dashboards functional

---

Deployment Checklist Complete

*This deployment guide should be reviewed and updated with each major release to ensure accuracy and completeness.*