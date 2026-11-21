import { cn as cnBase } from 'cn';

/**
 * Merges Tailwind and custom class names cleanly
 */
export function cn(...inputs: Parameters<typeof cnBase>): string {
  return cnBase(...inputs);
}

/**
 * Formats a monetary amount into standard shop currency string
 */
export function formatCurrency(amount: number, currency: string = 'INR'): string {
  if (isNaN(amount) || !isFinite(amount)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Formats a sequential number into a 3-digit order token display (e.g., "#007", "#042")
 */
export function formatOrderToken(tokenNumber: number): string {
  if (tokenNumber < 0 || isNaN(tokenNumber)) return '#000';
  return `#${tokenNumber.toString().padStart(3, '0')}`;
}

/**
 * Formats a terminal and sequence into a standard token display (e.g., "T1-001")
 */
export function formatTerminalToken(terminalNumber: string = 'T1', seq: number = 1): string {
  const num = Math.max(1, Math.floor(seq));
  const t = terminalNumber.toUpperCase().startsWith('T') ? terminalNumber.toUpperCase() : `T${terminalNumber}`;
  return `${t}-${num.toString().padStart(3, '0')}`;
}

/**
 * Standard client-generated UUID (v4)
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Explicit pinned time formatters to eliminate timezone and SSR/client hydration drift.
 * Locked to locale 'en-IN', timeZone 'Asia/Kolkata', hour12: true.
 */
export const orderTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

export const clockFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/**
 * Pure, deterministic formatter for stored order timestamps (order.createdAt / order.completedAt).
 * Guaranteed to return identical output regardless of host OS timezone (UTC, IST, EST).
 */
export function formatOrderTime(isoString?: string | number | Date | null): string {
  if (!isoString) return '--:--';
  try {
    const d = typeof isoString === 'object' && isoString instanceof Date ? isoString : new Date(isoString);
    if (isNaN(d.getTime())) return '--:--';
    return orderTimeFormatter.format(d);
  } catch {
    return '--:--';
  }
}

/**
 * Formats a live clock date for header display.
 */
export function formatClockTime(date?: Date | string | number | null): string {
  if (!date) return '--:-- --';
  try {
    const d = typeof date === 'object' && date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '--:-- --';
    return clockFormatter.format(d);
  } catch {
    return '--:-- --';
  }
}

/**
 * Formats a date into a clean time string for counter slips and logs (e.g., "02:30 PM")
 */
export function formatDisplayTime(date: Date | string | number): string {
  return formatOrderTime(date);
}
