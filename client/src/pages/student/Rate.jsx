import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import api from '../../api';
import AnimatedPage from '../../components/AnimatedPage';
import DishImage from '../../components/DishImage';
import Sparkle from '../../components/art/Sparkle';
import SkeletonLoader from '../../components/SkeletonLoader';
import './Rate.css';

export default function StudentRate() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [meals, setMeals] = useState([]);
  const [ratingsForm, setRatingsForm] = useState({}); // dish_id -> { stars, comment, submitting, saved }
  const [toastMessage, setToastMessage] = useState('');
  const [sparkleDishId, setSparkleDishId] = useState(null);

  async function loadRateableMeals() {
    try {
      setError('');
      const res = await api.get('/student/rate');
      const data = res.data || [];
      setMeals(data);

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
    setSparkleDishId(dishId);
    setTimeout(() => setSparkleDishId(null), 600);

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

  async function handleSubmitRating(dishId, e) {
    const dishData = ratingsForm[dishId];
    if (!dishData || !dishData.stars) {
      alert('Please select at least 1 star before submitting.');
      return;
    }

    const rect = e?.currentTarget?.getBoundingClientRect();

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

      // Fire canvas-confetti
      if (rect) {
        confetti({
          particleCount: 40,
          spread: 60,
          origin: {
            x: (rect.left + rect.width / 2) / window.innerWidth,
            y: (rect.top + rect.height / 2) / window.innerHeight
          },
          colors: ['#F2B01E', '#15803d', '#4cae4c', '#EAF3DE']
        });
      }

      // Show friendly slide-in toast
      setToastMessage('⭐ Feedback recorded! Your rating helps the kitchen optimize cooking.');
      setTimeout(() => setToastMessage(''), 3500);

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
    <AnimatedPage className="student-rate-page">
      <div className="rate-header">
        <h1 className="page-title">Rate Completed Meals</h1>
        <p className="page-subtitle">
          Your honest ratings directly tune kitchen preparation numbers and eliminate hostel food waste.
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {[1, 2].map(i => (
            <SkeletonLoader key={i} type="card" height={180} />
          ))}
        </div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : meals.length === 0 ? (
        <div className="empty-state card">
          <span className="empty-icon">🍲</span>
          <h3>No Meals Ready to Rate</h3>
          <p>
            Meals appear here once their dining time slot has ended. Skipped meals cannot be rated.
          </p>
        </div>
      ) : (
        <motion.div
          className="rate-meals-list"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
          }}
        >
          {meals.map(m => (
            <motion.div
              key={m.id}
              variants={{
                hidden: { opacity: 0, y: 16 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.28 } }
              }}
              className="rate-meal-card card"
            >
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
                  const isSparkling = sparkleDishId === dish.id;

                  return (
                    <div key={dish.id} className={`dish-rating-card ${f.saved ? 'is-saved' : ''}`}>
                      <div className="dish-top-bar">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <DishImage size={36} />
                          <h4 className="dish-name-heading">{dish.name}</h4>
                        </div>
                        {f.saved && (
                          <motion.span
                            initial={{ scale: 0.8 }}
                            animate={{ scale: 1 }}
                            className="saved-badge"
                          >
                            ✓ Submitted
                          </motion.span>
                        )}
                      </div>

                      {/* Animated 5-Star Input */}
                      <div className="star-rating-row" style={{ position: 'relative' }}>
                        {[1, 2, 3, 4, 5].map(star => {
                          const isActive = star <= f.stars;
                          return (
                            <motion.button
                              key={star}
                              type="button"
                              className={`star-btn ${isActive ? 'active' : ''}`}
                              onClick={() => handleStarClick(dish.id, star)}
                              whileHover={{ scale: 1.35 }}
                              whileTap={{ scale: 0.85 }}
                              aria-label={`${star} star`}
                            >
                              ★
                            </motion.button>
                          );
                        })}

                        {isSparkling && (
                          <motion.div
                            initial={{ scale: 0, opacity: 1 }}
                            animate={{ scale: 1.5, opacity: 0 }}
                            transition={{ duration: 0.55 }}
                            style={{ position: 'absolute', right: 40, top: -6 }}
                          >
                            <Sparkle size={26} color="#F2B01E" />
                          </motion.div>
                        )}

                        <span className="star-score-label">
                          {f.stars > 0 ? `${f.stars} / 5` : 'Tap to rate'}
                        </span>
                      </div>

                      {/* Comment Input */}
                      <div className="comment-input-wrap">
                        <textarea
                          placeholder="Optional comments (freshness, salt, texture, spices)..."
                          value={f.comment}
                          onChange={e => handleCommentChange(dish.id, e.target.value)}
                          rows={2}
                          maxLength={300}
                        />
                        <div className="char-counter">{charsLeft} characters remaining</div>
                      </div>

                      {/* Submit Button with hover lift & press scale */}
                      <button
                        type="button"
                        className="btn btn-primary submit-rating-btn"
                        disabled={f.submitting || f.stars === 0}
                        onClick={(e) => handleSubmitRating(dish.id, e)}
                      >
                        {f.submitting ? 'Saving…' : f.saved ? 'Update Rating' : 'Submit Rating'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Floating friendly toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            className="floating-toast"
            initial={{ opacity: 0, y: 30, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </AnimatedPage>
  );
}
