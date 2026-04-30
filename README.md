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
| Tests       | Jest                                      |

This matches the technology choices documented in §3 of the SRS and §4.1 of
the agile workflow report.

---

## 2. Repository layout

```
multi-vendor-delivery/
├── backend/                  Express REST API
│   ├── src/
│   │   ├── config/           DB pool
│   │   ├── controllers/      Request handlers (per actor)
│   │   ├── middleware/       Auth, RBAC, error handling
│   │   ├── routes/           API route definitions
│   │   ├── services/         Audit, notifications, recommendations
│   │   └── server.js         App bootstrap
│   ├── tests/                Jest unit tests
│   └── package.json
├── frontend/                 React SPA (Vite)
│   ├── src/
│   │   ├── components/       Navbar, ProtectedRoute, StatusBadge
│   │   ├── context/          Auth context
│   │   ├── pages/            One file per role
│   │   ├── services/         API client
│   │   ├── styles/           Plain CSS (no Tailwind)
│   │   └── App.jsx           Router
│   └── package.json
├── database/
│   ├── schema.sql            DDL — derived from the LDM in the SRS
│   └── seed.sql              Demo data
└── README.md
```

---

## 3. Prerequisites

- Node.js ≥ 18.x
- npm ≥ 9.x
- MySQL ≥ 8.0 running locally (or remotely accessible)

---

## 4. Setup & run

### 4.1 Database

```bash
mysql -u root -p < database/schema.sql
mysql -u root -p mvd_app < database/seed.sql
```

### 4.2 Backend

```bash
cd backend
cp .env.example .env             # then edit DB_USER / DB_PASSWORD / JWT_SECRET
npm install
npm run dev                       # http://localhost:4000
```

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
- **FR-C3** Browse vendors / products — `GET /api/vendors`, `GET /api/products` (search + filter)
- **FR-C4** Place order — `POST /api/orders` (atomic stock check + decrement)
- **FR-C5** Track order in real time — `GET /api/orders/me` (5 s polling on UI)
- **FR-C6** Schedule delivery — `scheduledTime` field, validated to 09:00–22:00
- **FR-C7** Loyalty rewards — `GET /api/loyalty/me`, redemption supported on order placement
- **FR-C8** Group ordering — `/api/carts/*` endpoints
- **FR-C9** Reviews & ratings — `POST /api/reviews`

### Vendor
- **FR-V1** Login (pending vendors blocked) — same login endpoint
- **FR-V2** Add products — `POST /api/vendor/products` (validation per FR-V2)
- **FR-V3** Update / remove products — `PUT/DELETE /api/vendor/products/:id`
- **FR-V4** Confirm / reject orders + auto-cancel timeout — `POST /api/vendor/orders/:id/confirm|reject`. Sweeper in `server.js` auto-cancels Pending orders older than `VENDOR_TIMEOUT_MIN` (default 10 min) and refunds points.
- **FR-V5** Update preparation status — `POST /api/vendor/orders/:id/prepare`
- **FR-V6** Performance analytics — `GET /api/vendor/analytics`

### Driver
- **FR-D1** Login — same login endpoint
- **FR-D2** View / accept available deliveries — `GET /api/driver/available`, `POST /api/driver/deliveries/:id/accept`
- **FR-D3** Update delivery status — `POST /api/driver/deliveries/:id/status` (PickedUp / Delivered / Failed). Loyalty points are awarded on `Delivered`.
- **FR-D4** Report delivery issues — `POST /api/driver/deliveries/:id/issue` (notifies all admins)

### Admin
- **FR-A1** Login — same login endpoint
- **FR-A2** Approve / reject vendors — `POST /api/admin/vendors/:id/approve|reject`
- **FR-A3** Manage users — `POST /api/admin/users/:id/suspend|reactivate`
- **FR-A4** Monitor system activity — `GET /api/admin/activity` (live counts + audit log feed)
- **FR-A5** Generate reports — `GET /api/admin/reports?range=day|week|month`

### Non-functional
- **NFR-S1** JWT authentication + role-based access control middleware
- **NFR-S2** Bcrypt password hashing (12 rounds), TLS-ready, light rate-limiting
- **NFR-R2** Audit logs persisted on account creation, login, order placement, vendor approval, delivery completion
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

---

## 8. Running the tests

```bash
cd backend
npm test
```

Includes unit tests for the FR-C2 registration validation rules and the
recommendation engine's time-of-day classifier.

---

## 9. End-to-end demo walkthrough

1. **Admin**: log in as `admin1` → `/admin/vendors` → approve `grocer`
2. **Customer**: log in as `alice` → browse `/customer` → open Mario's Pizza → add items, redeem 50 points → place order
3. **Vendor**: log in as `pizzaowner` → `/vendor/orders` → confirm → start preparing → mark ready
4. **Driver**: log in as `driver1` → `/driver` → accept the order → mark picked up → mark delivered
5. **Customer**: refresh `/customer/orders`, see "Delivered", click "Rate & review"
6. **Admin**: `/admin` to see the audit log update; `/admin/reports` for aggregates

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

---

*This codebase is the engineering deliverable for Submission 4 of the
COE416 Spring 2026 project.*
