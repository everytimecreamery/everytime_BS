import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  saveMenuItemAction,
  deleteMenuItemAction,
  saveCategoryAction,
} from '@/app/actions/menu';
import {
  updateOrderAction,
  deleteOrderAction,
  submitOrderAction,
  correctPaymentMethodAction,
} from '@/app/actions/orders';

// Mock cookies
const mockCookieStore = {
  getAll: vi.fn().mockReturnValue([]),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

// Mock Supabase Server Client
const mockGetUser = vi.fn();
const mockProfileMaybeSingle = vi.fn();
const mockFrom = vi.fn();
const mockRpc = vi.fn();

const mockServerSupabase = {
  auth: {
    getUser: mockGetUser,
  },
  from: mockFrom,
  rpc: mockRpc,
};

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(() => mockServerSupabase),
}));

describe('Phase 2: Protected Server Actions Authorization Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: mockProfileMaybeSingle,
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ error: null }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
    });
  });

  describe('1. Owner-Only Menu Actions', () => {
    it('blocks unauthenticated user from creating or saving menu item', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

      const result = await saveMenuItemAction({
        name: 'Dark Chocolate Gelato',
        category_id: 'gelato',
        base_price_paise: 9900,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/authentication required/i);
    });

    it('blocks staff user from modifying menu items or prices', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'staff-id' } },
        error: null,
      });
      mockProfileMaybeSingle.mockResolvedValueOnce({
        data: { id: 'staff-id', role: 'staff', full_name: 'Cashier Staff' },
        error: null,
      });

      const result = await saveMenuItemAction({
        name: 'Hacked Price Item',
        category_id: 'gelato',
        base_price_paise: 100, // 1 rupee!
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/forbidden/i);
    });

    it('blocks staff user from deleting menu items', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'staff-id' } },
        error: null,
      });
      mockProfileMaybeSingle.mockResolvedValueOnce({
        data: { id: 'staff-id', role: 'staff', full_name: 'Cashier Staff' },
        error: null,
      });

      const result = await deleteMenuItemAction('gelato-item-1');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/forbidden/i);
    });

    it('allows owner user to create or update menu item', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'owner-id' } },
        error: null,
      });
      mockProfileMaybeSingle.mockResolvedValueOnce({
        data: { id: 'owner-id', role: 'owner', full_name: 'Store Owner' },
        error: null,
      });

      const result = await saveMenuItemAction({
        name: 'Pistachio Gelato',
        category_id: 'gelato',
        base_price_paise: 12900,
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('2. Owner-Only Order Actions', () => {
    it('blocks staff user from updating or overriding an existing order in database', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'staff-id' } },
        error: null,
      });
      mockProfileMaybeSingle.mockResolvedValueOnce({
        data: { id: 'staff-id', role: 'staff', full_name: 'Cashier Staff' },
        error: null,
      });

      const result = await updateOrderAction('order-123', {
        status: 'VOID',
        discount_paise: 5000,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/forbidden/i);
    });

    it('blocks staff user from deleting an order in database', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'staff-id' } },
        error: null,
      });
      mockProfileMaybeSingle.mockResolvedValueOnce({
        data: { id: 'staff-id', role: 'staff', full_name: 'Cashier Staff' },
        error: null,
      });

      const result = await deleteOrderAction('order-123');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/forbidden/i);
    });

    it('allows owner user to update order', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'owner-id' } },
        error: null,
      });
      mockProfileMaybeSingle.mockResolvedValueOnce({
        data: { id: 'owner-id', role: 'owner', full_name: 'Store Owner' },
        error: null,
      });

      const result = await updateOrderAction('order-123', {
        status: 'COMPLETED',
      });

      expect(result.success).toBe(true);
    });

    it('rejects owner deleting orders to preserve financial audit records', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'owner-id' } },
        error: null,
      });
      mockProfileMaybeSingle.mockResolvedValueOnce({
        data: { id: 'owner-id', role: 'owner', full_name: 'Store Owner' },
        error: null,
      });

      const result = await deleteOrderAction('order-123');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/cannot be deleted/i);
    });

    it('rejects REFUNDED status transitions and cancellation without reason', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'owner-id' } },
        error: null,
      });
      mockProfileMaybeSingle.mockResolvedValue({
        data: { id: 'owner-id', role: 'owner', full_name: 'Store Owner' },
        error: null,
      });

      const refundRes = await updateOrderAction('order-123', {
        status: 'REFUNDED' as any,
      });
      expect(refundRes.success).toBe(false);
      expect(refundRes.error).toMatch(/not supported/i);

      const cancelNoReason = await updateOrderAction('order-123', {
        status: 'CANCELLED',
      });
      expect(cancelNoReason.success).toBe(false);
      expect(cancelNoReason.error).toMatch(/reason is mandatory/i);
    });
  });

  describe('4. Controlled Payment Method Correction Action', () => {
    it('blocks staff user from correcting payment method', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'staff-id' } },
        error: null,
      });
      mockProfileMaybeSingle.mockResolvedValueOnce({
        data: { id: 'staff-id', role: 'staff', full_name: 'Cashier Staff' },
        error: null,
      });

      const result = await correctPaymentMethodAction({
        paymentId: 'pay-1',
        newMethod: 'card',
        reason: 'Staff override attempt',
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/forbidden/i);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('rejects missing or blank correction reason', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'owner-id' } },
        error: null,
      });
      mockProfileMaybeSingle.mockResolvedValueOnce({
        data: { id: 'owner-id', role: 'owner', full_name: 'Store Owner' },
        error: null,
      });

      const result = await correctPaymentMethodAction({
        paymentId: 'pay-1',
        newMethod: 'upi',
        reason: '   ',
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/reason is mandatory/i);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('invokes correct_payment_method RPC for authenticated owner with valid reason', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'owner-id' } },
        error: null,
      });
      mockProfileMaybeSingle.mockResolvedValueOnce({
        data: { id: 'owner-id', role: 'owner', full_name: 'Store Owner' },
        error: null,
      });
      mockRpc.mockResolvedValueOnce({
        data: { id: 'corr-1', previous_method: 'cash', new_method: 'card' },
        error: null,
      });

      const result = await correctPaymentMethodAction({
        paymentId: 'pay-1',
        newMethod: 'card',
        reason: 'Customer paid by card at counter',
      });
      expect(result.success).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('correct_payment_method', {
        p_payment_id: 'pay-1',
        p_new_method: 'card',
        p_reason: 'Customer paid by card at counter',
      });
    });
  });

  describe('3. Staff Permitted Order Submission', () => {
    it('blocks unauthenticated user from submitting counter orders', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

      const result = await submitOrderAction({
        order: {
          id: 'order-123',
          token: 'T1-001',
          subtotalPaise: 20000,
          totalPaise: 21000,
          taxPreviewPaise: 1000,
          items: [],
        } as any,
        method: 'CASH',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/authentication required/i);
    });

    it('allows staff user to submit counter orders via complete_pos_checkout RPC', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'staff-id' } },
        error: null,
      });
      mockProfileMaybeSingle.mockResolvedValueOnce({
        data: { id: 'staff-id', role: 'staff', store_id: 'store-1', full_name: 'Cashier Staff' },
        error: null,
      });
      mockRpc.mockResolvedValueOnce({
        data: { order_id: 'order-123', cashier_id: 'staff-id', total_paise: 20790 },
        error: null,
      });

      const result = await submitOrderAction({
        order: {
          id: 'order-123',
          token: 'T1-001',
          subtotalPaise: 19800,
          totalPaise: 20790,
          taxPreviewPaise: 990,
          discount: { type: 'none', percent: 0 },
          items: [
            {
              lineId: 'line-1',
              productId: 'gelato-madagascar-vanilla',
              productName: 'Madagascar Vanilla',
              unitPricePaise: 9900,
              quantity: 2,
              lineTotalPaise: 19800,
            },
          ],
        } as any,
        method: 'CASH',
      });

      expect(result.success).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith(
        'complete_pos_checkout',
        expect.objectContaining({
          p_order_id: 'order-123',
          p_cashier_id: 'staff-id',
          p_expected_subtotal_paise: 19800,
          p_expected_total_paise: 20790,
        })
      );
    });

    it('rejects empty order items, cashier impersonation, and split-payment mismatches', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'staff-id' } },
        error: null,
      });
      mockProfileMaybeSingle.mockResolvedValue({
        data: { id: 'staff-id', role: 'staff', store_id: 'store-1', full_name: 'Cashier Staff' },
        error: null,
      });

      // 1. Empty items rejected
      const emptyRes = await submitOrderAction({
        order: {
          id: 'order-empty',
          token: 'T1-002',
          subtotalPaise: 0,
          totalPaise: 0,
          taxPreviewPaise: 0,
          items: [],
        } as any,
        method: 'CASH',
      });
      expect(emptyRes.success).toBe(false);
      expect(emptyRes.error).toMatch(/at least one order item/i);

      // 2. Cashier impersonation rejected
      const impersonateRes = await submitOrderAction({
        order: {
          id: 'order-imp',
          token: 'T1-003',
          subtotalPaise: 9900,
          totalPaise: 10395,
          taxPreviewPaise: 495,
          items: [
            {
              lineId: 'l1',
              productId: 'gelato-madagascar-vanilla',
              productName: 'Madagascar Vanilla',
              unitPricePaise: 9900,
              quantity: 1,
              lineTotalPaise: 9900,
            },
          ],
        } as any,
        method: 'CASH',
        cashierId: 'other-cashier-id',
      });
      expect(impersonateRes.success).toBe(false);
      expect(impersonateRes.error).toMatch(/impersonation/i);

      // 3. Split-payment mismatch rejected before RPC
      const splitMismatchRes = await submitOrderAction({
        order: {
          id: 'order-split-bad',
          token: 'T1-004',
          subtotalPaise: 9900,
          totalPaise: 10395,
          taxPreviewPaise: 495,
          items: [
            {
              lineId: 'l1',
              productId: 'gelato-madagascar-vanilla',
              productName: 'Madagascar Vanilla',
              unitPricePaise: 9900,
              quantity: 1,
              lineTotalPaise: 9900,
            },
          ],
        } as any,
        method: 'CASH',
        payments: [
          { method: 'CASH', amountPaise: 5000 },
          { method: 'UPI', amountPaise: 5000 },
        ],
      });
      expect(splitMismatchRes.success).toBe(false);
      expect(splitMismatchRes.error).toMatch(/does not match order total/i);
      expect(mockRpc).not.toHaveBeenCalled();

      // 4. Valid split payment invokes RPC with normalized tenders
      mockRpc.mockResolvedValueOnce({
        data: { order_id: 'order-split-ok', total_paise: 10395 },
        error: null,
      });
      const splitOkRes = await submitOrderAction({
        order: {
          id: 'order-split-ok',
          token: 'T1-005',
          subtotalPaise: 9900,
          totalPaise: 10395,
          taxPreviewPaise: 495,
          items: [
            {
              lineId: 'l1',
              productId: 'gelato-madagascar-vanilla',
              productName: 'Madagascar Vanilla',
              unitPricePaise: 9900,
              quantity: 1,
              lineTotalPaise: 9900,
            },
          ],
        } as any,
        method: 'CASH',
        payments: [
          { method: 'CASH', amountPaise: 5395 },
          { method: 'UPI', amountPaise: 5000 },
        ],
      });
      expect(splitOkRes.success).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith(
        'complete_pos_checkout',
        expect.objectContaining({
          p_payments: [
            { method: 'cash', amount_paise: 5395, upi_utr: null },
            { method: 'upi', amount_paise: 5000, upi_utr: null },
          ],
        })
      );
    });
  });
});
