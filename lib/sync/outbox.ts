/**
 * Everytime Creamery — Offline-First Sync Outbox & Storage Engine
 * Phase 3 Implementation
 *
 * Replaces localStorage with IndexedDB 'orders_outbox_v1' and 'active_tickets_v1'.
 * Guaranteed idempotent write path: writes locally FIRST, syncs in background.
 * Client-generated UUIDs ensure retries never duplicate orders on the server.
 */

import { supabase } from '@/lib/supabase/client';

export type SyncStatus = 'pending' | 'synced' | 'failed';

export interface OutboxOrderItem {
  id: string; // client UUID
  order_id: string;
  menu_item_id?: string | null;
  product_name: string;
  variant_label?: string | null;
  addon_label?: string | null;
  quantity: number;
  unit_price_paise: number;
  addon_price_paise: number;
  total_price_paise: number;
}

export interface OutboxPayment {
  id: string; // client UUID
  order_id: string;
  method: 'cash' | 'upi' | 'card';
  amount_paise: number;
  upi_utr?: string | null;
  created_at: string;
}

export interface OutboxOrder {
  id: string; // client UUID
  store_id: string;
  terminal_id: string;
  cashier_id: string;
  shift_id?: string | null;
  token_terminal: string; // e.g. 'T1'
  token_seq: number;       // e.g. 1
  status: 'COMPLETED';
  subtotal_paise: number;
  discount_paise: number;
  discount_type?: 'PERCENTAGE' | 'FLAT' | null;
  discount_reason?: string | null;
  discount_approved_by?: string | null;
  tax_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  total_paise: number;
  client_completed_at: string; // ISO timestamptz
  server_received_at?: string;
  business_date: string;       // YYYY-MM-DD

  // Outbox Tracking
  sync_status: SyncStatus;
  attempt_count: number;
  last_error: string | null;
  ack_at: string | null;

  // Joined locally for full offline receipt & history viewing
  items: OutboxOrderItem[];
  payments: OutboxPayment[];
}

export interface ActiveTicketsCache {
  id: string;
  activeOrderId: string;
  tickets: any[];
  updatedAt: string;
}

const DB_NAME = 'everytime_creamery_db';
const DB_VERSION = 1;
const OUTBOX_STORE = 'orders_outbox_v1';
const ACTIVE_TICKETS_STORE = 'active_tickets_v1';
const CONFIG_CACHE_STORE = 'config_cache_v1';
const LOCALSTORAGE_HISTORY_KEY = 'everytime_creamery_order_history_v1';
const LOCALSTORAGE_MIGRATED_KEY = 'everytime_creamery_ls_migrated_v1';

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not available in this environment.'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        const outboxStore = db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
        outboxStore.createIndex('sync_status', 'sync_status', { unique: false });
        outboxStore.createIndex('client_completed_at', 'client_completed_at', { unique: false });
        outboxStore.createIndex('business_date', 'business_date', { unique: false });
      }

      if (!db.objectStoreNames.contains(ACTIVE_TICKETS_STORE)) {
        db.createObjectStore(ACTIVE_TICKETS_STORE, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(CONFIG_CACHE_STORE)) {
        db.createObjectStore(CONFIG_CACHE_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 1. SAVE COMPLETED ORDER LOCALLY (MANDATORY FIRST STEP)
 * Never depends on internet connectivity. Guarantees zero order loss.
 */
export async function saveCompletedOrderToOutbox(
  order: Omit<OutboxOrder, 'sync_status' | 'attempt_count' | 'last_error' | 'ack_at'>
): Promise<OutboxOrder> {
  const db = await openDB();

  const record: OutboxOrder = {
    ...order,
    sync_status: 'pending',
    attempt_count: 0,
    last_error: null,
    ack_at: null,
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([OUTBOX_STORE], 'readwrite');
    const store = tx.objectStore(OUTBOX_STORE);
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  // Attempt background sync immediately without blocking the counter
  triggerSync();

  return record;
}

/**
 * 2. SYNC ENGINE: IDEMPOTENT BACKGROUND WORKER
 * Safe retries using client UUIDs and ON CONFLICT DO NOTHING semantics.
 */
let isSyncing = false;

export async function triggerSync(): Promise<{ syncedCount: number; errors: string[] }> {
  if (isSyncing) return { syncedCount: 0, errors: [] };
  if (typeof window !== 'undefined' && !navigator.onLine) {
    return { syncedCount: 0, errors: ['Terminal is currently offline.'] };
  }

  isSyncing = true;
  const errors: string[] = [];
  let syncedCount = 0;

  try {
    const db = await openDB();
    const pendingOrders: OutboxOrder[] = await new Promise((resolve, reject) => {
      const tx = db.transaction([OUTBOX_STORE], 'readonly');
      const store = tx.objectStore(OUTBOX_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const all: OutboxOrder[] = req.result || [];
        resolve(all.filter((o) => o.sync_status === 'pending' || o.sync_status === 'failed'));
      };
      req.onerror = () => reject(req.error);
    });

    for (const order of pendingOrders) {
      try {
        // 1. Insert order with ON CONFLICT (id) DO NOTHING
        const { error: orderError } = await supabase
          .from('orders')
          .upsert(
            {
              id: order.id,
              store_id: order.store_id,
              terminal_id: order.terminal_id,
              cashier_id: order.cashier_id,
              shift_id: order.shift_id || null,
              token_terminal: order.token_terminal,
              token_seq: order.token_seq,
              status: 'COMPLETED',
              subtotal_paise: order.subtotal_paise,
              discount_paise: order.discount_paise,
              discount_type: order.discount_type || null,
              discount_reason: order.discount_reason || null,
              discount_approved_by: order.discount_approved_by || null,
              tax_paise: order.tax_paise,
              cgst_paise: order.cgst_paise,
              sgst_paise: order.sgst_paise,
              total_paise: order.total_paise,
              client_completed_at: order.client_completed_at,
              business_date: order.business_date,
            },
            { onConflict: 'id', ignoreDuplicates: true }
          );

        if (orderError) throw orderError;

        // 2. Insert order items
        if (order.items && order.items.length > 0) {
          const itemPayload = order.items.map((it) => ({
            id: it.id,
            order_id: order.id,
            menu_item_id: it.menu_item_id || null,
            product_name: it.product_name,
            variant_label: it.variant_label || null,
            addon_label: it.addon_label || null,
            quantity: it.quantity,
            unit_price_paise: it.unit_price_paise,
            addon_price_paise: it.addon_price_paise,
            total_price_paise: it.total_price_paise,
          }));

          const { error: itemsError } = await supabase
            .from('order_items')
            .upsert(itemPayload, { onConflict: 'id', ignoreDuplicates: true });

          if (itemsError) throw itemsError;
        }

        // 3. Insert payments
        if (order.payments && order.payments.length > 0) {
          const paymentPayload = order.payments.map((p) => ({
            id: p.id,
            order_id: order.id,
            method: p.method,
            amount_paise: p.amount_paise,
            upi_utr: p.upi_utr || null,
            created_at: p.created_at,
          }));

          const { error: payError } = await supabase
            .from('payments')
            .upsert(paymentPayload, { onConflict: 'id', ignoreDuplicates: true });

          if (payError) throw payError;
        }

        // 4. Mark synced locally. NEVER DELETE LOCAL COPY.
        const ackAt = new Date().toISOString();
        await updateOutboxStatus(order.id, 'synced', null, ackAt);
        syncedCount++;
      } catch (err: any) {
        const message = err?.message || 'Sync failed';
        errors.push(`Order ${order.token_terminal}-${order.token_seq}: ${message}`);
        await updateOutboxStatus(order.id, 'failed', message, null);
      }
    }
  } catch (err: any) {
    errors.push(err?.message || 'Database outbox error');
  } finally {
    isSyncing = false;
  }

  return { syncedCount, errors };
}

async function updateOutboxStatus(
  id: string,
  status: SyncStatus,
  error: string | null,
  ackAt: string | null
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([OUTBOX_STORE], 'readwrite');
    const store = tx.objectStore(OUTBOX_STORE);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const existing: OutboxOrder = getReq.result;
      if (!existing) return resolve();

      existing.sync_status = status;
      existing.attempt_count = (existing.attempt_count || 0) + 1;
      existing.last_error = error;
      if (ackAt) existing.ack_at = ackAt;

      const putReq = store.put(existing);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };

    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * 3. READ HISTORICAL COMPLETED ORDERS FROM INDEXEDDB
 */
export async function getCompletedOrdersFromOutbox(): Promise<OutboxOrder[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([OUTBOX_STORE], 'readonly');
      const store = tx.objectStore(OUTBOX_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const list: OutboxOrder[] = req.result || [];
        // Sort newest first
        list.sort(
          (a, b) =>
            new Date(b.client_completed_at).getTime() -
            new Date(a.client_completed_at).getTime()
        );
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/**
 * 4. ONE-TIME MIGRATION FROM LOCALSTORAGE TO INDEXEDDB
 */
export async function migrateLegacyLocalStorageOrders(): Promise<number> {
  if (typeof window === 'undefined') return 0;
  if (window.localStorage.getItem(LOCALSTORAGE_MIGRATED_KEY) === 'true') return 0;

  try {
    const raw = window.localStorage.getItem(LOCALSTORAGE_HISTORY_KEY);
    if (!raw) {
      window.localStorage.setItem(LOCALSTORAGE_MIGRATED_KEY, 'true');
      return 0;
    }

    const legacyList = JSON.parse(raw);
    if (!Array.isArray(legacyList) || legacyList.length === 0) {
      window.localStorage.setItem(LOCALSTORAGE_MIGRATED_KEY, 'true');
      return 0;
    }

    const defaultStoreId = '00000000-0000-0000-0000-000000000001';
    const defaultTerminalId = '00000000-0000-0000-0000-000000000002';
    const defaultCashierId = '00000000-0000-0000-0000-000000000003';

    let migrated = 0;
    for (let i = 0; i < legacyList.length; i++) {
      const leg = legacyList[i];
      const orderId = leg.id && leg.id.length === 36 ? leg.id : generateUUID();
      const completedAt = leg.completedAt || leg.createdAt || new Date().toISOString();
      const bDate = completedAt.split('T')[0];

      const outboxItems: OutboxOrderItem[] = (leg.items || []).map((it: any) => ({
        id: generateUUID(),
        order_id: orderId,
        menu_item_id: it.productId || null,
        product_name: it.productName || 'Item',
        variant_label: it.variantLabel || null,
        addon_label: it.addOnLabel || null,
        quantity: it.quantity || 1,
        unit_price_paise: it.unitPricePaise || 0,
        addon_price_paise: 0,
        total_price_paise: it.totalPricePaise || (it.unitPricePaise * (it.quantity || 1)),
      }));

      const outboxPayments: OutboxPayment[] = [
        {
          id: generateUUID(),
          order_id: orderId,
          method: (leg.paymentMethod?.toLowerCase() || 'cash') as any,
          amount_paise: leg.totalPayablePaise || leg.totalPaise || 0,
          created_at: completedAt,
        },
      ];

      const taxPaise = leg.taxPreviewPaise || 0;
      const cgstPaise = Math.round(taxPaise / 2);
      const sgstPaise = taxPaise - cgstPaise;

      await saveCompletedOrderToOutbox({
        id: orderId,
        store_id: defaultStoreId,
        terminal_id: defaultTerminalId,
        cashier_id: defaultCashierId,
        token_terminal: 'T1',
        token_seq: i + 1,
        status: 'COMPLETED',
        subtotal_paise: leg.subtotalPaise || 0,
        discount_paise: leg.discountPaise || 0,
        discount_type: leg.discount?.type || null,
        discount_reason: leg.discount?.reason || null,
        tax_paise: taxPaise,
        cgst_paise: cgstPaise,
        sgst_paise: sgstPaise,
        total_paise: leg.totalPayablePaise || leg.totalPaise || 0,
        client_completed_at: completedAt,
        business_date: bDate,
        items: outboxItems,
        payments: outboxPayments,
      });
      migrated++;
    }

    window.localStorage.setItem(LOCALSTORAGE_MIGRATED_KEY, 'true');
    return migrated;
  } catch (err) {
    console.warn('Failed to migrate legacy localStorage orders:', err);
    return 0;
  }
}

/**
 * 5. PERSIST ACTIVE (PROCESSING) TICKETS ON EVERY MUTATION
 * Ensures page reload never loses ongoing customer orders.
 */
export async function persistActiveTickets(
  tickets: any[],
  activeOrderId: string
): Promise<void> {
  try {
    const db = await openDB();
    const payload: ActiveTicketsCache = {
      id: 'active_session',
      activeOrderId,
      tickets,
      updatedAt: new Date().toISOString(),
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([ACTIVE_TICKETS_STORE], 'readwrite');
      const store = tx.objectStore(ACTIVE_TICKETS_STORE);
      const req = store.put(payload);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not persist active tickets to IndexedDB:', err);
  }
}

export async function loadActiveTickets(): Promise<ActiveTicketsCache | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction([ACTIVE_TICKETS_STORE], 'readonly');
      const store = tx.objectStore(ACTIVE_TICKETS_STORE);
      const req = store.get('active_session');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * 6. REGISTER BACKGROUND SYNC LISTENERS
 */
export function initBackgroundSyncWorker(): () => void {
  if (typeof window === 'undefined') return () => {};

  // Trigger migration from legacy localStorage once on boot
  migrateLegacyLocalStorageOrders().catch(() => {});

  // Trigger sync on boot
  triggerSync().catch(() => {});

  const handleOnline = () => {
    triggerSync().catch(() => {});
  };

  window.addEventListener('online', handleOnline);

  // Periodic retry interval (every 20 seconds)
  const intervalId = window.setInterval(() => {
    triggerSync().catch(() => {});
  }, 20_000);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.clearInterval(intervalId);
  };
}
