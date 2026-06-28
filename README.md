# PocketSync

**PocketSync** is a consolidated personal finance manager for the Nigerian market. It lets users link accounts across multiple banks and fintech platforms, view balances and transactions in one place, transfer money, and pay bills — all through a single REST API.

This repository currently contains the **backend API** (`pocketsync-backend/`). A frontend client is planned (CORS is configured for `http://localhost:3000`).

---

## Table of Contents

- [Features](#features)
- [Supported Institutions](#supported-institutions)
- [Transfer Types](#transfer-types)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Testing with Postman](#testing-with-postman)
- [Security](#security)
- [Mock vs Production](#mock-vs-production)
- [Roadmap](#roadmap)

---

## Features

| Feature | Status |
|---------|--------|
| User registration & login | ✅ Implemented |
| JWT auth via HttpOnly cookies | ✅ Implemented |
| Link / disconnect bank accounts | ✅ Mock OAuth |
| View linked accounts & balances | ✅ Implemented |
| Transaction history with filters | ✅ Implemented |
| Recategorize transactions | ✅ Implemented |
| Dashboard summary & balance trend | ✅ Implemented |
| **Internal transfer** (between your linked accounts) | ✅ Implemented |
| **Interbank transfer** (to external accounts) | ✅ Mock NIP |
| **Bill payment** | ✅ Mock |
| Real bank API integration (OAuth, NIP, billers) | ❌ Not implemented |
| Frontend application | ❌ Not implemented |

---

## Supported Institutions

Accounts can be linked from these Nigerian institutions:

- GTBank
- Access Bank
- Kuda
- Opay
- Moniepoint

Bill payments support: DSTV, GOTV, IKEDC, EKEDC, MTN, Airtel, Glo, 9mobile, LAWMA, Water Board.

---

## Transfer Types

PocketSync supports **three distinct money-movement flows**. Understanding the difference is important:

### 1. Internal transfer (`POST /transactions/transfer`)

Moves money **between two of your own linked accounts** inside PocketSync.

- Debits the source account and credits the destination account
- Creates a paired debit + credit transaction (both category: `Transfer`)
- Both accounts must belong to you and be active
- Instant — no external network involved

**Example:** Move ₦5,000 from your GTBank account to your Kuda wallet.

### 2. Interbank transfer (`POST /transactions/interbank-transfer`)

Sends money **to an external bank account** that is **not** one of your linked PocketSync accounts. This simulates Nigeria's **NIP** (Nigeria Inter-Bank Settlement System) instant payment rail.

- Debits only your source linked account (money leaves PocketSync)
- Creates a single debit transaction (category: `Transfer`)
- Returns a mock `nipReference` (e.g. `NIP1719412345678`)
- Recipient account number is masked in responses (`****1234`)
- Requires a valid 10-digit Nigerian account number and any recipient bank name (e.g. Zenith Bank, First Bank, UBA — not limited to PocketSync linkable institutions)
- **Mock only** — no real NIP settlement occurs

**Example:** Send ₦10,000 from your GTBank account to someone else's Zenith Bank account `0123456789`.

> **Note:** Before this endpoint was added, PocketSync only supported internal transfers between linked accounts. Interbank transfers to third-party accounts were not possible.

### 3. Bill payment (`POST /transactions/pay-bill`)

Pays a utility or subscription bill from a linked account.

- Debits the source account only
- Creates a debit transaction (category: `Bills`)
- Validates `billProvider` against a server-side whitelist
- **Mock only** — no real biller API is called

**Example:** Pay ₦21,500 for DSTV from your GTBank account.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js |
| Framework | Express 4 |
| Language | TypeScript (strict) |
| Database | MongoDB (Mongoose 8) |
| Auth | JWT in HttpOnly cookies |
| Security | Helmet, CORS, bcrypt, rate limiting, sanitize-html |

---

## Project Structure

```
pocketSync/
├── README.md                          # This file
└── pocketsync-backend/
    ├── src/
    │   ├── app.ts                     # Express entry point
    │   ├── config/
    │   │   └── db.ts                  # MongoDB connection
    │   ├── constants/
    │   │   ├── institutions.ts        # Supported banks whitelist
    │   │   └── transactions.ts        # Categories & bill providers
    │   ├── controllers/
    │   │   ├── authController.ts
    │   │   ├── accountController.ts
    │   │   ├── transactionController.ts
    │   │   └── dashboardController.ts
    │   ├── middleware/
    │   │   ├── requireAuth.ts
    │   │   ├── requireOwnership.ts
    │   │   ├── noCache.ts
    │   │   └── errorHandler.ts
    │   ├── models/
    │   │   ├── User.ts
    │   │   ├── LinkedAccount.ts
    │   │   └── Transaction.ts
    │   ├── routes/
    │   │   ├── authRoutes.ts
    │   │   ├── accountRoutes.ts
    │   │   └── dataRoutes.ts
    │   ├── seed/
    │   │   └── seedData.ts            # Demo data seeder
    │   └── utils/
    │       └── transactionUtils.ts
    ├── package.json
    ├── tsconfig.json
    └── .env.example
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Yarn
- MongoDB (local or [MongoDB Atlas](https://www.mongodb.com/atlas))

### Installation

```bash
cd pocketsync-backend
yarn install
```

### Configure environment

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

See [Environment Variables](#environment-variables) below.

### Seed demo data (optional)

Populates the database with a demo user, 5 linked accounts, and ~60 transactions:

```bash
yarn seed
```

**Demo credentials:** `demo@pocketsync.ng` / `Demo@1234`

### Run the server

```bash
# Development (hot reload)
yarn dev

# Production build
yarn build
yarn start
```

The API starts at **http://localhost:5000** by default.

Health check: `GET http://localhost:5000/health`

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `5000` |
| `MONGO_URI` | MongoDB connection string | `mongodb+srv://user:pass@cluster.mongodb.net/pocketsync` |
| `JWT_ACCESS_SECRET` | Access token signing secret (min 32 chars) | `your_access_secret_here_min_32_chars` |
| `JWT_REFRESH_SECRET` | Refresh token signing secret (min 32 chars) | `your_refresh_secret_here_min_32_chars` |
| `JWT_ACCESS_EXPIRES_IN` | Access token lifetime | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token lifetime | `7d` |
| `ALLOWED_ORIGIN` | CORS origin for frontend | `http://localhost:3000` |
| `NODE_ENV` | Environment | `development` |

> Never commit `.env` to version control. Use `.env.example` with placeholder values only.

---

## API Reference

Base URL: `http://localhost:5000/api/v1`

Authentication uses **HttpOnly cookies** set on login. Send cookies with every protected request. In Postman, run Login first — cookies are stored automatically.

### Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/register` | No | Create account |
| `POST` | `/auth/login` | No | Login (sets cookies) |
| `POST` | `/auth/logout` | Yes | Logout (clears cookies) |
| `POST` | `/auth/refresh` | Cookie | Rotate tokens |

**Register body:**
```json
{
  "email": "user@example.com",
  "username": "chike",
  "password": "SecurePass123"
}
```

**Login body:**
```json
{
  "email": "demo@pocketsync.ng",
  "password": "Demo@1234"
}
```

---

### Accounts

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/institutions` | No | List supported banks |
| `POST` | `/accounts/link` | Yes | Link a mock bank account |
| `GET` | `/accounts` | Yes | List your linked accounts |
| `DELETE` | `/accounts/:accountId` | Yes | Disconnect an account |

**Link account body:**
```json
{
  "institution": "GTBank",
  "mockAccountRef": "1234567890"
}
```

---

### Transactions

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/transactions` | Yes | List transactions (filterable) |
| `GET` | `/transactions/:id` | Yes | Get single transaction |
| `PATCH` | `/transactions/:id/category` | Yes | Recategorize |
| `POST` | `/transactions/transfer` | Yes | Internal transfer (own accounts) |
| `POST` | `/transactions/interbank-transfer` | Yes | Interbank transfer (external account) |
| `POST` | `/transactions/pay-bill` | Yes | Pay a bill |

**List query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `accountId` | string | Filter by linked account |
| `category` | string | `Food`, `Transport`, `Bills`, etc. |
| `type` | string | `credit` or `debit` |
| `fromDate` | ISO date | Start date |
| `toDate` | ISO date | End date |
| `page` | number | Page number (default: 1) |
| `limit` | number | Per page (max: 30) |

**Internal transfer body:**
```json
{
  "fromAccountId": "SOURCE_ACCOUNT_ID",
  "toAccountId": "DESTINATION_ACCOUNT_ID",
  "amount": 5000,
  "description": "Transfer to Kuda savings"
}
```

**Interbank transfer body:**
```json
{
  "fromAccountId": "SOURCE_ACCOUNT_ID",
  "recipientBank": "Zenith Bank",
  "recipientAccountNumber": "0123456789",
  "recipientName": "Ada Okafor",
  "amount": 10000,
  "description": "Rent payment"
}
```

**Bill payment body:**
```json
{
  "fromAccountId": "SOURCE_ACCOUNT_ID",
  "amount": 21500,
  "billProvider": "DSTV",
  "customerReference": "1234567890",
  "description": "DSTV Premium renewal"
}
```

> All `amount` values are in **NGN** (Naira). Minimum: ₦1.00.

---

### Dashboard

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/dashboard/summary` | Yes | Total balance, income/expense, breakdown |
| `GET` | `/dashboard/balance-trend` | Yes | 6-month net cash flow chart data |

---

## Testing with Postman

1. Create an environment variable `baseUrl` = `http://localhost:5000`
2. **Login** — `POST {{baseUrl}}/api/v1/auth/login` with demo credentials
3. **Get accounts** — `GET {{baseUrl}}/api/v1/accounts` → copy account IDs
4. **Internal transfer** — `POST {{baseUrl}}/api/v1/transactions/transfer`
5. **Interbank transfer** — `POST {{baseUrl}}/api/v1/transactions/interbank-transfer`
6. **Pay bill** — `POST {{baseUrl}}/api/v1/transactions/pay-bill`
7. **Verify** — `GET {{baseUrl}}/api/v1/transactions` and `GET {{baseUrl}}/api/v1/dashboard/summary`

All money-movement endpoints require `Content-Type: application/json` and an active login session (cookies).

---

## Security

- **HttpOnly cookies** for JWT tokens — not accessible via JavaScript
- **Refresh token rotation** with server-side hash storage
- **Rate limiting** on auth (5/15 min), account linking (5/10 min), and payments (10/10 min)
- **IDOR prevention** — all queries scoped to authenticated user
- **Input sanitization** on transaction descriptions (XSS prevention)
- **No-cache headers** on financial data endpoints
- **Masked account numbers** — full account numbers are never stored or returned
- **Server-side whitelists** for institutions and bill providers

---

## Mock vs Production

This project is a **functional MVP with simulated banking**. The following are mocked:

| Capability | Mock behavior |
|------------|---------------|
| Account linking | Generates fake OAuth token and preset balance |
| Internal transfer | Updates balances in MongoDB atomically |
| Interbank transfer | Simulates NIP — debits source, returns mock `nipReference` |
| Bill payment | Simulates biller payment — debits source only |
| Transaction import | Seeded via `yarn seed`; no live bank sync |

A production deployment would require:

- Real OAuth flows per institution (GTBank, Kuda, etc.)
- NIP integration via a payment switch (e.g. NIBSS)
- Biller aggregator APIs (Paystack Bills, Flutterwave Bills, etc.)
- Webhook handlers for async settlement confirmations
- KYC/AML compliance layer

---

## Roadmap

- [ ] Frontend client (React / Next.js)
- [ ] Real bank OAuth integration
- [ ] Live NIP interbank settlement
- [ ] Real biller API integration
- [ ] Scheduled / recurring payments
- [ ] Transaction export (CSV/PDF)
- [ ] Push notifications for credits and debits
- [ ] Multi-currency support

---

## Scripts

| Command | Description |
|---------|-------------|
| `yarn dev` | Start dev server with hot reload |
| `yarn build` | Compile TypeScript to `dist/` |
| `yarn start` | Run compiled production build |
| `yarn seed` | Seed database with demo data |

---

## License

This project is for educational and portfolio purposes.#   p o c k e t s y n c - b a c k e n d - s t a g i n g  
 