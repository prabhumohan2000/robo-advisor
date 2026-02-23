# Production-Level Improvements

## 1. CORS

```ts
app.enableCors({ origin: '*', methods: ['GET', 'POST'] });
```

**Description:**  
Allows browser requests to your API.

---

## 2. Graceful Shutdown

```ts
app.enableShutdownHooks();
```

**Description:**  
Stops the server safely without breaking active requests.

---

## 3. Logger

```ts
private readonly logger = new Logger(LoggerMiddleware.name);
this.logger.log(`[${req.method}] ${req.path} - ${ms}ms`);
```

**Description:**  
Logs API requests and errors clearly.