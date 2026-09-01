/**
 * POS Offline Queue & Storage Engine (IndexedDB)
 * 
 * DATA-LOSS RISK & CONCURRENCY CONSTRAINTS:
 * 1. Offline Invoice Numbering: Devices operating offline generate local client IDs with an 'OFFLINE-' prefix
 *    to prevent invoice number collisions with the server sequence. The server generates final invoice numbers during sync.
 * 2. Un-synced Local Storage: If browser cache/data is manually cleared by user while offline, pending queue items are lost.
 * 3. Last-Write-Wins Sync Strategy: Offline transactions are replayed sequentially in order of creation timestamp.
 */

export interface OfflineSaleItem {
  product_id?: string;
  product_name: string;
  suit_type: string;
  quantity: number;
  unit_price: number;
  base_price?: number;
  discount_percent?: number;
  total_price: number;
}

export interface OfflineSalePayload {
  id: string; // Client-side UUID
  customer_id: string;
  customer_name: string;
  invoice_no: string; // e.g. OFFLINE-1725134000-1234
  total_amount: number;
  amount_paid: number;
  payment_method: 'cash' | 'cheque' | 'bank_transfer' | 'jazzcash' | 'easypaisa';
  reference_no?: string;
  due_date?: string;
  notes?: string;
  sale_date?: string;
  shop_name?: string;
  customer_address?: string;
  items: OfflineSaleItem[];
  created_at: string;
  synced: boolean;
}

const DB_NAME = 'ub_pos_offline_db';
const DB_VERSION = 1;
const STORE_QUEUE = 'sales_queue';
const STORE_CACHE = 'catalog_cache';

const inMemoryCache = new Map<string, any>();

// Initialize IndexedDB safely
export function initIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB unavailable in this environment'));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Queue an offline sale
export async function enqueueOfflineSale(sale: OfflineSalePayload): Promise<void> {
  try {
    const db = await initIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, 'readwrite');
      const store = tx.objectStore(STORE_QUEUE);
      const req = store.put(sale);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    inMemoryCache.set(`queue_${sale.id}`, sale);
  }
}

// Get all pending offline sales
export async function getPendingQueue(): Promise<OfflineSalePayload[]> {
  try {
    const db = await initIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, 'readonly');
      const store = tx.objectStore(STORE_QUEUE);
      const req = store.getAll();
      req.onsuccess = () => {
        const all = (req.result as OfflineSalePayload[]) || [];
        resolve(all.filter(item => !item.synced));
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    const list: OfflineSalePayload[] = [];
    for (const [k, v] of inMemoryCache.entries()) {
      if (k.startsWith('queue_') && !v.synced) list.push(v);
    }
    return list;
  }
}

// Remove or mark synced in IndexedDB
export async function removeQueueItem(id: string): Promise<void> {
  try {
    const db = await initIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, 'readwrite');
      const store = tx.objectStore(STORE_QUEUE);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    inMemoryCache.delete(`queue_${id}`);
  }
}

// Cache generic data locally (customers, products catalog)
export async function setLocalCache(key: string, data: unknown): Promise<void> {
  try {
    const db = await initIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHE, 'readwrite');
      const store = tx.objectStore(STORE_CACHE);
      const req = store.put({ key, value: data, timestamp: new Date().toISOString() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    inMemoryCache.set(key, data);
  }
}

// Retrieve cached generic data
export async function getLocalCache<T>(key: string): Promise<T | null> {
  try {
    const db = await initIndexedDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_CACHE, 'readonly');
      const store = tx.objectStore(STORE_CACHE);
      const req = store.get(key);
      req.onsuccess = () => {
        resolve(req.result ? (req.result.value as T) : (inMemoryCache.get(key) as T) || null);
      };
      req.onerror = () => resolve((inMemoryCache.get(key) as T) || null);
    });
  } catch {
    return (inMemoryCache.get(key) as T) || null;
  }
}
