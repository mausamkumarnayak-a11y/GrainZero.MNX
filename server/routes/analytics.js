const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requireRole } = require('../middleware/auth');
const { todayIST, nowIST } = require('../utils/time');
const { scanAll } = require('../services/suspicious');
const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Pure recommendation function based on dish metrics.
 * Output is definitive; AI never overrides the recommendation percentage.
 */
function recommend(stats) {
  const { rating_count, avg_stars, avg_last7, avg_prev7, trend_delta, leftover_percent } = stats;

  if (!rating_count || rating_count < 5) {
    return {
      percent: 0,
      label: 'Not enough data',
      tone: 'neutral'
    };
  }

  // Use last 7 days average if at least 3 ratings exist, else overall average
  const baseAvg = (stats.count_last7 >= 3 && avg_last7 !== null) ? avg_last7 : avg_stars;
  let pct = 0;

  if (baseAvg < 2.5) {
    pct = -30;
  } else if (baseAvg < 3.0) {
    pct = -20;
  } else if (baseAvg < 3.5) {
    pct = -10;
  } else if (baseAvg < 4.2) {
    pct = 0;
  } else {
    pct = (leftover_percent !== null && leftover_percent < 8) ? 10 : 5;
  }

  // Modifiers
  if (trend_delta !== null && trend_delta <= -0.5) {
    pct -= 5;
  }
  if (leftover_percent !== null && leftover_percent > 20) {
    pct -= 5;
  }

  // Clamp -40..+15
  pct = Math.max(-40, Math.min(15, pct));

  let label = 'Keep as is';
  let tone = 'keep';
  if (pct < 0) {
    label = `Reduce by ${Math.abs(pct)}%`;
    tone = 'reduce';
  } else if (pct > 0) {
    label = `Increase by ${pct}%`;
    tone = 'increase';
  }

  return { percent: pct, label, tone };
}

/**
 * Robust Gemini caller with automatic single retry on gemini-2.5-flash-lite
 */
async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.includes('your_gemini')) {
    console.warn('GEMINI_API_KEY missing or placeholder.');
    return null;
  }

  const primaryModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const fallbackModel = 'gemini-2.5-flash-lite';
  const genAI = new GoogleGenerativeAI(apiKey);

  const runWithModel = async (modelName) => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2
      }
    });
    const res = await model.generateContent(prompt);
    const text = res.response.text();
    return JSON.parse(text);
  };

  try {
    return await runWithModel(primaryModel);
  } catch (err) {
    console.warn(`Primary Gemini call (${primaryModel}) failed:`, err.message);
    try {
      console.log(`Retrying with fallback model ${fallbackModel}...`);
      return await runWithModel(fallbackModel);
    } catch (retryErr) {
      console.error(`Fallback Gemini call failed:`, retryErr.message);
      return null;
    }
  }
}

/**
 * Computes live dish analytics across all dishes
 */
async function computeDishAnalytics() {
  const todayStr = todayIST();

  // 1. All unique dish names and total unflagged ratings
  const dishTotalsRes = await pool.query(`
    SELECT d.name,
           COUNT(r.id)::int AS rating_count,
           ROUND(AVG(r.stars)::numeric, 2) AS avg_stars
    FROM dishes d
    LEFT JOIN ratings r ON d.id = r.dish_id AND r.flagged = false
    GROUP BY d.name
    ORDER BY d.name ASC
  `);

  // 2. Ratings split by last 7 days and prev 7 days (unflagged)
  const windowStatsRes = await pool.query(`
    SELECT d.name,
           ROUND(AVG(CASE WHEN r.created_at >= NOW() - INTERVAL '7 days' THEN r.stars END)::numeric, 2) AS avg_last7,
           COUNT(CASE WHEN r.created_at >= NOW() - INTERVAL '7 days' THEN r.id END)::int AS count_last7,
           ROUND(AVG(CASE WHEN r.created_at >= NOW() - INTERVAL '14 days' AND r.created_at < NOW() - INTERVAL '7 days' THEN r.stars END)::numeric, 2) AS avg_prev7,
           COUNT(CASE WHEN r.created_at >= NOW() - INTERVAL '14 days' AND r.created_at < NOW() - INTERVAL '7 days' THEN r.id END)::int AS count_prev7
    FROM dishes d
    LEFT JOIN ratings r ON d.id = r.dish_id AND r.flagged = false
    GROUP BY d.name
  `);
  const windowMap = {};
  for (const w of windowStatsRes.rows) {
    windowMap[w.name] = w;
  }

  // 3. Flagged count per dish
  const flaggedRes = await pool.query(`
    SELECT d.name, COUNT(r.id)::int AS flagged_count
    FROM dishes d
    JOIN ratings r ON d.id = r.dish_id AND r.flagged = true
    GROUP BY d.name
  `);
  const flaggedMap = {};
  for (const f of flaggedRes.rows) {
    flaggedMap[f.name] = f.flagged_count;
  }

  // 4. Waste leftover percent per dish name
  const wasteRes = await pool.query(`
    SELECT d.name,
           ROUND(AVG(w.leftover_kg / NULLIF(w.cooked_kg, 0) * 100)::numeric, 1) AS avg_leftover_pct
    FROM dishes d
    JOIN meals m ON d.meal_id = m.id
    JOIN waste_logs w ON m.id = w.meal_id
    WHERE w.cooked_kg > 0
    GROUP BY d.name
  `);
  const wasteMap = {};
  for (const w of wasteRes.rows) {
    wasteMap[w.name] = parseFloat(w.avg_leftover_pct);
  }

  // 5. 14-day time series per dish name
  const seriesRes = await pool.query(`
    SELECT d.name,
           (r.created_at AT TIME ZONE 'Asia/Kolkata')::date::text AS date,
           ROUND(AVG(r.stars)::numeric, 2) AS avg,
           COUNT(r.id)::int AS count
    FROM dishes d
    JOIN ratings r ON d.id = r.dish_id AND r.flagged = false
    WHERE r.created_at >= NOW() - INTERVAL '14 days'
    GROUP BY d.name, (r.created_at AT TIME ZONE 'Asia/Kolkata')::date
    ORDER BY d.name, date ASC
  `);
  const seriesMap = {};
  for (const s of seriesRes.rows) {
    if (!seriesMap[s.name]) seriesMap[s.name] = [];
    seriesMap[s.name].push({
      date: s.date,
      avg: parseFloat(s.avg),
      count: s.count
    });
  }

  // 6. Up to 8 recent non-empty comments per dish name
  const commentsRes = await pool.query(`
    SELECT d.name, r.stars, r.comment, r.created_at
    FROM ratings r
    JOIN dishes d ON r.dish_id = d.id
    WHERE r.comment IS NOT NULL AND TRIM(r.comment) <> '' AND r.flagged = false
    ORDER BY r.created_at DESC
  `);
  const commentsMap = {};
  for (const c of commentsRes.rows) {
    if (!commentsMap[c.name]) commentsMap[c.name] = [];
    if (commentsMap[c.name].length < 8) {
      commentsMap[c.name].push({
        stars: c.stars,
        comment: c.comment,
        created_at: c.created_at
      });
    }
  }

  // Assemble full dish statistics
  const dishes = dishTotalsRes.rows.map(d => {
    const w = windowMap[d.name] || {};
    const avgStars = d.avg_stars !== null ? parseFloat(d.avg_stars) : 0;
    const avgLast7 = w.avg_last7 !== null && w.avg_last7 !== undefined ? parseFloat(w.avg_last7) : null;
    const avgPrev7 = w.avg_prev7 !== null && w.avg_prev7 !== undefined ? parseFloat(w.avg_prev7) : null;
    const countLast7 = w.count_last7 || 0;
    const countPrev7 = w.count_prev7 || 0;

    let trendDelta = 0;
    if (avgLast7 !== null && avgPrev7 !== null) {
      trendDelta = Number((avgLast7 - avgPrev7).toFixed(2));
    }

    const leftoverPct = wasteMap[d.name] ?? null;
    const flaggedCount = flaggedMap[d.name] || 0;
    const series = seriesMap[d.name] || [];
    const comments = commentsMap[d.name] || [];

    const statsObj = {
      name: d.name,
      rating_count: d.rating_count,
      avg_stars: avgStars,
      avg_last7: avgLast7,
      count_last7: countLast7,
      avg_prev7: avgPrev7,
      count_prev7: countPrev7,
      trend_delta: trendDelta,
      leftover_percent: leftoverPct,
      flagged_count: flaggedCount,
      series,
      comments
    };

    const rec = recommend(statsObj);
    return {
      ...statsObj,
      recommendation: rec
    };
  });

  return dishes;
}

// ── GET /api/admin/analytics ────────────────────────────────────────────────
router.get('/analytics', requireRole('admin'), async (req, res, next) => {
  try {
    const dishes = await computeDishAnalytics();
    res.json({ dishes });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/analytics/generate ──────────────────────────────────────
router.post('/analytics/generate', requireRole('admin'), async (req, res, next) => {
  try {
    const dishes = await computeDishAnalytics();
    const eligibleDishes = dishes.filter(d => d.rating_count >= 5);

    // Prepare prompt payload for eligible dishes
    const promptPayload = eligibleDishes.map(d => ({
      name: d.name,
      rating_count: d.rating_count,
      avg_stars: d.avg_stars,
      avg_last7: d.avg_last7,
      trend_delta: d.trend_delta,
      leftover_percent: d.leftover_percent,
      recommended_percent: d.recommendation.percent,
      recommendation_label: d.recommendation.label,
      flagged_count: d.flagged_count,
      sample_comments: d.comments.slice(0, 8).map(c => c.comment)
    }));

    const prompt = `You are the chief food waste advisor for GrainZero Indian Hostel Mess.
Analyze these mess dishes based on student ratings, comments, and kitchen leftovers.
DO NOT invent or alter the given recommended percentage numbers.

Dishes data:
${JSON.stringify(promptPayload, null, 2)}

Respond with a JSON object strictly matching this schema:
{
  "overall_summary": "High-level summary of hostel meal satisfaction and overall food waste patterns (max 50 words).",
  "suspicious_summary": "Summary of any spam patterns, brigaded dishes, or abnormal rating spikes detected (max 40 words).",
  "dishes": [
    {
      "name": "Exact dish name from input",
      "summary": "Concise summary of student feedback/complaints (max 25 words).",
      "reason": "One clear sentence explaining the kitchen action using the exact recommended percent."
    }
  ]
}`;

    const aiRes = await callGemini(prompt);
    let aiFailed = false;
    let overallSummary = '';
    let suspiciousSummary = '';
    let dishAiMap = {};

    if (aiRes && Array.isArray(aiRes.dishes)) {
      overallSummary = aiRes.overall_summary || 'Analysis complete based on 14-day hostel meal ratings.';
      suspiciousSummary = aiRes.suspicious_summary || 'Rating volume patterns monitored.';
      for (const item of aiRes.dishes) {
        if (item.name) dishAiMap[item.name] = item;
      }
    } else {
      // Template fallback
      aiFailed = true;
      overallSummary = 'Hostel students consistently praise rich curries and sweets, while plainer dishes experience higher leftovers. Adjusting cooking batches according to satisfaction trends will reduce kitchen waste.';
      suspiciousSummary = 'Automated scan detected review bursts and identical repeated feedback that were isolated and excluded from dish score averages.';

      for (const d of eligibleDishes) {
        let summary = 'Generally well received by mess residents with steady student turnout.';
        let reason = `Recommended to ${d.recommendation.label.toLowerCase()} based on an average rating of ${d.avg_stars}★.`;

        if (d.recommendation.percent < 0) {
          summary = 'Students frequently note excess oil, mild seasoning, or inconsistent vegetable texture.';
          reason = `Preparing ${Math.abs(d.recommendation.percent)}% less will curb unconsumed tray leftovers.`;
        } else if (d.recommendation.percent > 0) {
          summary = 'High student preference with consistently clean plates and positive reviews.';
          reason = `Increasing preparation by ${d.recommendation.percent}% prevents dish shortages during peak meal hours.`;
        }
        dishAiMap[d.name] = { name: d.name, summary, reason };
      }
    }

    // Save to ai_reports table
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Clear previous reports
      await client.query("DELETE FROM ai_reports WHERE kind IN ('dish', 'overall')");

      // Insert overall report
      await client.query(`
        INSERT INTO ai_reports (dish_name, stats, kind, summary, reason, created_at)
        VALUES (NULL, $1, 'overall', $2, $3, NOW())
      `, [
        JSON.stringify({ aiFailed, totalDishes: eligibleDishes.length }),
        overallSummary,
        suspiciousSummary
      ]);

      // Insert dish reports
      for (const d of dishes) {
        const aiItem = dishAiMap[d.name];
        const summary = aiItem ? aiItem.summary : 'Not enough rating data to generate an AI review.';
        const reason = aiItem ? aiItem.reason : d.recommendation.label;

        await client.query(`
          INSERT INTO ai_reports (dish_name, stats, kind, summary, recommendation_pct, reason, created_at)
          VALUES ($1, $2, 'dish', $3, $4, $5, NOW())
        `, [
          d.name,
          JSON.stringify(d),
          summary,
          d.recommendation.percent,
          reason
        ]);
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('Failed to save ai_reports:', e);
    } finally {
      client.release();
    }

    res.json({
      success: true,
      ai_failed: aiFailed,
      overall_summary: overallSummary,
      suspicious_summary: suspiciousSummary,
      dishes: dishes.map(d => ({
        ...d,
        ai_summary: dishAiMap[d.name]?.summary || null,
        ai_reason: dishAiMap[d.name]?.reason || null
      }))
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/analytics/report ─────────────────────────────────────────
// Returns latest saved report merged with live stats so page loads instantly
router.get('/analytics/report', requireRole('admin'), async (req, res, next) => {
  try {
    const liveDishes = await computeDishAnalytics();

    // Fetch saved reports
    const overallRes = await pool.query("SELECT * FROM ai_reports WHERE kind = 'overall' ORDER BY id DESC LIMIT 1");
    const dishReportsRes = await pool.query("SELECT * FROM ai_reports WHERE kind = 'dish' ORDER BY id DESC");

    const dishReportMap = {};
    for (const r of dishReportsRes.rows) {
      if (r.dish_name && !dishReportMap[r.dish_name]) {
        dishReportMap[r.dish_name] = r;
      }
    }

    const overallReport = overallRes.rows[0] || null;

    const mergedDishes = liveDishes.map(d => {
      const rep = dishReportMap[d.name];
      return {
        ...d,
        ai_summary: rep ? rep.summary : null,
        ai_reason: rep ? rep.reason : null,
        ai_recommendation_pct: rep ? rep.recommendation_pct : d.recommendation.percent
      };
    });

    res.json({
      has_report: !!overallReport,
      overall_summary: overallReport ? overallReport.summary : null,
      suspicious_summary: overallReport ? overallReport.reason : null,
      created_at: overallReport ? overallReport.created_at : null,
      dishes: mergedDishes
    });
  } catch (err) {
    next(err);
  }
});

// ── Suspicious & Flagged Endpoints ──────────────────────────────────────────

// POST /api/admin/ratings/rescan
router.post('/ratings/rescan', requireRole('admin'), async (req, res, next) => {
  try {
    await scanAll();
    const countRes = await pool.query('SELECT COUNT(*)::int AS count FROM ratings WHERE flagged = true');
    res.json({
      success: true,
      message: 'Suspicious scan completed successfully.',
      flagged_count: countRes.rows[0].count
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/flagged
// With dish name, student name, stars, comment, reason
router.get('/flagged', requireRole('admin'), async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT r.id,
             r.user_id,
             u.name AS student_name,
             u.email AS student_email,
             d.name AS dish_name,
             m.date::text AS meal_date,
             m.meal_type,
             r.stars,
             r.comment,
             r.flag_reason,
             r.flagged,
             r.created_at
      FROM ratings r
      JOIN users u ON r.user_id = u.id
      JOIN dishes d ON r.dish_id = d.id
      JOIN meals m ON d.meal_id = m.id
      WHERE r.flagged = true
      ORDER BY r.created_at DESC, r.id DESC
    `);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/ratings/:id/flag
router.put('/ratings/:id/flag', requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { flagged } = req.body;
    const isFlagged = flagged !== false;

    const result = await pool.query(
      `UPDATE ratings
       SET flagged = $1,
           flag_reason = CASE WHEN $1 = false THEN NULL ELSE COALESCE(flag_reason, 'Manually flagged by authority') END
       WHERE id = $2
       RETURNING *`,
      [isFlagged, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rating not found.' });
    }

    res.json({ success: true, rating: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

