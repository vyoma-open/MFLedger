import { db } from '../db/schema';
import type { AssetClass, TaxMode } from '../db/schema';
import { holdingMonths, getFiscalYear } from '../utils/fiscalYear';
import { sellFIFO, type SaleLotResult } from './fifo';

/**
 * Default holding period threshold (months) by asset class when no tax rule is found.
 * GOLD_MF: 24 months (as per Indian tax law)
 * DEBT_MF / LIQUID_MF: 36 months (as per Indian tax law post-Apr 2023 indexation rules)
 * Equity / Others: 12 months
 */
export function getDefaultHoldingMonths(ac: AssetClass): number {
  if (ac === 'GOLD_MF') return 24;
  if (ac === 'DEBT_MF' || ac === 'LIQUID_MF') return 36;
  return 12;
}

export interface TaxLot {
  purchase_date: number;
  units: number;
  purchase_price_paise: number;
}

export interface TaxComputationResult {
  symbol: string;
  asset_class: AssetClass;
  sale_date: number;
  sale_price_paise: number;
  lots: Array<SaleLotResult & {
    stcg_paise: number;
    ltcg_paise: number;
    tax_mode_stcg: TaxMode;
    tax_mode_ltcg: TaxMode;
    applicable_rate_bps: number;
  }>;
  total_stcg_paise: number;
  total_ltcg_paise: number;
  ltcg_after_exemption_paise: number;
  tax_on_stcg_paise: number;
  tax_on_ltcg_paise: number;
}

export async function getHoldingThresholdMonths(asset_class: AssetClass, at_date: number = Date.now()): Promise<number> {
  const rule = await getApplicableTaxRule(asset_class, at_date);
  return rule ? rule.holding_period_months : getDefaultHoldingMonths(asset_class);
}

/**
 * Fetch the applicable tax rule for a given asset class at a given date
 */
export async function getApplicableTaxRule(asset_class: AssetClass, at_date: number) {
  const rules = await db.tax_rules
    .where('asset_class').equals(asset_class)
    .filter(r => r.effective_from <= at_date && (r.effective_until === null || r.effective_until >= at_date))
    .toArray();

  if (rules.length === 0) return null;
  // Pick the most recently effective rule
  return rules.sort((a, b) => b.effective_from - a.effective_from)[0];
}

/**
 * Compute STCG/LTCG for a set of FIFO sale results
 * RULE: tax rates stored as basis points (2000 = 20%)
 */
export async function computeTaxForSale(
  sale_results: SaleLotResult[],
  asset_class: AssetClass,
  sale_date: number,
): Promise<{
  total_stcg_paise: number;
  total_ltcg_paise: number;
  ltcg_exemption_remaining_paise: number;
  ltcg_after_exemption_paise: number;
  tax_on_stcg_paise: number;
  tax_on_ltcg_paise: number;
  rule_applied: string;
}> {
  const rule = await getApplicableTaxRule(asset_class, sale_date);
  if (!rule) {
    throw new Error(`No tax rule found for asset class: ${asset_class}`);
  }

  let total_stcg_paise = 0;
  let total_ltcg_paise = 0;

  for (const lot of sale_results) {
    const months = holdingMonths(lot.purchase_date, sale_date);
    const isLongTerm = months >= rule.holding_period_months;
    const gain = lot.gain_paise;

    if (isLongTerm) {
      total_ltcg_paise += Math.max(0, gain);
    } else {
      total_stcg_paise += Math.max(0, gain);
    }
  }

  // Apply LTCG exemption
  const ltcg_after_exemption_paise = Math.max(0, total_ltcg_paise - rule.exemption_cap_paise);

  // Compute taxes (basis points to percentage: bps / 10000)
  const stcg_rate = rule.stcg_rate_bps / 10000;
  const ltcg_rate = rule.ltcg_rate_bps / 10000;

  const tax_on_stcg_paise = rule.stcg_mode === 'FIXED_PERCENTAGE'
    ? Math.round(total_stcg_paise * stcg_rate)
    : 0; // SLAB_RATE: user applies their income tax slab rate

  const tax_on_ltcg_paise = rule.ltcg_mode === 'FIXED_PERCENTAGE'
    ? Math.round(ltcg_after_exemption_paise * ltcg_rate)
    : 0;

  return {
    total_stcg_paise,
    total_ltcg_paise,
    ltcg_exemption_remaining_paise: rule.exemption_cap_paise,
    ltcg_after_exemption_paise,
    tax_on_stcg_paise,
    tax_on_ltcg_paise,
    rule_applied: rule.name,
  };
}

/**
 * Generate a full tax report for a fiscal year across all accounts/symbols
 */
export async function generateFYTaxReport(fy_start: number, fy_end: number): Promise<{
  by_symbol: Array<{
    symbol: string;
    name: string;
    asset_class: AssetClass;
    stcg_paise: number;
    ltcg_paise: number;
    tax_stcg_paise: number;
    tax_ltcg_paise: number;
    is_slab_rate_stcg: boolean;
    is_slab_rate_ltcg: boolean;
  }>;
  total_stcg_paise: number;
  total_ltcg_paise: number;
  total_tax_paise: number;
}> {
  // Get all lot consumption events within the FY
  const events = await db.lot_consumption_events
    .filter(e => e.created_at >= fy_start && e.created_at <= fy_end)
    .toArray();

  if (events.length === 0) {
    return { by_symbol: [], total_stcg_paise: 0, total_ltcg_paise: 0, total_tax_paise: 0 };
  }

  // Get lots for context
  const lotIds = [...new Set(events.map(e => e.lot_id))];
  const lots = await db.investment_lots.bulkGet(lotIds);
  
  const lotMap = new Map(
    lots.filter(Boolean).map(l => [l!.id, l!])
  );

  // Group by symbol
  const bySymbol = new Map<string, typeof events>();
  for (const event of events) {
    const lot = lotMap.get(event.lot_id);
    if (!lot) continue;
    if (!bySymbol.has(lot.symbol)) bySymbol.set(lot.symbol, []);
    bySymbol.get(lot.symbol)!.push(event);
  }

  const by_symbol = [];
  let total_stcg_paise = 0;
  let total_ltcg_paise = 0;
  let total_tax_paise = 0;

  for (const [symbol, symbolEvents] of bySymbol) {
    const lot = lotMap.get(symbolEvents[0].lot_id)!;
    const rule = await getApplicableTaxRule(lot.asset_class, symbolEvents[0].created_at);

    let stcg = 0;
    let ltcg = 0;

    for (const event of symbolEvents) {
      const eventLot = lotMap.get(event.lot_id)!;
      const months = holdingMonths(eventLot.purchase_date, event.created_at);
      const isLT = rule ? months >= rule.holding_period_months : months >= getDefaultHoldingMonths(eventLot.asset_class);
      const gain = event.units_consumed * (event.sale_price_paise - eventLot.purchase_price_paise);

      if (isLT) ltcg += Math.max(0, gain);
      else stcg += Math.max(0, gain);
    }

    const exemption = rule?.exemption_cap_paise ?? 0;
    const ltcgAfterExemption = Math.max(0, ltcg - exemption);
    const taxStcg = rule?.stcg_mode === 'FIXED_PERCENTAGE'
      ? Math.round(stcg * (rule.stcg_rate_bps / 10000))
      : 0;
    const taxLtcg = rule?.ltcg_mode === 'FIXED_PERCENTAGE'
      ? Math.round(ltcgAfterExemption * (rule.ltcg_rate_bps / 10000))
      : 0;

    total_stcg_paise += stcg;
    total_ltcg_paise += ltcg;
    total_tax_paise += taxStcg + taxLtcg;

    by_symbol.push({
      symbol,
      name: lot.name,
      asset_class: lot.asset_class,
      stcg_paise: Math.round(stcg),
      ltcg_paise: Math.round(ltcg),
      tax_stcg_paise: taxStcg,
      tax_ltcg_paise: taxLtcg,
      is_slab_rate_stcg: rule?.stcg_mode === 'SLAB_RATE',
      is_slab_rate_ltcg: rule?.ltcg_mode === 'SLAB_RATE',
    });
  }

  return {
    by_symbol,
    total_stcg_paise: Math.round(total_stcg_paise),
    total_ltcg_paise: Math.round(total_ltcg_paise),
    total_tax_paise,
  };
}
