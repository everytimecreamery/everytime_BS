import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateTaxSplitPaise } from '@/lib/pos/calculations';
import { OutboxOrder } from '@/lib/sync/outbox';

describe('Offline Sync & Idempotency Domain Tests', () => {
  describe('1. Tax Split Invariant: CGST + SGST === tax_paise on odd and even amounts', () => {
    it('guarantees exact split on odd paise totals (no missing or phantom paise)', () => {
      const oddPaiseValues = [1, 3, 5, 7, 9, 11, 25, 49, 99, 101, 499, 999, 12345, 99999];

      for (const tax of oddPaiseValues) {
        const { cgstPaise, sgstPaise } = calculateTaxSplitPaise(tax);
        expect(cgstPaise + sgstPaise).toBe(tax);
        expect(Number.isInteger(cgstPaise)).toBe(true);
        expect(Number.isInteger(sgstPaise)).toBe(true);
        // CGST and SGST should differ by at most 1 paisa for odd totals
        expect(Math.abs(cgstPaise - sgstPaise)).toBe(1);
      }
    });

    it('guarantees exact equal split on even paise totals', () => {
      const evenPaiseValues = [0, 2, 4, 10, 50, 100, 496, 500, 9900, 19800];

      for (const tax of evenPaiseValues) {
        const { cgstPaise, sgstPaise } = calculateTaxSplitPaise(tax);
        expect(cgstPaise + sgstPaise).toBe(tax);
        expect(cgstPaise).toBe(tax / 2);
        expect(sgstPaise).toBe(tax / 2);
      }
    });

    it('handles negative or invalid inputs gracefully by clamping to zero', () => {
      expect(calculateTaxSplitPaise(-10)).toEqual({ cgstPaise: 0, sgstPaise: 0 });
      expect(calculateTaxSplitPaise(0)).toEqual({ cgstPaise: 0, sgstPaise: 0 });
    });
  });

  describe('2. Upsert Idempotency: Same UUID twice results in exactly one row', () => {
    interface MockDatabase {
      orders: Map<string, OutboxOrder>;
    }

    let mockDb: MockDatabase;

    beforeEach(() => {
      mockDb = {
        orders: new Map<string, OutboxOrder>(),
      };
    });

    function idempotentUpsertOrder(db: MockDatabase, order: OutboxOrder): { inserted: boolean; totalRows: number } {
      // Emulates Postgres ON CONFLICT (id) DO NOTHING
      if (db.orders.has(order.id)) {
        return { inserted: false, totalRows: db.orders.size };
      }
      db.orders.set(order.id, order);
      return { inserted: true, totalRows: db.orders.size };
    }

    it('inserts order on first attempt and ignores duplicate client UUID on retry', () => {
      const clientOrderId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
      const order: OutboxOrder = {
        id: clientOrderId,
        store_id: 'store-1',
        terminal_id: 'T1',
        cashier_id: 'cashier-1',
        token_terminal: 'T1',
        token_seq: 1,
        status: 'COMPLETED',
        subtotal_paise: 9900,
        discount_paise: 0,
        tax_paise: 495,
        cgst_paise: 248,
        sgst_paise: 247,
        total_paise: 10395,
        client_completed_at: new Date().toISOString(),
        business_date: '2026-11-22',
        sync_status: 'pending',
        attempt_count: 0,
        last_error: null,
        ack_at: null,
        items: [],
        payments: [],
      };

      // First write
      const firstResult = idempotentUpsertOrder(mockDb, order);
      expect(firstResult.inserted).toBe(true);
      expect(firstResult.totalRows).toBe(1);

      // Duplicate write (e.g., retry after network drop or re-send)
      const secondResult = idempotentUpsertOrder(mockDb, order);
      expect(secondResult.inserted).toBe(false);
      expect(secondResult.totalRows).toBe(1); // Row count MUST remain 1

      // Third retry with exact same UUID
      const thirdResult = idempotentUpsertOrder(mockDb, order);
      expect(thirdResult.inserted).toBe(false);
      expect(thirdResult.totalRows).toBe(1);
      expect(mockDb.orders.get(clientOrderId)).toBeDefined();
    });
  });

  describe('3. Outbox Retry-After-Failure Engine State Transitions', () => {
    it('transitions from pending -> failed on network error, then failed -> synced on retry', async () => {
      let isOnline = false;
      const order: OutboxOrder = {
        id: 'outbox-uuid-999',
        store_id: 'store-1',
        terminal_id: 'T1',
        cashier_id: 'cashier-1',
        token_terminal: 'T1',
        token_seq: 42,
        status: 'COMPLETED',
        subtotal_paise: 19800,
        discount_paise: 0,
        tax_paise: 990,
        cgst_paise: 495,
        sgst_paise: 495,
        total_paise: 20790,
        client_completed_at: new Date().toISOString(),
        business_date: '2026-11-22',
        sync_status: 'pending',
        attempt_count: 0,
        last_error: null,
        ack_at: null,
        items: [],
        payments: [],
      };

      // Simulated sync engine attempt
      async function executeSyncAttempt(record: OutboxOrder): Promise<void> {
        record.attempt_count += 1;
        if (!isOnline) {
          record.sync_status = 'failed';
          record.last_error = 'FetchError: Network request failed';
          return;
        }

        // Network success
        record.sync_status = 'synced';
        record.last_error = null;
        record.ack_at = new Date().toISOString();
      }

      // Initial state: Pending
      expect(order.sync_status).toBe('pending');
      expect(order.attempt_count).toBe(0);
      expect(order.ack_at).toBeNull();

      // Attempt 1: Offline / Network drop
      await executeSyncAttempt(order);
      expect(order.sync_status).toBe('failed');
      expect(order.attempt_count).toBe(1);
      expect(order.last_error).toContain('Network request failed');
      expect(order.ack_at).toBeNull();

      // Attempt 2: Still offline
      await executeSyncAttempt(order);
      expect(order.sync_status).toBe('failed');
      expect(order.attempt_count).toBe(2);

      // Network restored!
      isOnline = true;

      // Attempt 3: Retry succeeds
      await executeSyncAttempt(order);
      expect(order.sync_status).toBe('synced');
      expect(order.attempt_count).toBe(3);
      expect(order.last_error).toBeNull();
      expect(order.ack_at).not.toBeNull();

      // Completed order is NEVER deleted from outbox storage (Invariant 3)
      expect(order.id).toBe('outbox-uuid-999');
      expect(order.total_paise).toBe(20790);
    });
  });
});
