import React, { useState, useEffect } from 'react';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import './Home.css';

export default function StudentHome() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('today'); // 'today' | 'tomorrow'
  const [meals, setMeals] = useState([]);
  const [walletInfo, setWalletInfo] = useState({ balance_paise: 0, wallet_percent: 30 });
  const [actionLoading, setActionLoading] = useState(null);

  async function loadData() {
    try {
      setError('');
      const [todayRes, walletRes, settingsRes] = await Promise.all([
        api.get('/student/today'),
        api.get('/student/wallet').catch(() => ({ data: { balance_paise: 0 } })),
        api.get('/settings').catch(() => ({ data: { settings: { wallet_percent: 30 } } }))
      ]);

      setMeals(todayRes.data || []);
      setWalletInfo({
        balance_paise: walletRes.data.balance_paise || 0,
        wallet_percent: settingsRes.data?.settings?.wallet_percent ?? 30
      });
    } catch (err) {
      console.error('Failed to load student dashboard:', err);
      setError(err.response?.data?.error || err.message || 'Failed to load meal schedule.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // 1-second live ticker for countdown timers
  useEffect(() => {
    const timer = setInterval(() => {
      setMeals(prevMeals => {
        let hasExpired = false;
        const updated = prevMeals.map(m => {
          if (m.seconds_left > 0) {
            const nextSec = m.seconds_left - 1;
            if (nextSec <= 0) hasExpired = true;
            return { ...m, seconds_left: nextSec, canSkip: nextSec > 0 };
          }
          return m;
        });
        if (hasExpired) {
          loadData();
        }
        return updated;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  function formatCountdown(totalSec) {
    if (!totalSec || totalSec <= 0) return '00:00';
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hrs > 0) {
      return `${hrs}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
    }
    return `${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
  }

  async function handleSkip(meal) {
    const creditRupees = (meal.credit_paise / 100).toFixed(0);
    const confirmed = window.confirm(
      `Are you sure you want to skip ${meal.meal_type.toUpperCase()}? ₹${creditRupees} will be credited to your mess wallet.`
    );
    if (!confirmed) return;

    setActionLoading(meal.id);
    try {
      await api.post('/student/skips', { meal_id: meal.id });
      await loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to skip meal. The cutoff may have passed.');
      loadData();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleUndo(meal) {
    setActionLoading(meal.id);
    try {
      await api.delete(`/student/skips/${meal.id}`);
      await loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to undo skip. The cutoff may have passed.');
      loadData();
    } finally {
      setActionLoading(null);
    }
  }

  const todayDateStr = meals[0]?.date;
  const filteredMeals = meals.filter(m => {
    if (activeTab === 'today') return m.date === todayDateStr;
    return m.date !== todayDateStr;
  });

  const MEAL_ICONS = {
    breakfast: '🌅',
    lunch: '☀️',
    snacks: '☕',
    dinner: '🌙'
  };

  return (
    <div className="student-home">
      {/* Banner */}
      <div className="banner-container">
        <img
          src="/grainzero-cover.png"
          alt="GrainZero – Zero waste, every meal"
          className="cover-banner"
        />
      </div>

      {/* Greeting & Wallet Chip */}
      <div className="home-hero">
        <div className="hero-text">
          <h1 className="hero-greeting">Hello, {user?.name || 'Student'}! 👋</h1>
          <p className="hero-info">
            Skip a meal before cutoff and earn <span className="highlight-tag">{walletInfo.wallet_percent}%</span> of its cost back into your wallet.
          </p>
        </div>
        <div className="hero-wallet-chip">
          <span className="chip-icon">💰</span>
          <div className="chip-content">
            <span className="chip-label">Wallet Balance</span>
            <span className="chip-value">₹{(walletInfo.balance_paise / 100).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="meal-day-tabs">
        <button
          type="button"
          className={`day-tab ${activeTab === 'today' ? 'active' : ''}`}
          onClick={() => setActiveTab('today')}
        >
          📅 Today's Meals
        </button>
        <button
          type="button"
          className={`day-tab ${activeTab === 'tomorrow' ? 'active' : ''}`}
          onClick={() => setActiveTab('tomorrow')}
        >
          ⏭️ Tomorrow's Meals
        </button>
      </div>

      {/* Meals Grid */}
      {loading ? (
        <div className="loading-state">
          <span className="spin-icon">⏳</span> Loading meal schedule...
        </div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : filteredMeals.length === 0 ? (
        <div className="empty-state card">
          <span className="empty-icon">🍽️</span>
          <h3>Menu not published yet</h3>
          <p>The mess management has not finalized the meal plan for this date yet. Check back soon!</p>
        </div>
      ) : (
        <div className="meals-grid">
          {filteredMeals.map(meal => {
            const costRupees = (meal.cost_paise / 100).toFixed(0);
            const creditRupees = (meal.credit_paise / 100).toFixed(0);
            const isProcessing = actionLoading === meal.id;

            return (
              <div
                key={meal.id}
                className={`meal-plan-card card ${meal.skipped ? 'card-skipped' : ''}`}
              >
                {/* Header */}
                <div className="meal-header">
                  <div className="meal-title-wrap">
                    <span className="meal-emoji">{MEAL_ICONS[meal.meal_type] || '🍽️'}</span>
                    <div>
                      <h3 className="meal-type-title">{meal.meal_type.toUpperCase()}</h3>
                      <span className="meal-timing">
                        {meal.slot?.start_time || '00:00'} – {meal.slot?.end_time || '00:00'}
                      </span>
                    </div>
                  </div>
                  <div className="meal-cost-pill">₹{costRupees}</div>
                </div>

                {/* Dishes */}
                <div className="meal-dishes-wrap">
                  <span className="dishes-label">Menu Dishes:</span>
                  <div className="dishes-chips">
                    {meal.dishes && meal.dishes.length > 0 ? (
                      meal.dishes.map(d => (
                        <span key={d.id} className="dish-chip">
                          {d.name}
                        </span>
                      ))
                    ) : (
                      <span className="no-dishes">Dishes to be announced</span>
                    )}
                  </div>
                </div>

                {/* Cutoff & Live Countdown */}
                <div className="meal-cutoff-box">
                  <div className="cutoff-time-text">
                    ⏰ Cutoff: <strong>{meal.slot?.cutoff_time || '—'}</strong>
                  </div>
                  {meal.canSkip ? (
                    <div className="countdown-live active">
                      <span>⏳</span> Closes in <strong>{formatCountdown(meal.seconds_left)}</strong>
                    </div>
                  ) : (
                    <div className="countdown-live expired">
                      <span>🔒</span> Cutoff passed
                    </div>
                  )}
                </div>

                {/* Action Button */}
                <div className="meal-card-action">
                  {meal.skipped ? (
                    <div className="skipped-status-box">
                      <div className="skipped-badge">
                        <span>✓</span> Skipped (+₹{creditRupees} credited)
                      </div>
                      {meal.canSkip && (
                        <button
                          type="button"
                          className="btn btn-secondary undo-btn"
                          disabled={isProcessing}
                          onClick={() => handleUndo(meal)}
                        >
                          {isProcessing ? 'Processing…' : 'Undo Skip'}
                        </button>
                      )}
                    </div>
                  ) : meal.canSkip ? (
                    <button
                      type="button"
                      className="btn btn-primary skip-btn"
                      disabled={isProcessing}
                      onClick={() => handleSkip(meal)}
                    >
                      {isProcessing ? 'Saving…' : `Skip this meal (+₹${creditRupees})`}
                    </button>
                  ) : (
                    <button type="button" className="btn btn-disabled" disabled>
                      Cutoff passed
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
