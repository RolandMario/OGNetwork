'use strict';

const path = require('path');

// Load environment variables from vtu-backend/.env FIRST — before any other imports
// that might read process.env (e.g. DB connection strings, API keys).
// require('dotenv').config({ path: path.resolve(__dirname, 'vtu-backend/.env') });
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');


const { loadTenantSecrets } = require('./src/services/tenantConfigService');
const { connectAllTenantDbs } = require('./src/services/tenantDbService');
const tenantMiddleware = require('./src/middleware/tenantMiddleware');

// Route imports
const webhookRoutes = require('./src/routes/webhookRoutes');
// Add additional route imports here as the project grows, e.g.:
const authRoutes      = require('./src/routes/authRoutes');
const userRoutes      = require('./src/routes/userRoutes');
const vtuRoutes = require('./src/routes/vtuRoutes');
const adminRoutes = require('./src/routes/adminRoutes');

// const walletRoutes = require('./src/routes/walletRoutes');
const app = express();
const PORT = process.env.PORT || 5001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ---------------------------------------------------------------------------
// 1. Security headers
// ---------------------------------------------------------------------------
app.use(helmet());

// ---------------------------------------------------------------------------
// 2. Rate Limiting — protect against brute force and DDoS
// ---------------------------------------------------------------------------
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// Stricter rate limit for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 login/register attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many authentication attempts, please try again later.' },
});
app.use('/api/v1/auth', authLimiter);

// ---------------------------------------------------------------------------
// 3. CORS — restrict in production
// ---------------------------------------------------------------------------
const allowedOrigins = NODE_ENV === 'production'
  ? (process.env.ALLOWED_ORIGINS || 'https://og-network-dashboard.vercel.app').split(',').filter(Boolean)
  : ['*'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// ---------------------------------------------------------------------------
// 3. Webhook routes — raw body parser MUST come before express.json()
//    so that payment-provider signature verification can read the raw bytes.
// ---------------------------------------------------------------------------
app.use(
  '/api/v1/webhooks',
  bodyParser.raw({ type: 'application/json' }),
  webhookRoutes
);

// ---------------------------------------------------------------------------
// 4. Standard body parsers (applied AFTER webhook raw parser)
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ---------------------------------------------------------------------------
// 5. Data sanitization (Express 5 compatible)
//    Both express-mongo-sanitize and xss-clean are incompatible with Express 5
//    because they try to mutate req.query which is now a read-only getter.
//    This custom middleware sanitizes req.body only (where user input lives).
// ---------------------------------------------------------------------------
app.use((req, _res, next) => {
  if (req.body && typeof req.body === 'object') {
    sanitizeInput(req.body);
  }
  next();
});

/**
 * Recursively sanitize an object:
 * 1. Strip $ and . from keys (NoSQL injection prevention)
 * 2. Strip HTML tags and XSS patterns from string values
 */
function sanitizeInput(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    
    // Remove keys starting with $ (NoSQL operators like $gt, $ne, $where)
    if (key.startsWith('$')) {
      delete obj[key];
      continue;
    }
    
    // Remove keys containing dots (MongoDB dotted path injection)
    if (key.includes('.')) {
      delete obj[key];
      continue;
    }
    
    if (typeof value === 'string') {
      // Strip HTML tags and XSS patterns
      obj[key] = value
        .replace(/<[^>]*>/g, '')                    // Strip HTML tags
        .replace(/javascript\s*:/gi, 'noop:')        // Strip javascript: protocol
        .replace(/on\w+\s*=/gi, 'noop=')             // Strip event handlers
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ''); // Strip script blocks
    } else if (typeof value === 'object' && value !== null) {
      sanitizeInput(value);
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Tenant middleware — MUST be mounted at /api/v1 BEFORE route mounting.
//    Populates req.models and per-tenant DB connections on every request.
// ---------------------------------------------------------------------------
app.use('/api/v1', tenantMiddleware);

// ---------------------------------------------------------------------------
// 7. API routes
//    Webhook routes are already mounted above with their raw body parser.
//    Mount all other routes here, beneath tenantMiddleware.
// ---------------------------------------------------------------------------
app.use('/api/v1/auth',  authRoutes);
app.use('/api/v1/user', userRoutes);
app.use('/api/v1/vtu', vtuRoutes);



// ... other route mounts ...
// app.use('/api/v1/user',  userRoutes);
app.use('/api/v1/admin', adminRoutes);  // <- ADD THIS

// Apply tenant middleware ONLY to protected routes that need it
//  app.use('/api/v1/user', tenantMiddleware, userRoutes);
// app.use('/api/v1/vtu', tenantMiddleware, vtuRoutes);
// app.use('/api/v1/admin', tenantMiddleware, adminRoutes);


// app.use('/api/v1/wallet', walletRoutes);

// ---------------------------------------------------------------------------
// 8. Health-check endpoint (useful for load balancers / uptime monitors)
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', env: NODE_ENV });
});

// ---------------------------------------------------------------------------
// 9. 404 handler — catches requests to undefined routes
// ---------------------------------------------------------------------------
app.use((_req, res) => {
  res.status(404).json({ status: 'error', message: 'Route not found' });
});

// ---------------------------------------------------------------------------
// 10. Global error handler — MUST be the last middleware registered
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const message =
    NODE_ENV === 'production' && statusCode === 500
      ? 'Internal server error'
      : err.message || 'Internal server error';

  console.error('[ERROR]', err);

  res.status(statusCode).json({
    status: 'error',
    message,
    ...(NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ---------------------------------------------------------------------------
// Startup sequence (matches documented order):
//   1. loadTenantSecrets()   — master tenant credentials
//   2. connectAllTenantDbs() — per-tenant DB connections
//   3. app.listen()          — only after DBs are ready
// ---------------------------------------------------------------------------
(async () => {
  try {
    console.log('[BOOT] Loading tenant secrets…');
    await loadTenantSecrets();

    console.log('[BOOT] Connecting tenant databases…');
    await connectAllTenantDbs();

    app.listen(PORT, () => {
      console.log(
        `[BOOT] OGNetwork backend running on port ${PORT} [${NODE_ENV}]`
      );
    });
  } catch (err) {
    console.error('[BOOT] Fatal startup error — shutting down:', err);
    process.exit(1);
  }
})();

module.exports = app; // exported for potential testing use