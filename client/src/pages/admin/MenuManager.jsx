import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../api';
import AnimatedPage from '../../components/AnimatedPage';
import DishImage from '../../components/DishImage';
import SkeletonLoader from '../../components/SkeletonLoader';
import './MenuManager.css';

export default function AdminMenuManager() {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [menu, setMenu] = useState([]);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dishInputs, setDishInputs] = useState({}); // meal_id -> dish text
  const [copying, setCopying] = useState(false);

  // Load slots and menu for date
  async function loadMenu(selectedDate = date) {
    setLoading(true);
    setError('');
    try {
      const [menuRes, settingsRes] = await Promise.all([
        api.get(`/menu?date=${selectedDate}`),
        api.get('/settings')
      ]);
      setMenu(menuRes.data || []);
      setSlots(settingsRes.data?.meal_slots || []);
    } catch (err) {
      console.error('Failed to load menu:', err);
      setError('Failed to load menu for ' + selectedDate);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMenu(date);
  }, [date]);

  function handleShiftDate(deltaDays) {
    const d = new Date(date);
    d.setDate(d.getDate() + deltaDays);
    const iso = d.toISOString().split('T')[0];
    setDate(iso);
  }

  // Add a dish to a meal
  async function handleAddDish(mealId) {
    const text = (dishInputs[mealId] || '').trim();
    if (!text) return;

    try {
      await api.post(`/admin/meals/${mealId}/dishes`, { name: text });
      setDishInputs(prev => ({ ...prev, [mealId]: '' }));
      loadMenu(date);
    } catch (err) {
      alert('Failed to add dish: ' + (err.response?.data?.error || err.message));
    }
  }

  // Delete a dish
  async function handleDeleteDish(dishId) {
    try {
      await api.delete(`/admin/dishes/${dishId}`);
      loadMenu(date);
    } catch (err) {
      alert('Failed to delete dish: ' + (err.response?.data?.error || err.message));
    }
  }

  // Create meal slot on this date if missing
  async function handleCreateMeal(mealType) {
    try {
      await api.post('/admin/meals', {
        date,
        meal_type: mealType,
        dishes: ['Special Dish']
      });
      loadMenu(date);
    } catch (err) {
      alert('Failed to create meal: ' + (err.response?.data?.error || err.message));
    }
  }

  // Delete meal
  async function handleDeleteMeal(mealId, mealType) {
    if (!window.confirm(`Delete the entire ${mealType.toUpperCase()} meal for ${date}?`)) return;
    try {
      await api.delete(`/admin/meals/${mealId}`);
      loadMenu(date);
    } catch (err) {
      alert('Failed to delete meal: ' + (err.response?.data?.error || err.message));
    }
  }

  // Copy previous day menu
  async function handleCopyPreviousDay() {
    const prevDate = new Date(date);
    prevDate.setDate(prevDate.getDate() - 1);
    const fromDateStr = prevDate.toISOString().split('T')[0];

    const confirmed = window.confirm(
      `Copy all meals and dishes from yesterday (${fromDateStr}) onto ${date}? Existing dishes on ${date} will be replaced.`
    );
    if (!confirmed) return;

    setCopying(true);
    try {
      await api.post('/admin/menu/copy', {
        from_date: fromDateStr,
        to_date: date
      });
      alert(`Menu successfully copied from ${fromDateStr}!`);
      loadMenu(date);
    } catch (err) {
      alert('Failed to copy menu: ' + (err.response?.data?.error || err.message));
    } finally {
      setCopying(false);
    }
  }

  return (
    <AnimatedPage className="admin-menu-manager-page">
      <div className="manager-header">
        <div>
          <h1 className="page-title">Menu Manager & Production Registry</h1>
          <p className="page-subtitle">Add dishes, manage timings, and duplicate meal plans across calendar days.</p>
        </div>

        <button
          type="button"
          className="btn btn-secondary copy-btn"
          disabled={copying}
          onClick={handleCopyPreviousDay}
        >
          {copying ? 'Copying…' : '📋 Copy Previous Day'}
        </button>
      </div>

      {/* Date Navigator Bar */}
      <div className="date-nav-bar card">
        <button type="button" className="nav-step-btn" onClick={() => handleShiftDate(-1)}>
          ◀ Prev Day
        </button>
        <div className="date-picker-wrap">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>
        <button type="button" className="nav-step-btn" onClick={() => handleShiftDate(1)}>
          Next Day ▶
        </button>
      </div>

      {loading ? (
        <div className="menu-manager-grid">
          {[1, 2, 3, 4].map(n => <SkeletonLoader key={n} type="card" height={220} />)}
        </div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : (
        <motion.div
          className="menu-manager-grid"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: { opacity: 1, transition: { staggerChildren: 0.08 } }
          }}
        >
          {slots.map(slot => {
            const meal = menu.find(m => m.meal_type === slot.meal_type);
            const costRupees = (slot.cost_paise / 100).toFixed(0);
            const dishInput = dishInputs[meal?.id] || '';

            return (
              <motion.div
                key={slot.meal_type}
                variants={{
                  hidden: { opacity: 0, y: 14 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.25 } }
                }}
                className="meal-edit-card card"
              >
                <div className="card-top-row">
                  <div>
                    <h3 className="meal-card-title">{slot.meal_type.toUpperCase()}</h3>
                    <span className="timing-text">
                      {slot.start_time} – {slot.end_time} • Cutoff: <strong>{slot.cutoff_time}</strong>
                    </span>
                  </div>
                  <div className="cost-tag">₹{costRupees}</div>
                </div>

                {!meal ? (
                  <div className="meal-missing-box">
                    <p>No dishes assigned for this date.</p>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleCreateMeal(slot.meal_type)}
                    >
                      + Create {slot.meal_type}
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Dish Chips */}
                    <div className="dishes-edit-section">
                      <span className="dishes-sub">Dishes ({meal.dishes?.length || 0}):</span>
                      <div className="dish-chips-list">
                        {meal.dishes && meal.dishes.length > 0 ? (
                          meal.dishes.map(d => (
                            <motion.span
                              key={d.id}
                              className="dish-chip-removable"
                              initial={{ scale: 0.9, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                            >
                              <DishImage size={20} />
                              <span>{d.name}</span>
                              <button
                                type="button"
                                className="remove-dish-btn"
                                onClick={() => handleDeleteDish(d.id)}
                                title="Remove dish"
                              >
                                ✕
                              </button>
                            </motion.span>
                          ))
                        ) : (
                          <span className="no-dishes-note">No dishes added yet.</span>
                        )}
                      </div>
                    </div>

                    {/* Add Dish Input */}
                    <div className="add-dish-box">
                      <input
                        type="text"
                        placeholder="Add dish (e.g. Paneer Butter Masala)..."
                        value={dishInput}
                        onChange={e => setDishInputs(prev => ({ ...prev, [meal.id]: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddDish(meal.id);
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary add-btn"
                        onClick={() => handleAddDish(meal.id)}
                      >
                        Add
                      </button>
                    </div>

                    {/* Delete Meal Option */}
                    <div className="delete-meal-row">
                      <button
                        type="button"
                        className="btn-link-danger"
                        onClick={() => handleDeleteMeal(meal.id, slot.meal_type)}
                      >
                        Delete this meal slot
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </AnimatedPage>
  );
}
