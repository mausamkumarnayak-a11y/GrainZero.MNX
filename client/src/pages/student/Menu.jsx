import React, { useState, useEffect } from 'react';
import api from '../../api';
import './Menu.css';

export default function StudentMenu() {
  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState([]);
  const [dishRatings, setDishRatings] = useState({});

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
      })
      .catch(err => {
        console.error('Failed to load menu for date:', err);
        setError('Failed to load menu for this date.');
      })
      .finally(() => setLoading(false));
  }, [selectedDate]);

  const MEAL_ICONS = {
    breakfast: '🌅',
    lunch: '☀️',
    snacks: '☕',
    dinner: '🌙'
  };

  return (
    <div className="student-menu-page">
      <div className="menu-header">
        <h1 className="page-title">Weekly Mess Menu</h1>
        <p className="page-subtitle">View dishes, cutoff timings, and community ratings across the week.</p>
      </div>

      {/* Date Strip */}
      <div className="date-strip">
        {dates.map(d => (
          <button
            key={d.iso}
            type="button"
            className={`date-pill ${selectedDate === d.iso ? 'active' : ''}`}
            onClick={() => setSelectedDate(d.iso)}
          >
            <span className="pill-day">{d.dayName}</span>
            <span className="pill-date">{d.label}</span>
          </button>
        ))}
      </div>

      {/* Menu Cards */}
      {loading ? (
        <div className="loading-state">⏳ Loading menu for {selectedDate}...</div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : menu.length === 0 ? (
        <div className="empty-state card">
          <span>🍽️</span>
          <h3>No meals scheduled</h3>
          <p>The mess management has not published meals for this date yet.</p>
        </div>
      ) : (
        <div className="menu-cards-grid">
          {menu.map(slot => {
            const costRupees = (slot.cost_paise / 100).toFixed(0);

            return (
              <div key={slot.meal_type} className="menu-slot-card card">
                <div className="slot-card-header">
                  <div className="slot-title-wrap">
                    <span className="slot-icon">{MEAL_ICONS[slot.meal_type] || '🍽️'}</span>
                    <div>
                      <h3 className="slot-name">{slot.meal_type.toUpperCase()}</h3>
                      <span className="slot-time">{slot.start_time} – {slot.end_time}</span>
                    </div>
                  </div>
                  <div className="slot-cost-badge">₹{costRupees}</div>
                </div>

                <div className="slot-cutoff-notice">
                  ⏰ Skip Cutoff: <strong>{slot.cutoff_time}</strong>
                </div>

                <div className="slot-dishes-list">
                  <span className="dishes-heading">Prepared Dishes:</span>
                  {!slot.dishes || slot.dishes.length === 0 ? (
                    <p className="no-dishes-text">Menu to be updated</p>
                  ) : (
                    <div className="dishes-items">
                      {slot.dishes.map(d => {
                        const ratingInfo = dishRatings[d.name];
                        return (
                          <div key={d.id} className="dish-row-item">
                            <span className="dish-title">{d.name}</span>
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
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
