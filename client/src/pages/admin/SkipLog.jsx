import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import api from '../../api';
import AnimatedPage from '../../components/AnimatedPage';
import AnimatedCounter from '../../components/AnimatedCounter';
import SkeletonLoader from '../../components/SkeletonLoader';
import './SkipLog.css';

export default function AdminSkipLog() {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [mealType, setMealType] = useState('lunch');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [logData, setLogData] = useState({
    total_students: 0,
    skipping_count: 0,
    attending_count: 0,
    prepare_for: 0,
    buffer_percent: 10,
    skipping: [],
    attending: []
  });
  const [searchSkipping, setSearchSkipping] = useState('');
  const [searchAttending, setSearchAttending] = useState('');

  async function loadSkipLog() {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/admin/skip-log?date=${date}&meal_type=${mealType}`);
      setLogData(res.data);
    } catch (err) {
      console.error('Failed to load skip log:', err);
      setError(err.response?.data?.error || 'Failed to load skip log.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSkipLog();
  }, [date, mealType]);

  // Download CSV directly from backend
  async function handleDownloadCsv() {
    try {
      const token = localStorage.getItem('gz_token');
      const response = await fetch(`/api/admin/skip-log.csv?date=${date}&meal_type=${mealType}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `skip-log-${date}-${mealType}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to download CSV: ' + err.message);
    }
  }

  function handlePrint() {
    window.print();
  }

  // Filter lists based on search terms
  const filteredSkipping = (logData.skipping || []).filter(s =>
    s.name.toLowerCase().includes(searchSkipping.toLowerCase()) ||
    s.email.toLowerCase().includes(searchSkipping.toLowerCase())
  );

  const filteredAttending = (logData.attending || []).filter(a =>
    a.name.toLowerCase().includes(searchAttending.toLowerCase()) ||
    a.email.toLowerCase().includes(searchAttending.toLowerCase())
  );

  return (
    <AnimatedPage className="admin-skip-log-page">
      {/* Non-printed header controls */}
      <div className="skip-log-controls no-print">
        <div>
          <h1 className="page-title">Headcount & Skip Audit Log</h1>
          <p className="page-subtitle">Real-time attendance registry for kitchen plate estimation.</p>
        </div>

        <div className="action-buttons">
          <button type="button" className="btn btn-secondary" onClick={handlePrint}>
            🖨️ Print Sheet
          </button>
          <button type="button" className="btn btn-primary" onClick={handleDownloadCsv}>
            📥 Download CSV
          </button>
        </div>
      </div>

      {/* Date & Meal Filter Toolbar */}
      <div className="filter-toolbar card no-print">
        <div className="date-picker-group">
          <label>Select Date:</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>

        <div className="meal-tabs-row">
          {['breakfast', 'lunch', 'snacks', 'dinner'].map(type => (
            <button
              key={type}
              type="button"
              className={`meal-filter-tab ${mealType === type ? 'active' : ''}`}
              onClick={() => setMealType(type)}
            >
              {type === 'breakfast' && '🌅 Breakfast'}
              {type === 'lunch' && '☀️ Lunch'}
              {type === 'snacks' && '☕ Snacks'}
              {type === 'dinner' && '🌙 Dinner'}
            </button>
          ))}
        </div>
      </div>

      {/* Printable Sheet Title (shows on print only) */}
      <div className="print-only print-header">
        <h2>GrainZero Hostel Mess Headcount Sheet</h2>
        <p>Date: {date} • Meal: {mealType.toUpperCase()} • Generated: {new Date().toLocaleDateString('en-IN')}</p>
      </div>

      {loading ? (
        <div className="loading-state">⏳ Loading headcount data...</div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : (
        <>
          {/* Summary Metric Cards */}
          <div className="kpi-grid skip-kpi-grid">
            <div className="kpi-card card">
              <span className="kpi-icon">👥</span>
              <div>
                <div className="kpi-val">{logData.total_students}</div>
                <div className="kpi-lbl">Total Enrolled</div>
              </div>
            </div>

            <div className="kpi-card card">
              <span className="kpi-icon">❌</span>
              <div>
                <div className="kpi-val" style={{ color: '#dc2626' }}>{logData.skipping_count}</div>
                <div className="kpi-lbl">Meals Skipped</div>
              </div>
            </div>

            <div className="kpi-card card">
              <span className="kpi-icon">✅</span>
              <div>
                <div className="kpi-val" style={{ color: '#16a34a' }}>{logData.attending_count}</div>
                <div className="kpi-lbl">Attending Students</div>
              </div>
            </div>

            <div className="kpi-card card highlight-kpi">
              <span className="kpi-icon">🥘</span>
              <div>
                <div className="kpi-val highlight-text">{logData.prepare_for}</div>
                <div className="kpi-lbl">PREPARE FOR (+{logData.buffer_percent}%)</div>
              </div>
            </div>
          </div>

          {/* Two Searchable Lists Side by Side */}
          <div className="lists-container">
            {/* Skipping List */}
            <div className="card list-card">
              <div className="list-card-head">
                <div>
                  <h3 className="list-title">Skipping ({filteredSkipping.length})</h3>
                  <span className="list-subtitle">Rebate credited to student mess wallets</span>
                </div>
                <input
                  type="text"
                  placeholder="Filter name or email..."
                  className="search-input no-print"
                  value={searchSkipping}
                  onChange={e => setSearchSkipping(e.target.value)}
                />
              </div>

              {filteredSkipping.length === 0 ? (
                <div className="empty-list-msg">No students skipping this meal.</div>
              ) : (
                <div className="table-responsive list-table-scroll">
                  <table className="roster-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Student Name</th>
                        <th>Email</th>
                        <th style={{ textAlign: 'right' }}>Credited</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSkipping.map((s, idx) => (
                        <tr key={s.id}>
                          <td>{idx + 1}</td>
                          <td><strong>{s.name}</strong></td>
                          <td className="text-muted">{s.email}</td>
                          <td style={{ textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>
                            ₹{(s.credit_paise / 100).toFixed(0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Attending List */}
            <div className="card list-card">
              <div className="list-card-head">
                <div>
                  <h3 className="list-title">Attending ({filteredAttending.length})</h3>
                  <span className="list-subtitle">Expected to dine in hostel mess</span>
                </div>
                <input
                  type="text"
                  placeholder="Filter name or email..."
                  className="search-input no-print"
                  value={searchAttending}
                  onChange={e => setSearchAttending(e.target.value)}
                />
              </div>

              {filteredAttending.length === 0 ? (
                <div className="empty-list-msg">No attending students listed.</div>
              ) : (
                <div className="table-responsive list-table-scroll">
                  <table className="roster-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Student Name</th>
                        <th>Email</th>
                        <th style={{ textAlign: 'right' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAttending.map((a, idx) => (
                        <tr key={a.id}>
                          <td>{idx + 1}</td>
                          <td><strong>{a.name}</strong></td>
                          <td className="text-muted">{a.email}</td>
                          <td style={{ textAlign: 'right' }}>
                            <span className="attending-badge">Attending</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </AnimatedPage>
  );
}
