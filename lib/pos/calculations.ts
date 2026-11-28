/**
 * Everytime Creamery — Staff POS Calculations Engine
 * Phase 1: Pure, Deterministic Financial Utilities
 *
 * Rules:
 * - All calculations strictly executed in INTEGER PAISE (1 INR = 100 paise).
 * - Floating point numbers are forbidden for monetary totals.
 * - Tax preview is configurable and explicitly identified as a prototype preview.
 * - Discounts are validated strictly between 0% and less than 100%.
 */

export type DiscountType = 'none' | 'percent_5' | 'percent_10' | 'custom';

export interface DiscountConfig {
  type: DiscountType;
  /** Percentage value (0 <= percent < 100) */
  percent: number;
}

export interface TaxConfig {
  /** Configurable GST rate in percent (e.g. 5 for 5% GST prototype) */
  ratePercent: number;
  /** Prototype flag */
  isProvisional: boolean;
}

export const DEFAULT_TAX_CONFIG: TaxConfig = {
  ratePercent: 5,
  isProvisional: true,
};

/**
 * Calculates line total in paise.
 */
export function calculateLineTotalPaise(unitPricePaise: number, quantity: number): number {
  if (!Number.isFinite(unitPricePaise) || !Number.isFinite(quantity)) {
    return 0;
  }
  const safeQty = Math.max(0, Math.floor(quantity));
  const safePrice = Math.max(0, Math.floor(unitPricePaise));
  return safePrice * safeQty;
}

/**
 * Calculates cart subtotal in paise from an array of items.
 */
export function calculateSubtotalPaise(
  items: Array<{ unitPricePaise: number; quantity: number }>
): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => {
    return sum + calculateLineTotalPaise(item.unitPricePaise, item.quantity);
  }, 0);
}

/**
 * Validates a discount percentage.
 * Rejects negative numbers and discounts >= 100% (complimentary orders are not enabled).
 */
export function validateDiscountPercent(percent: number): {
  isValid: boolean;
  sanitizedPercent: number;
  error?: string;
} {
  if (!Number.isFinite(percent) || isNaN(percent)) {
    return { isValid: false, sanitizedPercent: 0, error: 'Discount must be a valid number' };
  }
  if (percent < 0) {
    return { isValid: false, sanitizedPercent: 0, error: 'Discount cannot be negative' };
  }
  if (percent > 100) {
    return {
      isValid: false,
      sanitizedPercent: 0,
      error: 'Discount cannot exceed 100% and must be less than 100%.',
    };
  }
  const rounded = Math.round(percent * 100) / 100;
  if (rounded >= 100) {
    return {
      isValid: false,
      sanitizedPercent: 0,
      error:
        '100% discounts (complimentary orders) are not currently enabled. Discount must be less than 100%.',
    };
  }
  return { isValid: true, sanitizedPercent: rounded };
}

/**
 * Calculates discount amount in paise using scaled integer math so half-up
 * rounding matches PostgreSQL NUMERIC arithmetic without IEEE-754 float drift.
 */
export function calculateDiscountPaise(
  subtotalPaise: number,
  discount: DiscountConfig
): number {
  if (!Number.isFinite(subtotalPaise) || subtotalPaise <= 0) return 0;
  const validation = validateDiscountPercent(discount.percent);
  if (!validation.isValid) return 0;

  const validPercent = validation.sanitizedPercent;
  if (validPercent <= 0) return 0;

  const safeSubtotal = Math.floor(subtotalPaise);
  const percentBasisPoints = Math.round(validPercent * 100);
  return Math.min(safeSubtotal, Math.floor((safeSubtotal * percentBasisPoints + 5000) / 10000));
}

/**
 * Calculates tax preview in paise on the discounted subtotal.
 * Marked as prototype preview per business guidance.
 */
export function calculateTaxPreviewPaise(
  discountedSubtotalPaise: number,
  taxConfig: TaxConfig = DEFAULT_TAX_CONFIG
): number {
  if (!Number.isFinite(discountedSubtotalPaise) || discountedSubtotalPaise <= 0) {
    return 0;
  }
  if (!Number.isFinite(taxConfig.ratePercent) || taxConfig.ratePercent <= 0) return 0;

  const safeSubtotal = Math.floor(discountedSubtotalPaise);
  const rateBasisPoints = Math.round(taxConfig.ratePercent * 100);
  return Math.floor((safeSubtotal * rateBasisPoints + 5000) / 10000);
}

/**
 * Calculates the final payable amount in paise.
 */
export function calculateFinalPayablePaise(
  subtotalPaise: number,
  discountPaise: number,
  taxPaise: number
): number {
  const safeSubtotal = Math.max(0, subtotalPaise);
  const safeDiscount = Math.min(safeSubtotal, Math.max(0, discountPaise));
  const safeTax = Math.max(0, taxPaise);

  return safeSubtotal - safeDiscount + safeTax;
}

/**
 * Splits total tax into CGST and SGST paise.
 * Guarantees cgstPaise + sgstPaise === taxPaise on both even and odd paise totals.
 */
export function calculateTaxSplitPaise(taxPaise: number): {
  cgstPaise: number;
  sgstPaise: number;
} {
  const safeTax = Math.max(0, Math.round(taxPaise));
  const cgstPaise = Math.floor((safeTax + 1) / 2);
  const sgstPaise = safeTax - cgstPaise;
  return { cgstPaise, sgstPaise };
}

/**
 * Calculates change due for cash transactions.
 */
export function calculateCashChangePaise(
  tenderedPaise: number,
  payablePaise: number
): number {
  if (!Number.isFinite(tenderedPaise) || tenderedPaise <= payablePaise) {
    return 0;
  }
  return tenderedPaise - payablePaise;
}

/**
 * Formats integer paise into Indian Rupee presentation.
 * Returns standard Indian formatting (e.g. ₹169.00 or ₹169).
 */
export function formatPaise(paise: number, includeDecimals: boolean = false): string {
  if (!Number.isFinite(paise) || isNaN(paise) || paise < 0) {
    return includeDecimals ? '₹0.00' : '₹0';
  }
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: includeDecimals ? 2 : (rupees % 1 === 0 ? 0 : 2),
    maximumFractionDigits: 2,
  }).format(rupees);
}

/**
 * Formats integer paise directly into rupee number (e.g., 16900 -> 169).
 */
export function paiseToRupees(paise: number): number {
  return Math.round(paise) / 100;
}

/**
 * Converts integer rupees to integer paise (e.g. 169 -> 16900).
 */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

