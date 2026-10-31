const { pool } = require('../db');

/**
 * Flags ratings matching suspicious patterns:
 * 1. > 5 ratings within 60 seconds by same user
 * 2. 12+ ratings with identical stars by same user on same calendar day
 * 3. Exact same comment text posted by 4+ distinct users on same calendar day
 * 4. A dish receiving > 3x its overall daily average rating count on a single calendar day
 */
async function scanAll() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Rule 1: > 5 ratings within 60s
    await client.query(`
      WITH bursts AS (
        SELECT r1.id
        FROM ratings r1
        JOIN ratings r2 ON r1.user_id = r2.user_id
          AND r2.created_at BETWEEN r1.created_at AND r1.created_at + INTERVAL '60 seconds'
        GROUP BY r1.id
        HAVING COUNT(r2.id) > 5
      )
      UPDATE ratings
      SET flagged = true,
          flag_reason = COALESCE(flag_reason, 'Rapid activity: >5 ratings in 60 seconds')
      WHERE id IN (SELECT id FROM bursts);
    `);

    // Rule 2: 12+ ratings with same star rating in one day by same user
    await client.query(`
      WITH same_stars AS (
        SELECT id
        FROM (
          SELECT id,
                 COUNT(*) OVER (PARTITION BY user_id, (created_at AT TIME ZONE 'Asia/Kolkata')::date, stars) AS star_count
          FROM ratings
        ) s
        WHERE star_count >= 12
      )
      UPDATE ratings
      SET flagged = true,
          flag_reason = COALESCE(flag_reason, 'Uniform rating: 12+ identical star scores in one day')
      WHERE id IN (SELECT id FROM same_stars);
    `);

    // Rule 3: same non-empty comment by 4+ users on same day
    await client.query(`
      WITH copied_comments AS (
        SELECT r.id
        FROM ratings r
        JOIN (
          SELECT TRIM(LOWER(comment)) AS ctext, (created_at AT TIME ZONE 'Asia/Kolkata')::date AS rdate
          FROM ratings
          WHERE comment IS NOT NULL AND TRIM(comment) <> ''
          GROUP BY TRIM(LOWER(comment)), (created_at AT TIME ZONE 'Asia/Kolkata')::date
          HAVING COUNT(DISTINCT user_id) >= 4
        ) c ON TRIM(LOWER(r.comment)) = c.ctext
           AND (r.created_at AT TIME ZONE 'Asia/Kolkata')::date = c.rdate
      )
      UPDATE ratings
      SET flagged = true,
          flag_reason = COALESCE(flag_reason, 'Coordinated spam: Identical comment posted by 4+ users')
      WHERE id IN (SELECT id FROM copied_comments);
    `);

    // Rule 4: Dish gets > 3x its average daily rating count on a single day
    await client.query(`
      WITH dish_stats AS (
        SELECT d.name AS dish_name,
               COUNT(*)::numeric / GREATEST(COUNT(DISTINCT (r.created_at AT TIME ZONE 'Asia/Kolkata')::date), 1) AS avg_daily
        FROM ratings r
        JOIN dishes d ON r.dish_id = d.id
        GROUP BY d.name
      ),
      spikes AS (
        SELECT r.id
        FROM ratings r
        JOIN dishes d ON r.dish_id = d.id
        JOIN dish_stats ds ON d.name = ds.dish_name
        WHERE ds.avg_daily >= 2
          AND (
            SELECT COUNT(*)
            FROM ratings r2
            JOIN dishes d2 ON r2.dish_id = d2.id
            WHERE d2.name = d.name
              AND (r2.created_at AT TIME ZONE 'Asia/Kolkata')::date = (r.created_at AT TIME ZONE 'Asia/Kolkata')::date
          ) > (ds.avg_daily * 3)
      )
      UPDATE ratings
      SET flagged = true,
          flag_reason = COALESCE(flag_reason, 'Unusual volume spike: >3x normal daily rating frequency')
      WHERE id IN (SELECT id FROM spikes);
    `);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('scanAll error:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function scanUser(userId) {
  if (!userId) return;
  try {
    // 1. Rapid submissions
    await pool.query(`
      WITH bursts AS (
        SELECT r1.id
        FROM ratings r1
        JOIN ratings r2 ON r1.user_id = r2.user_id
          AND r2.created_at BETWEEN r1.created_at AND r1.created_at + INTERVAL '60 seconds'
        WHERE r1.user_id = $1
        GROUP BY r1.id
        HAVING COUNT(r2.id) > 5
      )
      UPDATE ratings
      SET flagged = true,
          flag_reason = COALESCE(flag_reason, 'Rapid activity: >5 ratings in 60 seconds')
      WHERE id IN (SELECT id FROM bursts);
    `, [userId]);

    // 2. 12+ same star on same day
    await pool.query(`
      WITH same_stars AS (
        SELECT id
        FROM (
          SELECT id,
                 COUNT(*) OVER (PARTITION BY (created_at AT TIME ZONE 'Asia/Kolkata')::date, stars) AS star_count
          FROM ratings
          WHERE user_id = $1
        ) s
        WHERE star_count >= 12
      )
      UPDATE ratings
      SET flagged = true,
          flag_reason = COALESCE(flag_reason, 'Uniform rating: 12+ identical star scores in one day')
      WHERE id IN (SELECT id FROM same_stars);
    `, [userId]);
  } catch (err) {
    console.error(`scanUser(${userId}) error:`, err);
  }
}

module.exports = { scanAll, scanUser };

