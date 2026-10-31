const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ── GET /api/settings (any logged-in user) ──────────────────────────────────
router.get('/settings', requireAuth, async (req, res, next) => {
  try {
    const settingsRes = await pool.query('SELECT * FROM settings WHERE id = 1');
    const slotsRes = await pool.query('SELECT * FROM meal_slots ORDER BY id ASC');

    const settings = settingsRes.rows[0] || {
      id: 1,
      wallet_percent: 30,
      buffer_percent: 10,
      mess_fee_paise: 600000
    };

    res.json({
      settings,
      meal_slots: slotsRes.rows
    });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/admin/settings (admin) ─────────────────────────────────────────
router.put('/admin/settings', requireRole('admin'), async (req, res, next) => {
  try {
    const { wallet_percent, buffer_percent, mess_fee_paise } = req.body;

    if (wallet_percent !== undefined) {
      const wp = Number(wallet_percent);
      if (!Number.isInteger(wp) || wp < 0 || wp > 100) {
        return res.status(400).json({ error: 'wallet_percent must be an integer between 0 and 100.' });
      }
    }

    if (buffer_percent !== undefined) {
      const bp = Number(buffer_percent);
      if (!Number.isInteger(bp) || bp < 0 || bp > 100) {
        return res.status(400).json({ error: 'buffer_percent must be an integer between 0 and 100.' });
      }
    }

    if (mess_fee_paise !== undefined) {
      const mfp = Number(mess_fee_paise);
      if (!Number.isInteger(mfp) || mfp < 0) {
        return res.status(400).json({ error: 'mess_fee_paise must be a non-negative integer.' });
      }
    }

    const result = await pool.query(
      `UPDATE settings
       SET wallet_percent = COALESCE($1, wallet_percent),
           buffer_percent = COALESCE($2, buffer_percent),
           mess_fee_paise = COALESCE($3, mess_fee_paise)
       WHERE id = 1
       RETURNING *`,
      [
        wallet_percent !== undefined ? Number(wallet_percent) : null,
        buffer_percent !== undefined ? Number(buffer_percent) : null,
        mess_fee_paise !== undefined ? Number(mess_fee_paise) : null
      ]
    );

    res.json({
      success: true,
      message: 'Settings updated successfully.',
      settings: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/admin/meal-slots/:id (admin) ───────────────────────────────────
router.put('/admin/meal-slots/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const slotId = parseInt(req.params.id, 10);
    if (isNaN(slotId)) {
      return res.status(400).json({ error: 'Invalid meal slot ID.' });
    }

    const { start_time, end_time, cutoff_time, cost_paise } = req.body;

    if (!start_time || !end_time || !cutoff_time || cost_paise === undefined) {
      return res.status(400).json({ error: 'start_time, end_time, cutoff_time, and cost_paise are required.' });
    }

    if (!TIME_REGEX.test(start_time)) {
      return res.status(400).json({ error: 'start_time must be in HH:MM (24-hour) format.' });
    }
    if (!TIME_REGEX.test(end_time)) {
      return res.status(400).json({ error: 'end_time must be in HH:MM (24-hour) format.' });
    }
    if (!TIME_REGEX.test(cutoff_time)) {
      return res.status(400).json({ error: 'cutoff_time must be in HH:MM (24-hour) format.' });
    }

    const [cH, cM] = cutoff_time.split(':').map(Number);
    const [sH, sM] = start_time.split(':').map(Number);
    if (cH * 60 + cM >= sH * 60 + sM) {
      return res.status(400).json({ error: 'cutoff_time must be strictly before start_time.' });
    }

    const cost = Number(cost_paise);
    if (!Number.isInteger(cost) || cost < 0) {
      return res.status(400).json({ error: 'cost_paise must be a non-negative integer.' });
    }

    const result = await pool.query(
      `UPDATE meal_slots
       SET start_time = $1,
           end_time = $2,
           cutoff_time = $3,
           cost_paise = $4
       WHERE id = $5
       RETURNING *`,
      [start_time, end_time, cutoff_time, cost, slotId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meal slot not found.' });
    }

    res.json({
      success: true,
      message: 'Meal slot updated successfully.',
      slot: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

