const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Drop legacy tables (held only sample data) ──────────────────────
    await client.query('DROP TABLE IF EXISTS waste_logs CASCADE');
    await client.query('DROP TABLE IF EXISTS ratings   CASCADE');
    await client.query('DROP TABLE IF EXISTS meals     CASCADE');
    await client.query('DROP TABLE IF EXISTS ai_cache  CASCADE');

    // ── Users ────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id           SERIAL PRIMARY KEY,
        name         TEXT NOT NULL,
        email        TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role         TEXT NOT NULL CHECK (role IN ('student','admin')),
        created_at   TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── Settings (singleton row, id=1) ───────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id              INT PRIMARY KEY DEFAULT 1,
        wallet_percent  INT DEFAULT 30,
        buffer_percent  INT DEFAULT 10,
        mess_fee_paise  INT DEFAULT 600000
      )
    `);
    await client.query(`
      INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING
    `);

    // ── Meal slots ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS meal_slots (
        id          SERIAL PRIMARY KEY,
        meal_type   TEXT UNIQUE NOT NULL,
        start_time  TEXT NOT NULL,
        end_time    TEXT NOT NULL,
        cutoff_time TEXT NOT NULL,
        cost_paise  INT  NOT NULL
      )
    `);
    await client.query(`
      INSERT INTO meal_slots (meal_type, start_time, end_time, cutoff_time, cost_paise) VALUES
        ('breakfast', '07:30', '09:00', '06:30', 3000),
        ('lunch',     '12:30', '14:00', '10:30', 6000),
        ('snacks',    '17:00', '18:00', '15:30', 2000),
        ('dinner',    '19:30', '21:00', '17:30', 6000)
      ON CONFLICT (meal_type) DO NOTHING
    `);

    // ── Meals ────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS meals (
        id         SERIAL PRIMARY KEY,
        date       DATE NOT NULL,
        meal_type  TEXT NOT NULL,
        UNIQUE (date, meal_type)
      )
    `);

    // ── Dishes ───────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS dishes (
        id      SERIAL PRIMARY KEY,
        meal_id INT  NOT NULL REFERENCES meals (id) ON DELETE CASCADE,
        name    TEXT NOT NULL
      )
    `);

    // ── Skips ────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS skips (
        id           SERIAL PRIMARY KEY,
        user_id      INT  NOT NULL REFERENCES users (id),
        meal_id      INT  NOT NULL REFERENCES meals (id),
        credit_paise INT  NOT NULL,
        cancelled_at TIMESTAMP DEFAULT NULL,
        created_at   TIMESTAMP DEFAULT NOW(),
        UNIQUE (user_id, meal_id)
      )
    `);

    // ── Ratings ──────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ratings (
        id          SERIAL PRIMARY KEY,
        user_id     INT  NOT NULL REFERENCES users (id),
        dish_id     INT  NOT NULL REFERENCES dishes (id),
        stars       INT  NOT NULL CHECK (stars BETWEEN 1 AND 5),
        comment     TEXT,
        flagged     BOOLEAN DEFAULT FALSE,
        flag_reason TEXT,
        created_at  TIMESTAMP DEFAULT NOW(),
        UNIQUE (user_id, dish_id)
      )
    `);

    // ── Wallet transactions ──────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id           SERIAL PRIMARY KEY,
        user_id      INT  NOT NULL REFERENCES users (id),
        type         TEXT NOT NULL,
        amount_paise INT  NOT NULL,
        meal_id      INT  REFERENCES meals (id),
        note         TEXT,
        created_at   TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── Fee invoices ─────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS fee_invoices (
        id                  SERIAL PRIMARY KEY,
        user_id             INT  NOT NULL REFERENCES users (id),
        session_name        TEXT NOT NULL,
        fee_paise           INT  NOT NULL,
        wallet_applied_paise INT NOT NULL DEFAULT 0,
        final_due_paise     INT  NOT NULL,
        created_at          TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── Waste logs ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS waste_logs (
        id          SERIAL PRIMARY KEY,
        meal_id     INT  NOT NULL REFERENCES meals (id),
        cooked_kg   NUMERIC NOT NULL,
        leftover_kg NUMERIC NOT NULL,
        created_at  TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── AI reports ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_reports (
        id                 SERIAL PRIMARY KEY,
        dish_id            INT REFERENCES dishes (id),
        dish_name          TEXT,
        stats              JSONB,
        kind               TEXT DEFAULT 'dish',
        summary            TEXT,
        recommendation_pct INT,
        reason             TEXT,
        created_at         TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`
      ALTER TABLE ai_reports ADD COLUMN IF NOT EXISTS dish_name TEXT;
      ALTER TABLE ai_reports ADD COLUMN IF NOT EXISTS stats JSONB;
      ALTER TABLE ai_reports ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'dish';
      ALTER TABLE ai_reports ALTER COLUMN dish_id DROP NOT NULL;
    `);

    await client.query('COMMIT');
    console.log('✅  Database schema ready');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌  initDb failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, initDb };
