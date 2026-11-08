import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadOrderHistory,
  addOrderToHistory,
  clearOrderHistory,
  filterAndSortOrderHistory,
  calculateHistoryRevenuePaise,
  updateHistoricalOrder,
  addItemToHistoricalOrder,
  updateHistoricalOrderItemQuantity,
  removeHistoricalOrderItem,
  applyHistoricalOrderDiscount,
  calculatePaymentDifference,
} from '@/lib/pos/orderHistory';
import { createNewPosOrder, addItemToOrder, completeOrderPayment } from '@/lib/pos/order';

describe('Permanent Order History Unit Tests', () => {
  beforeEach(() => {
    clearOrderHistory();
  });

  it('1. Loads empty order history initially', () => {
    const history = loadOrderHistory();
    expect(history).toEqual([]);
  });

  it('2. Adds completed orders to permanent history and persists to storage', () => {
    let order1 = createNewPosOrder('#001');
    order1 = addItemToOrder(order1, {
      productId: 'gelato-classic-vanilla',
      productName: 'Classic Vanilla',
      variantLabel: '85ml',
      unitPricePaise: 16900,
    });
    order1 = completeOrderPayment(order1, 'CASH', 20000, 2255);

    const updated = addOrderToHistory(order1);
    expect(updated).toHaveLength(1);
    expect(updated[0].token).toBe('#001');
    expect(updated[0].paymentMethod).toBe('CASH');

    // Verify retrieval from loadOrderHistory
    const retrieved = loadOrderHistory();
    expect(retrieved).toHaveLength(1);
    expect(retrieved[0].id).toBe(order1.id);
  });

  it('3. Strictly prevents duplicate entries for the same order ID', () => {
    let order = createNewPosOrder('#001');
    order = addItemToOrder(order, {
      productId: 'extra-wafer-cone',
      productName: 'Wafer Cone',
      unitPricePaise: 1500,
    });
    order = completeOrderPayment(order, 'UPI');

    addOrderToHistory(order);
    addOrderToHistory(order); // duplicate call
    addOrderToHistory(order); // duplicate call

    const history = loadOrderHistory();
    expect(history).toHaveLength(1);
  });

  it('4. Searches orders by order token and product name', () => {
    let o1 = createNewPosOrder('#001');
    o1 = addItemToOrder(o1, { productId: 'p1', productName: 'Classic Vanilla', unitPricePaise: 16900 });
    o1 = completeOrderPayment(o1, 'CASH');

    let o2 = createNewPosOrder('#002');
    o2 = addItemToOrder(o2, { productId: 'p2', productName: 'Nutella Bliss', unitPricePaise: 24900 });
    o2 = completeOrderPayment(o2, 'UPI');

    let o3 = createNewPosOrder('#003');
    o3 = addItemToOrder(o3, { productId: 'p3', productName: 'Mango Sorbet', unitPricePaise: 16900 });
    o3 = completeOrderPayment(o3, 'CARD');

    const orders = [o1, o2, o3];

    // Search by token
    const tokenSearch = filterAndSortOrderHistory(orders, { searchQuery: '002' });
    expect(tokenSearch).toHaveLength(1);
    expect(tokenSearch[0].token).toBe('#002');

    // Search by item name
    const itemSearch = filterAndSortOrderHistory(orders, { searchQuery: 'nutella' });
    expect(itemSearch).toHaveLength(1);
    expect(itemSearch[0].token).toBe('#002');

    // Search by product variant
    const vanillaSearch = filterAndSortOrderHistory(orders, { searchQuery: 'vanilla' });
    expect(vanillaSearch).toHaveLength(1);
    expect(vanillaSearch[0].token).toBe('#001');
  });

  it('5. Filters orders by date ranges (today, yesterday, week, month, custom)', () => {
    const refDate = new Date('2026-11-08T15:00:00Z');

    let todayOrder = createNewPosOrder('#001');
    todayOrder = addItemToOrder(todayOrder, { productId: 'p1', productName: 'P1', unitPricePaise: 10000 });
    todayOrder = completeOrderPayment(todayOrder, 'CASH');
    todayOrder.completedAt = '2026-11-08T10:00:00Z';

    let yestOrder = createNewPosOrder('#002');
    yestOrder = addItemToOrder(yestOrder, { productId: 'p2', productName: 'P2', unitPricePaise: 20000 });
    yestOrder = completeOrderPayment(yestOrder, 'UPI');
    yestOrder.completedAt = '2026-11-07T14:00:00Z';

    let oldOrder = createNewPosOrder('#003');
    oldOrder = addItemToOrder(oldOrder, { productId: 'p3', productName: 'P3', unitPricePaise: 30000 });
    oldOrder = completeOrderPayment(oldOrder, 'CARD');
    oldOrder.completedAt = '2026-10-15T09:00:00Z';

    const orders = [todayOrder, yestOrder, oldOrder];

    // Filter Today
    const todayResults = filterAndSortOrderHistory(orders, { dateFilter: 'today' }, refDate);
    expect(todayResults.map((o) => o.token)).toEqual(['#001']);

    // Filter Yesterday
    const yestResults = filterAndSortOrderHistory(orders, { dateFilter: 'yesterday' }, refDate);
    expect(yestResults.map((o) => o.token)).toEqual(['#002']);

    // Filter Week (last 7 days from Nov 8: Nov 2 to Nov 8)
    const weekResults = filterAndSortOrderHistory(orders, { dateFilter: 'week' }, refDate);
    expect(weekResults.map((o) => o.token)).toEqual(['#001', '#002']);

    // Filter Month (Nov 2026)
    const monthResults = filterAndSortOrderHistory(orders, { dateFilter: 'month' }, refDate);
    expect(monthResults.map((o) => o.token)).toEqual(['#001', '#002']);

    // Custom Date Range (Oct 10 to Oct 20)
    const customResults = filterAndSortOrderHistory(
      orders,
      { dateFilter: 'custom', customStartDate: '2026-10-10', customEndDate: '2026-10-20' },
      refDate
    );
    expect(customResults.map((o) => o.token)).toEqual(['#003']);
  });

  it('6. Sorts orders by newest, oldest, highest amount, and lowest amount', () => {
    let o1 = createNewPosOrder('#001');
    o1 = addItemToOrder(o1, { productId: 'p1', productName: 'P1', unitPricePaise: 10000 });
    o1 = completeOrderPayment(o1, 'CASH');
    o1.completedAt = '2026-11-08T09:00:00Z';

    let o2 = createNewPosOrder('#002');
    o2 = addItemToOrder(o2, { productId: 'p2', productName: 'P2', unitPricePaise: 50000 });
    o2 = completeOrderPayment(o2, 'UPI');
    o2.completedAt = '2026-11-08T12:00:00Z';

    let o3 = createNewPosOrder('#003');
    o3 = addItemToOrder(o3, { productId: 'p3', productName: 'P3', unitPricePaise: 25000 });
    o3 = completeOrderPayment(o3, 'CARD');
    o3.completedAt = '2026-11-08T10:00:00Z';

    const orders = [o1, o2, o3];

    // Newest First (default)
    const newest = filterAndSortOrderHistory(orders, { sortOption: 'newest' });
    expect(newest.map((o) => o.token)).toEqual(['#002', '#003', '#001']);

    // Oldest First
    const oldest = filterAndSortOrderHistory(orders, { sortOption: 'oldest' });
    expect(oldest.map((o) => o.token)).toEqual(['#001', '#003', '#002']);

    // Highest Amount
    const highest = filterAndSortOrderHistory(orders, { sortOption: 'highest' });
    expect(highest[0].token).toBe('#002');

    // Lowest Amount
    const lowest = filterAndSortOrderHistory(orders, { sortOption: 'lowest' });
    expect(lowest[0].token).toBe('#001');
  });

  it('7. Calculates total revenue correctly from filtered orders', () => {
    let o1 = createNewPosOrder('#001');
    o1 = addItemToOrder(o1, { productId: 'p1', productName: 'P1', unitPricePaise: 10000 });
    o1 = completeOrderPayment(o1, 'CASH');

    let o2 = createNewPosOrder('#002');
    o2 = addItemToOrder(o2, { productId: 'p2', productName: 'P2', unitPricePaise: 20000 });
    o2 = completeOrderPayment(o2, 'UPI');

    const total = calculateHistoryRevenuePaise([o1, o2]);
    expect(total).toBe(o1.totalPaise + o2.totalPaise);
  });

  it('8. Modifies an order in permanent history and persists updated totals and items', () => {
    let order = createNewPosOrder('#001');
    order = addItemToOrder(order, {
      productId: 'gelato-classic-vanilla',
      productName: 'Classic Vanilla',
      unitPricePaise: 16900,
    });
    order = completeOrderPayment(order, 'CASH', 20000, 2255);
    addOrderToHistory(order);

    const initialTotal = order.totalPaise;

    // Add another product to the order
    const draft = addItemToHistoricalOrder(order, {
      productId: 'waffle-nutella-bliss',
      productName: 'Nutella Bliss',
      unitPricePaise: 24900,
    });

    const { savedOrder, updatedOrders } = updateHistoricalOrder(order.id, draft, 'Added waffle');

    expect(savedOrder.items).toHaveLength(2);
    expect(savedOrder.totalPaise).toBeGreaterThan(initialTotal);
    expect(updatedOrders).toHaveLength(1);

    // Verify persisted in storage
    const reloaded = loadOrderHistory();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].items).toHaveLength(2);
    expect(reloaded[0].totalPaise).toBe(savedOrder.totalPaise);

    // Remove the newly added item and verify
    const afterRemoval = removeHistoricalOrderItem(savedOrder, savedOrder.items[1].lineId);
    expect(afterRemoval.items).toHaveLength(1);
    expect(afterRemoval.totalPaise).toBe(initialTotal);
  });

  it('9. Preserves original payment method, amount, timestamp, and cash details upon editing', () => {
    let order = createNewPosOrder('#001');
    order = addItemToOrder(order, {
      productId: 'p1',
      productName: 'Original Item',
      unitPricePaise: 10000,
    });
    order = completeOrderPayment(order, 'CASH', 20000, 9500);
    const initialCompletedAt = order.completedAt;
    const initialTotal = order.totalPaise;
    addOrderToHistory(order);

    // Modify item quantity to 3
    const draft = updateHistoricalOrderItemQuantity(order, order.items[0].lineId, 3);
    const { savedOrder } = updateHistoricalOrder(order.id, draft);

    // Verification of preserved payment information
    expect(savedOrder.paymentMethod).toBe('CASH');
    expect(savedOrder.tenderedPaise).toBe(20000);
    expect(savedOrder.changePaise).toBe(9500);
    expect(savedOrder.completedAt).toBe(initialCompletedAt);
    expect(savedOrder.originalPayment).toBeDefined();
    expect(savedOrder.originalPayment?.totalPaise).toBe(initialTotal);
    expect(savedOrder.originalPayment?.method).toBe('CASH');
    expect(savedOrder.originalPayment?.paidAt).toBe(initialCompletedAt);
  });

  it('10. Maintains complete modification audit trail with multiple edits', () => {
    let order = createNewPosOrder('#001');
    order = addItemToOrder(order, { productId: 'p1', productName: 'Item 1', unitPricePaise: 10000 });
    order = completeOrderPayment(order, 'UPI');
    addOrderToHistory(order);

    // Edit 1: Increase quantity
    const draft1 = updateHistoricalOrderItemQuantity(order, order.items[0].lineId, 2);
    const res1 = updateHistoricalOrder(order.id, draft1, 'Customer requested double');

    expect(res1.savedOrder.modificationCount).toBe(1);
    expect(res1.savedOrder.modifications).toHaveLength(1);
    expect(res1.savedOrder.modifications![0].differencePaise).toBeGreaterThan(0);

    // Edit 2: Apply discount
    const draft2 = applyHistoricalOrderDiscount(res1.savedOrder, { type: 'percent_10', percent: 10 });
    const res2 = updateHistoricalOrder(order.id, draft2, 'Applied 10% coupon');

    expect(res2.savedOrder.modificationCount).toBe(2);
    expect(res2.savedOrder.modifications).toHaveLength(2);
    expect(res2.savedOrder.modifications![1].previousTotalPaise).toBe(res1.savedOrder.totalPaise);
  });

  it('11. Calculates payment difference accurately (additional due vs refund)', () => {
    let order = createNewPosOrder('#001');
    order = addItemToOrder(order, { productId: 'p1', productName: 'Item 1', unitPricePaise: 10000 });
    order = completeOrderPayment(order, 'CARD');
    addOrderToHistory(order);

    // Initial state: exact match
    const initialDiff = calculatePaymentDifference(order);
    expect(initialDiff.status).toBe('exact');
    expect(initialDiff.differencePaise).toBe(0);

    // When total increases: additional due
    const higherDraft = updateHistoricalOrderItemQuantity(order, order.items[0].lineId, 2);
    const { savedOrder: higherOrder } = updateHistoricalOrder(order.id, higherDraft);
    const dueDiff = calculatePaymentDifference(higherOrder);
    expect(dueDiff.status).toBe('due');
    expect(dueDiff.differencePaise).toBeGreaterThan(0);

    // When total decreases: refund due
    const lowerDraft = applyHistoricalOrderDiscount(order, { type: 'percent_10', percent: 10 });
    const { savedOrder: lowerOrder } = updateHistoricalOrder(order.id, lowerDraft);
    const refundDiff = calculatePaymentDifference(lowerOrder);
    expect(refundDiff.status).toBe('refund');
    expect(refundDiff.differencePaise).toBeLessThan(0);
  });
});
