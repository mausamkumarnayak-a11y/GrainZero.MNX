import React, { useState, useEffect } from 'react';
import api from '../../api';
import './Fees.css';

export default function AdminFees() {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [sessionName, setSessionName] = useState('November 2026');
  const [feeData, setFeeData] = useState({
    totals: {
      total_invoices: 0,
      total_fee_rupees: '0.00',
      total_wallet_applied_rupees: '0.00',
      total_final_due_rupees: '0.00'
    },
    invoices: []
  });
  const [searchTerm, setSearchTerm] = useState('');

  async function loadFees() {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/admin/fees');
      setFeeData(res.data);
    } catch (err) {
      console.error('Failed to load fee invoices:', err);
      setError(err.response?.data?.error || 'Failed to load fee ledger.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFees();
  }, []);

  async function handleGenerateInvoices(e) {
    e.preventDefault();
    if (!sessionName.trim()) {
      alert('Please enter a billing session name.');
      return;
    }

    const confirmed = window.confirm(
      `Generate mess invoices for "${sessionName}"? This will apply each student's current wallet balance and create immutable final billing records.`
    );
    if (!confirmed) return;

    setGenerating(true);
    try {
      const res = await api.post('/admin/fees/generate', { session_name: sessionName });
      alert(`Success! Generated ${res.data.generated_count} invoices (skipped ${res.data.skipped_count} already issued).`);
      loadFees();
    } catch (err) {
      alert('Failed to generate invoices: ' + (err.response?.data?.error || err.message));
    } finally {
      setGenerating(false);
    }
  }

  const filteredInvoices = (feeData.invoices || []).filter(inv =>
    inv.student_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.student_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.session_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="admin-fees-page">
      <div className="fees-header">
        <div>
          <h1 className="page-title">Semester Fee Billing & Wallet Settlement</h1>
          <p className="page-subtitle">
            Deduct student meal-skipping credits from the hostel base fee and finalize balance receivables.
          </p>
        </div>
      </div>

      {/* Invoice Generation Card */}
      <form onSubmit={handleGenerateInvoices} className="generate-card card">
        <div className="gen-inputs-wrap">
          <div className="field">
            <label>Billing Cycle / Semester Session Name</label>
            <input
              type="text"
              placeholder="e.g. November 2026 or Fall 2026"
              value={sessionName}
              onChange={e => setSessionName(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary gen-btn"
            disabled={generating}
          >
            {generating ? 'Processing Ledger…' : 'Generate Cycle Invoices'}
          </button>
        </div>
        <p className="gen-hint">
          Idempotent: Students who already have an invoice for this session name will not be double billed.
        </p>
      </form>

      {loading ? (
        <div className="loading-state">⏳ Loading billing registry...</div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : (
        <>
          {/* Summary Metric Cards */}
          <div className="kpi-grid fee-kpi-grid">
            <div className="kpi-card card">
              <span className="kpi-icon">🧾</span>
              <div>
                <div className="kpi-val">{feeData.totals.total_invoices}</div>
                <div className="kpi-lbl">Total Invoices Issued</div>
              </div>
            </div>

            <div className="kpi-card card">
              <span className="kpi-icon">💵</span>
              <div>
                <div className="kpi-val">₹{feeData.totals.total_fee_rupees}</div>
                <div className="kpi-lbl">Gross Mess Assessment</div>
              </div>
            </div>

            <div className="kpi-card card">
              <span className="kpi-icon">💰</span>
              <div>
                <div className="kpi-val" style={{ color: '#16a34a' }}>
                  ₹{feeData.totals.total_wallet_applied_rupees}
                </div>
                <div className="kpi-lbl">Wallet Rebates Credited</div>
              </div>
            </div>

            <div className="kpi-card card highlight-kpi">
              <span className="kpi-icon">💳</span>
              <div>
                <div className="kpi-val highlight-text">
                  ₹{feeData.totals.total_final_due_rupees}
                </div>
                <div className="kpi-lbl">Net Fee Due to Hostel</div>
              </div>
            </div>
          </div>

          {/* Searchable Invoices Table */}
          <div className="card table-card">
            <div className="table-header-bar">
              <div>
                <h3 className="section-title">Settlement Audit Invoices</h3>
                <span className="table-subtitle">Official records with applied wallet discounts</span>
              </div>
              <input
                type="text"
                placeholder="Search student or email..."
                className="search-input"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            {filteredInvoices.length === 0 ? (
              <div className="empty-state">No matching fee invoices found.</div>
            ) : (
              <div className="table-responsive">
                <table className="fee-table">
                  <thead>
                    <tr>
                      <th>Invoice ID</th>
                      <th>Student</th>
                      <th>Billing Session</th>
                      <th>Base Fee</th>
                      <th>Wallet Rebate</th>
                      <th>Net Due</th>
                      <th>Generated Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.map(inv => (
                      <tr key={inv.id}>
                        <td className="inv-id">#INV-{inv.id.toString().padStart(4, '0')}</td>
                        <td>
                          <strong>{inv.student_name}</strong>
                          <div className="student-email">{inv.student_email}</div>
                        </td>
                        <td><span className="session-badge">{inv.session_name}</span></td>
                        <td>₹{inv.fee_rupees}</td>
                        <td style={{ color: '#16a34a', fontWeight: 600 }}>
                          -₹{inv.wallet_applied_rupees}
                        </td>
                        <td>
                          <strong className="due-amount">₹{inv.final_due_rupees}</strong>
                        </td>
                        <td className="text-muted">
                          {new Date(inv.created_at).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
