/**
 * Time utilities for Calendar Scheduler
 * Handles timezone conversions and formatting
 */

/**
 * Convert local datetime string to UTC ISO string
 * @param localISO - Local datetime string (e.g., '2025-10-30T10:00')
 * @param tz - Timezone string (default: 'Europe/Berlin')
 * @returns UTC ISO string
 */
export function toUTCISOString(localISO: string, tz = 'Europe/Berlin'): string {
  // For now, use simple conversion. For production, consider using date-fns-tz or luxon
  const date = new Date(localISO);
  return date.toISOString();
}

/**
 * Format date to localized string
 * @param dt - Date string or Date object
 * @returns Formatted date string
 */
export function fmt(dt: string | Date): string {
  const date = typeof dt === 'string' ? new Date(dt) : dt;
  return date.toLocaleString();
}

/**
 * Format date to short format
 * @param dt - Date string or Date object
 * @returns Short formatted date string
 */
export function fmtShort(dt: string | Date): string {
  const date = typeof dt === 'string' ? new Date(dt) : dt;
  return date.toLocaleDateString();
}

/**
 * Get datetime-local input value from UTC ISO string
 * @param utcISO - UTC ISO string
 * @returns Local datetime string for input (YYYY-MM-DDTHH:mm)
 */
export function toLocalInputValue(utcISO: string): string {
  const date = new Date(utcISO);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Calculate time difference in human-readable format
 * @param date - Date string or Date object
 * @returns Human-readable time difference
 */
export function timeAgo(date: string | Date): string {
  const now = new Date();
  const past = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return fmtShort(past);
}
