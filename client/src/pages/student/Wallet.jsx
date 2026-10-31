import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import api from '../../api';
import AnimatedPage from '../../components/AnimatedPage';
import AnimatedCounter from '../../components/AnimatedCounter';
import Coin from '../../components/art/Coin';
import SkeletonLoader from '../../components/SkeletonLoader';
import './Wallet.css';

export default function StudentWallet() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [wallet, setWallet] = useState({
    balance_paise: 0,
    total_skipped_meals: 0,
    mess_fee_paise: 600000,
    estimated_due_paise: 600000,
    transactions: []
  });
  const [invoices, setInvoices] = useState([]);

  async function loadWallet() {
    try {
      setError('');
      const [walletRes, invoiceRes] = await Promise.all([
        api.get('/student/wallet'),
        api.get('/student/invoices')
      ]);
      setWallet(walletRes.data);
      setInvoices(invoiceRes.data || []);
    } catch (err) {
      console.error('Failed to load wallet data:', err);
      setError(err.response?.data?.error || err.message || 'Failed to load wallet.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWallet();
  }, []);

  const balanceRupees = (wallet.balance_paise / 100).toFixed(2);
  const messFeeRupees = (wallet.mess_fee_paise / 100).toFixed(2);
  const estimatedDueRupees = (wallet.estimated_due_paise / 100).toFixed(2);

  // Progress percentage (wallet discount against mess fee)
  const savingsPct = wallet.mess_fee_paise > 0
    ? Math.min(100, Math.round((Math.max(wallet.balance_paise, 0) / wallet.mess_fee_paise) * 100))
    : 0;

  return (
    <AnimatedPage className="student-wallet-page">
      <div className="wallet-header">
        <h1 className="page-title">Mess Wallet & Fee Rebates</h1>
        <p className="page-subtitle">Track your meal skipping credits and semester mess fee deductions.</p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
            <SkeletonLoader type="card" height={130} />
            <SkeletonLoader type="card" height={130} />
            <SkeletonLoader type="card" height={130} />
          </div>
          <SkeletonLoader type="card" height={90} />
          <SkeletonLoader type="card" height={250} />
        </div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : (
        <>
          {/* Main Stats Cards Grid */}
          <div className="wallet-cards-grid">
            {/* Balance Card */}
            <motion.div
              className="wallet-stat-card card card-highlight"
              whileHover={{ y: -3 }}
              transition={{ duration: 0.2 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="card-badge">Current Balance</span>
                <Coin size={24} />
              </div>
              <div className="stat-amount-wrap">
                <span className="amount-hero">
                  <AnimatedCounter prefix="₹" value={wallet.balance_paise / 100} decimals={2} duration={1000} />
                </span>
              </div>
              <p className="card-hint">Available credit towards your next mess fee settlement</p>
            </motion.div>

            {/* Fee Offset Card */}
            <motion.div
              className="wallet-stat-card card"
              whileHover={{ y: -3 }}
              transition={{ duration: 0.2 }}
            >
              <span className="card-badge">Base Mess Fee</span>
              <div className="stat-amount-wrap secondary">
                <span className="amount-val">₹{messFeeRupees}</span>
              </div>
              <div className="net-due-banner">
                You pay <strong>₹{estimatedDueRupees}</strong> after rebate
              </div>
            </motion.div>

            {/* Total Meals Skipped */}
            <motion.div
              className="wallet-stat-card card"
              whileHover={{ y: -3 }}
              transition={{ duration: 0.2 }}
            >
              <span className="card-badge">Meals Skipped</span>
              <div className="stat-amount-wrap count">
                <span className="amount-hero">
                  <AnimatedCounter value={wallet.total_skipped_meals} decimals={0} duration={800} />
                </span>
                <span className="unit">meals</span>
              </div>
              <p className="card-hint">Prevented mess staff overcooking & food waste</p>
            </motion.div>
          </div>

          {/* Fee Discount Progress Bar with smooth animated fill */}
          <div className="fee-progress-card card">
            <div className="progress-labels">
              <span>
                <strong>Fee Rebate Progress:</strong> ₹{balanceRupees} earned of ₹{messFeeRupees} fee
              </span>
              <span className="progress-pct">{savingsPct}% Off</span>
            </div>
            <div className="progress-track">
              <motion.div
                className="progress-fill"
                initial={{ width: 0 }}
                animate={{ width: `${savingsPct}%` }}
                transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>

          {/* Transaction History with staggered rows */}
          <div className="wallet-section card">
            <div className="section-header">
              <h3>Recent Wallet Transactions</h3>
              <span className="count-tag">{wallet.transactions?.length || 0} records</span>
            </div>

            {!wallet.transactions || wallet.transactions.length === 0 ? (
              <div className="empty-history">
                <span className="empty-icon">🪙</span>
                <p>No transactions yet. Skip an upcoming meal to earn credit!</p>
              </div>
            ) : (
              <div className="tx-table-wrap">
                <table className="tx-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Meal</th>
                      <th>Type</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <motion.tbody
                    initial="hidden"
                    animate="visible"
                    variants={{
                      hidden: { opacity: 0 },
                      visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
                    }}
                  >
                    {wallet.transactions.map(tx => {
                      const isCredit = tx.type === 'skip_credit';
                      const isReversal = tx.type === 'skip_reversal';
                      const amountRupees = Math.abs(tx.amount_paise / 100).toFixed(2);
                      const dateFormatted = tx.created_at
                        ? new Date(tx.created_at).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : '—';

                      return (
                        <motion.tr
                          key={tx.id}
                          variants={{
                            hidden: { opacity: 0, x: -10 },
                            visible: { opacity: 1, x: 0, transition: { duration: 0.22 } }
                          }}
                        >
                          <td className="tx-date">{dateFormatted}</td>
                          <td>
                            <strong>
                              {tx.note || (isCredit ? 'Meal skip credit' : isReversal ? 'Skip cancelled' : 'Wallet adjustment')}
                            </strong>
                          </td>
                          <td>
                            {tx.meal_type ? (
                              <span className="meal-tag">
                                {tx.meal_date ? `${tx.meal_date} ` : ''}{tx.meal_type.toUpperCase()}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            <span className={`tx-type-pill ${tx.type}`}>
                              {isCredit ? 'Credit' : isReversal ? 'Reversal' : 'Deduction'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', justifyContent: 'flex-end' }}>
                              {isCredit && (
                                <motion.div
                                  animate={{ y: [0, -3, 0] }}
                                  transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                                >
                                  <Coin size={15} />
                                </motion.div>
                              )}
                              <span className={`tx-amount ${isCredit ? 'credit' : isReversal ? 'reversal' : 'deduction'}`}>
                                {isCredit ? `+₹${amountRupees}` : isReversal ? `-₹${amountRupees}` : `-₹${amountRupees}`}
                              </span>
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </motion.tbody>
                </table>
              </div>
            )}
          </div>

          {/* Generated Invoices If Any */}
          {invoices.length > 0 && (
            <div className="wallet-section card" style={{ marginTop: '1.5rem' }}>
              <div className="section-header">
                <h3>Official Fee Settlement Invoices</h3>
                <span className="count-tag">{invoices.length} Invoices</span>
              </div>
              <div className="tx-table-wrap">
                <table className="tx-table">
                  <thead>
                    <tr>
                      <th>Session</th>
                      <th>Issued On</th>
                      <th>Original Fee</th>
                      <th>Wallet Applied</th>
                      <th style={{ textAlign: 'right' }}>Final Paid / Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(inv => (
                      <tr key={inv.id}>
                        <td><strong>{inv.session_name}</strong></td>
                        <td>{new Date(inv.created_at).toLocaleDateString('en-IN')}</td>
                        <td>₹{(inv.fee_paise / 100).toFixed(2)}</td>
                        <td style={{ color: 'var(--primary, #15803d)', fontWeight: 700 }}>
                          -₹{(inv.wallet_applied_paise / 100).toFixed(2)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 800 }}>
                          ₹{(inv.final_due_paise / 100).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </AnimatedPage>
  );
}
