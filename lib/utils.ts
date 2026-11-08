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
 * Formats a date into a clean time string for counter slips and logs (e.g., "02:30 PM")
 */
export function formatDisplayTime(date: Date | string | number): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}
