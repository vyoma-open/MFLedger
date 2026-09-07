import { describe, it, expect } from 'vitest';
import { calculateCapitalGainsTax, type TaxRuleConfig } from '../capitalGains';
import { getStaticDefaultTaxRule, generateDefaultTaxRules } from '../defaultRules';

describe('domain/tax: calculateCapitalGainsTax', () => {
  const equityRuleFY25: TaxRuleConfig = {
    name: 'Equity MF (Sec 112A/111A)',
    asset_class: 'EQUITY_MF',
    holding_period_months: 12,
    stcg_mode: 'FIXED_PERCENTAGE',
    stcg_rate_bps: 2000, // 20%
    ltcg_mode: 'FIXED_PERCENTAGE',
    ltcg_rate_bps: 1250, // 12.5%
    exemption_cap_paise: 12500000, // ₹1.25L exemption
  };

  it('correctly applies Section 112A ₹1.25L exemption to LTCG', () => {
    const saleDate = new Date('2025-01-15').getTime();
    const lots = [
      {
        // LTCG: Bought 2 years ago, ₹2,00,000 gain
        purchase_date: new Date('2023-01-15').getTime(),
        gain_paise: 20000000, // ₹2.00L
      },
      {
        // STCG: Bought 3 months ago, ₹50,000 gain
        purchase_date: new Date('2024-10-15').getTime(),
        gain_paise: 5000000, // ₹50,000
      },
    ];

    const result = calculateCapitalGainsTax(lots, equityRuleFY25, saleDate);

    expect(result.total_ltcg_paise).toBe(20000000);
    expect(result.total_stcg_paise).toBe(5000000);

    // LTCG after ₹1.25L exemption: ₹2.00L - ₹1.25L = ₹75,000
    expect(result.ltcg_after_exemption_paise).toBe(7500000);

    // Tax on LTCG @ 12.5%: 75,000 * 0.125 = ₹9,375 (937500 paise)
    expect(result.tax_on_ltcg_paise).toBe(937500);

    // Tax on STCG @ 20%: 50,000 * 0.20 = ₹10,000 (1000000 paise)
    expect(result.tax_on_stcg_paise).toBe(1000000);
  });

  it('yields 0 LTCG tax if long-term gains are within the ₹1.25L exemption limit', () => {
    const saleDate = new Date('2025-01-15').getTime();
    const lots = [
      {
        purchase_date: new Date('2023-01-15').getTime(),
        gain_paise: 10000000, // ₹1.00L (< ₹1.25L)
      },
    ];

    const result = calculateCapitalGainsTax(lots, equityRuleFY25, saleDate);

    expect(result.total_ltcg_paise).toBe(10000000);
    expect(result.ltcg_after_exemption_paise).toBe(0);
    expect(result.tax_on_ltcg_paise).toBe(0);
  });

  describe('Budget 2025-26 Statutory Default Rules', () => {
    it('provides correct Budget 2025-26 rates for Equity MF (20% STCG, 12.5% LTCG, ₹1.25L exemption)', () => {
      const equityRule = getStaticDefaultTaxRule('EQUITY_MF', new Date('2025-04-01').getTime());

      expect(equityRule.holding_period_months).toBe(12);
      expect(equityRule.stcg_mode).toBe('FIXED_PERCENTAGE');
      expect(equityRule.stcg_rate_bps).toBe(2000); // 20%
      expect(equityRule.ltcg_mode).toBe('FIXED_PERCENTAGE');
      expect(equityRule.ltcg_rate_bps).toBe(1250); // 12.5%
      expect(equityRule.exemption_cap_paise).toBe(12500000); // ₹1.25 Lakh
    });

    it('provides correct Budget 2025-26 rates for Gold & Silver MF (24m holding, Slab STCG, 12.5% LTCG)', () => {
      const goldRule = getStaticDefaultTaxRule('GOLD_MF', new Date('2025-04-01').getTime());

      expect(goldRule.holding_period_months).toBe(24);
      expect(goldRule.stcg_mode).toBe('SLAB_RATE');
      expect(goldRule.ltcg_mode).toBe('FIXED_PERCENTAGE');
      expect(goldRule.ltcg_rate_bps).toBe(1250); // 12.5%
      expect(goldRule.exemption_cap_paise).toBe(0);
    });

    it('provides Section 50AA slab rate treatment for Debt MF and Liquid MF', () => {
      const debtRule = getStaticDefaultTaxRule('DEBT_MF', new Date('2025-04-01').getTime());
      const liquidRule = getStaticDefaultTaxRule('LIQUID_MF', new Date('2025-04-01').getTime());

      expect(debtRule.stcg_mode).toBe('SLAB_RATE');
      expect(debtRule.ltcg_mode).toBe('SLAB_RATE');
      expect(liquidRule.stcg_mode).toBe('SLAB_RATE');
      expect(liquidRule.ltcg_mode).toBe('SLAB_RATE');
    });

    it('provides legacy Pre-Budget 2024 rates for sales occurring before 23-Jul-2024', () => {
      const legacyEquity = getStaticDefaultTaxRule('EQUITY_MF', new Date('2024-05-01').getTime());

      expect(legacyEquity.holding_period_months).toBe(12);
      expect(legacyEquity.stcg_rate_bps).toBe(1500); // 15%
      expect(legacyEquity.ltcg_rate_bps).toBe(1000); // 10%
      expect(legacyEquity.exemption_cap_paise).toBe(10000000); // ₹1.00 Lakh
    });

    it('generates complete default tax rule set with valid IDs and timestamps', () => {
      const rules = generateDefaultTaxRules();

      expect(rules.length).toBeGreaterThanOrEqual(7);
      expect(rules.every(r => r.id.startsWith('tax_rule_default_'))).toBe(true);
      expect(rules.every(r => r.created_at > 0 && r.updated_at > 0)).toBe(true);
    });
  });
});
