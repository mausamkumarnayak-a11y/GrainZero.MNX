import React, { useState, useEffect } from 'react';
import api from '../../api';
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
    <div className="student-wallet-page">
      <div className="wallet-header">
        <h1 className="page-title">Mess Wallet & Fee Rebates</h1>
        <p className="page-subtitle">Track your meal skipping credits and semester fee reductions.</p>
      </div>

      {loading ? (
        <div className="loading-state">⏳ Loading wallet details...</div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : (
        <>
          {/* Main Stats Cards Grid */}
          <div className="wallet-cards-grid">
            {/* Balance Card */}
            <div className="wallet-stat-card card card-highlight">
              <span className="card-badge">Current Balance</span>
              <div className="stat-amount-wrap">
                <span className="currency">₹</span>
                <span className="amount-hero">{balanceRupees}</span>
              </div>
              <p className="card-hint">Available credit towards your next mess fee cycle</p>
            </div>

            {/* Fee Offset Card */}
            <div className="wallet-stat-card card">
              <span className="card-badge">Base Mess Fee</span>
              <div className="stat-amount-wrap secondary">
                <span className="currency">₹</span>
                <span className="amount-val">{messFeeRupees}</span>
              </div>
              <div className="net-due-banner">
                You will pay <strong>₹{estimatedDueRupees}</strong> after wallet rebate
              </div>
            </div>

            {/* Total Meals Skipped */}
            <div className="wallet-stat-card card">
              <span className="card-badge">Total Meals Skipped</span>
              <div className="stat-amount-wrap count">
                <span className="amount-hero">{wallet.total_skipped_meals}</span>
                <span className="unit">meals</span>
              </div>
              <p className="card-hint">Saved food from kitchen overproduction</p>
            </div>
          </div>

          {/* Fee Discount Progress Bar */}
          <div className="fee-progress-card card">
            <div className="progress-labels">
              <span><strong>Fee Rebate Progress:</strong> ₹{balanceRupees} earned of ₹{messFeeRupees} fee</span>
              <span className="progress-pct">{savingsPct}% Off</span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${savingsPct}%` }}
              />
            </div>
          </div>

          {/* Transaction History */}
          <div className="wallet-section card">
            <div className="section-header">
              <h3>Recent Wallet Transactions</h3>
              <span className="count-tag">{wallet.transactions?.length || 0} records</span>
            </div>

            {!wallet.transactions || wallet.transactions.length === 0 ? (
              <div className="empty-history">
                <span>🍃</span>
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
                  <tbody>
                    {wallet.transactions.map(tx => {
                      const isCredit = tx.type === 'skip_credit';
                      const isReversal = tx.type === 'skip_reversal';
                      const isDeduction = tx.type === 'fee_deduction' || tx.amount_paise < 0;
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
                        <tr key={tx.id}>
                          <td className="tx-date">{dateFormatted}</td>
                          <td>
                            <strong>{tx.note || (isCredit ? 'Meal skip credit' : isReversal ? 'Skip cancelled' : 'Wallet adjustment')}</strong>
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
                            <span className={`tx-amount ${isCredit ? 'credit' : isReversal ? 'reversal' : 'deduction'}`}>
                              {isCredit ? `+₹${amountRupees}` : isReversal ? `-₹${amountRupees}` : `-₹${amountRupees}`}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
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
                        <td style={{ color: '#16a34a', fontWeight: 600 }}>
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
    </div>
  );
}
