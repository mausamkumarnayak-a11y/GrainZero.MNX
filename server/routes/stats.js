const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/stats
router.get('/', async (req, res) => {
  try {
    // Waste per day (last 14 days)
    const wastePerDay = await pool.query(`
      SELECT m.date, SUM(w.leftover_kg) AS total_leftover_kg
      FROM waste_logs w
      JOIN meals m ON w.meal_id = m.id
      GROUP BY m.date
      ORDER BY m.date DESC
      LIMIT 14
    `);

    // Most wasted dishes (top 5)
    const mostWasted = await pool.query(`
      SELECT m.dish_name, SUM(w.leftover_kg) AS total_wasted_kg
      FROM waste_logs w
      JOIN meals m ON w.meal_id = m.id
      GROUP BY m.dish_name
      ORDER BY total_wasted_kg DESC
      LIMIT 5
    `);

    // Average rating per dish
    const avgRating = await pool.query(`
      SELECT m.dish_name,
             ROUND(AVG(r.stars)::numeric, 1) AS avg_stars,
             COUNT(r.id) AS rating_count
      FROM ratings r
      JOIN meals m ON r.meal_id = m.id
      WHERE r.stars IS NOT NULL
      GROUP BY m.dish_name
      ORDER BY avg_stars DESC
    `);

    // Total kg wasted
    const totalWaste = await pool.query(
      'SELECT SUM(leftover_kg) AS total_kg FROM waste_logs'
    );

    const totalKg = parseFloat(totalWaste.rows[0]?.total_kg || 0);
    const totalRupees = totalKg * 60;

    res.json({
      waste_per_day: wastePerDay.rows,
      most_wasted_dishes: mostWasted.rows,
      avg_rating_per_dish: avgRating.rows,
      total_kg_wasted: totalKg,
      total_rupees_wasted: totalRupees
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

