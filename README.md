# Robo Advisor API

A NestJS REST API that allows users to sign up, invest in a model portfolio of stocks, and track their holdings.

---

## Setup

### 1. Install dependencies

```bash
yarn install
```

### 2. Configure environment

Create a `.env` file in the project root:

```env
INITIAL_BALANCE=10000
FIXED_PRICE=100
SHARE_DECIMALS=3
JWT_SECRET=your-secret-key
```

| Variable | Description |
|---|---|
| `INITIAL_BALANCE` | Starting wallet balance for every new user (USD) |
| `FIXED_PRICE` | Default share price if no `marketPrice` is provided |
| `SHARE_DECIMALS` | Decimal precision for share quantities |
| `JWT_SECRET` | Secret key used to sign JWT tokens |

### 3. Start the server

```bash
# Development (watch mode)
yarn start:dev

# Production
yarn start:prod
```

Server runs at `http://localhost:3000`

---

## Running Tests

```bash
# Run all tests once
yarn test

# Run with coverage report
yarn test:cov

# Run a specific file only
yarn test orders.service
```

---

## Swagger UI

API documentation is available at:

```
http://localhost:3000/api
```

Click **Authorize** and paste your JWT token (from signup or login) to access protected endpoints.

---

## API Endpoints

### Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/signup` | No | Register a new user, returns JWT token |
| POST | `/auth/login` | No | Login with email and password, returns JWT token |
| GET | `/auth/me` | Yes | Get current user profile and wallet balance |

### Orders

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/orders` | Yes | Place a BUY or SELL order across a portfolio |
| GET | `/orders` | Yes | List all orders for the authenticated user |
| GET | `/orders/holdings` | Yes | Get current holdings summary per stock |
| GET | `/orders/:id` | Yes | Get a single order by ID |

### Stocks

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/stocks` | No | List all available stocks |

---