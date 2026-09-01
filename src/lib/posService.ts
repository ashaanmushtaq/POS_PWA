import { supabase } from './supabase';
import {
  enqueueOfflineSale, getPendingQueue, removeQueueItem,
  setLocalCache, getLocalCache, type OfflineSalePayload,
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
          name: c.customer_name,
          company_name: c.company_name,
          shop_name: c.shop_name ?? null,
          phone: c.phone,
          address: c.address ?? null,
          city: c.city,
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
  const { data, error } = await supabase
    .from('customers')
    .insert({
      name: payload.name,
      company_name: payload.company_name ?? null,
      shop_name: payload.shop_name ?? null,
      phone: payload.phone ?? null,
      address: payload.address ?? null,
      city: payload.city ?? null,
    })
    .select('id, name, company_name, shop_name, phone, address, city')
    .single();

  if (error) throw error;

  return {
    id: data.id,
    name: data.name,
    company_name: data.company_name,
    phone: data.phone,
    city: data.city,
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

      if (!error && data && data.length > 0) {
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
    const { error } = await supabase
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
      .eq('id', id);

    if (error) {
      console.warn('Supabase product update notice:', error.message);
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

export async function recordCustomerProductPriceHistory(payload: OfflineSalePayload): Promise<void> {
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
      await recordCustomerProductPriceHistory(payload);

      // 4. Record Settlement Plans / Installment Schedule if present
      if (settlementPlans && settlementPlans.length > 0) {
        const plansWithSaleId = settlementPlans.map(p => ({ ...p, sale_id: saleId }));
        await recordCustomerPaymentPlans(plansWithSaleId);
      }

      return {
        success: true,
        isOffline: false,
        serverInvoiceNo: payload.invoice_no,
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
