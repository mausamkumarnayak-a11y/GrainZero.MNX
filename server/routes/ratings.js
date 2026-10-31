const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// POST /api/ratings
router.post('/', async (req, res) => {
  try {
    const { meal_id, stars, comment, skipped } = req.body;
    const result = await pool.query(
      'INSERT INTO ratings (meal_id, stars, comment, skipped) VALUES ($1, $2, $3, $4) RETURNING *',
      [meal_id, stars || null, comment || null, skipped || false]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

