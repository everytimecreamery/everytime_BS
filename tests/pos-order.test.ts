import { describe, it, expect, beforeEach } from 'vitest';
import {
  getNextToken,
  resetSessionTokenCounter,
  createCompletedOrder,
  createNewPosOrder,
  addItemToOrder,
  updateOrderItemQuantity,
  removeOrderItem,
  clearOrderItems,
  applyOrderDiscount,
  completeOrderPayment,
  purgeExpiredCompletedOrders,
  COMPLETED_ORDER_RETENTION_MS,
} from '@/lib/pos/order';

  describe('Staff POS Order & Token Simulation Tests (Phase 1 & 1.1)', () => {
    beforeEach(() => {
      resetSessionTokenCounter(1);
    });

    it('1. Generates sequential 3-digit padded tokens starting from #001', () => {
      const t1 = getNextToken();
      expect(t1.tokenNumber).toBe(1);
      expect(t1.tokenDisplay).toBe('#001');

      const t2 = getNextToken();
      expect(t2.tokenNumber).toBe(2);
      expect(t2.tokenDisplay).toBe('#002');
    });

    it('2. Throws error when attempting to create an order with empty items', () => {
      expect(() => {
        createCompletedOrder({
          items: [],
          subtotalPaise: 0,
          discountPaise: 0,
          taxPreviewPaise: 0,
          totalPayablePaise: 0,
          serviceType: 'dine_in',
          paymentMethod: 'cash',
        });
      }).toThrow('Cannot create an order with an empty cart');
    });

    it('3. Creates a valid completed order snapshot with token and details', () => {
      const order = createCompletedOrder({
        items: [
          {
            lineId: 'gelato-classic-vanilla::var=250ml::addon=none',
            productId: 'gelato-classic-vanilla',
            productName: 'Classic Vanilla',
            variantId: '250ml',
            variantLabel: '250ml',
            unitPricePaise: 16900,
            quantity: 2,
            lineTotalPaise: 33800,
          },
        ],
        subtotalPaise: 33800,
        discountPaise: 0,
        taxPreviewPaise: 1690,
        totalPayablePaise: 35490,
        serviceType: 'dine_in',
        paymentMethod: 'cash',
        tenderedPaise: 50000,
        changePaise: 14510,
      });

      expect(order.tokenDisplay).toBe('#001');
      expect(order.items).toHaveLength(1);
      expect(order.items[0].productName).toBe('Classic Vanilla');
      expect(order.totalPayablePaise).toBe(35490);
      expect(order.serviceType).toBe('dine_in');
      expect(order.paymentMethod).toBe('cash');
      expect(order.changePaise).toBe(14510);
    });

    it('4. Creates a new PosOrder with unique ID, token, and PROCESSING status', () => {
      const order1 = createNewPosOrder();
      const order2 = createNewPosOrder();

      expect(order1.id).not.toBe(order2.id);
      expect(order1.token).toBe('#001');
      expect(order2.token).toBe('#002');
      expect(order1.status).toBe('PROCESSING');
      expect(order1.paymentStatus).toBe('UNPAID');
      expect(order1.paymentMethod).toBeNull();
      expect(order1.items).toHaveLength(0);
      expect(order1.subtotalPaise).toBe(0);
      expect(order1.completedAt).toBeNull();
    });

    it('5. Adds items to PosOrder, recalculating totals with paise precision', () => {
      let order = createNewPosOrder();
      order = addItemToOrder(order, {
        productId: 'gelato-classic-vanilla',
        productName: 'Classic Vanilla',
        variantId: '250ml',
        variantLabel: '250ml',
        unitPricePaise: 16900, // ₹169
        quantity: 1,
      });

      expect(order.items).toHaveLength(1);
      expect(order.subtotalPaise).toBe(16900);
      expect(order.taxPreviewPaise).toBe(845); // 5% GST of 16900 = 845
      expect(order.totalPaise).toBe(17745); // 16900 + 845

      // Add another identical item -> merges line
      order = addItemToOrder(order, {
        productId: 'gelato-classic-vanilla',
        productName: 'Classic Vanilla',
        variantId: '250ml',
        variantLabel: '250ml',
        unitPricePaise: 16900,
        quantity: 1,
      });

      expect(order.items).toHaveLength(1);
      expect(order.items[0].quantity).toBe(2);
      expect(order.subtotalPaise).toBe(33800);
    });

    it('6. Order isolation: Modifying Order 1 does not mutate Order 2', () => {
      const order1 = createNewPosOrder();
      const order2 = createNewPosOrder();

      const updatedOrder1 = addItemToOrder(order1, {
        productId: 'gelato-classic-vanilla',
        productName: 'Classic Vanilla',
        variantId: '250ml',
        variantLabel: '250ml',
        unitPricePaise: 16900,
        quantity: 1,
      });

      expect(updatedOrder1.items).toHaveLength(1);
      expect(updatedOrder1.totalPaise).toBeGreaterThan(0);

      // Order 2 must remain completely untouched
      expect(order2.items).toHaveLength(0);
      expect(order2.totalPaise).toBe(0);
      expect(order2.status).toBe('PROCESSING');
    });

    it('7. Order status lifecycle: PROCESSING -> COMPLETED directly on payment confirmation', () => {
      let order = createNewPosOrder();
      order = addItemToOrder(order, {
        productId: 'sundae-oreo',
        productName: 'Oreo Cookie Monster',
        unitPricePaise: 14900,
        quantity: 1,
      });

      expect(order.status).toBe('PROCESSING');
      expect(order.paymentStatus).toBe('UNPAID');

      // Complete payment via Card (transitions directly from PROCESSING to COMPLETED)
      order = completeOrderPayment(order, 'CARD');
      expect(order.status).toBe('COMPLETED');
      expect(order.paymentStatus).toBe('PAID');
      expect(order.paymentMethod).toBe('CARD');
      expect(order.completedAt).not.toBeNull();

      // Completed orders are immutable
      const attemptedEdit = addItemToOrder(order, {
        productId: 'extra-water-bottle',
        productName: 'Water Bottle',
        unitPricePaise: 600,
        quantity: 1,
      });
      expect(attemptedEdit.items).toHaveLength(1); // not modified
    });

    it('8. Per-order payment tracking: stores individual methods for Cash, UPI, and Card', () => {
      let o1 = createNewPosOrder();
      o1 = addItemToOrder(o1, { productId: 'p1', productName: 'P1', unitPricePaise: 10000, quantity: 1 });
      o1 = completeOrderPayment(o1, 'CASH', 15000, 4500);

      let o2 = createNewPosOrder();
      o2 = addItemToOrder(o2, { productId: 'p2', productName: 'P2', unitPricePaise: 20000, quantity: 1 });
      o2 = completeOrderPayment(o2, 'UPI');

      let o3 = createNewPosOrder();
      o3 = addItemToOrder(o3, { productId: 'p3', productName: 'P3', unitPricePaise: 30000, quantity: 1 });
      o3 = completeOrderPayment(o3, 'CARD');

      expect(o1.paymentMethod).toBe('CASH');
      expect(o1.tenderedPaise).toBe(15000);
      expect(o1.changePaise).toBe(4500);

      expect(o2.paymentMethod).toBe('UPI');
      expect(o2.tenderedPaise).toBeUndefined();

      expect(o3.paymentMethod).toBe('CARD');
    });

    it('9. Cannot complete payment for an empty order', () => {
      const emptyOrder = createNewPosOrder();
      expect(() => completeOrderPayment(emptyOrder, 'CASH')).toThrow(
        'Cannot complete payment for an empty order'
      );
    });

    it('10. Updates item quantity, removes item, applies discount, and clears items', () => {
      let order = createNewPosOrder();
      order = addItemToOrder(order, { productId: 'item-1', productName: 'Item 1', unitPricePaise: 10000, quantity: 2 });
      expect(order.items[0].quantity).toBe(2);

      // Update quantity
      const lineId = order.items[0].lineId;
      order = updateOrderItemQuantity(order, lineId, 3);
      expect(order.items[0].quantity).toBe(3);

      // Apply discount
      order = applyOrderDiscount(order, { type: 'percent_10', percent: 10 });
      expect(order.discount.percent).toBe(10);
      expect(order.discountPaise).toBe(3000);

      // Remove item
      order = removeOrderItem(order, lineId);
      expect(order.items).toHaveLength(0);

      // Add back and clear
      order = addItemToOrder(order, { productId: 'item-2', productName: 'Item 2', unitPricePaise: 5000, quantity: 1 });
      expect(order.items).toHaveLength(1);
      order = clearOrderItems(order);
      expect(order.items).toHaveLength(0);
      expect(order.totalPaise).toBe(0);
    });

    it('11. Purges completed orders older than 1 minute (COMPLETED_ORDER_RETENTION_MS)', () => {
      const now = Date.now();

      // 1. Processing order (never purged)
      const processingOrder = createNewPosOrder('#001');

      // 2. Recent completed order (completed 20 seconds ago -> kept)
      let recentCompleted = createNewPosOrder('#002');
      recentCompleted = addItemToOrder(recentCompleted, { productId: 'p1', productName: 'P1', unitPricePaise: 10000 });
      recentCompleted = completeOrderPayment(recentCompleted, 'CASH');
      recentCompleted.completedAt = new Date(now - 20_000).toISOString();

      // 3. Old completed order (completed 65 seconds ago -> purged)
      let oldCompleted = createNewPosOrder('#003');
      oldCompleted = addItemToOrder(oldCompleted, { productId: 'p2', productName: 'P2', unitPricePaise: 15000 });
      oldCompleted = completeOrderPayment(oldCompleted, 'UPI');
      oldCompleted.completedAt = new Date(now - 65_000).toISOString();

      const allOrders = [processingOrder, recentCompleted, oldCompleted];
      const remaining = purgeExpiredCompletedOrders(allOrders, COMPLETED_ORDER_RETENTION_MS, now);

      expect(remaining).toHaveLength(2);
      expect(remaining.map((o) => o.token)).toEqual(['#001', '#002']);
      expect(remaining.some((o) => o.token === '#003')).toBe(false);
    });
  });
