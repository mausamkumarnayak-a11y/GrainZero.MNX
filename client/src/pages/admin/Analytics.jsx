import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../api';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import AnimatedPage from '../../components/AnimatedPage';
import DishImage from '../../components/DishImage';
import SkeletonLoader from '../../components/SkeletonLoader';
import './Analytics.css';

export default function AdminAnalytics() {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState({
    has_report: false,
    overall_summary: '',
    suspicious_summary: '',
    dishes: []
  });
  const [flaggedRatings, setFlaggedRatings] = useState([]);
  const [selectedDish, setSelectedDish] = useState(null);
  const [sortField, setSortField] = useState('avg_stars');
  const [sortAsc, setSortAsc] = useState(false);
  const [aiFailedNotice, setAiFailedNotice] = useState(false);
  const [rescanning, setRescanning] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      setError('');
      const [reportRes, flaggedRes] = await Promise.all([
        api.get('/admin/analytics/report'),
        api.get('/admin/flagged')
      ]);

      const data = reportRes.data || {};
      setReport(data);
      setFlaggedRatings(flaggedRes.data || []);

      if (data.dishes && data.dishes.length > 0) {
        setSelectedDish(data.dishes[0]);
      }
    } catch (err) {
      console.error('Failed to load analytics:', err);
      setError('Failed to load analytics data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleGenerateInsights() {
    setGenerating(true);
    setAiFailedNotice(false);
    try {
      const res = await api.post('/admin/analytics/generate');
      setReport(prev => ({
        ...prev,
        has_report: true,
        overall_summary: res.data.overall_summary,
        suspicious_summary: res.data.suspicious_summary,
        dishes: res.data.dishes
      }));

      if (res.data.ai_failed) {
        setAiFailedNotice(true);
      }

      if (selectedDish) {
        const updated = res.data.dishes.find(d => d.name === selectedDish.name);
        if (updated) setSelectedDish(updated);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to generate AI insights.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleRescan() {
    setRescanning(true);
    try {
      const res = await api.post('/admin/ratings/rescan');
      alert(`Scan complete. Found ${res.data.flagged_count} flagged suspicious ratings.`);
      loadData();
    } catch (err) {
      alert('Rescan failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setRescanning(false);
    }
  }

  async function handleToggleFlag(ratingId, currentFlagged) {
    try {
      await api.put(`/admin/ratings/${ratingId}/flag`, { flagged: !currentFlagged });
      setFlaggedRatings(prev => prev.filter(r => r.id !== ratingId));
    } catch (err) {
      alert('Failed to update rating flag: ' + (err.response?.data?.error || err.message));
    }
  }

  function handleSort(field) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  }

  const sortedDishes = [...(report.dishes || [])].sort((a, b) => {
    let va = a[sortField];
    let vb = b[sortField];
    if (sortField === 'recommendation') {
      va = a.recommendation?.percent ?? 0;
      vb = b.recommendation?.percent ?? 0;
    }
    if (va === null || va === undefined) va = -999;
    if (vb === null || vb === undefined) vb = -999;
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });

  return (
    <AnimatedPage className="admin-analytics-page">
      <div className="analytics-header">
        <div>
          <h1 className="page-title">Dishes & Feedback Analytics</h1>
          <p className="page-subtitle">
            AI-driven kitchen recommendations derived strictly from student ratings, trend deltas, and leftover logs.
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <SkeletonLoader type="card" height={120} />
          <SkeletonLoader type="card" height={360} />
        </div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : (
        <>
          {/* AI Executive Summary Card */}
          <div className="ai-summary-card card">
            <div className="ai-card-header">
              <div className="ai-badge-wrap">
                <span className="sparkle-icon">✨</span>
                <strong>Gemini AI Waste Executive Report</strong>
                {aiFailedNotice && <span className="fallback-tag">Template Fallback</span>}
              </div>
              <button
                type="button"
                className="btn btn-primary generate-ai-btn"
                disabled={generating}
                onClick={handleGenerateInsights}
              >
                {generating ? 'Analyzing Dishes with Gemini…' : 'Generate AI Insights'}
              </button>
            </div>

            {generating ? (
              <div style={{ marginTop: '0.85rem' }}>
                <SkeletonLoader type="card" height={55} />
              </div>
            ) : (
              <motion.p
                className="ai-summary-body"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.35 }}
              >
                {report.overall_summary || (
                  <em>No AI report generated yet. Click "Generate AI Insights" above to synthesize student reviews into kitchen recommendations.</em>
                )}
              </motion.p>
            )}
          </div>

          {/* Main Dish Table & Detail Panel Split */}
          <div className="analytics-grid">
            {/* Table */}
            <div className="card table-card">
              <div className="table-header-bar">
                <h3>Mess Dish Performance Index</h3>
                <span className="count-label">{sortedDishes.length} Dishes</span>
              </div>

              <div className="table-responsive">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th onClick={() => handleSort('name')} className="sortable">
                        Dish Name {sortField === 'name' ? (sortAsc ? '▲' : '▼') : ''}
                      </th>
                      <th onClick={() => handleSort('avg_stars')} className="sortable">
                        Score {sortField === 'avg_stars' ? (sortAsc ? '▲' : '▼') : ''}
                      </th>
                      <th onClick={() => handleSort('trend_delta')} className="sortable">
                        Trend {sortField === 'trend_delta' ? (sortAsc ? '▲' : '▼') : ''}
                      </th>
                      <th onClick={() => handleSort('rating_count')} className="sortable">
                        Ratings {sortField === 'rating_count' ? (sortAsc ? '▲' : '▼') : ''}
                      </th>
                      <th onClick={() => handleSort('leftover_percent')} className="sortable">
                        Waste % {sortField === 'leftover_percent' ? (sortAsc ? '▲' : '▼') : ''}
                      </th>
                      <th>AI Review</th>
                      <th onClick={() => handleSort('recommendation')} className="sortable">
                        Action {sortField === 'recommendation' ? (sortAsc ? '▲' : '▼') : ''}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDishes.map(d => {
                      const isSelected = selectedDish?.name === d.name;
                      const rec = d.recommendation || { label: 'Keep as is', tone: 'keep' };
                      const isPositiveTrend = d.trend_delta > 0;
                      const isNegativeTrend = d.trend_delta < 0;

                      return (
                        <tr
                          key={d.name}
                          className={`dish-row ${isSelected ? 'row-selected' : ''}`}
                          onClick={() => setSelectedDish(d)}
                        >
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <DishImage size={24} />
                              <strong>{d.name}</strong>
                              {d.flagged_count > 0 && (
                                <span className="flag-dot" title={`${d.flagged_count} flagged reviews`}>
                                  ⚠️
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className="rating-score">★ {d.avg_stars}</span>
                          </td>
                          <td>
                            <span className={`trend-tag ${isPositiveTrend ? 'up' : isNegativeTrend ? 'down' : 'flat'}`}>
                              {isPositiveTrend ? `▲ +${d.trend_delta}` : isNegativeTrend ? `▼ ${d.trend_delta}` : '— 0.0'}
                            </span>
                          </td>
                          <td>{d.rating_count}</td>
                          <td>{d.leftover_percent !== null ? `${d.leftover_percent}%` : '—'}</td>
                          <td className="ai-short-cell">
                            {d.ai_summary ? (
                              <span className="ai-short-text">{d.ai_summary}</span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td>
                            <motion.span
                              key={rec.label}
                              initial={{ scale: 0.85, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                              className={`rec-badge ${rec.tone}`}
                            >
                              {rec.label}
                            </motion.span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sliding Detail Inspector from the right */}
            <AnimatePresence mode="wait">
              {selectedDish && (
                <motion.div
                  key={selectedDish.name}
                  className="card detail-panel"
                  initial={{ opacity: 0, x: 25 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 25 }}
                  transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                >
                  <div className="detail-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <DishImage size={44} />
                      <div>
                        <h3 className="detail-dish-title">{selectedDish.name}</h3>
                        <span className="detail-stat-sub">
                          ★ {selectedDish.avg_stars} • {selectedDish.rating_count} verified ratings
                        </span>
                      </div>
                    </div>
                    <motion.span
                      initial={{ scale: 0.85 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 400 }}
                      className={`rec-badge large ${selectedDish.recommendation?.tone}`}
                    >
                      {selectedDish.recommendation?.label}
                    </motion.span>
                  </div>

                  {/* 14-Day Line Chart with auto drawing animation */}
                  <div className="chart-box">
                    <div className="chart-title">14-Day Rating Trend (Asia/Kolkata)</div>
                    {(!selectedDish.series || selectedDish.series.length === 0) ? (
                      <div className="chart-empty">No daily rating points available for this dish.</div>
                    ) : (
                      <div style={{ width: '100%', height: 180 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={selectedDish.series} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                            <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 10 }} />
                            <Tooltip formatter={(val) => [`${val} ★`, 'Avg Score']} />
                            <Line
                              type="monotone"
                              dataKey="avg"
                              stroke="#15803d"
                              strokeWidth={2.5}
                              dot={{ r: 3, fill: '#15803d' }}
                              isAnimationActive={true}
                              animationDuration={1100}
                              animationEasing="ease-out"
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  {/* AI Review Summary & Reason */}
                  <div className="detail-ai-box">
                    <div className="ai-box-heading">🤖 Kitchen Action Analysis</div>
                    <p className="ai-analysis-text">
                      <strong>Feedback:</strong> {selectedDish.ai_summary || 'Feedback analysis awaiting AI run.'}
                    </p>
                    <p className="ai-analysis-text">
                      <strong>Production Plan:</strong> {selectedDish.ai_reason || selectedDish.recommendation?.label}
                    </p>
                  </div>

                  {/* Recent Student Comments */}
                  <div className="detail-comments-box">
                    <div className="comments-heading">Student Feedback ({selectedDish.comments?.length || 0})</div>
                    {(!selectedDish.comments || selectedDish.comments.length === 0) ? (
                      <p className="no-comments">No written comments submitted for this dish.</p>
                    ) : (
                      <div className="comments-scroll">
                        {selectedDish.comments.map((c, i) => (
                          <div key={i} className="comment-bubble">
                            <div className="bubble-top">
                              <span className="bubble-stars">★ {c.stars}</span>
                              <span className="bubble-date">
                                {new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                              </span>
                            </div>
                            <p className="bubble-text">"{c.comment}"</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Suspicious & Flagged Ratings Section ──────────────────────── */}
          <div className="card flagged-section">
            <div className="flagged-header">
              <div>
                <h2 className="section-title">🛡️ Suspicious Ratings & Anti-Tampering</h2>
                <p className="section-sub">
                  {report.suspicious_summary ||
                    'Ratings matching automated spam triggers (rapid bursts, duplicate comments, 12+ uniform scores, or unnatural surges) are quarantined and excluded from all dish averages.'}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary rescan-btn"
                disabled={rescanning}
                onClick={handleRescan}
              >
                {rescanning ? 'Scanning…' : '🔄 Re-scan Database'}
              </button>
            </div>

            {flaggedRatings.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">🛡️</span>
                <p>No suspicious or brigaded ratings currently flagged. All student ratings verified authentic.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="flagged-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Dish</th>
                      <th>Score</th>
                      <th>Comment</th>
                      <th>Flag Reason</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flaggedRatings.map(r => (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.student_name}</strong>
                          <div className="student-email">{r.student_email}</div>
                        </td>
                        <td><strong>{r.dish_name}</strong></td>
                        <td><span className="rating-score">★ {r.stars}</span></td>
                        <td><em>{r.comment ? `"${r.comment}"` : '—'}</em></td>
                        <td>
                          <span className="reason-pill">{r.flag_reason || 'Anomaly detected'}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem' }}
                            onClick={() => handleToggleFlag(r.id, r.flagged)}
                          >
                            Un-flag
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </AnimatedPage>
  );
}
