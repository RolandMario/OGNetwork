/* eslint-disable no-console */
/**
 * server.js
 * The main entry point for the VTU Backend Application.
 * Handles DB connection, middleware setup, route registration, and server startup.
 */

// 1. LOAD ENVIRONMENT VARIABLES
// Must be done at the very top before any other config loads
// require('dotenv').config();
require('dotenv').config({ path: './vtu-backend/.env' });


// 2. HANDLE UNCAUGHT SYNCHRONOUS EXCEPTIONS
// Catches bugs in sync code before the server even starts.
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  process.exit(1); // Exit with failure code
});

// --- IMPORTS ---
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
// const xss = require('xss-clean');
const hpp = require('hpp');





// Import Route handlers (assuming these files exist based on previous design)
const authRoutes = require('./src/routes/authRoutes');
const vtuRoutes = require('./src/routes/vtuRoutes');
const userRoutes = require('./src/routes/userRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const webhookRoutes = require('./src/routes/webhookRoutes');
const bodyParser = require('body-parser');   // <--- add this
// Import GlobalErrorHandler (A dedicated middleware function)
// const globalErrorHandler = require('./src/controllers/errorController');


// IMPORT NEW MIDDLEWARE
const tenantMiddleware = require('./src/middleware/tenantMiddleware');

// --- APP INITIALIZATION ---
const app = express();

// --- GLOBAL MIDDLEWARE STACK ---

// 1. Set security HTTP headers
// Helmet helps secure Express apps by setting various HTTP headers.
app.use(helmet());

// 2. Development logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// 3. CORS Configuration
// Essential for allowing your React Native app (or Web Dashboard) to talk to this API.
// In production, replace origin: '*' with specific domains for security.
app.use(cors({
  origin: '*', // Change this in production! e.g. ['https://myvtuadmin.com']
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// 4. Webhook handling (Optional but recommended for payment gateways)
// Some webhooks need raw body parsing before JSON parsing.
app.use('/api/v1/webhooks', bodyParser.raw({ type: 'application/json' }), webhookRoutes);

// 5. Body Parser, reading data from body into req.body
// Limit body size to 10kb to prevent Denial of Service (DoS) attacks.
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// --- DATA SANITIZATION (CRITICAL FOR FINTECH) ---

// 6. Data sanitization against NoSQL query injection
// Prevents attackers from sending {"$gt": ""} in login forms to bypass passwords.
// app.use(mongoSanitize());
// app.use(mongoSanitize({
//   onSanitize: ({ req, key }) => {
//     console.warn(`Sanitized ${key} from ${req.path}`);
//   },
//   replaceWith: '_', // optional
// }));
app.use((req, res, next) => {
  req.body = mongoSanitize.sanitize(req.body);
  // skip req.query
  next();
});


// 7. Data sanitization against XSS (Cross-Site Scripting)
// Cleans user input from malicious HTML code.
// app.use(xss());

const xss = require('xss');
app.use((req, res, next) => {
  if (req.body) req.body = JSON.parse(xss(JSON.stringify(req.body)));
  next();
});


// 8. Prevent HTTP Parameter Pollution
// Cleans up query strings (e.g., ?sort=price&sort=name).
app.use(hpp());

// --- APPLY TENANT MIDDLEWARE ---
// This must come BEFORE your route mounting.
// It ensures every API request has req.models populated correctly.
app.use('/api/v1', tenantMiddleware);

// --- ROUTE MOUNTING ---

// Health check endpoint (useful for load balancers or quick testing)
app.get('/', (req, res) => {
  res.status(200).json({ status: 'success', message: 'VTU API Backend is running securely.' });
});

// API Routes (Uncomment when route files are created)
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/user', userRoutes);
app.use('/api/v1/vtu', vtuRoutes);
app.use('/api/v1/admin', adminRoutes);

// --- 404 HANDLE UNHANDLED ROUTES ---
// If a request reaches here, it means no route matched.
// app.all('*', (req, res, next) => {
//   const err = new Error(`Can't find ${req.originalUrl} on this server!`);
//   err.statusCode = 404;
//   err.status = 'fail';
//   next(err); // Passing an error to next() skips to global error handling middleware
// });

// --- GLOBAL ERROR HANDLING MIDDLEWARE ---
// All errors passed via next(err) land here.
app.use((err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    // In development, send detailed error. In production, send generic message.
    if (process.env.NODE_ENV === 'development') {
        res.status(err.statusCode).json({
            status: err.status,
            error: err,
            message: err.message,
            stack: err.stack
        });
    } else {
        // Production: Don't leak implementation details
        res.status(err.statusCode).json({
            status: err.status,
            message: err.isOperational ? err.message : 'Something went wrong!'
        });
    }
});

// --- DATABASE CONNECTION AND SERVER START ---

const PORT = process.env.PORT || 5000;
// const DB = process.env.DATABASE_URI;

// mongoose
//   .connect(DB, {
//     // Options needed for older Mongoose versions, usually not needed in v6+
//     // useNewUrlParser: true,
//     // useUnifiedTopology: true,
//   })
//   .then((con) => {
//     console.log(`MongoDB Connected Successfully: ${con.connection.host}`);


    // src/server.js
// ... existing imports ...
const { loadTenantSecrets } = require('../vtu-backend/src/services/tenantConfigService');
const {connectAllTenantDbs} = require('../vtu-backend/src/services/tenantDbService') // Assume this loads connections
let server;
// ...
const startServer = async () => {
    // 1. Connect Master DB and load secrets
    await loadTenantSecrets(); 
    
    // 2. Connect all tenant databases (You likely do this to populate req.dbConnections)
    await connectAllTenantDbs(); 

    // ... continue with Express setup
    
    // Only start listening once the DB connection is secure
    server = app.listen(PORT, () => {
      console.log(`🚀 VTU Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    });
};

startServer();
// ...

    // --- HANDLE UNHANDLED PROMISE REJECTIONS ---
    // Catches async errors outside Express (e.g., DB connection dropped)
    process.on('unhandledRejection', (err) => {
      console.error('UNHANDLED REJECTION! 💥 Shutting down gracefully...');
      console.error(err.name, err.message);
      // Close server first, then exit process
      server.close(() => {
        process.exit(1);
      });
    // });

    // --- GRACEFUL SHUTDOWN (SIGTERM) ---
    // For containerized environments (Docker/Kubernetes)
    process.on('SIGTERM', () => {
      console.log('👋 SIGTERM RECEIVED. Shutting down gracefully');
      server.close(() => {
        console.log('💥 Process terminated!');
      });
    });
  })
  // .catch((err) => {
  //   console.error('MongoDB Connection Error 💥');
  //   console.error(err);
  //   // Exit if DB connection fails initially
  //   process.exit(1);
  // });