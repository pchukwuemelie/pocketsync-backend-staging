# PocketSync API — Frontend Integration Guide

**Version:** 1.0.0  
**Production base URL:** `https://pocketsync.onrender.com`  
**API prefix:** `/api/v1`  
**OpenAPI spec:** [`openapi.yaml`](./openapi.yaml) (import into Postman, Swagger UI, or Redoc)

---

## Quick start

```javascript
// axios example — configure once
import axios from 'axios';

export const api = axios.create({
  baseURL: 'https://pocketsync.onrender.com/api/v1',
  withCredentials: true, // REQUIRED — sends HttpOnly cookies
  headers: { 'Content-Type': 'application/json' },
});
```

```javascript
// fetch example
fetch('https://pocketsync.onrender.com/api/v1/auth/login', {
  method: 'POST',
  credentials: 'include', // REQUIRED
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
});
```

> **Render cold starts:** The free tier spins down after inactivity. The first request after idle may take 30–60 seconds. Show a loading state on initial app load.

---

## Authentication model

PocketSync does **not** use `Authorization: Bearer` headers.

| Cookie | Set by | Lifetime | Scope |
|--------|--------|----------|-------|
| `accessToken` | `POST /auth/login`, `POST /auth/refresh` | 15 minutes | All `/api/v1/*` routes |
| `refreshToken` | `POST /auth/login`, `POST /auth/refresh` | 7 days | `POST /auth/refresh` only |

Both cookies are **HttpOnly**, **Secure** (production), and **SameSite=Strict**.

### Recommended auth flow

**Sign up (Figma screens 1–2):**
```
1. POST /auth/register       → account created, OTP emailed (unverified)
2. POST /auth/verify-otp     → purpose: "signup", 6-digit code
3. POST /auth/login          → cookies set; user.emailVerified must be true
```

**Returning user:**
```
1. POST /auth/login          → cookies set automatically
2. All API calls             → cookies sent automatically (withCredentials)
3. On 401 "Session expired"  → POST /auth/refresh
4. If refresh fails          → redirect to login
5. POST /auth/logout         → clears cookies server-side
```

**Forgot password (Figma login → reset):**
```
1. POST /auth/forgot-password → always returns generic success message
2. POST /auth/reset-password  → email + code + newPassword (verifies OTP inline)
```

**BVN onboarding (Figma screens 2/3–Connect Accounts):**
```
1. GET  /onboarding/status        → check currentStep after login
2. POST /onboarding/bvn/submit      → bvn + phone (mock validation, sends SMS OTP)
3. POST /onboarding/bvn/verify-otp  → 6-digit phone code
4. GET  /onboarding/bvn/accounts    → discovered accounts from mock BVN lookup
5. POST /onboarding/bvn/connect     → link selected accountIds
```

BVN lookup and SMS are **mocked** — OTPs log to the server console; `devOtp` in development responses.

### CORS requirement

The backend only accepts requests from the origin configured in `ALLOWED_ORIGIN` (production must include your frontend URL). The frontend **must** send `credentials: 'include'` / `withCredentials: true`.

Coordinate with backend to add your deployed frontend origin (e.g. `https://pocketsync.vercel.app`) to Render env vars.

---

## Money & amounts

| Rule | Detail |
|------|--------|
| Currency | NGN (Nigerian Naira) everywhere in API |
| Request amounts | Send as numbers in Naira: `5000` = ₦5,000 |
| Minimum amount | ₦1.00 |
| Debit transactions | `amount` is **negative** (e.g. `-10000`) |
| Credit transactions | `amount` is **positive** (e.g. `5000`) |
| Transfer response `amount` | Always **positive** (the sum moved) |

---

## Error format

All errors return JSON:

```json
{ "error": "Human-readable message" }
```

In development only, some 500 responses include `"details"`.

### Common status codes

| Code | Meaning |
|------|---------|
| `400` | Validation failed (bad input) |
| `401` | Not logged in or session expired |
| `403` | Logged in but resource not owned by user |
| `404` | Resource not found |
| `409` | Conflict (duplicate email, account already linked) |
| `429` | Rate limited |
| `500` | Server error |

### Rate limits

| Endpoint group | Limit |
|----------------|-------|
| Auth (`register`, `login`) | 50 requests / 15 min per IP |
| OTP (`send-otp`, `verify-otp`, `forgot-password`, `reset-password`) | 10 requests / 15 min per IP |
| Onboarding (`/onboarding/*`) | 20 requests / 15 min per user |
| Onboarding OTP (`send-otp`, `verify-otp`) | 10 requests / 15 min per user |
| Account linking | 5 requests / 10 min per user |
| Transfers & bill payment | 10 requests / 10 min per user |

---

## Endpoints reference

### Health

#### `GET /health`

No auth. Use for uptime checks and cold-start probing.

**Response `200`:**
```json
{
  "status": "ok",
  "service": "PocketSync API",
  "db": "connected"
}
```

---

### Auth

#### `POST /api/v1/auth/register`

**Body:**
```json
{
  "email": "user@example.com",
  "fullName": "Chike Okafor",
  "password": "SecurePass123",
  "confirmPassword": "SecurePass123",
  "termsAccepted": true
}
```

| Field | Required | Rules |
|-------|----------|-------|
| `email` | Yes | Valid email |
| `fullName` | Yes | Max 100 characters |
| `password` | Yes | Min 8 characters |
| `confirmPassword` | No | If sent, must match `password` |
| `termsAccepted` | Yes | Must be `true` |
| `username` | No | Optional display name |

**Response `201`:**
```json
{
  "message": "Account created — verification code sent to your email",
  "userId": "665a1b2c3d4e5f6789012345",
  "emailVerified": false,
  "requiresVerification": true,
  "resendAvailableIn": 30,
  "devOtp": "482910"
}
```

`devOtp` is only returned when `NODE_ENV=development` and email is mocked (no `RESEND_API_KEY`).

---

#### `POST /api/v1/auth/send-otp`

Resend a 6-digit email code. 30-second cooldown per email + purpose.

**Body:**
```json
{
  "email": "user@example.com",
  "purpose": "signup"
}
```

| `purpose` | Use case |
|-----------|----------|
| `signup` | Verify email after registration |
| `reset` | Password reset flow |

**Response `200`:**
```json
{
  "message": "Verification code sent",
  "resendAvailableIn": 30,
  "devOtp": "482910"
}
```

**Response `429`** (cooldown):
```json
{
  "error": "Please wait before requesting a new code",
  "resendAvailableIn": 18
}
```

---

#### `POST /api/v1/auth/verify-otp`

**Body:**
```json
{
  "email": "user@example.com",
  "code": "482910",
  "purpose": "signup"
}
```

**Response `200`** (`purpose: signup`):
```json
{
  "message": "Email verified successfully",
  "emailVerified": true,
  "user": {
    "id": "665a1b2c3d4e5f6789012345",
    "email": "user@example.com",
    "fullName": "Chike Okafor",
    "bvnVerified": false
  }
}
```

**Response `200`** (`purpose: reset` — code only, no password change yet):
```json
{
  "message": "Verification code accepted",
  "verified": true
}
```

---

#### `POST /api/v1/auth/forgot-password`

Always returns the same message (prevents email enumeration).

**Body:**
```json
{ "email": "user@example.com" }
```

**Response `200`:**
```json
{
  "message": "If an account exists for this email, a verification code has been sent",
  "devOtp": "482910"
}
```

`devOtp` is only present in development when the email exists and email is mocked.

---

#### `POST /api/v1/auth/reset-password`

Verifies the reset OTP and sets a new password in one step.

**Body:**
```json
{
  "email": "user@example.com",
  "code": "482910",
  "newPassword": "NewSecurePass123"
}
```

**Response `200`:**
```json
{ "message": "Password reset successfully" }
```

---

#### `POST /api/v1/auth/login`

**Body:**
```json
{
  "email": "demo@pocketsync.ng",
  "password": "Demo@1234"
}
```

**Response `200`** (cookies set in `Set-Cookie` headers):
```json
{
  "message": "Login successful",
  "user": {
    "id": "665a1b2c3d4e5f6789012345",
    "email": "demo@pocketsync.ng",
    "fullName": "Demo User",
    "emailVerified": true,
    "bvnVerified": false
  }
}
```

**Response `403`** (email not verified — redirect to OTP screen):
```json
{
  "error": "Email not verified — please check your inbox for the 6-digit code",
  "requiresVerification": true,
  "email": "user@example.com"
}
```

---

#### `POST /api/v1/auth/logout`

Requires auth cookie.

**Response `200`:**
```json
{ "message": "Logged out successfully" }
```

---

#### `POST /api/v1/auth/refresh`

No body. Sends `refreshToken` cookie automatically.

**Response `200`:**
```json
{ "message": "Token refreshed" }
```

Call this when any protected route returns `401` with `"Session expired — please log in again"`.

---

### Onboarding (mock BVN — requires auth cookie)

All routes require a logged-in, email-verified user.

#### `GET /api/v1/onboarding/status`

**Response `200`:**
```json
{
  "emailVerified": true,
  "bvnVerified": false,
  "phoneVerified": false,
  "currentStep": "bvn_entry",
  "maskedPhone": "+234 *** *** 5678",
  "pendingAccounts": 0,
  "linkedAccounts": 0,
  "onboardingComplete": false
}
```

| `currentStep` | Frontend route |
|---------------|----------------|
| `bvn_entry` | Enter BVN + phone |
| `phone_otp` | Verify phone OTP |
| `connect_accounts` | Connect discovered accounts |
| `complete` | Dashboard |

---

#### `POST /api/v1/onboarding/bvn/submit`

Mock BVN validation — any valid 11-digit BVN works (not real NIBSS lookup).

**Body:**
```json
{
  "bvn": "22234567890",
  "phone": "08012345678"
}
```

**Response `200`:**
```json
{
  "message": "BVN accepted — verification code sent to your phone",
  "maskedPhone": "+234 *** *** 5678",
  "resendAvailableIn": 30,
  "devOtp": "482910"
}
```

---

#### `POST /api/v1/onboarding/bvn/send-otp`

Resend phone OTP (30s cooldown). No body required.

---

#### `POST /api/v1/onboarding/bvn/verify-otp`

**Body:**
```json
{ "code": "482910" }
```

**Response `200`:**
```json
{
  "message": "Phone verified — accounts discovered from your BVN",
  "bvnVerified": true,
  "phoneVerified": true,
  "discoveredAccounts": 4,
  "currentStep": "connect_accounts"
}
```

---

#### `GET /api/v1/onboarding/bvn/accounts`

**Response `200`:**
```json
{
  "accounts": [
    {
      "id": "665a1b2c3d4e5f6789012345",
      "institution": "GTBank",
      "maskedAccountNumber": "****4471",
      "accountType": "current",
      "balance": 245000,
      "currency": "NGN",
      "holderName": "Chike Okafor"
    }
  ]
}
```

---

#### `POST /api/v1/onboarding/bvn/connect`

**Body:**
```json
{
  "accountIds": ["665a1b2c3d4e5f6789012345", "665a1b2c3d4e5f6789012346"]
}
```

**Response `201`:**
```json
{
  "message": "2 account(s) connected successfully",
  "accounts": [
    {
      "id": "665a1b2c3d4e5f6789012347",
      "institution": "GTBank",
      "maskedAccountNumber": "****4471",
      "balance": 245000,
      "accountType": "current"
    }
  ],
  "onboardingComplete": true
}
```

---

### Institutions

#### `GET /api/v1/institutions`

Public. Lists banks available for **account linking** only.

**Response `200`:**
```json
{
  "institutions": [
    { "id": "1", "name": "GTBank" },
    { "id": "2", "name": "Access Bank" },
    { "id": "3", "name": "Kuda" },
    { "id": "4", "name": "Opay" },
    { "id": "5", "name": "Moniepoint" }
  ]
}
```

> Interbank transfers accept **any** bank name — this list is only for linking.

---

### Accounts

#### `POST /api/v1/accounts/link`

Mock OAuth account linking.

**Body:**
```json
{
  "institution": "GTBank",
  "mockAccountRef": "1234567890"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `institution` | Yes | Must be from institutions list |
| `mockAccountRef` | No | Last 4 digits used for `****1234` mask |

**Response `201`:**
```json
{
  "message": "GTBank account linked successfully",
  "account": {
    "id": "6a3e576b28a32290927300a5",
    "institution": "GTBank",
    "maskedAccountNumber": "****7890",
    "balance": 245000,
    "currency": "NGN",
    "accountType": "current",
    "linkedAt": "2026-06-26T12:00:00.000Z"
  }
}
```

---

#### `GET /api/v1/accounts`

**Response `200`:**
```json
{
  "accounts": [
    {
      "id": "6a3e576b28a32290927300a5",
      "institution": "GTBank",
      "maskedAccountNumber": "****4471",
      "balance": 240000,
      "currency": "NGN",
      "accountType": "current",
      "linkedAt": "2026-06-26T12:00:00.000Z"
    }
  ]
}
```

Store `id` values — required for transfers and bill payments.

---

#### `DELETE /api/v1/accounts/:accountId`

Soft-deletes the account (sets `isActive: false`).

**Response `200`:**
```json
{ "message": "GTBank account disconnected successfully" }
```

---

### Transactions

#### `GET /api/v1/transactions`

**Query parameters (all optional):**

| Param | Type | Example |
|-------|------|---------|
| `accountId` | string | Filter by linked account |
| `category` | enum | `Bills`, `Transfer`, `Food`, … |
| `type` | enum | `credit` or `debit` |
| `fromDate` | ISO date | `2026-01-01` |
| `toDate` | ISO date | `2026-06-26` |
| `page` | number | Default `1` |
| `limit` | number | Default `30`, max `30` |

**Response `200`:**
```json
{
  "total": 62,
  "page": 1,
  "pages": 3,
  "transactions": [
    {
      "id": "6a3ecebe69f748515d15b882",
      "date": "2026-06-26T19:10:54.166Z",
      "description": "Transfer to Access Bank",
      "amount": -5000,
      "type": "debit",
      "category": "Transfer",
      "institution": "GTBank",
      "accountId": "6a3e576b28a32290927300a5",
      "reference": "REF178250105416612YMC"
    }
  ]
}
```

---

#### `GET /api/v1/transactions/:transactionId`

**Response `200`:** Single transaction object (same shape as list items, without `accountId` in some cases).

---

#### `PATCH /api/v1/transactions/:transactionId/category`

**Body:**
```json
{ "category": "Food" }
```

Valid categories: `Food`, `Transport`, `Bills`, `Entertainment`, `Savings`, `Transfer`, `Other`

**Response `200`:**
```json
{ "message": "Category updated", "category": "Food" }
```

---

#### `POST /api/v1/transactions/transfer` — Internal transfer

Move money **between your own linked accounts**.

**Body:**
```json
{
  "fromAccountId": "6a3e576b28a32290927300a5",
  "toAccountId": "6a3e576b28a32290927300b6",
  "amount": 5000,
  "description": "Transfer to Access Bank savings"
}
```

| Field | Required | Rules |
|-------|----------|-------|
| `fromAccountId` | Yes | Your linked account |
| `toAccountId` | Yes | Different linked account |
| `amount` | Yes | NGN, min ₦1 |
| `description` | No | Auto-generated if omitted |

**Response `201`:**
```json
{
  "message": "Transfer successful",
  "transfer": {
    "reference": "REF178250105416612YMC",
    "amount": 5000,
    "fromAccount": { "id": "...", "institution": "GTBank", "balance": 240000, ... },
    "toAccount": { "id": "...", "institution": "Access Bank", "balance": 878000, ... },
    "debitTransaction": { "amount": -5000, "type": "debit", ... },
    "creditTransaction": { "amount": 5000, "type": "credit", ... }
  }
}
```

---

#### `POST /api/v1/transactions/interbank-transfer` — External transfer

Send money to **any external Nigerian bank account** (mock NIP).

**Body:**
```json
{
  "fromAccountId": "6a3e576b28a32290927300c8",
  "recipientBank": "UBA",
  "recipientAccountNumber": "0123456789",
  "recipientName": "khalifa bin zayed",
  "amount": 10000,
  "description": "Payment for services"
}
```

| Field | Required | Rules |
|-------|----------|-------|
| `fromAccountId` | Yes | Your linked source account |
| `recipientBank` | Yes | Any bank name, 2–100 chars (`UBA`, `Zenith Bank`, `First Bank`, …) |
| `recipientAccountNumber` | Yes | Exactly 10 digits |
| `recipientName` | No | Defaults to `"Recipient"` |
| `amount` | Yes | NGN, min ₦1 |
| `description` | No | Auto-generated if omitted |

**Response `201`:**
```json
{
  "message": "Interbank transfer successful",
  "transfer": {
    "reference": "REF1782501944129FIGAG",
    "nipReference": "NIP1782501944129",
    "amount": 10000,
    "status": "completed",
    "fromAccount": { "id": "...", "institution": "Kuda", "balance": 117500, ... },
    "recipient": {
      "bank": "UBA",
      "accountNumber": "****6789",
      "name": "khalifa bin zayed"
    },
    "transaction": { "amount": -10000, "type": "debit", "reference": "NIP1782501944129", ... }
  }
}
```

---

#### `POST /api/v1/transactions/pay-bill`

**Body:**
```json
{
  "fromAccountId": "6a3e576b28a32290927300a5",
  "amount": 21500,
  "billProvider": "DSTV",
  "customerReference": "1234567890",
  "description": "DSTV Premium renewal"
}
```

| Field | Required | Rules |
|-------|----------|-------|
| `fromAccountId` | Yes | Your linked account |
| `amount` | Yes | NGN, min ₦1 |
| `billProvider` | Yes | See list below |
| `customerReference` | No | Smartcard / meter / phone number |
| `description` | No | Auto-generated if omitted |

**Valid `billProvider` values:**  
`DSTV`, `GOTV`, `IKEDC`, `EKEDC`, `MTN`, `Airtel`, `Glo`, `9mobile`, `LAWMA`, `Water Board`

**Response `201`:**
```json
{
  "message": "Bill payment successful",
  "payment": {
    "reference": "REF1782503000000ABCDE",
    "amount": 21500,
    "billProvider": "DSTV",
    "account": { "id": "...", "balance": 218500, ... },
    "transaction": { "amount": -21500, "type": "debit", "category": "Bills", ... }
  }
}
```

---

### Dashboard

#### `GET /api/v1/dashboard/summary`

Aggregated view — last 30 days of activity.

**Response `200`:**
```json
{
  "totalBalance": 4697500,
  "currency": "NGN",
  "monthlyIncome": 250000,
  "monthlyExpense": 185000,
  "netCashFlow": 65000,
  "accounts": [ ... ],
  "recentTransactions": [ ... ],
  "expenseBreakdown": [
    { "category": "Bills", "amount": 45000 },
    { "category": "Transfer", "amount": 100000 }
  ]
}
```

---

#### `GET /api/v1/dashboard/balance-trend`

6-month net cash flow for charts.

**Response `200`:**
```json
{
  "labels": ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
  "data": [120000, -45000, 80000, 30000, -10000, 65000]
}
```

---

## Transfer types — decision guide

Use this to pick the right endpoint in the UI:

```
┌─────────────────────────────────────────────────────────────┐
│  Where is the money going?                                  │
├─────────────────────────────────────────────────────────────┤
│  Another of MY linked accounts  →  POST /transactions/transfer
│  Someone else's bank account    →  POST /transactions/interbank-transfer
│  A utility / subscription bill  →  POST /transactions/pay-bill
└─────────────────────────────────────────────────────────────┘
```

| Endpoint | Debits | Credits | Recipient |
|----------|--------|---------|-----------|
| `/transfer` | Source account | Destination account | Your linked account |
| `/interbank-transfer` | Source account | None | External bank (any name) |
| `/pay-bill` | Source account | None | Bill provider |

---

## Suggested page → API mapping

| Frontend page | API calls |
|---------------|-----------|
| Sign up + email OTP | `POST /auth/register`, `POST /auth/verify-otp` |
| Login / forgot password | `POST /auth/login`, `POST /auth/forgot-password`, `POST /auth/reset-password` |
| BVN onboarding (mock) | `GET /onboarding/status`, `POST /onboarding/bvn/submit`, `POST /onboarding/bvn/verify-otp`, `GET /onboarding/bvn/accounts`, `POST /onboarding/bvn/connect` |
| Manual account link (optional) | `GET /institutions`, `POST /accounts/link` |
| Dashboard home | `GET /dashboard/summary`, `GET /dashboard/balance-trend` |
| Accounts list | `GET /accounts`, `DELETE /accounts/:id` |
| Transactions list | `GET /transactions` (with filters) |
| Transaction detail | `GET /transactions/:id`, `PATCH /transactions/:id/category` |
| Transfer (own accounts) | `GET /accounts`, `POST /transactions/transfer` |
| Send money (external) | `GET /accounts`, `POST /transactions/interbank-transfer` |
| Pay bills | `GET /accounts`, `POST /transactions/pay-bill` |

---

## TypeScript types (copy-paste)

```typescript
export type TransactionCategory =
  | 'Food' | 'Transport' | 'Bills' | 'Entertainment'
  | 'Savings' | 'Transfer' | 'Other';

export type TransactionType = 'credit' | 'debit';

export type LinkableInstitution =
  | 'GTBank' | 'Access Bank' | 'Kuda' | 'Opay' | 'Moniepoint';

export type BillProvider =
  | 'DSTV' | 'GOTV' | 'IKEDC' | 'EKEDC' | 'MTN' | 'Airtel'
  | 'Glo' | '9mobile' | 'LAWMA' | 'Water Board';

export interface LinkedAccount {
  id: string;
  institution: LinkableInstitution;
  maskedAccountNumber: string;
  balance: number;
  currency: 'NGN';
  accountType: 'current' | 'savings' | 'wallet' | 'business';
  linkedAt: string;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  category: TransactionCategory;
  institution: string;
  accountId?: string;
  reference: string;
}

export interface ApiError {
  error: string;
  details?: string;
}
```

---

## Testing against production

1. Import [`openapi.yaml`](./openapi.yaml) into Postman (**Import → File**)
2. Set collection variable `baseUrl` = `https://pocketsync.onrender.com`
3. Enable **cookie capture** in Postman settings
4. Run **Login** first, then all other requests

**Demo account** (if seeded on production DB):
- Email: `demo@pocketsync.ng`
- Password: `Demo@1234`

---

## Mock vs real (set expectations)

| Feature | Current behaviour |
|---------|-------------------|
| Account linking | Mock OAuth — preset balances |
| Internal transfer | Real balance updates in DB |
| Interbank transfer | Mock NIP — debit only, fake `nipReference` |
| Bill payment | Mock — debit only |
| Live bank sync | Not implemented — transactions created by user actions + seed |

---

## Support

- **OpenAPI spec:** `docs/openapi.yaml`
- **Health check:** `GET https://pocketsync.onrender.com/health`
- **Backend repo:** `pocketsync-backend/`