/**
 * Everytime Creamery — Staff POS Order & Token Simulation
 * Phase 1.1: Refined Order Workflow & Multiple Customer Orders
 *
 * Implements strongly typed PosOrder domain model, lifecycle statuses
 * (PROCESSING, COMPLETED), unique sequential token generation,
 * order isolation, 1-minute completed phase auto-refresh, and per-order payment tracking.
 */

import {
  POSCartItem,
  AddItemToCartInput,
  generatePOSCartLineId,
  ServiceType,
} from './cart';
import {
  DiscountConfig,
  TaxConfig,
  DEFAULT_TAX_CONFIG,
  calculateLineTotalPaise,
  calculateSubtotalPaise,
  calculateDiscountPaise,
  calculateTaxPreviewPaise,
  calculateFinalPayablePaise,
  calculateTaxSplitPaise,
  calculateOrderFinancialBreakdown,
} from './calculations';
import { formatOrderToken, formatTerminalToken, generateUUID } from '@/lib/utils';

export type OrderStatus = 'PROCESSING' | 'COMPLETED';

export const COMPLETED_ORDER_RETENTION_MS = 60_000; // 1 minute auto-refresh window

export type PaymentMethod = 'CASH' | 'UPI' | 'CARD';

export type PaymentStatus = 'UNPAID' | 'PAID';

export interface OrderModification {
  id: string;
  modifiedAt: string;
  previousTotalPaise: number;
  newTotalPaise: number;
  differencePaise: number;
  previousItems: POSCartItem[];
  newItems: POSCartItem[];
  previousDiscount: DiscountConfig;
  newDiscount: DiscountConfig;
  reason?: string;
}

export interface OriginalPaymentInfo {
  totalPaise: number;
  method: PaymentMethod;
  tenderedPaise?: number;
  changePaise?: number;
  paidAt: string;
}

export interface PosOrder {
  id: string;
  token: string;
  status: OrderStatus;

  items: POSCartItem[];

  subtotalPaise: number;
  discountPaise: number;
  taxPreviewPaise: number;
  cgstPaise?: number;
  sgstPaise?: number;
  roundOffPaise?: number;
  grossPayablePaise?: number;
  totalPaise: number;
  totalPayablePaise: number; // Aliased for cart calculation compatibility
  totalQuantity: number;

  discount: DiscountConfig;
  taxConfig: TaxConfig;

  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  tenderedPaise?: number;
  changePaise?: number;

  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  businessDate?: string;

  // Feature Enhancement: Edit Previous Orders & Audit Trail
  originalPayment?: OriginalPaymentInfo;
  modifications?: OrderModification[];
  modificationCount?: number;
  lastModifiedAt?: string;
}

/**
 * Backward compatibility interface for Phase 1 code/tests
 */
export interface CompletedOrder {
  tokenNumber: number;
  tokenDisplay: string;
  timestamp: Date;
  items: POSCartItem[];
  subtotalPaise: number;
  discountPaise: number;
  taxPreviewPaise: number;
  totalPayablePaise: number;
  serviceType: ServiceType;
  paymentMethod: 'cash' | 'upi' | 'card';
  tenderedPaise?: number;
  changePaise?: number;
}

/**
 * In-memory token counter for the current browser session.
 * Increments starting from 1.
 */
let sessionTokenCounter = 1;

/**
 * Resets the session token counter (primarily for test isolation).
 */
export function resetSessionTokenCounter(startAt: number = 1): void {
  sessionTokenCounter = startAt;
}

/**
 * Returns the next sequential token number and formatted string for the current session.
 */
export function getNextToken(): { tokenNumber: number; tokenDisplay: string } {
  const tokenNumber = sessionTokenCounter;
  sessionTokenCounter += 1;
  return {
    tokenNumber,
    tokenDisplay: formatOrderToken(tokenNumber),
  };
}

/**
 * Generates a unique client-generated UUID suitable for idempotent database upserts.
 */
export function generateUniqueOrderId(): string {
  return generateUUID();
}

/**
 * Recalculates all order totals from items and discount configuration.
 */
export function recalculateOrderTotals(
  items: POSCartItem[],
  discount: DiscountConfig,
  taxConfig: TaxConfig = DEFAULT_TAX_CONFIG
): {
  subtotalPaise: number;
  discountPaise: number;
  taxPreviewPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  roundOffPaise: number;
  grossPayablePaise: number;
  totalPaise: number;
  totalPayablePaise: number;
  totalQuantity: number;
} {
  const subtotalPaise = calculateSubtotalPaise(items);
  const discountPaise = calculateDiscountPaise(subtotalPaise, discount);
  const discountedSubtotalPaise = Math.max(0, subtotalPaise - discountPaise);
  const taxPreviewPaise = calculateTaxPreviewPaise(discountedSubtotalPaise, taxConfig);
  const { cgstPaise, sgstPaise } = calculateTaxSplitPaise(taxPreviewPaise);
  const breakdown = calculateOrderFinancialBreakdown(subtotalPaise, discountPaise, taxPreviewPaise);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  return {
    subtotalPaise,
    discountPaise,
    taxPreviewPaise,
    cgstPaise,
    sgstPaise,
    roundOffPaise: breakdown.roundOffPaise,
    grossPayablePaise: breakdown.grossPayablePaise,
    totalPaise: breakdown.finalPayablePaise,
    totalPayablePaise: breakdown.finalPayablePaise,
    totalQuantity,
  };
}

/**
 * Creates a brand new empty working order in PROCESSING status.
 */
export function createNewPosOrder(customToken?: string, timestamp?: string): PosOrder {
  const token = customToken ?? getNextToken().tokenDisplay;
  const now = timestamp ?? new Date().toISOString();
  const businessDate = now.split('T')[0];

  return {
    id: generateUniqueOrderId(),
    token,
    status: 'PROCESSING',
    items: [],
    subtotalPaise: 0,
    discountPaise: 0,
    taxPreviewPaise: 0,
    cgstPaise: 0,
    sgstPaise: 0,
    roundOffPaise: 0,
    grossPayablePaise: 0,
    totalPaise: 0,
    totalPayablePaise: 0,
    totalQuantity: 0,
    discount: { type: 'none', percent: 0 },
    taxConfig: DEFAULT_TAX_CONFIG,
    paymentStatus: 'UNPAID',
    paymentMethod: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    businessDate,
  };
}

/**
 * Adds an item to a PosOrder. Merges duplicate lines with incremented quantity.
 * Completed orders cannot be modified.
 */
export function addItemToOrder(
  order: PosOrder,
  input: AddItemToCartInput
): PosOrder {
  if (order.status === 'COMPLETED') {
    return order;
  }

  const quantityToAdd = Math.max(1, input.quantity ?? 1);
  const lineId = generatePOSCartLineId(input.productId, input.variantId, input.addOnId);
  const existingIndex = order.items.findIndex((i) => i.lineId === lineId);

  let updatedItems: POSCartItem[];

  if (existingIndex >= 0) {
    const existing = order.items[existingIndex];
    const newQuantity = existing.quantity + quantityToAdd;
    const updatedItem: POSCartItem = {
      ...existing,
      quantity: newQuantity,
      lineTotalPaise: calculateLineTotalPaise(existing.unitPricePaise, newQuantity),
    };
    updatedItems = [
      ...order.items.slice(0, existingIndex),
      updatedItem,
      ...order.items.slice(existingIndex + 1),
    ];
  } else {
    const newItem: POSCartItem = {
      lineId,
      productId: input.productId,
      productName: input.productName,
      variantId: input.variantId,
      variantLabel: input.variantLabel,
      addOnId: input.addOnId,
      addOnLabel: input.addOnLabel,
      unitPricePaise: input.unitPricePaise,
      quantity: quantityToAdd,
      lineTotalPaise: calculateLineTotalPaise(input.unitPricePaise, quantityToAdd),
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
 * Updates an item's quantity in an order.
 * If newQuantity <= 0, the item is removed.
 * Completed orders cannot be modified.
 */
export function updateOrderItemQuantity(
  order: PosOrder,
  lineId: string,
  newQuantity: number
): PosOrder {
  if (order.status === 'COMPLETED') {
    return order;
  }

  if (newQuantity <= 0) {
    return removeOrderItem(order, lineId);
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
 * Removes an item from an order. Completed orders cannot be modified.
 */
export function removeOrderItem(order: PosOrder, lineId: string): PosOrder {
  if (order.status === 'COMPLETED') {
    return order;
  }

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
 * Clears all items from an order. Completed orders cannot be modified.
 */
export function clearOrderItems(order: PosOrder): PosOrder {
  if (order.status === 'COMPLETED') {
    return order;
  }

  const totals = recalculateOrderTotals([], order.discount, order.taxConfig);

  return {
    ...order,
    items: [],
    ...totals,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Applies a discount to an order. Completed orders cannot be modified.
 */
export function applyOrderDiscount(order: PosOrder, discount: DiscountConfig): PosOrder {
  if (order.status === 'COMPLETED') {
    return order;
  }

  const totals = recalculateOrderTotals(order.items, discount, order.taxConfig);

  return {
    ...order,
    discount,
    ...totals,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Purges completed orders that have exceeded the retention period (default: 1 minute / 60,000ms).
 * Active processing orders are always preserved.
 */
export function purgeExpiredCompletedOrders(
  orders: PosOrder[],
  maxAgeMs: number = COMPLETED_ORDER_RETENTION_MS,
  now: number = Date.now()
): PosOrder[] {
  return orders.filter((order) => {
    if (order.status !== 'COMPLETED' || !order.completedAt) {
      return true;
    }
    const elapsed = now - new Date(order.completedAt).getTime();
    return elapsed < maxAgeMs;
  });
}

/**
 * Reopens an order back to PROCESSING status if needed.
 */
export function transitionOrderToProcessing(order: PosOrder): PosOrder {
  if (order.status === 'COMPLETED') {
    return order;
  }

  return {
    ...order,
    status: 'PROCESSING',
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Completes payment for an order and transitions it to COMPLETED.
 * Requires order to have items and not be already completed.
 */
export function completeOrderPayment(
  order: PosOrder,
  method: PaymentMethod,
  tenderedPaise?: number,
  changePaise?: number
): PosOrder {
  if (order.items.length === 0) {
    throw new Error('Cannot complete payment for an empty order');
  }
  if (order.status === 'COMPLETED') {
    return order;
  }

  const now = new Date().toISOString();
  const businessDate = order.businessDate || now.split('T')[0];
  const { cgstPaise, sgstPaise } = calculateTaxSplitPaise(order.taxPreviewPaise);

  return {
    ...order,
    status: 'COMPLETED',
    paymentStatus: 'PAID',
    paymentMethod: method,
    tenderedPaise: method === 'CASH' ? tenderedPaise : undefined,
    changePaise: method === 'CASH' ? changePaise : undefined,
    completedAt: now,
    updatedAt: now,
    cgstPaise,
    sgstPaise,
    businessDate,
    roundOffPaise: order.roundOffPaise ?? 0,
    originalPayment: {
      totalPaise: order.totalPaise,
      method,
      tenderedPaise: method === 'CASH' ? tenderedPaise : undefined,
      changePaise: method === 'CASH' ? changePaise : undefined,
      paidAt: now,
    },
    modifications: order.modifications ?? [],
    modificationCount: order.modificationCount ?? 0,
  };
}

/**
 * Backward compatibility helper for Phase 1 tests.
 */
export function createCompletedOrder(params: {
  items: POSCartItem[];
  subtotalPaise: number;
  discountPaise: number;
  taxPreviewPaise: number;
  totalPayablePaise: number;
  serviceType: ServiceType;
  paymentMethod: 'cash' | 'upi' | 'card';
  tenderedPaise?: number;
  changePaise?: number;
}): CompletedOrder {
  if (!params.items || params.items.length === 0) {
    throw new Error('Cannot create an order with an empty cart');
  }

  const { tokenNumber, tokenDisplay } = getNextToken();

  return {
    tokenNumber,
    tokenDisplay,
    timestamp: new Date(),
    items: [...params.items],
    subtotalPaise: params.subtotalPaise,
    discountPaise: params.discountPaise,
    taxPreviewPaise: params.taxPreviewPaise,
    totalPayablePaise: params.totalPayablePaise,
    serviceType: params.serviceType,
    paymentMethod: params.paymentMethod,
    tenderedPaise: params.tenderedPaise,
    changePaise: params.changePaise,
  };
}
