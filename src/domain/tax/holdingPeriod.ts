/**
 * Pure Indian Fiscal Year & Holding Period Mathematics.
 * Indian Fiscal Year: April 1 to March 31.
 * Pure TypeScript — zero dependencies, zero DOM, zero storage.
 */
import type { AssetClass } from '@/types/db.types';

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

/** Get holding period in full months between two dates */
export function holdingMonths(purchaseTs: number, saleTs: number): number {
  const purchase = new Date(purchaseTs);
  const sale = new Date(saleTs);
  return (
    (sale.getFullYear() - purchase.getFullYear()) * 12 +
    (sale.getMonth() - purchase.getMonth())
  );
}

/**
 * Default holding period threshold (months) for Long-Term Capital Gains (LTCG) in India:
 * - Equity MF / Index MF: 12 months (Sec 112A)
 * - Gold MF: 24 months (Budget 2024 revised)
 * - Debt MF / Liquid MF: 36 months (Sec 50AA slab rate / post-Apr 2023 rules)
 */
export function getDefaultHoldingMonths(ac: AssetClass): number {
  if (ac === 'GOLD_MF') return 24;
  if (ac === 'DEBT_MF' || ac === 'LIQUID_MF') return 36;
  return 12;
}

/** Check if holding qualifies as Long Term under standard Indian statutory rules */
export function isLongTermHolding(purchaseTs: number, saleTs: number, assetClass: AssetClass, thresholdMonths?: number): boolean {
  const threshold = thresholdMonths ?? getDefaultHoldingMonths(assetClass);
  return holdingMonths(purchaseTs, saleTs) >= threshold;
}
