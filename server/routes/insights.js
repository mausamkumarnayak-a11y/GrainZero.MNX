const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function callGemini(prompt, modelName) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: modelName });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

function isRetryableError(err) {
  const msg = (err.message || '').toLowerCase();
  return (
    err.status === 429 ||
    msg.includes('429') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('resource_exhausted') ||
    msg.includes('model') ||
    msg.includes('not found')
  );
}

// POST /api/insights
router.post('/', async (req, res) => {
  try {
    // Gather recent data
    const recentRatings = await pool.query(`
      SELECT m.dish_name, m.meal_type, m.date, r.stars, r.comment, r.skipped
      FROM ratings r
      JOIN meals m ON r.meal_id = m.id
      ORDER BY r.created_at DESC
      LIMIT 30
    `);

    const recentWaste = await pool.query(`
      SELECT m.dish_name, m.meal_type, m.date,
             w.cooked_kg, w.leftover_kg,
             ROUND((w.leftover_kg / NULLIF(w.cooked_kg, 0) * 100)::numeric, 1) AS waste_pct
      FROM waste_logs w
      JOIN meals m ON w.meal_id = m.id
      ORDER BY w.created_at DESC
      LIMIT 30
    `);

    const prompt = `You are a food waste reduction advisor for an Indian hostel mess called GrainZero.
Analyze the following data from the last 14 days and respond ONLY with valid JSON (no markdown, no explanation outside the JSON).

Recent meal ratings:
${JSON.stringify(recentRatings.rows, null, 2)}

Recent waste logs:
${JSON.stringify(recentWaste.rows, null, 2)}

Return a JSON object with exactly these keys:
{
  "reasons_for_waste": ["reason1", "reason2", "reason3"],
  "tomorrow_quantity_recommendation": { "DishName": "reduce/maintain/increase by X kg" },
  "menu_suggestions": ["suggestion1", "suggestion2", "suggestion3"]
}`;

    const primaryModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const fallbackModel = 'gemini-2.5-flash-lite';

    let rawText;
    let usedModel = primaryModel;

    try {
      rawText = await callGemini(prompt, primaryModel);
    } catch (err) {
      if (isRetryableError(err) && primaryModel !== fallbackModel) {
        console.warn(`Primary model ${primaryModel} failed (${err.message}), retrying with ${fallbackModel}`);
        try {
          usedModel = fallbackModel;
          rawText = await callGemini(prompt, fallbackModel);
        } catch (fallbackErr) {
          console.error('Fallback model also failed:', fallbackErr.message);
          // Try to return cached result
          const cached = await pool.query(
            'SELECT result, created_at FROM ai_cache ORDER BY created_at DESC LIMIT 1'
          );
          if (cached.rows.length > 0) {
            return res.json({
              ...cached.rows[0].result,
              _source: 'cache',
              _cached_at: cached.rows[0].created_at,
              _error: 'AI service temporarily unavailable — showing last cached result.'
            });
          }
          return res.json({
            reasons_for_waste: ['AI service is temporarily unavailable. Please try again later.'],
            tomorrow_quantity_recommendation: {},
            menu_suggestions: ['Unable to generate suggestions right now. Please try again in a few minutes.'],
            _source: 'fallback_error'
          });
        }
      } else {
        throw err;
      }
    }

    // Parse JSON — strip markdown fences if present
    let parsed;
    try {
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = {
        reasons_for_waste: ['Could not parse AI response. Raw output stored in menu_suggestions.'],
        tomorrow_quantity_recommendation: {},
        menu_suggestions: [rawText.slice(0, 800)]
      };
    }

    // Cache result (keep only latest)
    await pool.query('DELETE FROM ai_cache');
    await pool.query('INSERT INTO ai_cache (result) VALUES ($1)', [JSON.stringify(parsed)]);

    res.json({ ...parsed, _source: usedModel });
  } catch (err) {
    console.error('Insights error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/insights/cached
router.get('/cached', async (req, res) => {
  try {
    const cached = await pool.query(
      'SELECT result, created_at FROM ai_cache ORDER BY created_at DESC LIMIT 1'
    );
    if (cached.rows.length > 0) {
      res.json({
        ...cached.rows[0].result,
        _cached_at: cached.rows[0].created_at,
        _source: 'cache'
      });
    } else {
      res.json(null);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

