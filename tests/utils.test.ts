import { describe, it, expect } from 'vitest';
import { cn, formatCurrency, formatOrderToken, formatDisplayTime } from '@/lib/utils';

describe('Shared Utilities', () => {
  describe('cn (Class Name Merger)', () => {
    it('merges multiple class strings correctly', () => {
      const result = cn('bg-cream', 'text-dark', { 'p-4': true, 'hidden': false });
      expect(result).toContain('bg-cream');
      expect(result).toContain('text-dark');
      expect(result).toContain('p-4');
      expect(result).not.toContain('hidden');
    });

    it('resolves conflicting Tailwind utilities appropriately', () => {
      const result = cn('p-2', 'p-4');
      expect(result).toBe('p-4');
    });
  });

  describe('formatCurrency', () => {
    it('formats numbers into standard INR currency strings', () => {
      const formatted = formatCurrency(250);
      expect(formatted).toMatch(/250/);
    });

    it('formats zero correctly', () => {
      const formatted = formatCurrency(0);
      expect(formatted).toMatch(/0/);
    });

    it('handles decimal amounts with two decimal places', () => {
      const formatted = formatCurrency(149.5);
      expect(formatted).toMatch(/149\.50/);
    });

    it('returns ₹0.00 fallback for invalid or NaN inputs', () => {
      expect(formatCurrency(NaN)).toBe('₹0.00');
      expect(formatCurrency(Infinity)).toBe('₹0.00');
    });
  });

  describe('formatOrderToken', () => {
    it('pads single-digit tokens to 3 digits with leading zeroes', () => {
      expect(formatOrderToken(7)).toBe('#007');
    });

    it('pads double-digit tokens to 3 digits', () => {
      expect(formatOrderToken(42)).toBe('#042');
    });

    it('formats triple-digit tokens correctly', () => {
      expect(formatOrderToken(158)).toBe('#158');
    });

    it('handles negative or invalid numbers safely', () => {
      expect(formatOrderToken(-1)).toBe('#000');
      expect(formatOrderToken(NaN)).toBe('#000');
    });
  });

  describe('formatDisplayTime', () => {
    it('formats a valid date into a display time string', () => {
      const date = new Date(2026, 0, 1, 14, 30);
      const time = formatDisplayTime(date);
      expect(time).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/i);
    });

    it('returns fallback string for invalid date input', () => {
      expect(formatDisplayTime('invalid-date')).toBe('--:--');
    });
  });
});

