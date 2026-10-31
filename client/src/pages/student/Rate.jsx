import React, { useState, useEffect } from 'react';
import api from '../../api';
import './Rate.css';

export default function StudentRate() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [meals, setMeals] = useState([]);
  const [ratingsForm, setRatingsForm] = useState({}); // dish_id -> { stars, comment, submitting, saved }

  async function loadRateableMeals() {
    try {
      setError('');
      const res = await api.get('/student/rate');
      const data = res.data || [];
      setMeals(data);

      // Pre-fill existing ratings
      const initialForm = {};
      data.forEach(m => {
        m.dishes.forEach(d => {
          initialForm[d.id] = {
            stars: d.userRating?.stars || 0,
            comment: d.userRating?.comment || '',
            submitting: false,
            saved: !!d.userRating
          };
        });
      });
      setRatingsForm(initialForm);
    } catch (err) {
      console.error('Failed to load rateable meals:', err);
      setError(err.response?.data?.error || err.message || 'Failed to load ratings.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRateableMeals();
  }, []);

  function handleStarClick(dishId, starValue) {
    setRatingsForm(prev => ({
      ...prev,
      [dishId]: {
        ...(prev[dishId] || { comment: '' }),
        stars: starValue,
        saved: false
      }
    }));
  }

  function handleCommentChange(dishId, text) {
    if (text.length > 300) return;
    setRatingsForm(prev => ({
      ...prev,
      [dishId]: {
        ...(prev[dishId] || { stars: 0 }),
        comment: text,
        saved: false
      }
    }));
  }

  async function handleSubmitRating(dishId) {
    const dishData = ratingsForm[dishId];
    if (!dishData || !dishData.stars) {
      alert('Please select at least 1 star before submitting.');
      return;
    }

    setRatingsForm(prev => ({
      ...prev,
      [dishId]: { ...prev[dishId], submitting: true }
    }));

    try {
      await api.post('/student/ratings', {
        dish_id: dishId,
        stars: dishData.stars,
        comment: dishData.comment || null
      });

      setRatingsForm(prev => ({
        ...prev,
        [dishId]: { ...prev[dishId], submitting: false, saved: true }
      }));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save rating.');
      setRatingsForm(prev => ({
        ...prev,
        [dishId]: { ...prev[dishId], submitting: false }
      }));
    }
  }

  const MEAL_ICONS = {
    breakfast: '🌅',
    lunch: '☀️',
    snacks: '☕',
    dinner: '🌙'
  };

  return (
    <div className="student-rate-page">
      <div className="rate-header">
        <h1 className="page-title">Rate Completed Meals</h1>
        <p className="page-subtitle">
          Your feedback directly informs mess cooking quantities and helps eliminate food waste.
        </p>
      </div>

      {loading ? (
        <div className="loading-state">⏳ Loading completed meals...</div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : meals.length === 0 ? (
        <div className="empty-state card">
          <span>🍲</span>
          <h3>No Meals Ready to Rate</h3>
          <p>
            Meals appear here once their dining slot has completed. Note that meals you skipped cannot be rated.
          </p>
        </div>
      ) : (
        <div className="rate-meals-list">
          {meals.map(m => (
            <div key={m.id} className="rate-meal-card card">
              <div className="rate-meal-header">
                <span className="rate-meal-emoji">{MEAL_ICONS[m.meal_type] || '🍽️'}</span>
                <div>
                  <h3 className="rate-meal-title">
                    {m.meal_type.toUpperCase()} • <span className="rate-meal-date">{m.date}</span>
                  </h3>
                  <span className="rate-meal-timing">
                    Served {m.slot?.start_time} – {m.slot?.end_time}
                  </span>
                </div>
              </div>

              <div className="rate-dishes-grid">
                {m.dishes.map(dish => {
                  const f = ratingsForm[dish.id] || { stars: 0, comment: '', submitting: false, saved: false };
                  const charsLeft = 300 - (f.comment?.length || 0);

                  return (
                    <div key={dish.id} className={`dish-rating-card ${f.saved ? 'is-saved' : ''}`}>
                      <div className="dish-top-bar">
                        <h4 className="dish-name-heading">{dish.name}</h4>
                        {f.saved && <span className="saved-badge">✓ Submitted</span>}
                      </div>

                      {/* Interactive 5-Star Input */}
                      <div className="star-rating-row">
                        {[1, 2, 3, 4, 5].map(star => (
                          <button
                            key={star}
                            type="button"
                            className={`star-btn ${star <= f.stars ? 'active' : ''}`}
                            onClick={() => handleStarClick(dish.id, star)}
                            aria-label={`${star} star`}
                          >
                            ★
                          </button>
                        ))}
                        <span className="star-score-label">
                          {f.stars > 0 ? `${f.stars} / 5` : 'Tap to rate'}
                        </span>
                      </div>

                      {/* Optional Comment with character counter */}
                      <div className="comment-input-wrap">
                        <textarea
                          placeholder="Optional feedback (taste, quantity, texture)..."
                          value={f.comment}
                          onChange={e => handleCommentChange(dish.id, e.target.value)}
                          rows={2}
                          maxLength={300}
                        />
                        <div className="char-counter">{charsLeft} characters remaining</div>
                      </div>

                      {/* Submit Button */}
                      <button
                        type="button"
                        className="btn btn-primary submit-rating-btn"
                        disabled={f.submitting || f.stars === 0}
                        onClick={() => handleSubmitRating(dish.id)}
                      >
                        {f.submitting ? 'Saving…' : f.saved ? 'Update Rating' : 'Submit Rating'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
