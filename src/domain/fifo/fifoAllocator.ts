/**
 * Pure First-In, First-Out (FIFO) Lot Allocation Engine.
 * Pure TypeScript — zero dependencies, zero DOM, zero database calls.
 */
import { holdingMonths } from '@/domain/tax';

export type TaxBucket = 'LTCG' | 'STCG' | 'LTCL' | 'STCL';

export interface AllocatableLot {
  id: string;
  purchase_date: number;
  units_remaining: number;
  purchase_price_paise: number;
  version?: number;
  account_id?: string;
  symbol?: string;
  isin?: string;
  mf_plan?: 'DIRECT' | 'REGULAR';
  mf_option?: 'GROWTH' | 'IDCW';
}

export interface FIFOAllocationRequest {
  units_to_sell: number;
  sale_price_per_unit_paise: number;
  sale_date: number;
  holding_period_months_threshold?: number;
}

export interface ConsumedLotOutcome {
  lot_id: string;
  units_consumed: number;
  purchase_date: number;
  purchase_price_paise: number;
  sale_price_paise: number;
  gain_paise: number;
  holding_months: number;
  is_long_term: boolean;
  tax_bucket: TaxBucket;
  account_id?: string;
  symbol?: string;
  isin?: string;
  mf_plan?: 'DIRECT' | 'REGULAR';
  mf_option?: 'GROWTH' | 'IDCW';
}

export interface UpdatedLotOutcome {
  id: string;
  units_remaining: number;
  status: 'ACTIVE' | 'CLOSED';
  nextVersion?: number;
}

export interface FIFOAllocationResult {
  consumed_lots: ConsumedLotOutcome[];
  updated_lots: UpdatedLotOutcome[];
  total_units_consumed: number;
  total_gain_paise: number;
}

/**
 * Categorize capital gain or loss into statutory tax bucket:
 * - Gain >= 0 and Long Term -> LTCG
 * - Gain >= 0 and Short Term -> STCG
 * - Gain < 0 and Long Term -> LTCL
 * - Gain < 0 and Short Term -> STCL
 */
export function determineTaxBucket(gainPaise: number, isLongTerm: boolean): TaxBucket {
  if (gainPaise >= 0) {
    return isLongTerm ? 'LTCG' : 'STCG';
  }
  return isLongTerm ? 'LTCL' : 'STCL';
}

/**
 * Pure function: Allocates redemption against purchase lots in chronological FIFO order (oldest first).
 * Throws an error if available units are insufficient.
 */
export function allocateFIFORedemption(
  lots: AllocatableLot[],
  request: FIFOAllocationRequest
): FIFOAllocationResult {
  const { units_to_sell, sale_price_per_unit_paise, sale_date, holding_period_months_threshold = 12 } = request;

  // Sort lots chronologically (oldest first). Tie-break identical same-day purchases by ID.
  const sortedLots = [...lots]
    .filter(l => l.units_remaining > 0)
    .sort((a, b) => {
      const dDiff = a.purchase_date - b.purchase_date;
      if (dDiff !== 0) return dDiff;
      return a.id.localeCompare(b.id);
    });

  const totalAvailable = sortedLots.reduce((sum, l) => sum + l.units_remaining, 0);
  // Tolerance check for micro fractional units (1e-6)
  if (totalAvailable < units_to_sell - 1e-6) {
    throw new Error(
      `Insufficient units. Available: ${totalAvailable.toFixed(4)}, Requested: ${units_to_sell.toFixed(4)}`
    );
  }

  const consumed_lots: ConsumedLotOutcome[] = [];
  const updated_lots: UpdatedLotOutcome[] = [];
  let remainingToSell = units_to_sell;
  let total_gain_paise = 0;
  let total_units_consumed = 0;

  for (const lot of sortedLots) {
    if (remainingToSell <= 1e-7) break;

    const rawUnits = Math.min(lot.units_remaining, remainingToSell);
    const unitsFromThisLot = Number(rawUnits.toFixed(6));
    const gainPaise = Math.round(
      unitsFromThisLot * (sale_price_per_unit_paise - lot.purchase_price_paise)
    );
    const months = holdingMonths(lot.purchase_date, sale_date);
    const isLongTerm = months >= holding_period_months_threshold;
    const tax_bucket = determineTaxBucket(gainPaise, isLongTerm);

    consumed_lots.push({
      lot_id: lot.id,
      units_consumed: unitsFromThisLot,
      purchase_date: lot.purchase_date,
      purchase_price_paise: lot.purchase_price_paise,
      sale_price_paise: sale_price_per_unit_paise,
      gain_paise: gainPaise,
      holding_months: months,
      is_long_term: isLongTerm,
      tax_bucket,
      account_id: lot.account_id,
      symbol: lot.symbol,
      isin: lot.isin,
      mf_plan: lot.mf_plan,
      mf_option: lot.mf_option,
    });

    const diff = lot.units_remaining - unitsFromThisLot;
    const isClosed = diff < 1e-6;
    const newUnitsRemaining = isClosed ? 0 : Number(diff.toFixed(6));

    updated_lots.push({
      id: lot.id,
      units_remaining: newUnitsRemaining,
      status: isClosed ? 'CLOSED' : 'ACTIVE',
      nextVersion: (lot.version ?? 1) + 1,
    });

    total_units_consumed = Number((total_units_consumed + unitsFromThisLot).toFixed(6));
    total_gain_paise += gainPaise;
    remainingToSell = Math.max(0, Number((remainingToSell - unitsFromThisLot).toFixed(6)));
  }

  return {
    consumed_lots,
    updated_lots,
    total_units_consumed,
    total_gain_paise,
  };
}

/**
 * Pure function: Reverses a redemption and restores units consumed back to their source purchase lots.
 */
export function rollbackFIFORedemption(
  lots: AllocatableLot[],
  consumedLots: ConsumedLotOutcome[]
): UpdatedLotOutcome[] {
  const lotMap = new Map(lots.map(l => [l.id, { ...l }]));

  for (const consumed of consumedLots) {
    const lot = lotMap.get(consumed.lot_id);
    if (!lot) continue;

    const restoredUnits = Number((lot.units_remaining + consumed.units_consumed).toFixed(6));
    lot.units_remaining = restoredUnits;
    if (lot.version !== undefined) lot.version += 1;
  }

  return Array.from(lotMap.values()).map(l => ({
    id: l.id,
    units_remaining: l.units_remaining,
    status: l.units_remaining > 0 ? 'ACTIVE' : 'CLOSED',
    nextVersion: l.version,
  }));
}

/**
 * Pure filter: Filters lots strictly by portfolio account, scheme, plan, or option.
 */
export function filterLotsByPortfolioAndFund(
  lots: AllocatableLot[],
  filter: {
    account_id?: string;
    symbol?: string;
    isin?: string;
    mf_plan?: 'DIRECT' | 'REGULAR';
    mf_option?: 'GROWTH' | 'IDCW';
  }
): AllocatableLot[] {
  return lots.filter(lot => {
    if (filter.account_id && lot.account_id !== filter.account_id) return false;
    if (filter.symbol && lot.symbol !== filter.symbol) return false;
    if (filter.isin && lot.isin !== filter.isin) return false;
    if (filter.mf_plan && lot.mf_plan !== filter.mf_plan) return false;
    if (filter.mf_option && lot.mf_option !== filter.mf_option) return false;
    return true;
  });
}
