# Solana Error Code Explanation API

A serverless backend service that transforms cryptic Anchor error codes into human-readable explanations with actionable fix suggestions.

## Features

- **AI-Enhanced Explanations**: Uses AWS Bedrock and external AI APIs to provide contextual error explanations
- **Intelligent Caching**: DynamoDB-based caching for sub-500ms response times
- **Fallback Mechanisms**: Multiple fallback layers ensure high availability
- **Developer-Focused**: Tailored explanations for Solana/Anchor development
- **Serverless Architecture**: Built for AWS Lambda with automatic scaling

## Project Structure

```
src/
├── handlers/          # Lambda handlers
├── services/          # Business logic services
├── models/           # Data models and interfaces
├── utils/            # Utility functions
└── types/            # TypeScript type definitions

tests/                # Test files
schemas/              # JSON schemas for validation
```

## Development

### Prerequisites

- Node.js 20+
- AWS CLI configured
- Serverless Framework

### Setup

```bash
npm install
npm run build
```

### Testing

```bash
npm test                # Run tests
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report
```

### Code Quality

```bash
npm run lint           # ESLint
npm run format         # Prettier
```

### Deployment

```bash
npm run deploy         # Deploy to AWS
```

## API Usage

### POST /explain-error

Request:
```json
{
  "errorCode": 6000
}
```

Response:
```json
{
  "code": 6000,
  "explanation": "Custom program error indicating insufficient funds",
  "fixes": [
    "Check account balance before transaction",
    "Verify token account has sufficient balance",
    "Add balance validation in your program logic"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Environment Variables

- `AWS_BEDROCK_MODEL_ID`: Bedrock model identifier
- `DYNAMODB_TABLE_NAME`: DynamoDB cache table name
- `AI_TIMEOUT_MS`: AI service timeout in milliseconds
- `CACHE_TTL_SECONDS`: Cache TTL in seconds
- `RATE_LIMIT_PER_MINUTE`: Rate limit per IP per minute

## License

MIT