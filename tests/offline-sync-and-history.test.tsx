import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const mockPushOrderToDatabase = vi.fn();
const mockFetchOrdersFromDatabaseWithStatus = vi.fn();

vi.mock('@/lib/supabase/client', () => {
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  };
  return {
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: null, error: { message: 'offline in test' } }),
          }),
        }),
      })),
      channel: vi.fn(() => mockChannel),
      removeChannel: vi.fn(),
    },
  };
});

vi.mock('@/lib/supabase/orders', async () => {
  const actual = await vi.importActual<typeof import('@/lib/supabase/orders')>('@/lib/supabase/orders');
  return {
    ...actual,
    pushOrderToDatabase: (...args: any[]) => mockPushOrderToDatabase(...args),
    fetchOrdersFromDatabaseWithStatus: (...args: any[]) => mockFetchOrdersFromDatabaseWithStatus(...args),
    fetchOrdersFromDatabase: async () => {
      const res = await mockFetchOrdersFromDatabaseWithStatus();
      return res.orders || [];
    },
  };
});

import { StaffPOSWorkspace } from '@/components/staff/pos/StaffPOSWorkspace';
import {
  clearOrderHistory,
  loadOrderHistory,
  addOrderToHistory,
  mergeDatabaseAndLocalOrders,
} from '@/lib/pos/orderHistory';
import {
  resetSessionTokenCounter,
  createNewPosOrder,
  addItemToOrder,
  completeOrderPayment,
  PosOrder,
} from '@/lib/pos/order';
import {
  reconcileCartItemsWithCatalog,
  CACHED_MENU_CATALOG_KEY,
} from '@/lib/pos/menuCatalog';
import type { MenuItem } from '@/lib/mock/menu';

describe('Offline POS Reconciliation, Local Order History & Cloud Sync Recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearOrderHistory();
    localStorage.clear();
    resetSessionTokenCounter(1);
    mockFetchOrdersFromDatabaseWithStatus.mockResolvedValue({ orders: [] });
  });

  afterEach(() => {
    clearOrderHistory();
    localStorage.clear();
  });

  describe('1. Menu ID Reconciliation & Price Authority', () => {
    const authoritativeCatalog: MenuItem[] = [
      {
        id: 'sundae-hot-choc-fudge',
        name: 'Hot Chocolate Fudge',
        categoryId: 'sundaes',
        basePricePaise: 15900, // Authoritative DB price updated from 14900 -> 15900
        interactionType: 'direct',
        isAvailable: true,
        isArchived: false,
      },
      {
        id: 'tub-classic-vanilla',
        name: 'Classic Vanilla Tub',
        categoryId: 'tubs',
        basePricePaise: 17900,
        interactionType: 'gelato_sizes',
        isAvailable: true,
        isArchived: false,
        variants: [
          { id: 'tub-classic-vanilla-250', label: '250ml', pricePaise: 17900 },
          { id: 'tub-classic-vanilla-500', label: '500ml', pricePaise: 33900 },
        ],
      },
      {
        id: 'gelato-madagascar-vanilla',
        name: 'Madagascar Vanilla',
        categoryId: 'gelato',
        basePricePaise: 9900,
        interactionType: 'direct',
        isAvailable: true,
        isArchived: false,
      },
      {
        id: 'extra-wafer-cone',
        name: 'Wafer Cone',
        categoryId: 'extra',
        basePricePaise: 1500,
        interactionType: 'direct',
        isAvailable: false, // Sold out in DB
        isArchived: false,
      },
    ];

    it('reconciles verified legacy mock aliases to DB IDs and adopts authoritative DB prices (never trusts offline prices)', () => {
      const offlineItems = [
        {
          lineId: 'sundae-hot-chocolate-fudge::var=default::addon=none',
          productId: 'sundae-hot-chocolate-fudge',
          productName: 'Hot Chocolate Fudge',
          unitPricePaise: 14900, // Stale offline price
          quantity: 2,
          lineTotalPaise: 29800,
        },
        {
          lineId: 'gelato-classic-vanilla::var=250ml::addon=none',
          productId: 'gelato-classic-vanilla',
          productName: 'Classic Vanilla',
          variantId: '250ml',
          variantLabel: '250ml',
          unitPricePaise: 16900, // Stale offline price
          quantity: 1,
          lineTotalPaise: 16900,
        },
      ];

      const result = reconcileCartItemsWithCatalog(offlineItems, authoritativeCatalog);

      expect(result.unresolvedItems).toHaveLength(0);
      expect(result.changed).toBe(true);
      expect(result.reconciledItems).toHaveLength(2);

      // Reconciled Sundae adopts DB ID and DB price (15900)
      expect(result.reconciledItems[0].productId).toBe('sundae-hot-choc-fudge');
      expect(result.reconciledItems[0].unitPricePaise).toBe(15900);
      expect(result.reconciledItems[0].lineTotalPaise).toBe(31800);

      // Reconciled Tub adopts DB ID, variant ID, and DB price (17900)
      expect(result.reconciledItems[1].productId).toBe('tub-classic-vanilla');
      expect(result.reconciledItems[1].variantId).toBe('tub-classic-vanilla-250');
      expect(result.reconciledItems[1].unitPricePaise).toBe(17900);
    });

    it('never silently substitutes unrelated menu items and flags unavailable items as unresolved', () => {
      const offlineItems = [
        {
          lineId: 'gelato-tender-coconut::var=85ml::addon=none',
          productId: 'gelato-tender-coconut',
          productName: 'Tender Coconut',
          variantId: '85ml',
          variantLabel: '85ml',
          unitPricePaise: 16900,
          quantity: 1,
          lineTotalPaise: 16900,
        },
        {
          lineId: 'extra-wafer-cone::var=default::addon=none',
          productId: 'extra-wafer-cone',
          productName: 'Wafer Cone',
          unitPricePaise: 1500,
          quantity: 1,
          lineTotalPaise: 1500,
        },
      ];

      const result = reconcileCartItemsWithCatalog(offlineItems, authoritativeCatalog);

      expect(result.reconciledItems).toHaveLength(0);
      expect(result.unresolvedItems).toHaveLength(2);
      expect(result.unresolvedItems[0].item.productId).toBe('gelato-tender-coconut');
      expect(result.unresolvedItems[1].item.productId).toBe('extra-wafer-cone');
      expect(result.unresolvedItems[1].reason).toMatch(/unavailable/i);
    });
  });

  describe('2. Network Disconnect, Auth Expiry, Lost Response & Duplicate Prevention', () => {
    it('marks order as SYNC_FAILED on network disconnect, does not show as DB-confirmed, and recovers on retry without duplicates', async () => {
      // Seed cached catalog with DB item IDs
      localStorage.setItem(
        CACHED_MENU_CATALOG_KEY,
        JSON.stringify({
          categories: [{ id: 'sundaes', label: 'Sundaes', iconName: 'Cherry', description: '' }],
          items: [
            {
              id: 'sundae-hot-choc-fudge',
              name: 'Hot Chocolate Fudge',
              categoryId: 'sundaes',
              basePricePaise: 14900,
              interactionType: 'direct',
              isAvailable: true,
              isArchived: false,
            },
          ],
          updatedAt: Date.now(),
        })
      );

      // 1. Network disconnect during checkout
      mockPushOrderToDatabase.mockResolvedValueOnce({
        success: false,
        error: 'Failed to fetch: network disconnected',
      });

      render(<StaffPOSWorkspace />);

      fireEvent.click(screen.getByRole('button', { name: /Sundaes/i }));
      fireEvent.click(screen.getByRole('article', { name: /Hot Chocolate Fudge/i }));

      const cart = screen.getByLabelText('Order Cart');
      fireEvent.click(within(cart).getByRole('button', { name: /PROCEED TO PAYMENT/i }));
      const payDialog = screen.getByRole('dialog');
      fireEvent.click(within(payDialog).getByRole('button', { name: /Confirm Payment Received/i }));

      await waitFor(() => {
        const stored = loadOrderHistory();
        expect(stored).toHaveLength(1);
        expect(stored[0].syncStatus).toBe('SYNC_FAILED');
        expect(stored[0].syncErrorKind).toBe('network');
      });

      // Open Order History — unconfirmed order must NOT show "Database" confirmed badge
      fireEvent.click(screen.getByRole('button', { name: /Order History/i }));
      const historyDialog = screen.getByRole('dialog', { name: /Order History/i });

      expect(within(historyDialog).queryByText('Database')).not.toBeInTheDocument();
      expect(within(historyDialog).getByText(/Sync Failed/i)).toBeInTheDocument();

      // Open receipt — must NOT falsely claim ORDER CONFIRMED & PAID
      fireEvent.click(within(historyDialog).getByRole('button', { name: /View receipt for order/i }));
      expect(within(historyDialog).queryByText(/ORDER CONFIRMED & PAID/i)).not.toBeInTheDocument();
      expect(within(historyDialog).getByText(/NOT YET CONFIRMED IN DATABASE/i)).toBeInTheDocument();

      // Go back to history list and trigger Retry Sync -> succeeds with authoritative server token T1-007
      fireEvent.click(within(historyDialog).getByRole('button', { name: /Back to Order History/i }));
      const originalOrderId = loadOrderHistory()[0].id;

      mockPushOrderToDatabase.mockResolvedValueOnce({
        success: true,
        orderId: originalOrderId,
        data: {
          order_id: originalOrderId,
          token_terminal: 'T1',
          token_seq: 7,
          subtotal_paise: 14900,
          discount_paise: 0,
          tax_paise: 745,
          cgst_paise: 373,
          sgst_paise: 372,
          total_paise: 15645,
          idempotent: false,
        },
      });

      const retryBtn = within(historyDialog).getByRole('button', { name: /Retry Sync/i });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        const updated = loadOrderHistory();
        expect(updated).toHaveLength(1);
        expect(updated[0].id).toBe(originalOrderId);
        expect(updated[0].syncStatus).toBe('SYNCED');
        expect(updated[0].token).toBe('T1-007');
      });

      // After successful sync, badge and receipt reflect DB confirmation
      expect(within(historyDialog).getByText('Database')).toBeInTheDocument();
      fireEvent.click(within(historyDialog).getByRole('button', { name: /View receipt for order T1-007/i }));
      expect(within(historyDialog).getByText(/ORDER CONFIRMED & PAID/i)).toBeInTheDocument();
    });

    it('surfaces auth_expired recovery prompt when session expires during checkout', async () => {
      mockPushOrderToDatabase.mockResolvedValueOnce({
        success: false,
        error: 'Authentication required. Please sign in to continue.',
      });

      render(<StaffPOSWorkspace />);

      fireEvent.click(screen.getByRole('button', { name: /Sundaes/i }));
      fireEvent.click(screen.getByRole('article', { name: /Hot Chocolate Fudge/i }));

      const cart = screen.getByLabelText('Order Cart');
      fireEvent.click(within(cart).getByRole('button', { name: /PROCEED TO PAYMENT/i }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Confirm Payment Received/i }));

      await waitFor(() => {
        const stored = loadOrderHistory();
        expect(stored).toHaveLength(1);
        expect(stored[0].syncStatus).toBe('SYNC_FAILED');
        expect(stored[0].syncRequiresAuth).toBe(true);
        expect(screen.getByRole('alert')).toHaveTextContent(/Session expired|Authentication required/i);
      });
    });

    it('handles lost HTTP response after server commit and deduplicates via same order.id on retry', async () => {
      // Simulate server committed order, but browser timed out before receiving response
      mockPushOrderToDatabase
        .mockRejectedValueOnce(new Error('Request timeout after server commit'))
        .mockImplementationOnce(async (order: PosOrder) => ({
          success: true,
          orderId: order.id,
          data: {
            order_id: order.id,
            token_terminal: 'T1',
            token_seq: 12,
            subtotal_paise: order.subtotalPaise,
            discount_paise: order.discountPaise,
            tax_paise: order.taxPreviewPaise,
            cgst_paise: 373,
            sgst_paise: 372,
            total_paise: order.totalPaise,
            idempotent: true,
          },
        }));

      render(<StaffPOSWorkspace />);

      fireEvent.click(screen.getByRole('button', { name: /Sundaes/i }));
      fireEvent.click(screen.getByRole('article', { name: /Hot Chocolate Fudge/i }));

      const cart = screen.getByLabelText('Order Cart');
      fireEvent.click(within(cart).getByRole('button', { name: /PROCEED TO PAYMENT/i }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Confirm Payment Received/i }));

      await waitFor(() => {
        expect(loadOrderHistory()[0]?.syncStatus).toBe('SYNC_FAILED');
      });

      const firstOrderId = loadOrderHistory()[0].id;

      // Trigger retry via banner button
      const retryBannerBtn = screen.getByRole('button', { name: /Retry Sync/i });
      fireEvent.click(retryBannerBtn);

      await waitFor(() => {
        const stored = loadOrderHistory();
        expect(stored).toHaveLength(1);
        expect(stored[0].id).toBe(firstOrderId);
        expect(stored[0].syncStatus).toBe('SYNCED');
        expect(stored[0].token).toBe('T1-012');
      });

      // Both attempts used the exact same order.id
      expect(mockPushOrderToDatabase).toHaveBeenCalledTimes(2);
      expect(mockPushOrderToDatabase.mock.calls[0][0].id).toBe(firstOrderId);
      expect(mockPushOrderToDatabase.mock.calls[1][0].id).toBe(firstOrderId);
    });

    it('mergeDatabaseAndLocalOrders preserves unsynced local orders alongside confirmed DB orders without hiding them', () => {
      let dbOrder = createNewPosOrder('T1-001');
      dbOrder = addItemToOrder(dbOrder, { productId: 'gelato-madagascar-vanilla', productName: 'Madagascar Vanilla', unitPricePaise: 9900 });
      dbOrder = { ...completeOrderPayment(dbOrder, 'CASH'), syncStatus: 'SYNCED' };

      let failedLocalOrder = createNewPosOrder('#002');
      failedLocalOrder = addItemToOrder(failedLocalOrder, { productId: 'sundae-hot-choc-fudge', productName: 'Hot Chocolate Fudge', unitPricePaise: 14900 });
      failedLocalOrder = { ...completeOrderPayment(failedLocalOrder, 'UPI'), syncStatus: 'SYNC_FAILED', syncError: 'Offline' };

      const merged = mergeDatabaseAndLocalOrders([dbOrder], [dbOrder, failedLocalOrder]);
      expect(merged).toHaveLength(2);
      expect(merged.find((o) => o.id === dbOrder.id)?.syncStatus).toBe('SYNCED');
      expect(merged.find((o) => o.id === failedLocalOrder.id)?.syncStatus).toBe('SYNC_FAILED');
    });
  });
});
