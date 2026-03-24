# Project Answers

## What was your approach (thought process) to tackling this project?

My approach focused on building a robust, scalable order splitting system with event-driven architecture:

1. **Understanding the Domain**: Started by analyzing how portfolio management works - users want to invest a fixed amount across multiple stocks based on percentage allocations. This required precise decimal handling to avoid rounding errors in financial calculations.

2. **Core Architecture**: Built around NestJS modules with clear separation of concerns:
   - **Accounts Module**: Multi-tenant account management with per-account balances and holdings
   - **Orders Module**: Order creation, portfolio splitting, and execution logic
   - **Events Module**: Kafka-based event-driven architecture for async processing
   - **Stocks Module**: Stock catalog and metadata

3. **Multi-Tenant Account System**: Migrated from global ENV-based balance to per-account system:
   - Each account has its own balance, holdings, and totalInvested tracking
   - Full CRUD operations via REST API (create account, deposit, withdraw, get balance)
   - Account isolation ensures proper multi-tenant support
   - All in-memory (no database dependency)

4. **Event-Driven Architecture with Kafka**: Implemented async event processing for scalability:
   - **Event Types**: `order.created`, `order.executed`, `balance.updated`, `holdings.updated`
   - **Producer**: EventsService emits events to Kafka topics
   - **Consumer**: Separate microservice processes events for notifications, analytics, webhooks
   - **Benefits**: Decoupled services, horizontal scalability, audit trail, async processing

5. **Order Execution System**: Automated order execution with cron jobs:
   - Cron job runs every minute during market hours (9:30 AM - 4:00 PM EST)
   - Automatically executes pending/scheduled/queued orders
   - Manual execution endpoints for specific orders or dates
   - Order status tracking: PENDING → SCHEDULED → QUEUED → EXECUTED/FAILED
   - Execution events emitted to Kafka for downstream processing

6. **Order Splitting Logic**: Implemented proportional allocation where each stock gets `(totalAmount × percentage) / 100`, then divided by price to get shares. Used the Decimal.js library to handle precise decimal arithmetic.

7. **Market Hours Validation**: Added execution date calculation based on US market hours (9:30 AM - 4:00 PM EST), weekends, and scheduling logic for after-hours orders.

8. **Testing Strategy**: Wrote comprehensive unit tests (39 tests total) covering:
   - Edge cases like insufficient balance, invalid percentages
   - SELL operations with insufficient holdings validation
   - Idempotency scenarios (duplicate requests, payload conflicts)
   - Holdings tracking across multiple BUY/SELL operations
   - Fractional share calculations
   - Balance changes through trading operations
   - Achieved 98%+ code coverage on the orders service

6. **Platform-Level Balance**: Implemented a single unified platform balance (not user-level):
   - Platform starts with configurable initial balance (`INITIAL_BALANCE` in `.env`)
   - `/orders/holdings` - Returns platform balance, stock holdings, and total invested amount
   - BUY orders reduce balance, SELL orders increase balance
   - Balance is managed entirely through trading operations
   - No separate deposit/withdraw mechanisms - balance changes only through trades

---

## What assumptions did you make?

**Business Assumptions:**
- The system uses US stock market hours (NYSE/NASDAQ: 9:30 AM - 4:00 PM EST)
- Orders placed during market hours execute same-day; orders placed outside market hours or on weekends are scheduled for the next trading day
- Stock prices are either fixed (default $100) or provided by the client per stock
- Market holidays are not tracked - only weekends and market hours matter
- The platform uses a single unified master balance rather than individual user accounts. Trade execution affects this universal pool.

**Technical Assumptions:**
- In-memory storage is acceptable for this prototype (no database required)
- Single-instance deployment (idempotency store doesn't need to be distributed)
- 24-hour TTL for idempotency keys is sufficient for preventing duplicate orders
- JWT tokens are sufficient for authentication without OAuth or SSO
- Portfolio percentages must sum to exactly 100% (with 0.01% tolerance for floating point precision)

**Data Assumptions:**
- Share quantities can be fractional (e.g., 10.567 shares) with configurable decimal precision
- Holdings are tracked in-memory and updated with each BUY/SELL transaction
- Total invested is calculated by summing all BUY orders minus SELL orders
- Platform balance cannot go negative (enforced validation on BUY orders and withdrawals)
- **Each order item's `amount` field represents the actual cost (shares × price), not the allocated percentage amount**
- Due to share rounding, the actual total charged may differ slightly from the requested amount (typically by cents)

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

**Challenge 6: Amount Precision - Actual vs Allocated Amounts**

Initial implementation stored the allocated amount (percentage × total) for each order item, but this created a critical financial discrepancy: the stored `amount` didn't equal `shares × price` due to share rounding.

Example of the problem:
- Request: $100,000 split 60/40 at $100.01 per share
- Stock 1: Allocated $60,000 → 599.94 shares (rounded) → **actual cost $59,994.00**
- Stored amount was $60,000, but actual value of shares was $59,994.00 ❌

Solution: Changed `amount` to represent the **actual cost** (shares × price) instead of the allocated amount:
1. Calculate shares from allocated amount: `shares = (amount × percentage ÷ 100) ÷ price`
2. Round shares to configured decimals (default: 3)
3. **Calculate actual amount: `amount = roundedShares × price`**
4. Use sum of actual amounts for `totalAmount` and balance deduction

This ensures perfect financial accuracy where `amount === shares × price` for every order item, preventing accounting discrepancies.

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
