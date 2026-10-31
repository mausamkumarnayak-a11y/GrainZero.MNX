import React, { useState, useEffect } from 'react';
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
import '../student/Home.css';
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

      // Compute average rating across dishes
      const dishes = anRes.data?.dishes || [];
      const rated = dishes.filter(d => d.rating_count > 0);
      if (rated.length > 0) {
        const sum = rated.reduce((acc, d) => acc + d.avg_stars, 0);
        setOverallRating((sum / rated.length).toFixed(1));
      }

      // Pre-select first unlogged meal if available
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

  async function handleLoadDemoData() {
    const ok = window.confirm(
      'This replaces existing demo menus, ratings, skips and waste logs with 16 days of realistic data. Real user accounts are preserved.'
    );
    if (!ok) return;

    setSeedLoading(true);
    setSeedError('');
    setSeedResult(null);
    setCopied(false);

    try {
      const { data } = await api.post('/admin/seed');
      setSeedResult(data);
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

  // Handle logging leftovers form submit
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

  // Calculations for Stat Cards
  const totalStudents = headcount?.total_students || 0;
  const platesToPrepareToday = headcount?.meals?.reduce((acc, m) => acc + (m.prepare_for || 0), 0) || 0;
  const totalWastedKg = wasteSummary?.totals?.total_leftover_kg || 0;
  const totalWastedRupees = wasteSummary?.totals?.total_wasted_rupees || 0;
  const platesSavedBySkips = headcount?.meals?.reduce((acc, m) => acc + (m.skipped_count || 0), 0) || 0;

  // Format waste daily series for BarChart
  const chartData = (wasteSummary?.daily || []).slice(-10).map(item => ({
    date: item.date.slice(5), // MM-DD
    leftover: item.leftover_kg,
    cooked: item.cooked_kg
  }));

  return (
    <div className="home-page admin-dashboard-page">
      {/* Banner */}
      <div className="banner-container">
        <img
          src="/grainzero-cover.png"
          alt="GrainZero – Zero waste, every meal"
          className="cover-banner"
        />
      </div>

      <div className="page-header-block">
        <h1 className="page-title">Mess Authority Dashboard</h1>
        <p className="cs-tag">Live Operations & Waste Monitoring</p>
      </div>

      {/* ── 4 KPI Stat Cards ──────────────────────────────────────────────── */}
      <div className="kpi-grid">
        <div className="kpi-card card">
          <span className="kpi-icon">👥</span>
          <div>
            <div className="kpi-val">{totalStudents}</div>
            <div className="kpi-lbl">Total Enrolled Students</div>
          </div>
        </div>

        <div className="kpi-card card highlight-kpi">
          <span className="kpi-icon">🍽️</span>
          <div>
            <div className="kpi-val highlight-text">{platesToPrepareToday}</div>
            <div className="kpi-lbl">Plates to Prepare Today</div>
          </div>
        </div>

        <div className="kpi-card card">
          <span className="kpi-icon">🗑️</span>
          <div>
            <div className="kpi-val">{totalWastedKg} <small>kg</small></div>
            <div className="kpi-lbl">Waste (14d) • ₹{totalWastedRupees}</div>
          </div>
        </div>

        <div className="kpi-card card">
          <span className="kpi-icon">⭐</span>
          <div>
            <div className="kpi-val">{overallRating} <small>/ 5</small></div>
            <div className="kpi-lbl">Average Student Rating</div>
          </div>
        </div>
      </div>

      {/* Plates Saved Banner */}
      <div className="plates-saved-banner card">
        <span className="saved-icon">🌱</span>
        <div>
          <span className="saved-number">{platesSavedBySkips} Plates Saved Today</span>
          <span className="saved-desc">
            Students proactively skipped upcoming meals, saving mess staff from overcooking and wasting fresh food.
          </span>
        </div>
      </div>

      {/* ── Today's Kitchen Plan ────────────────────────────────────────── */}
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
                {headcount.meals.map(m => (
                  <tr key={m.meal_type}>
                    <td><strong className="meal-type-badge">{m.meal_type.toUpperCase()}</strong></td>
                    <td>{m.start_time} – {m.end_time}</td>
                    <td className="text-muted">{m.cutoff_time}</td>
                    <td>{m.total_students}</td>
                    <td><span className="skipped-chip">-{m.skipped_count}</span></td>
                    <td>{m.expected_count}</td>
                    <td>+{m.buffer_percent}%</td>
                    <td style={{ textAlign: 'right' }}>
                      <strong className="prepare-for-badge">{m.prepare_for} plates</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Waste Chart & Log Leftovers Side by Side ───────────────────── */}
      <div className="dashboard-columns">
        {/* Daily Waste Bar Chart */}
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
                  <Bar dataKey="leftover" fill="#ef4444" radius={[4, 4, 0, 0]} name="Waste (kg)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Log Leftovers Form */}
        <div className="dashboard-section card column-form">
          <h2 className="section-title">✍️ Log Kitchen Leftovers</h2>
          <p className="chart-subtitle">Record cooked volume vs leftovers after dining finishes</p>

          {wasteNotice.text && (
            <div className={`alert ${wasteNotice.type === 'success' ? 'alert-success' : 'alert-error'}`} style={{ padding: '0.5rem 0.75rem', fontSize: '0.82rem', marginBottom: '0.75rem' }}>
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

      {/* ── Demo Tools Card (Preserved from Feature 2) ─────────────────── */}
      <div className="demo-tools-card card" style={{ marginTop: '2rem' }}>
        <div className="demo-tools-header">
          <h2 className="demo-tools-title">🛠️ Demo Seed & Reset Tools</h2>
          <p className="demo-tools-subtitle">
            Populate 16 days of Indian hostel menus, 40 student accounts, ratings, skips, and waste logs for presentation.
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
              '🌱 Seed Demo Data (Fast)'
            )}
          </button>
        </div>

        {seedError && <p className="alert alert-error">{seedError}</p>}

        {seedResult && (
          <div className="demo-result-box">
            <div className="result-header">
              <span className="result-check">✓</span>
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
          </div>
        )}
      </div>
    </div>
  );
}
