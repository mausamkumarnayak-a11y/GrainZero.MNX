const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { todayIST } = require('../utils/time');

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const VALID_MEAL_TYPES = ['breakfast', 'lunch', 'snacks', 'dinner'];

// ── GET /api/menu?date=YYYY-MM-DD (any logged-in user) ───────────────────────
router.get('/menu', requireAuth, async (req, res, next) => {
  try {
    const date = req.query.date || todayIST();

    if (!DATE_REGEX.test(date)) {
      return res.status(400).json({ error: 'Date must be in YYYY-MM-DD format.' });
    }

    // Get all 4 slots in order
    const slotsRes = await pool.query('SELECT * FROM meal_slots ORDER BY id ASC');
    const slots = slotsRes.rows;

    // Get meals for this date
    const mealsRes = await pool.query(
      `SELECT m.id, m.date::text AS date, m.meal_type
       FROM meals m
       WHERE m.date = $1`,
      [date]
    );

    const mealMap = {};
    const mealIds = [];
    for (const m of mealsRes.rows) {
      mealMap[m.meal_type] = m;
      mealIds.push(m.id);
    }

    // Get all dishes for these meals
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

    // Combine into slots order
    const response = slots.map(slot => {
      const meal = mealMap[slot.meal_type] || null;
      return {
        id: meal ? meal.id : null,
        date,
        meal_type: slot.meal_type,
        start_time: slot.start_time,
        end_time: slot.end_time,
        cutoff_time: slot.cutoff_time,
        cost_paise: slot.cost_paise,
        dishes: meal ? (dishesByMealId[meal.id] || []) : []
      };
    });

    res.json(response);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/meals (admin: creates or replaces dishes of that meal) ───
router.post('/admin/meals', requireRole('admin'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { date, meal_type, dishes } = req.body;

    if (!date || !meal_type) {
      return res.status(400).json({ error: 'date and meal_type are required.' });
    }

    if (!DATE_REGEX.test(date)) {
      return res.status(400).json({ error: 'date must be in YYYY-MM-DD format.' });
    }

    if (!VALID_MEAL_TYPES.includes(meal_type)) {
      return res.status(400).json({ error: `meal_type must be one of: ${VALID_MEAL_TYPES.join(', ')}` });
    }

    if (!Array.isArray(dishes)) {
      return res.status(400).json({ error: 'dishes must be an array of dish names.' });
    }

    await client.query('BEGIN');

    // 1. Upsert meal
    const mealRes = await client.query(
      `INSERT INTO meals (date, meal_type)
       VALUES ($1, $2)
       ON CONFLICT (date, meal_type) DO UPDATE SET date = EXCLUDED.date
       RETURNING *`,
      [date, meal_type]
    );
    const meal = mealRes.rows[0];

    // 2. Delete existing dishes
    await client.query('DELETE FROM dishes WHERE meal_id = $1', [meal.id]);

    // 3. Insert new dishes
    const insertedDishes = [];
    for (const d of dishes) {
      const trimmed = typeof d === 'string' ? d.trim() : '';
      if (trimmed) {
        const dishRes = await client.query(
          `INSERT INTO dishes (meal_id, name) VALUES ($1, $2) RETURNING id, name`,
          [meal.id, trimmed]
        );
        insertedDishes.push(dishRes.rows[0]);
      }
    }

    await client.query('COMMIT');

    // Fetch slot info
    const slotRes = await pool.query(
      `SELECT start_time, end_time, cutoff_time, cost_paise FROM meal_slots WHERE meal_type = $1`,
      [meal_type]
    );
    const slot = slotRes.rows[0] || {};

    res.status(201).json({
      success: true,
      meal: {
        id: meal.id,
        date: meal.date,
        meal_type: meal.meal_type,
        ...slot,
        dishes: insertedDishes
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ── DELETE /api/admin/meals/:id (admin) ─────────────────────────────────────
router.delete('/admin/meals/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const mealId = parseInt(req.params.id, 10);
    if (isNaN(mealId)) {
      return res.status(400).json({ error: 'Invalid meal ID.' });
    }

    const result = await pool.query('DELETE FROM meals WHERE id = $1 RETURNING *', [mealId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meal not found.' });
    }

    res.json({ success: true, message: 'Meal deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/meals/:id/dishes (admin) ────────────────────────────────
router.post('/admin/meals/:id/dishes', requireRole('admin'), async (req, res, next) => {
  try {
    const mealId = parseInt(req.params.id, 10);
    if (isNaN(mealId)) {
      return res.status(400).json({ error: 'Invalid meal ID.' });
    }

    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Dish name is required.' });
    }

    // Verify meal exists
    const mealCheck = await pool.query('SELECT id FROM meals WHERE id = $1', [mealId]);
    if (mealCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Meal not found.' });
    }

    const result = await pool.query(
      'INSERT INTO dishes (meal_id, name) VALUES ($1, $2) RETURNING id, meal_id, name',
      [mealId, name.trim()]
    );

    res.status(201).json({ success: true, dish: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/admin/dishes/:id (admin) ────────────────────────────────────
router.delete('/admin/dishes/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const dishId = parseInt(req.params.id, 10);
    if (isNaN(dishId)) {
      return res.status(400).json({ error: 'Invalid dish ID.' });
    }

    const result = await pool.query('DELETE FROM dishes WHERE id = $1 RETURNING *', [dishId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dish not found.' });
    }

    res.json({ success: true, message: 'Dish deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/menu/copy (admin: copy whole day's menu) ────────────────
router.post('/admin/menu/copy', requireRole('admin'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { from_date, to_date } = req.body;

    if (!from_date || !to_date) {
      return res.status(400).json({ error: 'from_date and to_date are required.' });
    }

    if (!DATE_REGEX.test(from_date) || !DATE_REGEX.test(to_date)) {
      return res.status(400).json({ error: 'Dates must be in YYYY-MM-DD format.' });
    }

    if (from_date === to_date) {
      return res.status(400).json({ error: 'from_date and to_date cannot be the same.' });
    }

    await client.query('BEGIN');

    // 1. Get source meals
    const sourceMeals = await client.query(
      'SELECT id, meal_type FROM meals WHERE date = $1',
      [from_date]
    );

    if (sourceMeals.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: `No menu found for source date ${from_date}.` });
    }

    let dishesCopied = 0;

    for (const sMeal of sourceMeals.rows) {
      // Get dishes from source
      const sDishes = await client.query(
        'SELECT name FROM dishes WHERE meal_id = $1 ORDER BY id ASC',
        [sMeal.id]
      );

      // Upsert destination meal
      const destMealRes = await client.query(
        `INSERT INTO meals (date, meal_type)
         VALUES ($1, $2)
         ON CONFLICT (date, meal_type) DO UPDATE SET date = EXCLUDED.date
         RETURNING id`,
        [to_date, sMeal.meal_type]
      );
      const destMealId = destMealRes.rows[0].id;

      // Clear existing dishes in destination meal
      await client.query('DELETE FROM dishes WHERE meal_id = $1', [destMealId]);

      // Copy dishes
      for (const d of sDishes.rows) {
        await client.query(
          'INSERT INTO dishes (meal_id, name) VALUES ($1, $2)',
          [destMealId, d.name]
        );
        dishesCopied++;
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Menu copied from ${from_date} to ${to_date}.`,
      meals_copied: sourceMeals.rows.length,
      dishes_copied: dishesCopied
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
