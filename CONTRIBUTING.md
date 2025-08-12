# Contributing to Solana Error Code Explanation API

Thank you for your interest in contributing! This guide will help you get started with contributing to the project.

## 🤝 How to Contribute

We welcome contributions of all kinds:
- 🐛 Bug reports and fixes
- ✨ New features and enhancements
- 📚 Documentation improvements
- 🧪 Test coverage improvements
- 🔒 Security improvements
- 💡 Ideas and suggestions

## 🚀 Getting Started

### Prerequisites

- **Node.js 20+** (LTS recommended)
- **Git** for version control
- **AWS CLI** (for deployment testing)
- **TypeScript** knowledge
- **Jest** testing framework familiarity

### Development Setup

1. **Fork the repository**
   ```bash
   # Click "Fork" on GitHub, then clone your fork
   git clone https://github.com/YOUR_USERNAME/solana-error-api.git
   cd solana-error-api
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment**
   ```bash
   # Copy example environment file
   cp .env.example .env
   
   # Edit .env with your configuration
   # Note: You don't need real AWS credentials for most development
   ```

4. **Build and test**
   ```bash
   # Build the project
   npm run build
   
   # Run tests with hang detection (recommended)
   node scripts/detect-hang.js test
   
   # Or run tests traditionally
   npm test
   ```

## 🛠️ Development Workflow

### 1. Create a Feature Branch

```bash
# Create and switch to a new branch
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/bug-description
```

### 2. Make Your Changes

Follow our coding standards:

- **TypeScript**: Use strict mode and proper typing
- **Testing**: Write tests for new functionality
- **Documentation**: Update docs for user-facing changes
- **Security**: Follow security best practices

### 3. Test Your Changes

```bash
# Run all tests with hang detection
node scripts/detect-hang.js test

# Run specific test files
npm test tests/services/your-service.test.ts

# Check test coverage
npm run test:coverage

# Run linting
npm run lint

# Format code
npm run format
```

### 4. Commit Your Changes

We use conventional commits for clear history:

```bash
# Good commit messages
git commit -m "feat: add static error database fallback"
git commit -m "fix: resolve timeout issue in AI service"
git commit -m "docs: update API documentation"
git commit -m "test: add comprehensive fallback service tests"

# Commit types:
# feat: new feature
# fix: bug fix
# docs: documentation changes
# test: adding or updating tests
# refactor: code refactoring
# style: formatting changes
# chore: maintenance tasks
```

### 5. Push and Create Pull Request

```bash
# Push your branch
git push origin feature/your-feature-name

# Create a pull request on GitHub
# Include a clear description of your changes
```

## 📋 Pull Request Guidelines

### PR Checklist

Before submitting your PR, ensure:

- [ ] **Tests pass**: All tests pass with hang detection
- [ ] **Code coverage**: New code has appropriate test coverage
- [ ] **Linting**: Code follows ESLint and Prettier rules
- [ ] **Documentation**: User-facing changes are documented
- [ ] **Security**: No security vulnerabilities introduced
- [ ] **Type safety**: TypeScript compilation succeeds
- [ ] **Conventional commits**: Commit messages follow convention

### PR Description Template

```markdown
## Description
Brief description of changes made.

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed

## Security Considerations
- [ ] No sensitive data exposed
- [ ] Input validation added where needed
- [ ] Security best practices followed

## Related Issues
Closes #123
```

## 🧪 Testing Guidelines

### Writing Tests

1. **Test Structure**: Use Jest with describe/it blocks
2. **Test Coverage**: Aim for 95%+ coverage for new code
3. **Mocking**: Mock external dependencies appropriately
4. **Hang Detection**: Always use hang detection for test runs

```typescript
// Example test structure
describe('YourService', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  describe('methodName', () => {
    it('should handle normal case', () => {
      // Test implementation
    });

    it('should handle error case', () => {
      // Error handling test
    });

    it('should handle edge cases', () => {
      // Edge case testing
    });
  });
});
```

### Running Tests Safely

```bash
# Always use hang detection for development
node scripts/detect-hang.js test

# For specific test files
node scripts/detect-hang.js test tests/services/your-service.test.ts

# Monitor test execution
node scripts/detect-hang.js monitor npm test
```

## 🔒 Security Guidelines

### Security Best Practices

1. **Input Validation**: Always validate and sanitize inputs
2. **Error Handling**: Never expose sensitive information
3. **Dependencies**: Keep dependencies updated and secure
4. **Secrets**: Never commit API keys or secrets
5. **Logging**: Exclude sensitive data from logs

### Security Checklist

- [ ] Input validation implemented
- [ ] Error messages don't leak sensitive info
- [ ] No hardcoded secrets or API keys
- [ ] Dependencies are up to date
- [ ] Security tests included
- [ ] `npm audit` passes without high/critical issues

## 📚 Documentation Standards

### Code Documentation

- **JSDoc**: Document all public APIs
- **README**: Update for user-facing changes
- **CHANGELOG**: Add entries for notable changes
- **Type Definitions**: Ensure TypeScript types are accurate

### Documentation Example

```typescript
/**
 * Explains a Solana/Anchor error code with fallback mechanisms
 * @param errorCode - The error code to explain (number or hex string)
 * @param context - Optional context about the error
 * @returns Promise resolving to error explanation
 * @throws {Error} When error code format is invalid
 * 
 * @example
 * ```typescript
 * const explanation = await explainError(6000);
 * console.log(explanation.fixes); // Array of fix suggestions
 * ```
 */
async explainError(errorCode: number, context?: string): Promise<ErrorExplanation>
```

## 🎯 Areas for Contribution

### High Priority
- **Error Database Expansion**: Add more common error codes
- **Performance Optimization**: Improve response times
- **Test Coverage**: Increase coverage in specific areas
- **Documentation**: Improve developer experience

### Medium Priority
- **New Features**: GraphQL API, batch processing
- **Integrations**: IDE extensions, CLI tools
- **Monitoring**: Enhanced observability features
- **Internationalization**: Multi-language support

### Good First Issues
- **Documentation fixes**: Typos, clarity improvements
- **Test additions**: Edge cases, error scenarios
- **Code cleanup**: Refactoring, optimization
- **Configuration**: Environment variable improvements

## 🏷️ Issue Labels

We use these labels to categorize issues:

- `bug`: Something isn't working
- `enhancement`: New feature or request
- `documentation`: Improvements or additions to docs
- `good first issue`: Good for newcomers
- `help wanted`: Extra attention is needed
- `security`: Security-related issues
- `performance`: Performance improvements
- `testing`: Testing-related changes

## 💬 Communication

### Getting Help

- **GitHub Discussions**: For questions and ideas
- **GitHub Issues**: For bugs and feature requests
- **Security Issues**: Email security@example.com (private)

### Code Review Process

1. **Automated Checks**: CI/CD runs tests and security scans
2. **Peer Review**: At least one maintainer reviews code
3. **Security Review**: Security-sensitive changes get extra review
4. **Documentation Review**: User-facing changes reviewed for clarity

## 🎉 Recognition

Contributors are recognized in:
- **README.md**: Contributors section
- **Release Notes**: Notable contributions mentioned
- **GitHub**: Contributor graphs and statistics

## 📞 Contact

- **Maintainers**: @maintainer1, @maintainer2
- **Security**: security@example.com
- **General**: Open a GitHub Discussion

---

Thank you for contributing to the Solana Error Code Explanation API! Your contributions help make Solana development more accessible for everyone. 🚀