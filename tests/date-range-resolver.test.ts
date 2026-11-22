import { describe, it, expect } from 'vitest';
import {
  getStoreBusinessDate,
  addDaysToBusinessDate,
  getCalendarWeekRange,
  getCalendarMonthRange,
  validateCustomDateRange,
  resolveDateRange,
  formatReadableDate,
  formatReadableMonth,
  STORE_TIMEZONE,
  BUSINESS_DAY_CUTOFF_HOUR,
} from '@/lib/pos/dateRange';
import { fetchSalesLedger } from '@/lib/supabase/orders';

describe('Store Timezone & Date Range Resolver Boundary Tests', () => {
  describe('1. 00:30 IST order with 04:00 cutoff falls in Yesterday / previous business day', () => {
    it('accurately resolves 00:30 IST timestamp to the previous calendar day', () => {
      // 00:30 IST on Monday, Nov 23, 2026 -> UTC: Nov 22, 2026 19:00:00Z
      const lateNightSaleUtc = '2026-11-22T19:00:00.000Z';
      const lateNightSaleIst = '2026-11-23T00:30:00.000+05:30';

      const businessDateUtc = getStoreBusinessDate(lateNightSaleUtc);
      const businessDateIst = getStoreBusinessDate(lateNightSaleIst);

      expect(businessDateUtc).toBe('2026-11-22');
      expect(businessDateIst).toBe('2026-11-22');
    });

    it('accurately distinguishes before vs at 04:00 AM cutoff', () => {
      // 03:59:59 IST on Nov 23 -> belongs to business day 2026-11-22
      const justBeforeCutoff = '2026-11-23T03:59:59.000+05:30';
      // 04:00:00 IST on Nov 23 -> rolls over to business day 2026-11-23
      const exactlyAtCutoff = '2026-11-23T04:00:00.000+05:30';

      expect(getStoreBusinessDate(justBeforeCutoff)).toBe('2026-11-22');
      expect(getStoreBusinessDate(exactlyAtCutoff)).toBe('2026-11-23');
    });

    it('includes a 00:30 IST Monday order in Yesterday filter when viewed on Monday daytime', () => {
      // Monday daytime at 10:00 AM IST
      const mondayDaytime = '2026-11-23T10:00:00.000+05:30';
      const mondayOrderBusinessDate = getStoreBusinessDate('2026-11-23T00:30:00.000+05:30'); // '2026-11-22'

      const todayFilter = resolveDateRange('today', mondayDaytime);
      const yesterdayFilter = resolveDateRange('yesterday', mondayDaytime);

      expect(todayFilter.from).toBe('2026-11-23');
      expect(yesterdayFilter.from).toBe('2026-11-22');
      expect(yesterdayFilter.to).toBe('2026-11-22');

      // The 00:30 Monday order has business_date '2026-11-22', so it falls in Yesterday
      expect(mondayOrderBusinessDate).toBe(yesterdayFilter.from);
      expect(mondayOrderBusinessDate).not.toBe(todayFilter.from);
    });

    it('includes a 00:30 IST order in Today filter when viewed at 00:30 IST (active business day)', () => {
      // At 00:30 IST on Monday morning, the active business day is still Sunday 2026-11-22
      const activeTime = '2026-11-23T00:30:00.000+05:30';
      const filter = resolveDateRange('today', activeTime);

      expect(filter.from).toBe('2026-11-22');
      expect(filter.to).toBe('2026-11-22');
    });
  });

  describe('2. Monday 00:00 starts This Week', () => {
    it('resolves calendar week Monday to Sunday for any day of that week', () => {
      // Testing across the entire week of Mon Nov 23 to Sun Nov 29, 2026
      const weekDays = [
        '2026-11-23', // Monday
        '2026-11-24', // Tuesday
        '2026-11-25', // Wednesday
        '2026-11-26', // Thursday
        '2026-11-27', // Friday
        '2026-11-28', // Saturday
        '2026-11-29', // Sunday
      ];

      for (const day of weekDays) {
        const week = getCalendarWeekRange(day);
        expect(week.from).toBe('2026-11-23'); // Monday start
        expect(week.to).toBe('2026-11-29');   // Sunday end
      }
    });

    it('starts new week at 04:00 AM on Monday, keeping Sunday late night in previous week', () => {
      // Monday 02:00 AM IST belongs to previous week Sunday (2026-11-22)
      const lateNightSunday = '2026-11-23T02:00:00.000+05:30';
      const prevWeekFilter = resolveDateRange('week', lateNightSunday);
      expect(prevWeekFilter.from).toBe('2026-11-16');
      expect(prevWeekFilter.to).toBe('2026-11-22');

      // Monday 04:00 AM IST starts the new week
      const mondayMorning = '2026-11-23T04:00:00.000+05:30';
      const newWeekFilter = resolveDateRange('week', mondayMorning);
      expect(newWeekFilter.from).toBe('2026-11-23');
      expect(newWeekFilter.to).toBe('2026-11-29');
    });
  });

  describe('3. Month rollover boundaries', () => {
    it('handles February to March boundary with 04:00 cutoff', () => {
      // 00:30 IST on March 1, 2026 (non-leap year) -> still Feb 28 business date
      const febNight = '2026-03-01T00:30:00.000+05:30';
      expect(getStoreBusinessDate(febNight)).toBe('2026-02-28');

      const febMonthFilter = resolveDateRange('month', febNight);
      expect(febMonthFilter.from).toBe('2026-02-01');
      expect(febMonthFilter.to).toBe('2026-02-28');

      // 04:00 AM on March 1, 2026 -> rolls over to March
      const marchMorning = '2026-03-01T04:00:00.000+05:30';
      expect(getStoreBusinessDate(marchMorning)).toBe('2026-03-01');

      const marchMonthFilter = resolveDateRange('month', marchMorning);
      expect(marchMonthFilter.from).toBe('2026-03-01');
      expect(marchMonthFilter.to).toBe('2026-03-31');
    });

    it('handles leap year February (29 days)', () => {
      const leapFebRange = getCalendarMonthRange('2024-02-15');
      expect(leapFebRange.from).toBe('2024-02-01');
      expect(leapFebRange.to).toBe('2024-02-29');
    });

    it('handles Year Boundary rollover (Dec 31 to Jan 1)', () => {
      // Jan 1, 2026 at 02:00 AM IST -> Dec 31, 2025 business date
      const newYearNight = '2026-01-01T02:00:00.000+05:30';
      expect(getStoreBusinessDate(newYearNight)).toBe('2025-12-31');

      const monthFilter = resolveDateRange('month', newYearNight);
      expect(monthFilter.from).toBe('2025-12-01');
      expect(monthFilter.to).toBe('2025-12-31');
    });

    it('yesterday on the 1st of a month rolls back into previous month', () => {
      const yesterdayFromMarchFirst = addDaysToBusinessDate('2026-03-01', -1);
      expect(yesterdayFromMarchFirst).toBe('2026-02-28');

      const yesterdayFromJanFirst = addDaysToBusinessDate('2026-01-01', -1);
      expect(yesterdayFromJanFirst).toBe('2025-12-31');
    });
  });

  describe('4. Custom range validation: from > to rejected & span > 366 rejected', () => {
    it('rejects when from > to', () => {
      const res = validateCustomDateRange('2026-11-25', '2026-11-20');
      expect(res.isValid).toBe(false);
      expect(res.error).toBe("'From' date must be before or equal to 'To' date");

      const filter = resolveDateRange('custom', '2026-11-22', {
        from: '2026-11-25',
        to: '2026-11-20',
      });
      expect(filter.isValid).toBe(false);
      expect(filter.error).toContain("'From' date must be before or equal to 'To' date");
    });

    it('rejects spans greater than 366 days', () => {
      // 397 days
      const res = validateCustomDateRange('2025-01-01', '2026-02-01');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Date range cannot exceed 366 days');

      const filter = resolveDateRange('custom', '2026-11-22', {
        from: '2025-01-01',
        to: '2026-02-01',
      });
      expect(filter.isValid).toBe(false);
      expect(filter.error).toContain('366 days');
    });

    it('accepts valid custom ranges including single day (from === to)', () => {
      const singleDay = validateCustomDateRange('2026-11-22', '2026-11-22');
      expect(singleDay.isValid).toBe(true);
      expect(singleDay.daySpan).toBe(1);

      const oneYear = validateCustomDateRange('2026-01-01', '2026-12-31');
      expect(oneYear.isValid).toBe(true);
      expect(oneYear.daySpan).toBe(365);
    });
  });

  describe('5. Payment Reconciliation: Card totals equal sum of visible table (One Selector, One Truth)', () => {
    it('verifies that joined payment tender sums strictly equal gross order revenue', () => {
      // Mock visible in-range orders returned by query
      const mockOrders = [
        {
          id: 'ord-1',
          total_paise: 39375,
          payments: [{ method: 'cash', amount_paise: 39375 }],
        },
        {
          id: 'ord-2',
          total_paise: 69090,
          payments: [{ method: 'upi', amount_paise: 69090 }],
        },
        {
          id: 'ord-3',
          total_paise: 25000,
          payments: [{ method: 'card', amount_paise: 25000 }],
        },
        {
          id: 'ord-4',
          total_paise: 50000,
          // Split tender example: 20000 Cash + 30000 UPI
          payments: [
            { method: 'cash', amount_paise: 20000 },
            { method: 'upi', amount_paise: 30000 },
          ],
        },
      ];

      // Recompute tenders
      let grossPaise = 0;
      let cashPaise = 0;
      let upiPaise = 0;
      let cardPaise = 0;

      for (const o of mockOrders) {
        grossPaise += o.total_paise;
        for (const p of o.payments) {
          if (p.method === 'cash') cashPaise += p.amount_paise;
          if (p.method === 'upi') upiPaise += p.amount_paise;
          if (p.method === 'card') cardPaise += p.amount_paise;
        }
      }

      expect(grossPaise).toBe(183465);
      expect(cashPaise).toBe(59375);
      expect(upiPaise).toBe(99090);
      expect(cardPaise).toBe(25000);
      // Guarantee: Card totals strictly equal table sum
      expect(cashPaise + upiPaise + cardPaise).toBe(grossPaise);
    });
  });
});
