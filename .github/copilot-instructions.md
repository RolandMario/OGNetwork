# Copilot instructions for OGNetwork

## Quick commands (what to run)

### Backend (Express + Mongoose)
```bash
npm install              # root directory
npm start                # runs: nodemon vtu-backend/server.js
# Or run directly (no auto-reload): NODE_ENV=development node vtu-backend/server.js
```

### Frontend - Mobile App (Expo React Native)
```bash
cd vtu-frontend/vtu_mobile
npm install
npm run start            # expo start (select platform interactively)
npm run ios|android|web  # run on specific platform
```

### Admin Dashboard (Next.js 16 + TypeScript)
```bash
cd admin-dashboard
npm install
npm run dev              # localhost:3000/login
npm run build            # production build
npm run lint             # ESLint check
```

### Tests / Lint
- **Backend**: No test or lint scripts configured. Do not assume test framework exists.
- **Admin Dashboard**: `npm run lint` runs ESLint (in admin-dashboard/)
- **Mobile**: No test or lint scripts configured

## High-level architecture

### Three-Tier Application Structure

**OGNetwork** is a monorepo with three independent applications:

| App | Technology | Purpose | Location |
|-----|-----------|---------|----------|
| **Backend** | Express + Mongoose | REST API server, webhooks, admin endpoints | `vtu-backend/` |
| **Mobile Frontend** | Expo + React Native + Redux | Customer mobile app (data/airtime/cable/electricity purchases) | `vtu-frontend/vtu_mobile/` |
| **Admin Dashboard** | Next.js 16 + TypeScript + Tailwind | Admin panel (users, transactions, plans, wallets, settings) | `admin-dashboard/` |

### Backend Runtime Flow (server.js)
1. **Environment Loading**: `dotenv` loads from `vtu-backend/.env`
2. **Tenant Secrets**: `loadTenantSecrets()` reads tenant credentials/secrets
3. **Database Connections**: `connectAllTenantDbs()` establishes per-tenant MongoDB connections
4. **Express Startup**: After DBs are ready, HTTP server listens on port 5001

**Important**: All three DB connections must complete before Express starts (awaited in server.js).

### Backend Middleware Stack (critical order)
```
1. Helmet (security headers)
2. Rate Limiting (100 req/15min globally, 10 req/15min for auth)
3. CORS (origin: '*' in dev; use ALLOWED_ORIGINS env var in production)
4. Body Parsers:
   a. Raw parser for /api/v1/webhooks (MUST come before JSON parser for signature verification)
   b. JSON parser
   c. URL-encoded parser
5. tenantMiddleware (applied at /api/v1 BEFORE route mounting) — sets req.models with per-tenant DB connections
6. Route handlers
7. Error handler (mounted last)
```

**Critical**: `tenantMiddleware` MUST run before any route handler to populate `req.models` (per-tenant Mongoose models).

### File Organization (Backend)
- **routes/**: Express routers (e.g., authRoutes.js, userRoutes.js, vtuRoutes.js, walletRoutes.js, adminRoutes.js, webhookRoutes.js)
- **controllers/**: Request handlers (e.g., authController.js, userController.js, webhookController.js, adminController.js)
- **services/**: Business logic and external integrations (e.g., paymentService.js, vtuService.js, notificationService.js, tenantConfigService.js, tenantDbService.js)
- **models/**: Mongoose schemas (User, Wallet, Transaction, MasterTenant, etc.)
- **middleware/**: Custom middleware (tenantMiddleware.js, errorHandler.js, etc.)
- **config/**: Configuration files (database.js, etc.)
- **utils/**: Helper utilities

### Key Integrations & Services

| Service | Purpose | Files |
|---------|---------|-------|
| **Payment Provider** (Paystack) | Handle billing transactions and webhooks | `src/services/paymentService.js`, `src/controllers/webhookController.js` |
| **VTU Provider(s)** | Buy data, airtime, cable, electricity | `src/services/vtuService.js`, `src/controllers/vtuController.js` |
| **Notifications** | Push notifications to mobile app (via Expo API) | `src/services/notificationService.js`, `src/controllers/notificationController.js` |
| **Multi-Tenant** | Manage multiple tenant databases and secrets | `src/services/tenantConfigService.js`, `src/services/tenantDbService.js`, `src/middleware/tenantMiddleware.js` |

### Multi-Tenant Pattern (Important!)
- **MasterTenant** model: Stores tenant configurations and database connection info
- **Per-Tenant Databases**: Each tenant has its own MongoDB instance/database
- **Tenant Resolution**: `tenantMiddleware` extracts `x-tenant-id` header and loads the correct database connection into `req.models`
- **Secret Management**: `tenantConfigService` loads tenant-specific API keys and secrets (payment provider, VTU provider, etc.)

### Mobile App (React Native + Redux)
- **Navigation**: React Navigation (bottom tabs + native stack)
- **State Management**: Redux Toolkit (slices for wallet, transactions, auth)
- **API Communication**: Axios with base URL in `src/constants/apiRoutes.js` — update when backend URL changes
- **Storage**: AsyncStorage for local persistence (auth tokens, cache)
- **Screens**:
  - HomeScreen: Shows wallet balance (fetched from backend)
  - BuyDataScreen, BuyCableScreen, BuyAirtimeScreen, BuyElectricityScreen: Purchase screens with balance validation
  - TransactionHistoryScreen: View past transactions
  - ProfileScreen: User settings

**Important**: Wallet balance is stored in Redux as **Naira** (not Kobo). All balance comparisons on screens must use Naira units.

### Admin Dashboard (Next.js + TypeScript)
- **Login**: `/login` (JWT-based via backend `/api/v1/auth/login`)
- **Protected Routes**: Require `admin` role in JWT token
- **Pages**:
  - `/dashboard`: Overview with stats cards and recent transactions table
  - `/users`: User management (search, filter by status, activate/deactivate)
  - `/transactions`: Transaction history (filter by status: ALL/SUCCESS/PENDING/FAILED, search)
  - `/plans`: Service plans grid (filter by service, inline edit modal, sync from provider)
  - `/wallets`: Wallet management (search, balance summary)
  - `/settings`: API configuration and tenant info

### Security Features
- **Rate Limiting**: Global 100 req/15min, auth endpoints 10 req/15min
- **NoSQL Injection Prevention**: `express-mongo-sanitize` middleware
- **XSS Protection**: `xss-clean` middleware for user inputs
- **Helmet**: Security headers (CSP, HSTS, X-Frame-Options, etc.)
- **HPP** (HTTP Parameter Pollution): Prevents parameter override attacks
- **Data Sanitization**: User inputs sanitized against XSS and injection
- **JWT Secrets**: Must be provided via `JWT_SECRET` env var (no hardcoded fallback)
- **CORS**: Restricted in production (via `ALLOWED_ORIGINS` env var)

## Key conventions and repo-specific patterns

### Code Organization (Backend)
- **Layering**: Routes → Controllers → Services → Models (always follow this pattern)
- **File Naming**: PascalCase for models and classes, camelCase for functions/variables
  - Example: `userRoutes.js` → `userController.js` → `userService.js` → `User.js` (model)
- **Error Handling**: Services throw descriptive errors; controllers catch and format responses
- **Database Access**: Only services and models access the database; controllers call services

### Tenant Handling (Multi-Tenant Critical!)
- **Header Requirement**: Every API request must include `x-tenant-id` header
- **Middleware Execution**: `tenantMiddleware` must be mounted before routes that need multi-tenant support (all API routes at `/api/v1`)
- **Accessing Tenant Models**: Use `req.models.User`, `req.models.Wallet`, etc. (populated by tenantMiddleware)
- **Tenant Secrets**: Load once at startup via `tenantConfigService`; use `process.env.TENANT_KEY` or inject from service

### Webhook Handling (Paystack & Others)
- **Raw Body Parser**: Webhook routes MUST use raw body parser to preserve request signature
- **Mounting Order**: Webhook routes mounted BEFORE JSON body parser:
  ```javascript
  app.use('/api/v1/webhooks', bodyParser.raw({ type: 'application/json' }), webhookRoutes);
  // then later:
  app.use(express.json());  // This MUST come after webhook routes
  ```
- **Signature Verification**: Always verify webhook signatures in controller before processing
- **Idempotency**: Treat webhooks as idempotent; check if transaction already exists before processing

### Environment & Configuration
- **Backend .env Location**: `vtu-backend/.env` (loaded explicitly in server.js)
- **Admin Dashboard .env**: `admin-dashboard/.env.local` (Next.js convention)
- **Mobile App .env**: No .env file; API base URL hardcoded in `src/constants/apiRoutes.js`
- **Secrets**: Never commit `.env` files or secrets; document env var requirements in README

### Database & Models
- **Mongoose Schemas**: Define in `src/models/`; register in Model/schema files
- **Connection**: `tenantDbService` manages per-tenant connections; each connection is isolated
- **Transaction Models**: Include fields: `userId`, `type`, `amount`, `status` (pending/success/failed), `provider`, `providerTransactionId`, `createdAt`
- **Wallet Models**: Include fields: `userId`, `balanceNaira`, `totalFunded`, `lastFundedAt`

### Testing & Debugging
- **No Built-in Test Suite**: Write integration tests manually if needed (no Jest/Mocha configured)
- **Manual Testing**: Use `QUICK_START_TESTING.md` for curl examples and testing flow
- **Backend Logs**: Check server output for tenant loading and DB connection issues
- **Admin Dashboard Debugging**: Open browser DevTools; check for CORS, auth token, and 401 responses

### Common Patterns

#### Adding a New API Endpoint
1. Create route file: `src/routes/featureRoutes.js`
2. Create controller: `src/controllers/featureController.js`
3. Create service: `src/services/featureService.js`
4. Create model (if needed): `src/models/Feature.js`
5. Import and mount in `server.js`:
   ```javascript
   const featureRoutes = require('./src/routes/featureRoutes');
   app.use('/api/v1/features', tenantMiddleware, featureRoutes);
   ```

#### Accessing Tenant-Specific Data
```javascript
// In controller or service:
const user = await req.models.User.findById(userId);  // Uses tenant's DB via tenantMiddleware
```

#### Sending Push Notifications
```javascript
const { sendPushNotification } = require('./src/services/notificationService');
await sendPushNotification(userId, {
  title: 'Transaction Successful',
  body: 'Your ₦500 data purchase is complete.'
});
```

#### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| "Cannot read property 'User' of undefined" | tenantMiddleware not applied before route | Ensure tenantMiddleware is mounted at `/api/v1` |
| Webhook signature verification fails | Raw body parser not used; body already parsed as JSON | Mount webhook routes with raw parser BEFORE JSON parser |
| "Insufficient balance" error with sufficient balance | Unit mismatch (Naira vs Kobo) | Redux stores balance in Naira; screen logic must compare Naira to Naira |
| Admin dashboard blank page | Backend not running or CORS blocked | Start backend on port 5001; check browser console for CORS errors |
| "x-tenant-id header missing" error | Tenant ID not sent in request headers | Add `-H "x-tenant-id: demo"` to curl commands or check mobile app API client |

## Files to inspect when debugging common tasks

### Backend (Express + Mongoose)
| Task | Files to Check |
|------|-----------------|
| Tenant resolution failing | `vtu-backend/src/middleware/tenantMiddleware.js`, `vtu-backend/src/services/tenantDbService.js` |
| Secrets not loading | `vtu-backend/src/services/tenantConfigService.js`, `vtu-backend/.env` |
| Webhook not processing | `vtu-backend/src/routes/webhookRoutes.js`, `vtu-backend/src/controllers/webhookController.js` (check raw body parser) |
| Payment integration issue | `vtu-backend/src/services/paymentService.js`, `vtu-backend/src/services/tenantConfigService.js` (Paystack key loading) |
| VTU service not responding | `vtu-backend/src/services/vtuService.js`, `vtu-backend/src/providers/` (provider implementations) |
| Push notification not sent | `vtu-backend/src/services/notificationService.js`, `vtu-backend/src/controllers/notificationController.js` |
| Auth token issues | `vtu-backend/src/routes/authRoutes.js`, `vtu-backend/src/controllers/authController.js` (JWT secret, token generation) |
| Admin endpoints 403 Forbidden | `vtu-backend/src/middleware/` (check role validation), `vtu-backend/src/controllers/adminController.js` |

### Mobile App (React Native + Expo)
| Task | Files to Check |
|------|-----------------|
| API calls failing | `vtu-frontend/vtu_mobile/src/constants/apiRoutes.js` (base URL), Redux auth slice (token) |
| Wallet balance not updating | `vtu-frontend/vtu_mobile/src/slices/walletSlice.js`, HomeScreen.jsx (dispatch after balance fetch) |
| "Insufficient balance" error incorrectly showing | `vtu-frontend/vtu_mobile/src/screens/BuyDataScreen.jsx`, BuyCableScreen.jsx, etc. (balance comparison logic — must be Naira vs Naira) |
| Push notification not received | `vtu-frontend/vtu_mobile/src/services/notificationService.js`, HomeScreen.jsx (device token registration) |
| Redux state not persisting | `vtu-frontend/vtu_mobile/src/store/` (Redux configuration, AsyncStorage middleware) |

### Admin Dashboard (Next.js)
| Task | Files to Check |
|------|-----------------|
| Login not working | `admin-dashboard/app/login/page.tsx` (login form logic), check backend on port 5001 |
| Pages show blank or 401 | `admin-dashboard/app/page.tsx` (auth guard), check token in localStorage, verify user has `admin` role |
| API calls fail with CORS | Backend server.js CORS config, check `ALLOWED_ORIGINS` env var in production |
| Table data not loading | Check API endpoint in relevant page file (e.g., `admin-dashboard/app/users/page.tsx`), verify backend response format |
| Build fails with TypeScript errors | Run `npm run lint` to check ESLint, verify type definitions match backend API response |

### .env Configuration
- **Backend** (`vtu-backend/.env`):
  - `PORT=5001`
  - `NODE_ENV=development`
  - `MONGODB_URI=...` (connection to master tenant DB)
  - `JWT_SECRET=...` (JWT signing key)
  - `PAYSTACK_SECRET_KEY=...` (from Paystack dashboard)
  - `ALLOWED_ORIGINS=...` (comma-separated list for production CORS)
- **Admin Dashboard** (`admin-dashboard/.env.local`):
  - Backend URL (if different from default `http://localhost:5001`)
  - API configuration for admin requests

---

## Quick Testing Checklist

| Item | Command / How to Test |
|------|----------------------|
| Backend starts | `npm start` from root; should output "🚀 OGNetwork backend running on port 5001" |
| Mobile app runs | `cd vtu-frontend/vtu_mobile && npm start`, select platform |
| Admin dashboard starts | `cd admin-dashboard && npm run dev`, open http://localhost:3000/login |
| Login works | Use curl from QUICK_START_TESTING.md or login form on dashboard |
| Wallet balance displays | HomeScreen should show balance; check Redux state in DevTools |
| Purchase works | Attempt data purchase; check transaction in backend logs and DB |
| Push notifications | Register device token via `/api/v1/user/notifications/register`, send test via endpoint |
| Admin dashboard auth | Create user with `role: "admin"` in MongoDB, login and verify redirect to dashboard works |

---

## Database Schemas

All MongoDB collections are per-tenant (separate database per tenant).

### User Collection
```javascript
{
  _id: ObjectId,
  fullName: String,
  email: String (unique),
  phone: String (unique),
  password: String (hashed with bcrypt),
  role: 'user' | 'admin' | 'superadmin',
  isActive: Boolean,
  level: 'normal' | 'affiliate' | 'top_user' | 'api_user',
  transactionPin: String | null,
  isPinSet: Boolean,
  
  // Paystack Dedicated Virtual Account (DVA)
  paystackCustomerCode: String | null,
  dedicatedAccount: {
    accountNumber: String,
    accountName: String,
    bankName: String,
    bankId: Number,
    bankSlug: String,
    active: Boolean,
    paystackAccountId: Number,
  },
  
  createdAt: Date,
  updatedAt: Date,
}
```

### Wallet Collection
```javascript
{
  _id: ObjectId,
  user: ObjectId (ref to User),
  balance: Number,           // In Naira (not Kobo!)
  commissionBalance: Number, // Earned commissions (in Naira)
  currency: 'NGN',
  createdAt: Date,
  updatedAt: Date,
}
```

### Transaction Collection
```javascript
{
  _id: ObjectId,
  user: ObjectId (ref to User),
  type: 'FUNDING' | 'AIRTIME' | 'DATA' | 'CABLE' | 'ELECTRICITY' | 'ADMIN_CREDIT' | 'ADMIN_DEBIT' | 'COMMISSION' | 'COMMISSION_WITHDRAWAL',
  amount: Number,           // In Naira
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REVERSED',
  profit: Number,           // Reseller profit in Naira
  
  details: {
    beneficiary: String,    // Phone or meter number
    network: String,        // MTN, Airtel, etc.
    planId: String,
    paymentMethod: String,  // 'paystack', 'monnify', 'manual_transfer'
    bankName: String,
    accountNumber: String,
    accountName: String,
    userNote: String,
  },
  
  note: String,             // Admin note
  transactionReference: String (unique), // Internal ref
  paymentGatewayRef: String,  // Paystack/Monnify ref
  providerRef: String,        // VTU provider ref
  previousBalance: Number,
  newBalance: Number,
  
  createdAt: Date,
  updatedAt: Date,
}
```

### ServicePlan Collection
```javascript
{
  _id: ObjectId,
  service: 'airtime' | 'data' | 'cable' | 'electricity',
  provider: String,      // 'mtn_gifting_data', 'dstv', 'aba-electric', etc.
  planCode: String,      // Provider's plan code
  planName: String,      // Display name for users
  description: String,
  
  providerPrice: Number, // In Naira
  ourPrice: Number,      // What users pay (in Naira)
  
  // Level-specific pricing (optional, overrides ourPrice)
  prices: {
    normal: Number,
    affiliate: Number,
    top_user: Number,
    api_user: Number,
  },
  
  metadata: {            // Service-specific metadata
    // electricity: { min_amount, max_amount, type: 'prepaid' }
    // cable: { validity, description }
    // data: { size, validity }
  },
  
  isActive: Boolean,
  visibleOnMobile: Boolean, // Can hide from mobile app while keeping active in admin
  lastSyncedAt: Date,
  _providerData: Object,     // Raw data from provider
  
  createdAt: Date,
  updatedAt: Date,
}
```

### Notification Collection
```javascript
{
  _id: ObjectId,
  user: ObjectId (ref to User),
  deviceToken: String,       // Expo push token
  title: String,
  body: String,
  data: Object,              // Custom data payload
  sentAt: Date,
  read: Boolean,
}
```

### MasterTenant Collection (in master database only)
```javascript
{
  _id: ObjectId,
  tenantId: String (unique),    // e.g., 'demo', 'client_A'
  dbName: String (unique),      // e.g., 'vtu_tenant_demo'
  paystackSecretKey: String,    // Webhook signing key (select: false)
  // Add other provider keys: flutterwaveSecretKey, monnifySecretKey, etc.
}
```

---

## API Endpoints Reference

### Authentication Routes (`/api/v1/auth`)
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/register` | None | Register new user (requires `x-tenant-id` header) |
| POST | `/login` | None | Login and get JWT token (requires `x-tenant-id` header) |
| GET | `/me` | JWT | Get current user profile |

### User Routes (`/api/v1/user`)
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/profile` | JWT | Get user profile |
| PUT | `/profile` | JWT | Update user profile |
| POST | `/set-pin` | JWT | Set/update transaction PIN |
| POST | `/verify-pin` | JWT | Verify transaction PIN |

### Wallet Routes (`/api/v1/user/wallet`)
| Method | Endpoint | Auth | PIN | Purpose |
|--------|----------|------|-----|---------|
| GET | `/balance` | JWT | No | Get wallet balance |
| GET | `/manual-transfer-accounts` | JWT | No | Get company bank accounts for manual transfer |
| POST | `/fund/monnify` | JWT | No | Initiate Monnify payment |
| POST | `/verify/monnify` | JWT | No | Verify Monnify payment receipt |
| POST | `/manual-transfer-notify` | JWT | No | Notify admin of manual bank transfer |

### VTU Routes (`/api/v1/vtu`)
| Method | Endpoint | Auth | PIN | Purpose |
|--------|----------|------|-----|---------|
| GET | `/plans` | JWT | No | Get all service plans |
| GET | `/airtime/networks` | JWT | No | Get airtime provider networks |
| POST | `/airtime/buy` | JWT | **Yes** | Buy airtime |
| GET | `/data/networks` | JWT | No | Get data provider networks |
| GET | `/data/plans/:network` | JWT | No | Get data plans for network |
| POST | `/data/buy` | JWT | **Yes** | Buy data |
| GET | `/cable/providers` | JWT | No | Get cable TV providers |
| GET | `/cable/plans/:identifier` | JWT | No | Get plans for cable provider |
| POST | `/cable/verify` | JWT | No | Verify cable IUC (decoder number) |
| POST | `/cable/subscribe` | JWT | **Yes** | Subscribe to cable TV |
| GET | `/electricity/plans` | JWT | No | Get electricity providers |
| POST | `/electricity/verify` | JWT | No | Verify meter number |
| POST | `/electricity/buy` | JWT | **Yes** | Buy electricity |

### Notification Routes (`/api/v1/user/notifications`)
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/register` | JWT | Register device token for push notifications |
| POST | `/unregister` | JWT | Unregister device token |
| POST | `/test` | JWT | Send test notification |

### Admin Routes (`/api/v1/admin`)
| Method | Endpoint | Auth | Role | Purpose |
|--------|----------|------|------|---------|
| GET | `/dashboard` | JWT | admin | Get dashboard stats |
| GET | `/users` | JWT | admin | List all users (paginated, filterable) |
| GET | `/users/:id` | JWT | admin | Get user details |
| PUT | `/users/:id/activate` | JWT | admin | Activate user account |
| PUT | `/users/:id/deactivate` | JWT | admin | Deactivate user account |
| GET | `/transactions` | JWT | admin | List all transactions (paginated, filterable) |
| GET | `/transactions/:id` | JWT | admin | Get transaction details |
| PUT | `/wallets/:userId/credit` | JWT | admin | Manually credit user wallet |
| PUT | `/wallets/:userId/debit` | JWT | admin | Manually debit user wallet |
| GET | `/plans` | JWT | admin | List all service plans |
| POST | `/plans/:id/sync` | JWT | admin | Sync plans from provider |
| PUT | `/plans/:id` | JWT | admin | Update plan pricing |
| POST | `/plans/:id/toggle` | JWT | admin | Toggle plan active status |

### Webhook Routes (`/api/v1/webhooks`)
| Method | Endpoint | Auth | Provider | Purpose |
|--------|----------|------|----------|---------|
| POST | `/paystack` | Signature | Paystack | Handle Paystack payment webhooks |
| POST | `/monnify` | Signature | Monnify | Handle Monnify payment webhooks |

**Important**: All webhook endpoints require raw body parser and signature verification.

---

## Deployment Guide

### Backend Deployment (Vercel + Node.js)

**Configuration**: `vtu-backend/vercel.json` (already configured)
```json
{
  "version": 2,
  "builds": [{ "src": "server.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "server.js" }]
}
```

**Environment Variables (set in Vercel dashboard)**:
```
PORT=5001
NODE_ENV=production
MONGODB_URI=<production-mongodb-connection-string>
JWT_SECRET=<strong-random-secret>
PAYSTACK_SECRET_KEY=<paystack-production-key>
ALLOWED_ORIGINS=https://og-network-dashboard.vercel.app,https://yourdomain.com
```

**Deploy**:
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy from root
vercel
```

### Admin Dashboard Deployment (Vercel + Next.js)

**Environment Variables** (set in Vercel dashboard or `.env.production.local`):
```
NEXT_PUBLIC_API_URL=https://your-backend-domain.com
```

**Deploy**:
```bash
# From admin-dashboard directory
vercel
```

### Mobile App Deployment (Expo)

**Update API Base URL** (`vtu-frontend/vtu_mobile/src/constants/apiRoutes.js`):
```javascript
const API_BASE_URL = 'https://your-backend-domain.com/api/v1';
```

**Build for Production**:
```bash
cd vtu-frontend/vtu_mobile
eas build --platform ios --auto-submit  # iOS
eas build --platform android            # Android
```

**Note**: Requires EAS CLI and Expo account. See Expo docs for details.

### Database Setup (MongoDB)

1. **Create Master Tenant Database**:
   - Create MongoDB cluster (e.g., on MongoDB Atlas)
   - Create database named `vtu_master` (or similar)
   - Connection string: `mongodb+srv://user:pass@cluster.mongodb.net/vtu_master`

2. **Create Tenant Databases**:
   - One database per tenant (e.g., `vtu_tenant_demo`, `vtu_tenant_clientA`)
   - Or use separate MongoDB instances/clusters for each tenant

3. **Insert Master Tenant Record**:
   ```javascript
   db.tenants.insertOne({
     tenantId: 'demo',
     dbName: 'vtu_tenant_demo',
     paystackSecretKey: '<paystack-secret-key-for-this-tenant>'
   })
   ```

### Security Checklist for Production

- [ ] `NODE_ENV=production` set in backend environment
- [ ] JWT_SECRET is a strong random string (at least 32 characters)
- [ ] CORS `ALLOWED_ORIGINS` is set to specific domains (not '*')
- [ ] Database credentials are stored as secrets (not in code)
- [ ] Payment provider secrets loaded from environment (not hardcoded)
- [ ] HTTPS enabled for all endpoints
- [ ] Rate limiting is active (default: 100 req/15min)
- [ ] MongoDB backups configured
- [ ] Error logging configured (stack traces hidden in production)
- [ ] Webhook signatures verified for all providers
- [ ] Admin role credentials are strong and unique
- [ ] Monitoring and alerting set up for API errors

### Performance Optimization

1. **Database Indexing**: Ensure indexes are created (already defined in schema)
   - User: email, phone (unique)
   - Wallet: user (unique)
   - Transaction: user + status + createdAt
   - ServicePlan: service + provider + planCode (unique)

2. **Caching**: Consider caching frequently accessed data
   - Service plans (rarely change, sync on schedule)
   - Exchange rates (if applicable)
   - User levels/tiers

3. **Rate Limiting**: Already configured at 100 req/15min globally, 10 req/15min for auth

4. **Database Queries**: Use lean() and projection to reduce document size
   ```javascript
   // Good: select only needed fields
   const users = await req.models.User.find().select('email fullName role');
   
   // Avoid: select false on sensitive fields instead
   const user = await req.models.User.findById(id).select('-password -paystackCustomerCode');
   ```

---

## Useful Links & Documentation

- **QUICK_START_TESTING.md** — curl examples, login instructions, testing flow
- **IMPLEMENTATION_SUMMARY.md** — Recent fixes and features (push notifications, security hardening, admin dashboard)
- **README.md** — High-level project overview
- **admin-dashboard/AGENTS.md** — Next.js-specific guidance (breaking changes from standard Next.js)
- **Vercel Deployment** — https://vercel.com/docs/frameworks/nextjs
- **Expo Documentation** — https://docs.expo.dev/
- **Mongoose Docs** — https://mongoosejs.com/docs/

---

(Last updated: Copilot session auto-generated)
