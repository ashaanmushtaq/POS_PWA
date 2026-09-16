import { supabase } from './supabase';
import {
  enqueueOfflineSale, getPendingQueue, removeQueueItem,
  setLocalCache, getLocalCache, type OfflineSalePayload,
  getActiveTenantId,
} from './offlineQueue';

export interface PosCustomer {
  id: string;
  name: string;
  company_name: string | null;
  shop_name: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  current_balance_due: number;
}

export function titleCase(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').replace(/(^|[\s,.-])([a-z])/g, (_match, separator, letter) => `${separator}${letter.toUpperCase()}`);
}

export interface PosProductItem {
  id: string;
  name: string;
  suit_type: string;
  default_price: number; // Base Wholesale Price
  size_category?: 'kid' | 'adult';
  size_code?: string;
  color?: string;
  fabric_type?: string;
  stock_quantity?: number;
  barcode?: string;
  is_active?: boolean;
}

export interface CustomerPriceHistoryRecord {
  id: string;
  customer_id: string;
  customer_name?: string;
  product_id: string;
  product_name: string;
  price_charged: number;
  base_price: number;
  discount_percent: number;
  quantity: number;
  invoice_no: string;
  created_at: string;
}

export type PaymentPlanStatus = 'planned' | 'received' | 'overdue' | 'cancelled';

export interface CustomerPaymentPlan {
  id?: string;
  tenant_id?: string;
  customer_id: string;
  sale_id?: string;
  invoice_no: string;
  installment_no: number;
  total_installments: number;
  amount_due: number;
  amount_paid: number;
  due_date: string;
  payment_method: 'cash' | 'cheque' | 'bank_transfer' | 'jazzcash' | 'easypaisa';
  cheque_no?: string;
  cheque_clearing_date?: string;
  status: PaymentPlanStatus;
  received_at?: string;
  payment_id?: string;
  notes?: string;
  created_at?: string;
}

export interface PosReceipt {
  id: string;
  customer_id: string;
  sale_id: string | null;
  payment_id: string | null;
  invoice_no: string;
  receipt_type: 'sale' | 'payment';
  snapshot: OfflineSalePayload;
  version: number;
  edited_at: string | null;
  created_at: string;
}


export const DEFAULT_SUIT_CATALOG: PosProductItem[] = [
  { id: 'suit-2pc-standard', name: 'Standard 2-Piece Wash & Wear Suit', suit_type: '2-Piece Suit', default_price: 3500, size_category: 'adult', size_code: 'L', color: 'Navy Blue', fabric_type: 'washing_wear', stock_quantity: 45, barcode: '8901001', is_active: true },
  { id: 'suit-2pc-premium',  name: 'Premium Silk 2-Piece Suit',       suit_type: '2-Piece Suit', default_price: 4800, size_category: 'adult', size_code: 'M', color: 'Charcoal',  fabric_type: 'silk',         stock_quantity: 20, barcode: '8901002', is_active: true },
  { id: 'suit-3pc-royal',    name: 'Royal 3-Piece Groom Suit',         suit_type: '3-Piece Suit', default_price: 7500, size_category: 'adult', size_code: 'XL', color: 'Black',     fabric_type: 'wool',         stock_quantity: 12, barcode: '8901003', is_active: true },
  { id: 'sherwani-classic',  name: 'Classic Velvet Sherwani',         suit_type: 'Sherwani',     default_price: 12500, size_category: 'adult', size_code: '40', color: 'Maroon',   fabric_type: 'custom',       stock_quantity: 8,  barcode: '8901004', is_active: true },
  { id: 'kurta-cotton',      name: 'Designer Cotton Kurta Pajama',     suit_type: 'Kurta Pajama', default_price: 2800, size_category: 'adult', size_code: 'M', color: 'White',    fabric_type: 'cotton',       stock_quantity: 50, barcode: '8901005', is_active: true },
  { id: 'waistcoat-embroidered', name: 'Embroidered Banarsi Waistcoat', suit_type: 'Waistcoat',  default_price: 3200, size_category: 'adult', size_code: 'L', color: 'Gold',     fabric_type: 'silk',         stock_quantity: 30, barcode: '8901006', is_active: true },
];

/* ─── Customer Fetching ─────────────────────────────────────────────────── */

export async function fetchPosCustomers(): Promise<PosCustomer[]> {
  if (navigator.onLine) {
    try {
      const { data, error } = await supabase
        .from('v_customer_balances')
        .select('customer_id, customer_name, company_name, shop_name, phone, address, city, current_balance_due')
        .order('customer_name');
      
      if (!error && data) {
        const mapped: PosCustomer[] = data.map((c: any) => ({
          id: c.customer_id,
          name: titleCase(c.customer_name),
          company_name: c.company_name ? titleCase(c.company_name) : null,
          shop_name: c.shop_name ? titleCase(c.shop_name) : null,
          phone: c.phone,
          address: c.address ? titleCase(c.address) : null,
          city: c.city ? titleCase(c.city) : null,
          current_balance_due: c.current_balance_due,
        }));
        await setLocalCache('pos_customers', mapped);
        return mapped;
      }
    } catch (err) {
      console.warn('Online customer fetch failed, falling back to local cache:', err);
    }
  }

  const cached = await getLocalCache<PosCustomer[]>('pos_customers');
  return cached || [];
}

export async function createPosCustomer(payload: {
  name: string;
  company_name?: string;
  shop_name?: string;
  phone?: string;
  city?: string;
  address?: string;
}): Promise<PosCustomer> {
  const name = titleCase(payload.name);
  const companyName = payload.company_name ? titleCase(payload.company_name) : null;
  const shopName = payload.shop_name ? titleCase(payload.shop_name) : null;
  const address = payload.address ? titleCase(payload.address) : null;
  const city = payload.city ? titleCase(payload.city) : null;
  const { data, error } = await supabase
    .from('customers')
    .insert({
      name,
      company_name: companyName,
      shop_name: shopName,
      phone: payload.phone ?? null,
      address,
      city,
    })
    .select('id, name, company_name, shop_name, phone, address, city')
    .single();

  if (error) throw error;

  return {
    id: data.id,
    name: titleCase(data.name),
    company_name: data.company_name ? titleCase(data.company_name) : null,
    shop_name: data.shop_name ? titleCase(data.shop_name) : null,
    phone: data.phone ?? null,
    address: data.address ? titleCase(data.address) : null,
    city: data.city ? titleCase(data.city) : null,
    current_balance_due: 0,
  };
}

/* ─── Product Catalog CRUD Service Functions ────────────────────────────── */

export async function fetchPosProducts(): Promise<PosProductItem[]> {
  if (navigator.onLine) {
    try {
      const { data, error } = await supabase
        .from('pos_products')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (!error && data) {
        const products = data.map((p: any) => ({
          id: p.id,
          name: p.name,
          suit_type: `${p.size_category === 'kid' ? 'Kid' : 'Adult'} ${p.fabric_type ? p.fabric_type.replace('_', ' ') : 'Suit'}`,
          default_price: Number(p.default_price) || 0,
          size_category: p.size_category,
          size_code: p.size_code,
          color: p.color,
          fabric_type: p.fabric_type,
          stock_quantity: p.stock_quantity ?? 0,
          barcode: p.barcode ?? undefined,
          is_active: p.is_active ?? true,
        }));
        await setLocalCache('pos_catalog_products', products);
        return products;
      }
    } catch (err) {
      console.warn('Online products fetch notice:', err);
    }
  }

  const cached = await getLocalCache<PosProductItem[]>('pos_catalog_products');
  if (cached && cached.length > 0) {
    return cached.filter(p => p.is_active !== false);
  }

  await setLocalCache('pos_catalog_products', DEFAULT_SUIT_CATALOG);
  return DEFAULT_SUIT_CATALOG;
}

export async function createPosProduct(payload: Omit<PosProductItem, 'id'>): Promise<PosProductItem> {
  const newId = `prod-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const product: PosProductItem = {
    id: newId,
    name: payload.name,
    suit_type: payload.suit_type || `${payload.size_category === 'kid' ? 'Kid' : 'Adult'} ${payload.fabric_type?.replace('_', ' ') || 'Suit'}`,
    default_price: payload.default_price,
    size_category: payload.size_category || 'adult',
    size_code: payload.size_code || 'M',
    color: payload.color || 'Navy Blue',
    fabric_type: payload.fabric_type || 'washing_wear',
    stock_quantity: payload.stock_quantity ?? 10,
    barcode: payload.barcode || `890${Math.floor(1000 + Math.random() * 9000)}`,
    is_active: true,
  };

  if (navigator.onLine) {
    const { data, error } = await supabase
      .from('pos_products')
      .insert({
        name: product.name,
        size_category: product.size_category,
        size_code: product.size_code,
        color: product.color,
        fabric_type: product.fabric_type,
        default_price: product.default_price,
        stock_quantity: product.stock_quantity,
        barcode: product.barcode,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.warn('Supabase product creation notice:', error.message);
    } else if (data) {
      product.id = data.id;
    }
  }

  const currentCatalog = await fetchPosProducts();
  const updatedCatalog = [product, ...currentCatalog.filter(p => p.id !== product.id)];
  await setLocalCache('pos_catalog_products', updatedCatalog);

  return product;
}

export async function updatePosProduct(id: string, payload: Partial<PosProductItem>): Promise<PosProductItem> {
  const currentCatalog = await fetchPosProducts();
  const existing = currentCatalog.find(p => p.id === id);

  const updatedProduct: PosProductItem = {
    ...(existing || {
      id,
      name: 'Wholesale Suit Product',
      suit_type: '2-Piece Suit',
      default_price: 1000,
      size_category: 'adult',
      size_code: 'M',
      color: 'Navy Blue',
      fabric_type: 'washing_wear',
      stock_quantity: 10,
      is_active: true,
    }),
    ...payload,
  };

  if (navigator.onLine) {
    const { data, error } = await supabase
      .from('pos_products')
      .update({
        name: updatedProduct.name,
        size_category: updatedProduct.size_category,
        size_code: updatedProduct.size_code,
        color: updatedProduct.color,
        fabric_type: updatedProduct.fabric_type,
        default_price: updatedProduct.default_price,
        stock_quantity: updatedProduct.stock_quantity,
        barcode: updatedProduct.barcode,
        is_active: updatedProduct.is_active ?? true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id')
      .single();

    if (error) {
      throw new Error(`Product update failed: ${error.message}`);
    }

    if (!data) {
      throw new Error('Product update failed: no database response');
    }
  }

  const updatedCatalog = currentCatalog.map(p => (p.id === id ? updatedProduct : p));
  await setLocalCache('pos_catalog_products', updatedCatalog);

  return updatedProduct;
}

export async function deletePosProduct(id: string): Promise<void> {
  if (navigator.onLine) {
    const { error } = await supabase
      .from('pos_products')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.warn('Supabase product delete notice:', error.message);
    }
  }

  const currentCatalog = await fetchPosProducts();
  const updatedCatalog = currentCatalog.map(p => (p.id === id ? { ...p, is_active: false } : p)).filter(p => p.is_active !== false);
  await setLocalCache('pos_catalog_products', updatedCatalog);
}

/* ─── Customer Product Price History (Part 1: Source of Truth = Supabase) ─ */

export async function fetchCustomerPurchaseHistory(customerId: string): Promise<CustomerPriceHistoryRecord[]> {
  if (!customerId) return [];

  // When online: read directly from Supabase as source of truth
  if (navigator.onLine) {
    const { data, error } = await supabase
      .from('customer_product_price_history')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase customer purchase history fetch failed:', error.message);
      throw new Error(`Database History Error: ${error.message}`);
    }

    const history: CustomerPriceHistoryRecord[] = (data || []).map((r: any) => ({
      id: r.id,
      customer_id: r.customer_id,
      customer_name: r.customer_name,
      product_id: r.product_id,
      product_name: r.product_name,
      price_charged: Number(r.price_charged) || 0,
      base_price: Number(r.base_price) || 0,
      discount_percent: Number(r.discount_percent) || 0,
      quantity: Number(r.quantity) || 1,
      invoice_no: r.invoice_no,
      created_at: r.created_at,
    }));

    await setLocalCache(`pos_cust_history_${customerId}`, history);
    return history;
  }

  // When offline: read from local IndexedDB queue cache
  const cached = await getLocalCache<CustomerPriceHistoryRecord[]>(`pos_cust_history_${customerId}`);
  return cached || [];
}

export async function recordCustomerProductPriceHistory(payload: OfflineSalePayload, saleId?: string): Promise<void> {
  const records: CustomerPriceHistoryRecord[] = payload.items.map(item => {
    const basePrice = item.base_price ?? item.unit_price;
    const discountPct = item.discount_percent ?? (basePrice > 0 ? Number((((basePrice - item.unit_price) / basePrice) * 100).toFixed(1)) : 0);

    return {
      id: `cph-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      customer_id: payload.customer_id,
      customer_name: payload.customer_name,
      product_id: item.product_id || item.product_name,
      product_name: item.product_name,
      price_charged: item.unit_price,
      base_price: basePrice,
      discount_percent: discountPct,
      quantity: item.quantity,
      invoice_no: payload.invoice_no,
      created_at: payload.created_at || new Date().toISOString(),
    };
  });

  if (navigator.onLine) {
    const inserts = records.map(r => ({
      customer_id: r.customer_id,
      customer_name: r.customer_name,
      product_id: r.product_id,
      product_name: r.product_name,
      price_charged: r.price_charged,
      base_price: r.base_price,
      discount_percent: r.discount_percent,
      quantity: r.quantity,
      invoice_no: r.invoice_no,
      sale_id: saleId ?? null,
      created_at: r.created_at,
    }));

    const { error } = await supabase.from('customer_product_price_history').insert(inserts);

    if (error) {
      console.error('Supabase customer_product_price_history insert failed:', error.message);
      // Surface error visibly to staff when online
      throw new Error(`Database History Insert Failed: ${error.message}`);
    }
  }

  // Also cache locally for offline access
  const cached = await getLocalCache<CustomerPriceHistoryRecord[]>(`pos_cust_history_${payload.customer_id}`);
  const existingLocal = cached || [];
  await setLocalCache(`pos_cust_history_${payload.customer_id}`, [...records, ...existingLocal]);
}

/* ─── Settlement Plans & Installment Service Functions (Part 2) ────────── */

export async function recordCustomerPaymentPlans(plans: CustomerPaymentPlan[]): Promise<void> {
  if (!plans || plans.length === 0) return;

  if (navigator.onLine) {
    const inserts = plans.map(p => ({
      customer_id: p.customer_id,
      sale_id: p.sale_id ?? null,
      invoice_no: p.invoice_no,
      installment_no: p.installment_no,
      total_installments: p.total_installments,
      amount_due: p.amount_due,
      amount_paid: p.amount_paid ?? 0,
      due_date: p.due_date,
      payment_method: p.payment_method,
      cheque_no: p.cheque_no ?? null,
      cheque_clearing_date: p.cheque_clearing_date ?? null,
      status: p.status || 'planned',
      notes: p.notes ?? null,
    }));

    const { error } = await supabase.from('customer_payment_plans').insert(inserts);
    if (error) {
      console.error('Supabase customer_payment_plans insert failed:', error.message);
      throw new Error(`Settlement Plan Error: ${error.message}`);
    }
  } else {
    // Cache offline
    await setLocalCache(`pos_plans_${plans[0].invoice_no}`, plans);
  }
}

export async function fetchCustomerPaymentPlans(customerId?: string, saleId?: string): Promise<CustomerPaymentPlan[]> {
  if (navigator.onLine) {
    let query = supabase.from('customer_payment_plans').select('*');
    if (customerId) query = query.eq('customer_id', customerId);
    if (saleId) query = query.eq('sale_id', saleId);

    const { data, error } = await query.order('installment_no', { ascending: true });
    if (!error && data) {
      return data as CustomerPaymentPlan[];
    }
  }
  return [];
}

export interface PosReceiptCorrection {
  id: string;
  receipt_id: string;
  sale_id: string | null;
  changed_by: string | null;
  changed_by_name?: string;
  reason?: string | null;
  before_snapshot: OfflineSalePayload;
  after_snapshot: OfflineSalePayload;
  changed_at: string;
}

export interface ReceivePaymentPayload {
  customer_id: string;
  amount: number;
  payment_method: CustomerPaymentPlan['payment_method'];
  sale_id?: string;
  reference_no?: string;
  payment_date?: string;
  cheque_clearing_date?: string;
  plan_ids?: string[];
  notes?: string;
  is_cleared?: boolean;
}

export async function fetchCustomerReceipts(customerId: string): Promise<PosReceipt[]> {
  if (!navigator.onLine || !customerId) return [];
  const { data, error } = await supabase
    .from('pos_receipts')
    .select('id, customer_id, sale_id, payment_id, invoice_no, receipt_type, snapshot, version, edited_at, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Receipt history error: ${error.message}`);
  return (data || []) as PosReceipt[];
}

export async function fetchAllPosReceipts(params?: {
  searchQuery?: string;
  startDate?: string;
  endDate?: string;
  receiptType?: 'all' | 'sale' | 'payment';
  customerId?: string;
  limit?: number;
}): Promise<PosReceipt[]> {
  if (!navigator.onLine) {
    const cached = await getLocalCache<PosReceipt[]>('pos_all_receipts');
    let list = cached || [];
    if (params?.customerId) list = list.filter(r => r.customer_id === params.customerId);
    if (params?.receiptType && params.receiptType !== 'all') list = list.filter(r => r.receipt_type === params.receiptType);
    if (params?.searchQuery) {
      const q = params.searchQuery.toLowerCase();
      list = list.filter(r => r.invoice_no.toLowerCase().includes(q) || (r.snapshot.customer_name || '').toLowerCase().includes(q));
    }
    return list;
  }

  let query = supabase
    .from('pos_receipts')
    .select('id, customer_id, sale_id, payment_id, invoice_no, receipt_type, snapshot, version, edited_at, created_at, customers:customer_id(name, company_name, phone)')
    .order('created_at', { ascending: false });

  if (params?.customerId) {
    query = query.eq('customer_id', params.customerId);
  }
  if (params?.receiptType && params.receiptType !== 'all') {
    query = query.eq('receipt_type', params.receiptType);
  }
  if (params?.startDate) {
    query = query.gte('created_at', `${params.startDate}T00:00:00.000Z`);
  }
  if (params?.endDate) {
    query = query.lte('created_at', `${params.endDate}T23:59:59.999Z`);
  }
  query = query.limit(params?.limit || 150);

  const { data, error } = await query;
  if (error) {
    console.warn('fetchAllPosReceipts query notice:', error.message);
    const cached = await getLocalCache<PosReceipt[]>('pos_all_receipts');
    return cached || [];
  }

  let results: PosReceipt[] = (data || []).map((r: any) => ({
    id: r.id,
    customer_id: r.customer_id,
    customer_name: r.customers?.name || r.snapshot?.customer_name,
    sale_id: r.sale_id,
    payment_id: r.payment_id,
    invoice_no: r.invoice_no,
    receipt_type: r.receipt_type,
    snapshot: r.snapshot,
    version: r.version,
    edited_at: r.edited_at,
    created_at: r.created_at,
  }));

  if (params?.searchQuery) {
    const q = params.searchQuery.toLowerCase().trim();
    results = results.filter(r =>
      r.invoice_no.toLowerCase().includes(q) ||
      (r.customer_name || '').toLowerCase().includes(q) ||
      (r.snapshot?.customer_name || '').toLowerCase().includes(q) ||
      (r.snapshot?.customer_phone || '').includes(q)
    );
  }

  if (!params?.customerId && !params?.searchQuery && !params?.startDate) {
    await setLocalCache('pos_all_receipts', results);
  }

  return results;
}

export async function fetchReceiptCorrections(receiptId: string): Promise<PosReceiptCorrection[]> {
  if (!navigator.onLine || !receiptId) return [];
  const { data, error } = await supabase
    .from('pos_receipt_corrections')
    .select('id, receipt_id, sale_id, changed_by, reason, before_snapshot, after_snapshot, changed_at, profiles:changed_by(full_name)')
    .eq('receipt_id', receiptId)
    .order('changed_at', { ascending: false });

  if (error) {
    console.warn('fetchReceiptCorrections notice:', error.message);
    return [];
  }

  return (data || []).map((c: any) => ({
    id: c.id,
    receipt_id: c.receipt_id,
    sale_id: c.sale_id,
    changed_by: c.changed_by,
    changed_by_name: c.profiles?.full_name || 'Owner / Authorized Staff',
    reason: c.reason,
    before_snapshot: c.before_snapshot,
    after_snapshot: c.after_snapshot,
    changed_at: c.changed_at,
  }));
}

export async function receiveCustomerPayment(payload: ReceivePaymentPayload): Promise<{ paymentId?: string; planId?: string; isPendingCheque?: boolean }> {
  // If method is cheque and not yet cleared:
  if (payload.payment_method === 'cheque' && payload.is_cleared === false) {
    if (payload.plan_ids && payload.plan_ids.length > 0) {
      const planId = payload.plan_ids[0];
      const { error } = await supabase
        .from('customer_payment_plans')
        .update({
          cheque_no: payload.reference_no ?? undefined,
          cheque_clearing_date: payload.cheque_clearing_date ?? undefined,
          notes: payload.notes ? `${payload.notes} (Cheque collected at counter, pending bank clearance)` : 'Cheque collected at counter, pending bank clearance',
          updated_at: new Date().toISOString(),
        })
        .eq('id', planId);
      if (error) throw new Error(`Failed to update cheque installment: ${error.message}`);
      return { planId, isPendingCheque: true };
    } else {
      const { data, error } = await supabase
        .from('customer_payment_plans')
        .insert({
          customer_id: payload.customer_id,
          invoice_no: `CHQ-${Date.now().toString().slice(-6)}`,
          installment_no: 1,
          total_installments: 1,
          amount_due: payload.amount,
          amount_paid: 0,
          due_date: payload.cheque_clearing_date || new Date().toISOString().slice(0, 10),
          payment_method: 'cheque',
          cheque_no: payload.reference_no ?? null,
          cheque_clearing_date: payload.cheque_clearing_date ?? null,
          status: 'planned',
          notes: payload.notes || 'Counter cheque collected, awaiting clearing',
        })
        .select('id')
        .single();
      if (error) throw new Error(`Failed to register pending cheque: ${error.message}`);
      return { planId: data.id, isPendingCheque: true };
    }
  }

  const { data, error } = await supabase.rpc('receive_pos_payment', {
    p_customer_id: payload.customer_id,
    p_amount: payload.amount,
    p_method: payload.payment_method,
    p_sale_id: payload.sale_id ?? null,
    p_reference_no: payload.reference_no ?? null,
    p_payment_date: payload.payment_date ?? new Date().toISOString().slice(0, 10),
    p_notes: payload.notes ?? 'POS payment collection',
    p_plan_ids: payload.plan_ids ?? [],
  });
  if (error) throw new Error(`Payment collection failed: ${error.message}`);
  return { paymentId: data as string, isPendingCheque: false };
}

export async function confirmChequeClearance(
  planId: string,
  clearanceDate?: string,
  notes?: string
): Promise<string> {
  const { data, error } = await supabase.rpc('confirm_cheque_clearance', {
    p_plan_id: planId,
    p_clearance_date: clearanceDate || new Date().toISOString().slice(0, 10),
    p_notes: notes ?? null,
  });
  if (error) throw new Error(`Cheque clearance confirmation failed: ${error.message}`);
  return data as string;
}

export async function savePosReceipt(
  sale: OfflineSalePayload,
  saleId: string | null,
  paymentId?: string | null,
  receiptType: 'sale' | 'payment' = 'sale',
): Promise<PosReceipt | null> {
  if (!navigator.onLine) {
    await setLocalCache(`pos_receipt_${sale.invoice_no}`, sale);
    return null;
  }
  const payload: Record<string, unknown> = {
    customer_id: sale.customer_id,
    sale_id: saleId,
    payment_id: paymentId ?? null,
    invoice_no: sale.invoice_no,
    receipt_type: receiptType,
    snapshot: sale,
  };
  const activeTenant = getActiveTenantId() || sale.tenant_id;
  if (activeTenant) {
    payload.tenant_id = activeTenant;
  }
  const { data, error } = await supabase
    .from('pos_receipts')
    .insert(payload)
    .select('id, customer_id, sale_id, payment_id, invoice_no, receipt_type, snapshot, version, edited_at, created_at')
    .single();
  if (error) throw new Error(`Receipt save failed: ${error.message}`);
  return data as PosReceipt;
}

export async function correctPosReceipt(
  receipt: PosReceipt,
  snapshot: OfflineSalePayload,
  reason?: string
): Promise<PosReceipt> {
  const { data, error } = await supabase.rpc('correct_pos_sale', {
    p_receipt_id: receipt.id,
    p_total_amount: snapshot.total_amount,
    p_snapshot: snapshot,
    p_reason: reason || 'Corrected in POS Counter',
  });
  if (error) throw new Error(`Receipt correction failed: ${error.message}`);
  if (receipt.sale_id) {
    await supabase.from('customer_product_price_history').delete().eq('sale_id', receipt.sale_id);
    await recordCustomerProductPriceHistory(snapshot, receipt.sale_id);
  }
  return data as PosReceipt;
}

export async function markPaymentPlanAsReceived(
  planId: string,
  amountReceived: number,
  method: string,
  referenceNo?: string
): Promise<void> {
  // 1. Fetch plan details
  const { data: plan, error: planErr } = await supabase
    .from('customer_payment_plans')
    .select('*')
    .eq('id', planId)
    .single();

  if (planErr || !plan) throw new Error('Payment plan not found');

  // 2. Record payment via RPC to reduce customer dues & update customer_payments
  const { data: paymentId, error: payErr } = await supabase.rpc('record_customer_payment', {
    p_customer_id: plan.customer_id,
    p_amount: amountReceived,
    p_method: method || plan.payment_method,
    p_sale_id: plan.sale_id ?? null,
    p_reference_no: referenceNo ?? plan.cheque_no ?? null,
    p_notes: `Installment #${plan.installment_no} Received (${plan.invoice_no})`,
  });

  if (payErr) throw payErr;

  // 3. Update payment plan record status to 'received'
  const newAmountPaid = Number(plan.amount_paid || 0) + amountReceived;
  const isFullyPaid = newAmountPaid >= Number(plan.amount_due);

  const { error: updateErr } = await supabase
    .from('customer_payment_plans')
    .update({
      amount_paid: newAmountPaid,
      status: isFullyPaid ? 'received' : 'planned',
      received_at: new Date().toISOString(),
      payment_id: paymentId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', planId);

  if (updateErr) throw updateErr;
}

/* ─── Submit Checkout Sale ───────────────────────────────────────────────── */

export async function processPosCheckout(
  payload: Omit<OfflineSalePayload, 'synced'>,
  settlementPlans?: CustomerPaymentPlan[]
): Promise<{
  success: boolean;
  isOffline: boolean;
  serverInvoiceNo?: string;
  saleId?: string;
  message: string;
}> {
  const offlinePayload: OfflineSalePayload = {
    ...payload,
    synced: false,
  };

  if (navigator.onLine) {
    try {
      // 1. Record Sale on Server via RPC
      const { data: saleId, error: saleErr } = await supabase.rpc('record_customer_sale', {
        p_customer_id: payload.customer_id,
        p_invoice_no: payload.invoice_no,
        p_total_amount: payload.total_amount,
        p_due_date: payload.due_date ?? null,
        p_notes: payload.notes ? `${payload.notes} (POS Counter Checkout)` : 'POS Counter Checkout',
      });

      if (saleErr) {
        return {
          success: false,
          isOffline: false,
          message: `Supabase Order Error: ${saleErr.message}`,
        };
      }

      // 2. Record Payment via RPC if amount_paid > 0
      if (payload.amount_paid > 0) {
        const { error: payErr } = await supabase.rpc('record_customer_payment', {
          p_customer_id: payload.customer_id,
          p_amount: payload.amount_paid,
          p_method: payload.payment_method,
          p_sale_id: saleId,
          p_reference_no: payload.reference_no ?? null,
          p_notes: `Counter Receipt for Invoice #${payload.invoice_no}`,
        });
        if (payErr) {
          console.warn('Payment record warning:', payErr.message);
        }
      }

      // 3. Record Price History directly to Supabase as Source of Truth
      await recordCustomerProductPriceHistory(payload, saleId);

      // 4. Record Settlement Plans / Installment Schedule if present
      if (settlementPlans && settlementPlans.length > 0) {
        const plansWithSaleId = settlementPlans.map(p => ({ ...p, sale_id: saleId }));
        await recordCustomerPaymentPlans(plansWithSaleId);
      }

      await savePosReceipt({ ...payload, installment_plans: settlementPlans?.map(plan => ({
        installment_no: plan.installment_no,
        total_installments: plan.total_installments,
        amount_due: plan.amount_due,
        due_date: plan.due_date,
        payment_method: plan.payment_method,
        status: plan.status,
        notes: plan.notes,
      })) }, saleId);

      return {
        success: true,
        isOffline: false,
        serverInvoiceNo: payload.invoice_no,
        saleId,
        message: `✓ Order #${payload.invoice_no} recorded live on Supabase across all devices!`,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Checkout failed';
      return {
        success: false,
        isOffline: false,
        message: `Checkout Error: ${errMsg}`,
      };
    }
  }

  // Offline queue fallback when network is disconnected
  await enqueueOfflineSale(offlinePayload);
  await recordCustomerProductPriceHistory(offlinePayload);
  if (settlementPlans) await recordCustomerPaymentPlans(settlementPlans);

  return {
    success: true,
    isOffline: true,
    serverInvoiceNo: payload.invoice_no,
    message: `⚡ Saved to local offline queue. Will auto-sync when network reconnects.`,
  };
}

/* ─── Offline Queue Sync Engine ─────────────────────────────────────────── */

export async function syncOfflineSalesQueue(): Promise<{ syncedCount: number; errors: string[] }> {
  if (!navigator.onLine) return { syncedCount: 0, errors: ['Network is currently offline'] };

  const pending = await getPendingQueue();
  if (pending.length === 0) return { syncedCount: 0, errors: [] };

  let syncedCount = 0;
  const errors: string[] = [];

  for (const item of pending) {
    try {
      const { data: saleId, error: saleErr } = await supabase.rpc('record_customer_sale', {
        p_customer_id: item.customer_id,
        p_invoice_no: item.invoice_no,
        p_total_amount: item.total_amount,
        p_due_date: item.due_date ?? null,
        p_notes: `Offline Sync (Created ${new Date(item.created_at).toLocaleString()})`,
      });

      if (saleErr) throw saleErr;

      if (item.amount_paid > 0) {
        const { error: payErr } = await supabase.rpc('record_customer_payment', {
          p_customer_id: item.customer_id,
          p_amount: item.amount_paid,
          p_method: item.payment_method,
          p_sale_id: saleId,
          p_reference_no: item.reference_no ?? null,
          p_notes: `Offline Sync Payment for #${item.invoice_no}`,
        });
        if (payErr) console.warn('Sync payment error:', payErr.message);
      }

      await recordCustomerProductPriceHistory({ ...item, synced: true });
      await removeQueueItem(item.id);
      syncedCount++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown sync error';
      errors.push(`Invoice #${item.invoice_no}: ${msg}`);
    }
  }

  return { syncedCount, errors };
}
