const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/meals/today
router.get('/today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query(
      'SELECT * FROM meals WHERE date = $1 ORDER BY id',
      [today]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/meals
router.post('/', async (req, res) => {
  try {
    const { date, meal_type, dish_name } = req.body;
    const result = await pool.query(
      'INSERT INTO meals (date, meal_type, dish_name) VALUES ($1, $2, $3) RETURNING *',
      [date || new Date().toISOString().split('T')[0], meal_type, dish_name]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

