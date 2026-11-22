import { describe, it, expect } from 'vitest';
import {
  calculateLineTotalPaise,
  calculateSubtotalPaise,
  validateDiscountPercent,
  calculateDiscountPaise,
  calculateTaxPreviewPaise,
  calculateFinalPayablePaise,
  calculateRoundOffPaise,
  calculateOrderFinancialBreakdown,
  calculateCashChangePaise,
  formatPaise,
  formatSignedRoundOffPaise,
  generateUpiQrString,
  paiseToRupees,
  rupeesToPaise,
  DEFAULT_TAX_CONFIG,
} from '@/lib/pos/calculations';

describe('Staff POS Calculations Unit Tests (Phase 1)', () => {
  describe('Line Total and Subtotal Calculations', () => {
    it('calculates line totals in integer paise correctly', () => {
      expect(calculateLineTotalPaise(16900, 1)).toBe(16900); // 1x ₹169
      expect(calculateLineTotalPaise(16900, 2)).toBe(33800); // 2x ₹169 = ₹338
      expect(calculateLineTotalPaise(24900, 3)).toBe(74700); // 3x ₹249 = ₹747
      expect(calculateLineTotalPaise(1500, 4)).toBe(6000);   // 4x ₹15 = ₹60
    });

    it('handles zero or invalid quantities safely without throwing', () => {
      expect(calculateLineTotalPaise(16900, 0)).toBe(0);
      expect(calculateLineTotalPaise(16900, -1)).toBe(0);
      expect(calculateLineTotalPaise(NaN, 2)).toBe(0);
    });

    it('calculates cart subtotal across multiple lines', () => {
      const items = [
        { unitPricePaise: 16900, quantity: 2 }, // 33800
        { unitPricePaise: 24900, quantity: 1 }, // 24900
        { unitPricePaise: 1500, quantity: 2 },  // 3000
      ];
      // 33800 + 24900 + 3000 = 61700 paise (₹617.00)
      expect(calculateSubtotalPaise(items)).toBe(61700);
    });

    it('returns 0 for empty items array', () => {
      expect(calculateSubtotalPaise([])).toBe(0);
    });
  });

  describe('Discount Calculations & Validations', () => {
    it('applies no discount correctly', () => {
      const discount = { type: 'none' as const, percent: 0 };
      expect(calculateDiscountPaise(33800, discount)).toBe(0);
    });

    it('calculates 5% discount in integer paise', () => {
      const discount = { type: 'percent_5' as const, percent: 5 };
      // 33800 * 5% = 1690 paise (₹16.90)
      expect(calculateDiscountPaise(33800, discount)).toBe(1690);
    });

    it('calculates 10% discount in integer paise', () => {
      const discount = { type: 'percent_10' as const, percent: 10 };
      // 33800 * 10% = 3380 paise (₹33.80)
      expect(calculateDiscountPaise(33800, discount)).toBe(3380);
    });

    it('calculates custom discount in integer paise', () => {
      const discount = { type: 'custom' as const, percent: 15 };
      // 30000 * 15% = 4500 paise (₹45.00)
      expect(calculateDiscountPaise(30000, discount)).toBe(4500);
    });

    it('rejects negative discount percentages and falls back safely', () => {
      const res = validateDiscountPercent(-5);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('cannot be negative');

      const discount = { type: 'custom' as const, percent: -10 };
      expect(calculateDiscountPaise(33800, discount)).toBe(0);
    });

    it('rejects discount percentages exceeding 100% and falls back safely', () => {
      const res = validateDiscountPercent(150);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('cannot exceed 100%');
    });

    it('validates 0% and 100% boundary discounts', () => {
      expect(validateDiscountPercent(0).isValid).toBe(true);
      expect(validateDiscountPercent(100).isValid).toBe(true);
    });
  });

  describe('Tax Preview & Final Payable Calculations', () => {
    it('calculates 5% tax preview on discounted subtotal', () => {
      // Subtotal 20000 (₹200), 5% tax = 1000 paise (₹10)
      expect(calculateTaxPreviewPaise(20000, DEFAULT_TAX_CONFIG)).toBe(1000);
    });

    it('allows configurable tax rate in preview', () => {
      const customTax = { ratePercent: 12, isProvisional: true };
      // 10000 * 12% = 1200 paise
      expect(calculateTaxPreviewPaise(10000, customTax)).toBe(1200);
    });

    it('calculates final payable correctly with rupee round-half-up applied', () => {
      const subtotal = 33800;  // ₹338.00
      const discount = 3380;   // ₹33.80 (10%)
      const tax = 1521;        // ₹15.21 (5% of 30420)
      // Gross: 33800 - 3380 + 1521 = 31941 paise
      // Round-off: 31941 % 100 = 41 < 50 => -41 paise
      // Final rounded: 31900 paise (₹319.00)
      expect(calculateFinalPayablePaise(subtotal, discount, tax)).toBe(31900);
    });

    it('prevents negative final payable if discount exceeds subtotal', () => {
      expect(calculateFinalPayablePaise(1000, 2000, 0)).toBe(0);
    });
  });

  describe('Rupee Round-Off (Round-Half-Up, Integer-Only)', () => {
    it('rounds 10395 -> 10400 with roundOff +5', () => {
      const gross = 10395; // ₹103.95 (₹99 + 5% GST ₹4.95)
      const roundOff = calculateRoundOffPaise(gross);
      expect(roundOff).toBe(5);
      expect(gross + roundOff).toBe(10400);
    });

    it('rounds 10349 -> 10300 with -49', () => {
      const gross = 10349; // ₹103.49
      const roundOff = calculateRoundOffPaise(gross);
      expect(roundOff).toBe(-49);
      expect(gross + roundOff).toBe(10300);
    });

    it('rounds 10350 -> 10400 (half-up) with +50', () => {
      const gross = 10350; // ₹103.50
      const roundOff = calculateRoundOffPaise(gross);
      expect(roundOff).toBe(50);
      expect(gross + roundOff).toBe(10400);
    });

    it('leaves exact rupees unadjusted: 10000 -> 10000 with 0', () => {
      const gross = 10000; // ₹100.00
      const roundOff = calculateRoundOffPaise(gross);
      expect(roundOff).toBe(0);
      expect(gross + roundOff).toBe(10000);
    });

    it('handles zero taxable / empty orders safely: 0 -> 0 with round-off 0', () => {
      expect(calculateRoundOffPaise(0)).toBe(0);
      expect(calculateRoundOffPaise(-500)).toBe(0);

      const emptyBreakdown = calculateOrderFinancialBreakdown(0, 0, 0);
      expect(emptyBreakdown.grossPayablePaise).toBe(0);
      expect(emptyBreakdown.roundOffPaise).toBe(0);
      expect(emptyBreakdown.finalPayablePaise).toBe(0);
    });

    it('rounds ONLY final payable: never rounds line items, subtotal, discount, or tax', () => {
      // Scoop price ₹99 (9900 paise), 5% GST = 495 paise (₹4.95)
      const breakdown = calculateOrderFinancialBreakdown(9900, 0, 495);
      expect(breakdown.subtotalPaise).toBe(9900); // Unrounded
      expect(breakdown.discountPaise).toBe(0);
      expect(breakdown.taxPreviewPaise).toBe(495); // Unrounded tax: tax liability unaffected
      expect(breakdown.grossPayablePaise).toBe(10395); // Unrounded gross
      expect(breakdown.roundOffPaise).toBe(5); // +₹0.05 adjustment
      expect(breakdown.finalPayablePaise).toBe(10400); // Only final payable rounded to ₹104.00
    });

    it('formats signed round-off for UI presentation correctly', () => {
      expect(formatSignedRoundOffPaise(5)).toMatch(/\+₹\s?0\.05/);
      expect(formatSignedRoundOffPaise(-49)).toMatch(/-₹\s?0\.49/);
      expect(formatSignedRoundOffPaise(0)).toBe('₹0.00');
    });
  });

  describe('Cash Change Calculations with Rounded Total', () => {
    it('calculates change due when tendered amount is greater than payable', () => {
      const payable = 33800;  // ₹338.00
      const tendered = 50000; // ₹500.00
      expect(calculateCashChangePaise(tendered, payable)).toBe(16200); // ₹162.00
    });

    it('calculates cash change using the rounded final payable', () => {
      // ₹99 scoop + 5% GST = ₹103.95 gross -> ₹104 rounded (10400 paise)
      const roundedPayable = 10400;
      const tendered = 50000; // ₹500 note
      // 50000 - 10400 = 39600 paise (₹396.00 change)
      expect(calculateCashChangePaise(tendered, roundedPayable)).toBe(39600);
    });

    it('returns zero change when exact amount is tendered', () => {
      expect(calculateCashChangePaise(33800, 33800)).toBe(0);
    });

    it('returns zero change when tendered amount is less than payable', () => {
      expect(calculateCashChangePaise(20000, 33800)).toBe(0);
    });
  });

  describe('UPI QR String Generator', () => {
    it('generates standard UPI intent with exact rounded rupees in am= parameter', () => {
      const qrUrl = generateUpiQrString(
        'everytimecreamery@okhdfcbank',
        'Everytime Creamery',
        10400,
        '#001'
      );
      expect(qrUrl).toContain('upi://pay?');
      expect(qrUrl).toContain('pa=everytimecreamery%40okhdfcbank');
      expect(qrUrl).toContain('pn=Everytime+Creamery');
      expect(qrUrl).toContain('am=104.00');
      expect(qrUrl).toContain('cu=INR');
      expect(qrUrl).toContain('tn=Order+%23001');
    });

    it('handles zero or unpadded token cleanly', () => {
      const qrUrl = generateUpiQrString('merchant@upi', 'Creamery', 0);
      expect(qrUrl).toContain('am=0.00');
      expect(qrUrl).toContain('cu=INR');
    });
  });

  describe('Paise and Rupee Converters and Formatter', () => {
    it('converts between rupees and paise accurately', () => {
      expect(rupeesToPaise(169)).toBe(16900);
      expect(paiseToRupees(16900)).toBe(169);
      expect(rupeesToPaise(249.5)).toBe(24950);
      expect(paiseToRupees(24950)).toBe(249.5);
    });

    it('formats paise as Indian Rupee string without decimals when whole rupees', () => {
      const formatted = formatPaise(16900);
      expect(formatted).toMatch(/₹\s?169/);
    });

    it('formats paise with decimals when requested', () => {
      const formatted = formatPaise(16900, true);
      expect(formatted).toMatch(/₹\s?169\.00/);
    });
  });
});

