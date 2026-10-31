const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requireRole } = require('../middleware/auth');
const { todayIST } = require('../utils/time');

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// ── GET /api/admin/headcount?date=YYYY-MM-DD ────────────────────────────────
router.get('/headcount', requireRole('admin'), async (req, res, next) => {
  try {
    const date = req.query.date || todayIST();
    if (!DATE_REGEX.test(date)) {
      return res.status(400).json({ error: 'Date must be in YYYY-MM-DD format.' });
    }

    // 1. Buffer percent from settings
    const settingsRes = await pool.query('SELECT buffer_percent FROM settings WHERE id = 1');
    const bufferPercent = settingsRes.rows[0]?.buffer_percent ?? 10;

    // 2. Total eligible students (excluding spam.bot)
    const studentsRes = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM users
       WHERE role = 'student' AND email NOT LIKE 'spam.bot%'`
    );
    const totalStudents = studentsRes.rows[0]?.total || 0;

    // 3. Get slots
    const slotsRes = await pool.query('SELECT * FROM meal_slots ORDER BY id ASC');

    // 4. Get meals on this date
    const mealsRes = await pool.query(
      `SELECT id, date::text AS date, meal_type FROM meals WHERE date = $1`,
      [date]
    );
    const mealMap = {};
    for (const m of mealsRes.rows) {
      mealMap[m.meal_type] = m;
    }

    const mealIds = mealsRes.rows.map(m => m.id);

    // 5. Active skips per meal
    const skipsByMeal = {};
    if (mealIds.length > 0) {
      const skipsRes = await pool.query(
        `SELECT meal_id,
                COUNT(*)::int AS skipped_count,
                COALESCE(SUM(credit_paise), 0)::int AS credited_paise
         FROM skips
         WHERE meal_id = ANY($1) AND cancelled_at IS NULL
         GROUP BY meal_id`,
        [mealIds]
      );
      for (const row of skipsRes.rows) {
        skipsByMeal[row.meal_id] = {
          skipped: row.skipped_count,
          money_credited_paise: row.credited_paise
        };
      }
    }

    const mealsHeadcount = slotsRes.rows.map(slot => {
      const meal = mealMap[slot.meal_type] || null;
      const skipData = meal ? (skipsByMeal[meal.id] || { skipped: 0, money_credited_paise: 0 }) : { skipped: 0, money_credited_paise: 0 };
      const skipped = skipData.skipped;
      const expected = Math.max(0, totalStudents - skipped);
      const prepareFor = Math.ceil(expected * (1 + bufferPercent / 100));

      return {
        meal_id: meal ? meal.id : null,
        date,
        meal_type: slot.meal_type,
        start_time: slot.start_time,
        end_time: slot.end_time,
        total_students: totalStudents,
        skipped,
        expected,
        buffer_percent: bufferPercent,
        prepare_for: prepareFor,
        saved_plates: skipped,
        money_credited_paise: skipData.money_credited_paise
      };
    });

    res.json({
      date,
      total_students: totalStudents,
      buffer_percent: bufferPercent,
      meals: mealsHeadcount
    });
  } catch (err) {
    next(err);
  }
});

// Helper to fetch skip log data
async function getSkipLogData(date, mealType) {
  // 1. Settings & total students
  const settingsRes = await pool.query('SELECT buffer_percent FROM settings WHERE id = 1');
  const bufferPercent = settingsRes.rows[0]?.buffer_percent ?? 10;

  const studentsRes = await pool.query(
    `SELECT id, name, email
     FROM users
     WHERE role = 'student' AND email NOT LIKE 'spam.bot%'
     ORDER BY name ASC`
  );
  const allStudents = studentsRes.rows;
  const totalStudents = allStudents.length;

  // 2. Find meal
  const mealRes = await pool.query(
    `SELECT m.id, m.date::text AS date, m.meal_type, s.cost_paise, s.cutoff_time
     FROM meals m
     JOIN meal_slots s ON m.meal_type = s.meal_type
     WHERE m.date = $1 AND m.meal_type = $2`,
    [date, mealType]
  );

  if (mealRes.rows.length === 0) {
    return {
      meal: null,
      total_students: totalStudents,
      skipped: 0,
      expected: totalStudents,
      buffer_percent: bufferPercent,
      prepare_for: Math.ceil(totalStudents * (1 + bufferPercent / 100)),
      saved_plates: 0,
      money_credited_paise: 0,
      skipping: [],
      attending: allStudents
    };
  }

  const meal = mealRes.rows[0];

  // 3. Active skips with student details
  const skipsRes = await pool.query(
    `SELECT s.id AS skip_id, s.user_id, s.credit_paise, s.created_at,
            u.name, u.email
     FROM skips s
     JOIN users u ON s.user_id = u.id
     WHERE s.meal_id = $1 AND s.cancelled_at IS NULL
     ORDER BY s.created_at ASC`,
    [meal.id]
  );

  const skippingUsersMap = {};
  const skipping = skipsRes.rows.map(r => {
    skippingUsersMap[r.user_id] = true;
    return {
      user_id: r.user_id,
      name: r.name,
      email: r.email,
      credit_paise: r.credit_paise,
      created_at: r.created_at
    };
  });

  const attending = allStudents.filter(u => !skippingUsersMap[u.id]);
  const skippedCount = skipping.length;
  const expected = Math.max(0, totalStudents - skippedCount);
  const prepareFor = Math.ceil(expected * (1 + bufferPercent / 100));
  const moneyCredited = skipping.reduce((sum, s) => sum + s.credit_paise, 0);

  return {
    meal,
    total_students: totalStudents,
    skipped: skippedCount,
    expected,
    buffer_percent: bufferPercent,
    prepare_for: prepareFor,
    saved_plates: skippedCount,
    money_credited_paise: moneyCredited,
    skipping,
    attending
  };
}

// ── GET /api/admin/skip-log?date=&meal_type= ────────────────────────────────
router.get('/skip-log', requireRole('admin'), async (req, res, next) => {
  try {
    const date = req.query.date || todayIST();
    const mealType = req.query.meal_type || 'lunch';

    if (!DATE_REGEX.test(date)) {
      return res.status(400).json({ error: 'Date must be in YYYY-MM-DD format.' });
    }

    const data = await getSkipLogData(date, mealType);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/skip-log.csv?date=&meal_type= ────────────────────────────
router.get('/skip-log.csv', requireRole('admin'), async (req, res, next) => {
  try {
    const date = req.query.date || todayIST();
    const mealType = req.query.meal_type || 'lunch';

    if (!DATE_REGEX.test(date)) {
      return res.status(400).json({ error: 'Date must be in YYYY-MM-DD format.' });
    }

    const data = await getSkipLogData(date, mealType);

    // Generate CSV
    const rows = [
      ['Status', 'Student Name', 'Email', 'Credit (Paise)', 'Credit (INR)', 'Logged At']
    ];

    for (const s of data.skipping) {
      const inr = (s.credit_paise / 100).toFixed(2);
      const loggedAt = s.created_at ? new Date(s.created_at).toISOString() : '';
      rows.push(['Skipping', `"${s.name.replace(/"/g, '""')}"`, s.email, s.credit_paise, inr, loggedAt]);
    }

    for (const a of data.attending) {
      rows.push(['Attending', `"${a.name.replace(/"/g, '""')}"`, a.email, 0, '0.00', '-']);
    }

    const csvContent = rows.map(r => r.join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="skip-log-${date}-${mealType}.csv"`);
    res.send(csvContent);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/waste ───────────────────────────────────────────────────
router.post('/waste', requireRole('admin'), async (req, res, next) => {
  try {
    const { meal_id, cooked_kg, leftover_kg } = req.body;

    if (!meal_id) {
      return res.status(400).json({ error: 'meal_id is required.' });
    }

    const cooked = Number(cooked_kg);
    const leftover = Number(leftover_kg);

    if (isNaN(cooked) || cooked < 0) {
      return res.status(400).json({ error: 'cooked_kg must be a non-negative number.' });
    }
    if (isNaN(leftover) || leftover < 0) {
      return res.status(400).json({ error: 'leftover_kg must be a non-negative number.' });
    }

    if (leftover > cooked) {
      return res.status(400).json({ error: 'leftover_kg cannot be greater than cooked_kg.' });
    }

    // Verify meal exists
    const mealCheck = await pool.query('SELECT id, date, meal_type FROM meals WHERE id = $1', [meal_id]);
    if (mealCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Meal not found.' });
    }

    // Update if log for this meal already exists, else insert
    const existing = await pool.query('SELECT id FROM waste_logs WHERE meal_id = $1', [meal_id]);
    let log;

    if (existing.rows.length > 0) {
      const updateRes = await pool.query(
        `UPDATE waste_logs
         SET cooked_kg = $1,
             leftover_kg = $2,
             created_at = NOW()
         WHERE meal_id = $3
         RETURNING *`,
        [cooked, leftover, meal_id]
      );
      log = updateRes.rows[0];
    } else {
      const insertRes = await pool.query(
        `INSERT INTO waste_logs (meal_id, cooked_kg, leftover_kg, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING *`,
        [meal_id, cooked, leftover]
      );
      log = insertRes.rows[0];
    }

    res.status(201).json({
      success: true,
      message: 'Waste log saved successfully.',
      waste_log: log
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/waste-summary ────────────────────────────────────────────
router.get('/waste-summary', requireRole('admin'), async (req, res, next) => {
  try {
    const endDate = todayIST();
    const startDate = todayIST(-13); // 14-day window

    // Daily waste aggregation
    const dailyRes = await pool.query(
      `SELECT m.date::text AS date,
              ROUND(SUM(w.cooked_kg)::numeric, 1) AS cooked_kg,
              ROUND(SUM(w.leftover_kg)::numeric, 1) AS leftover_kg
       FROM waste_logs w
       JOIN meals m ON w.meal_id = m.id
       WHERE m.date >= $1 AND m.date <= $2
       GROUP BY m.date
       ORDER BY m.date ASC`,
      [startDate, endDate]
    );

    let totalCooked = 0;
    let totalLeftover = 0;

    const daily = dailyRes.rows.map(row => {
      const c = parseFloat(row.cooked_kg) || 0;
      const l = parseFloat(row.leftover_kg) || 0;
      totalCooked += c;
      totalLeftover += l;

      const dateStr = row.date;
      const pct = c > 0 ? Number(((l / c) * 100).toFixed(1)) : 0;
      const rupees = Number((l * 60).toFixed(2)); // Rs 60 per kg

      return {
        date: dateStr,
        cooked_kg: c,
        leftover_kg: l,
        leftover_percent: pct,
        wasted_rupees: rupees
      };
    });

    const overallPct = totalCooked > 0 ? Number(((totalLeftover / totalCooked) * 100).toFixed(1)) : 0;
    const totalRupees = Number((totalLeftover * 60).toFixed(2));

    // Unlogged meals in this 14-day window
    const unloggedRes = await pool.query(
      `SELECT m.id, m.date::text AS date, m.meal_type
       FROM meals m
       LEFT JOIN waste_logs w ON m.id = w.meal_id
       WHERE m.date >= $1 AND m.date <= $2 AND w.id IS NULL
       ORDER BY m.date DESC, m.id DESC`,
      [startDate, endDate]
    );

    const unloggedMeals = unloggedRes.rows.map(m => ({
      id: m.id,
      date: m.date,
      meal_type: m.meal_type
    }));

    res.json({
      startDate,
      endDate,
      daily,
      totals: {
        total_cooked_kg: Number(totalCooked.toFixed(1)),
        total_leftover_kg: Number(totalLeftover.toFixed(1)),
        overall_leftover_percent: overallPct,
        total_wasted_rupees: totalRupees
      },
      unlogged_meals: unloggedMeals
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/fees/generate ───────────────────────────────────────────
router.post('/fees/generate', requireRole('admin'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { session_name } = req.body;

    if (!session_name || typeof session_name !== 'string' || !session_name.trim()) {
      return res.status(400).json({ error: 'session_name is required (e.g. "November 2026").' });
    }

    const session = session_name.trim();

    await client.query('BEGIN');

    // 1. Get mess fee from settings
    const settingsRes = await client.query('SELECT mess_fee_paise FROM settings WHERE id = 1');
    const messFeePaise = settingsRes.rows[0]?.mess_fee_paise ?? 600000;

    // 2. Get all students (not spam bot)
    const studentsRes = await client.query(
      `SELECT id, name, email
       FROM users
       WHERE role = 'student' AND email NOT LIKE 'spam.bot%'
       ORDER BY id ASC`
    );
    const students = studentsRes.rows;

    let generatedCount = 0;
    let skippedCount = 0;

    for (const student of students) {
      // Check if invoice already exists for this student and session
      const existing = await client.query(
        'SELECT id FROM fee_invoices WHERE user_id = $1 AND session_name = $2',
        [student.id, session]
      );

      if (existing.rows.length > 0) {
        skippedCount++;
        continue;
      }

      // Calculate balance from wallet transactions
      const balanceRes = await client.query(
        'SELECT COALESCE(SUM(amount_paise), 0)::int AS balance FROM wallet_transactions WHERE user_id = $1',
        [student.id]
      );
      const currentBalance = balanceRes.rows[0].balance;

      // applied = min(max(balance, 0), mess_fee_paise)
      const applied = Math.min(Math.max(currentBalance, 0), messFeePaise);
      const finalDue = messFeePaise - applied;

      // Insert fee invoice
      await client.query(
        `INSERT INTO fee_invoices (user_id, session_name, fee_paise, wallet_applied_paise, final_due_paise, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [student.id, session, messFeePaise, applied, finalDue]
      );

      // Deduct applied from wallet
      if (applied > 0) {
        await client.query(
          `INSERT INTO wallet_transactions (user_id, type, amount_paise, meal_id, note, created_at)
           VALUES ($1, 'fee_deduction', $2, NULL, $3, NOW())`,
          [student.id, -applied, `Applied to fee invoice: ${session}`]
        );
      }

      generatedCount++;
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      session_name: session,
      mess_fee_paise: messFeePaise,
      generated_count: generatedCount,
      skipped_count: skippedCount,
      total_students: students.length
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ── GET /api/admin/fees ─────────────────────────────────────────────────────
router.get('/fees', requireRole('admin'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT f.id, f.user_id, u.name AS student_name, u.email AS student_email,
              f.session_name, f.fee_paise, f.wallet_applied_paise, f.final_due_paise, f.created_at
       FROM fee_invoices f
       JOIN users u ON f.user_id = u.id
       ORDER BY f.created_at DESC, f.id DESC`
    );

    let totalFee = 0;
    let totalApplied = 0;
    let totalDue = 0;

    for (const inv of result.rows) {
      totalFee += inv.fee_paise || 0;
      totalApplied += inv.wallet_applied_paise || 0;
      totalDue += inv.final_due_paise || 0;
    }

    res.json({
      invoices: result.rows,
      totals: {
        total_invoices: result.rows.length,
        total_fee_paise: totalFee,
        total_wallet_applied_paise: totalApplied,
        total_final_due_paise: totalDue
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
