import { useState, type FormEvent } from 'react';
import type { CustomerPaymentPlan } from '../lib/posService';
import './SettlementPlanModal.css';

export interface SettlementPlanModalProps {
  invoiceNo: string;
  customerId: string;
  customerName: string;
  grandTotal: number;
  amountPaid: number;
  defaultPaymentMethod: 'cash' | 'cheque' | 'bank_transfer' | 'jazzcash' | 'easypaisa';
  onConfirm: (plans: CustomerPaymentPlan[]) => void;
  onSkip: () => void;
}

type PlanPaymentMethod = 'cash' | 'cheque' | 'bank_transfer' | 'jazzcash' | 'easypaisa';

interface PlanRow {
  id: string;
  installment_no: number;
  amount_due: string;
  due_date: string;
  payment_method: PlanPaymentMethod;
  cheque_no: string;
  cheque_clearing_date: string;
  notes: string;
}

function makeTodayISO() {
  return new Date().toISOString().split('T')[0];
}

function makeDefaultDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function SettlementPlanModal({
  invoiceNo,
  customerId,
  customerName,
  grandTotal,
  amountPaid,
  defaultPaymentMethod,
  onConfirm,
  onSkip,
}: SettlementPlanModalProps) {
  const balanceDue = grandTotal - amountPaid;

  const [installmentMode, setInstallmentMode] = useState<'single' | 'multi'>('single');
  const [numInstallments, setNumInstallments] = useState<number>(2);
  const [rows, setRows] = useState<PlanRow[]>([
    {
      id: '1',
      installment_no: 1,
      amount_due: String(balanceDue),
      due_date: makeDefaultDate(30),
      payment_method: defaultPaymentMethod === 'cheque' ? 'cheque' : 'cash',
      cheque_no: '',
      cheque_clearing_date: '',
      notes: '',
    },
  ]);
  const [error, setError] = useState('');

  // When mode or installment count changes, regenerate rows
  function regenerateRows(mode: 'single' | 'multi', count: number) {
    if (mode === 'single') {
      setRows([
        {
          id: '1',
          installment_no: 1,
          amount_due: String(balanceDue),
          due_date: makeDefaultDate(30),
          payment_method: defaultPaymentMethod === 'cheque' ? 'cheque' : 'cash',
          cheque_no: '',
          cheque_clearing_date: '',
          notes: '',
        },
      ]);
    } else {
      const perInstallment = Math.round((balanceDue / count) * 100) / 100;
      const newRows: PlanRow[] = Array.from({ length: count }, (_, i) => ({
        id: String(i + 1),
        installment_no: i + 1,
        amount_due: i === count - 1
          ? String(Math.round((balanceDue - perInstallment * (count - 1)) * 100) / 100)
          : String(perInstallment),
        due_date: makeDefaultDate(30 * (i + 1)),
        payment_method: 'cash',
        cheque_no: '',
        cheque_clearing_date: '',
        notes: '',
      }));
      setRows(newRows);
    }
  }

  function handleModeChange(mode: 'single' | 'multi') {
    setInstallmentMode(mode);
    regenerateRows(mode, numInstallments);
  }

  function handleInstallmentCountChange(count: number) {
    const c = Math.max(2, Math.min(12, count));
    setNumInstallments(c);
    if (installmentMode === 'multi') regenerateRows('multi', c);
  }

  function updateRow(id: string, field: keyof PlanRow, value: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    const totalPlanned = rows.reduce((sum, r) => sum + (parseFloat(r.amount_due) || 0), 0);
    if (Math.abs(totalPlanned - balanceDue) > 1) {
      setError(`Total installment amounts (PKR ${totalPlanned.toLocaleString()}) must equal the balance due (PKR ${balanceDue.toLocaleString()}). Difference: ${Math.abs(totalPlanned - balanceDue).toFixed(2)}`);
      return;
    }

    for (const r of rows) {
      if (!r.due_date) {
        setError(`Please set a due date for Installment #${r.installment_no}`);
        return;
      }
      if (!parseFloat(r.amount_due) || parseFloat(r.amount_due) <= 0) {
        setError(`Installment #${r.installment_no} amount must be greater than 0`);
        return;
      }
      if (r.payment_method === 'cheque' && !r.cheque_no) {
        setError(`Please enter a cheque number for Installment #${r.installment_no}`);
        return;
      }
    }

    const plans: CustomerPaymentPlan[] = rows.map(r => ({
      customer_id: customerId,
      invoice_no: invoiceNo,
      installment_no: r.installment_no,
      total_installments: rows.length,
      amount_due: parseFloat(r.amount_due),
      amount_paid: 0,
      due_date: r.due_date,
      payment_method: r.payment_method,
      cheque_no: r.cheque_no || undefined,
      cheque_clearing_date: r.payment_method === 'cheque' && r.cheque_clearing_date ? r.cheque_clearing_date : undefined,
      status: 'planned',
      notes: r.notes || undefined,
    }));

    onConfirm(plans);
  }

  const totalPlanned = rows.reduce((sum, r) => sum + (parseFloat(r.amount_due) || 0), 0);
  const planBalanceOk = Math.abs(totalPlanned - balanceDue) < 1;

  return (
    <div className="spm-backdrop">
      <div className="spm-box">
        {/* Header */}
        <div className="spm-header">
          <div className="spm-header-icon">📋</div>
          <div>
            <h2 className="spm-title">Settlement Plan Required</h2>
            <p className="spm-subtitle">
              Invoice #{invoiceNo} · {customerName}
            </p>
          </div>
        </div>

        {/* Balance Summary */}
        <div className="spm-summary">
          <div className="spm-summary-row">
            <span>Invoice Total</span>
            <strong>PKR {grandTotal.toLocaleString()}</strong>
          </div>
          <div className="spm-summary-row">
            <span>Paid Now</span>
            <strong className="spm-paid">− PKR {amountPaid.toLocaleString()}</strong>
          </div>
          <div className="spm-summary-row spm-summary-due">
            <span>Balance Remaining</span>
            <strong>PKR {balanceDue.toLocaleString()}</strong>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="spm-form">
          {/* Mode Selection */}
          <div className="spm-mode-row">
            <label className="pos-label">Settlement Type</label>
            <div className="spm-mode-btns">
              <button
                type="button"
                className={`spm-mode-btn ${installmentMode === 'single' ? 'spm-mode-btn--active' : ''}`}
                onClick={() => handleModeChange('single')}
              >
                💳 Single Future Payment
              </button>
              <button
                type="button"
                className={`spm-mode-btn ${installmentMode === 'multi' ? 'spm-mode-btn--active' : ''}`}
                onClick={() => handleModeChange('multi')}
              >
                📅 Multiple Installments
              </button>
            </div>

            {installmentMode === 'multi' && (
              <div className="spm-installment-count">
                <label className="pos-label">Number of Installments</label>
                <div className="spm-count-row">
                  <button type="button" className="spm-count-btn" onClick={() => handleInstallmentCountChange(numInstallments - 1)}>−</button>
                  <span className="spm-count-val">{numInstallments}</span>
                  <button type="button" className="spm-count-btn" onClick={() => handleInstallmentCountChange(numInstallments + 1)}>+</button>
                </div>
              </div>
            )}
          </div>

          {/* Installment Rows */}
          <div className="spm-rows">
            {rows.map((row, idx) => (
              <div key={row.id} className="spm-row">
                <div className="spm-row-header">
                  <span className="spm-row-label">
                    {installmentMode === 'single' ? '📅 Future Payment' : `Installment ${row.installment_no} of ${rows.length}`}
                  </span>
                </div>

                <div className="spm-row-fields">
                  {/* Amount Due */}
                  <div className="spm-field">
                    <label className="pos-label">Amount (PKR)</label>
                    <input
                      type="number"
                      className="pos-input"
                      min="1"
                      step="1"
                      value={row.amount_due}
                      onChange={e => updateRow(row.id, 'amount_due', e.target.value)}
                      required
                    />
                  </div>

                  {/* Due Date */}
                  <div className="spm-field">
                    <label className="pos-label">Due Date</label>
                    <input
                      type="date"
                      className="pos-input"
                      min={makeTodayISO()}
                      value={row.due_date}
                      onChange={e => updateRow(row.id, 'due_date', e.target.value)}
                      required
                    />
                  </div>

                  {/* Payment Method */}
                  <div className="spm-field">
                    <label className="pos-label">Payment Method</label>
                    <select
                      className="pos-select"
                      value={row.payment_method}
                      onChange={e => updateRow(row.id, 'payment_method', e.target.value)}
                    >
                      <option value="cash">Cash</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="jazzcash">JazzCash</option>
                      <option value="easypaisa">EasyPaisa</option>
                      <option value="cheque">Cheque (Post-dated)</option>
                    </select>
                  </div>

                  {/* Cheque Fields (conditional) */}
                  {row.payment_method === 'cheque' && (
                    <>
                      <div className="spm-field">
                        <label className="pos-label">Cheque No. *</label>
                        <input
                          type="text"
                          className="pos-input"
                          placeholder="e.g. 001234"
                          value={row.cheque_no}
                          onChange={e => updateRow(row.id, 'cheque_no', e.target.value)}
                          required
                        />
                      </div>
                      <div className="spm-field">
                        <label className="pos-label">Cheque Clearing Date</label>
                        <input
                          type="date"
                          className="pos-input"
                          min={makeTodayISO()}
                          value={row.cheque_clearing_date}
                          onChange={e => updateRow(row.id, 'cheque_clearing_date', e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  {/* Notes */}
                  <div className="spm-field spm-field--full">
                    <label className="pos-label">Notes (Optional)</label>
                    <input
                      type="text"
                      className="pos-input"
                      placeholder="e.g. Will deliver cheque on Friday"
                      value={row.notes}
                      onChange={e => updateRow(row.id, 'notes', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Plan Balance Check */}
          <div className={`spm-balance-check ${planBalanceOk ? 'spm-balance-check--ok' : 'spm-balance-check--err'}`}>
            {planBalanceOk
              ? `✓ Plan accounts for all PKR ${balanceDue.toLocaleString()} remaining`
              : `⚠ Total planned: PKR ${totalPlanned.toLocaleString()} — needs to equal PKR ${balanceDue.toLocaleString()} (difference: ${(balanceDue - totalPlanned).toFixed(0)})`
            }
          </div>

          {error && <div className="pos-alert pos-alert--error" style={{ margin: '0.5rem 0' }}>{error}</div>}

          {/* Notification reminder notice */}
          <div className="spm-reminder-notice">
            🔔 Automatic reminders will appear in the Admin Notifications Inbox 1 day before each due date and cheque clearing date.
          </div>

          {/* Footer */}
          <div className="spm-footer">
            <button
              type="button"
              className="pos-print-btn"
              onClick={onSkip}
              title="Skip and record as open credit without a payment plan"
            >
              Skip — Record as Open Credit
            </button>
            <button
              type="submit"
              className="pos-checkout-btn"
              disabled={!planBalanceOk}
            >
              ✓ Confirm Settlement Plan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
