import { useState, type FormEvent } from 'react';
import type { CustomerPaymentPlan, ReceivePaymentPayload } from '../lib/posService';
import './ReceivePaymentModal.css';

interface ReceivePaymentModalProps {
  customerName: string;
  customerShop?: string | null;
  balance: number;
  plans: CustomerPaymentPlan[];
  onClose: () => void;
  onSave: (payload: ReceivePaymentPayload) => Promise<void>;
}

export function ReceivePaymentModal({
  customerName,
  customerShop,
  balance,
  plans,
  onClose,
  onSave,
}: ReceivePaymentModalProps) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<CustomerPaymentPlan['payment_method']>('cash');
  const [referenceNo, setReferenceNo] = useState('');
  const [clearingDate, setClearingDate] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const [isChequeCleared, setIsChequeCleared] = useState(true);
  const [notes, setNotes] = useState('');
  const [showPastHistory, setShowPastHistory] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const pendingPlans = plans.filter(p => p.status !== 'received');
  const receivedPlans = plans.filter(p => p.status === 'received');
  const totalPlannedDue = plans.reduce((sum, p) => sum + Number(p.amount_due || 0), 0);
  const totalPlannedPaid = plans.reduce((sum, p) => sum + Number(p.amount_paid || 0), 0);

  function handleSelectPlan(plan: CustomerPaymentPlan) {
    const planId = plan.id || '';
    const isSelected = selectedPlanIds.includes(planId);

    if (isSelected) {
      setSelectedPlanIds(ids => ids.filter(id => id !== planId));
    } else {
      setSelectedPlanIds([planId]);
      const remainingDue = Math.max(0, Number(plan.amount_due) - Number(plan.amount_paid));
      setAmount(remainingDue > 0 ? String(remainingDue) : '');
      setMethod(plan.payment_method || 'cash');
      if (plan.cheque_no) setReferenceNo(plan.cheque_no);
      if (plan.cheque_clearing_date) setClearingDate(plan.cheque_clearing_date);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      setError('Please enter a valid payment amount greater than zero.');
      return;
    }

    if (isChequeCleared && numericAmount > balance && balance > 0) {
      setError(`Amount cannot exceed the current balance due of PKR ${balance.toLocaleString()}.`);
      return;
    }

    if (method === 'cheque' && !clearingDate) {
      setError('Please specify the cheque clearing date.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSave({
        customer_id: '',
        amount: numericAmount,
        payment_method: method,
        reference_no: referenceNo || undefined,
        payment_date: paymentDate,
        cheque_clearing_date: clearingDate || undefined,
        plan_ids: selectedPlanIds,
        notes: notes || undefined,
        is_cleared: method === 'cheque' ? isChequeCleared : true,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Payment could not be recorded.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="receive-payment-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="receive-payment-modal" onSubmit={submit}>
        <header className="receive-payment-header">
          <div className="receive-payment-icon">₨</div>
          <div className="receive-payment-header-text">
            <p className="receive-payment-eyebrow">CUSTOMER FINANCIAL LEDGER</p>
            <h2>Receive Installment / Balance Payment</h2>
            <p className="receive-payment-customer">
              {customerName} {customerShop ? `· ${customerShop}` : ''}
            </p>
          </div>
          <button type="button" className="receive-payment-close" onClick={onClose} aria-label="Close payment dialog">
            ✕
          </button>
        </header>

        {/* Financial Overview Cards */}
        <div className="receive-payment-stats">
          <div className="receive-payment-stat-card">
            <span>Current Outstanding Balance</span>
            <strong>PKR {balance.toLocaleString()}</strong>
          </div>
          <div className="receive-payment-stat-card">
            <span>Installments Received</span>
            <strong className="stat-green">PKR {totalPlannedPaid.toLocaleString()}</strong>
          </div>
          <div className="receive-payment-stat-card">
            <span>Installments Remaining</span>
            <strong className="stat-amber">PKR {Math.max(0, totalPlannedDue - totalPlannedPaid).toLocaleString()}</strong>
          </div>
        </div>

        <div className="receive-payment-form">
          {/* Amount Field with Quick Pre-fills */}
          <div className="receive-payment-field receive-payment-field--amount">
            <label htmlFor="input-receive-amount">
              <span>Amount Received (PKR) *</span>
              {balance > 0 && (
                <button
                  type="button"
                  className="receive-payment-fill-btn"
                  onClick={() => setAmount(String(balance))}
                >
                  Pay Full Balance (₨{balance.toLocaleString()})
                </button>
              )}
            </label>
            <div className="receive-payment-amount-box">
              <span className="currency-prefix">PKR</span>
              <input
                id="input-receive-amount"
                autoFocus
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                required
              />
            </div>
          </div>

          {/* Payment Method Selector */}
          <div className="receive-payment-methods">
            <span className="receive-payment-label">Payment Method *</span>
            <div className="receive-payment-method-grid">
              {([
                ['cash', 'Cash Counter', '₨'],
                ['bank_transfer', 'Bank Transfer', '↗'],
                ['jazzcash', 'JazzCash', 'J'],
                ['easypaisa', 'EasyPaisa', 'E'],
                ['cheque', 'Bank Cheque', '▣'],
              ] as const).map(([val, label, icon]) => (
                <button
                  type="button"
                  key={val}
                  className={`receive-payment-method ${method === val ? 'receive-payment-method--active' : ''}`}
                  onClick={() => setMethod(val)}
                >
                  <b>{icon}</b>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Cheque Specific Clearance Status (Prompt 3.5 Requirement) */}
          {method === 'cheque' && (
            <div className="receive-payment-cheque-box">
              <span className="receive-payment-label">⚠️ Cheque Clearance Status Confirmation</span>
              <div className="receive-payment-cheque-options">
                <label className={`receive-payment-cheque-opt ${isChequeCleared ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="cheque_clearance_status"
                    checked={isChequeCleared}
                    onChange={() => setIsChequeCleared(true)}
                  />
                  <div>
                    <strong>✓ Cheque Already Cleared (Funds Settled in Bank)</strong>
                    <small>Immediately reduces customer balance due and marks installment as received.</small>
                  </div>
                </label>

                <label className={`receive-payment-cheque-opt ${!isChequeCleared ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="cheque_clearance_status"
                    checked={!isChequeCleared}
                    onChange={() => setIsChequeCleared(false)}
                  />
                  <div>
                    <strong>⏳ Cheque Deposited / Post-Dated (Pending Clearance)</strong>
                    <small>Records cheque at counter. Customer balance remains pending until clearance is confirmed.</small>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Dates & Reference */}
          <div className="receive-payment-grid">
            <div className="receive-payment-field">
              <label>Payment / Collection Date</label>
              <input
                type="date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
              />
            </div>

            {method === 'cheque' && (
              <div className="receive-payment-field">
                <label>Cheque Clearing / Maturity Date *</label>
                <input
                  type="date"
                  value={clearingDate}
                  onChange={e => setClearingDate(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="receive-payment-field">
              <label>Reference / Cheque # <em>(Optional)</em></label>
              <input
                value={referenceNo}
                onChange={e => setReferenceNo(e.target.value)}
                placeholder={method === 'cheque' ? 'e.g. Cheque # 492019' : 'e.g. Bank slip or TxID'}
              />
            </div>

            <div className="receive-payment-field">
              <label>Notes / Memo <em>(Optional)</em></label>
              <input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. March wholesale installment"
              />
            </div>
          </div>

          {/* Planned Installments Schedule Selector */}
          <fieldset className="receive-payment-plans">
            <legend>
              Apply to Specific Planned Installment <small>(Optional — tap to auto-select)</small>
            </legend>
            {pendingPlans.length === 0 ? (
              <p className="receive-payment-empty">
                No planned installments scheduled. Payment will be credited directly to the customer's general balance.
              </p>
            ) : (
              <div className="receive-payment-plan-list">
                {pendingPlans.map(plan => {
                  const planId = plan.id || '';
                  const isSelected = selectedPlanIds.includes(planId);
                  const remDue = Number(plan.amount_due) - Number(plan.amount_paid);

                  return (
                    <div
                      key={planId}
                      className={`receive-payment-plan-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectPlan(plan)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}} // handled by parent div
                      />
                      <div className="receive-payment-plan-info">
                        <strong>Installment #{plan.installment_no} of {plan.total_installments}</strong>
                        <small>Due: {plan.due_date} · Method: {plan.payment_method.toUpperCase()}</small>
                        {plan.cheque_no && <small className="plan-cheque-tag">Cheque #{plan.cheque_no}</small>}
                      </div>
                      <div className="receive-payment-plan-due">
                        <span>Due Remaining:</span>
                        <strong>PKR {remDue.toLocaleString()}</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </fieldset>

          {/* Past Collected Installments Accordion */}
          {receivedPlans.length > 0 && (
            <div className="receive-payment-history-toggle-wrap">
              <button
                type="button"
                className="receive-payment-history-toggle"
                onClick={() => setShowPastHistory(v => !v)}
              >
                <span>📜 View Past Collected Installments ({receivedPlans.length})</span>
                <span>{showPastHistory ? '▲ Hide' : '▼ View'}</span>
              </button>

              {showPastHistory && (
                <div className="receive-payment-history-table">
                  {receivedPlans.map(rp => (
                    <div className="receive-payment-history-row" key={rp.id}>
                      <div>
                        <strong>Installment #{rp.installment_no}</strong>
                        <small>{rp.received_at ? new Date(rp.received_at).toLocaleDateString('en-PK') : rp.due_date} · {rp.payment_method}</small>
                      </div>
                      <div className="history-right">
                        <span className="badge-collected">✓ Received</span>
                        <strong>PKR {Number(rp.amount_paid).toLocaleString()}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <div className="receive-payment-error">{error}</div>}
        </div>

        <footer className="receive-payment-footer">
          <button type="button" className="receive-payment-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="receive-payment-submit" disabled={saving || !amount || Number(amount) <= 0} type="submit">
            {saving ? 'Recording Payment…' : '✓ Record Payment & Save Receipt'}
          </button>
        </footer>
      </form>
    </div>
  );
}
