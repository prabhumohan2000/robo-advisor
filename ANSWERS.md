# Project Answers

## 1. Approach & Thought Process

- Analyzed existing NestJS codebase structure
- Identified key improvements: idempotency, error messages, documentation
- Implemented header-based idempotency with SHA-256 hash validation
- Improved error messages from technical paths to user-friendly strings
- Created comprehensive documentation with practical examples

---

## 2. Assumptions Made

### Technical
- In-memory storage acceptable (no database required)
- 24-hour TTL sufficient for idempotency cache
- Single-instance deployment (no distributed system)

### Business
- US market hours (9:30 AM - 4:00 PM EST)
- Orders execute same day if within market hours
- JWT authentication sufficient

---

## 3. Challenges Faced

### Challenge 1: Idempotency Implementation
**Problem**: Initially in request body, caused duplicate Swagger fields
**Solution**: Moved to `Idempotency-Key` header with SHA-256 hash validation

### Challenge 2: Error Message Formatting
**Problem**: Technical paths like `portfolio.0.percentage`
**Solution**: Used `exceptionFactory` in ValidationPipe to return clean single string

### Challenge 3: Swagger Duplicate Headers
**Problem**: `@ApiHeader` and `@Headers()` created duplicates
**Solution**: Removed decorator, let NestJS auto-generate

---

## 4. Production Migration Changes

### Security
- Implement refresh tokens, rate limiting, MFA
- Secure JWT_SECRET in secrets manager (AWS Secrets Manager)
- RBAC for authorization
- Helmet.js for security headers, CSRF protection

### Database & Infrastructure
- PostgreSQL with connection pooling
- Redis for distributed idempotency cache
- Kubernetes/ECS with load balancer
- Auto-scaling, circuit breakers

### Monitoring
- Structured logging (Winston/Pino)
- APM (New Relic, Datadog)
- Error tracking (Sentry)
- Metrics (Prometheus + Grafana)

### Compliance
- Audit logs for all transactions
- GDPR compliance
- SOC2/PCI-DSS if handling payments

### Testing & CI/CD
- Integration tests with test database
- E2E tests (Playwright)
- Load testing (k6)
- Security scanning (Snyk)
- Automated deployment pipelines

---

## 5. LLM Usage (Claude Code)

### Example 1: Idempotency Implementation
**Prompt**: "Add Idempotency Handling in the order splitting creation request"
**LLM Generated**:
- SHA-256 hash validation logic
- Lazy expiration mechanism (24h TTL)
- 6 comprehensive test cases
- Saved ~2 hours

### Example 2: Error Message Formatting
**Prompt**: "error message should not be an array"
**LLM Generated**:
- Built-in ValidationPipe with exceptionFactory
- User-friendly DTO validation messages
- Avoided over-engineering (initially suggested custom pipe)

### Example 3: Documentation
**Prompt**: "Reorganize README... Add practical curl examples"
**LLM Generated**:
- System architecture ASCII diagram
- Copy-paste ready curl commands
- Clear Getting Started section
- Saved ~1 hour

### Benefits
- **Speed**: 60% time reduction (3-4 hours vs 8-10 hours)
- **Quality**: Production-ready patterns, comprehensive tests
- **Learning**: Discovered NestJS `exceptionFactory`, lazy expiration patterns

---

## Production-Level Improvements

### 1. CORS

```ts
app.enableCors({ origin: '*', methods: ['GET', 'POST'] });
```

**Description:**
Allows browser requests to your API.

---

### 2. Graceful Shutdown

```ts
app.enableShutdownHooks();
```

**Description:**
Stops the server safely without breaking active requests.

---

### 3. Logger

```ts
private readonly logger = new Logger(LoggerMiddleware.name);
this.logger.log(`[${req.method}] ${req.path} - ${ms}ms`);
```

**Description:**
Logs API requests and errors clearly.