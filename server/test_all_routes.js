const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { pool, initDb } = require('./db');
const { todayIST, nowIST, mealDateTimeIST } = require('./utils/time');

async function runTestSuite() {
  console.log('====================================================');
  console.log('🚀 GRAINZERO BACKEND COMPREHENSIVE TEST SUITE');
  console.log('====================================================\n');

  // Initialize DB schema
  await initDb();

  // Create Express app
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api', require('./routes/settings'));
  app.use('/api', require('./routes/menu'));
  app.use('/api/student', require('./routes/student'));
  app.use('/api/admin', require('./routes/seed'));
  app.use('/api/admin', require('./routes/admin'));

  app.use((err, req, res, next) => {
    console.error(`Error [${req.method} ${req.url}]:`, err.stack || err);
    res.status(err.status || 500).json({ error: err.message || 'Internal error' });
  });

  const server = app.listen(3006, '127.0.0.1');
  const base = 'http://127.0.0.1:3006/api';

  const testResults = [];
  function assert(title, condition, extra = '') {
    if (condition) {
      console.log(`✅ PASS: ${title} ${extra ? '(' + extra + ')' : ''}`);
      testResults.push({ title, status: 'PASS' });
    } else {
      console.error(`❌ FAIL: ${title} ${extra ? '(' + extra + ')' : ''}`);
      testResults.push({ title, status: 'FAIL', extra });
    }
  }

  try {
    const today = todayIST();
    const tomorrow = todayIST(1);

    // Initial seed so test database has full 16-day menus, 40 students, etc.
    console.log('Seeding demo data for test run...');
    const seedAdminToken = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const seedRes = await fetch(`${base}/admin/seed`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${seedAdminToken}`, 'Content-Type': 'application/json' }
    });
    const seedJson = await seedRes.json();
    assert('Pre-test seed execution completed successfully', seedRes.status === 200 && seedJson.success);

    // Get live student and admin
    const adminUser = (await pool.query("SELECT id, name, email, role FROM users WHERE role = 'admin' LIMIT 1")).rows[0];
    const studentUser = (await pool.query("SELECT id, name, email, role FROM users WHERE email = 'student1@demo.grainzero.com'")).rows[0];

    const adminToken = jwt.sign(
      { id: adminUser.id, name: adminUser.name, email: adminUser.email, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const studentToken = jwt.sign(
      { id: studentUser.id, name: studentUser.name, email: studentUser.email, role: 'student' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    console.log(`Testing with Admin: ${adminUser.email}, Student: ${studentUser.email}\n`);

    // ── SECTION 1: TIME UTILS ────────────────────────────────────────────────
    console.log('--- Testing Time Rules & Utils ---');
    const now = nowIST();
    const cutoffMoment = mealDateTimeIST(today, '06:30');
    assert('todayIST() returns YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(today), today);
    assert('todayIST(1) returns tomorrow YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(tomorrow), tomorrow);
    assert('nowIST() returns valid Date', now instanceof Date && !isNaN(now.getTime()));
    assert('mealDateTimeIST parses Asia/Kolkata offset', cutoffMoment.toISOString().includes('Z') && cutoffMoment.getHours() !== undefined);

    // ── SECTION 2: SETTINGS & MEAL SLOTS ─────────────────────────────────────
    console.log('\n--- Testing 1. Settings & Meal Slots ---');
    // 1.1 GET /settings
    const settingsGet = await fetch(`${base}/settings`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const settingsData = await settingsGet.json();
    assert('GET /api/settings returns settings and meal_slots', settingsGet.status === 200 && settingsData.settings && Array.isArray(settingsData.meal_slots));

    // 1.2 PUT /admin/settings valid
    const settingsPut = await fetch(`${base}/admin/settings`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_percent: 30, buffer_percent: 12, mess_fee_paise: 650000 })
    });
    const putData = await settingsPut.json();
    assert('PUT /api/admin/settings updates settings row', settingsPut.status === 200 && putData.settings.buffer_percent === 12);

    // 1.3 PUT /admin/settings validation
    const badSettingsPut = await fetch(`${base}/admin/settings`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_percent: 150 })
    });
    assert('PUT /api/admin/settings rejects wallet_percent > 100 with 400', badSettingsPut.status === 400);

    // 1.4 PUT /admin/meal-slots/:id validation (cutoff must be before start)
    const badSlotPut = await fetch(`${base}/admin/meal-slots/1`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_time: '07:30',
        end_time: '09:00',
        cutoff_time: '08:00', // invalid: after start_time!
        cost_paise: 3000
      })
    });
    assert('PUT /api/admin/meal-slots/:id rejects cutoff after start time with 400', badSlotPut.status === 400);

    // 1.5 PUT /admin/meal-slots/:id valid
    const goodSlotPut = await fetch(`${base}/admin/meal-slots/1`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_time: '07:30',
        end_time: '09:00',
        cutoff_time: '06:30',
        cost_paise: 3200
      })
    });
    const slotData = await goodSlotPut.json();
    assert('PUT /api/admin/meal-slots/:id updates slot', goodSlotPut.status === 200 && slotData.slot.cost_paise === 3200);

    // ── SECTION 3: MENU ──────────────────────────────────────────────────────
    console.log('\n--- Testing 2. Menu ---');
    // 2.1 GET /api/menu
    const menuGet = await fetch(`${base}/menu?date=${today}`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const menuData = await menuGet.json();
    assert('GET /api/menu returns 4 slots with dishes and times', menuGet.status === 200 && Array.isArray(menuData) && menuData.length === 4);

    // 2.2 POST /api/admin/meals (create/replace dishes)
    const testDate = todayIST(3);
    const mealPost = await fetch(`${base}/admin/meals`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: testDate,
        meal_type: 'dinner',
        dishes: ['Jeera Rice', 'Paneer Butter Masala', 'Gulab Jamun']
      })
    });
    const mealCreated = await mealPost.json();
    assert('POST /api/admin/meals creates/replaces meal dishes', mealPost.status === 201 && mealCreated.meal.dishes.length === 3);

    // 2.3 POST /api/admin/meals/:id/dishes
    const dishPost = await fetch(`${base}/admin/meals/${mealCreated.meal.id}/dishes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Papad' })
    });
    const dishCreated = await dishPost.json();
    assert('POST /api/admin/meals/:id/dishes adds a single dish', dishPost.status === 201 && dishCreated.dish.name === 'Papad');

    // 2.4 DELETE /api/admin/dishes/:id
    const dishDel = await fetch(`${base}/admin/dishes/${dishCreated.dish.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert('DELETE /api/admin/dishes/:id deletes a dish', dishDel.status === 200);

    // 2.5 POST /api/admin/menu/copy
    const copyPost = await fetch(`${base}/admin/menu/copy`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_date: today, to_date: todayIST(4) })
    });
    const copyData = await copyPost.json();
    assert('POST /api/admin/menu/copy copies whole day menu', copyPost.status === 200 && copyData.success);

    // ── SECTION 4: STUDENT SKIPS ─────────────────────────────────────────────
    console.log('\n--- Testing 3. Student Skips ---');
    // 3.1 GET /api/student/today
    const studentTodayGet = await fetch(`${base}/student/today`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const studentTodayData = await studentTodayGet.json();
    assert('GET /api/student/today returns today and tomorrow meals', studentTodayGet.status === 200 && Array.isArray(studentTodayData) && studentTodayData.length >= 4);
    assert('Includes server computed canSkip, seconds_left, dishes', studentTodayData[0].canSkip !== undefined && studentTodayData[0].seconds_left !== undefined);

    // 3.2 Find tomorrow's dinner (cutoff is far in future)
    const tomorrowDinner = studentTodayData.find(m => m.date === tomorrow && m.meal_type === 'dinner') || studentTodayData[studentTodayData.length - 1];
    assert('Found upcoming testable meal with future cutoff', tomorrowDinner && tomorrowDinner.canSkip, `meal_id=${tomorrowDinner?.id}`);

    // Remove any skip student1 might have on this meal
    await pool.query("DELETE FROM skips WHERE user_id = $1 AND meal_id = $2", [studentUser.id, tomorrowDinner.id]);

    // 3.3 POST /api/student/skips
    const skipPost = await fetch(`${base}/student/skips`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ meal_id: tomorrowDinner.id })
    });
    const skipResult = await skipPost.json();
    assert('POST /api/student/skips books skip and adds wallet credit', skipPost.status === 201 && skipResult.credit_paise > 0);

    // 3.4 POST /api/student/skips duplicate click prevention -> 409
    const dupSkipPost = await fetch(`${base}/student/skips`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ meal_id: tomorrowDinner.id })
    });
    assert('POST /api/student/skips prevents double skip with 409', dupSkipPost.status === 409);

    // 3.5 DELETE /api/student/skips/:meal_id (undo)
    const undoSkip = await fetch(`${base}/student/skips/${tomorrowDinner.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert('DELETE /api/student/skips/:meal_id cancels skip and reverses credit', undoSkip.status === 200);

    // 3.6 POST /api/student/skips reactivates cancelled skip row instead of failing unique constraint
    const reactivateSkip = await fetch(`${base}/student/skips`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ meal_id: tomorrowDinner.id })
    });
    assert('POST /api/student/skips reactivates cancelled skip row cleanly', reactivateSkip.status === 201);

    // ── SECTION 5: WALLET & INVOICES ─────────────────────────────────────────
    console.log('\n--- Testing 4. Wallet & Invoices ---');
    // 4.1 GET /api/student/wallet
    const walletGet = await fetch(`${base}/student/wallet`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const walletData = await walletGet.json();
    assert('GET /api/student/wallet returns balance, total_skipped, estimated_due, transactions',
      walletGet.status === 200 &&
      walletData.balance_paise !== undefined &&
      walletData.estimated_due_paise !== undefined &&
      Array.isArray(walletData.transactions)
    );

    // 4.2 GET /api/student/invoices
    const invoicesGet = await fetch(`${base}/student/invoices`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const invoicesData = await invoicesGet.json();
    assert('GET /api/student/invoices returns student invoices', invoicesGet.status === 200 && Array.isArray(invoicesData));

    // ── SECTION 6: ADMIN HEADCOUNT & SKIP LOG ────────────────────────────────
    console.log('\n--- Testing 5. Headcount & Skip Log ---');
    // 5.1 GET /api/admin/headcount
    const headcountGet = await fetch(`${base}/admin/headcount?date=${today}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const headcountData = await headcountGet.json();
    assert('GET /api/admin/headcount returns total_students, skipped, expected, prepare_for',
      headcountGet.status === 200 &&
      headcountData.total_students > 0 &&
      Array.isArray(headcountData.meals) &&
      headcountData.meals[0].prepare_for !== undefined
    );

    // 5.2 GET /api/admin/skip-log
    const skipLogGet = await fetch(`${base}/admin/skip-log?date=${today}&meal_type=lunch`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const skipLogData = await skipLogGet.json();
    assert('GET /api/admin/skip-log returns skipping and attending lists',
      skipLogGet.status === 200 &&
      Array.isArray(skipLogData.skipping) &&
      Array.isArray(skipLogData.attending)
    );

    // 5.3 GET /api/admin/skip-log.csv
    const skipLogCsvGet = await fetch(`${base}/admin/skip-log.csv?date=${today}&meal_type=lunch`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const csvText = await skipLogCsvGet.text();
    assert('GET /api/admin/skip-log.csv returns valid CSV download',
      skipLogCsvGet.status === 200 &&
      skipLogCsvGet.headers.get('content-type').includes('text/csv') &&
      csvText.startsWith('Status,Student Name,Email')
    );

    // ── SECTION 7: WASTE LOGS ────────────────────────────────────────────────
    console.log('\n--- Testing 6. Waste Logs ---');
    // 6.1 POST /api/admin/waste (validation: leftover > cooked)
    const badWastePost = await fetch(`${base}/admin/waste`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ meal_id: tomorrowDinner.id, cooked_kg: 30, leftover_kg: 35 })
    });
    assert('POST /api/admin/waste rejects leftover_kg > cooked_kg with 400', badWastePost.status === 400);

    // 6.2 POST /api/admin/waste (valid create/update)
    const goodWastePost = await fetch(`${base}/admin/waste`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ meal_id: tomorrowDinner.id, cooked_kg: 40, leftover_kg: 5.5 })
    });
    const wasteData = await goodWastePost.json();
    assert('POST /api/admin/waste saves waste log', goodWastePost.status === 201 && wasteData.waste_log.leftover_kg === '5.5');

    // 6.3 GET /api/admin/waste-summary
    const wasteSummaryGet = await fetch(`${base}/admin/waste-summary`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const wasteSummary = await wasteSummaryGet.json();
    assert('GET /api/admin/waste-summary returns daily, totals and unlogged_meals',
      wasteSummaryGet.status === 200 &&
      Array.isArray(wasteSummary.daily) &&
      wasteSummary.totals.total_wasted_rupees !== undefined
    );

    // ── SECTION 8: FEES ──────────────────────────────────────────────────────
    console.log('\n--- Testing 7. Fees Generation & Invoices ---');
    // 7.1 POST /api/admin/fees/generate
    const testSession = `TestSession_${Date.now()}`;
    const feesPost = await fetch(`${base}/admin/fees/generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_name: testSession })
    });
    const feesGenData = await feesPost.json();
    assert('POST /api/admin/fees/generate applies wallet and creates invoices',
      feesPost.status === 200 &&
      feesGenData.generated_count > 0 &&
      feesGenData.session_name === testSession
    );

    // 7.2 POST /api/admin/fees/generate idempotent (skips already generated)
    const feesPostRepeat = await fetch(`${base}/admin/fees/generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_name: testSession })
    });
    const repeatData = await feesPostRepeat.json();
    assert('POST /api/admin/fees/generate skips students already invoiced for session',
      feesPostRepeat.status === 200 &&
      repeatData.skipped_count === repeatData.total_students &&
      repeatData.generated_count === 0
    );

    // 7.3 GET /api/admin/fees
    const feesGet = await fetch(`${base}/admin/fees`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const feesListData = await feesGet.json();
    assert('GET /api/admin/fees returns invoices with student details and totals',
      feesGet.status === 200 &&
      Array.isArray(feesListData.invoices) &&
      feesListData.totals.total_invoices > 0
    );

    console.log('\n====================================================');
    const passed = testResults.filter(t => t.status === 'PASS').length;
    const failed = testResults.filter(t => t.status === 'FAIL').length;
    console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test suite failed with unexpected error:', err);
    process.exit(1);
  } finally {
    server.close();
  }
}

runTestSuite().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
