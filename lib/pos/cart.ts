/**
 * Everytime Creamery — Staff POS Cart Domain
 * Phase 1: Interactive Staff POS Interface
 *
 * Implements pure, immutable cart functions with deterministic line identification,
 * quantity updates, duplicate product merging, and financial recalculations.
 */

import {
  DiscountConfig,
  TaxConfig,
  DEFAULT_TAX_CONFIG,
  calculateLineTotalPaise,
  calculateSubtotalPaise,
  calculateDiscountPaise,
  calculateTaxPreviewPaise,
  calculateFinalPayablePaise,
} from './calculations';

export type ServiceType = 'dine_in' | 'parcel';
export type PaymentMethod = 'cash' | 'upi' | 'card';

export interface POSCartItem {
  /** Stable line identity based on product, variant, and add-on */
  lineId: string;
  productId: string;
  productName: string;
  variantId?: string;
  variantLabel?: string;
  addOnId?: string;
  addOnLabel?: string;
  unitPricePaise: number;
  quantity: number;
  lineTotalPaise: number;
}

export interface POSCartState {
  items: POSCartItem[];
  serviceType: ServiceType;
  discount: DiscountConfig;
  taxConfig: TaxConfig;
  subtotalPaise: number;
  discountPaise: number;
  discountedSubtotalPaise: number;
  taxPreviewPaise: number;
  totalPayablePaise: number;
  totalQuantity: number;
}

export interface AddItemToCartInput {
  productId: string;
  productName: string;
  unitPricePaise: number;
  quantity?: number;
  variantId?: string;
  variantLabel?: string;
  addOnId?: string;
  addOnLabel?: string;
}

/**
 * Deterministically generates a stable line identity.
 * Products with identical productId, variantId, and addOnId share the exact same lineId,
 * ensuring they merge safely into a single line with increased quantity.
 */
export function generatePOSCartLineId(
  productId: string,
  variantId?: string,
  addOnId?: string
): string {
  const vPart = variantId ? `var=${variantId}` : 'var=default';
  const aPart = addOnId ? `addon=${addOnId}` : 'addon=none';
  return `${productId}::${vPart}::${aPart}`;
}

/**
 * Creates a pristine initial POS cart state.
 */
export function createInitialPOSCart(
  serviceType: ServiceType = 'dine_in',
  taxConfig: TaxConfig = DEFAULT_TAX_CONFIG
): POSCartState {
  return {
    items: [],
    serviceType,
    discount: { type: 'none', percent: 0 },
    taxConfig,
    subtotalPaise: 0,
    discountPaise: 0,
    discountedSubtotalPaise: 0,
    taxPreviewPaise: 0,
    totalPayablePaise: 0,
    totalQuantity: 0,
  };
}

/**
 * Recalculates all cart totals from the line items array.
 */
export function recalculatePOSCart(
  items: POSCartItem[],
  serviceType: ServiceType,
  discount: DiscountConfig,
  taxConfig: TaxConfig = DEFAULT_TAX_CONFIG
): POSCartState {
  const subtotalPaise = calculateSubtotalPaise(items);
  const discountPaise = calculateDiscountPaise(subtotalPaise, discount);
  const discountedSubtotalPaise = Math.max(0, subtotalPaise - discountPaise);
  const taxPreviewPaise = calculateTaxPreviewPaise(discountedSubtotalPaise, taxConfig);
  const totalPayablePaise = calculateFinalPayablePaise(subtotalPaise, discountPaise, taxPreviewPaise);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  return {
    items,
    serviceType,
    discount,
    taxConfig,
    subtotalPaise,
    discountPaise,
    discountedSubtotalPaise,
    taxPreviewPaise,
    totalPayablePaise,
    totalQuantity,
  };
}

/**
 * Adds an item to the cart. If an identical line already exists, increments its quantity.
 */
export function addItemToPOSCart(
  state: POSCartState,
  input: AddItemToCartInput
): POSCartState {
  const quantityToAdd = Math.max(1, input.quantity ?? 1);
  const lineId = generatePOSCartLineId(input.productId, input.variantId, input.addOnId);

  const existingIndex = state.items.findIndex((item) => item.lineId === lineId);
  let updatedItems: POSCartItem[];

  if (existingIndex >= 0) {
    const existing = state.items[existingIndex];
    const newQuantity = existing.quantity + quantityToAdd;
    const updatedItem: POSCartItem = {
      ...existing,
      quantity: newQuantity,
      lineTotalPaise: calculateLineTotalPaise(existing.unitPricePaise, newQuantity),
    };
    updatedItems = [
      ...state.items.slice(0, existingIndex),
      updatedItem,
      ...state.items.slice(existingIndex + 1),
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
    updatedItems = [...state.items, newItem];
  }

  return recalculatePOSCart(updatedItems, state.serviceType, state.discount, state.taxConfig);
}

/**
 * Updates an item's quantity.
 * If newQuantity <= 0, the item is removed from the cart.
 */
export function updatePOSItemQuantity(
  state: POSCartState,
  lineId: string,
  newQuantity: number
): POSCartState {
  if (newQuantity <= 0) {
    return removePOSItem(state, lineId);
  }

  const updatedItems = state.items.map((item) => {
    if (item.lineId !== lineId) return item;
    return {
      ...item,
      quantity: newQuantity,
      lineTotalPaise: calculateLineTotalPaise(item.unitPricePaise, newQuantity),
    };
  });

  return recalculatePOSCart(updatedItems, state.serviceType, state.discount, state.taxConfig);
}

/**
 * Removes a line item directly from the cart.
 */
export function removePOSItem(state: POSCartState, lineId: string): POSCartState {
  const updatedItems = state.items.filter((item) => item.lineId !== lineId);
  return recalculatePOSCart(updatedItems, state.serviceType, state.discount, state.taxConfig);
}

/**
 * Clears the cart completely and returns a reset cart state with preserved serviceType and taxConfig.
 */
export function clearPOSCart(state: POSCartState): POSCartState {
  return createInitialPOSCart(state.serviceType, state.taxConfig);
}

/**
 * Sets the service type (Dine-in vs. Parcel).
 */
export function setPOSServiceType(state: POSCartState, serviceType: ServiceType): POSCartState {
  return recalculatePOSCart(state.items, serviceType, state.discount, state.taxConfig);
}

/**
 * Applies a discount to the cart.
 */
export function setPOSDiscount(state: POSCartState, discount: DiscountConfig): POSCartState {
  return recalculatePOSCart(state.items, state.serviceType, discount, state.taxConfig);
}

