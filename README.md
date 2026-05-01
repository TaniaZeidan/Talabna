# Multi-Vendor Delivery (MVD) Web Application

> **COE416 — Software Engineering — Spring 2026**
> **LAU · Instructor: Dany Ishak**
> Group: Karim Nehme · Aline Diab · Tania Zeidan

A full-stack multi-vendor food and grocery delivery platform built as the
final project for COE416. The implementation follows the proposal, SRS, and
agile workflow report submitted in earlier deliverables.

---

## 1. Tech stack

| Layer       | Technology                                |
|-------------|-------------------------------------------|
| Frontend    | React 18 + React Router 6 + Vite          |
| Backend     | Node.js 18 + Express 4                    |
| Database    | MySQL 8                                   |
| Auth        | JWT (HS256) + bcrypt-hashed passwords     |
| Email       | Nodemailer (SMTP / Gmail App Passwords)   |
| Tests       | Jest + Supertest (TDD approach)           |

This matches the technology choices documented in §3 of the SRS and §4.1 of
the agile workflow report.

---

## 2. Repository layout

```
multi-vendor-delivery/
├── backend/                  Express REST API
│   ├── src/
│   │   ├── app.js            Express app setup (middleware, routes)
│   │   ├── server.js         Boots the server + auto-cancel sweeper
│   │   ├── config/           DB pool (mysql2/promise)
│   │   ├── controllers/      Request handlers (per actor)
│   │   │   ├── auth.controller.js
│   │   │   ├── vendor.controller.js
│   │   │   ├── order.controller.js
│   │   │   ├── customer.controller.js
│   │   │   ├── delivery.controller.js
│   │   │   ├── admin.controller.js
│   │   │   └── notification.controller.js
│   │   ├── middleware/       Auth (JWT + RBAC), error handling
│   │   ├── routes/           API route definitions
│   │   └── services/         Audit, notifications, recommendations, email
│   ├── tests/                Jest test suites (471 tests)
│   │   ├── __mocks__/        Auto-mocks for DB, audit, email, notifications
│   │   ├── helpers.js        Shared token generators + mock utilities
│   │   ├── auth.test.js              ── integration
│   │   ├── vendor.test.js            ── integration
│   │   ├── order.test.js             ── integration
│   │   ├── customer.test.js          ── integration
│   │   ├── delivery.test.js          ── integration
│   │   ├── admin.test.js             ── integration
│   │   ├── middleware.test.js        ── integration
│   │   ├── notification.test.js      ── integration
│   │   ├── recommendation.test.js    ── integration
│   │   └── unit/                     ── unit tests
│   │       ├── validation.test.js
│   │       ├── order.logic.test.js
│   │       ├── auth.middleware.test.js
│   │       ├── error.test.js
│   │       ├── notification.service.test.js
│   │       ├── audit.service.test.js
│   │       ├── email.service.test.js
│   │       └── recommendation.unit.test.js
│   ├── jest.config.js
│   └── package.json
├── frontend/                 React SPA (Vite)
│   ├── src/
│   │   ├── components/       Navbar, ProtectedRoute, StatusBadge, Layout
│   │   ├── context/          Auth context (token + user state)
│   │   ├── pages/            One file per role group
│   │   ├── services/         API client (fetch wrapper with Bearer token)
│   │   ├── styles/           Plain CSS
│   │   └── App.jsx           Router with role-based redirects
│   └── package.json
├── database/
│   ├── schema.sql            DDL — derived from the LDM in the SRS
│   ├── migration.sql         Adds order_groups, favorites, password_resets, etc.
│   ├── migration-email-reset.sql  Code-based password reset (codeHash, expiry)
│   └── seed.sql              Demo data
└── README.md
```

---

## 3. Prerequisites

- Node.js ≥ 18.x
- npm ≥ 9.x
- MySQL ≥ 8.0 running locally (or remotely accessible)
- A Gmail account with an App Password (for password-reset emails, optional)

---

## 4. Setup & run

### 4.1 Database

```bash
mysql -u root -p < database/schema.sql
mysql -u root -p mvd_app < database/migration.sql
mysql -u root -p mvd_app < database/migration-email-reset.sql
mysql -u root -p mvd_app < database/seed.sql
```

### 4.2 Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev                       # http://localhost:4000
```

Edit `.env` to set your own values for:

| Variable | Purpose |
|---|---|
| `DB_USER`, `DB_PASSWORD`, `DB_PORT` | MySQL connection |
| `JWT_SECRET` | Signing key for authentication tokens |
| `VENDOR_TIMEOUT_MIN` | Auto-cancel threshold for unconfirmed orders (default 10) |
| `SMTP_USER`, `SMTP_PASS` | Gmail App Password for password-reset emails |

The server logs `[db] Connected to MySQL` and
`[server] MVD API listening on port 4000`.

A health-check endpoint is available at <http://localhost:4000/api/health>.

### 4.3 Frontend

```bash
cd frontend
npm install
npm run dev                       # http://localhost:3000
```

Vite proxies `/api/*` to the backend automatically (see `vite.config.js`).

---

## 5. Demo accounts

All demo passwords are **`Pass123`**.

| Role     | Username     | Notes                                  |
|----------|--------------|----------------------------------------|
| Admin    | `admin1`     | Approves vendors, manages users        |
| Customer | `alice`      | Has past orders + 150 loyalty points   |
| Customer | `bob`        | Has 1 past order + 80 points           |
| Customer | `charlie`    | Fresh customer, 20 points              |
| Vendor   | `pizzaowner` | Mario's Pizza — already approved       |
| Vendor   | `sushiowner` | Tokyo Sushi — already approved         |
| Vendor   | `grocer`     | Fresh Grocer — **pending** approval    |
| Driver   | `driver1`    | Active                                 |
| Driver   | `driver2`    | Active                                 |

To exercise FR-A2 (vendor approval), log in as `admin1` and approve `grocer`.

---

## 6. Feature → Requirement mapping

Functional requirements come from §4.2 of the SRS.

### Customer

- **FR-C1** Login — `POST /api/auth/login`
- **FR-C2** Register (validation rules) — `POST /api/auth/register`
- **FR-C3** Browse vendors / products — `GET /api/vendors`, `GET /api/products` (search, category, price range filters)
- **FR-C4** Place order — `POST /api/orders` (product verification, delivery fee, payment method `cash`/`card`)
- **FR-C5** Track order in real time — `GET /api/orders/me` (5 s polling on UI)
- **FR-C6** Schedule delivery — `scheduledTime` field, validated to 09:00–22:00 operational hours
- **FR-C7** Loyalty rewards — `GET /api/loyalty/me`, point redemption on order placement (1 pt/$ earned on delivery, 10 pts = $1 discount), auto-refund on cancellation/rejection
- **FR-C8** Group ordering — `/api/carts/*` endpoints (create shared cart, invite code, join, add/remove items, owner checkout)
- **FR-C9** Reviews & ratings — `POST /api/reviews` (1–5 stars, only on delivered orders, one review per order, auto-recomputes vendor average)
- **Password reset** — Two-step email verification flow: `POST /api/auth/reset-password/request` sends a 6-digit code (15 min expiry, rate-limited to 3/hour), `POST /api/auth/reset-password/confirm` verifies and updates
- **Favorites** — `GET/POST/DELETE /api/favorites` (save/unsave vendors)
- **Multi-store ordering** — `POST /api/orders/multi-store` (single session ordering from 2+ vendors, creates order group, one delivery fee)
- **Recommendations** — `GET /api/recommendations` (scored by order history, time-of-day, mood preference, vendor rating, budget fit)
- **Meal combos** — `GET /api/meal-combos?budget=X` ("What can I eat with $X?" — generates main+side combinations across vendors)
- **Notifications** — `GET /api/notifications`, `POST /api/notifications/:id/read` (in-app notifications for order updates, deliveries, approvals)
- **Special instructions** — Per-item `specialInstructions` field on order placement

### Vendor

- **FR-V1** Login (pending vendors blocked) — same login endpoint
- **FR-V2** Add products — `POST /api/vendor/products` (validates name, category, price ≥ 0)
- **FR-V3** Update / remove products — `PUT/DELETE /api/vendor/products/:id` (ownership-checked)
- **FR-V4** Confirm / reject orders + auto-cancel timeout — `POST /api/vendor/orders/:id/confirm|reject`. Sweeper auto-cancels Pending orders older than `VENDOR_TIMEOUT_MIN` (default 10 min) and refunds points.
- **FR-V5** Update preparation status — `POST /api/vendor/orders/:id/prepare` (`InPreparation` → `ReadyForPickup`). Drivers are notified when ready; for multi-store orders, only when ALL sub-orders are ready.
- **FR-V6** Performance analytics — `GET /api/vendor/analytics` (total orders, revenue, avg prep time, top products)
- **Daily summary** — `GET /api/vendor/daily-summary?date=YYYY-MM-DD` (orders, revenue, delivered/cancelled/active, top items)
- **Monthly overview** — `GET /api/vendor/monthly-overview?month=YYYY-MM` (daily breakdown, best seller)

### Driver

- **FR-D1** Login — same login endpoint
- **FR-D2** View / accept available deliveries — `GET /api/driver/available` (single + grouped multi-store), `POST /api/driver/deliveries/:id/accept` (supports `group-{id}` for multi-store)
- **FR-D3** Update delivery status — `POST /api/driver/deliveries/:id/status` (`PickedUp` / `Delivered` / `Failed`). Loyalty points are awarded on `Delivered`.
- **FR-D4** Report delivery issues — `POST /api/driver/deliveries/:id/issue` (notifies all admins)

### Admin

- **FR-A1** Login — same login endpoint
- **FR-A2** Approve / reject vendors — `POST /api/admin/vendors/:id/approve|reject`
- **FR-A3** Manage users — `POST /api/admin/users/:id/suspend|reactivate` (self-suspension blocked)
- **FR-A4** Monitor system activity — `GET /api/admin/activity` (live counts + audit log feed)
- **FR-A5** Generate reports — `GET /api/admin/reports?range=day|week|month` (revenue, customer activity, vendor breakdown, loyalty stats)

### Non-functional

- **NFR-S1** JWT authentication + role-based access control middleware (`authenticate`, `requireRole`)
- **NFR-S2** Bcrypt password hashing (12 rounds), TLS-ready, global rate-limiting (600 req / 15 min / IP)
- **NFR-R2** Audit logs persisted on account creation, login, order placement, vendor approval, delivery completion, password resets, suspensions
- **NFR-P2** Real-time tracking via 5 s polling on customer / vendor / driver pages

---

## 7. User-story coverage

All 18 user stories from the agile workflow report are implemented:

| Sprint | ID     | Story                                     | Status |
|--------|--------|-------------------------------------------|--------|
| 1      | US-001 | Customer registration & login             | ✅      |
| 1      | US-002 | Vendor registration                       | ✅      |
| 1      | US-003 | Driver registration                       | ✅      |
| 1      | US-004 | Admin login                               | ✅      |
| 1      | US-005 | Browse vendors / restaurants              | ✅      |
| 1      | US-006 | Search & filter products                  | ✅      |
| 2      | US-007 | Place an order                            | ✅      |
| 2      | US-008 | Vendor manages own products               | ✅      |
| 2      | US-009 | Vendor confirms / rejects                 | ✅      |
| 2      | US-010 | Driver accepts deliveries                 | ✅      |
| 2      | US-011 | Real-time order tracking                  | ✅      |
| 2      | US-012 | Schedule order for later                  | ✅      |
| 3      | US-013 | Loyalty / rewards                         | ✅      |
| 3      | US-014 | Group ordering (shared cart)              | ✅      |
| 3      | US-015 | Reviews & ratings                         | ✅      |
| 3      | US-016 | Personalized recommendations              | ✅      |
| 3      | US-017 | Vendor performance analytics              | ✅      |
| 3      | US-018 | Admin reports                             | ✅      |

Additional features beyond the original user stories: password reset with email verification, multi-store ordering, vendor favorites, budget-based meal combos, in-app notification system, per-item special instructions, payment method selection, and vendor daily/monthly summaries.

---

## 8. Testing (TDD approach)

Tests were written first to define expected behavior, then the implementation
was built to pass all tests. The test suite uses **Jest** for the test runner,
**Supertest** for HTTP-level integration tests, and dedicated unit tests for
individual functions and services.

```bash
cd backend
npm test
```

### Test architecture

- **Two-project Jest config**: `jest.config.js` defines separate `unit` and
  `integration` projects with different mocking strategies, clearly separating
  the testing pyramid layers.
- **Module-level mocking**: Integration tests use `moduleNameMapper` to swap
  the real MySQL pool and external services (email, audit, notifications) with
  deterministic Jest mocks — no database or SMTP server needed.
- **Supertest integration tests**: Each integration test file imports the
  Express `app` (separated from `server.js` for testability) and exercises
  real HTTP request/response cycles through the full middleware chain.
- **Isolated unit tests**: Unit tests import real modules with only the
  database layer mocked, testing individual functions, validation logic,
  business rules, and service behavior in isolation.
- **Shared helpers**: Token generators for each role (`customerToken`,
  `vendorToken`, `driverToken`, `adminToken`) and a `resetMocks` utility
  ensure test isolation.

### Integration tests — 288 tests across 9 files

| Suite | Tests | What it covers |
|---|---|---|
| `auth.test.js` | 32 | Registration validation (boundary values for username/password length, password strength, email format, role, uniqueness), login (suspended/pending/wrong-password), password reset flow |
| `vendor.test.js` | 24 | Public browsing with search/category/price filters, product CRUD with ownership checks, negative price rejection, analytics, daily summary, monthly overview |
| `order.test.js` | 32 | Place order (loyalty redemption, scheduling, payment method), cancel/confirm/reject with point refunds, prep status state machine, auto-cancel sweep |
| `customer.test.js` | 51 | Reviews (rating bounds, duplicates, delivery-only), favorites CRUD, multi-store ordering (2+ vendor groups), shared cart full lifecycle, loyalty, recommendations, meal combos |
| `delivery.test.js` | 23 | Available deliveries (single + group), accept (conflict 409), status transitions (PickedUp/Delivered/Failed), loyalty point award, issue reporting |
| `admin.test.js` | 47 | Vendor approval/rejection, user suspend (self-guard)/reactivate, activity summary, reports (day/week/month), role-based access checks for all endpoints |
| `middleware.test.js` | 14 | JWT authenticate (no token, invalid, expired, valid), requireRole (single/multiple), AppError, errorHandler, asyncHandler |
| `notification.test.js` | 5 | List notifications, unread filter, mark read |
| `recommendation.test.js` | 29 | hourToContext boundary values, time-context matching, mood scoring, recommendForUser with history/budget/mood, buildMealCombos budget constraints |

### Unit tests — 183 tests across 8 files

| Suite | Tests | What it covers |
|---|---|---|
| `validation.test.js` | 62 | Registration field validation, username/password boundary values, email regex (valid + invalid formats), product input validation, operational hours boundaries, payment methods, loyalty point math, order status state machine transitions, delivery fee calculations |
| `recommendation.unit.test.js` | 22 | recommendForUser scoring (history boost, budget filter, mood preference, limit, empty products), buildMealCombos (budget constraints, fit ratio, vendor diversity, main+side combos) |
| `auth.middleware.test.js` | 16 | authenticate (no header, empty header, wrong prefix, malformed JWT, expired JWT, wrong secret, valid JWT, payload preservation), requireRole (factory return, missing user, wrong role, single/multi role, cross-role rejection) |
| `error.test.js` | 17 | AppError (instanceof, message, default/custom status, publicMessage, stack trace), errorHandler (status codes, publicMessage, 500 hiding, logging), asyncHandler (wrapping, error forwarding, no-error passthrough, rejected async) |
| `order.logic.test.js` | 11 | Exported constants, runAutoCancelSweep (empty sweep, cancel stale, refund points, skip zero-point refund, multi-order processing, audit logging, customer notification, rollback on error, query failure resilience) |
| `notification.service.test.js` | 10 | notify (insert params, null default, error swallowing, null userID), listForUser (all/unread/empty, ORDER BY + LIMIT), markRead (correct record, scoped update) |
| `email.service.test.js` | 16 | sendResetCode (recipient, subject, code in text/HTML, username in body, from field, return value, error propagation, XSS prevention via escapeHtml), escapeHtml (&, <, >, ", combined) |
| `audit.service.test.js` | 5 | logAction (insert params, default details, null userID, error swallowing, non-breaking failures) |

### Edge cases covered

- **Boundary values**: password exactly 5/6/20/21 chars, username limits, rating 0/1/5/6, budget 0/negative, operational hours 08:59/09:00/21:59/22:00
- **Authorization**: every protected endpoint tested without token (401), with wrong role (403), cross-role isolation
- **State machine transitions**: order status flow (Pending → Confirmed → InPreparation → ReadyForPickup → OnTheWay → Delivered), invalid transitions rejected, terminal states verified
- **Transaction rollbacks**: loyalty point refunds on cancellation/rejection, multi-store atomicity
- **Concurrency guards**: delivery already-assigned conflict (409)
- **Business rules**: self-suspension blocked, single-vendor groups rejected, cart owner-only checkout, one review per order, discount capped at subtotal
- **Security**: XSS prevention in email HTML (escapeHtml), JWT secret mismatch rejection, bcrypt timing safety
- **Resilience**: audit/notification services swallow DB errors silently, auto-cancel sweep continues after per-order failures

---

## 9. End-to-end demo walkthrough

1. **Admin**: log in as `admin1` → `/admin/vendors` → approve `grocer`
2. **Customer**: log in as `alice` → browse `/customer` → open Mario's Pizza → add items, redeem 50 points → place order
3. **Vendor**: log in as `pizzaowner` → `/vendor/orders` → confirm → start preparing → mark ready
4. **Driver**: log in as `driver1` → `/driver` → accept the order → mark picked up → mark delivered
5. **Customer**: refresh `/customer/orders`, see "Delivered", click "Rate & review"
6. **Admin**: `/admin` to see the audit log update; `/admin/reports` for aggregates

Additional flows to demo:
- **Password reset**: click "Forgot password?" on login → enter username + email → receive 6-digit code → enter code + new password
- **Multi-store**: add items from Mario's Pizza AND Tokyo Sushi in one session → place multi-store order → both vendors confirm → driver picks up from both
- **Shared cart**: create a group order → share invite code → second customer joins and adds items → owner checks out
- **Favorites**: browse vendors → heart a vendor → view saved favorites list
- **Meal combos**: enter a budget → see suggested meal combinations from different vendors

---

## 10. Notes

- The vendor auto-cancel sweeper runs every 60 seconds in the same Node
  process. In production, this would be deployed as a separate worker or
  cron job.
- All monetary amounts are stored as `DECIMAL(10,2)` for accuracy.
- Stock counts are decremented inside transactions with `FOR UPDATE` row
  locking to prevent overselling under concurrent placement.
- Loyalty points are credited only when delivery is **completed** by the
  driver, and refunded if the order is rejected or auto-cancelled.
- A fixed delivery fee of $2.00 is applied per order (once per multi-store
  group).
- Password reset codes expire after 15 minutes and are rate-limited to 3
  requests per hour per user. Codes are bcrypt-hashed before storage.
- The Express app is separated into `app.js` (setup) and `server.js`
  (listen + sweeper) to enable clean Supertest integration without port
  conflicts.

---

*This codebase is the engineering deliverable for Submission 4 of the
COE416 Spring 2026 project.*
