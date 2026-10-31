const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requireRole } = require('../middleware/auth');
const { todayIST, nowIST, mealDateTimeIST } = require('../utils/time');
const { scanUser } = require('../services/suspicious');

// ── GET /api/student/today ──────────────────────────────────────────────────
router.get('/today', requireRole('student'), async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const todayStr = todayIST();
    const tomorrowStr = todayIST(1);

    // Get settings for wallet_percent
    const settingsRes = await pool.query('SELECT wallet_percent FROM settings WHERE id = 1');
    const walletPercent = settingsRes.rows[0]?.wallet_percent ?? 30;

    // Get slots for reference
    const slotsRes = await pool.query('SELECT * FROM meal_slots ORDER BY id ASC');
    const slotsMap = {};
    for (const s of slotsRes.rows) {
      slotsMap[s.meal_type] = s;
    }

    // Get meals for today and tomorrow
    const mealsRes = await pool.query(
      `SELECT m.id, m.date::text AS date, m.meal_type
       FROM meals m
       WHERE m.date IN ($1, $2)
       ORDER BY m.date ASC, m.id ASC`,
      [todayStr, tomorrowStr]
    );

    const mealIds = mealsRes.rows.map(m => m.id);

    // Dishes for these meals
    const dishesByMealId = {};
    if (mealIds.length > 0) {
      const dishesRes = await pool.query(
        `SELECT id, meal_id, name FROM dishes WHERE meal_id = ANY($1) ORDER BY id ASC`,
        [mealIds]
      );
      for (const d of dishesRes.rows) {
        if (!dishesByMealId[d.meal_id]) dishesByMealId[d.meal_id] = [];
        dishesByMealId[d.meal_id].push({ id: d.id, name: d.name });
      }
    }

    // Active skips for this student for these meals
    const skipsByMealId = {};
    if (mealIds.length > 0) {
      const skipsRes = await pool.query(
        `SELECT id, meal_id, credit_paise, created_at
         FROM skips
         WHERE user_id = $1 AND meal_id = ANY($2) AND cancelled_at IS NULL`,
        [studentId, mealIds]
      );
      for (const s of skipsRes.rows) {
        skipsByMealId[s.meal_id] = s;
      }
    }

    const now = nowIST();

    const result = mealsRes.rows.map(m => {
      // Format meal.date string nicely as YYYY-MM-DD
      const dateString = typeof m.date === 'string' ? m.date.slice(0, 10) : new Date(m.date).toISOString().slice(0, 10);
      const slot = slotsMap[m.meal_type] || {};
      const cutoffMoment = mealDateTimeIST(dateString, slot.cutoff_time || '00:00');
      const cutoffPassed = cutoffMoment ? (now.getTime() >= cutoffMoment.getTime()) : true;
      const secondsLeft = cutoffMoment ? Math.max(0, Math.floor((cutoffMoment.getTime() - now.getTime()) / 1000)) : 0;

      const activeSkip = skipsByMealId[m.id] || null;
      const skipped = !!activeSkip;

      const estimatedCredit = Math.floor(((slot.cost_paise || 0) * walletPercent) / 100);
      const creditPaise = skipped ? activeSkip.credit_paise : estimatedCredit;

      return {
        id: m.id,
        date: dateString,
        meal_type: m.meal_type,
        cost_paise: slot.cost_paise || 0,
        start_time: slot.start_time,
        end_time: slot.end_time,
        cutoff_time: slot.cutoff_time,
        cutoff_datetime: cutoffMoment ? cutoffMoment.toISOString() : null,
        dishes: dishesByMealId[m.id] || [],
        skipped,
        skip_id: activeSkip ? activeSkip.id : null,
        credit_paise: creditPaise,
        canSkip: !cutoffPassed,
        seconds_left: secondsLeft
      };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/student/skips ─────────────────────────────────────────────────
router.post('/skips', requireRole('student'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const studentId = req.user.id;
    const { meal_id } = req.body;

    if (!meal_id) {
      return res.status(400).json({ error: 'meal_id is required.' });
    }

    await client.query('BEGIN');

    // 1. Fetch meal and slot info
    const mealRes = await pool.query(
      `SELECT m.id, m.date::text AS date, m.meal_type, s.cutoff_time, s.cost_paise
       FROM meals m
       JOIN meal_slots s ON m.meal_type = s.meal_type
       WHERE m.id = $1`,
      [meal_id]
    );

    if (mealRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Meal not found.' });
    }

    const meal = mealRes.rows[0];
    const dateString = meal.date;

    // 2. Check cutoff datetime
    const cutoffMoment = mealDateTimeIST(dateString, meal.cutoff_time);
    if (nowIST().getTime() >= cutoffMoment.getTime()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cutoff time has passed for this meal' });
    }

    // 3. Check existing skip
    const existingSkip = await client.query(
      'SELECT id, cancelled_at FROM skips WHERE user_id = $1 AND meal_id = $2 FOR UPDATE',
      [studentId, meal_id]
    );

    if (existingSkip.rows.length > 0 && existingSkip.rows[0].cancelled_at === null) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'You have already skipped this meal.' });
    }

    // 4. Calculate credit_paise
    const settingsRes = await client.query('SELECT wallet_percent FROM settings WHERE id = 1');
    const walletPercent = settingsRes.rows[0]?.wallet_percent ?? 30;
    const creditPaise = Math.floor((meal.cost_paise * walletPercent) / 100);

    let skip;
    // 5. If cancelled skip exists, reactivate it to avoid unique constraint violation
    if (existingSkip.rows.length > 0) {
      const updateRes = await client.query(
        `UPDATE skips
         SET cancelled_at = NULL,
             credit_paise = $1,
             created_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [creditPaise, existingSkip.rows[0].id]
      );
      skip = updateRes.rows[0];
    } else {
      const insertRes = await client.query(
        `INSERT INTO skips (user_id, meal_id, credit_paise, cancelled_at, created_at)
         VALUES ($1, $2, $3, NULL, NOW())
         RETURNING *`,
        [studentId, meal_id, creditPaise]
      );
      skip = insertRes.rows[0];
    }

    // 6. Insert wallet transaction
    await client.query(
      `INSERT INTO wallet_transactions (user_id, type, amount_paise, meal_id, note, created_at)
       VALUES ($1, 'skip_credit', $2, $3, $4, NOW())`,
      [studentId, creditPaise, meal_id, `Skip credit: ${meal.meal_type} (${dateString})`]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Meal skipped successfully. Credit added to your wallet.',
      skip,
      credit_paise: creditPaise
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ── DELETE /api/student/skips/:meal_id (undo skip) ──────────────────────────
router.delete('/skips/:meal_id', requireRole('student'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const studentId = req.user.id;
    const mealId = parseInt(req.params.meal_id, 10);

    if (isNaN(mealId)) {
      return res.status(400).json({ error: 'Invalid meal ID.' });
    }

    await client.query('BEGIN');

    // 1. Fetch meal and slot info
    const mealRes = await client.query(
      `SELECT m.id, m.date::text AS date, m.meal_type, s.cutoff_time
       FROM meals m
       JOIN meal_slots s ON m.meal_type = s.meal_type
       WHERE m.id = $1`,
      [mealId]
    );

    if (mealRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Meal not found.' });
    }

    const meal = mealRes.rows[0];
    const dateString = meal.date;

    // 2. Check cutoff
    const cutoffMoment = mealDateTimeIST(dateString, meal.cutoff_time);
    if (nowIST().getTime() >= cutoffMoment.getTime()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cutoff time has passed for this meal' });
    }

    // 3. Find active skip
    const skipRes = await client.query(
      'SELECT id, credit_paise FROM skips WHERE user_id = $1 AND meal_id = $2 AND cancelled_at IS NULL FOR UPDATE',
      [studentId, mealId]
    );

    if (skipRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No active skip found for this meal.' });
    }

    const skip = skipRes.rows[0];

    // 4. Set cancelled_at
    await client.query(
      'UPDATE skips SET cancelled_at = NOW() WHERE id = $1',
      [skip.id]
    );

    // 5. Insert skip_reversal transaction of minus credit_paise
    await client.query(
      `INSERT INTO wallet_transactions (user_id, type, amount_paise, meal_id, note, created_at)
       VALUES ($1, 'skip_reversal', $2, $3, $4, NOW())`,
      [studentId, -skip.credit_paise, mealId, `Skip reversal: ${meal.meal_type} (${dateString})`]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Skip cancelled and credit reversed successfully.'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ── GET /api/student/wallet ─────────────────────────────────────────────────
router.get('/wallet', requireRole('student'), async (req, res, next) => {
  try {
    const studentId = req.user.id;

    // Balance
    const balanceRes = await pool.query(
      `SELECT COALESCE(SUM(amount_paise), 0) AS balance_paise
       FROM wallet_transactions
       WHERE user_id = $1`,
      [studentId]
    );
    const balancePaise = parseInt(balanceRes.rows[0].balance_paise, 10) || 0;

    // Total skipped meals (active)
    const skipsRes = await pool.query(
      `SELECT COUNT(*)::int AS total_skipped
       FROM skips
       WHERE user_id = $1 AND cancelled_at IS NULL`,
      [studentId]
    );
    const totalSkippedMeals = skipsRes.rows[0].total_skipped || 0;

    // Mess fee from settings
    const settingsRes = await pool.query('SELECT mess_fee_paise FROM settings WHERE id = 1');
    const messFeePaise = settingsRes.rows[0]?.mess_fee_paise ?? 600000;

    // estimated_due_paise = max(mess_fee_paise - max(balance, 0), 0)
    const effectiveBalance = Math.max(balancePaise, 0);
    const estimatedDuePaise = Math.max(messFeePaise - effectiveBalance, 0);

    // Transactions newest first, joined with meal info
    const txRes = await pool.query(
      `SELECT wt.id, wt.type, wt.amount_paise, wt.meal_id, wt.note, wt.created_at,
              m.date AS meal_date, m.meal_type
       FROM wallet_transactions wt
       LEFT JOIN meals m ON wt.meal_id = m.id
       WHERE wt.user_id = $1
       ORDER BY wt.created_at DESC, wt.id DESC`,
      [studentId]
    );

    res.json({
      balance_paise: balancePaise,
      total_skipped_meals: totalSkippedMeals,
      mess_fee_paise: messFeePaise,
      estimated_due_paise: estimatedDuePaise,
      transactions: txRes.rows
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/student/invoices ───────────────────────────────────────────────
router.get('/invoices', requireRole('student'), async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const result = await pool.query(
      `SELECT id, session_name, fee_paise, wallet_applied_paise, final_due_paise, created_at
       FROM fee_invoices
       WHERE user_id = $1
       ORDER BY created_at DESC, id DESC`,
      [studentId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/student/rate ───────────────────────────────────────────────────
// Meals from the last 2 days whose end time has passed and which this student did not skip,
// with dishes and the student's existing rating.
router.get('/rate', requireRole('student'), async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const today = todayIST();
    const yesterday = todayIST(-1);
    const dayBefore = todayIST(-2);
    const now = nowIST();

    // Fetch meal slots
    const slotsRes = await pool.query('SELECT * FROM meal_slots');
    const slotsMap = {};
    for (const s of slotsRes.rows) slotsMap[s.meal_type] = s;

    // Fetch meals in last 2 days
    const mealsRes = await pool.query(
      `SELECT m.id, m.date::text AS date, m.meal_type
       FROM meals m
       WHERE m.date IN ($1, $2, $3)
       ORDER BY m.date DESC, m.id DESC`,
      [today, yesterday, dayBefore]
    );

    // Active skips for this student
    const skipsRes = await pool.query(
      `SELECT meal_id FROM skips WHERE user_id = $1 AND cancelled_at IS NULL`,
      [studentId]
    );
    const skippedMealIds = new Set(skipsRes.rows.map(s => s.meal_id));

    // Filter meals whose end time has passed and student didn't skip
    const endedUnskippedMeals = mealsRes.rows.filter(m => {
      if (skippedMealIds.has(m.id)) return false;
      const slot = slotsMap[m.meal_type];
      if (!slot) return false;
      const endMoment = mealDateTimeIST(m.date, slot.end_time);
      return endMoment <= now;
    });

    if (endedUnskippedMeals.length === 0) {
      return res.json([]);
    }

    const mIds = endedUnskippedMeals.map(m => m.id);

    // Fetch dishes
    const dishesRes = await pool.query(
      `SELECT id, meal_id, name FROM dishes WHERE meal_id = ANY($1) ORDER BY id ASC`,
      [mIds]
    );

    // Fetch student's ratings for these dishes
    const dIds = dishesRes.rows.map(d => d.id);
    const ratingsMap = {};
    if (dIds.length > 0) {
      const rRes = await pool.query(
        `SELECT dish_id, stars, comment, created_at FROM ratings WHERE user_id = $1 AND dish_id = ANY($2)`,
        [studentId, dIds]
      );
      for (const r of rRes.rows) {
        ratingsMap[r.dish_id] = r;
      }
    }

    const dishesByMeal = {};
    for (const d of dishesRes.rows) {
      if (!dishesByMeal[d.meal_id]) dishesByMeal[d.meal_id] = [];
      dishesByMeal[d.meal_id].push({
        id: d.id,
        name: d.name,
        userRating: ratingsMap[d.id] || null
      });
    }

    const response = endedUnskippedMeals.map(m => ({
      id: m.id,
      date: m.date,
      meal_type: m.meal_type,
      slot: slotsMap[m.meal_type] || null,
      dishes: dishesByMeal[m.id] || []
    }));

    res.json(response);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/student/ratings ───────────────────────────────────────────────
// { dish_id, stars 1-5, comment max 300 } upsert on (user_id, dish_id)
// Reject if the meal has not ended or the student skipped it; then run scanUser.
router.post('/ratings', requireRole('student'), async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const { dish_id, stars, comment } = req.body;

    const starVal = parseInt(stars, 10);
    if (!starVal || starVal < 1 || starVal > 5) {
      return res.status(400).json({ error: 'Stars must be an integer between 1 and 5.' });
    }

    const cleanComment = typeof comment === 'string' ? comment.trim().slice(0, 300) : null;

    // Find dish and its meal
    const dishRes = await pool.query(
      `SELECT d.id AS dish_id, d.name AS dish_name, m.id AS meal_id, m.date::text AS date, m.meal_type
       FROM dishes d
       JOIN meals m ON d.meal_id = m.id
       WHERE d.id = $1`,
      [dish_id]
    );

    if (dishRes.rows.length === 0) {
      return res.status(404).json({ error: 'Dish not found.' });
    }

    const dish = dishRes.rows[0];

    // Check meal end time
    const slotRes = await pool.query('SELECT end_time FROM meal_slots WHERE meal_type = $1', [dish.meal_type]);
    const slot = slotRes.rows[0];
    if (slot) {
      const endMoment = mealDateTimeIST(dish.date, slot.end_time);
      if (nowIST() < endMoment) {
        return res.status(400).json({ error: 'Cannot rate a meal before it has finished.' });
      }
    }

    // Check if student skipped this meal
    const skipCheck = await pool.query(
      'SELECT id FROM skips WHERE user_id = $1 AND meal_id = $2 AND cancelled_at IS NULL',
      [studentId, dish.meal_id]
    );
    if (skipCheck.rows.length > 0) {
      return res.status(403).json({ error: 'You skipped this meal and cannot rate its dishes.' });
    }

    // Upsert rating
    const upsertRes = await pool.query(
      `INSERT INTO ratings (user_id, dish_id, stars, comment, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, dish_id)
       DO UPDATE SET stars = EXCLUDED.stars, comment = EXCLUDED.comment, created_at = NOW()
       RETURNING *`,
      [studentId, dish.dish_id, starVal, cleanComment]
    );

    // Run suspicious scan for this user
    try {
      await scanUser(studentId);
    } catch (e) {
      console.error('scanUser err:', e.message);
    }

    res.status(201).json({
      success: true,
      rating: upsertRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/student/dish-ratings ───────────────────────────────────────────
// Average stars per dish name (unflagged only)
router.get('/dish-ratings', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT d.name,
             ROUND(AVG(r.stars)::numeric, 1) AS avg_stars,
             COUNT(r.id)::int AS count
      FROM ratings r
      JOIN dishes d ON r.dish_id = d.id
      WHERE r.flagged = false
      GROUP BY d.name
      ORDER BY d.name ASC
    `);

    const ratingsMap = {};
    for (const row of result.rows) {
      ratingsMap[row.name] = {
        avg_stars: parseFloat(row.avg_stars) || 0,
        count: row.count
      };
    }

    res.json(ratingsMap);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
