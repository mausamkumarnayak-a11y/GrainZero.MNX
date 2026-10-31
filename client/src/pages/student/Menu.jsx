import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../api';
import AnimatedPage from '../../components/AnimatedPage';
import DishImage from '../../components/DishImage';
import SkeletonLoader from '../../components/SkeletonLoader';
import './Menu.css';

export default function StudentMenu() {
  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState([]);
  const [dishRatings, setDishRatings] = useState({});
  const [expandedCards, setExpandedCards] = useState({}); // meal_type -> boolean

  // Generate today + 6 days
  useEffect(() => {
    const list = [];
    const base = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      const dayName = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-IN', { weekday: 'short' });
      const label = `${d.getDate()} ${d.toLocaleDateString('en-IN', { month: 'short' })}`;
      list.push({ iso, dayName, label });
    }
    setDates(list);
    setSelectedDate(list[0].iso);
  }, []);

  // Fetch dish ratings once
  useEffect(() => {
    api.get('/student/dish-ratings')
      .then(res => setDishRatings(res.data || {}))
      .catch(err => console.error('Failed to load dish ratings:', err));
  }, []);

  // Fetch menu whenever selectedDate changes
  useEffect(() => {
    if (!selectedDate) return;
    setLoading(true);
    setError('');

    api.get(`/menu?date=${selectedDate}`)
      .then(res => {
        setMenu(res.data || []);
        // Expand all by default
        const initExp = {};
        (res.data || []).forEach(m => { initExp[m.meal_type] = true; });
        setExpandedCards(initExp);
      })
      .catch(err => {
        console.error('Failed to load menu for date:', err);
        setError('Failed to load menu for this date.');
      })
      .finally(() => setLoading(false));
  }, [selectedDate]);

  function toggleExpand(type) {
    setExpandedCards(prev => ({ ...prev, [type]: !prev[type] }));
  }

  const MEAL_ICONS = {
    breakfast: '🌅',
    lunch: '☀️',
    snacks: '☕',
    dinner: '🌙'
  };

  return (
    <AnimatedPage className="student-menu-page">
      <div className="menu-header">
        <h1 className="page-title">Weekly Mess Menu</h1>
        <p className="page-subtitle">View dishes, cutoff timings, and community ratings across the week.</p>
      </div>

      {/* Date Strip with shared layoutId pill */}
      <div className="date-strip-container">
        <div className="date-strip">
          {dates.map(d => {
            const isSelected = selectedDate === d.iso;
            return (
              <button
                key={d.iso}
                type="button"
                className={`date-pill ${isSelected ? 'active' : ''}`}
                onClick={() => setSelectedDate(d.iso)}
                style={{ position: 'relative' }}
              >
                <div style={{ position: 'relative', zIndex: 2 }}>
                  <span className="pill-day">{d.dayName}</span>
                  <span className="pill-date">{d.label}</span>
                </div>
                {isSelected && (
                  <motion.div
                    layoutId="active-date-pill-indicator"
                    className="active-date-pill-bg"
                    transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Menu Cards */}
      {loading ? (
        <div className="menu-cards-grid">
          {[1, 2, 3, 4].map(n => (
            <SkeletonLoader key={n} type="card" height={200} />
          ))}
        </div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : menu.length === 0 ? (
        <div className="empty-state card">
          <span className="empty-icon">🍽️</span>
          <h3>No meals scheduled</h3>
          <p>The mess management has not published meals for this date yet.</p>
        </div>
      ) : (
        <motion.div
          className="menu-cards-grid"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: { opacity: 1, transition: { staggerChildren: 0.08 } }
          }}
        >
          {menu.map(slot => {
            const costRupees = (slot.cost_paise / 100).toFixed(0);
            const isExpanded = expandedCards[slot.meal_type] !== false;

            return (
              <motion.div
                key={slot.meal_type}
                layout
                variants={{
                  hidden: { opacity: 0, y: 14 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.28 } }
                }}
                className="menu-slot-card card"
                onClick={() => toggleExpand(slot.meal_type)}
                style={{ cursor: 'pointer' }}
              >
                <div className="slot-card-header">
                  <div className="slot-title-wrap">
                    <span className="slot-icon">{MEAL_ICONS[slot.meal_type] || '🍽️'}</span>
                    <div>
                      <h3 className="slot-name">{slot.meal_type.toUpperCase()}</h3>
                      <span className="slot-time">{slot.start_time} – {slot.end_time}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div className="slot-cost-badge">₹{costRupees}</div>
                    <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                </div>

                <div className="slot-cutoff-notice">
                  ⏰ Skip Cutoff: <strong>{slot.cutoff_time}</strong>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="slot-dishes-list"
                    >
                      <span className="dishes-heading">Prepared Dishes:</span>
                      {!slot.dishes || slot.dishes.length === 0 ? (
                        <p className="no-dishes-text">Menu to be updated</p>
                      ) : (
                        <div className="dishes-items">
                          {slot.dishes.map(d => {
                            const ratingInfo = dishRatings[d.name];
                            return (
                              <div key={d.id} className="dish-row-item">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                  <DishImage size={28} />
                                  <span className="dish-title">{d.name}</span>
                                </div>
                                {ratingInfo && ratingInfo.count > 0 ? (
                                  <span className="dish-stars-pill" title={`${ratingInfo.count} ratings`}>
                                    ★ {ratingInfo.avg_stars} <small>({ratingInfo.count})</small>
                                  </span>
                                ) : (
                                  <span className="dish-stars-pill unrated">★ New</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </AnimatedPage>
  );
}
