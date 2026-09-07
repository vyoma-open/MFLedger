import { db } from '@/db/schema';
import { holdingMonths } from '@/utils/fiscalYear';
import { getDefaultHoldingMonths } from '@/engines/tax';

export async function computeProfileTaxReport(
  accountId: string | undefined,
  fy: any,
  events: any[],
  lotMap: Map<string, any>,
  selectedAccountId?: string
) {
  const targetAccountId = selectedAccountId || accountId;
  // Filter events for this account (or all accounts if undefined) and within the fiscal year
  const profileEvents = events.filter(e => {
    const lot = lotMap.get(e.lot_id);
    return (
      lot &&
      (!targetAccountId || lot.account_id === targetAccountId) &&
      e.created_at >= fy.startMs &&
      e.created_at <= fy.endMs
    );
  });

  const bySymbol = new Map<string, any[]>();
  for (const event of profileEvents) {
    const lot = lotMap.get(event.lot_id)!;
    if (!bySymbol.has(lot.symbol)) bySymbol.set(lot.symbol, []);
    bySymbol.get(lot.symbol)!.push(event);
  }

  // Pre-fetch tax rules to avoid N+1 queries in the loop
  const rules = await db.tax_rules.toArray();

  const by_symbol = [];
  let total_stcg_paise = 0;
  let total_ltcg_paise = 0;
  let total_tax_paise = 0;

  for (const [symbol, symbolEvents] of bySymbol) {
    const lot = lotMap.get(symbolEvents[0].lot_id)!;
    
    // Find the applicable tax rule in memory
    const rule = rules
      .filter(r => 
        r.asset_class === lot.asset_class && 
        r.effective_from <= symbolEvents[0].created_at && 
        (r.effective_until === null || r.effective_until >= symbolEvents[0].created_at)
      )
      .sort((a, b) => b.effective_from - a.effective_from)[0] || null;

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
