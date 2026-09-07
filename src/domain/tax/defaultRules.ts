/**
 * Statutory Default Tax Rules for Indian Mutual Funds.
 * Covers FY 2025-26 & FY 2024-25 (Finance Act 2024 / Budget 2025-26),
 * as well as legacy Pre-Budget 2024 rules for historical transaction calculations.
 * 
 * Part of src/domain/tax.
 * Pure TypeScript — zero dependencies, zero DOM, zero storage.
 */
import type { AssetClass, TaxRule } from '@/types/db.types';

export interface DefaultTaxRuleTemplate extends Omit<TaxRule, 'id' | 'created_at' | 'updated_at'> {
  idSuffix: string;
}

/**
 * Standard Statutory Tax Rules for Indian Mutual Funds:
 * 
 * 1. Equity Mutual Funds (Sec 112A / 111A, >65% Equity):
 *    - Post-Budget (23-Jul-2024 onwards, FY 2024-25 & FY 2025-26):
 *      - Holding Period: 12 months
 *      - STCG: 20.00% (2000 bps)
 *      - LTCG: 12.50% (1250 bps)
 *      - Exemption: ₹1,25,000 (12500000 paise)
 *    - Pre-Budget (01-Apr-2018 to 22-Jul-2024):
 *      - Holding Period: 12 months
 *      - STCG: 15.00% (1500 bps)
 *      - LTCG: 10.00% (1000 bps)
 *      - Exemption: ₹1,00,000 (10000000 paise)
 * 
 * 2. Index Funds / ETFs (>65% Equity):
 *    - Same as Equity Mutual Funds (Sec 112A / 111A).
 * 
 * 3. Debt Mutual Funds (<35% Equity - Specified Mutual Funds under Sec 50AA):
 *    - Purchased on or after 01-Apr-2023:
 *      - Taxed at investor's personal slab rate (SLAB_RATE) for both STCG & LTCG.
 * 
 * 4. Liquid / Overnight / Money Market Funds:
 *    - Taxed at investor's personal slab rate (SLAB_RATE) under Sec 50AA.
 * 
 * 5. Gold & Silver Mutual Funds / Fund of Funds (FoF):
 *    - Post-Budget (23-Jul-2024 onwards, FY 2024-25 & FY 2025-26):
 *      - Holding Period: 24 months (reduced from 36 months)
 *      - STCG: Slab Rate (SLAB_RATE)
 *      - LTCG: 12.50% (1250 bps) without indexation
 *      - Exemption: ₹0
 *    - Pre-Budget (01-Apr-2018 to 22-Jul-2024):
 *      - Holding Period: 36 months
 *      - STCG: Slab Rate
 *      - LTCG: 20.00% (with indexation)
 */
export const BUDGET_2025_26_TAX_RULES: DefaultTaxRuleTemplate[] = [
  // ── Current Budget 2024-25 / 2025-26 Rules (From 23-Jul-2024 onwards) ──────
  {
    idSuffix: 'equity_budget_2025',
    name: 'Equity MF (Sec 112A/111A - Budget 2024/25)',
    asset_class: 'EQUITY_MF',
    holding_period_months: 12,
    stcg_mode: 'FIXED_PERCENTAGE',
    stcg_rate_bps: 2000, // 20%
    ltcg_mode: 'FIXED_PERCENTAGE',
    ltcg_rate_bps: 1250, // 12.5%
    exemption_cap_paise: 12500000, // ₹1.25 Lakh
    effective_from: new Date('2024-07-23T00:00:00.000Z').getTime(),
    effective_until: null,
    version: 1,
  },
  {
    idSuffix: 'index_budget_2025',
    name: 'Index MF (Sec 112A/111A - Budget 2024/25)',
    asset_class: 'INDEX_MF',
    holding_period_months: 12,
    stcg_mode: 'FIXED_PERCENTAGE',
    stcg_rate_bps: 2000, // 20%
    ltcg_mode: 'FIXED_PERCENTAGE',
    ltcg_rate_bps: 1250, // 12.5%
    exemption_cap_paise: 12500000, // ₹1.25 Lakh
    effective_from: new Date('2024-07-23T00:00:00.000Z').getTime(),
    effective_until: null,
    version: 1,
  },
  {
    idSuffix: 'debt_sec_50aa',
    name: 'Debt MF (Sec 50AA - Slab Rate)',
    asset_class: 'DEBT_MF',
    holding_period_months: 36,
    stcg_mode: 'SLAB_RATE',
    stcg_rate_bps: 0,
    ltcg_mode: 'SLAB_RATE',
    ltcg_rate_bps: 0,
    exemption_cap_paise: 0,
    effective_from: new Date('2023-04-01T00:00:00.000Z').getTime(),
    effective_until: null,
    version: 1,
  },
  {
    idSuffix: 'liquid_sec_50aa',
    name: 'Liquid MF (Sec 50AA - Slab Rate)',
    asset_class: 'LIQUID_MF',
    holding_period_months: 36,
    stcg_mode: 'SLAB_RATE',
    stcg_rate_bps: 0,
    ltcg_mode: 'SLAB_RATE',
    ltcg_rate_bps: 0,
    exemption_cap_paise: 0,
    effective_from: new Date('2023-04-01T00:00:00.000Z').getTime(),
    effective_until: null,
    version: 1,
  },
  {
    idSuffix: 'gold_budget_2025',
    name: 'Gold & Silver MF (Budget 2024/25 - 24m/12.5%)',
    asset_class: 'GOLD_MF',
    holding_period_months: 24,
    stcg_mode: 'SLAB_RATE',
    stcg_rate_bps: 0,
    ltcg_mode: 'FIXED_PERCENTAGE',
    ltcg_rate_bps: 1250, // 12.5%
    exemption_cap_paise: 0,
    effective_from: new Date('2024-07-23T00:00:00.000Z').getTime(),
    effective_until: null,
    version: 1,
  },

  // ── Legacy Pre-Budget 2024 Rules (For sales up to 22-Jul-2024) ────────────
  {
    idSuffix: 'equity_legacy_pre2024',
    name: 'Equity MF (Pre-Budget 2024 - 15%/10%)',
    asset_class: 'EQUITY_MF',
    holding_period_months: 12,
    stcg_mode: 'FIXED_PERCENTAGE',
    stcg_rate_bps: 1500, // 15%
    ltcg_mode: 'FIXED_PERCENTAGE',
    ltcg_rate_bps: 1000, // 10%
    exemption_cap_paise: 10000000, // ₹1.0 Lakh
    effective_from: new Date('2018-04-01T00:00:00.000Z').getTime(),
    effective_until: new Date('2024-07-22T23:59:59.999Z').getTime(),
    version: 1,
  },
  {
    idSuffix: 'index_legacy_pre2024',
    name: 'Index MF (Pre-Budget 2024 - 15%/10%)',
    asset_class: 'INDEX_MF',
    holding_period_months: 12,
    stcg_mode: 'FIXED_PERCENTAGE',
    stcg_rate_bps: 1500, // 15%
    ltcg_mode: 'FIXED_PERCENTAGE',
    ltcg_rate_bps: 1000, // 10%
    exemption_cap_paise: 10000000, // ₹1.0 Lakh
    effective_from: new Date('2018-04-01T00:00:00.000Z').getTime(),
    effective_until: new Date('2024-07-22T23:59:59.999Z').getTime(),
    version: 1,
  },
];

/**
 * Generate full TaxRule records with IDs and timestamps ready for insertion into Dexie.
 */
export function generateDefaultTaxRules(now: number = Date.now()): TaxRule[] {
  return BUDGET_2025_26_TAX_RULES.map((rule, idx) => ({
    id: `tax_rule_default_${rule.idSuffix}_${idx}`,
    name: rule.name,
    asset_class: rule.asset_class,
    holding_period_months: rule.holding_period_months,
    stcg_mode: rule.stcg_mode,
    stcg_rate_bps: rule.stcg_rate_bps,
    ltcg_mode: rule.ltcg_mode,
    ltcg_rate_bps: rule.ltcg_rate_bps,
    exemption_cap_paise: rule.exemption_cap_paise,
    effective_from: rule.effective_from,
    effective_until: rule.effective_until,
    created_at: now,
    updated_at: now,
    version: rule.version,
  }));
}

/**
 * Fallback static lookup when no database rule matches an asset class.
 */
export function getStaticDefaultTaxRule(asset_class: AssetClass, at_date: number = Date.now()): TaxRule {
  const matching = BUDGET_2025_26_TAX_RULES
    .filter(r => r.asset_class === asset_class)
    .filter(r => r.effective_from <= at_date && (r.effective_until === null || r.effective_until >= at_date));

  const chosen = matching[0] ?? BUDGET_2025_26_TAX_RULES.find(r => r.asset_class === asset_class) ?? BUDGET_2025_26_TAX_RULES[0];
  const now = Date.now();

  return {
    id: `tax_rule_fallback_${chosen.idSuffix}`,
    name: chosen.name,
    asset_class: chosen.asset_class,
    holding_period_months: chosen.holding_period_months,
    stcg_mode: chosen.stcg_mode,
    stcg_rate_bps: chosen.stcg_rate_bps,
    ltcg_mode: chosen.ltcg_mode,
    ltcg_rate_bps: chosen.ltcg_rate_bps,
    exemption_cap_paise: chosen.exemption_cap_paise,
    effective_from: chosen.effective_from,
    effective_until: chosen.effective_until,
    created_at: now,
    updated_at: now,
    version: chosen.version,
  };
}
