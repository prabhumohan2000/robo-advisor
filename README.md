# Robo Advisor API

Portfolio order splitting API for managed investments.

A NestJS-based service that allocates investments across multiple stocks according to portfolio weights, supporting buy/sell operations with built-in idempotency and market-hours checks.

---

## Getting Started

### 1. Install
```bash
yarn install
```

### 2. Configure Environment
Copy the sample environment file and configure:

```bash
# Windows
copy .env.sample .env

# macOS/Linux
cp .env.sample .env
```

Edit `.env` with your configuration:

```env
PORT=3000
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=6h
FIXED_PRICE=100
SHARE_DECIMALS=3
INITIAL_BALANCE=10000
```

**Environment Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `JWT_SECRET` | (required) | JWT signing key |
| `JWT_EXPIRES_IN` | 6h | Token expiration |
| `FIXED_PRICE` | 100 | Default stock price ($) |
| `SHARE_DECIMALS` | 3 | Share quantity precision |
| `INITIAL_BALANCE` | 10000 | Initial user balance ($) |

### 3. Run
```bash
# Development
yarn start:dev

# Production
yarn build
yarn start:prod
```

Server: `http://localhost:3000`

### 4. Test
```bash
# Run tests
yarn test

# With coverage
yarn test --coverage
```

**Coverage:** 37 tests | Orders Service: 98% coverage

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
# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Response
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 21600,
  "grant_type": "password"
}
```
```

### Portfolio & Balance

The platform uses a **single unified balance pool** that is managed through trading operations.

```bash
# Get Holdings & Portfolio Summary
curl http://localhost:3000/orders/holdings

# Response
```json
{
  "platformBalance": 99000,
  "holdings": [
    {
      "symbol": "AAPL",
      "shares": 6
    },
    {
      "symbol": "TSLA",
      "shares": 4
    }
  ],
  "totalInvested": 1000
}
```
```

**How Balance Works:**
- Platform starts with initial balance (configured via `INITIAL_BALANCE` in `.env`, default: $10,000)
- **BUY orders**: Reduce platform balance, increase holdings
- **SELL orders**: Increase platform balance, decrease holdings
- `totalInvested` shows net amount invested (total BUY - total SELL)

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

# Response
```json
{
  "id": "e89b-12d3...",
  "userId": "user-uuid...",
  "orderType": "BUY",
  "totalAmount": 1000,
  "items": [
    {
      "symbol": "AAPL",
      "amount": 600,
      "shares": 4
    },
    {
      "symbol": "TSLA",
      "amount": 400,
      "shares": 4
    }
  ],
  "executeOn": "2024-03-06",
  "status": "SCHEDULED",
  "createdAt": "2024-03-06T10:00:00.000Z"
}
```

# List Orders
curl http://localhost:3000/orders \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response
```json
[
  {
    "id": "e89b-12d3...",
    "userId": "user-uuid...",
    "orderType": "BUY",
    "totalAmount": 1000,
    "items": [...],
    "executeOn": "2024-03-06",
    "status": "SCHEDULED",
    "createdAt": "2024-03-06T10:00:00.000Z"
  }
]
```
```

### Stocks
```bash
# List Available Stocks
curl http://localhost:3000/stocks

# Response
```json
[
  {
    "id": "a1b2c3d4-0001-4000-8000-000000000001",
    "symbol": "AAPL",
    "name": "Apple Inc."
  },
  {
    "id": "a1b2c3d4-0002-4000-8000-000000000002",
    "symbol": "TSLA",
    "name": "Tesla, Inc."
  }
]
```
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
| POST | `/orders` | No | Create order (BUY/SELL) |
| GET | `/orders` | No | List all orders |
| GET | `/orders/holdings` | No | Get platform balance, holdings, and total invested |
| GET | `/orders/:id` | No | Get order by ID |
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

If a login fails due to a non-existent email or wrong password, it returns a `401 Unauthorized` response:

```json
{
  "statusCode": 401,
  "message": "Invalid credentials",
  "error": "Unauthorized"
}
```

---