# Vercel Production Fix — Tenant Connection Error

## Current Status

The server now uses a **resilient boot sequence** with **lazy-connection fallback**.
Even if the Master DB is unreachable at cold start, the server will start and retry
the connection on the first incoming request.

## Root Cause

MongoDB Atlas blocks connections from unknown IPs. Vercel serverless functions use
dynamic outbound IPs, so your Atlas cluster needs to allow them.

The "No connection found for tenant 'demo'" error was a **symptom**, not the root cause.
The server was crashing on boot (`process.exit(1)`) before tenant connections could be
established, leaving the tenant cache empty.

## What Changed

### 1. Resilient Boot (`server.js`)
- **Before**: `process.exit(1)` on any DB connection failure → server never starts
- **After**: Logs a warning, starts the server anyway → lazy fallback retries on first request

### 2. Lazy Reload of Tenant Secrets (`tenantDbService.js`)
- **Before**: If `getTenantSecret(tenantId)` returned null, immediately threw 404
- **After**: If the tenant cache is empty, calls `loadTenantSecrets()` to reload from Master DB
  before giving up. This means the first request after a cold start can **self-heal**.

### 3. Cache Repopulation (`tenantConfigService.js`)
- **Before**: Cache was populated once at boot, never cleared
- **After**: `loadTenantSecrets()` clears and repopulates caches, safe to call multiple times
- **New**: `isTenantCacheEmpty()` helper lets other services check cache state

## Required External Fixes

### 1. Fix MongoDB Atlas IP Whitelist

1. Open https://cloud.mongodb.com/
2. Go to **Network Access** (left sidebar)
3. Click **Add IP Address**
4. Choose **Allow Access from Anywhere** (`0.0.0.0/0`)
   - Comment: `Vercel serverless IPs`
5. Click **Confirm**

**Why 0.0.0.0/0**: Vercel does not publish a static list of egress IPs for serverless
functions. This is the standard workaround for Vercel + Atlas.

### 2. Verify Vercel Environment Variables

Vercel Dashboard → Your Project → **Settings** → **Environment Variables**

Confirm these exist with the exact values from your local `vtu-backend/.env`:

| Variable | Required | Example Value |
|----------|----------|---------------|
| `DATABASE_URI` | Yes | `mongodb+srv://RolandMario:...@cluster-vtu.mx2yyag.mongodb.net/VTU?...` |
| `MONGODB_BASE_URI` | Yes | `mongodb+srv://RolandMario:...@cluster-vtu.mx2yyag.mongodb.net/?appName=Cluster-vtu` |
| `JWT_SECRET` | Yes | `e4d254a0c30b53c696301eb758d3a5f69f9d69f405992ccb26ed5d0e3460b176` |
| `NODE_ENV` | Recommended | `production` |
| `PAYSTACK_SECRET_KEY` | Yes (for webhooks) | `sk_test_...` |

**Important**: Vercel does NOT deploy your local `.env` file. These must be added manually.

### 3. Redeploy to Vercel

After updating Atlas and Vercel env vars:

```bash
cd /Users/macbookair/Desktop/projects/OGNetwork/vtu-backend
vercel --prod
```

Or push a new commit to your git repository to trigger a Vercel build.

### 4. Verify the `tenants` Collection in Master DB

1. Open Atlas → Browse Collections → **VTU** database → **tenants** collection
2. Confirm a document exists:
```json
{
  "tenantId": "demo",
  "dbName": "vtu_demo",
  "paystackSecretKey": "sk_test_f6436553a3e96c17fd447658dbde28b42ed70af7"
}
```

If missing, insert it using:
```javascript
db.tenants.insertOne({
  tenantId: "demo",
  dbName: "vtu_demo",
  paystackSecretKey: "sk_test_f6436553a3e96c17fd447658dbde28b42ed70af7"
})
```

## Expected Logs After Fix

### Successful boot (all DBs connect):
```
[BOOT] Loading tenant secrets…
[tenantConfigService] Connected to Master DB.
[tenantConfigService] Loaded secrets for 1 tenant(s): demo
[BOOT] Connecting tenant databases…
[tenantDbService] Opening connections for 1 tenant(s)…
[tenantDbService] Connected "demo" -> "vtu_demo" | Models: [User, Wallet, Transaction, ServicePlan, AdminConfig]
[BOOT] All tenant DB connections established.
[BOOT] OGNetwork backend running on port 5001 [production]
```

### Resilient boot (Master DB unreachable at cold start):
```
[BOOT] Loading tenant secrets…
❌ Failed to load tenant secrets: Could not connect to any servers in your MongoDB Atlas cluster.
[BOOT] Startup warning (non-fatal): Could not connect to any servers...
[BOOT] The server will still start. Lazy fallback will retry connections on first request.
[BOOT] OGNetwork backend running on port 5001 [production]
```

Then on first request:
```
[tenantDbService] Lookup for tenant "demo" — connection not found.
[tenantDbService] Tenant cache is empty — attempting lazy reload of tenant secrets…
[tenantConfigService] Connecting to Master DB…
[tenantConfigService] Connected to Master DB.
[tenantConfigService] Loaded secrets for 1 tenant(s): demo
[tenantDbService] Lazy reload of tenant secrets succeeded.
[tenantDbService] Cache miss for "demo" — attempting lazy connect.
[tenantDbService] Connected "demo" -> "vtu_demo" | Models: [User, Wallet, Transaction, ServicePlan, AdminConfig]
```

## Code Fixes Applied

| File | Change |
|------|--------|
| `server.js` | Removed `process.exit(1)` on boot failure. Server always starts. |
| `src/services/tenantConfigService.js` | Added `isTenantCacheEmpty()`. `loadTenantSecrets()` now clears/repopulates caches (safe to call multiple times). |
| `src/services/tenantDbService.js` | `getTenantConnection()` now calls `loadTenantSecrets()` if cache is empty before giving up. |
| `src/middleware/tenantMiddleware.js` | Already awaits async connection (no change needed). |
| `src/middleware/authTenantMiddleware.js` | Already awaits async connection (no change needed). |
| `src/controllers/webhookController.js` | Already awaits async connection (no change needed). |