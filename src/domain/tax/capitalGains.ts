/**
 * Pure Indian Capital Gains Taxation Rules & Calculation.
 * Implements Section 112A, 111A, and Section 50AA of the Indian Income Tax Act.
 * Pure TypeScript — zero dependencies, zero DOM, zero database calls.
 */
import type { AssetClass, TaxMode } from '@/types/db.types';
import { holdingMonths } from './holdingPeriod';

export interface TaxRuleConfig {
  name: string;
  asset_class: AssetClass;
  holding_period_months: number;
  stcg_mode: TaxMode;
  stcg_rate_bps: number; // e.g. 2000 = 20%
  ltcg_mode: TaxMode;
  ltcg_rate_bps: number; // e.g. 1250 = 12.5%
  exemption_cap_paise: number; // e.g. 12500000 = ₹1.25L
}

export interface SoldLotItem {
  purchase_date: number;
  gain_paise: number;
}

export interface TaxCalculationResult {
  total_stcg_paise: number;
  total_ltcg_paise: number;
  ltcg_exemption_remaining_paise: number;
  ltcg_after_exemption_paise: number;
  tax_on_stcg_paise: number;
  tax_on_ltcg_paise: number;
  rule_applied: string;
}

/**
 * Pure function: Computes capital gains and tax for a batch of redeemed lots against a statutory tax rule.
 */
export function calculateCapitalGainsTax(
  soldLots: SoldLotItem[],
  rule: TaxRuleConfig,
  saleDate: number
): TaxCalculationResult {
  let total_stcg_paise = 0;
  let total_ltcg_paise = 0;

  for (const lot of soldLots) {
    const months = holdingMonths(lot.purchase_date, saleDate);
    const isLongTerm = months >= rule.holding_period_months;
    const gain = lot.gain_paise;

    if (isLongTerm) {
      total_ltcg_paise += Math.max(0, gain);
    } else {
      total_stcg_paise += Math.max(0, gain);
    }
  }

  // Apply Section 112A LTCG Exemption (₹1.25L)
  const ltcg_after_exemption_paise = Math.max(0, total_ltcg_paise - rule.exemption_cap_paise);

  // Basis points to fraction (bps / 10000)
  const stcg_rate = rule.stcg_rate_bps / 10000;
  const ltcg_rate = rule.ltcg_rate_bps / 10000;

  const tax_on_stcg_paise = rule.stcg_mode === 'FIXED_PERCENTAGE'
    ? Math.round(total_stcg_paise * stcg_rate)
    : 0; // SLAB_RATE: calculated at user's personal tax slab

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
