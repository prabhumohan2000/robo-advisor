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
FIXED_PRICE=100
SHARE_DECIMALS=3
KAFKA_BROKER=localhost:9092
```

**Environment Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `FIXED_PRICE` | 100 | Default stock price ($) |
| `SHARE_DECIMALS` | 3 | Share quantity precision |
| `KAFKA_BROKER` | localhost:9092 | Kafka broker address |

### 3. Setup Kafka (Required)

The application uses Kafka for event-driven architecture. You need a running Kafka instance:

**Option 1: Docker (Recommended)**
```bash
# Create docker-compose.yml with Kafka and Zookeeper
docker-compose up -d
```

**Option 2: Local Kafka**
- Download and run Kafka from [kafka.apache.org](https://kafka.apache.org/downloads)
- Start Zookeeper: `bin/zookeeper-server-start.sh config/zookeeper.properties`
- Start Kafka: `bin/kafka-server-start.sh config/server.properties`

### 4. Run

The application consists of two services:

```bash
# Terminal 1: Start the REST API
yarn start:dev

# Terminal 2: Start the Kafka consumer
yarn start:consumer

# Production
yarn build
yarn start:prod          # Terminal 1
yarn start:consumer:prod # Terminal 2
```

API Server: `http://localhost:3000`

### 5. Test
```bash
# Run tests
yarn test

# With coverage
yarn test --coverage
```

**Coverage:** 85 tests | OrdersService: 39 tests (98% coverage) | AccountsService: 46 tests (100% coverage)

### 6. API Documentation
Swagger UI: `http://localhost:3000/api`

---

## System Architecture

### Event-Driven Architecture with Kafka

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTP/REST
       ▼
┌─────────────────────────────────────────────┐
│         NestJS API (Port 3000)              │
├─────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────────────┐│
│  │   Accounts   │  │      Orders          ││
│  │   Module     │  │      Module          ││
│  └──────┬───────┘  └──────┬───────────────┘│
│         │                 │                 │
│         │           ┌─────▼─────────┐       │
│         │           │ OrdersService │       │
│         │           └────────┬──────┘       │
│  ┌──────▼───────────────┐   │               │
│  │  AccountsService     │   │               │
│  └──────┬───────────────┘   │               │
│         │                   │               │
│         └──────┬────────────┘               │
│                ▼                             │
│        ┌───────────────┐                    │
│        │ EventsService │                    │
│        └───────┬───────┘                    │
└────────────────┼────────────────────────────┘
                 │
                 │ Emit Events
                 ▼
        ┌────────────────┐
        │  Kafka Broker  │
        └────────┬───────┘
                 │
                 │ Subscribe
                 ▼
┌─────────────────────────────────────────────┐
│      Kafka Consumer (Microservice)          │
├─────────────────────────────────────────────┤
│  ┌──────────────────────────────────────┐  │
│  │     OrderEventListener               │  │
│  │  • order.created                     │  │
│  │  • balance.updated                   │  │
│  │  • holdings.updated                  │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  Process:                                   │
│  • Send notifications                       │
│  • Update analytics                         │
│  • Trigger webhooks                         │
│  • Audit logging                            │
└─────────────────────────────────────────────┘
```

**Key Features:**
- **Multi-Tenant Accounts**: Per-account balance and holdings tracking
- **Event-Driven Architecture**: Async event processing with Kafka
- **Portfolio Order Splitting**: Percentage-based allocation across stocks
- **Idempotency**: SHA-256 hash validation with 24h TTL
- **Market Hours Scheduling**: US EST 9:30 AM - 4:00 PM awareness
- **Smart Order Status**: pending/scheduled/queued based on market hours
- **In-Memory Storage**: Fast, stateless operation (no database required)

### Event Types

| Event | Emitted When | Consumer Actions |
|-------|-------------|------------------|
| `order.created` | New order is placed | Send notifications, update analytics, trigger webhooks |
| `order.executed` | Order is executed | Send execution confirmations, update performance metrics, tax lot tracking |
| `balance.updated` | Account balance changes | Send low balance alerts, update dashboards, compliance checks |
| `holdings.updated` | Stock holdings change | Update portfolio analytics, trigger rebalancing alerts |

### Order Execution

Orders are automatically executed based on market hours:

**Automatic Execution (Cron Job)**:
- Runs every minute during market hours (9:30 AM - 4:00 PM EST, Mon-Fri)
- Automatically executes all pending/scheduled/queued orders
- Emits `order.executed` events to Kafka

**Manual Execution**:
```bash
# Execute a specific order
POST /orders/{orderId}/execute

# Execute all orders for a specific date
POST /orders/execute/2026-03-24

# Get execution statistics
GET /orders/execution/stats
```

**Order Status Flow**:
```
PENDING → SCHEDULED → QUEUED → EXECUTED
                              ↓
                           FAILED
```

---

## API Quick Reference

### All API Endpoints

| Category | Method | Endpoint | Description |
|----------|--------|----------|-------------|
| **Accounts** | POST | `/accounts` | Create new account |
| | GET | `/accounts` | List all accounts |
| | GET | `/accounts/{id}` | Get account by ID |
| | GET | `/accounts/{id}/balance` | Get account balance & holdings |
| | POST | `/accounts/{id}/deposit` | Deposit funds |
| | POST | `/accounts/{id}/withdraw` | Withdraw funds |
| **Orders** | POST | `/orders` | Create new order |
| | GET | `/orders` | List all orders |
| | GET | `/orders?orderType=BUY` | Filter orders by type |
| | GET | `/orders/{id}` | Get order by ID |
| | POST | `/orders/{id}/execute` | Execute specific order |
| | POST | `/orders/execute/{date}` | Execute all orders for date |
| | GET | `/orders/execution/stats` | Get execution statistics |
| **Stocks** | GET | `/stocks` | List available stocks |
| **Health** | GET | `/health` | Health check |

### Authentication

**Note:** This API currently does not implement authentication. All endpoints are publicly accessible for development and testing purposes.

### Account Management

The system uses a **multi-tenant account architecture** where each account has its own balance and holdings.

#### Create Account
```bash
curl -X POST http://localhost:3000/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "initialBalance": 100000
  }'

# Response
{
  "id": "3ff7ca6a-1937-4f37-b680-43ca0d96a17d",
  "name": "John Doe",
  "balance": 100000,
  "holdings": {},
  "totalInvested": 0,
  "createdAt": "2026-03-24T07:07:35.677Z",
  "updatedAt": "2026-03-24T07:07:35.677Z"
}
```

#### Get All Accounts
```bash
curl http://localhost:3000/accounts
```

#### Get Single Account
```bash
curl http://localhost:3000/accounts/{accountId}
```

#### Get Account Balance & Holdings
```bash
curl http://localhost:3000/accounts/{accountId}/balance

# Response
{
  "accountId": "3ff7ca6a-1937-4f37-b680-43ca0d96a17d",
  "balance": 95000,
  "totalInvested": 5000,
  "holdings": [
    {
      "symbol": "AAPL",
      "shares": 25.5
    },
    {
      "symbol": "TSLA",
      "shares": 15.234
    }
  ]
}
```

#### Deposit Funds
```bash
curl -X POST http://localhost:3000/accounts/{accountId}/deposit \
  -H "Content-Type: application/json" \
  -d '{"amount": 5000}'
```

#### Withdraw Funds
```bash
curl -X POST http://localhost:3000/accounts/{accountId}/withdraw \
  -H "Content-Type: application/json" \
  -d '{"amount": 1000}'
```

**How Account Balance Works:**
- Each account starts with an initial balance (specified at creation)
- **BUY orders**: Reduce account balance, increase holdings
- **SELL orders**: Increase account balance, decrease holdings
- `totalInvested` shows net amount invested (total BUY - total SELL)

**Important: Actual vs Requested Amounts**

Due to fractional share rounding, the **actual amount charged** may differ slightly from the **requested amount**:

- Each order item's `amount` field represents the **true cost**: `shares × price`
- Shares are rounded to 3 decimal places (configurable via `SHARE_DECIMALS`)
- `totalAmount` is the **sum of actual item costs**, not the requested amount
- Your balance is charged the **actual amount**, ensuring financial accuracy

**Example:**
```
Requested: $1,000 (60% AAPL @ $137.50, 40% TSLA @ $137.50)
Calculated:
  - AAPL: 600 ÷ 137.5 = 4.364 shares → 4.364 × $137.5 = $600.05
  - TSLA: 400 ÷ 137.5 = 2.909 shares → 2.909 × $137.5 = $399.99
Actual total charged: $1,000.04 (not $1,000)
```

This ensures that `amount === shares × price` for every order item, preventing accounting discrepancies.

### Orders

#### Create Order (BUY)
```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 123e4567-e89b-12d3-a456-426614174000" \
  -d '{
    "accountId": "3ff7ca6a-1937-4f37-b680-43ca0d96a17d",
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
{
  "id": "e89b-12d3-a456-426614174001",
  "accountId": "3ff7ca6a-1937-4f37-b680-43ca0d96a17d",
  "orderType": "BUY",
  "totalAmount": 1000.04,
  "items": [
    {
      "symbol": "AAPL",
      "amount": 600.00,
      "shares": 4.0
    },
    {
      "symbol": "TSLA",
      "amount": 400.04,
      "shares": 4.0
    }
  ],
  "executeOn": "2026-03-24",
  "status": "PENDING",
  "createdAt": "2026-03-24T10:00:00.000Z"
}
```

#### Create Order (SELL)
```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "3ff7ca6a-1937-4f37-b680-43ca0d96a17d",
    "amount": 500,
    "orderType": "SELL",
    "portfolio": [
      {
        "stockId": "a1b2c3d4-0001-4000-8000-000000000001",
        "percentage": 100
      }
    ]
  }'
```

#### List All Orders
```bash
curl http://localhost:3000/orders

# Response
[
  {
    "id": "e89b-12d3-a456-426614174001",
    "accountId": "3ff7ca6a-1937-4f37-b680-43ca0d96a17d",
    "orderType": "BUY",
    "totalAmount": 1000.04,
    "items": [...],
    "executeOn": "2026-03-24",
    "status": "EXECUTED",
    "createdAt": "2026-03-24T10:00:00.000Z",
    "executedAt": "2026-03-24T14:35:22.000Z"
  }
]
```

#### Filter Orders by Type
```bash
curl http://localhost:3000/orders?orderType=BUY
curl http://localhost:3000/orders?orderType=SELL
```

#### Get Single Order
```bash
curl http://localhost:3000/orders/{orderId}
```

#### Execute Order Manually
```bash
# Execute specific order
curl -X POST http://localhost:3000/orders/{orderId}/execute

# Execute all orders for a specific date
curl -X POST http://localhost:3000/orders/execute/2026-03-24
```

#### Get Execution Statistics
```bash
curl http://localhost:3000/orders/execution/stats

# Response
{
  "total": 100,
  "pending": 15,
  "scheduled": 8,
  "queued": 3,
  "executed": 70,
  "failed": 4
}
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
  -H "Content-Type: application/json" \
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

---