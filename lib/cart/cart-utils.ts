/**
 * Everytime Creamery — Cart Management Utilities
 * Phase 1: Interactive Staff POS Interface
 *
 * Provides pure, deterministic functions for maintaining cart state,
 * calculating line identities, and validating gelato configurations.
 */

import { CartState, CartLineItem, CartItemConfiguration } from './cart-types';
import {
  calculateLineTotalPaise,
  calculateSubtotalPaise,
  calculateEstimatedTaxPaise,
  calculateTotalPaise,
} from './pricing';
import { Product } from '@/lib/mock-data/products';
import { GelatoCupSize } from '@/types';

/**
 * Deterministically generates a stable line identity based on product and configuration.
 * Items with identical product, size, and flavor selections produce the exact same ID,
 * allowing safe merging of line items without collision.
 */
export function generateCartLineId(
  productId: string,
  configuration?: CartItemConfiguration
): string {
  if (!configuration) {
    return `${productId}::default`;
  }

  const sizePart = configuration.size ? `size=${configuration.size}` : 'size=default';

  // Sort flavor IDs to ensure order of selection does not fragment identical configurations
  const flavorIds = (configuration.flavors || [])
    .map((f) => f.id)
    .sort()
    .join(',');

  const flavorPart = flavorIds ? `flavors=${flavorIds}` : 'flavors=none';
  const notesPart = configuration.notes ? `notes=${configuration.notes.trim()}` : '';

  return [productId, sizePart, flavorPart, notesPart].filter(Boolean).join('::');
}

/**
 * Returns a pristine initial cart state.
 */
export function createInitialCartState(): CartState {
  return {
    items: [],
    subtotalPaise: 0,
    estimatedTaxPaise: 0,
    totalPaise: 0,
    totalItemQuantity: 0,
  };
}

/**
 * Recalculates subtotal, estimated tax, total, and item counts for a set of cart items.
 */
export function recalculateCart(
  items: CartLineItem[],
  taxRatePercent: number = 0
): CartState {
  const subtotalPaise = calculateSubtotalPaise(items);
  const estimatedTaxPaise = calculateEstimatedTaxPaise(subtotalPaise, taxRatePercent);
  const totalPaise = calculateTotalPaise(subtotalPaise, estimatedTaxPaise);
  const totalItemQuantity = items.reduce((acc, item) => acc + item.quantity, 0);

  return {
    items,
    subtotalPaise,
    estimatedTaxPaise,
    totalPaise,
    totalItemQuantity,
  };
}

export interface AddItemInput {
  productId: string;
  productName: string;
  unitPricePaise: number;
  quantity?: number;
  configuration?: CartItemConfiguration;
}

/**
 * Adds an item to the cart or increments quantity if an identical configuration already exists.
 */
export function addItemToCart(
  state: CartState,
  input: AddItemInput,
  taxRatePercent: number = 0
): CartState {
  const quantityToAdd = Math.max(1, input.quantity ?? 1);
  const lineId = generateCartLineId(input.productId, input.configuration);

  const existingIndex = state.items.findIndex((item) => item.id === lineId);

  let updatedItems: CartLineItem[];

  if (existingIndex >= 0) {
    const existing = state.items[existingIndex];
    const newQty = existing.quantity + quantityToAdd;
    const updatedItem: CartLineItem = {
      ...existing,
      quantity: newQty,
      lineTotalPaise: calculateLineTotalPaise(existing.unitPricePaise, newQty),
    };
    updatedItems = [
      ...state.items.slice(0, existingIndex),
      updatedItem,
      ...state.items.slice(existingIndex + 1),
    ];
  } else {
    const newItem: CartLineItem = {
      id: lineId,
      productId: input.productId,
      productName: input.productName,
      unitPricePaise: input.unitPricePaise,
      quantity: quantityToAdd,
      configuration: input.configuration,
      lineTotalPaise: calculateLineTotalPaise(input.unitPricePaise, quantityToAdd),
    };
    updatedItems = [...state.items, newItem];
  }

  return recalculateCart(updatedItems, taxRatePercent);
}

/**
 * Updates quantity of a cart line item.
 * NOTE: Enforces quantity >= 1. Quantities below 1 are clamped to 1.
 * To remove an item, use `removeItemFromCart`.
 */
export function updateItemQuantity(
  state: CartState,
  lineId: string,
  newQuantity: number,
  taxRatePercent: number = 0
): CartState {
  const safeQty = Math.max(1, Math.floor(newQuantity));

  const updatedItems = state.items.map((item) => {
    if (item.id !== lineId) return item;
    return {
      ...item,
      quantity: safeQty,
      lineTotalPaise: calculateLineTotalPaise(item.unitPricePaise, safeQty),
    };
  });

  return recalculateCart(updatedItems, taxRatePercent);
}

/**
 * Removes a specific line item from the cart by its line ID.
 */
export function removeItemFromCart(
  state: CartState,
  lineId: string,
  taxRatePercent: number = 0
): CartState {
  const updatedItems = state.items.filter((item) => item.id !== lineId);
  return recalculateCart(updatedItems, taxRatePercent);
}

/**
 * Clears all items and resets the cart to initial state.
 */
export function clearCart(): CartState {
  return createInitialCartState();
}

/**
 * Validates a product's configuration against business constraints.
 *
 * Rules:
 * - Piccolo: exactly 1 flavor required.
 * - Medio: exactly 2 flavors required.
 * - Grande: exactly 3 flavors required.
 * - Tub (500ml): requires 1 or 2 flavors (up to maxFlavors).
 * - Non-gelato (espresso, affogato): no configuration required.
 */
export function validateProductConfiguration(
  product: Product,
  configuration?: CartItemConfiguration
): { isValid: boolean; error?: string; requiredCount: number } {
  // Non-configurable items
  if (!product.requiresConfiguration) {
    return { isValid: true, requiredCount: 0 };
  }

  // Determine required flavor count
  let requiredCount = 0;
  const size = configuration?.size || product.fixedSize;

  if (size === 'piccolo') {
    requiredCount = 1;
  } else if (size === 'medio') {
    requiredCount = 2;
  } else if (size === 'grande') {
    requiredCount = 3;
  } else if (product.maxFlavors) {
    requiredCount = product.maxFlavors;
  }

  const selectedCount = configuration?.flavors?.length ?? 0;

  if (requiredCount > 0 && selectedCount !== requiredCount) {
    return {
      isValid: false,
      error: `Please select exactly ${requiredCount} flavor${requiredCount > 1 ? 's' : ''} (currently selected: ${selectedCount}).`,
      requiredCount,
    };
  }

  return { isValid: true, requiredCount };
}

/**
 * Returns the scoop count for a given gelato cup size.
 */
export function getScoopCountForSize(size: GelatoCupSize): number {
  switch (size) {
    case 'piccolo':
      return 1;
    case 'medio':
      return 2;
    case 'grande':
      return 3;
    default:
      return 1;
  }
}

