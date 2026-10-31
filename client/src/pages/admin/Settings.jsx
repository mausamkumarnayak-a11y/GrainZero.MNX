import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import api from '../../api';
import AnimatedPage from '../../components/AnimatedPage';
import SkeletonLoader from '../../components/SkeletonLoader';
import './Settings.css';

export default function AdminSettings() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [settings, setSettings] = useState({
    wallet_percent: 30,
    buffer_percent: 10,
    mess_fee_paise: 600000
  });
  const [slots, setSlots] = useState([]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingSlotId, setSavingSlotId] = useState(null);

  async function loadSettings() {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/settings');
      if (res.data?.settings) setSettings(res.data.settings);
      if (res.data?.meal_slots) setSlots(res.data.meal_slots);
    } catch (err) {
      console.error('Failed to load settings:', err);
      setError('Failed to load configuration settings.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  // Update Settings (buffer, wallet, mess fee)
  async function handleSaveGlobalRules(e) {
    e.preventDefault();
    setSavingSettings(true);
    setError('');
    setSuccess('');

    try {
      await api.put('/admin/settings', {
        wallet_percent: parseInt(settings.wallet_percent, 10),
        buffer_percent: parseInt(settings.buffer_percent, 10),
        mess_fee_paise: parseInt(settings.mess_fee_paise, 10)
      });
      setSuccess('Settings & mess fee configuration saved successfully!');
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update settings.');
    } finally {
      setSavingSettings(false);
    }
  }

  // Update Slot Timing / Cutoff
  async function handleSaveSlot(slot) {
    if (slot.cutoff_time >= slot.start_time) {
      alert(`Invalid cutoff time for ${slot.meal_type}: Cutoff (${slot.cutoff_time}) must be strictly BEFORE start time (${slot.start_time}).`);
      return;
    }

    setSavingSlotId(slot.id);
    setError('');
    setSuccess('');

    try {
      await api.put(`/admin/meal-slots/${slot.id}`, {
        start_time: slot.start_time,
        end_time: slot.end_time,
        cutoff_time: slot.cutoff_time,
        cost_paise: parseInt(slot.cost_paise, 10)
      });
      setSuccess(`${slot.meal_type.toUpperCase()} timing and cutoff saved!`);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update meal slot.');
    } finally {
      setSavingSlotId(null);
    }
  }

  function handleSlotFieldChange(slotId, field, val) {
    setSlots(prev => prev.map(s => s.id === slotId ? { ...s, [field]: val } : s));
  }

  // Dynamic live calculation examples
  const sampleSkipped = 40;
  const sampleTotal = 200;
  const sampleAttending = sampleTotal - sampleSkipped;
  const sampleBufferPlates = Math.round(sampleAttending * (settings.buffer_percent / 100));
  const sampleTotalPrepare = sampleAttending + sampleBufferPlates;

  const sampleMealCost = 60;
  const sampleCreditAmount = Math.floor(sampleMealCost * (settings.wallet_percent / 100));

  return (
    <AnimatedPage className="admin-settings-page">
      <div className="settings-header">
        <h1 className="page-title">Mess Policy & Timing Settings</h1>
        <p className="page-subtitle">Configure slot timings, skip cutoffs, rebate percentages, and kitchen buffers.</p>
      </div>

      {success && <div className="alert alert-success">{success}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading-state">⏳ Loading configuration...</div>
      ) : (
        <>
          {/* 1. Meal Timings & Cutoffs */}
          <div className="settings-section card">
            <h2 className="section-title">⏰ Meal Timings & Cutoffs</h2>
            <p className="section-desc">
              Students can only cancel or skip a meal strictly before its cutoff time. Cutoff must be earlier than the dining start time.
            </p>

            <div className="slots-grid">
              {slots.map(slot => {
                const costRupees = (slot.cost_paise / 100).toFixed(0);
                const isSaving = savingSlotId === slot.id;

                return (
                  <div key={slot.id} className="slot-config-card">
                    <div className="slot-top">
                      <strong className="slot-title">{slot.meal_type.toUpperCase()}</strong>
                      <span className="slot-badge">Slot #{slot.id}</span>
                    </div>

                    <div className="slot-fields-grid">
                      <div className="field">
                        <label>Start Time</label>
                        <input
                          type="time"
                          value={slot.start_time}
                          onChange={e => handleSlotFieldChange(slot.id, 'start_time', e.target.value)}
                        />
                      </div>

                      <div className="field">
                        <label>End Time</label>
                        <input
                          type="time"
                          value={slot.end_time}
                          onChange={e => handleSlotFieldChange(slot.id, 'end_time', e.target.value)}
                        />
                      </div>

                      <div className="field highlight-field">
                        <label>Cutoff Time</label>
                        <input
                          type="time"
                          value={slot.cutoff_time}
                          onChange={e => handleSlotFieldChange(slot.id, 'cutoff_time', e.target.value)}
                        />
                      </div>

                      <div className="field">
                        <label>Cost (₹)</label>
                        <input
                          type="number"
                          value={costRupees}
                          onChange={e => handleSlotFieldChange(slot.id, 'cost_paise', Math.round(Number(e.target.value) * 100))}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn btn-secondary save-slot-btn"
                      disabled={isSaving}
                      onClick={() => handleSaveSlot(slot)}
                    >
                      {isSaving ? 'Saving…' : 'Save Slot Timing'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Global Rules & 3. Mess Fee */}
          <form onSubmit={handleSaveGlobalRules} className="settings-section card">
            <h2 className="section-title">📐 Buffer, Wallet Rebate & Base Fees</h2>
            <p className="section-desc">Adjust operational percentages and baseline per-student semester charges.</p>

            <div className="rules-form-grid">
              <div className="field">
                <label>Buffer Safety Stock (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={settings.buffer_percent}
                  onChange={e => setSettings(prev => ({ ...prev, buffer_percent: e.target.value }))}
                  required
                />
                <span className="field-hint">Added on top of attending students to prevent plate shortage</span>
              </div>

              <div className="field">
                <label>Wallet Rebate Return (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={settings.wallet_percent}
                  onChange={e => setSettings(prev => ({ ...prev, wallet_percent: e.target.value }))}
                  required
                />
                <span className="field-hint">Percentage of meal cost credited to student mess wallet</span>
              </div>

              <div className="field">
                <label>Base Semester Mess Fee (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={(settings.mess_fee_paise / 100).toFixed(0)}
                  onChange={e => setSettings(prev => ({ ...prev, mess_fee_paise: Math.round(Number(e.target.value) * 100) }))}
                  required
                />
                <span className="field-hint">Fixed fee before skip credits are deducted</span>
              </div>
            </div>

            {/* Live Calculation Examples */}
            <div className="live-examples-box">
              <div className="example-title">💡 Live Operational Impact Previews:</div>
              <ul className="examples-list">
                <li>
                  <strong>Kitchen Production:</strong> If 200 enrolled students have 40 skips (160 attending) with your <strong>{settings.buffer_percent}%</strong> buffer, the kitchen prepares <strong>{sampleTotalPrepare} plates</strong> ({sampleAttending} expected + {sampleBufferPlates} buffer).
                </li>
                <li>
                  <strong>Student Wallet Rebate:</strong> Skipping a ₹{sampleMealCost} lunch earns the student <strong>₹{sampleCreditAmount}</strong> ({settings.wallet_percent}% rebate) credited directly to their mess account.
                </li>
              </ul>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={savingSettings}
              style={{ marginTop: '1.25rem' }}
            >
              {savingSettings ? 'Saving Settings…' : 'Save Policy & Mess Fee Rules'}
            </button>
          </form>
        </>
      )}
    </AnimatedPage>
  );
}
