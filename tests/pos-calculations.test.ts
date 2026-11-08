import { describe, it, expect } from 'vitest';
import {
  calculateLineTotalPaise,
  calculateSubtotalPaise,
  validateDiscountPercent,
  calculateDiscountPaise,
  calculateTaxPreviewPaise,
  calculateFinalPayablePaise,
  calculateCashChangePaise,
  formatPaise,
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

    it('calculates final payable correctly: (Subtotal - Discount) + Tax', () => {
      const subtotal = 33800;  // ₹338.00
      const discount = 3380;   // ₹33.80 (10%)
      const tax = 1521;        // ₹15.21 (5% of 30420)
      // Final: 33800 - 3380 + 1521 = 31941 paise
      expect(calculateFinalPayablePaise(subtotal, discount, tax)).toBe(31941);
    });

    it('prevents negative final payable if discount exceeds subtotal', () => {
      expect(calculateFinalPayablePaise(1000, 2000, 0)).toBe(0);
    });
  });

  describe('Cash Change Calculations', () => {
    it('calculates change due when tendered amount is greater than payable', () => {
      const payable = 33800;  // ₹338.00
      const tendered = 50000; // ₹500.00
      expect(calculateCashChangePaise(tendered, payable)).toBe(16200); // ₹162.00
    });

    it('returns zero change when exact amount is tendered', () => {
      expect(calculateCashChangePaise(33800, 33800)).toBe(0);
    });

    it('returns zero change when tendered amount is less than payable', () => {
      expect(calculateCashChangePaise(20000, 33800)).toBe(0);
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

