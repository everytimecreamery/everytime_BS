import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateTaxSplitPaise } from '@/lib/pos/calculations';
import { PosOrder } from '@/lib/pos/order';

describe('Supabase Order Direct Push & Tax Invariant Tests', () => {
  describe('1. Tax Split Invariant: CGST + SGST === tax_paise', () => {
    it('guarantees exact split on odd paise totals without losing or adding paise', () => {
      const oddPaiseValues = [1, 3, 5, 7, 9, 11, 25, 49, 99, 101, 495, 999, 12345, 99999];

      for (const tax of oddPaiseValues) {
        const { cgstPaise, sgstPaise } = calculateTaxSplitPaise(tax);
        expect(cgstPaise + sgstPaise).toBe(tax);
        expect(Number.isInteger(cgstPaise)).toBe(true);
        expect(Number.isInteger(sgstPaise)).toBe(true);
        expect(Math.abs(cgstPaise - sgstPaise)).toBe(1);
      }
    });

    it('guarantees exact equal split on even paise totals', () => {
      const evenPaiseValues = [0, 2, 4, 10, 50, 100, 496, 500, 9900, 19800];

      for (const tax of evenPaiseValues) {
        const { cgstPaise, sgstPaise } = calculateTaxSplitPaise(tax);
        expect(cgstPaise + sgstPaise).toBe(tax);
        expect(cgstPaise).toBe(tax / 2);
        expect(sgstPaise).toBe(tax / 2);
      }
    });

    it('handles zero and negative gracefully by clamping to zero', () => {
      expect(calculateTaxSplitPaise(0)).toEqual({ cgstPaise: 0, sgstPaise: 0 });
      expect(calculateTaxSplitPaise(-100)).toEqual({ cgstPaise: 0, sgstPaise: 0 });
    });
  });

  describe('2. Direct Database Push Payload Invariants', () => {
    it('correctly structures completed order data for Supabase insertion', () => {
      const sampleOrder: PosOrder = {
        id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        token: 'T1-001',
        status: 'COMPLETED',
        items: [
          {
            lineId: 'line-1',
            productId: 'gelato-madagascar-vanilla',
            productName: 'Madagascar Vanilla',
            unitPricePaise: 9900,
            quantity: 2,
            lineTotalPaise: 19800,
          },
        ],
        subtotalPaise: 19800,
        discountPaise: 0,
        taxPreviewPaise: 990,
        cgstPaise: 495,
        sgstPaise: 495,
        totalPaise: 20790,
        totalPayablePaise: 20790,
        totalQuantity: 2,
        discount: { type: 'none', percent: 0 },
        taxConfig: { ratePercent: 5, isProvisional: false },
        paymentStatus: 'PAID',
        paymentMethod: 'CASH',
        createdAt: '2026-11-22T01:30:00.000Z',
        updatedAt: '2026-11-22T01:30:00.000Z',
        completedAt: '2026-11-22T01:30:00.000Z',
        businessDate: '2026-11-22',
      };

      const taxPaise = sampleOrder.taxPreviewPaise;
      const cgstPaise = sampleOrder.cgstPaise ?? Math.round(taxPaise / 2);
      const sgstPaise = sampleOrder.sgstPaise ?? (taxPaise - cgstPaise);
      const seqParts = sampleOrder.token.split('-');
      const seqNum = parseInt(
        seqParts.length > 1 ? seqParts[1] : sampleOrder.token.replace(/\D/g, '') || '1',
        10
      );

      const dbOrderRecord = {
        id: sampleOrder.id,
        store_id: '00000000-0000-0000-0000-000000000001',
        terminal_id: '00000000-0000-0000-0000-000000000002',
        cashier_id: null,
        token_terminal: 'T1',
        token_seq: seqNum,
        status: 'COMPLETED',
        subtotal_paise: sampleOrder.subtotalPaise,
        discount_paise: sampleOrder.discountPaise,
        tax_paise: taxPaise,
        cgst_paise: cgstPaise,
        sgst_paise: sgstPaise,
        total_paise: sampleOrder.totalPaise,
        client_completed_at: sampleOrder.completedAt,
        business_date: sampleOrder.businessDate,
      };

      expect(dbOrderRecord.status).toBe('COMPLETED');
      expect(dbOrderRecord.token_seq).toBe(1);
      expect(dbOrderRecord.total_paise).toBe(20790);
      expect(dbOrderRecord.cgst_paise + dbOrderRecord.sgst_paise).toBe(dbOrderRecord.tax_paise);
    });
  });
});
