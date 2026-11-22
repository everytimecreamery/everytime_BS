/**
 * Everytime Creamery — Store Timezone & Business Day Range Resolver
 *
 * Rules:
 * - Store timezone is strictly 'Asia/Kolkata' (IST).
 * - Business day cutoff hour is 04:00 AM IST (04:00).
 *   Any timestamp before 04:00 AM IST belongs to the PREVIOUS business day.
 * - This Week = calendar Monday–Sunday in store timezone.
 * - This Month = calendar month in store timezone.
 * - Custom = inclusive business_date between from and to (validated: from <= to, span <= 366 days).
 * - All Time = lifetime reconciliation without date bounds.
 */

export const STORE_TIMEZONE = 'Asia/Kolkata';
export const BUSINESS_DAY_CUTOFF_HOUR = 4; // 04:00 AM IST

export type SalesDateRangeType =
  | 'today'
  | 'yesterday'
  | 'week'
  | 'month'
  | 'custom'
  | 'all';

export interface DateRangeFilter {
  type: SalesDateRangeType;
  /** YYYY-MM-DD string, undefined for 'all' */
  from?: string;
  /** YYYY-MM-DD string, undefined for 'all' */
  to?: string;
  /** Short button pill label, e.g. "Today", "This Week" */
  label: string;
  /** Descriptive summary label, e.g. "Today (22 Nov 2026)" */
  summaryLabel: string;
  /** True if filter is logically valid for database querying */
  isValid: boolean;
  /** Human-readable error message if invalid */
  error?: string;
}

export const RANGE_OPTIONS: { type: SalesDateRangeType; label: string }[] = [
  { type: 'today', label: 'Today' },
  { type: 'yesterday', label: 'Yesterday' },
  { type: 'week', label: 'This Week' },
  { type: 'month', label: 'This Month' },
  { type: 'custom', label: 'Custom' },
  { type: 'all', label: 'All Time' },
];

/**
 * Resolves the store business date (YYYY-MM-DD) for any given timestamp or Date.
 * Applies the 04:00 AM IST cutoff rule:
 * If the current time in Asia/Kolkata is between 00:00:00 and 03:59:59.999,
 * it returns the previous calendar day's date string.
 */
export function getStoreBusinessDate(
  dateInput?: Date | string | number,
  cutoffHour: number = BUSINESS_DAY_CUTOFF_HOUR
): string {
  const d = dateInput !== undefined
    ? (typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput)
    : new Date();

  if (isNaN(d.getTime())) {
    return '1970-01-01';
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: STORE_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(d);
  const partMap: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') {
      partMap[p.type] = parseInt(p.value, 10);
    }
  }

  let year = partMap.year;
  let month = partMap.month;
  let day = partMap.day;
  const hour = partMap.hour ?? 0;

  // Prior to 04:00 AM IST, subtract 1 calendar day
  if (hour < cutoffHour) {
    const prevDate = new Date(Date.UTC(year, month - 1, day - 1));
    year = prevDate.getUTCFullYear();
    month = prevDate.getUTCMonth() + 1;
    day = prevDate.getUTCDate();
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Shifts a YYYY-MM-DD date string by a given number of days.
 */
export function addDaysToBusinessDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d + days));
  const tY = target.getUTCFullYear();
  const tM = target.getUTCMonth() + 1;
  const tD = target.getUTCDate();
  return `${tY}-${String(tM).padStart(2, '0')}-${String(tD).padStart(2, '0')}`;
}

/**
 * Computes calendar Monday–Sunday date range for a given business date (YYYY-MM-DD).
 */
export function getCalendarWeekRange(businessDateStr: string): { from: string; to: string } {
  const [y, m, d] = businessDateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = utcDate.getUTCDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const sundayOffset = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;

  return {
    from: addDaysToBusinessDate(businessDateStr, mondayOffset),
    to: addDaysToBusinessDate(businessDateStr, sundayOffset),
  };
}

/**
 * Computes calendar month date range for a given business date (YYYY-MM-DD).
 */
export function getCalendarMonthRange(businessDateStr: string): { from: string; to: string } {
  const [y, m] = businessDateStr.split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

/**
 * Formats a YYYY-MM-DD date string into human-readable Indian date string (e.g., "22 Nov 2026").
 */
export function formatReadableDate(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  return dateObj.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Formats a YYYY-MM-DD date string into human-readable month string (e.g., "Nov 2026").
 */
export function formatReadableMonth(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  return dateObj.toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Validates a custom date range.
 * Rules:
 * - from <= to
 * - span <= 366 days
 */
export function validateCustomDateRange(
  from: string,
  to: string
): { isValid: boolean; error?: string; daySpan: number } {
  if (!from || !to) {
    return { isValid: false, error: "Both 'From' and 'To' dates are required", daySpan: 0 };
  }
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(from) || !dateRegex.test(to)) {
    return { isValid: false, error: 'Dates must be in YYYY-MM-DD format', daySpan: 0 };
  }
  if (from > to) {
    return { isValid: false, error: "'From' date must be before or equal to 'To' date", daySpan: 0 };
  }
  const fromTime = new Date(from + 'T00:00:00Z').getTime();
  const toTime = new Date(to + 'T00:00:00Z').getTime();
  if (isNaN(fromTime) || isNaN(toTime)) {
    return { isValid: false, error: 'Invalid calendar date', daySpan: 0 };
  }
  const daySpan = Math.round((toTime - fromTime) / 86400000) + 1;
  if (daySpan > 366) {
    return {
      isValid: false,
      error: `Date range cannot exceed 366 days (selected range is ${daySpan} days)`,
      daySpan,
    };
  }
  return { isValid: true, daySpan };
}

/**
 * Resolves the active date range filter object.
 * Scopes server queries to business_date.
 */
export function resolveDateRange(
  rangeType: SalesDateRangeType,
  referenceDate?: Date | string | number,
  customRange?: { from: string; to: string }
): DateRangeFilter {
  // If referenceDate is already a YYYY-MM-DD string, use it directly as the business date
  const isBusinessDateStr = typeof referenceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(referenceDate);
  const currentBusinessDate = isBusinessDateStr
    ? referenceDate
    : getStoreBusinessDate(referenceDate);

  switch (rangeType) {
    case 'today': {
      return {
        type: 'today',
        from: currentBusinessDate,
        to: currentBusinessDate,
        label: 'Today',
        summaryLabel: `Today (${formatReadableDate(currentBusinessDate)})`,
        isValid: true,
      };
    }

    case 'yesterday': {
      const yesterday = addDaysToBusinessDate(currentBusinessDate, -1);
      return {
        type: 'yesterday',
        from: yesterday,
        to: yesterday,
        label: 'Yesterday',
        summaryLabel: `Yesterday (${formatReadableDate(yesterday)})`,
        isValid: true,
      };
    }

    case 'week': {
      const week = getCalendarWeekRange(currentBusinessDate);
      return {
        type: 'week',
        from: week.from,
        to: week.to,
        label: 'This Week',
        summaryLabel: `This Week (${formatReadableDate(week.from)} – ${formatReadableDate(week.to)})`,
        isValid: true,
      };
    }

    case 'month': {
      const month = getCalendarMonthRange(currentBusinessDate);
      return {
        type: 'month',
        from: month.from,
        to: month.to,
        label: 'This Month',
        summaryLabel: `This Month (${formatReadableMonth(currentBusinessDate)})`,
        isValid: true,
      };
    }

    case 'custom': {
      const from = customRange?.from || currentBusinessDate;
      const to = customRange?.to || currentBusinessDate;
      const val = validateCustomDateRange(from, to);

      return {
        type: 'custom',
        from,
        to,
        label: 'Custom',
        summaryLabel: val.isValid
          ? `Custom (${formatReadableDate(from)} – ${formatReadableDate(to)})`
          : `Custom (${from} – ${to})`,
        isValid: val.isValid,
        error: val.error,
      };
    }

    case 'all':
    default: {
      return {
        type: 'all',
        from: undefined,
        to: undefined,
        label: 'All Time',
        summaryLabel: 'All Time',
        isValid: true,
      };
    }
  }
}
