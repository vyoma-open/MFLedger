/**
 * Pure First-In, First-Out (FIFO) Lot Allocation Engine.
 * Pure TypeScript — zero dependencies, zero DOM, zero database calls.
 */
import { holdingMonths } from '@/domain/tax';

export interface AllocatableLot {
  id: string;
  purchase_date: number;
  units_remaining: number;
  purchase_price_paise: number;
  version?: number;
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
 * Pure function: Allocates redemption against purchase lots in chronological FIFO order (oldest first).
 * Throws an error if available units are insufficient.
 */
export function allocateFIFORedemption(
  lots: AllocatableLot[],
  request: FIFOAllocationRequest
): FIFOAllocationResult {
  const { units_to_sell, sale_price_per_unit_paise, sale_date, holding_period_months_threshold = 12 } = request;

  // Sort lots chronologically (oldest first)
  const sortedLots = [...lots]
    .filter(l => l.units_remaining > 0)
    .sort((a, b) => a.purchase_date - b.purchase_date);

  const totalAvailable = sortedLots.reduce((sum, l) => sum + l.units_remaining, 0);
  if (totalAvailable < units_to_sell - 1e-7) {
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
    if (remainingToSell <= 1e-9) break;

    const unitsFromThisLot = Math.min(lot.units_remaining, remainingToSell);
    const gainPaise = Math.round(
      unitsFromThisLot * (sale_price_per_unit_paise - lot.purchase_price_paise)
    );
    const months = holdingMonths(lot.purchase_date, sale_date);
    const isLongTerm = months >= holding_period_months_threshold;

    consumed_lots.push({
      lot_id: lot.id,
      units_consumed: unitsFromThisLot,
      purchase_date: lot.purchase_date,
      purchase_price_paise: lot.purchase_price_paise,
      sale_price_paise: sale_price_per_unit_paise,
      gain_paise: gainPaise,
      holding_months: months,
      is_long_term: isLongTerm,
    });

    const newUnitsRemaining = lot.units_remaining - unitsFromThisLot;
    const isClosed = newUnitsRemaining < 1e-6;

    updated_lots.push({
      id: lot.id,
      units_remaining: isClosed ? 0 : newUnitsRemaining,
      status: isClosed ? 'CLOSED' : 'ACTIVE',
      nextVersion: (lot.version ?? 1) + 1,
    });

    total_units_consumed += unitsFromThisLot;
    total_gain_paise += gainPaise;
    remainingToSell -= unitsFromThisLot;
  }

  return {
    consumed_lots,
    updated_lots,
    total_units_consumed,
    total_gain_paise,
  };
}
