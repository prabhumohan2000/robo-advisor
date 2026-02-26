# Project Answers

## 1. Approach & Thought Process

- I analyzed the NestJS codebase and identified key improvements  
- I focused on idempotency, validation, and documentation  
- I implemented header-based idempotency with SHA-256 validation  
- I improved error responses to be user-friendly  
- I added clear documentation with practical examples  

---

## 2. Assumptions Made

### Technical

- I assumed in-memory storage is sufficient for idempotency  
- I used a 24-hour TTL for idempotency keys  
- I assumed a single-instance deployment  

### Business

- I assumed US market hours (9:30 AM – 4:00 PM EST)  
- I assumed same-day execution within market hours  
- I assumed JWT-based authentication is sufficient  

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

To migrate this solution to a production environment, I would introduce the following improvements:

---

### Security

- I would implement JWT authentication with refresh tokens  
- I would add rate limiting (e.g., Redis-based throttling)  
- I would store secrets (e.g., JWT_SECRET) in a secure manager  
- I would implement RBAC for authorization  
- I would use security middleware (Helmet) for headers and protection  

---

### Database & Infrastructure

- I would use PostgreSQL with connection pooling  
- I would use Redis for caching and idempotency handling  
- I would containerize using Docker  
- I would deploy on Kubernetes/ECS with load balancing and auto-scaling  

---

### Monitoring

- I would implement structured logging (Winston/Pino)  
- I would use APM tools (Datadog/New Relic)  
- I would track errors (Sentry) and metrics (Prometheus/Grafana)  

---

### Testing & CI/CD

- I would add integration and E2E tests  
- I would perform load testing  
- I would set up CI/CD pipelines for automated deployments  

---

### Summary

These changes would make the system **secure, scalable, and production-ready**.

---

## 5. LLM Usage (Claude Code)

I have used LLM tools (Claude Code) as a **development accelerator** to improve productivity and explore standard implementation patterns. All generated outputs were reviewed, validated, and adapted to align with the project requirements.

---

### Example 1: Idempotency Implementation  
**Prompt**: "Add idempotency handling in the order splitting creation request"  

**LLM Contribution**:  
- Suggested SHA-256 based request validation  
- Proposed TTL-based (24h) key expiration  
- Generated test scenarios for duplicate request handling  

---

### Example 2: Error Message Formatting  
**Prompt**: "Error message should not be an array"  

**LLM Contribution**:  
- Suggested using NestJS `ValidationPipe` with `exceptionFactory`  
- Enabled structured and user-friendly validation responses  
- Helped avoid unnecessary custom implementations  

---

### Example 3: Documentation  
**Prompt**: "Reorganize README and add curl examples"  

**LLM Contribution**:  
- Provided improved README structure  
- Generated copy-paste ready curl commands  
- Suggested a simple system overview  

---

### Benefits

- **Efficiency**: I was able to reduce development time by ~50–60%  
- **Quality**: I adopted production-ready patterns and validation approaches  
- **Learning**: I gained better understanding of NestJS features and API design  

---

### Conclusion

I have used LLM as a **supporting tool for acceleration and reference**, while all final logic, validations, and implementation decisions were reviewed and verified by me.

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