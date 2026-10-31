const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// POST /api/waste
router.post('/', async (req, res) => {
  try {
    const { meal_id, cooked_kg, leftover_kg } = req.body;
    const result = await pool.query(
      'INSERT INTO waste_logs (meal_id, cooked_kg, leftover_kg) VALUES ($1, $2, $3) RETURNING *',
      [meal_id, cooked_kg, leftover_kg]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

