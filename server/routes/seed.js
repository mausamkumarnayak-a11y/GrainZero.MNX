const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { requireRole } = require('../middleware/auth');
const { scanAll } = require('../services/suspicious');

// Helper for fast chunked multi-row INSERTs
async function batchInsert(client, table, columns, rows, chunkSize = 350) {
  if (!rows || rows.length === 0) return [];
  const results = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const valuePlaceholders = [];
    const params = [];
    let paramIndex = 1;

    for (const row of chunk) {
      const rowPlaceholders = [];
      for (const col of columns) {
        rowPlaceholders.push(`$${paramIndex++}`);
        params.push(row[col]);
      }
      valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
    }

    const query = `
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES ${valuePlaceholders.join(', ')}
      RETURNING *
    `;
    const res = await client.query(query, params);
    results.push(...res.rows);
  }
  return results;
}

// 40 Indian student names
const INDIAN_STUDENT_NAMES = [
  'Aarav Sharma', 'Vivaan Patel', 'Aditya Verma', 'Vihaan Gupta', 'Arjun Singh',
  'Sai Kumar', 'Reyansh Reddy', 'Aayush Joshi', 'Krishna Nair', 'Ishaan Rao',
  'Shaurya Malhotra', 'Dhruv Mehta', 'Kabir Bhatia', 'Ritvik Choudhury', 'Ananya Iyer',
  'Diya Sen', 'Gauri Saxena', 'Ishita Das', 'Meera Pillai', 'Pooja Agarwal',
  'Riya Bose', 'Sneha Kulkarni', 'Tanvi Deshmukh', 'Vidya Menon', 'Zoya Khan',
  'Rohan Mishra', 'Manav Kapoor', 'Devansh Tiwari', 'Siddharth Roy', 'Kunal Pandey',
  'Pranav Chauhan', 'Harshvardhan Jain', 'Nikhil Bhat', 'Varun Nambiar', 'Yash Singhania',
  'Akanksha Dubey', 'Neha Tripathi', 'Simran Kaur', 'Priya Ganguly', 'Shruti Swaminathan'
];

// Helper to calculate Asia/Kolkata date strings
function getKolkataDate(offsetDays) {
  const now = new Date();
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istMs = utcMs + (5.5 * 60 * 60 * 1000) + (offsetDays * 24 * 60 * 60 * 1000);
  const istDate = new Date(istMs);
  const year = istDate.getFullYear();
  const month = String(istDate.getMonth() + 1).padStart(2, '0');
  const day = String(istDate.getDate()).padStart(2, '0');
  return {
    dateStr: `${year}-${month}-${day}`,
    dayOfWeek: istDate.getDay() // 0 = Sunday, 1 = Monday, ...
  };
}

// Menu planner to guarantee dish appearance >= 5 days for key dishes
function getDishesForMeal(dayOffset, mealType) {
  // dayOffset range: -14 to +1
  if (mealType === 'breakfast') {
    const sets = [
      ['Masala Dosa', 'Idli Sambar', 'Poha'],
      ['Aloo Paratha', 'Upma', 'Bread Omelette'],
      ['Puri Bhaji', 'Poha', 'Idli Sambar'],
      ['Masala Dosa', 'Bread Omelette', 'Upma'],
      ['Poha', 'Aloo Paratha', 'Idli Sambar', 'Bread Omelette']
    ];
    return sets[Math.abs(dayOffset) % sets.length];
  }

  if (mealType === 'lunch') {
    const list = ['Rice', 'Roti'];
    // Paneer Butter Masala on at least 6 days: -14, -11, -8, -5, -2, 0
    if ([-14, -11, -8, -5, -2, 0].includes(dayOffset)) {
      list.push('Paneer Butter Masala');
      list.push('Dal Tadka');
    }
    // Lauki Sabzi on 5 days: -13, -10, -7, -4, -1
    else if ([-13, -10, -7, -4, -1].includes(dayOffset)) {
      list.push('Lauki Sabzi');
      list.push('Rajma');
    } else {
      list.push('Chole');
      list.push('Curd');
    }
    // Aloo Gobi on 7 days: -14, -12, -9, -6, -3, -1, 1
    if ([-14, -12, -9, -6, -3, -1, 1].includes(dayOffset)) {
      if (!list.includes('Aloo Gobi')) {
        if (list.length >= 4) list.pop(); // keep 3 or 4 dishes
        list.push('Aloo Gobi');
      }
    }
    return list;
  }

  if (mealType === 'snacks') {
    const sets = [
      ['Samosa', 'Tea and Biscuits', 'Veg Puff'],
      ['Pav Bhaji', 'Tea and Biscuits', 'Samosa'],
      ['Veg Puff', 'Samosa', 'Pav Bhaji'],
      ['Tea and Biscuits', 'Samosa', 'Veg Puff', 'Pav Bhaji']
    ];
    return sets[Math.abs(dayOffset) % sets.length];
  }

  if (mealType === 'dinner') {
    const list = ['Jeera Rice', 'Roti'];
    // Bhindi Masala on at least 6 days: -13, -11, -8, -5, -2, 0
    if ([-13, -11, -8, -5, -2, 0].includes(dayOffset)) {
      list.push('Bhindi Masala');
      list.push('Dal Fry');
    } else {
      list.push('Kadhai Paneer');
      list.push(dayOffset % 2 === 0 ? 'Egg Curry' : 'Mix Veg');
    }
    // Add Kheer occasionally
    if ([-14, -10, -6, -2, 1].includes(dayOffset)) {
      if (list.length >= 4) list.pop();
      list.push('Kheer');
    }
    return list;
  }

  return ['Rice', 'Roti', 'Dal Tadka'];
}

// Mean stars per dish
function getDishMean(dishName, dayOffset) {
  if (dishName === 'Aloo Gobi') {
    // Aloo Gobi starts at ~4.1 on oldest days (-14) and declines to ~2.2 on latest days (-1)
    const progress = Math.max(0, Math.min(1, (dayOffset - (-14)) / 13));
    return 4.1 - (progress * 1.9);
  }
  const means = {
    'Paneer Butter Masala': 4.5,
    'Masala Dosa': 4.4,
    'Egg Curry': 4.2,
    'Kheer': 4.6,
    'Samosa': 4.1,
    'Poha': 3.6,
    'Dal Tadka': 3.7,
    'Rice': 3.5,
    'Lauki Sabzi': 1.9,
    'Bhindi Masala': 2.4,
    'Upma': 2.6
  };
  return means[dishName] || 3.3;
}

// Generate star rating adhering to normal distribution around mean
function pickStars(mean) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1 || 0.0001)) * Math.cos(2.0 * Math.PI * u2);
  const val = Math.round(mean + z0 * 0.72);
  return Math.max(1, Math.min(5, val));
}

// Pick comments matching star value and dish context
function pickComment(dishName, stars, dayOffset) {
  // Special story for Aloo Gobi on recent days with low/moderate stars
  if (dishName === 'Aloo Gobi' && dayOffset >= -5 && stars <= 3) {
    const specialAlooComments = [
      'too oily now', 'bahut zyada namak', 'cold and soggy',
      'aloo gobi quality has gone down', 'too oily now, please fix',
      'cold and soggy potatoes'
    ];
    return specialAlooComments[Math.floor(Math.random() * specialAlooComments.length)];
  }

  if (dishName === 'Lauki Sabzi' && stars <= 2) {
    const laukiComments = [
      'Lauki again? please no', 'Too watery and bland',
      'Nobody eats lauki here', 'Portion was small, taste bad',
      'Thanda tha, tasteless'
    ];
    return laukiComments[Math.floor(Math.random() * laukiComments.length)];
  }

  const commentsByStars = {
    5: [
      'Bahut tasty tha', 'Perfect, loved it', 'Best meal of the week',
      'So good! 10/10', 'Taste was awesome', 'Cooked to perfection',
      'Really delicious!'
    ],
    4: [
      'Quite good today', 'Tasty, satisfied', 'Good preparation',
      'Nice and fresh', 'Better than usual', 'Liked it a lot'
    ],
    3: [
      'Average taste', 'Okay okay', 'Khane layak tha',
      'Theek tha', 'Could be better', 'Average, nothing special'
    ],
    2: [
      'Too oily', 'Portion was small', 'Thanda tha',
      'Bland taste, no salt', 'Needs improvement', 'Not good today'
    ],
    1: [
      'Rice was undercooked', 'Too salty, couldn\'t eat',
      'Very bad quality today', 'Horrible taste',
      'Completely tasteless', 'Not fresh at all'
    ]
  };

  const list = commentsByStars[stars] || commentsByStars[3];
  return list[Math.floor(Math.random() * list.length)];
}

// Meal timings in IST
const MEAL_SCHEDULE = {
  breakfast: { endHour: 9,  endMin: 0,  ratingHour: 9,  ratingMin: 20, cutoffHour: 6,  cutoffMin: 30 },
  lunch:     { endHour: 14, endMin: 0,  ratingHour: 14, ratingMin: 25, cutoffHour: 10, cutoffMin: 30 },
  snacks:    { endHour: 18, endMin: 0,  ratingHour: 18, ratingMin: 15, cutoffHour: 15, cutoffMin: 30 },
  dinner:    { endHour: 21, endMin: 0,  ratingHour: 21, ratingMin: 30, cutoffHour: 17, cutoffMin: 30 }
};

async function executeSeed(req, res) {
  const client = await pool.connect();
  try {
    console.log('🌱 Starting GrainZero Demo Data Seed...');
    await client.query('BEGIN');

    // ── 1. RESET ─────────────────────────────────────────────────────────────
    console.log('1. Clearing existing demo data...');
    await client.query('DELETE FROM ai_reports');
    await client.query('DELETE FROM fee_invoices');
    await client.query('DELETE FROM wallet_transactions');
    await client.query('DELETE FROM waste_logs');
    await client.query('DELETE FROM ratings');
    await client.query('DELETE FROM skips');
    await client.query('DELETE FROM dishes');
    await client.query('DELETE FROM meals');
    await client.query(`DELETE FROM users WHERE email LIKE '%@demo.grainzero.com'`);

    // Fetch settings and meal_slots for financial calculations
    const settingsRes = await client.query('SELECT wallet_percent FROM settings WHERE id = 1');
    const walletPercent = settingsRes.rows[0]?.wallet_percent ?? 30;

    const slotsRes = await client.query('SELECT meal_type, cost_paise FROM meal_slots');
    const slotCostMap = {};
    for (const row of slotsRes.rows) {
      slotCostMap[row.meal_type] = row.cost_paise;
    }

    // ── 2. DEMO USERS ────────────────────────────────────────────────────────
    console.log('2. Creating demo users...');
    // Hash password 'Demo@1234' once and reuse
    const passwordHash = await bcrypt.hash('Demo@1234', 10);

    const userRows = [];
    // 40 demo students
    for (let i = 1; i <= 40; i++) {
      userRows.push({
        name: INDIAN_STUDENT_NAMES[i - 1],
        email: `student${i}@demo.grainzero.com`,
        password_hash: passwordHash,
        role: 'student'
      });
    }

    // 1 demo admin
    userRows.push({
      name: 'Mess Warden',
      email: 'admin@demo.grainzero.com',
      password_hash: passwordHash,
      role: 'admin'
    });

    // 1 spam bot student
    userRows.push({
      name: 'Spam Bot',
      email: 'spam.bot@demo.grainzero.com',
      password_hash: passwordHash,
      role: 'student'
    });

    const insertedUsers = await batchInsert(
      client,
      'users',
      ['name', 'email', 'password_hash', 'role'],
      userRows
    );

    const studentUsers = insertedUsers.filter(u => u.email.startsWith('student'));
    const spamBotUser = insertedUsers.find(u => u.email === 'spam.bot@demo.grainzero.com');

    // ── 3. MENUS (Past 14 days + Today + Tomorrow = 16 days) ──────────────────
    console.log('3. Creating 16 days of meals & menus...');
    const mealTypes = ['breakfast', 'lunch', 'snacks', 'dinner'];
    const mealInsertRows = [];

    // Days: -14 to +1
    for (let dayOffset = -14; dayOffset <= 1; dayOffset++) {
      const { dateStr } = getKolkataDate(dayOffset);
      for (const mealType of mealTypes) {
        mealInsertRows.push({
          date: dateStr,
          meal_type: mealType,
          dayOffset // temporary tracking
        });
      }
    }

    const insertedMeals = await batchInsert(
      client,
      'meals',
      ['date', 'meal_type'],
      mealInsertRows.map(m => ({ date: m.date, meal_type: m.meal_type }))
    );

    // Map inserted meals with dayOffset
    const mealMap = [];
    for (let i = 0; i < insertedMeals.length; i++) {
      mealMap.push({
        ...insertedMeals[i],
        dayOffset: mealInsertRows[i].dayOffset
      });
    }

    // Dishes for each meal
    const dishInsertRows = [];
    for (const m of mealMap) {
      const dishNames = getDishesForMeal(m.dayOffset, m.meal_type);
      for (const name of dishNames) {
        dishInsertRows.push({
          meal_id: m.id,
          name
        });
      }
    }

    const insertedDishes = await batchInsert(
      client,
      'dishes',
      ['meal_id', 'name'],
      dishInsertRows
    );

    // Map dishes by meal_id
    const dishesByMealId = {};
    for (const d of insertedDishes) {
      if (!dishesByMealId[d.meal_id]) dishesByMealId[d.meal_id] = [];
      dishesByMealId[d.meal_id].push(d);
    }

    // ── 4. SKIPS & WALLET TRANSACTIONS ────────────────────────────────────────
    console.log('4. Generating skips & wallet credits...');
    const skipRows = [];
    const walletRows = [];
    const skippedUserMealSet = new Set(); // Key: `${user_id}_${meal_id}`

    // 4.1 Past meals skips
    const pastMeals = mealMap.filter(m => m.dayOffset < 0);
    for (const m of pastMeals) {
      const { dateStr, dayOfWeek } = getKolkataDate(m.dayOffset);
      const slotCost = slotCostMap[m.meal_type] || 4000;
      const creditPaise = Math.floor((slotCost * walletPercent) / 100);

      // Skip percentages: higher on Sunday dinner (22-28%) and early breakfast (18-24%)
      let skipRate = 0.08 + Math.random() * 0.08; // 8% - 16% base
      if (dayOfWeek === 0 && m.meal_type === 'dinner') {
        skipRate = 0.22 + Math.random() * 0.06; // 22% - 28%
      } else if ((dayOfWeek === 0 || dayOfWeek === 1) && m.meal_type === 'breakfast') {
        skipRate = 0.18 + Math.random() * 0.06; // 18% - 24%
      }

      const numSkips = Math.round(studentUsers.length * skipRate);
      // Pick random students
      const shuffledStudents = [...studentUsers].sort(() => Math.random() - 0.5);
      const selected = shuffledStudents.slice(0, numSkips);

      // Skip created 2 to 6 hours before cutoff
      const schedule = MEAL_SCHEDULE[m.meal_type];
      const skipHour = Math.max(0, schedule.cutoffHour - 3);
      const skipCreatedAt = `${dateStr}T${String(skipHour).padStart(2, '0')}:15:00+05:30`;

      for (const student of selected) {
        skippedUserMealSet.add(`${student.id}_${m.id}`);
        skipRows.push({
          user_id: student.id,
          meal_id: m.id,
          credit_paise: creditPaise,
          cancelled_at: null,
          created_at: skipCreatedAt
        });

        walletRows.push({
          user_id: student.id,
          type: 'skip_credit',
          amount_paise: creditPaise,
          meal_id: m.id,
          note: `Skip credit: ${m.meal_type} (${dateStr})`,
          created_at: skipCreatedAt
        });
      }
    }

    // 4.2 Today & Tomorrow skips (6 to 10 skips per meal for live headcount display)
    const upcomingMeals = mealMap.filter(m => m.dayOffset >= 0);
    for (const m of upcomingMeals) {
      const { dateStr } = getKolkataDate(m.dayOffset);
      const slotCost = slotCostMap[m.meal_type] || 4000;
      const creditPaise = Math.floor((slotCost * walletPercent) / 100);

      const numSkips = 6 + Math.floor(Math.random() * 5); // 6 to 10
      const shuffledStudents = [...studentUsers].sort(() => Math.random() - 0.5);
      const selected = shuffledStudents.slice(0, numSkips);

      const schedule = MEAL_SCHEDULE[m.meal_type];
      const skipHour = Math.max(0, schedule.cutoffHour - 2);
      const skipCreatedAt = `${dateStr}T${String(skipHour).padStart(2, '0')}:00:00+05:30`;

      for (const student of selected) {
        skippedUserMealSet.add(`${student.id}_${m.id}`);
        skipRows.push({
          user_id: student.id,
          meal_id: m.id,
          credit_paise: creditPaise,
          cancelled_at: null,
          created_at: skipCreatedAt
        });

        walletRows.push({
          user_id: student.id,
          type: 'skip_credit',
          amount_paise: creditPaise,
          meal_id: m.id,
          note: `Advance skip: ${m.meal_type} (${dateStr})`,
          created_at: skipCreatedAt
        });
      }
    }

    // 4.3 Add 4 cancelled skips for 4 random students (shows undo in wallet history)
    const randomStudentsForCancel = [...studentUsers].sort(() => Math.random() - 0.5).slice(0, 4);
    for (let c = 0; c < 4; c++) {
      const student = randomStudentsForCancel[c];
      // Pick a past meal they haven't skipped yet
      const candidateMeal = pastMeals.find(m => !skippedUserMealSet.has(`${student.id}_${m.id}`));
      if (candidateMeal) {
        skippedUserMealSet.add(`${student.id}_${candidateMeal.id}`);
        const { dateStr } = getKolkataDate(candidateMeal.dayOffset);
        const slotCost = slotCostMap[candidateMeal.meal_type] || 4000;
        const creditPaise = Math.floor((slotCost * walletPercent) / 100);

        const schedule = MEAL_SCHEDULE[candidateMeal.meal_type];
        const skipCreatedAt = `${dateStr}T${String(Math.max(0, schedule.cutoffHour - 4)).padStart(2, '0')}:00:00+05:30`;
        const cancelledAt = `${dateStr}T${String(Math.max(0, schedule.cutoffHour - 1)).padStart(2, '0')}:30:00+05:30`;

        skipRows.push({
          user_id: student.id,
          meal_id: candidateMeal.id,
          credit_paise: creditPaise,
          cancelled_at: cancelledAt,
          created_at: skipCreatedAt
        });

        // Credit transaction
        walletRows.push({
          user_id: student.id,
          type: 'skip_credit',
          amount_paise: creditPaise,
          meal_id: candidateMeal.id,
          note: `Skip credit: ${candidateMeal.meal_type} (${dateStr})`,
          created_at: skipCreatedAt
        });

        // Matching reversal transaction
        walletRows.push({
          user_id: student.id,
          type: 'skip_reversal',
          amount_paise: creditPaise,
          meal_id: candidateMeal.id,
          note: `Reversal for cancelled skip: ${candidateMeal.meal_type} (${dateStr})`,
          created_at: cancelledAt
        });
      }
    }

    const insertedSkips = await batchInsert(
      client,
      'skips',
      ['user_id', 'meal_id', 'credit_paise', 'cancelled_at', 'created_at'],
      skipRows
    );

    await batchInsert(
      client,
      'wallet_transactions',
      ['user_id', 'type', 'amount_paise', 'meal_id', 'note', 'created_at'],
      walletRows
    );

    // ── 5. RATINGS (Past 14 days only) ────────────────────────────────────────
    console.log('5. Generating student ratings...');
    const ratingRows = [];
    const ratingsByMealId = {};

    for (const m of pastMeals) {
      const { dateStr } = getKolkataDate(m.dayOffset);
      const dishes = dishesByMealId[m.id] || [];
      const schedule = MEAL_SCHEDULE[m.meal_type];
      ratingsByMealId[m.id] = [];

      for (const student of studentUsers) {
        // Students who skipped this meal MUST NOT rate its dishes
        if (skippedUserMealSet.has(`${student.id}_${m.id}`)) {
          continue;
        }

        for (const dish of dishes) {
          // Each student rates roughly 60% of the dishes of meals they did not skip
          if (Math.random() > 0.60) continue;

          const mean = getDishMean(dish.name, m.dayOffset);
          const stars = pickStars(mean);

          // ~35% get comments
          let comment = null;
          if (Math.random() < 0.35) {
            comment = pickComment(dish.name, stars, m.dayOffset);
          }

          // Timestamp shortly after meal end time
          const minuteOffset = Math.floor(Math.random() * 45);
          const ratingSec = Math.floor(Math.random() * 60);
          const ratingTime = `${dateStr}T${String(schedule.ratingHour).padStart(2, '0')}:${String(minuteOffset).padStart(2, '0')}:${String(ratingSec).padStart(2, '0')}+05:30`;

          const rObj = {
            user_id: student.id,
            dish_id: dish.id,
            stars,
            comment,
            flagged: false,
            flag_reason: null,
            created_at: ratingTime
          };

          ratingRows.push(rObj);
          ratingsByMealId[m.id].push(stars);
        }
      }
    }

    // ── 6. SPAM STORY (spam.bot rates 20 dishes with 5 stars in 1 min) ─────────
    console.log('6. Injecting spam bot pattern...');
    if (spamBotUser) {
      // Pick 20 distinct dishes from recent past meals (days -1 and -2)
      const recentDishes = [];
      for (const m of pastMeals.filter(m => m.dayOffset >= -2)) {
        for (const d of dishesByMealId[m.id] || []) {
          if (!recentDishes.some(x => x.id === d.id)) {
            recentDishes.push(d);
          }
        }
      }

      const spamDishes = recentDishes.slice(0, 20);
      const { dateStr: yesterdayStr } = getKolkataDate(-1);

      // Within 1 single minute (e.g. 21:45:00 to 21:45:38)
      for (let sIdx = 0; sIdx < spamDishes.length; sIdx++) {
        const dish = spamDishes[sIdx];
        const sec = sIdx * 2; // spaced 2s apart
        const spamTime = `${yesterdayStr}T21:45:${String(sec).padStart(2, '0')}+05:30`;

        ratingRows.push({
          user_id: spamBotUser.id,
          dish_id: dish.id,
          stars: 5,
          comment: 'good good good',
          flagged: true,
          flag_reason: 'More than 5 ratings within 1 minute from one user',
          created_at: spamTime
        });
      }
    }

    const insertedRatings = await batchInsert(
      client,
      'ratings',
      ['user_id', 'dish_id', 'stars', 'comment', 'flagged', 'flag_reason', 'created_at'],
      ratingRows
    );

    // ── 7. WASTE LOGS (Past meals) ────────────────────────────────────────────
    console.log('7. Logging kitchen waste based on dish ratings...');
    const wasteRows = [];

    for (const m of pastMeals) {
      const { dateStr } = getKolkataDate(m.dayOffset);
      const schedule = MEAL_SCHEDULE[m.meal_type];

      // Calculate meal's average rating
      const starsArr = ratingsByMealId[m.id] || [];
      const avgRating = starsArr.length > 0
        ? starsArr.reduce((a, b) => a + b, 0) / starsArr.length
        : 3.2;

      // Cooked kg: based on ~40kg per meal
      let baseCooked = 40.0;
      if (m.meal_type === 'breakfast') baseCooked = 34.0;
      else if (m.meal_type === 'snacks') baseCooked = 24.0;
      else if (m.meal_type === 'lunch') baseCooked = 44.0;
      else if (m.meal_type === 'dinner') baseCooked = 42.0;

      const cookedKg = +(baseCooked + (Math.random() * 6 - 3)).toFixed(1);

      // Leftover ratio depends on rating:
      // low-rated meals (<= 2.5) leave 20 to 30%
      // loved meals (>= 4.0) leave 4 to 8%
      let leftoverRatio;
      if (avgRating <= 2.5) {
        leftoverRatio = 0.20 + Math.random() * 0.10; // 20% to 30%
      } else if (avgRating >= 4.0) {
        leftoverRatio = 0.04 + Math.random() * 0.04; // 4% to 8%
      } else {
        // Proportional interpolate between 8% and 20%
        const t = (avgRating - 2.5) / 1.5; // 0.0 (at 2.5) to 1.0 (at 4.0)
        leftoverRatio = (0.20 - (t * 0.12)) + (Math.random() * 0.03 - 0.015);
        leftoverRatio = Math.max(0.06, Math.min(0.24, leftoverRatio));
      }

      const leftoverKg = +(cookedKg * leftoverRatio).toFixed(1);
      const wasteCreatedAt = `${dateStr}T${String(schedule.endHour).padStart(2, '0')}:45:00+05:30`;

      wasteRows.push({
        meal_id: m.id,
        cooked_kg: cookedKg,
        leftover_kg: leftoverKg,
        created_at: wasteCreatedAt
      });
    }

    const insertedWaste = await batchInsert(
      client,
      'waste_logs',
      ['meal_id', 'cooked_kg', 'leftover_kg', 'created_at'],
      wasteRows
    );

    // Commit transaction!
    await client.query('COMMIT');
    console.log('✅ Demo seed transaction committed successfully!');

    // Run suspicious rating scanner on the freshly seeded ratings
    try {
      await scanAll();
      console.log('✅ Suspicious scanner completed on demo ratings');
    } catch (scanErr) {
      console.error('Warning: post-seed scanAll error:', scanErr.message);
    }

    res.json({
      success: true,
      message: 'Demo data seeded successfully.',
      counts: {
        students: studentUsers.length + 1, // 40 + spam.bot
        meals: insertedMeals.length,
        dishes: insertedDishes.length,
        ratings: insertedRatings.length,
        skips: insertedSkips.length,
        waste_logs: insertedWaste.length
      },
      demoLogins: {
        student: 'student1@demo.grainzero.com',
        admin: 'admin@demo.grainzero.com',
        password: 'Demo@1234'
      }
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Demo seed failed:', err);
    res.status(500).json({ error: err.message || 'Failed to seed demo data.' });
  } finally {
    client.release();
  }
}

// Mount both routes so /api/admin/seed matches
router.post('/seed', requireRole('admin'), executeSeed);
router.post('/', requireRole('admin'), executeSeed);

module.exports = router;
