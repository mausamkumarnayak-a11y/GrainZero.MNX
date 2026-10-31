import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import AnimatedCoverBanner from '../../components/AnimatedCoverBanner';
import AnimatedPage from '../../components/AnimatedPage';
import AnimatedCounter from '../../components/AnimatedCounter';
import CountdownRing from '../../components/CountdownRing';
import Coin from '../../components/art/Coin';
import DishImage from '../../components/DishImage';
import SkeletonLoader from '../../components/SkeletonLoader';
import './Home.css';

export default function StudentHome() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('today'); // 'today' | 'tomorrow'
  const [meals, setMeals] = useState([]);
  const [walletInfo, setWalletInfo] = useState({ balance_paise: 0, wallet_percent: 30 });
  const [actionLoading, setActionLoading] = useState(null);
  const [flyingCoins, setFlyingCoins] = useState([]);

  const walletChipRef = useRef(null);

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

  async function handleSkip(meal, e) {
    const creditRupees = (meal.credit_paise / 100).toFixed(0);
    const confirmed = window.confirm(
      `Are you sure you want to skip ${meal.meal_type.toUpperCase()}? ₹${creditRupees} will be credited to your mess wallet.`
    );
    if (!confirmed) return;

    // Get trigger button coordinates for flying coin
    const btnRect = e?.currentTarget?.getBoundingClientRect();
    const walletRect = walletChipRef.current?.getBoundingClientRect();

    setActionLoading(meal.id);
    try {
      await api.post('/student/skips', { meal_id: meal.id });

      // Trigger celebration confetti
      if (btnRect) {
        confetti({
          particleCount: 36,
          spread: 60,
          origin: {
            x: (btnRect.left + btnRect.width / 2) / window.innerWidth,
            y: (btnRect.top + btnRect.height / 2) / window.innerHeight
          },
          colors: ['#15803d', '#4cae4c', '#F2B01E', '#EAF3DE']
        });
      }

      // Trigger flying coin animation towards wallet chip
      if (btnRect && walletRect) {
        const coinId = Date.now();
        setFlyingCoins(prev => [
          ...prev,
          {
            id: coinId,
            startX: btnRect.left + btnRect.width / 2 - 14,
            startY: btnRect.top + btnRect.height / 2 - 14,
            endX: walletRect.left + 24,
            endY: walletRect.top + walletRect.height / 2 - 14
          }
        ]);

        setTimeout(() => {
          setFlyingCoins(prev => prev.filter(c => c.id !== coinId));
        }, 850);
      }

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
    <AnimatedPage className="student-home">
      {/* Animated Cover Banner with floating grains and rotating leaf ring */}
      <AnimatedCoverBanner />

      {/* Greeting & Animated Wallet Chip */}
      <div className="home-hero">
        <div className="hero-text">
          <h1 className="hero-greeting">Hello, {user?.name || 'Student'}! 👋</h1>
          <p className="hero-info">
            Skip a meal before cutoff and earn{' '}
            <span className="highlight-tag">{walletInfo.wallet_percent}%</span> of its cost back into your wallet.
          </p>
        </div>
        <div id="wallet-chip-target" ref={walletChipRef} className="hero-wallet-chip">
          <Coin size={32} />
          <div className="chip-content">
            <span className="chip-label">Mess Wallet</span>
            <span className="chip-value">
              <AnimatedCounter
                prefix="₹"
                value={walletInfo.balance_paise / 100}
                decimals={2}
                duration={900}
              />
            </span>
          </div>
        </div>
      </div>

      {/* Day Tabs with shared layoutId pill */}
      <div className="meal-day-tabs">
        <button
          type="button"
          className={`day-tab ${activeTab === 'today' ? 'active' : ''}`}
          onClick={() => setActiveTab('today')}
        >
          <span>📅 Today's Meals</span>
          {activeTab === 'today' && (
            <motion.div
              layoutId="student-active-day-tab"
              className="day-tab-underline"
              transition={{ type: 'spring', stiffness: 450, damping: 35 }}
            />
          )}
        </button>
        <button
          type="button"
          className={`day-tab ${activeTab === 'tomorrow' ? 'active' : ''}`}
          onClick={() => setActiveTab('tomorrow')}
        >
          <span>⏭️ Tomorrow's Meals</span>
          {activeTab === 'tomorrow' && (
            <motion.div
              layoutId="student-active-day-tab"
              className="day-tab-underline"
              transition={{ type: 'spring', stiffness: 450, damping: 35 }}
            />
          )}
        </button>
      </div>

      {/* Meals Grid */}
      {loading ? (
        <div className="meals-grid">
          {[1, 2, 3, 4].map(n => (
            <SkeletonLoader key={n} type="card" height={220} />
          ))}
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
        <motion.div
          className="meals-grid"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: { staggerChildren: 0.08 }
            }
          }}
        >
          {filteredMeals.map(meal => {
            const costRupees = (meal.cost_paise / 100).toFixed(0);
            const creditRupees = (meal.credit_paise / 100).toFixed(0);
            const isProcessing = actionLoading === meal.id;
            const isCutoffPassed = !meal.canSkip && !meal.skipped;

            return (
              <motion.div
                key={meal.id}
                variants={{
                  hidden: { opacity: 0, y: 16 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.28 } }
                }}
                className={`meal-plan-card card ${
                  meal.skipped ? 'card-skipped' : ''
                } ${isCutoffPassed ? 'card-locked' : ''}`}
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

                {/* Dishes with warm fallback illustrations */}
                <div className="meal-dishes-wrap">
                  <span className="dishes-label">Menu Dishes:</span>
                  <div className="dishes-chips">
                    {meal.dishes && meal.dishes.length > 0 ? (
                      meal.dishes.map(d => (
                        <div key={d.id} className="dish-chip-badge">
                          <DishImage size={24} className="dish-chip-icon" />
                          <span className="dish-chip-text">{d.name}</span>
                        </div>
                      ))
                    ) : (
                      <span className="no-dishes">Dishes to be announced</span>
                    )}
                  </div>
                </div>

                {/* Cutoff & Circular Countdown Ring */}
                <div className="meal-cutoff-box">
                  <CountdownRing
                    secondsLeft={meal.seconds_left}
                    cutoffTime={meal.slot?.cutoff_time}
                  />
                </div>

                {/* Action Button */}
                <div className="meal-card-action">
                  {meal.skipped ? (
                    <div className="skipped-status-box">
                      <motion.div
                        className="skipped-badge"
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                      >
                        <span className="skipped-check">✓</span> Skipped, ₹{creditRupees} credited
                      </motion.div>
                      {meal.canSkip && (
                        <button
                          type="button"
                          className="btn btn-outline undo-btn"
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
                      className="btn btn-primary skip-btn pulse-skip-btn"
                      disabled={isProcessing}
                      onClick={(e) => handleSkip(meal, e)}
                    >
                      {isProcessing ? 'Processing…' : `Skip this meal (+₹${creditRupees})`}
                    </button>
                  ) : (
                    <div className="cutoff-passed-banner">
                      <span className="lock-icon">🔒</span> Cutoff Passed
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Flying coins overlay */}
      <AnimatePresence>
        {flyingCoins.map(coin => (
          <motion.div
            key={coin.id}
            initial={{
              position: 'fixed',
              left: coin.startX,
              top: coin.startY,
              scale: 0.8,
              opacity: 1,
              zIndex: 9999,
              pointerEvents: 'none'
            }}
            animate={{
              left: coin.endX,
              top: coin.endY,
              scale: [0.8, 1.4, 1],
              opacity: [1, 1, 0.2]
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
          >
            <Coin size={28} />
          </motion.div>
        ))}
      </AnimatePresence>
    </AnimatedPage>
  );
}
