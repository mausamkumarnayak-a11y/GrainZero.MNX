import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import api from '../../api';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import AnimatedCoverBanner from '../../components/AnimatedCoverBanner';
import AnimatedPage from '../../components/AnimatedPage';
import AnimatedCounter from '../../components/AnimatedCounter';
import Plate from '../../components/art/Plate';
import Tree from '../../components/art/Tree';
import SkeletonLoader from '../../components/SkeletonLoader';
import './Dashboard.css';

export default function AdminDashboard() {
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedResult, setSeedResult]   = useState(null);
  const [seedError, setSeedError]     = useState('');
  const [copied, setCopied]           = useState(false);

  // Live dashboard state
  const [dataLoading, setDataLoading] = useState(true);
  const [headcount, setHeadcount]     = useState(null);
  const [wasteSummary, setWasteSummary] = useState(null);
  const [overallRating, setOverallRating] = useState('—');
  const [wasteForm, setWasteForm]     = useState({ meal_id: '', cooked_kg: '', leftover_kg: '', submitting: false });
  const [wasteNotice, setWasteNotice] = useState({ type: '', text: '' });

  async function loadDashboardData() {
    setDataLoading(true);
    try {
      const [hcRes, wsRes, anRes] = await Promise.all([
        api.get('/admin/headcount').catch(() => ({ data: null })),
        api.get('/admin/waste-summary').catch(() => ({ data: null })),
        api.get('/admin/analytics').catch(() => ({ data: { dishes: [] } }))
      ]);

      setHeadcount(hcRes.data);
      setWasteSummary(wsRes.data);

      const dishes = anRes.data?.dishes || [];
      const rated = dishes.filter(d => d.rating_count > 0);
      if (rated.length > 0) {
        const sum = rated.reduce((acc, d) => acc + d.avg_stars, 0);
        setOverallRating((sum / rated.length).toFixed(1));
      }

      if (wsRes.data?.unlogged_meals?.length > 0) {
        setWasteForm(prev => ({ ...prev, meal_id: wsRes.data.unlogged_meals[0].id }));
      }
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    } finally {
      setDataLoading(false);
    }
  }

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function handleLoadDemoData(e) {
    const ok = window.confirm(
      'This replaces existing demo menus, ratings, skips and waste logs with 16 days of realistic data. Real user accounts are preserved.'
    );
    if (!ok) return;

    const rect = e?.currentTarget?.getBoundingClientRect();
    setSeedLoading(true);
    setSeedError('');
    setSeedResult(null);
    setCopied(false);

    try {
      const { data } = await api.post('/admin/seed');
      setSeedResult(data);

      // Trigger celebration confetti
      if (rect) {
        confetti({
          particleCount: 50,
          spread: 70,
          origin: {
            x: (rect.left + rect.width / 2) / window.innerWidth,
            y: (rect.top + rect.height / 2) / window.innerHeight
          },
          colors: ['#15803d', '#4cae4c', '#F2B01E', '#EAF3DE']
        });
      }

      loadDashboardData();
    } catch (err) {
      const serverMsg = err.response?.data?.error;
      const networkMsg = err.message ? `Request failed: ${err.message}` : 'Failed to connect to server.';
      setSeedError(serverMsg || networkMsg);
      console.error('Demo seed error:', err);
    } finally {
      setSeedLoading(false);
    }
  }

  function handleCopyCredentials() {
    const credsText = `GrainZero Demo Logins:
Student: student1@demo.grainzero.com
Admin: admin@demo.grainzero.com
Password: Demo@1234`;
    navigator.clipboard.writeText(credsText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  async function handleLogWaste(e) {
    e.preventDefault();
    if (!wasteForm.meal_id || !wasteForm.cooked_kg || !wasteForm.leftover_kg) {
      alert('Please fill out all leftover log fields.');
      return;
    }

    setWasteForm(prev => ({ ...prev, submitting: true }));
    setWasteNotice({ type: '', text: '' });

    try {
      await api.post('/admin/waste', {
        meal_id: parseInt(wasteForm.meal_id, 10),
        cooked_kg: parseFloat(wasteForm.cooked_kg),
        leftover_kg: parseFloat(wasteForm.leftover_kg)
      });
      setWasteNotice({ type: 'success', text: 'Leftover log saved successfully!' });
      setWasteForm(prev => ({ ...prev, cooked_kg: '', leftover_kg: '', submitting: false }));
      loadDashboardData();
    } catch (err) {
      setWasteNotice({
        type: 'error',
        text: err.response?.data?.error || 'Failed to save waste log.'
      });
      setWasteForm(prev => ({ ...prev, submitting: false }));
    }
  }

  // KPI Calculations
  const totalStudents = headcount?.total_students || 40;
  const platesToPrepareToday = headcount?.meals?.reduce((acc, m) => acc + (m.prepare_for || 0), 0) || 0;
  const totalWastedKg = wasteSummary?.totals?.total_leftover_kg || 0;
  const totalWastedRupees = wasteSummary?.totals?.total_wasted_rupees || 0;
  const platesSavedBySkips = headcount?.meals?.reduce((acc, m) => acc + (m.skipped_count || 0), 0) || 0;
  const kgFoodSaved = Math.round(platesSavedBySkips * 0.45 * 10) / 10;

  // Chart data
  const chartData = (wasteSummary?.daily || []).slice(-10).map(item => ({
    date: item.date.slice(5),
    leftover: item.leftover_kg,
    cooked: item.cooked_kg
  }));

  // Plate Map Grid: 40 plate slots (each plate = 5 students for 200 student capacity)
  const totalPlateSlots = 40;
  // Calculate how many plates correspond to skipped vs attending
  const skippedPlatesCount = Math.min(
    totalPlateSlots,
    Math.round((platesSavedBySkips / Math.max(1, totalStudents * 4)) * totalPlateSlots)
  );

  return (
    <AnimatedPage className="home-page admin-dashboard-page">
      {/* Animated Cover Banner */}
      <AnimatedCoverBanner />

      <div className="page-header-block">
        <h1 className="page-title">Mess Authority Dashboard</h1>
        <p className="cs-tag">Live Kitchen Demand & Waste Prevention Console</p>
      </div>

      {dataLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="kpi-grid">
            {[1, 2, 3, 4].map(n => <SkeletonLoader key={n} type="card" height={100} />)}
          </div>
          <SkeletonLoader type="card" height={110} />
          <SkeletonLoader type="card" height={220} />
        </div>
      ) : (
        <>
          {/* ── 4 KPI Stat Cards with Count-Up ────────────────────────────────── */}
          <div className="kpi-grid">
            <motion.div className="kpi-card card" whileHover={{ y: -3 }}>
              <span className="kpi-icon">👥</span>
              <div>
                <div className="kpi-val">
                  <AnimatedCounter value={totalStudents} duration={700} />
                </div>
                <div className="kpi-lbl">Total Enrolled Students</div>
              </div>
            </motion.div>

            <motion.div className="kpi-card card highlight-kpi" whileHover={{ y: -3 }}>
              <span className="kpi-icon">🍽️</span>
              <div>
                <div className="kpi-val highlight-text">
                  <AnimatedCounter value={platesToPrepareToday} duration={850} />
                </div>
                <div className="kpi-lbl">Plates to Prepare Today</div>
              </div>
            </motion.div>

            <motion.div className="kpi-card card" whileHover={{ y: -3 }}>
              <span className="kpi-icon">🗑️</span>
              <div>
                <div className="kpi-val">
                  <AnimatedCounter value={totalWastedKg} decimals={1} suffix=" kg" duration={800} />
                </div>
                <div className="kpi-lbl">Waste (14d) • ₹{totalWastedRupees}</div>
              </div>
            </motion.div>

            <motion.div className="kpi-card card" whileHover={{ y: -3 }}>
              <span className="kpi-icon">⭐</span>
              <div>
                <div className="kpi-val">
                  <AnimatedCounter
                    value={Number(overallRating) || 0}
                    decimals={1}
                    suffix=" / 5"
                    duration={750}
                  />
                </div>
                <div className="kpi-lbl">Average Student Rating</div>
              </div>
            </motion.div>
          </div>

          {/* ── Plates Saved & Eco Tree Card ──────────────────────────────────── */}
          <div className="plates-saved-banner card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flex: 1 }}>
              <Tree savedKg={kgFoodSaved} size={64} />
              <div>
                <span className="saved-number">
                  <AnimatedCounter value={platesSavedBySkips} suffix=" Plates Saved Today" duration={800} />
                </span>
                <span className="saved-desc">
                  Proactive student meal skips prevented ~{kgFoodSaved} kg of fresh hostel food from overcooking and ending in bins.
                </span>
              </div>
            </div>
          </div>

          {/* ── Live Plate Map Grid ────────────────────────────────────────── */}
          <div className="dashboard-section card">
            <div className="section-head">
              <div>
                <h2 className="section-title">🗺️ Live Dining Plate Map</h2>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                  Visual dining hall status (1 plate icon = 5 hostel students). Solid: attending; Dashed: proactively skipped.
                </p>
              </div>
              <div className="plate-map-legend">
                <span className="legend-item"><Plate isSkipped={false} size={20} /> Attending</span>
                <span className="legend-item"><Plate isSkipped={true} size={20} /> Skipped</span>
              </div>
            </div>

            <div className="plate-grid">
              {Array.from({ length: totalPlateSlots }).map((_, i) => {
                const isSkipped = i < skippedPlatesCount;
                return (
                  <motion.div
                    key={i}
                    className="plate-slot"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{
                      delay: i * 0.012,
                      type: 'spring',
                      stiffness: 300,
                      damping: 24
                    }}
                    title={isSkipped ? 'Skipped (5 students)' : 'Attending (5 students)'}
                  >
                    <Plate isSkipped={isSkipped} size={30} />
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* ── Today's Kitchen Production Plan ───────────────────────────── */}
          <div className="dashboard-section card">
            <div className="section-head">
              <h2 className="section-title">📋 Today's Kitchen Production Plan</h2>
              <span className="section-badge">Buffer: {headcount?.meals?.[0]?.buffer_percent ?? 10}%</span>
            </div>

            {!headcount?.meals || headcount.meals.length === 0 ? (
              <div className="empty-state">No meal schedule found for today. Seed demo data below!</div>
            ) : (
              <div className="table-responsive">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Meal Slot</th>
                      <th>Timings</th>
                      <th>Cutoff</th>
                      <th>Total Enrolled</th>
                      <th>Skipped</th>
                      <th>Expected</th>
                      <th>Buffer</th>
                      <th style={{ textAlign: 'right' }}>PREPARE FOR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {headcount.meals.map(m => {
                      const prepRatio = m.total_students > 0 ? (m.prepare_for / m.total_students) : 1;
                      return (
                        <tr key={m.meal_type}>
                          <td>
                            <strong className="meal-type-badge">{m.meal_type.toUpperCase()}</strong>
                          </td>
                          <td>{m.start_time} – {m.end_time}</td>
                          <td className="text-muted">{m.cutoff_time}</td>
                          <td>{m.total_students}</td>
                          <td>
                            <span className="skipped-chip">-{m.skipped_count}</span>
                          </td>
                          <td>{m.expected_count}</td>
                          <td>+{m.buffer_percent}%</td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                              <strong className="prepare-for-badge">
                                <AnimatedCounter value={m.prepare_for} suffix=" plates" duration={600} />
                              </strong>
                              {/* Animated visual progress bar */}
                              <div style={{ width: 80, height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${Math.min(100, Math.round(prepRatio * 100))}%` }}
                                  transition={{ duration: 0.8, ease: 'easeOut' }}
                                  style={{ height: '100%', background: '#15803d' }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Waste Chart & Log Leftovers Side by Side ───────────────────── */}
          <div className="dashboard-columns">
            <div className="dashboard-section card column-chart">
              <h2 className="section-title">📊 Food Waste Trends (kg / Day)</h2>
              <p className="chart-subtitle">Leftover food recorded by hostel mess staff</p>

              <div style={{ width: '100%', height: 260 }}>
                {chartData.length === 0 ? (
                  <div className="empty-state">No waste logs recorded yet.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 15, right: 15, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(val) => [`${val} kg`, 'Leftover Food']}
                        labelFormatter={(label) => `Date: ${label}`}
                      />
                      <Bar
                        dataKey="leftover"
                        fill="#ef4444"
                        radius={[4, 4, 0, 0]}
                        name="Waste (kg)"
                        isAnimationActive={true}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="dashboard-section card column-form">
              <h2 className="section-title">✍️ Log Kitchen Leftovers</h2>
              <p className="chart-subtitle">Record cooked volume vs leftovers after dining finishes</p>

              {wasteNotice.text && (
                <div
                  className={`alert ${wasteNotice.type === 'success' ? 'alert-success' : 'alert-error'}`}
                  style={{ padding: '0.5rem 0.75rem', fontSize: '0.82rem', marginBottom: '0.75rem' }}
                >
                  {wasteNotice.text}
                </div>
              )}

              <form onSubmit={handleLogWaste} className="waste-form">
                <div className="field">
                  <label>Select Meal</label>
                  <select
                    value={wasteForm.meal_id}
                    onChange={e => setWasteForm(prev => ({ ...prev, meal_id: e.target.value }))}
                    required
                  >
                    <option value="">-- Choose meal --</option>
                    {wasteSummary?.unlogged_meals?.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.date} • {m.meal_type.toUpperCase()}
                      </option>
                    ))}
                    {headcount?.meals?.map(m => (
                      <option key={`today-${m.id}`} value={m.id}>
                        Today • {m.meal_type.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Cooked (kg)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="e.g. 45"
                      value={wasteForm.cooked_kg}
                      onChange={e => setWasteForm(prev => ({ ...prev, cooked_kg: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="field" style={{ flex: 1 }}>
                    <label>Leftover (kg)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="e.g. 6.5"
                      value={wasteForm.leftover_kg}
                      onChange={e => setWasteForm(prev => ({ ...prev, leftover_kg: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={wasteForm.submitting}
                  style={{ width: '100%', marginTop: '0.5rem' }}
                >
                  {wasteForm.submitting ? 'Saving…' : 'Save Leftover Record'}
                </button>
              </form>
            </div>
          </div>

          {/* ── Demo Seed Button with Pulsing Dot & Confetti ───────────── */}
          <div className="demo-tools-card card" style={{ marginTop: '2rem' }}>
            <div className="demo-tools-header">
              <h2 className="demo-tools-title">🛠️ Demo Seed & Reset Tools</h2>
              <p className="demo-tools-subtitle">
                Populate 16 days of Indian hostel menus, 40 student accounts, ratings, skips, and waste logs for live demonstration.
              </p>
            </div>

            <div className="demo-actions">
              <button
                type="button"
                className="btn btn-seed-demo"
                onClick={handleLoadDemoData}
                disabled={seedLoading}
              >
                {seedLoading ? (
                  <span className="btn-spinner-wrap">
                    <span className="spinner" /> Seeding demo data…
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="pulsing-green-dot" />
                    🌱 Seed Demo Data (Fast)
                  </span>
                )}
              </button>
            </div>

            {seedError && <p className="alert alert-error">{seedError}</p>}

            {seedResult && (
              <motion.div
                className="demo-result-box"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', damping: 25 }}
              >
                <div className="result-header">
                  <motion.span
                    className="result-check"
                    initial={{ scale: 0 }}
                    animate={{ scale: [0, 1.3, 1] }}
                    transition={{ duration: 0.4 }}
                  >
                    ✓
                  </motion.span>
                  <strong>Demo Data Seeded Successfully!</strong>
                </div>

                <div className="counts-grid">
                  <div className="count-stat">
                    <div className="count-val">{seedResult.counts?.students ?? 41}</div>
                    <div className="count-lbl">Students</div>
                  </div>
                  <div className="count-stat">
                    <div className="count-val">{seedResult.counts?.meals ?? 64}</div>
                    <div className="count-lbl">Meals (16 days)</div>
                  </div>
                  <div className="count-stat">
                    <div className="count-val">{seedResult.counts?.ratings ?? 4000}+</div>
                    <div className="count-lbl">Student Ratings</div>
                  </div>
                  <div className="count-stat">
                    <div className="count-val">{seedResult.counts?.waste_logs ?? 56}</div>
                    <div className="count-lbl">Waste Logs</div>
                  </div>
                </div>

                <div className="demo-credentials-box">
                  <div className="creds-title">🔑 Demo Logins</div>
                  <div className="creds-row">
                    <span className="creds-label">Student:</span>
                    <span className="creds-val">{seedResult.demoLogins?.student || 'student1@demo.grainzero.com'}</span>
                  </div>
                  <div className="creds-row">
                    <span className="creds-label">Admin:</span>
                    <span className="creds-val">{seedResult.demoLogins?.admin || 'admin@demo.grainzero.com'}</span>
                  </div>
                  <div className="creds-row">
                    <span className="creds-label">Password:</span>
                    <span className="creds-val">{seedResult.demoLogins?.password || 'Demo@1234'}</span>
                  </div>
                  <button
                    type="button"
                    className="btn-copy-creds"
                    onClick={handleCopyCredentials}
                  >
                    {copied ? '✓ Credentials Copied!' : '📋 Copy Login Details'}
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </>
      )}
    </AnimatedPage>
  );
}
