import { useState, useEffect } from 'react';
import {
  type PosReceipt,
  type PosReceiptCorrection,
  type PosCustomer,
  type PosProductItem,
  fetchReceiptCorrections,
} from '../lib/posService';
import type { OfflineSalePayload, OfflineSaleItem } from '../lib/offlineQueue';
import './ReceiptHistory.css';

interface ReceiptHistoryProps {
  receipts: PosReceipt[];
  isModal?: boolean;
  userRole?: string;
  customers?: PosCustomer[];
  catalogProducts?: PosProductItem[];
  onCloseModal?: () => void;
  onView: (receipt: PosReceipt) => void;
  onShare: (receipt: PosReceipt) => void;
  onEdit: (receipt: PosReceipt, snapshot: OfflineSalePayload, reason: string) => Promise<void>;
  onFilterChange?: (filters: { searchQuery: string; type: 'all' | 'sale' | 'payment'; dateFilter: string }) => void;
}

export function ReceiptHistory({
  receipts,
  isModal = false,
  userRole = 'shop_staff',
  customers = [],
  catalogProducts = [],
  onCloseModal,
  onView,
  onShare,
  onEdit,
  onFilterChange,
}: ReceiptHistoryProps) {
  const isOwner = userRole === 'owner';

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'sale' | 'payment'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  // Edit Modal State
  const [editing, setEditing] = useState<PosReceipt | null>(null);
  const [draft, setDraft] = useState<OfflineSalePayload | null>(null);
  const [editReason, setEditReason] = useState('');
  const [selectedAddProductId, setSelectedAddProductId] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Audit View State
  const [viewingAuditReceiptId, setViewingAuditReceiptId] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<PosReceiptCorrection[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  useEffect(() => {
    if (onFilterChange) {
      onFilterChange({ searchQuery: search, type: typeFilter, dateFilter });
    }
  }, [search, typeFilter, dateFilter]);

  async function handleToggleAudit(receiptId: string) {
    if (viewingAuditReceiptId === receiptId) {
      setViewingAuditReceiptId(null);
      setAuditLogs([]);
      return;
    }
    setViewingAuditReceiptId(receiptId);
    setLoadingAudit(true);
    try {
      const logs = await fetchReceiptCorrections(receiptId);
      setAuditLogs(logs);
    } catch (err) {
      console.warn('Failed to load audit logs:', err);
    } finally {
      setLoadingAudit(false);
    }
  }

  function openEdit(receipt: PosReceipt) {
    setEditing(receipt);
    setDraft(JSON.parse(JSON.stringify(receipt.snapshot)) as OfflineSalePayload);
    setEditReason('');
    setEditError('');
    setSelectedAddProductId('');
  }

  function handleAddItemToDraft(productId: string) {
    if (!draft || !productId) return;
    const prod = catalogProducts.find(p => p.id === productId);
    if (!prod) return;

    const newItem: OfflineSaleItem = {
      product_id: prod.id,
      product_name: prod.name,
      suit_type: prod.suit_type,
      quantity: 1,
      unit_price: prod.default_price,
      base_price: prod.default_price,
      discount_percent: 0,
      total_price: prod.default_price,
    };

    const newItems = [...draft.items, newItem];
    const newTotal = newItems.reduce((sum, item) => sum + item.total_price, 0);
    setDraft({
      ...draft,
      items: newItems,
      total_amount: newTotal,
    });
    setSelectedAddProductId('');
  }

  function handleRemoveItem(index: number) {
    if (!draft) return;
    if (draft.items.length <= 1) {
      setEditError('A receipt must have at least one line item.');
      return;
    }
    const newItems = draft.items.filter((_, i) => i !== index);
    const newTotal = newItems.reduce((sum, item) => sum + item.total_price, 0);
    setDraft({
      ...draft,
      items: newItems,
      total_amount: newTotal,
    });
    setEditError('');
  }

  function handleCustomerChange(customerId: string) {
    if (!draft) return;
    const cust = customers.find(c => c.id === customerId);
    if (!cust) return;
    setDraft({
      ...draft,
      customer_id: cust.id,
      customer_name: cust.name,
      customer_phone: cust.phone || undefined,
      shop_name: cust.shop_name || cust.company_name || undefined,
      customer_address: cust.address || undefined,
    });
  }

  async function saveEdit() {
    if (!editing || !draft) return;
    if (!editReason.trim()) {
      setEditError('Please enter a reason for this correction (required for financial audit).');
      return;
    }
    if (draft.total_amount <= 0) {
      setEditError('Grand total must be greater than zero.');
      return;
    }
    setSaving(true);
    setEditError('');
    try {
      await onEdit(editing, draft, editReason.trim());
      setEditing(null);
      setDraft(null);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Correction failed to save.');
    } finally {
      setSaving(false);
    }
  }

  // Client-side filtering when used in embedded drawer or standalone list
  const filteredReceipts = receipts.filter(r => {
    if (typeFilter !== 'all' && r.receipt_type !== typeFilter) return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchInv = r.invoice_no.toLowerCase().includes(q);
      const matchName = (r.customer_name || r.snapshot.customer_name || '').toLowerCase().includes(q);
      const matchPhone = (r.snapshot.customer_phone || '').includes(q);
      if (!matchInv && !matchName && !matchPhone) return false;
    }

    if (dateFilter !== 'all') {
      const rDate = new Date(r.created_at);
      const now = new Date();
      if (dateFilter === 'today') {
        if (rDate.toDateString() !== now.toDateString()) return false;
      } else if (dateFilter === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (rDate < weekAgo) return false;
      } else if (dateFilter === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (rDate < monthAgo) return false;
      }
    }
    return true;
  });

  const content = (
    <div className={`receipt-history ${isModal ? 'receipt-history--modal' : ''}`}>
      <div className="receipt-history__header">
        <div>
          <strong>{isModal ? '📜 Store Receipt History' : 'Receipt History'}</strong>
          <span className="receipt-history__count">
            {filteredReceipts.length} receipt{filteredReceipts.length === 1 ? '' : 's'}
          </span>
        </div>
        {isModal && onCloseModal && (
          <button type="button" className="receipt-history__close-btn" onClick={onCloseModal} aria-label="Close modal">
            ✕
          </button>
        )}
      </div>

      {/* Search & Filter Bar */}
      <div className="receipt-history__filters">
        <input
          type="search"
          className="receipt-history__search-input"
          placeholder="Search by invoice #, customer name, or phone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="receipt-history__filter-row">
          <div className="receipt-history__pill-group">
            <button
              type="button"
              className={`receipt-history__pill ${typeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setTypeFilter('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`receipt-history__pill ${typeFilter === 'sale' ? 'active' : ''}`}
              onClick={() => setTypeFilter('sale')}
            >
              🧾 Sales
            </button>
            <button
              type="button"
              className={`receipt-history__pill ${typeFilter === 'payment' ? 'active' : ''}`}
              onClick={() => setTypeFilter('payment')}
            >
              ₨ Payments
            </button>
          </div>

          <div className="receipt-history__pill-group">
            <button
              type="button"
              className={`receipt-history__pill ${dateFilter === 'all' ? 'active' : ''}`}
              onClick={() => setDateFilter('all')}
            >
              All Time
            </button>
            <button
              type="button"
              className={`receipt-history__pill ${dateFilter === 'today' ? 'active' : ''}`}
              onClick={() => setDateFilter('today')}
            >
              Today
            </button>
            <button
              type="button"
              className={`receipt-history__pill ${dateFilter === 'week' ? 'active' : ''}`}
              onClick={() => setDateFilter('week')}
            >
              7 Days
            </button>
          </div>
        </div>
      </div>

      {filteredReceipts.length === 0 ? (
        <div className="receipt-history__empty">
          {search ? 'No matching receipts found for your search.' : 'No saved receipts yet.'}
        </div>
      ) : (
        <div className="receipt-history__list">
          {filteredReceipts.map(receipt => {
            const isPayment = receipt.receipt_type === 'payment';
            const isCorrected = receipt.version > 1 || !!receipt.edited_at;
            const showingAudit = viewingAuditReceiptId === receipt.id;

            return (
              <div className={`receipt-history__row ${isPayment ? 'receipt-history__row--payment' : ''}`} key={receipt.id}>
                <div className="receipt-history__main">
                  <div className="receipt-history__thumb">{isPayment ? '₨' : '🧾'}</div>
                  <div className="receipt-history__meta">
                    <div className="receipt-history__title-line">
                      <strong className="receipt-history__invoice">#{receipt.invoice_no}</strong>
                      <span className={`receipt-history__badge ${isPayment ? 'badge-pay' : 'badge-sale'}`}>
                        {isPayment ? 'Payment' : 'Sale'}
                      </span>
                      {isCorrected && (
                        <span className="receipt-history__badge badge-edited">
                          v{receipt.version} · Corrected
                        </span>
                      )}
                    </div>
                    <div className="receipt-history__customer-name">
                      👤 {receipt.customer_name || receipt.snapshot.customer_name || 'Customer'}
                      {receipt.snapshot.customer_phone && <small> ({receipt.snapshot.customer_phone})</small>}
                    </div>
                    <div className="receipt-history__date">
                      {new Date(receipt.created_at).toLocaleDateString('en-PK', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>

                  <div className="receipt-history__amounts">
                    <div className="receipt-history__amount-total">
                      PKR {Number(receipt.snapshot.total_amount || 0).toLocaleString()}
                    </div>
                    {!isPayment && (
                      <small className="receipt-history__amount-sub">
                        Paid: PKR {Number(receipt.snapshot.amount_paid || 0).toLocaleString()} · Due: PKR {Math.max(0, Number(receipt.snapshot.total_amount || 0) - Number(receipt.snapshot.amount_paid || 0)).toLocaleString()}
                      </small>
                    )}
                  </div>

                  <div className="receipt-history__actions">
                    <button
                      type="button"
                      className="receipt-btn receipt-btn--view"
                      onClick={() => onView(receipt)}
                      title="View invoice preview"
                    >
                      👁️ View
                    </button>
                    <button
                      type="button"
                      className="receipt-btn receipt-btn--share"
                      onClick={() => onShare(receipt)}
                      title="Share receipt via WhatsApp / PDF"
                    >
                      📤 Share
                    </button>
                    {!isPayment && (
                      <button
                        type="button"
                        className={`receipt-btn receipt-btn--edit ${!isOwner ? 'receipt-btn--disabled' : ''}`}
                        onClick={() => {
                          if (isOwner) {
                            openEdit(receipt);
                          } else {
                            alert('Receipt editing is restricted to the Shop Owner to preserve audit and ledger integrity.');
                          }
                        }}
                        title={isOwner ? 'Edit finalized receipt with audit tracking' : 'Owner permission required to edit receipts'}
                      >
                        {isOwner ? '✏️ Edit' : '🔒 Edit'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Correction Tag & Audit Accordion */}
                {isCorrected && (
                  <div className="receipt-history__audit-bar">
                    <button
                      type="button"
                      className="receipt-history__audit-toggle"
                      onClick={() => handleToggleAudit(receipt.id)}
                    >
                      {showingAudit ? '▲ Hide Audit History' : `🔍 View Audit Trail (v${receipt.version})`}
                    </button>
                    {showingAudit && (
                      <div className="receipt-history__audit-details">
                        {loadingAudit ? (
                          <div className="receipt-history__audit-loading">Loading audit records…</div>
                        ) : auditLogs.length === 0 ? (
                          <div className="receipt-history__audit-empty">No detailed audit records found.</div>
                        ) : (
                          auditLogs.map(log => (
                            <div className="receipt-history__audit-item" key={log.id}>
                              <div className="receipt-history__audit-header">
                                <strong>Modified by {log.changed_by_name || 'Owner'}</strong>
                                <span>{new Date(log.changed_at).toLocaleString('en-PK')}</span>
                              </div>
                              {log.reason && <p className="receipt-history__audit-reason">Reason: "{log.reason}"</p>}
                              <div className="receipt-history__audit-diff">
                                <div>
                                  <span className="diff-label">Before:</span> PKR {Number(log.before_snapshot.total_amount).toLocaleString()} ({log.before_snapshot.items.length} items)
                                </div>
                                <div>
                                  <span className="diff-label">After:</span> PKR {Number(log.after_snapshot.total_amount).toLocaleString()} ({log.after_snapshot.items.length} items)
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Modal (Owner Only) */}
      {editing && draft && (
        <div className="receipt-edit-backdrop">
          <div className="receipt-edit-modal">
            <div className="receipt-edit-header">
              <div>
                <h3>Correct Finalized Sale #{editing.invoice_no}</h3>
                <p className="receipt-edit-sub">
                  Tracked correction for financial auditability. Customer dues and price history will recalculate automatically.
                </p>
              </div>
              <button type="button" className="receipt-edit-close" onClick={() => setEditing(null)}>
                ✕
              </button>
            </div>

            {editError && <div className="receipt-edit-error">{editError}</div>}

            <div className="receipt-edit-body">
              {/* Customer Reassignment */}
              {customers.length > 0 && (
                <div className="receipt-edit-field">
                  <label>Assign to Customer Account</label>
                  <select
                    value={draft.customer_id}
                    onChange={e => handleCustomerChange(e.target.value)}
                    className="receipt-edit-select"
                  >
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.company_name ? `(${c.company_name})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="receipt-edit-grid-2">
                <div className="receipt-edit-field">
                  <label>Customer Name</label>
                  <input
                    value={draft.customer_name}
                    onChange={e => setDraft({ ...draft, customer_name: e.target.value })}
                  />
                </div>
                <div className="receipt-edit-field">
                  <label>Customer Phone</label>
                  <input
                    value={draft.customer_phone || ''}
                    onChange={e => setDraft({ ...draft, customer_phone: e.target.value })}
                  />
                </div>
              </div>

              {/* Line Items Table */}
              <div className="receipt-edit-items-section">
                <div className="receipt-edit-items-header">
                  <strong>Line Items ({draft.items.length})</strong>
                </div>

                <div className="receipt-edit-items-table">
                  {draft.items.map((item, index) => {
                    const lineTotal = item.quantity * item.unit_price;
                    return (
                      <div className="receipt-edit-row" key={`${item.product_id || item.product_name}-${index}`}>
                        <div className="receipt-edit-item-info">
                          <strong>{item.product_name}</strong>
                          <span className="receipt-edit-item-sub">{item.suit_type}</span>
                        </div>

                        <div className="receipt-edit-item-controls">
                          <label className="receipt-edit-ctrl">
                            <span>Qty</span>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={e => {
                                const items = [...draft.items];
                                const quantity = Math.max(1, parseInt(e.target.value, 10) || 1);
                                items[index] = {
                                  ...items[index],
                                  quantity,
                                  total_price: quantity * items[index].unit_price,
                                };
                                setDraft({
                                  ...draft,
                                  items,
                                  total_amount: items.reduce((sum, row) => sum + row.total_price, 0),
                                });
                              }}
                            />
                          </label>

                          <label className="receipt-edit-ctrl">
                            <span>Rate (PKR)</span>
                            <input
                              type="number"
                              min="0"
                              step="50"
                              value={item.unit_price}
                              onChange={e => {
                                const items = [...draft.items];
                                const unit_price = Math.max(0, parseFloat(e.target.value) || 0);
                                const base = items[index].base_price || unit_price;
                                const discount_percent = base > 0 ? Number((((base - unit_price) / base) * 100).toFixed(1)) : 0;
                                items[index] = {
                                  ...items[index],
                                  unit_price,
                                  discount_percent,
                                  total_price: unit_price * items[index].quantity,
                                };
                                setDraft({
                                  ...draft,
                                  items,
                                  total_amount: items.reduce((sum, row) => sum + row.total_price, 0),
                                });
                              }}
                            />
                          </label>

                          <div className="receipt-edit-subtotal">
                            PKR {lineTotal.toLocaleString()}
                          </div>

                          <button
                            type="button"
                            className="receipt-edit-remove-btn"
                            onClick={() => handleRemoveItem(index)}
                            title="Remove item"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add Item Row */}
                {catalogProducts.length > 0 && (
                  <div className="receipt-edit-add-bar">
                    <select
                      value={selectedAddProductId}
                      onChange={e => setSelectedAddProductId(e.target.value)}
                      className="receipt-edit-select"
                    >
                      <option value="">— Add Product from Catalog —</option>
                      {catalogProducts.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} (PKR {p.default_price.toLocaleString()})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="receipt-edit-add-btn"
                      disabled={!selectedAddProductId}
                      onClick={() => handleAddItemToDraft(selectedAddProductId)}
                    >
                      + Add Item
                    </button>
                  </div>
                )}
              </div>

              {/* Total & Audit Reason */}
              <div className="receipt-edit-summary-box">
                <div className="receipt-edit-total-row">
                  <span>Recalculated Grand Total:</span>
                  <strong>PKR {draft.total_amount.toLocaleString()}</strong>
                </div>
              </div>

              <div className="receipt-edit-field">
                <label>
                  Audit Reason for Correction * <small>(Required: why is this receipt being changed?)</small>
                </label>
                <textarea
                  rows={2}
                  className="receipt-edit-textarea"
                  placeholder="e.g. Corrected miscounted quantity; updated customer negotiated rate."
                  value={editReason}
                  onChange={e => setEditReason(e.target.value)}
                />
              </div>
            </div>

            <div className="receipt-edit-footer">
              <button
                type="button"
                className="receipt-edit-cancel-btn"
                onClick={() => setEditing(null)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="receipt-edit-save-btn"
                disabled={saving || draft.total_amount <= 0 || !editReason.trim()}
                onClick={saveEdit}
              >
                {saving ? 'Recording Correction…' : '✓ Save Tracked Correction'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (isModal) {
    return (
      <div className="receipt-history-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && onCloseModal) onCloseModal(); }}>
        {content}
      </div>
    );
  }

  return content;
}
