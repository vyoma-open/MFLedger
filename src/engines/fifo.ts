import { db } from '../db/schema';
import type { InvestmentLot, LotConsumptionEvent, AssetClass } from '../db/schema';
import { generateId } from '../utils/ids';
import { holdingMonths } from '../utils/fiscalYear';
import { calculateXIRR } from '../utils/xirr';

export interface BuyLotInput {
  account_id: string;
  profile_id?: string;
  symbol: string;
  name: string;
  asset_class: AssetClass;
  purchase_date: number;
  units: number;
  price_per_unit_paise: number;
  fees_paise?: number;
  mf_plan?: 'DIRECT' | 'REGULAR';
  mf_option?: 'GROWTH' | 'IDCW';
  isin?: string;
  exit_load_pct?: number;
  exit_load_days?: number;
  expense_ratio_bps?: number;
  ter_pct?: number;
  investment_type?: 'SIP' | 'LUMPSUM';
  sip_stream_id?: string;
}

export interface SaleLotResult {
  lot_id: string;
  units_consumed: number;
  purchase_date: number;
  purchase_price_paise: number;
  sale_price_paise: number;
  gain_paise: number;
  holding_months: number;
  is_long_term: boolean;
}

/**
 * Record a new mutual fund lot purchase.
 * RULE: IMMUTABLE purchase_date, units_original, purchase_price_paise.
 */
export async function buyLot(input: BuyLotInput): Promise<string> {
  const now = Date.now();
  const lotId = generateId('lot');

  const lot: InvestmentLot = {
    id: lotId,
    account_id: input.account_id,
    profile_id: input.profile_id,
    symbol: input.symbol,
    name: input.name,
    asset_class: input.asset_class,
    purchase_date: input.purchase_date,
    units_original: input.units,
    units_remaining: input.units,
    purchase_price_paise: input.price_per_unit_paise,
    fees_paise: input.fees_paise ?? 0,
    status: 'ACTIVE',
    created_at: now,
    updated_at: now,
    version: 1,
    mf_plan: input.mf_plan,
    mf_option: input.mf_option,
    isin: input.isin,
    exit_load_pct: input.exit_load_pct,
    exit_load_days: input.exit_load_days,
    expense_ratio_bps: input.expense_ratio_bps,
    ter_pct: input.ter_pct ?? (input.expense_ratio_bps ? input.expense_ratio_bps / 100 : undefined),
    investment_type: input.investment_type ?? 'LUMPSUM',
    sip_stream_id: input.sip_stream_id,
  };

  await db.investment_lots.add(lot);
  return lotId;
}

/**
 * Update investment type (SIP vs LUMPSUM) on an existing lot.
 */
export async function updateLotInvestmentType(lotId: string, investment_type: 'SIP' | 'LUMPSUM'): Promise<void> {
  await db.investment_lots.update(lotId, {
    investment_type,
    updated_at: Date.now(),
  });
}

/**
 * Execute FIFO sale for a mutual fund symbol.
 * RULE: Sort lots by purchase_date ASC (oldest first), consume them in order.
 * Uses event sourcing: writes consumption events, updates units_remaining.
 */
export async function sellFIFO(params: {
  account_id: string;
  symbol: string;
  units_to_sell: number;
  sale_price_per_unit_paise: number;
  sale_date: number;
  holding_period_months_threshold?: number; // for LTCG classification (default 12)
}): Promise<SaleLotResult[]> {
  const { account_id, symbol, units_to_sell, sale_price_per_unit_paise, sale_date } = params;

  // Get active lots for this symbol, sorted oldest first (FIFO)
  const lots = await db.investment_lots
    .where('[account_id+status]')
    .equals([account_id, 'ACTIVE'])
    .filter(l => l.symbol === symbol && l.units_remaining > 0)
    .sortBy('purchase_date');

  const totalAvailable = lots.reduce((sum, l) => sum + l.units_remaining, 0);
  if (totalAvailable < units_to_sell) {
    throw new Error(
      `Insufficient units. Available: ${totalAvailable.toFixed(4)}, Requested: ${units_to_sell.toFixed(4)}`
    );
  }

  const results: SaleLotResult[] = [];
  let remainingToSell = units_to_sell;
  const now = Date.now();

  for (const lot of lots) {
    if (remainingToSell <= 0) break;

    const unitsFromThisLot = Math.min(lot.units_remaining, remainingToSell);
    const gainPaise = Math.round(
      unitsFromThisLot * (sale_price_per_unit_paise - lot.purchase_price_paise)
    );
    const months = holdingMonths(lot.purchase_date, sale_date);
    const threshold = params.holding_period_months_threshold ?? 12;

    // Write consumption event (event sourcing)
    const event: LotConsumptionEvent = {
      id: generateId('evt'),
      lot_id: lot.id,
      units_consumed: unitsFromThisLot,
      sale_price_paise: sale_price_per_unit_paise,
      created_at: sale_date,
    };
    await db.lot_consumption_events.add(event);

    // Update units_remaining
    const newUnitsRemaining = lot.units_remaining - unitsFromThisLot;
    await db.investment_lots.update(lot.id, {
      units_remaining: newUnitsRemaining,
      status: newUnitsRemaining < 1e-6 ? 'CLOSED' : 'ACTIVE',
      updated_at: now,
      version: lot.version + 1,
    });

    results.push({
      lot_id: lot.id,
      units_consumed: unitsFromThisLot,
      purchase_date: lot.purchase_date,
      purchase_price_paise: lot.purchase_price_paise,
      sale_price_paise: sale_price_per_unit_paise,
      gain_paise: gainPaise,
      holding_months: months,
      is_long_term: months >= threshold,
    });

    remainingToSell -= unitsFromThisLot;
  }

  return results;
}

/**
 * Rollback a sale transaction and restore units remaining on the original buy lots.
 */
export async function deleteSale(eventIds: string[]): Promise<void> {
  await db.transaction('rw', [db.investment_lots, db.lot_consumption_events], async () => {
    const events = await db.lot_consumption_events.bulkGet(eventIds);
    const validEvents = events.filter((e): e is LotConsumptionEvent => e !== undefined);

    for (const event of validEvents) {
      const lot = await db.investment_lots.get(event.lot_id);
      if (lot) {
        const newUnitsRemaining = lot.units_remaining + event.units_consumed;
        await db.investment_lots.update(lot.id, {
          units_remaining: newUnitsRemaining,
          status: 'ACTIVE',
          updated_at: Date.now(),
          version: lot.version + 1,
        });
      }
      await db.lot_consumption_events.delete(event.id);
    }
  });
}

/**
 * Compute units_remaining from event sourcing
 */
export async function computeUnitsRemaining(lot_id: string): Promise<number> {
  const lot = await db.investment_lots.get(lot_id);
  if (!lot) return 0;

  const events = await db.lot_consumption_events
    .where('lot_id').equals(lot_id)
    .toArray();

  const consumed = events.reduce((sum, e) => sum + e.units_consumed, 0);
  return lot.units_original - consumed;
}

/**
 * Get portfolio summary by mutual fund symbol
 */
export async function getPortfolioSummary(
  account_id?: string,
  profile_ids?: string[]
): Promise<
  Array<{
    symbol: string;
    name: string;
    asset_class: AssetClass;
    total_units: number;
    avg_cost_paise: number;
    total_invested_paise: number;
    current_price_paise: number;
    current_value_paise: number;
    unrealized_gain_paise: number;
    xirr: number | null;
    nav_date: number | null;
    raw_payload?: string | null;
    mf_plan?: 'DIRECT' | 'REGULAR';
    mf_option?: 'GROWTH' | 'IDCW';
    isin?: string;
    goal_tag?: string;
  }>
> {
  const validAccounts = await db.accounts
    .where('deleted_at')
    .equals(0)
    .filter(a => a.is_archived !== 1)
    .toArray();
  const validAccountMap = new Map(validAccounts.map(a => [a.id, a]));

  let lotsQueryList: InvestmentLot[];
  if (account_id) {
    lotsQueryList = await db.investment_lots
      .where('[account_id+status]')
      .equals([account_id, 'ACTIVE'])
      .filter(l => l.units_remaining > 0)
      .toArray();
  } else if (profile_ids && profile_ids.length > 0) {
    const profileIdSet = new Set(profile_ids);
    const visibleAccountIds = validAccounts
      .filter(a => !a.profile_id || profileIdSet.has(a.profile_id))
      .map(a => a.id);
    lotsQueryList = await db.investment_lots
      .where('account_id')
      .anyOf(visibleAccountIds)
      .filter(l => l.status === 'ACTIVE' && l.units_remaining > 0)
      .toArray();
  } else {
    lotsQueryList = await db.investment_lots
      .where('status')
      .equals('ACTIVE')
      .filter(l => l.units_remaining > 0)
      .toArray();
  }

  const lots = lotsQueryList.filter(l => validAccountMap.has(l.account_id));

  // Group by symbol
  const bySymbol = new Map<string, InvestmentLot[]>();
  for (const lot of lots) {
    if (!bySymbol.has(lot.symbol)) bySymbol.set(lot.symbol, []);
    bySymbol.get(lot.symbol)!.push(lot);
  }

  // Collect all relevant symbols and ISINs for targeted indexed querying
  const candidateKeys = new Set<string>();
  for (const lot of lots) {
    const s = (lot.symbol || '').trim().toUpperCase();
    if (s) {
      candidateKeys.add(s);
      const clean = s.replace(/^AMFI:/, '');
      candidateKeys.add(clean);
      candidateKeys.add(`AMFI:${clean}`);
    }
    if (lot.isin) {
      candidateKeys.add(lot.isin.trim().toUpperCase());
    }
  }
  const queryKeys = Array.from(candidateKeys);
  const [entriesBySymbol, entriesById] = queryKeys.length > 0
    ? await Promise.all([
        db.market_cache.where('symbol').anyOf(queryKeys).toArray(),
        db.market_cache.where('id').anyOf(queryKeys).toArray(),
      ])
    : [[], []];

  const allCacheEntries = Array.from(new Map([...entriesBySymbol, ...entriesById].map(e => [e.id, e])).values());
  const priceMap = new Map<string, any>();
  for (const entry of allCacheEntries) {
    if (!entry) continue;
    const sym = (entry.symbol || '').toUpperCase();
    const id = (entry.id || '').toUpperCase();
    const clean = sym.replace(/^AMFI:/, '');
    const update = (k: string) => {
      const ex = priceMap.get(k);
      if (!ex || (entry.nav_date && (!ex.nav_date || entry.nav_date > ex.nav_date))) {
        priceMap.set(k, entry);
      }
    };
    if (sym) update(sym);
    if (id) update(id);
    if (clean) {
      update(clean);
      update(`AMFI:${clean}`);
    }
  }

  const result = [];

  for (const [symbol, symbolLots] of bySymbol) {
    const totalUnits = symbolLots.reduce((sum, l) => sum + l.units_remaining, 0);
    const totalInvested = symbolLots.reduce(
      (sum, l) => sum + l.units_remaining * l.purchase_price_paise,
      0
    );
    const avgCost = totalUnits > 0 ? totalInvested / totalUnits : 0;

    const symUpper = symbol.toUpperCase();
    const cleanSym = symUpper.replace(/^AMFI:/, '');
    const isinCode = symbolLots.find(l => l.isin)?.isin?.toUpperCase();
    const latestCache = priceMap.get(symUpper) || priceMap.get(cleanSym) || priceMap.get(`AMFI:${cleanSym}`) || (isinCode ? priceMap.get(isinCode) : null);
    const currentPrice = latestCache?.nav_paise ?? avgCost;

    const currentValue = totalUnits * currentPrice;
    const unrealizedGain = currentValue - totalInvested;

    // Calculate XIRR:
    // Outflows: purchase costs + fees
    const cashFlows = symbolLots.map(l => {
      const propFees = l.units_original > 0
        ? Math.round((l.fees_paise ?? 0) * (l.units_remaining / l.units_original))
        : 0;
      return {
        date: new Date(l.purchase_date),
        amount: -(l.units_remaining * l.purchase_price_paise + propFees),
      };
    });

    // Inflow: current valuation at today's date
    cashFlows.push({
      date: new Date(),
      amount: totalUnits * currentPrice,
    });

    const xirr = calculateXIRR(cashFlows);
    const firstLot = symbolLots[0];

    result.push({
      symbol,
      name: firstLot.name,
      asset_class: firstLot.asset_class,
      total_units: totalUnits,
      avg_cost_paise: avgCost,
      total_invested_paise: totalInvested,
      current_price_paise: currentPrice,
      current_value_paise: currentValue,
      unrealized_gain_paise: unrealizedGain,
      xirr,
      nav_date: latestCache?.nav_date ?? null,
      raw_payload: latestCache?.raw_payload ?? null,
      mf_plan: symbolLots.find(l => l.mf_plan)?.mf_plan || firstLot.mf_plan,
      mf_option: symbolLots.find(l => l.mf_option)?.mf_option || firstLot.mf_option,
      isin: symbolLots.find(l => l.isin)?.isin || firstLot.isin,
      goal_tag: symbolLots.find(l => l.goal_tag)?.goal_tag,
    });
  }

  return result.sort((a, b) => b.current_value_paise - a.current_value_paise);
}
