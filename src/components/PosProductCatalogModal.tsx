import { useState, useEffect, type FormEvent } from 'react';
import {
  fetchPosProducts, createPosProduct, updatePosProduct, deletePosProduct,
  type PosProductItem
} from '../lib/posService';
import './PosProductCatalogModal.css';

interface PosProductCatalogModalProps {
  onClose: () => void;
  onCatalogUpdated: () => void;
}

export function PosProductCatalogModal({ onClose, onCatalogUpdated }: PosProductCatalogModalProps) {
  const [products, setProducts] = useState<PosProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [form, setForm] = useState({
    name: '',
    size_category: 'adult' as 'kid' | 'adult',
    size_code: 'M',
    color: 'Navy Blue',
    fabric_type: 'washing_wear',
    default_price: '3500',
    stock_quantity: '50',
    barcode: '',
  });

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    setLoading(true);
    try {
      const items = await fetchPosProducts();
      setProducts(items);
    } catch (err: any) {
      console.warn('Error loading products:', err);
    } finally {
      setLoading(false);
    }
  }

  function startEdit(p: PosProductItem) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      size_category: p.size_category || 'adult',
      size_code: p.size_code || 'M',
      color: p.color || 'Navy Blue',
      fabric_type: p.fabric_type || 'washing_wear',
      default_price: String(p.default_price),
      stock_quantity: String(p.stock_quantity ?? 50),
      barcode: p.barcode || '',
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm({
      name: '',
      size_category: 'adult',
      size_code: 'M',
      color: 'Navy Blue',
      fabric_type: 'washing_wear',
      default_price: '3500',
      stock_quantity: '50',
      barcode: '',
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;

    const basePrice = parseFloat(form.default_price) || 0;
    const stockQty = parseInt(form.stock_quantity, 10) || 0;

    try {
      if (editingId) {
        await updatePosProduct(editingId, {
          name: form.name.trim(),
          size_category: form.size_category,
          size_code: form.size_code,
          color: form.color.trim(),
          fabric_type: form.fabric_type,
          default_price: basePrice,
          stock_quantity: stockQty,
          barcode: form.barcode.trim() || undefined,
        });
        setMessage({ type: 'success', text: `✓ Updated product "${form.name}"!` });
      } else {
        await createPosProduct({
          name: form.name.trim(),
          suit_type: `${form.size_category === 'kid' ? 'Kid' : 'Adult'} ${form.fabric_type.replace('_', ' ')}`,
          size_category: form.size_category,
          size_code: form.size_code,
          color: form.color.trim(),
          fabric_type: form.fabric_type,
          default_price: basePrice,
          stock_quantity: stockQty,
          barcode: form.barcode.trim() || undefined,
          is_active: true,
        });
        setMessage({ type: 'success', text: `✓ Created new product "${form.name}"!` });
      }

      resetForm();
      await loadProducts();
      onCatalogUpdated();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save product' });
    }
  }

  async function handleDelete(p: PosProductItem) {
    if (!confirm(`Are you sure you want to deactivate/soft-delete "${p.name}"? Past invoices will remain intact.`)) return;

    try {
      await deletePosProduct(p.id);
      setMessage({ type: 'success', text: `✓ Deactivated product "${p.name}".` });
      await loadProducts();
      onCatalogUpdated();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to deactivate product' });
    }
  }

  return (
    <div className="prod-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="prod-modal-box">
        <div className="prod-modal-header">
          <h2 className="prod-modal-title">📦 Manage Suit Product Catalog</h2>
          <button className="pos-alert-close" onClick={onClose}>✕</button>
        </div>

        <div className="prod-modal-body">
          {message && (
            <div className={`pos-alert pos-alert--${message.type}`}>
              <span>{message.text}</span>
              <button className="pos-alert-close" onClick={() => setMessage(null)}>✕</button>
            </div>
          )}

          {/* Form */}
          <div className="prod-form-card">
            <h3 className="prod-form-title">
              {editingId ? '✏️ Edit Product & Base Wholesale Price' : '➕ Add New Suit Product'}
            </h3>
            <form onSubmit={handleSubmit}>
              <div className="prod-form-grid">
                <div className="pos-field">
                  <label className="pos-label">Product Name *</label>
                  <input
                    className="pos-input"
                    required
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Royal Silk 2-Piece Suit"
                  />
                </div>

                <div className="pos-field">
                  <label className="pos-label">Size Category</label>
                  <select
                    className="pos-select"
                    value={form.size_category}
                    onChange={e => setForm(f => ({ ...f, size_category: e.target.value as any }))}
                  >
                    <option value="adult">Adult</option>
                    <option value="kid">Kid</option>
                  </select>
                </div>

                <div className="pos-field">
                  <label className="pos-label">Size Code</label>
                  <select
                    className="pos-select"
                    value={form.size_code}
                    onChange={e => setForm(f => ({ ...f, size_code: e.target.value }))}
                  >
                    <option value="XS">XS</option>
                    <option value="S">S</option>
                    <option value="M">M</option>
                    <option value="L">L</option>
                    <option value="XL">XL</option>
                    <option value="38">38</option>
                    <option value="40">40</option>
                    <option value="42">42</option>
                  </select>
                </div>

                <div className="pos-field">
                  <label className="pos-label">Color</label>
                  <input
                    className="pos-input"
                    value={form.color}
                    onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                    placeholder="Navy Blue / Black / Charcoal"
                  />
                </div>

                <div className="pos-field">
                  <label className="pos-label">Fabric Type</label>
                  <select
                    className="pos-select"
                    value={form.fabric_type}
                    onChange={e => setForm(f => ({ ...f, fabric_type: e.target.value }))}
                  >
                    <option value="washing_wear">Washing & Wear</option>
                    <option value="silk">Silk</option>
                    <option value="cotton">Cotton</option>
                    <option value="wool">Wool</option>
                    <option value="terry_rayon">Terry Rayon</option>
                    <option value="custom">Custom Fabric</option>
                  </select>
                </div>

                <div className="pos-field">
                  <label className="pos-label">Base Wholesale Price (PKR) *</label>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    className="pos-input"
                    required
                    value={form.default_price}
                    onChange={e => setForm(f => ({ ...f, default_price: e.target.value }))}
                  />
                </div>

                <div className="pos-field">
                  <label className="pos-label">Stock Quantity</label>
                  <input
                    type="number"
                    min="0"
                    className="pos-input"
                    value={form.stock_quantity}
                    onChange={e => setForm(f => ({ ...f, stock_quantity: e.target.value }))}
                  />
                </div>

                <div className="pos-field">
                  <label className="pos-label">Barcode (Optional)</label>
                  <input
                    className="pos-input"
                    value={form.barcode}
                    onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))}
                    placeholder="8901007"
                  />
                </div>
              </div>

              <div className="prod-form-actions">
                {editingId && (
                  <button type="button" className="pos-print-btn" onClick={resetForm}>
                    Cancel Edit
                  </button>
                )}
                <button type="submit" className="pos-checkout-btn" style={{ width: 'auto' }}>
                  {editingId ? '✓ Save Changes' : '➕ Add Product'}
                </button>
              </div>
            </form>
          </div>

          {/* Table */}
          <div className="prod-table-wrap">
            <table className="prod-table">
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>Size / Color</th>
                  <th>Fabric</th>
                  <th>Base Price (PKR)</th>
                  <th>Stock</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem' }}>
                      Loading Catalog…
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>
                      No active products in catalog. Fill form above to add one.
                    </td>
                  </tr>
                ) : (
                  products.map(p => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.name}</strong>
                        {p.barcode && <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Barcode: {p.barcode}</div>}
                      </td>
                      <td>
                        <span style={{ textTransform: 'capitalize' }}>{p.size_category}</span> ({p.size_code}) · {p.color}
                      </td>
                      <td>{p.fabric_type ? p.fabric_type.replace('_', ' ') : 'Standard'}</td>
                      <td><span className="prod-price-badge">₨{p.default_price.toLocaleString()}</span></td>
                      <td>
                        <span className={`prod-stock-badge ${ (p.stock_quantity ?? 0) > 10 ? 'prod-stock-badge--ok' : 'prod-stock-badge--low'}`}>
                          {p.stock_quantity ?? 0} Pcs
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button className="prod-act-btn prod-act-btn--edit" onClick={() => startEdit(p)}>
                            ✏️ Edit
                          </button>
                          <button className="prod-act-btn prod-act-btn--del" onClick={() => handleDelete(p)}>
                            🗑️ Soft Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
