# Project Answers

## What was your approach (thought process) to tackling this project?

My approach focused on building a robust order splitting system with proper validation and user experience:

1. **Understanding the Domain**: Started by analyzing how portfolio management works - users want to invest a fixed amount across multiple stocks based on percentage allocations. This required precise decimal handling to avoid rounding errors in financial calculations.

2. **Core Architecture**: Built around NestJS modules for separation of concerns:
   - Auth module for JWT-based authentication
   - Orders module for the main business logic
   - Users service to manage balances and holdings

3. **Order Splitting Logic**: Implemented proportional allocation where each stock gets `(totalAmount × percentage) / 100`, then divided by price to get shares. Used the Decimal.js library to handle precise decimal arithmetic.

4. **Market Hours Validation**: Added execution date calculation based on US market hours (9:30 AM - 4:00 PM EST), weekends, and scheduling logic for after-hours orders.

5. **Testing Strategy**: Wrote comprehensive unit tests covering edge cases like insufficient balance, invalid percentages, sell operations with insufficient holdings, and idempotency scenarios.

---

## What assumptions did you make?

**Business Assumptions:**
- The system uses US stock market hours (NYSE/NASDAQ: 9:30 AM - 4:00 PM EST)
- Orders placed during market hours execute same-day; orders placed outside market hours or on weekends are scheduled for the next trading day
- Each user starts with an initial balance (configurable via environment variable)
- Stock prices are either fixed (default $100) or provided by the client per stock
- Market holidays are not tracked - only weekends and market hours matter

**Technical Assumptions:**
- In-memory storage is acceptable for this prototype (no database required)
- Single-instance deployment (idempotency store doesn't need to be distributed)
- 24-hour TTL for idempotency keys is sufficient for preventing duplicate orders
- JWT tokens are sufficient for authentication without OAuth or SSO
- Portfolio percentages must sum to exactly 100% (with 0.01% tolerance for floating point precision)

**Data Assumptions:**
- Share quantities can be fractional (e.g., 10.567 shares) with configurable decimal precision
- Users can hold negative balances temporarily (no hard enforcement in prototype)
- Holdings are calculated by aggregating all historical orders (no separate holdings table)

---

## What challenges did you face when creating your solution?

**Challenge 1: Idempotency Implementation**

Initially placed the idempotency key in the request body, but this caused issues:
- Swagger UI showed duplicate fields
- Didn't follow HTTP standards for idempotency

Solution: Moved to an `Idempotency-Key` HTTP header with SHA-256 hash validation of the request payload. This ensures the same key with different payloads is rejected, preventing misuse.

**Challenge 2: Decimal Precision in Financial Calculations**

JavaScript's native number type has floating-point precision issues (e.g., `0.1 + 0.2 !== 0.3`), which is unacceptable for financial calculations.

Solution: Used Decimal.js for all monetary and share calculations, then rounded to appropriate precision (2 decimals for money, configurable for shares).

**Challenge 3: Error Message Formatting**

NestJS validation errors returned as arrays with technical paths like `portfolio.0.percentage`, which is not user-friendly.

Solution: Implemented a custom `exceptionFactory` in ValidationPipe to flatten all validation errors into a single, semicolon-separated string message.

**Challenge 4: Market Hours Timezone Handling**

Needed to ensure market hours validation works regardless of server timezone.

Solution: Used `date-fns-tz` to convert current time to `America/New_York` timezone before comparing against market hours, ensuring consistent behavior.

**Challenge 5: Portfolio Percentage Validation**

Percentages must sum to exactly 100%, but floating-point arithmetic can cause issues (e.g., `60.5 + 39.5` might not equal exactly 100 due to representation).

Solution: Used Decimal.js for summing percentages and allowed a 0.01% tolerance when checking if the sum equals 100.

---

## If you were to migrate your code from its current standalone format to a fully functional production environment, what are some changes and controls you would put in place (e.g. security controls)?

### Security Controls

**Authentication & Authorization:**
- Implement refresh token mechanism (currently only access tokens)
- Add role-based access control (RBAC) for admin vs. regular users
- Use OAuth2/OpenID Connect for enterprise SSO integration
- Implement MFA (multi-factor authentication) for sensitive operations
- Add API key authentication for service-to-service calls

**Secrets Management:**
- Move JWT_SECRET and other secrets to AWS Secrets Manager / Azure Key Vault
- Use environment-specific secrets (dev, staging, prod)
- Implement secret rotation policies
- Never commit secrets to version control (already using .env)

**API Security:**
- Add rate limiting per user/IP (using Redis + @nestjs/throttler)
- Implement request size limits to prevent DoS
- Add Helmet.js for security headers (CSP, HSTS, etc.)
- Enable CORS with whitelist of allowed origins (not wildcard)
- Add input sanitization to prevent XSS/injection attacks
- Implement API versioning (/v1/orders) for backward compatibility

**Data Security:**
- Encrypt sensitive data at rest (PII, financial data)
- Use HTTPS/TLS for all communication
- Implement data retention policies
- Add PII anonymization for logs
- Hash passwords with bcrypt (already done)

### Infrastructure & Scalability

**Database:**
- Migrate to PostgreSQL with TypeORM for persistence
- Implement database connection pooling
- Add read replicas for scaling reads
- Use database migrations (TypeORM migrations)
- Implement backup and disaster recovery

**Caching & Sessions:**
- Use Redis for:
  - Idempotency key storage (currently in-memory)
  - Rate limiting
  - Session management
  - Caching frequently accessed data
- Set appropriate TTLs for cached data

**Deployment:**
- Containerize with Docker (multi-stage builds)
- Deploy on Kubernetes/AWS ECS with:
  - Auto-scaling based on CPU/memory
  - Load balancing across multiple instances
  - Health checks and readiness probes
  - Rolling updates with zero downtime
- Use infrastructure as code (Terraform/CloudFormation)

### Monitoring & Observability

**Logging:**
- Structured JSON logging (Winston/Pino)
- Centralized log aggregation (ELK stack / CloudWatch)
- Log correlation IDs for tracing requests
- Different log levels per environment

**Metrics & Monitoring:**
- Application Performance Monitoring (Datadog/New Relic)
- Custom business metrics (orders/second, revenue, etc.)
- Infrastructure monitoring (Prometheus + Grafana)
- Set up alerts for:
  - Error rate spikes
  - High latency
  - Failed authentication attempts
  - Low balance warnings

**Error Tracking:**
- Integrate Sentry for error tracking and reporting
- Add breadcrumbs for debugging
- Group and prioritize errors

### Testing & Quality

**Testing:**
- Increase test coverage to >90% (currently 99% for orders)
- Add integration tests with real database
- Add E2E tests with Supertest
- Performance/load testing (k6/Artillery)
- Contract testing for API consumers

**CI/CD:**
- Automated testing in CI pipeline
- Code quality checks (ESLint, Prettier, SonarQube)
- Security scanning (Snyk, OWASP dependency check)
- Automated deployments with approval gates
- Blue-green or canary deployments

### Data & Business Logic

**Transactions:**
- Implement database transactions to ensure atomicity (balance deduction + order creation)
- Add distributed transactions if using microservices
- Implement optimistic locking for concurrent updates

**Audit Trail:**
- Log all order operations (created, modified, cancelled)
- Track who did what and when
- Implement soft deletes (never physically delete data)

**Market Data:**
- Integrate with real-time market data APIs (Alpha Vantage, IEX Cloud)
- Add market holiday calendar
- Implement circuit breakers for external API calls
- Cache market hours and holiday data

**Order Management:**
- Add order status transitions (pending → scheduled → executed → settled)
- Implement order cancellation
- Add order modification support
- Implement settlement/reconciliation process

### Compliance & Legal

**Regulatory:**
- Implement audit logging for compliance (SOX, GDPR)
- Add data residency controls
- Implement right to deletion (GDPR)
- Add consent management

**Financial:**
- Implement fractional shares only if broker supports it
- Add transaction limits per user
- Implement suspicious activity monitoring
- Add KYC/AML checks integration

---

## If you've used LLMs to solve the challenge, describe how and where you've used it and how did it help you in tackling the challenge? Provide specific examples and details.

Yes, I used Claude Code (an AI coding assistant) throughout the development process as a productivity tool and coding partner. Here's how:

### Specific Examples of LLM Usage

**Example 1: Idempotency Implementation**

I asked Claude: "Add idempotency to the order creation endpoint to prevent duplicate orders"

Claude helped by:
- Suggesting using HTTP headers instead of request body (follows REST best practices)
- Providing SHA-256 hash implementation for request payload validation
- Writing the logic to check if the same key is used with different payloads
- Creating test cases for idempotency scenarios

What I did: Reviewed the generated code, adjusted the hash calculation to exclude timestamps, and added 24-hour TTL logic.

**Example 2: Decimal Precision for Financial Calculations**

I asked: "How should I handle decimal precision in JavaScript for financial calculations?"

Claude helped by:
- Recommending Decimal.js library instead of native numbers
- Showing how to use Decimal for percentage calculations
- Providing examples of rounding to appropriate precision

What I did: Applied Decimal.js to all monetary and share calculations, tested edge cases with very small amounts.

**Example 3: Error Message Formatting**

I asked: "NestJS validation returns an array of errors. I need a single string message."

Claude helped by:
- Suggesting the `exceptionFactory` option in ValidationPipe
- Providing code to flatten nested validation errors
- Showing how to join multiple errors with semicolons

What I did: Customized the format to match our API standards and added context to error messages.

**Example 4: Market Hours Logic**

I asked: "Implement market hours validation for US stock market"

Claude helped by:
- Providing the correct timezone (`America/New_York` for EST/EDT)
- Writing logic to check weekends using date-fns
- Creating the execution date calculation algorithm

What I did: Verified the market hours (9:30 AM - 4:00 PM), tested edge cases around market open/close, noted that market holidays aren't tracked.

**Example 5: Test Cases**

I asked: "Write comprehensive unit tests for the order service"

Claude helped by:
- Generating test structure with describe/it blocks
- Creating mock data for users, stocks, orders
- Writing assertions for edge cases

What I did: Added additional test cases for boundary conditions, verified all assertions, ensured 99% coverage.

### How LLM Usage Helped

**Speed:** Reduced development time by approximately 40-50%. Tasks that would take hours (like writing comprehensive tests) were completed in minutes.

**Code Quality:** Claude suggested best practices I might have missed:
- Using exceptionFactory instead of custom validation logic
- Proper timezone handling with date-fns-tz
- SHA-256 for idempotency validation
- Decimal.js for financial precision

**Learning:** Discovered NestJS features I wasn't aware of:
- @ApiProperty decorators for Swagger documentation
- ValidationPipe's exceptionFactory
- @Headers() decorator for extracting headers

**Documentation:** Generated clear, copy-paste ready examples for README and API documentation.

### What I Verified/Modified

While Claude was extremely helpful, I didn't blindly accept everything:

- **Reviewed all generated code** for correctness and security
- **Tested edge cases** that Claude might not have considered
- **Modified business logic** to match exact requirements (e.g., percentage tolerance)
- **Verified financial calculations** manually with sample data
- **Customized error messages** to be more user-friendly
- **Added additional test cases** for scenarios Claude missed
