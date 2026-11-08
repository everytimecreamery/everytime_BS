/**
 * Everytime Creamery — Pricing & Currency Utilities
 * Phase 1: Interactive Staff POS Interface
 *
 * All monetary calculations use INTEGER PAISE (1 INR = 100 Paise)
 * to avoid floating-point drift and precision errors.
 *
 * NOTE: Production tax rules, HSN codes, discounts, and rounding algorithms
 * are explicitly scheduled for Phase 3 (Pricing and Billing Engine).
 */

/**
 * Calculates line total in paise for a given item unit price and quantity.
 */
export function calculateLineTotalPaise(unitPricePaise: number, quantity: number): number {
  if (!Number.isFinite(unitPricePaise) || !Number.isFinite(quantity)) {
    return 0;
  }
  const safeQty = Math.max(0, Math.floor(quantity));
  const safeUnitPrice = Math.max(0, Math.floor(unitPricePaise));
  return safeUnitPrice * safeQty;
}

/**
 * Calculates cart subtotal in paise from an array of items.
 */
export function calculateSubtotalPaise(
  items: Array<{ unitPricePaise: number; quantity: number }>
): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce((acc, item) => {
    return acc + calculateLineTotalPaise(item.unitPricePaise, item.quantity);
  }, 0);
}

/**
 * Calculates estimated mock tax in paise (e.g., 5% demonstration rate).
 * Tax rules are unfinalized until Phase 3.
 */
export function calculateEstimatedTaxPaise(subtotalPaise: number, taxRatePercent: number = 0): number {
  if (!Number.isFinite(subtotalPaise) || subtotalPaise <= 0 || taxRatePercent <= 0) {
    return 0;
  }
  return Math.round((subtotalPaise * taxRatePercent) / 100);
}

/**
 * Calculates total payable estimate in paise.
 */
export function calculateTotalPaise(subtotalPaise: number, estimatedTaxPaise: number = 0): number {
  return Math.max(0, subtotalPaise + estimatedTaxPaise);
}

/**
 * Formats integer paise into standard Indian Rupee currency representation.
 * Example: 9900 -> "₹99.00", 12000 -> "₹120.00", 0 -> "₹0.00"
 */
export function formatPaise(paise: number): string {
  if (!Number.isFinite(paise) || isNaN(paise) || paise < 0) {
    return '₹0.00';
  }
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

/** Alias for formatPaise */
export const formatCurrencyFromPaise = formatPaise;

