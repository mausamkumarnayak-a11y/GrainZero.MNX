# GrainZero

> **Make Every Grain Count.**

GrainZero is a full-stack web application designed for Indian hostel messes to track, analyze, and eliminate food waste while providing students with automated meal-skipping credits and authorities with live mess management and analytics.


Sign up access code for authority sign in : GRAINZERO-ADMIN-2026
Authority Registered: tapashranjanbihari18@gmail.com
Password-Tapash@123
---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18 + Vite (Plain JavaScript), React Router v6 |
| **Backend** | Node.js + Express |
| **Authentication** | JWT (`jsonwebtoken`), bcrypt password hashing (`bcryptjs`) |
| **Database** | PostgreSQL (Neon-compatible, SSL enabled) via `pg` |
| **Styling** | Clean responsive modern green theme, mobile-collapsible navbars |
| **Assets** | Custom brand logo (`/grainzero-logo.png`) & cover banner (`/grainzero-cover.png`) |

---

## Features Built

### 1. Database Schema (`server/db.js`)
All tables are automatically verified and created on server startup. All currency values are stored as **integer paise** (e.g. ₹60.00 = `6000` paise):

- **`users`**: `id`, `name`, `email` (unique, lowercase), `password_hash`, `role` (`student` or `admin`), `created_at`
- **`settings`**: `id` (default 1), `wallet_percent` (default 30), `buffer_percent` (default 10), `mess_fee_paise` (default 600000 = ₹6,000) — pre-seeded with single row `id=1`
- **`meal_slots`**: `id`, `meal_type` (unique), `start_time`, `end_time`, `cutoff_time`, `cost_paise` — pre-seeded with defaults:
  - `breakfast` (07:30–09:00, cutoff 06:30, 3000 paise / ₹30)
  - `lunch` (12:30–14:00, cutoff 10:30, 6000 paise / ₹60)
  - `snacks` (17:00–18:00, cutoff 15:30, 2000 paise / ₹20)
  - `dinner` (19:30–21:00, cutoff 17:30, 6000 paise / ₹60)
- **`meals`**: `id`, `date`, `meal_type`, unique(`date`, `meal_type`)
- **`dishes`**: `id`, `meal_id` references `meals(id)` on delete cascade, `name`
- **`skips`**: `id`, `user_id` references `users(id)`, `meal_id` references `meals(id)`, `credit_paise`, `cancelled_at`, `created_at`, unique(`user_id`, `meal_id`)
- **`ratings`**: `id`, `user_id` references `users(id)`, `dish_id` references `dishes(id)`, `stars` (1–5), `comment`, `flagged` (default false), `flag_reason`, `created_at`, unique(`user_id`, `dish_id`)
- **`wallet_transactions`**: `id`, `user_id` references `users(id)`, `type`, `amount_paise`, `meal_id` references `meals(id)` null, `note`, `created_at`
- **`fee_invoices`**: `id`, `user_id` references `users(id)`, `session_name`, `fee_paise`, `wallet_applied_paise`, `final_due_paise`, `created_at`
- **`waste_logs`**: `id`, `meal_id` references `meals(id)`, `cooked_kg`, `leftover_kg`, `created_at`
- **`ai_reports`**: `id`, `dish_id` references `dishes(id)`, `summary`, `recommendation_pct`, `reason`, `created_at`

### 2. Authentication System (`/api/auth`)
- `POST /api/auth/signup`:
  - Validates `name`, `email` (lowercased), `password` (min 6 chars), and `role` (`student` or `admin`).
  - When `role === 'admin'`, requires matching `adminCode === process.env.ADMIN_SIGNUP_CODE` (returns 403 on invalid code).
  - Hashes passwords using `bcryptjs` (salt rounds: 10).
  - Issues signed 7-day JWT with `process.env.JWT_SECRET`.
- `POST /api/auth/login`:
  - Validates credentials and returns JWT token + user profile (`id`, `name`, `email`, `role`).
- `GET /api/auth/me`:
  - Validated via `requireAuth` middleware and returns the authenticated user.
- Middleware:
  - `requireAuth`: Verifies `Bearer <token>`.
  - `requireRole('admin' | 'student')`: Role-based route guard.

### 3. Demo Data Seeder (`POST /api/admin/seed`)
- Single database transaction with chunked multi-row inserts (~350 rows/query) for rapid execution on Neon.
- **Reset**: Removes prior demo entities (`ai_reports`, `fee_invoices`, `wallet_transactions`, `waste_logs`, `ratings`, `skips`, `dishes`, `meals`, and `@demo.grainzero.com` users) while preserving real user accounts, `settings`, and `meal_slots`.
- **40 Demo Students & 1 Admin**: Created with password `Demo@1234` (`student1@demo.grainzero.com` to `student40@demo.grainzero.com`, and `admin@demo.grainzero.com`).
- **16 Days of Menus**: 14 past days + Today + Tomorrow (64 meals total) across Indian mess dishes.
- **Key Dishes Guaranteed**: *Paneer Butter Masala*, *Lauki Sabzi*, *Aloo Gobi*, and *Bhindi Masala* each appear on at least 5 different days.
- **Ratings & Special Story**: Past meals receive realistic ratings from non-skipped students with English & Hinglish feedback. *Aloo Gobi* declines from ~4.1 stars on oldest days to ~2.2 on recent days with comments like *"too oily now"* and *"cold and soggy"*.
- **Spam Bot Story**: `spam.bot@demo.grainzero.com` posts 20 five-star ratings within 1 minute, auto-flagged (`flagged = true`, `flag_reason = 'More than 5 ratings within 1 minute from one user'`).
- **Skips & Wallet**: Dynamic skip rates (higher on Sunday dinner and early breakfast). Skipped students do not rate meals. 4 students receive cancelled skips with undo transaction history. Today and tomorrow have advance skips for live headcounts.
- **Waste Logs**: Calculated based on meal ratings (low-rated meals have 20–30% leftovers; loved meals have 4–8%).
- **Admin Dashboard UI**: "Demo tools" card with confirmation dialog, loading spinner, counts overview, and one-click copyable credentials.

---

## Configuration (`server/.env`)

Create `server/.env` with your environment values:

```env
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
JWT_SECRET=your_jwt_secret_here
ADMIN_SIGNUP_CODE=your_admin_signup_code_here
PORT=3001
```

---

## Commands to Run

### 1. Install Dependencies
```bash
npm run install:all
```

### 2. Build Frontend for Production
```bash
npm run build
```
*(Installs all dependencies and builds the production React bundle into `client/dist/`)*

### 3. Run Production Server
```bash
npm start
```
*(Starts Express backend on port 3001 or `$PORT`, connects to PostgreSQL, creates all tables, seeds default settings and meal slots, and serves the React frontend at http://localhost:3001)*

### 4. Development Mode (Hot-Reload)
Run these in separate terminal windows:

```bash
# Terminal 1: Backend server
npm run server
```

```bash
# Terminal 2: Vite dev server
npm run client
```
*(Dev frontend runs at http://localhost:5173 with API requests proxied to http://localhost:3001)*

---

## ☁️ Deployment Guide

### Option A: 1-Click Deploy on Render
1. Go to [Render Dashboard](https://dashboard.render.com/) > **New** > **Blueprint**.
2. Connect this repository (`mausamkumarnayak-a11y/GrainZero.MNX`).
3. Render will auto-detect [`render.yaml`](./render.yaml).
4. Set your Environment Variables:
   - `DATABASE_URL`: Your PostgreSQL connection string (e.g. Neon, Supabase, or AWS RDS with `?sslmode=require`)
   - `GEMINI_API_KEY`: Your Google Gemini API Key
   - `ADMIN_SIGNUP_CODE`: Access code for mess authority registration (default: `GRAIN-ADMIN-2026`)
5. Click **Apply** — Render runs `npm run build` and starts the app with zero downtime.

### Option B: Deploy on Railway
1. Go to [Railway Dashboard](https://railway.app/) > **New Project** > **Deploy from GitHub repo**.
2. Select `GrainZero.MNX`. Railway detects [`railway.json`](./railway.json) & [`Procfile`](./Procfile).
3. In **Variables**, add:
   - `DATABASE_URL`
   - `GEMINI_API_KEY`
   - `JWT_SECRET` (generate a random 32-character string)
   - `ADMIN_SIGNUP_CODE`
4. Deploy!

### Option C: Docker Container Deployment
Build and run anywhere with Docker:
```bash
# Build production image
docker build -t grainzero:latest .

# Run container
docker run -p 3001:3001 \
  -e DATABASE_URL="your_postgres_connection_string" \
  -e GEMINI_API_KEY="your_gemini_api_key" \
  -e JWT_SECRET="your_jwt_secret" \
  grainzero:latest
```

---

## Demo Accounts (After Loading Demo Data)

| Role | Email | Password |
|---|---|---|
| **Student** | `student1@demo.grainzero.com` | `Demo@1234` |
| **Authority** | `admin@demo.grainzero.com` | `Demo@1234` |
