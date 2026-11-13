# 🚀 OGNetwork Quick Start & Testing Guide

## 🖥️ Start Backend

```bash
npm start
```

**Expected output:**
```
📦 Loading tenant secrets...
🔗 Connecting to tenant databases...
🚀 OGNetwork backend running on port 5001 [development]
```

---

## 📱 Start Mobile App

```bash
cd vtu-frontend/vtu_mobile
npm install --legacy-peer-deps  # First time only
npm run ios  # or: npm start → press 'i'
```

---

## 🖥️ Start Admin Dashboard

```bash
cd admin-dashboard
npm run dev
```

Open **http://localhost:3000/login** in your browser.

---

## 🔑 How to Login to the Admin Dashboard

### Step 1: Create an admin user
You need to manually set a user's role to `admin` in MongoDB. Use the MongoDB shell or Compass:

```javascript
// Connect to your database and run:
db.users.updateOne(
  { email: "your-email@example.com" },
  { $set: { role: "admin" } }
)
```

### Step 2: Login to admin dashboard
1. Open **http://localhost:3000/login**
2. Enter the **email** and **password** of the user you made admin
3. Click **Sign In**

The login uses the same `/api/v1/auth/login` endpoint as the mobile app, but with the `admin` role check on protected routes.

### Step 3: Creating a test admin account via curl

```bash
# 1. Register a new user


# 2. Make the user an admin (run this in mongo shell or Compass)
# db.users.updateOne({ email: "admin@example.com" }, { $set: { role: "admin" } })
```

---

## 🧪 Quick API Test with curl

### 1. Login
```bash
curl -X POST http://localhost:5001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: demo" \
  -d '{
    "emailOrPhone": "admin@example.com",
    "password": "Admin@123456"
  }'
```

**Copy the `token` from the response**

### 2. Check Wallet Balance
```bash
curl -X GET http://localhost:5001/api/v1/user/wallet/balance \
  -H "Authorization: Bearer TOKEN_HERE" \
  -H "x-tenant-id: demo"
```

### 3. Admin Dashboard API (requires admin role)
```bash
curl -X GET http://localhost:5001/api/v1/admin/dashboard \
  -H "Authorization: Bearer TOKEN_HERE" \
  -H "x-tenant-id: demo"
```

### 4. Initiate Funding
```bash
curl -X POST http://localhost:5001/api/v1/user/wallet/fund \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_HERE" \
  -H "x-tenant-id: demo" \
  -d '{"amount": 1000}'
```

---

## 📊 Admin Dashboard Pages

| Route | Description |
|-------|-------------|
| `/login` | Login page |
| `/` | Dashboard overview (stats + recent transactions) |
| `/users` | User management (search, activate/deactivate) |
| `/transactions` | Transaction history (filter by status) |
| `/plans` | Service plans (edit prices, sync, toggle active) |
| `/wallets` | Wallet overview |
| `/settings` | Admin settings |

---

## ✅ Testing Checklist

- [ ] Backend starts successfully
- [ ] Frontend loads without errors
- [ ] Admin dashboard builds and loads
- [ ] User can register
- [ ] User can login
- [ ] Admin user can login to dashboard
- [ ] Dashboard shows stats
- [ ] Users page loads and search works
- [ ] Transactions page loads and filtering works
- [ ] Plans page loads and edit modal works
- [ ] Wallet balance displays correctly (no "insufficient balance" bug)
- [ ] Can buy data/airtime/cable/electricity
- [ ] Buying a plan priced below the provider cost is refused (HTTP 409)
- [ ] `node vtu-backend/scripts/auditPlanCostDrift.js` reports no drift for the plans you sell
- [ ] Push notification endpoints work

---

## 🐛 Troubleshooting

### Admin Dashboard shows blank page
→ Ensure backend is running on port 5001
→ Check browser console for CORS errors
→ Login again if token expired

### "Cannot set property query" error
→ Fixed: Removed incompatible `xss-clean` and `express-mongo-sanitize` packages
→ Replaced with custom Express 5-compatible sanitization middleware

### "Insufficient balance" when you have enough
→ **Fixed:** This was a unit mismatch bug (Naira vs Kobo)
→ Redux stores balance in **Naira**, but screens were treating it as **Kobo**

---

## 🧮 Plan Cost Audit & Repair (profit accuracy)

Data plans are keyed by `(service, network, planCode)`, but the VTU APIs
(datastation / gladtidings / geodnatech) **reuse the same numeric plan codes for
unrelated products** (e.g. code `639` is a ₦407 1.5GB bundle on one API and a
₦132,400 60GB/90-day router plan on another). `syncDataPlans` no longer merges a
plan from a provider that does not own the code — it skips it and reports a
"plan-code collision" — so a stored `providerPrice` can no longer be replaced by
another API's price.

### 1. Audit stored costs (read-only)

```bash
node vtu-backend/scripts/auditPlanCostDrift.js            # all tenants
node vtu-backend/scripts/auditPlanCostDrift.js --tenant=demo --limit=100
```

Compares every data plan's stored `providerPrice` with the creation-time
`_providerData` snapshot and lists the plans whose cost basis is wrong
("SELLS BELOW COST" = the purchase guard will refuse those plans).

### 2. Repair one collided plan

```bash
# dry run — prints current vs snapshot values and the profit correction
node vtu-backend/scripts/repairPlanCodeCollision.js --provider=airtel --planCode=639

# write the changes (plan name/description/cost + affected transaction profits)
node vtu-backend/scripts/repairPlanCodeCollision.js --provider=airtel --planCode=639 --apply
```

The repair is idempotent and restores the plan from its own `_providerData`
snapshot; it never calls a provider API (so it works even with an expired key).
Always review the dry run first — a *legitimate* price change by the owning
provider also shows as drift, and only a human can tell the two apart from the
plan labels.

### 3. Purchase-time guards (defence in depth)

| Guard | Behaviour |
|---|---|
| `assertSellPriceAboveCost` | Rejects a purchase (HTTP 409 `PLAN_MISPRICED`) when the user's price is below the stored provider cost — no wallet debit. |
| `assertPlanServedByActiveProvider` | Rejects a purchase (HTTP 409 `PLAN_PROVIDER_MISMATCH`) when the plan was priced by a different API than the currently active provider for that service. |
| Admin price edits | `updatePlanLevelPrices` / `updatePlanPrice` / `updatePlanVisibility` refuse any price below the provider cost. |
| Sync | Collides on a plan code are skipped, logged and returned in `results.collisions`. |

### 4. Dashboard profit figures

`GET /admin/dashboard` returns:

- `totalRevenue`, `totalVolume` — **in naira** (they used to be raw kobo, 100× too large)
- `profitsByService` — gross recorded profit per service
- `commissionsByService` — commission credited to users for the same period
- `profitNetByService` — gross − commission (what the dashboard displays)

Month filters use UTC with an exclusive end bound (`>= 1st 00:00Z`, `< 1st of next month`).
