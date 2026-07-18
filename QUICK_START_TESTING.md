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