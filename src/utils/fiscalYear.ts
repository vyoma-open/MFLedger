/**
 * Fiscal Year utilities — Indian FY: April 1 to March 31
 */

export interface FiscalYear {
  label: string;       // "FY 2024-25"
  startMs: number;     // epoch ms
  endMs: number;       // epoch ms
  startYear: number;   // 2024
}

/** Get fiscal year containing a given date */
export function getFiscalYear(date: Date = new Date()): FiscalYear {
  const month = date.getMonth(); // 0-indexed; March = 2, April = 3
  const year = date.getFullYear();
  const startYear = month >= 3 ? year : year - 1;

  const start = new Date(startYear, 3, 1, 0, 0, 0, 0); // April 1
  const end = new Date(startYear + 1, 2, 31, 23, 59, 59, 999); // March 31

  return {
    label: `FY ${startYear}-${String(startYear + 1).slice(2)}`,
    startMs: start.getTime(),
    endMs: end.getTime(),
    startYear,
  };
}

/** Get current fiscal year */
export function currentFY(): FiscalYear {
  return getFiscalYear(new Date());
}

/** Get fiscal year for a given epoch ms */
export function getFYForTimestamp(ts: number): FiscalYear {
  return getFiscalYear(new Date(ts));
}

/** Check if a timestamp falls in the current fiscal year */
export function isCurrentFY(ts: number): boolean {
  const fy = currentFY();
  return ts >= fy.startMs && ts <= fy.endMs;
}

/** Get holding period in months between two dates */
export function holdingMonths(purchaseTs: number, saleTs: number): number {
  const purchase = new Date(purchaseTs);
  const sale = new Date(saleTs);
  return (
    (sale.getFullYear() - purchase.getFullYear()) * 12 +
    (sale.getMonth() - purchase.getMonth())
  );
}

/** Format a timestamp to "DD MMM YYYY" */
export function formatDate(ts: number): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(ts));
}

/** Format a timestamp to "MMM YYYY" */
export function formatMonthYear(ts: number): string {
  return new Intl.DateTimeFormat('en-IN', {
    month: 'short',
    year: 'numeric',
  }).format(new Date(ts));
}

/** Get start of day (midnight) for a date */
export function startOfDay(date: Date = new Date()): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Get today's date string YYYY-MM-DD */
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Parse YYYY-MM-DD to epoch ms */
export function parseDateStr(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00').getTime();
}

/** Format a timestamp relative to current time (e.g. "just now", "5m ago", "2h ago", "3d ago") */
export function formatRelativeTime(timestamp: number | null | undefined, now: number = Date.now()): string {
  if (!timestamp) return 'never';
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;

  const date = new Date(timestamp);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
