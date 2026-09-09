import { useState, useEffect, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  fetchPosCustomers, createPosCustomer, processPosCheckout, syncOfflineSalesQueue,
  fetchPosProducts, fetchCustomerPurchaseHistory,
  type PosCustomer, type PosProductItem, type CustomerPriceHistoryRecord,
  type CustomerPaymentPlan,
} from '../lib/posService';
import { titleCase } from '../lib/posService';
import { getPendingQueue, type OfflineSalePayload } from '../lib/offlineQueue';
import { InvoicePrintModal } from './InvoicePrintModal';
import { PosProductCatalogModal } from './PosProductCatalogModal';
import { SettlementPlanModal } from './SettlementPlanModal';
import type { TenantBranding } from '../lib/auth';
import './PosCounter.css';

export interface CartItem {
  product: PosProductItem;
  quantity: number;
  unit_price: number;
  base_price: number;
  discount_percent: number;
  total_price: number;
}

interface PosCounterProps {
  user: User;
  branding?: TenantBranding | null;
  onSignOut: () => void;
}

export function PosCounter({ user, branding, onSignOut }: PosCounterProps) {
  const shopName = branding?.display_name || branding?.name || 'Wholesale POS';

  useEffect(() => {
    document.title = `${shopName} · POS Counter`;
  }, [shopName]);
  const [customers, setCustomers] = useState<PosCustomer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<PosProductItem[]>([]);
  const [customerHistory, setCustomerHistory] = useState<CustomerPriceHistoryRecord[]>([]);

  // Payment state
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'cheque' | 'bank_transfer' | 'jazzcash' | 'easypaisa'>('cash');
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [referenceNo, setReferenceNo] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // 🆕 Sale Date state (default today)
  const [saleDate, setSaleDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  // Status & Offline state
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Search & Print & Modal & History Drawer state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [lastSale, setLastSale] = useState<OfflineSalePayload | null>(null);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [showAddCustModal, setShowAddCustModal] = useState<boolean>(false);
  const [showCatalogModal, setShowCatalogModal] = useState<boolean>(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState<boolean>(true);

  // Settlement Plan state (Part 2)
  const [showSettlementModal, setShowSettlementModal] = useState<boolean>(false);
  const [pendingCheckoutPayload, setPendingCheckoutPayload] = useState<OfflineSalePayload | null>(null);

  // Mobile Navigation & View State
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [activeMobileTab, setActiveMobileTab] = useState<'catalog' | 'cart'>('catalog');

  // Rate Change Nudge state
  const [rateNudge, setRateNudge] = useState<{
    product: PosProductItem;
    currentBasePrice: number;
    lastPaidPrice: number;
  } | null>(null);

  useEffect(() => {
    loadInitialData();

    const handleOnline = () => { setIsOnline(true); triggerAutoSync(); };
    const handleOffline = () => { setIsOnline(false); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (selectedCustomerId) {
      loadCustomerHistory(selectedCustomerId);
    } else {
      setCustomerHistory([]);
    }
  }, [selectedCustomerId]);

  async function loadInitialData() {
    setLoading(true);
    try {
      const [custs, prods] = await Promise.all([
        fetchPosCustomers(),
        fetchPosProducts(),
      ]);
      setCustomers(custs);
      setCatalogProducts(prods);
      if (custs.length > 0 && !selectedCustomerId) {
        setSelectedCustomerId(custs[0].id);
      }
      await updatePendingCount();
    } catch (err: any) {
      console.warn('POS initial load warning:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshCatalog() {
    try {
      const updatedProds = await fetchPosProducts();
      setCatalogProducts(updatedProds);
    } catch (err) {
      console.warn('Refresh catalog error:', err);
    }
  }

  async function loadCustomerHistory(custId: string) {
    try {
      const hist = await fetchCustomerPurchaseHistory(custId);
      setCustomerHistory(hist);
    } catch (err) {
      console.warn('Customer history load warning:', err);
    }
  }

  async function updatePendingCount() {
    try {
      const pending = await getPendingQueue();
      setPendingSyncCount(pending.length);
    } catch (err) {
      console.warn('Queue count fetch error:', err);
    }
  }

  async function triggerAutoSync() {
    if (!navigator.onLine || syncing) return;
    setSyncing(true);
    try {
      const res = await syncOfflineSalesQueue();
      if (res.syncedCount > 0) {
        setMessage({ type: 'success', text: `✓ Auto-synced ${res.syncedCount} queued order(s) to database!` });
      }
      if (res.errors.length > 0) {
        setMessage({ type: 'error', text: `Sync Warning: ${res.errors.join('; ')}` });
      }
      await updatePendingCount();
    } catch (err: any) {
      console.warn('Sync error:', err.message);
    } finally {
      setSyncing(false);
    }
  }

  /* ─── Cart & Bargaining Logic ─────────────────────────────────────────── */

  function handleProductClick(product: PosProductItem) {
    const basePrice = product.default_price;

    // Look up customer's previous purchase of this product
    if (selectedCustomerId && customerHistory.length > 0) {
      const pastRecord = customerHistory.find(r => r.product_id === product.id || r.product_name.toLowerCase() === product.name.toLowerCase());
      if (pastRecord) {
        const lastPaid = pastRecord.price_charged;
        // Trigger Rate-change nudge IF current base price has increased since customer's last purchase
        if (basePrice > lastPaid) {
          setRateNudge({
            product,
            currentBasePrice: basePrice,
            lastPaidPrice: lastPaid,
          });
          return;
        } else {
          // If base price hasn't increased, use their last rate as baseline
          confirmAddToCart(product, lastPaid);
          return;
        }
      }
    }

    // Default: Add at base price
    confirmAddToCart(product, basePrice);
  }

  function confirmAddToCart(product: PosProductItem, chosenUnitPrice: number) {
    const basePrice = product.default_price;
    const discPct = basePrice > 0
      ? Number((((basePrice - chosenUnitPrice) / basePrice) * 100).toFixed(1))
      : 0;

    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        const newQty = existing.quantity + 1;
        return prev.map(item =>
          item.product.id === product.id
            ? {
              ...item,
              quantity: newQty,
              unit_price: chosenUnitPrice,
              base_price: basePrice,
              discount_percent: discPct,
              total_price: newQty * chosenUnitPrice,
            }
            : item
        );
      }

      return [
        ...prev,
        {
          product,
          quantity: 1,
          unit_price: chosenUnitPrice,
          base_price: basePrice,
          discount_percent: discPct,
          total_price: chosenUnitPrice,
        },
      ];
    });

    setRateNudge(null);
  }

  function updateCartQty(productId: string, qty: number) {
    if (qty <= 0) {
      setCart(prev => prev.filter(item => item.product.id !== productId));
      return;
    }
    setCart(prev => prev.map(item =>
      item.product.id === productId
        ? { ...item, quantity: qty, total_price: qty * item.unit_price }
        : item
    ));
  }

  // Live calculation of discount % as staff manually overrides unit price
  function updateCartPrice(productId: string, customPrice: number) {
    setCart(prev => prev.map(item => {
      if (item.product.id !== productId) return item;
      const base = item.base_price || item.product.default_price;
      const discPct = base > 0
        ? Number((((base - customPrice) / base) * 100).toFixed(1))
        : 0;

      return {
        ...item,
        unit_price: customPrice,
        discount_percent: discPct,
        total_price: item.quantity * customPrice,
      };
    }));
  }

  function removeFromCart(productId: string) {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  }

  const grandTotal = cart.reduce((sum, item) => sum + item.total_price, 0);
  const numericPaid = parseFloat(amountPaid) || grandTotal;
  const remainingDue = grandTotal - numericPaid;

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  async function handleCheckoutSubmit(e: FormEvent) {
    e.preventDefault();
    if (cart.length === 0) {
      setMessage({ type: 'error', text: 'Cart is empty. Select items from catalog to checkout.' });
      return;
    }
    if (!selectedCustomerId) {
      setMessage({ type: 'error', text: 'Please select a customer for wholesale checkout.' });
      return;
    }

    const clientUuid = `pos-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const generatedInv = isOnline
      ? `INV-POS-${Math.floor(10000 + Math.random() * 90000)}`
      : `OFFLINE-${Math.floor(1000 + Math.random() * 9000)}`;

    const salePayload: OfflineSalePayload = {
      id: clientUuid,
      customer_id: selectedCustomerId,
      customer_name: titleCase(selectedCustomer?.name || 'Wholesale Customer'),
      customer_phone: selectedCustomer?.phone || undefined,
      invoice_no: generatedInv,
      total_amount: grandTotal,
      amount_paid: numericPaid,
      payment_method: paymentMethod,
      reference_no: referenceNo || undefined,
      due_date: dueDate || undefined,
      notes: notes || undefined,
      sale_date: saleDate, // 🆕 Sale Date added here
      shop_name: titleCase(selectedCustomer?.shop_name || selectedCustomer?.company_name || '') || undefined,
      customer_address: titleCase(selectedCustomer?.address || '') || undefined,
      items: cart.map(i => ({
        product_id: i.product.id,
        product_name: i.product.name,
        suit_type: i.product.suit_type,
        quantity: i.quantity,
        unit_price: i.unit_price,
        base_price: i.base_price,
        discount_percent: i.discount_percent,
        total_price: i.total_price,
      })),
      created_at: new Date().toISOString(),
      synced: isOnline,
    };

    // Part 2: If there is a remaining balance due, intercept and show Settlement Plan Modal
    const remaining = grandTotal - numericPaid;
    if (remaining > 0 && grandTotal > 0) {
      setPendingCheckoutPayload(salePayload);
      setShowSettlementModal(true);
      return;
    }

    // No balance due: proceed directly to checkout
    await finalizeCheckout(salePayload, []);
  }

  async function handleSettlementConfirmed(plans: CustomerPaymentPlan[]) {
    setShowSettlementModal(false);
    if (!pendingCheckoutPayload) return;
    await finalizeCheckout(pendingCheckoutPayload, plans);
    setPendingCheckoutPayload(null);
  }

  function handleSettlementSkip() {
    setShowSettlementModal(false);
    if (!pendingCheckoutPayload) return;
    // Record as open credit with no settlement plan
    finalizeCheckout(pendingCheckoutPayload, []);
    setPendingCheckoutPayload(null);
  }

  async function finalizeCheckout(salePayload: OfflineSalePayload, plans: CustomerPaymentPlan[]) {
    setLoading(true);
    try {
      const res = await processPosCheckout(salePayload, plans);
      if (res.success) {
        setMessage({ type: 'success', text: res.message });
        setLastSale({
          ...salePayload,
          installment_plans: plans.length > 0 ? plans.map(plan => ({
            installment_no: plan.installment_no,
            total_installments: plan.total_installments,
            amount_due: plan.amount_due,
            due_date: plan.due_date,
            payment_method: plan.payment_method,
            status: plan.status,
            notes: plan.notes,
          })) : undefined,
        });
        setShowPrintModal(true);
        setCart([]);
        setAmountPaid('');
        setReferenceNo('');
        setDueDate('');
        setNotes('');
        // Reset sale date to today after checkout
        const today = new Date();
        setSaleDate(today.toISOString().split('T')[0]);
        await updatePendingCount();
        if (selectedCustomerId) await loadCustomerHistory(selectedCustomerId);
      } else {
        setMessage({ type: 'error', text: res.message });
      }
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Checkout failed' });
    } finally {
      setLoading(false);
    }
  }

  const filteredCatalog = catalogProducts.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.suit_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.barcode && p.barcode.includes(searchQuery))
  );

  return (
    <div className="pos-root">
      {/* ── Top Header Bar ── */}
      <div className="pos-bar">
        <div className="pos-bar-brand">
          <div className="pos-logo">👑</div>
          <div>
            <div className="pos-bar-title">{shopName.toUpperCase()} POS</div>
            <div className="pos-bar-sub">Wholesale Bulk Order Counter</div>
          </div>
        </div>

        {/* Mobile Hamburger Menu Toggle */}
        <button
          id="btn-mobile-menu-toggle"
          className="pos-mobile-menu-toggle"
          onClick={() => setMobileMenuOpen(v => !v)}
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>

        <div className={`pos-bar-meta ${mobileMenuOpen ? 'pos-bar-meta--open' : ''}`}>
          <button
            id="btn-manage-catalog"
            className="pos-print-btn"
            onClick={() => { setShowCatalogModal(true); setMobileMenuOpen(false); }}
          >
            📦 Manage Catalog
          </button>

          {pendingSyncCount > 0 ? (
            <button
              id="btn-sync-queue"
              className="pos-sync-btn pos-sync-btn--warning"
              onClick={() => { triggerAutoSync(); setMobileMenuOpen(false); }}
              disabled={syncing || !isOnline}
            >
              {syncing ? '🔄 Syncing Database…' : `⚡ ${pendingSyncCount} Order${pendingSyncCount > 1 ? 's' : ''} Queued`}
            </button>
          ) : (
            <span className={`pos-badge ${isOnline ? 'pos-badge--online' : 'pos-badge--offline'}`}>
              <span className="pos-badge-dot" />
              {isOnline ? '🟢 Live Connected' : '🔴 Offline Mode'}
            </span>
          )}

          {lastSale && (
            <button
              id="btn-print-last"
              className="pos-print-btn"
              onClick={() => { setShowPrintModal(true); setMobileMenuOpen(false); }}
            >
              🖨️ Invoice #{lastSale.invoice_no}
            </button>
          )}

          <div className="pos-session-bar">
            <span className="pos-session-email">👤 {user.email}</span>
            <button
              id="btn-pos-signout"
              className="pos-signout-btn"
              onClick={onSignOut}
              title="Sign out of POS"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Tab Switcher (< 768px Viewports) */}
      <div className="pos-mobile-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={activeMobileTab === 'catalog'}
          className={`pos-mobile-tab ${activeMobileTab === 'catalog' ? 'pos-mobile-tab--active' : ''}`}
          onClick={() => setActiveMobileTab('catalog')}
        >
          📦 Catalog ({catalogProducts.length})
        </button>
        <button
          role="tab"
          aria-selected={activeMobileTab === 'cart'}
          className={`pos-mobile-tab ${activeMobileTab === 'cart' ? 'pos-mobile-tab--active' : ''}`}
          onClick={() => setActiveMobileTab('cart')}
        >
          🛒 Checkout {cart.length > 0 ? `(${cart.length}) - ₨${grandTotal.toLocaleString()}` : ''}
        </button>
      </div>

      {message && (
        <div className={`pos-alert pos-alert--${message.type}`} role="alert">
          <span>{message.text}</span>
          <button className="pos-alert-close" onClick={() => setMessage(null)}>✕</button>
        </div>
      )}

      {/* ── Main Workspace ── */}
      <div className="pos-workspace">
        {/* ── Left Column: Catalog ── */}
        <div className={`pos-catalog-panel ${activeMobileTab === 'catalog' ? 'pos-panel--mobile-show' : 'pos-panel--mobile-hide'}`}>
          <div className="pos-catalog-header">
            <h2 className="pos-panel-title">📦 Suit Products Catalog</h2>
            <input
              id="pos-catalog-search"
              type="search"
              className="pos-search"
              placeholder="Search suit name, type, or scan barcode…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="pos-catalog-grid">
            {filteredCatalog.map(p => (
              <button
                key={p.id}
                id={`product-card-${p.id}`}
                className="pos-product-card"
                onClick={() => handleProductClick(p)}
              >
                <div className="pos-product-type">{p.suit_type.toUpperCase()}</div>
                <div className="pos-product-name">{p.name}</div>
                <div className="pos-product-price">₨{p.default_price.toLocaleString()} <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>(Base)</span></div>
                {p.barcode && <div className="pos-product-barcode">Barcode: {p.barcode}</div>}
              </button>
            ))}
          </div>
        </div>

        {/* ── Right Column: Customer Selection, Purchase History & Checkout ── */}
        <div className={`pos-cart-panel ${activeMobileTab === 'cart' ? 'pos-panel--mobile-show' : 'pos-panel--mobile-hide'}`}>
          {/* Customer Selection */}
          <div className="pos-cust-select-wrap">
            <div className="pos-cust-label-row">
              <label htmlFor="pos-cust-select" className="pos-label">Wholesale Customer Account *</label>
              <button
                id="btn-add-cust-pos"
                type="button"
                className="pos-add-cust-btn"
                onClick={() => setShowAddCustModal(true)}
              >
                + Add Customer
              </button>
            </div>
            <select
              id="pos-cust-select"
              className="pos-select"
              value={selectedCustomerId}
              onChange={e => setSelectedCustomerId(e.target.value)}
            >
              <option value="">— Select Wholesale Customer Account —</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.company_name ? `(${c.company_name})` : ''} — Dues: ₨{c.current_balance_due.toLocaleString()}
                </option>
              ))}
            </select>
          </div>

          {/* Customer Purchase History Drawer (Feature 2) */}
          {selectedCustomer && (
            <div className="pos-history-wrap">
              <button
                type="button"
                className="pos-history-toggle"
                onClick={() => setShowHistoryDrawer(v => !v)}
              >
                <span>📜 {selectedCustomer.name}'s Past Bargain & Purchase History</span>
                <span>{showHistoryDrawer ? '▲ Hide' : `▼ Show (${customerHistory.length})`}</span>
              </button>

              {showHistoryDrawer && (
                <div className="pos-history-table-wrap">
                  {customerHistory.length === 0 ? (
                    <div style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'center', padding: '0.4rem' }}>
                      No previous purchases recorded for this customer.
                    </div>
                  ) : (
                    <table className="pos-history-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Product</th>
                          <th>Qty</th>
                          <th>Charged Rate</th>
                          <th>Discount %</th>
                          <th>Invoice #</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerHistory.map(r => (
                          <tr key={r.id}>
                            <td>{new Date(r.created_at).toLocaleDateString('en-PK', { month: 'short', day: 'numeric' })}</td>
                            <td><strong>{r.product_name}</strong></td>
                            <td>{r.quantity}</td>
                            <td><strong>₨{r.price_charged.toLocaleString()}</strong></td>
                            <td>
                              {r.discount_percent > 0 ? (
                                <span className="pos-disc-badge">{r.discount_percent}% OFF</span>
                              ) : (
                                <span style={{ color: '#64748b' }}>0%</span>
                              )}
                            </td>
                            <td>#{r.invoice_no}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Cart Table with Price Override & Live Discount % Display (Feature 2) */}
          <div className="pos-cart-table-wrap">
            <table className="pos-cart-table" aria-label="POS Checkout Cart">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="pos-num">Qty</th>
                  <th className="pos-num">Bargained Rate (PKR)</th>
                  <th className="pos-num">Subtotal</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cart.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="pos-cart-empty">
                      Cart is empty. Tap suit catalog cards to add items.
                    </td>
                  </tr>
                ) : (
                  cart.map(i => {
                    const isDiscounted = i.discount_percent > 0;
                    return (
                      <tr key={i.product.id}>
                        <td>
                          <strong>{i.product.name}</strong>
                          <div className="pos-cart-item-sub">{i.product.suit_type}</div>
                          {isDiscounted && (
                            <div className="pos-disc-badge">
                              ₨{i.unit_price.toLocaleString()} vs base ₨{i.base_price.toLocaleString()} = {i.discount_percent}% discount
                            </div>
                          )}
                        </td>
                        <td className="pos-num">
                          <input
                            type="number"
                            min="1"
                            className="pos-qty-input"
                            value={i.quantity}
                            onFocus={e => e.currentTarget.select()}
                            onChange={e => updateCartQty(i.product.id, e.target.value === '' ? 0 : parseInt(e.target.value, 10))}
                          />
                        </td>
                        <td className="pos-num">
                          <input
                            type="number"
                            min="0"
                            step="50"
                            className="pos-price-input"
                            value={i.unit_price}
                            onChange={e => updateCartPrice(i.product.id, parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className="pos-num"><strong>₨{i.total_price.toLocaleString()}</strong></td>
                        <td>
                          <button className="pos-remove-btn" onClick={() => removeFromCart(i.product.id)}>✕</button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Checkout Form */}
          <form id="pos-checkout-form" onSubmit={handleCheckoutSubmit} className="pos-checkout-form">
            <div className="pos-total-box">
              <div className="pos-total-label">GRAND TOTAL SALE:</div>
              <div className="pos-total-amount">PKR ₨{grandTotal.toLocaleString()}</div>
            </div>

            <div className="pos-field-grid">
              <div className="pos-field">
                <label htmlFor="pos-pay-method" className="pos-label">Payment Method</label>
                <select
                  id="pos-pay-method"
                  className="pos-select"
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value as any)}
                >
                  <option value="cash">Cash Counter</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="jazzcash">JazzCash</option>
                  <option value="easypaisa">EasyPaisa</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>

              <div className="pos-field">
                <label htmlFor="pos-amount-paid" className="pos-label">Amount Paid Received (PKR)</label>
                <input
                  id="pos-amount-paid"
                  type="number"
                  min="0"
                  step="1"
                  className="pos-input"
                  placeholder={`Full: ${grandTotal}`}
                  value={amountPaid}
                  onChange={e => setAmountPaid(e.target.value)}
                />
              </div>

              {/* 🆕 Sale Date Field */}
              <div className="pos-field">
                <label htmlFor="pos-sale-date" className="pos-label">📅 Sale Date</label>
                <input
                  id="pos-sale-date"
                  type="date"
                  className="pos-input"
                  value={saleDate}
                  onChange={e => setSaleDate(e.target.value)}
                />
              </div>

              {/* Optional: Due Date */}
              <div className="pos-field">
                <label htmlFor="pos-due-date" className="pos-label">📅 Due Date (Optional)</label>
                <input
                  id="pos-due-date"
                  type="date"
                  className="pos-input"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                />
              </div>
            </div>

            {remainingDue > 0 && grandTotal > 0 && (
              <div className="pos-due-alert">
                Balance Due Credit: <strong>₨{remainingDue.toLocaleString()}</strong>
                <div style={{ fontSize: '0.72rem', marginTop: '0.2rem', opacity: 0.8 }}>
                  📋 A settlement plan will be requested at checkout.
                </div>
              </div>
            )}

            <button
              id="submit-pos-checkout"
              type="submit"
              className="pos-checkout-btn"
              disabled={loading || cart.length === 0 || !selectedCustomerId}
            >
              {loading
                ? 'Processing Checkout…'
                : remainingDue > 0
                  ? `📋 Set Settlement Plan & Complete (₨${numericPaid.toLocaleString()} paid)`
                  : `✓ COMPLETE CHECKOUT & RECEIPT (₨${numericPaid.toLocaleString()})`
              }
            </button>
          </form>
        </div>
      </div>

      {/* Invoice Print Modal */}
      {showPrintModal && lastSale && (
        <InvoicePrintModal
          sale={lastSale}
          branding={branding}
          onClose={() => setShowPrintModal(false)}
        />
      )}

      {/* Settlement Plan Modal (Part 2) */}
      {showSettlementModal && pendingCheckoutPayload && selectedCustomer && (
        <SettlementPlanModal
          invoiceNo={pendingCheckoutPayload.invoice_no}
          customerId={selectedCustomer.id}
          customerName={selectedCustomer.name}
          grandTotal={pendingCheckoutPayload.total_amount}
          amountPaid={pendingCheckoutPayload.amount_paid}
          defaultPaymentMethod={paymentMethod}
          onConfirm={handleSettlementConfirmed}
          onSkip={handleSettlementSkip}
        />
      )}

      {/* Add Customer Modal */}
      {showAddCustModal && (
        <AddCustomerModal
          onClose={() => setShowAddCustModal(false)}
          onSuccess={(newCust) => {
            setShowAddCustModal(false);
            setMessage({ type: 'success', text: `✓ Added new wholesale customer: ${newCust.name}!` });
            setCustomers(prev => [newCust, ...prev.filter(c => c.id !== newCust.id)]);
            setSelectedCustomerId(newCust.id);
            fetchPosCustomers().then(updated => setCustomers(updated)).catch(console.warn);
          }}
        />
      )}

      {/* Manage Catalog CRUD Modal (Feature 1) */}
      {showCatalogModal && (
        <PosProductCatalogModal
          onClose={() => setShowCatalogModal(false)}
          onCatalogUpdated={refreshCatalog}
        />
      )}

      {/* Rate-Change Nudge Modal (Feature 2) */}
      {rateNudge && selectedCustomer && (
        <div className="pos-nudge-backdrop">
          <div className="pos-nudge-box">
            <div className="pos-nudge-header">
              <div className="pos-nudge-icon">💡</div>
              <h3 className="pos-nudge-title">Base Rate Increase Alert</h3>
            </div>

            <div className="pos-nudge-body">
              Current rate for this product is <strong>Rs. {rateNudge.currentBasePrice.toLocaleString()}</strong>. {selectedCustomer.name}'s last bill for this product was at <strong>Rs. {rateNudge.lastPaidPrice.toLocaleString()}</strong>. Would you like to update the rate for this sale?
            </div>

            <div className="pos-nudge-btns">
              <button
                className="pos-nudge-btn pos-nudge-btn--new"
                onClick={() => confirmAddToCart(rateNudge.product, rateNudge.currentBasePrice)}
              >
                <span>🟢 Accept New Base Price</span>
                <span>Rs. {rateNudge.currentBasePrice.toLocaleString()}</span>
              </button>

              <button
                className="pos-nudge-btn pos-nudge-btn--old"
                onClick={() => confirmAddToCart(rateNudge.product, rateNudge.lastPaidPrice)}
              >
                <span>🔵 Keep Customer's Last Rate</span>
                <span>Rs. {rateNudge.lastPaidPrice.toLocaleString()}</span>
              </button>

              <button
                className="pos-nudge-btn pos-nudge-btn--custom"
                onClick={() => confirmAddToCart(rateNudge.product, rateNudge.lastPaidPrice)}
              >
                <span>🟡 Custom Negotiated Rate</span>
                <span>Edit manually in cart</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Add Customer Modal Component ────────────────────────────────────────── */
function AddCustomerModal({ onClose, onSuccess }: {
  onClose: () => void;
  onSuccess: (cust: PosCustomer) => void;
}) {
  const [form, setForm] = useState({ name: '', shop_name: '', company_name: '', phone: '', city: '', address: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const created = await createPosCustomer({
        name: titleCase(form.name),
        shop_name: titleCase(form.shop_name) || undefined,
        company_name: titleCase(form.company_name) || undefined,
        phone: form.phone.trim() || undefined,
        city: titleCase(form.city) || undefined,
        address: titleCase(form.address) || undefined,
      });
      onSuccess(created);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add customer');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pos-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pos-modal-box">
        <div className="pos-modal-header">
          <h2 className="pos-modal-title">➕ Add New Wholesale Customer</h2>
          <button className="pos-alert-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="pos-modal-form">
          {error && <div className="pos-alert pos-alert--error">{error}</div>}
          <div className="pos-field">
            <label className="pos-label">Customer / Shop Name *</label>
            <input
              className="pos-input"
              required
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Bismillah Traders"
            />
          </div>
          <div className="pos-field">
            <label className="pos-label">Shop Display Name (Optional)</label>
            <input
              className="pos-input"
              value={form.shop_name}
              onChange={e => setForm(f => ({ ...f, shop_name: e.target.value }))}
              placeholder="Optional shop name / outlet"
            />
          </div>
          <div className="pos-field">
            <label className="pos-label">Company Name (Optional)</label>
            <input
              className="pos-input"
              value={form.company_name}
              onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
              placeholder="e.g. Bismillah Garments Pvt"
            />
          </div>
          <div className="pos-field">
            <label className="pos-label">Phone Number (Optional)</label>
            <input
              className="pos-input"
              type="tel"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="03xx-xxxxxxx"
            />
          </div>
          <div className="pos-field">
            <label className="pos-label">City (Optional)</label>
            <input
              className="pos-input"
              value={form.city}
              onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
              placeholder="e.g. Lahore / Faisalabad"
            />
          </div>
          <div className="pos-field">
            <label className="pos-label">Address / Location (Optional)</label>
            <input
              className="pos-input"
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              placeholder="Shop address / location"
            />
          </div>
          <div className="pos-modal-footer">
            <button type="button" className="pos-print-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="pos-checkout-btn" disabled={loading || !form.name}>
              {loading ? 'Creating Account…' : '✓ Save Customer & Select'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}