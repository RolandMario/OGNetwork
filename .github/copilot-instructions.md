# Copilot instructions for OGNetwork

## Quick commands (what to run)
- Backend (development):
  - npm install (root)
  - npm start
    - Runs: nodemon vtu-backend/server.js (server loads vtu-backend/.env)
  - To run directly (no nodemon): NODE_ENV=development node vtu-backend/server.js
- Frontend (mobile - Expo):
  - cd vtu-frontend/vtu_mobile && npm install
  - npm run start          # expo start
  - npm run android|ios|web # run on specific platform
- Tests / Lint: No test or lint scripts are configured in package.json. Do not assume test framework exists.

## High-level architecture
- Monorepo layout:
  - vtu-backend/        -> Express + Mongoose API server (src/ contains controllers, routes, services, models, middleware)
  - vtu-frontend/vtu_mobile/ -> Expo React Native mobile app (React Navigation + Redux slices)
  - Root package.json contains start script that launches the backend via nodemon.

- Backend runtime flow:
  - server.js loads environment from vtu-backend/.env, then:
    1. loadTenantSecrets() from src/services/tenantConfigService
    2. connectAllTenantDbs() from src/services/tenantDbService
    3. start Express after tenant DBs are ready
  - Middleware stack important order:
    - Security headers (helmet)
    - CORS (note: origin: '*' in code; replace for production)
    - Webhook raw body parsing (app.use('/api/v1/webhooks', bodyParser.raw(...), webhookRoutes)) — raw parser MUST run before JSON parsing for webhook endpoints
    - express.json / urlencoded
    - tenantMiddleware mounted at '/api/v1' BEFORE route mounting — this populates req.models / per-tenant connections
    - Error handler mounted last
  - File organization: routes -> controllers -> services -> models. Services encapsulate business logic and external integrations (payments, providers).

- Key integrations:
  - Payment provider(s) + webhook handling (webhookRoutes, webhookController)
  - Multi-tenant pattern: MasterTenant model + tenant DB connections per tenant
  - Security: Data sanitization (express-mongo-sanitize + xss sanitation) and HPP used in server.js

## Key conventions and repo-specific patterns
- Layering convention: *Routes.js -> *Controller.js -> *Service.js -> models/*.js
- Tenant handling:
  - tenantMiddleware is required to be applied before mounting API routes; it sets per-request tenant context (req.models / db connections).
  - Master tenant secrets are loaded early and used to connect tenant DBs. Ensure DB connection functions complete before listening.
- Webhook endpoints:
  - Always mount webhook routes with a raw body parser (bodyParser.raw({ type: 'application/json' })) before other body parsers to preserve signature verification.
- Environment:
  - The backend expects vtu-backend/.env; server.js explicitly loads dotenv with that path. Keep secrets out of repo.
- Startup:
  - Root `npm start` uses nodemon to run the backend entrypoint (vtu-backend/server.js). For CI or production, run node directly and ensure NODE_ENV is set.
- Frontend notes:
  - Mobile app uses Expo; API base URLs are in src/constants/apiRoutes.js — update when backend URL changes.
- No test or lint scripts are configured — add scripts and CI if you plan to run automated checks.

## Files to inspect when debugging common tasks
- vtu-backend/src/middleware/tenantMiddleware.js — tenant resolution
- vtu-backend/src/services/tenantConfigService.js — secret loading
- vtu-backend/src/services/tenantDbService.js — tenant DB connections
- vtu-backend/src/routes/webhookRoutes.js and src/controllers/webhookController.js — webhook verification and handling
- vtu-frontend/vtu_mobile/src/constants/apiRoutes.js — frontend API endpoints


---

(Generated automatically to help future Copilot sessions.)
