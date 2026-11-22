/**
 * Everytime Creamery — Permanent Order History Domain & Storage
 * Phase 1.1 Feature Enhancement: Permanent Order History
 *
 * Implements permanent storage, search, multi-range filtering, and sorting
 * for historical completed orders. Operates completely independently of the
 * temporary 60-second active counter Completed queue.
 */

import {
  PosOrder,
  OrderModification,
  OriginalPaymentInfo,
  recalculateOrderTotals,
} from './order';
import {
  POSCartItem,
  AddItemToCartInput,
  generatePOSCartLineId,
} from './cart';
import {
  DiscountConfig,
  calculateLineTotalPaise,
} from './calculations';

export type { OrderModification, OriginalPaymentInfo };

export const ORDER_HISTORY_STORAGE_KEY = 'everytime_creamery_order_history_v1';

export type DateFilterOption =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'week'
  | 'month'
  | 'custom';

export type HistorySortOption =
  | 'newest'
  | 'oldest'
  | 'highest'
  | 'lowest';

export interface OrderHistoryFilter {
  searchQuery?: string;
  dateFilter?: DateFilterOption;
  customStartDate?: string; // YYYY-MM-DD
  customEndDate?: string;   // YYYY-MM-DD
  sortOption?: HistorySortOption;
}

/**
 * In-memory fallback if localStorage is unavailable (e.g. private browsing or SSR).
 */
let memoryHistoryStore: PosOrder[] = [];

/**
 * Loads the permanent order history from browser localStorage (or in-memory fallback).
 */
export function loadOrderHistory(): PosOrder[] {
  if (typeof window === 'undefined') {
    return memoryHistoryStore;
  }

  try {
    const raw = window.localStorage.getItem(ORDER_HISTORY_STORAGE_KEY);
    if (!raw) {
      return memoryHistoryStore;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const sanitized = parsed.map((order: PosOrder) => ({
        ...order,
        roundOffPaise: order.roundOffPaise ?? 0,
      }));
      memoryHistoryStore = sanitized;
      return sanitized;
    }
  } catch (err) {
    console.warn('Failed to parse order history from localStorage:', err);
  }

  return memoryHistoryStore;
}

/**
 * Saves the given array of historical orders to browser storage.
 */
export function saveOrderHistory(orders: PosOrder[]): void {
  memoryHistoryStore = orders;

  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(ORDER_HISTORY_STORAGE_KEY, JSON.stringify(orders));
  } catch (err) {
    console.warn('Failed to persist order history to localStorage:', err);
  }
}

/**
 * Adds a completed order snapshot to permanent history.
 * Strictly prevents duplicates: if an order with the same order.id already exists, it is not duplicated.
 */
export function addOrderToHistory(order: PosOrder): PosOrder[] {
  const current = loadOrderHistory();

  // Deduplicate by ID
  const existingIdx = current.findIndex((o) => o.id === order.id);
  let updated: PosOrder[];

  if (existingIdx >= 0) {
    // Update existing record snapshot in place
    updated = [
      ...current.slice(0, existingIdx),
      order,
      ...current.slice(existingIdx + 1),
    ];
  } else {
    // Append new completed order
    updated = [...current, order];
  }

  saveOrderHistory(updated);
  return updated;
}

/**
 * Resets / clears all order history (used in tests or manual reset).
 */
export function clearOrderHistory(): void {
  memoryHistoryStore = [];
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(ORDER_HISTORY_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

/**
 * Calculates the difference between an order's current total and its original paid total.
 */
export function calculatePaymentDifference(order: PosOrder): {
  originalTotalPaise: number;
  currentTotalPaise: number;
  differencePaise: number;
  status: 'due' | 'refund' | 'exact';
} {
  const originalTotalPaise = order.originalPayment?.totalPaise ?? order.totalPaise;
  const currentTotalPaise = order.totalPaise;
  const differencePaise = currentTotalPaise - originalTotalPaise;

  let status: 'due' | 'refund' | 'exact' = 'exact';
  if (differencePaise > 0) {
    status = 'due';
  } else if (differencePaise < 0) {
    status = 'refund';
  }

  return {
    originalTotalPaise,
    currentTotalPaise,
    differencePaise,
    status,
  };
}

/**
 * Adds an item to a draft historical order and recalculates totals.
 */
export function addItemToHistoricalOrder(
  order: PosOrder,
  input: AddItemToCartInput
): PosOrder {
  const quantityToAdd = Math.max(1, input.quantity ?? 1);
  const lineId = generatePOSCartLineId(input.productId, input.variantId, input.addOnId);

  const existingIndex = order.items.findIndex((item) => item.lineId === lineId);
  let updatedItems: POSCartItem[];

  if (existingIndex >= 0) {
    const existing = order.items[existingIndex];
    const newQuantity = existing.quantity + quantityToAdd;
    updatedItems = [
      ...order.items.slice(0, existingIndex),
      {
        ...existing,
        quantity: newQuantity,
        lineTotalPaise: calculateLineTotalPaise(existing.unitPricePaise, newQuantity),
      },
      ...order.items.slice(existingIndex + 1),
    ];
  } else {
    const newItem: POSCartItem = {
      lineId,
      productId: input.productId,
      productName: input.productName,
      unitPricePaise: input.unitPricePaise,
      quantity: quantityToAdd,
      lineTotalPaise: calculateLineTotalPaise(input.unitPricePaise, quantityToAdd),
      variantId: input.variantId,
      variantLabel: input.variantLabel,
      addOnId: input.addOnId,
      addOnLabel: input.addOnLabel,
    };
    updatedItems = [...order.items, newItem];
  }

  const totals = recalculateOrderTotals(updatedItems, order.discount, order.taxConfig);

  return {
    ...order,
    items: updatedItems,
    ...totals,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Updates item quantity in a draft historical order.
 */
export function updateHistoricalOrderItemQuantity(
  order: PosOrder,
  lineId: string,
  newQuantity: number
): PosOrder {
  if (newQuantity <= 0) {
    return removeHistoricalOrderItem(order, lineId);
  }

  const updatedItems = order.items.map((item) => {
    if (item.lineId !== lineId) return item;
    return {
      ...item,
      quantity: newQuantity,
      lineTotalPaise: calculateLineTotalPaise(item.unitPricePaise, newQuantity),
    };
  });

  const totals = recalculateOrderTotals(updatedItems, order.discount, order.taxConfig);

  return {
    ...order,
    items: updatedItems,
    ...totals,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Removes an item from a draft historical order.
 */
export function removeHistoricalOrderItem(order: PosOrder, lineId: string): PosOrder {
  const updatedItems = order.items.filter((item) => item.lineId !== lineId);
  const totals = recalculateOrderTotals(updatedItems, order.discount, order.taxConfig);

  return {
    ...order,
    items: updatedItems,
    ...totals,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Applies a discount to a draft historical order.
 */
export function applyHistoricalOrderDiscount(
  order: PosOrder,
  discount: DiscountConfig
): PosOrder {
  const totals = recalculateOrderTotals(order.items, discount, order.taxConfig);

  return {
    ...order,
    discount,
    ...totals,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Saves modifications to a historical order:
 * - Preserves original payment information (method, amount, timestamp, cash tendered/change)
 * - Records audit trail in `modifications`
 * - Saves updated order into permanent history
 */
export function updateHistoricalOrder(
  orderId: string,
  updatedOrder: PosOrder,
  reason: string = 'Staff modification'
): { updatedOrders: PosOrder[]; savedOrder: PosOrder } {
  const currentHistory = loadOrderHistory();
  const existingOrder = currentHistory.find((o) => o.id === orderId);

  if (!existingOrder) {
    throw new Error(`Cannot update historical order: Order with ID ${orderId} not found in history`);
  }

  if (updatedOrder.items.length === 0) {
    throw new Error('Cannot save an edited order with 0 items. At least one item is required.');
  }

  // Preserve original payment information
  const originalPayment: OriginalPaymentInfo = existingOrder.originalPayment || {
    totalPaise: existingOrder.totalPaise,
    method: existingOrder.paymentMethod || 'CASH',
    tenderedPaise: existingOrder.tenderedPaise,
    changePaise: existingOrder.changePaise,
    paidAt: existingOrder.completedAt || existingOrder.createdAt,
  };

  const now = new Date().toISOString();
  const previousTotalPaise = existingOrder.totalPaise;
  const newTotalPaise = updatedOrder.totalPaise;
  const differencePaise = newTotalPaise - previousTotalPaise;

  const modification: OrderModification = {
    id: `mod_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    modifiedAt: now,
    previousTotalPaise,
    newTotalPaise,
    differencePaise,
    previousItems: [...existingOrder.items],
    newItems: [...updatedOrder.items],
    previousDiscount: { ...existingOrder.discount },
    newDiscount: { ...updatedOrder.discount },
    reason,
  };

  const savedOrder: PosOrder = {
    ...updatedOrder,
    id: existingOrder.id,
    token: existingOrder.token,
    status: 'COMPLETED',
    paymentStatus: 'PAID',
    paymentMethod: existingOrder.paymentMethod, // Strictly preserve original payment method
    tenderedPaise: existingOrder.tenderedPaise,
    changePaise: existingOrder.changePaise,
    createdAt: existingOrder.createdAt,
    completedAt: existingOrder.completedAt,
    originalPayment,
    modifications: [...(existingOrder.modifications || []), modification],
    modificationCount: (existingOrder.modificationCount || 0) + 1,
    lastModifiedAt: now,
    updatedAt: now,
  };

  const updatedOrders = currentHistory.map((o) => (o.id === orderId ? savedOrder : o));
  saveOrderHistory(updatedOrders);

  return { updatedOrders, savedOrder };
}

/**
 * Checks whether an order's completion timestamp falls within the specified date filter.
 */
export function isOrderInDateRange(
  order: PosOrder,
  filter: DateFilterOption,
  customStart?: string,
  customEnd?: string,
  refDate: Date = new Date()
): boolean {
  if (filter === 'all') return true;

  const dateStr = order.completedAt || order.createdAt;
  const orderDate = new Date(dateStr);
  if (isNaN(orderDate.getTime())) return true;

  // Normalize refDate to start of day
  const todayStart = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
  const todayEnd = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), 23, 59, 59, 999);

  if (filter === 'today') {
    return orderDate >= todayStart && orderDate <= todayEnd;
  }

  if (filter === 'yesterday') {
    const yestStart = new Date(todayStart);
    yestStart.setDate(yestStart.getDate() - 1);
    const yestEnd = new Date(todayEnd);
    yestEnd.setDate(yestEnd.getDate() - 1);
    return orderDate >= yestStart && orderDate <= yestEnd;
  }

  if (filter === 'week') {
    // Last 7 days
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 6);
    return orderDate >= weekStart && orderDate <= todayEnd;
  }

  if (filter === 'month') {
    // Current calendar month
    const monthStart = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
    const monthEnd = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0, 23, 59, 59, 999);
    return orderDate >= monthStart && orderDate <= monthEnd;
  }

  if (filter === 'custom') {
    if (!customStart && !customEnd) return true;

    if (customStart) {
      const [y, m, d] = customStart.split('-').map(Number);
      const cStart = new Date(y, m - 1, d, 0, 0, 0);
      if (orderDate < cStart) return false;
    }

    if (customEnd) {
      const [y, m, d] = customEnd.split('-').map(Number);
      const cEnd = new Date(y, m - 1, d, 23, 59, 59, 999);
      if (orderDate > cEnd) return false;
    }

    return true;
  }

  return true;
}

/**
 * Searches, filters, and sorts the permanent order history according to criteria.
 */
export function filterAndSortOrderHistory(
  orders: PosOrder[],
  filter: OrderHistoryFilter = {},
  refDate: Date = new Date()
): PosOrder[] {
  const {
    searchQuery = '',
    dateFilter = 'all',
    customStartDate,
    customEndDate,
    sortOption = 'newest',
  } = filter;

  const trimmedQuery = searchQuery.trim().toLowerCase();

  // 1. Filter by search and date range
  const filtered = orders.filter((order) => {
    // Date filter check
    if (!isOrderInDateRange(order, dateFilter, customStartDate, customEndDate, refDate)) {
      return false;
    }

    // Search query check
    if (trimmedQuery) {
      const matchToken = order.token.toLowerCase().includes(trimmedQuery);
      const matchId = order.id.toLowerCase().includes(trimmedQuery);
      const matchPayment = (order.paymentMethod || '').toLowerCase().includes(trimmedQuery);
      const matchItems = order.items.some(
        (item) =>
          item.productName.toLowerCase().includes(trimmedQuery) ||
          (item.variantLabel || '').toLowerCase().includes(trimmedQuery) ||
          (item.addOnLabel || '').toLowerCase().includes(trimmedQuery)
      );

      // Match formatted date/time string
      const dateText = (order.completedAt || order.createdAt).toLowerCase();
      const matchDate = dateText.includes(trimmedQuery);

      if (!matchToken && !matchId && !matchPayment && !matchItems && !matchDate) {
        return false;
      }
    }

    return true;
  });

  // 2. Sort results
  return [...filtered].sort((a, b) => {
    const timeA = new Date(a.completedAt || a.createdAt).getTime();
    const timeB = new Date(b.completedAt || b.createdAt).getTime();

    switch (sortOption) {
      case 'oldest':
        return timeA - timeB;
      case 'highest':
        return b.totalPaise - a.totalPaise;
      case 'lowest':
        return a.totalPaise - b.totalPaise;
      case 'newest':
      default:
        return timeB - timeA;
    }
  });
}

/**
 * Computes the total revenue in paise from a list of historical orders.
 */
export function calculateHistoryRevenuePaise(orders: PosOrder[]): number {
  return orders.reduce((sum, order) => sum + order.totalPaise, 0);
}

