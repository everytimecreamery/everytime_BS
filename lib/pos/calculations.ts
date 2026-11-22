/**
 * Everytime Creamery — Staff POS Calculations Engine
 * Phase 1: Pure, Deterministic Financial Utilities
 *
 * Rules:
 * - All calculations strictly executed in INTEGER PAISE (1 INR = 100 paise).
 * - Floating point numbers are forbidden for monetary totals.
 * - Tax preview is configurable and explicitly identified as a prototype preview.
 * - Discounts are validated strictly between 0% and 100%.
 */

export type DiscountType = 'none' | 'percent_5' | 'percent_10' | 'custom';

export interface DiscountConfig {
  type: DiscountType;
  /** Percentage value (0 - 100) */
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
 * Rejects negative numbers and numbers above 100.
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
    return { isValid: false, sanitizedPercent: 100, error: 'Discount cannot exceed 100%' };
  }
  return { isValid: true, sanitizedPercent: Math.round(percent * 100) / 100 };
}

/**
 * Calculates discount amount in paise.
 */
export function calculateDiscountPaise(
  subtotalPaise: number,
  discount: DiscountConfig
): number {
  if (!Number.isFinite(subtotalPaise) || subtotalPaise <= 0) return 0;
  const validation = validateDiscountPercent(discount.percent);
  if (!validation.isValid && discount.percent < 0) return 0;

  const validPercent = validation.sanitizedPercent;
  if (validPercent <= 0) return 0;

  return Math.round((subtotalPaise * validPercent) / 100);
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
  if (taxConfig.ratePercent <= 0) return 0;

  return Math.round((discountedSubtotalPaise * taxConfig.ratePercent) / 100);
}

/**
 * Calculates integer-only round-off in paise to round the final payable
 * to the nearest whole rupee, half-up.
 * r = grossPayablePaise % 100
 * roundOffPaise = r >= 50 ? 100 - r : -r
 * Examples:
 *   10395 -> +5 (10400)
 *   10349 -> -49 (10300)
 *   10350 -> +50 (10400)
 *   10000 -> 0 (10000)
 *       0 -> 0 (0)
 */
export function calculateRoundOffPaise(grossPayablePaise: number): number {
  if (!Number.isFinite(grossPayablePaise) || grossPayablePaise <= 0) return 0;
  const safeGross = Math.max(0, Math.round(grossPayablePaise));
  const r = safeGross % 100;
  if (r === 0) return 0;
  return r >= 50 ? 100 - r : -r;
}

export interface FinancialBreakdown {
  subtotalPaise: number;
  discountPaise: number;
  taxableSubtotalPaise: number;
  taxPreviewPaise: number;
  grossPayablePaise: number;
  roundOffPaise: number;
  finalPayablePaise: number;
}

/**
 * Calculates complete order financial breakdown with integer-only round-off.
 * Round ONLY the final payable. Never round line items, subtotal, discount, or tax.
 */
export function calculateOrderFinancialBreakdown(
  subtotalPaise: number,
  discountPaise: number,
  taxPreviewPaise: number
): FinancialBreakdown {
  const safeSubtotal = Math.max(0, Math.round(subtotalPaise));
  const safeDiscount = Math.min(safeSubtotal, Math.max(0, Math.round(discountPaise)));
  const taxableSubtotalPaise = Math.max(0, safeSubtotal - safeDiscount);
  const safeTax = Math.max(0, Math.round(taxPreviewPaise));
  const grossPayablePaise = taxableSubtotalPaise + safeTax;

  if (grossPayablePaise === 0) {
    return {
      subtotalPaise: safeSubtotal,
      discountPaise: safeDiscount,
      taxableSubtotalPaise,
      taxPreviewPaise: safeTax,
      grossPayablePaise: 0,
      roundOffPaise: 0,
      finalPayablePaise: 0,
    };
  }

  const roundOffPaise = calculateRoundOffPaise(grossPayablePaise);
  const finalPayablePaise = grossPayablePaise + roundOffPaise;

  return {
    subtotalPaise: safeSubtotal,
    discountPaise: safeDiscount,
    taxableSubtotalPaise,
    taxPreviewPaise: safeTax,
    grossPayablePaise,
    roundOffPaise,
    finalPayablePaise,
  };
}

/**
 * Calculates the final payable amount in paise with rupee round-half-up applied.
 */
export function calculateFinalPayablePaise(
  subtotalPaise: number,
  discountPaise: number,
  taxPaise: number
): number {
  const breakdown = calculateOrderFinancialBreakdown(subtotalPaise, discountPaise, taxPaise);
  return breakdown.finalPayablePaise;
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
  const cgstPaise = Math.round(safeTax / 2);
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

/**
 * Formats signed round-off paise for UI presentation:
 * +₹0.05, -₹0.49, or ₹0.00.
 */
export function formatSignedRoundOffPaise(roundOffPaise: number): string {
  if (!Number.isFinite(roundOffPaise) || roundOffPaise === 0) {
    return '₹0.00';
  }
  const absFormatted = formatPaise(Math.abs(roundOffPaise), true);
  return roundOffPaise > 0 ? `+${absFormatted}` : `-${absFormatted}`;
}

/**
 * Generates standard UPI QR Intent URI with exact rounded rupees in am= parameter.
 * e.g., upi://pay?pa=...&pn=...&am=104.00&cu=INR
 */
export function generateUpiQrString(
  vpa: string,
  payeeName: string,
  amountPaise: number,
  orderToken?: string
): string {
  const roundedRupees = (Math.max(0, amountPaise) / 100).toFixed(2);
  const params = new URLSearchParams();
  params.set('pa', vpa);
  params.set('pn', payeeName);
  params.set('am', roundedRupees);
  params.set('cu', 'INR');
  if (orderToken) {
    params.set('tn', `Order ${orderToken}`);
  }
  return `upi://pay?${params.toString()}`;
}


