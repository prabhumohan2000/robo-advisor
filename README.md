# Robo Advisor API

Portfolio order splitting API for managed investments.

---

## Getting Started

### 1. Install
```bash
npm install
```

### 2. Configure Environment
Create a `.env` file in the project root:

```env
PORT=3000
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=6h
FIXED_PRICE=100
SHARE_DECIMALS=3
```

**Environment Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `JWT_SECRET` | (required) | JWT signing key |
| `JWT_EXPIRES_IN` | 6h | Token expiration |
| `FIXED_PRICE` | 100 | Default stock price ($) |
| `SHARE_DECIMALS` | 3 | Share quantity precision |

### 3. Run
```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

Server: `http://localhost:3000`

### 4. Test
```bash
# Run tests
npm test

# With coverage
npm test -- --coverage
```

**Coverage:** 34 tests | Orders: 99% coverage

### 5. API Documentation
Swagger UI: `http://localhost:3000/api`

---

## System Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTP/REST
       ▼
┌─────────────────────────────────────┐
│         NestJS Application          │
├─────────────────────────────────────┤
│  ┌──────────┐  ┌──────────────┐   │
│  │   Auth   │  │   Orders     │   │
│  │ Module   │  │   Module     │   │
│  └────┬─────┘  └──────┬───────┘   │
│       │                │            │
│  ┌────▼────────────────▼───────┐   │
│  │      Users Service          │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │   In-Memory Storage         │   │
│  │  • Users                    │   │
│  │  • Orders                   │   │
│  │  • Holdings                 │   │
│  │  • Idempotency Cache (24h)  │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

**Key Features:**
- JWT authentication
- Portfolio order splitting
- Idempotency with SHA-256 hash validation
- Market hours scheduling (US EST)
- In-memory storage

---

## API Quick Reference

### Authentication
```bash
# Signup
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# Response
{
  "accessToken": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 21600
}

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# Get Profile
curl http://localhost:3000/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Orders
```bash
# Create Order (BUY)
curl -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 123e4567-e89b-12d3-a456-426614174000" \
  -d '{
    "amount": 1000,
    "orderType": "BUY",
    "portfolio": [
      {
        "stockId": "a1b2c3d4-0001-4000-8000-000000000001",
        "percentage": 60,
        "marketPrice": 150
      },
      {
        "stockId": "a1b2c3d4-0002-4000-8000-000000000002",
        "percentage": 40
      }
    ]
  }'

# List Orders
curl http://localhost:3000/orders \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get Holdings
curl http://localhost:3000/orders/holdings \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Stocks
```bash
# List Available Stocks
curl http://localhost:3000/stocks
```

---

## Idempotency

Use `Idempotency-Key` header to prevent duplicate orders:

- **Same key + same payload** → Returns cached order (24h TTL)
- **Same key + different payload** → `400 Bad Request`
- **Same key + different user** → `400 Bad Request`

```bash
curl -X POST http://localhost:3000/orders \
  -H "Idempotency-Key: YOUR-UNIQUE-UUID" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  ...
```

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/signup` | No | Register new user |
| POST | `/auth/login` | No | Login user |
| GET | `/auth/me` | Yes | Get user profile |
| POST | `/orders` | Yes | Create order |
| GET | `/orders` | Yes | List user orders |
| GET | `/orders/holdings` | Yes | Get holdings summary |
| GET | `/orders/:id` | Yes | Get order by ID |
| GET | `/stocks` | No | List available stocks |
| GET | `/health` | No | Health check |

---

## Error Handling

All validation errors return a single string message:

```json
{
  "statusCode": 400,
  "message": "Amount must be at least $0.01; Percentage cannot exceed 100",
  "error": "Bad Request"
}
```

---