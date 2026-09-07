import { describe, it, expect } from 'vitest';
import {
  allocateFIFORedemption,
  rollbackFIFORedemption,
  filterLotsByPortfolioAndFund,
  determineTaxBucket,
  type AllocatableLot,
} from '../fifoAllocator';

describe('domain/fifo: FIFO Allocation Engine Test Matrix', () => {
  const d = (year: number, month: number, day: number) =>
    new Date(year, month - 1, day).getTime();

  // ── 1. User Specification Example ─────────────────────────────────────────
  it('Scenario 1: User Reference Example (Lot A: 01-Jan, 100u @ ₹100; Lot B: 01-Feb, 100u @ ₹120; Redeem 150u @ ₹150)', () => {
    const lots: AllocatableLot[] = [
      {
        id: 'lot_A',
        purchase_date: d(2024, 1, 1),
        units_remaining: 100,
        purchase_price_paise: 10000, // ₹100.00
      },
      {
        id: 'lot_B',
        purchase_date: d(2024, 2, 1),
        units_remaining: 100,
        purchase_price_paise: 12000, // ₹120.00
      },
    ];

    // Redeem 150 units at ₹150 on 2024-03-01
    const result = allocateFIFORedemption(lots, {
      units_to_sell: 150,
      sale_price_per_unit_paise: 15000, // ₹150.00
      sale_date: d(2024, 3, 1),
      holding_period_months_threshold: 12,
    });

    // Verification:
    // Lot A: 100 consumed, 0 remaining (CLOSED)
    // Lot B: 50 consumed, 50 remaining (ACTIVE)
    expect(result.consumed_lots).toHaveLength(2);

    const consumedA = result.consumed_lots[0];
    expect(consumedA.lot_id).toBe('lot_A');
    expect(consumedA.units_consumed).toBe(100);
    expect(consumedA.gain_paise).toBe(100 * (15000 - 10000)); // ₹5,000 gain

    const consumedB = result.consumed_lots[1];
    expect(consumedB.lot_id).toBe('lot_B');
    expect(consumedB.units_consumed).toBe(50);
    expect(consumedB.gain_paise).toBe(50 * (15000 - 12000)); // ₹1,500 gain

    expect(result.total_units_consumed).toBe(150);
    expect(result.total_gain_paise).toBe(650000); // ₹6,500 total gain

    expect(result.updated_lots).toEqual([
      { id: 'lot_A', units_remaining: 0, status: 'CLOSED', nextVersion: 2 },
      { id: 'lot_B', units_remaining: 50, status: 'ACTIVE', nextVersion: 2 },
    ]);
  });

  // ── 2. Partial Redemption ─────────────────────────────────────────────────
  it('Scenario 2: Partial redemption leaves lot ACTIVE with accurate remaining balance', () => {
    const lots: AllocatableLot[] = [
      {
        id: 'lot_single',
        purchase_date: d(2024, 1, 1),
        units_remaining: 100,
        purchase_price_paise: 5000,
      },
    ];

    const result = allocateFIFORedemption(lots, {
      units_to_sell: 40,
      sale_price_per_unit_paise: 7000,
      sale_date: d(2024, 4, 1),
    });

    expect(result.consumed_lots[0].units_consumed).toBe(40);
    expect(result.updated_lots[0]).toEqual({
      id: 'lot_single',
      units_remaining: 60,
      status: 'ACTIVE',
      nextVersion: 2,
    });
  });

  // ── 3. Full Redemption ────────────────────────────────────────────────────
  it('Scenario 3: Full redemption completely exhausts lot and marks status CLOSED', () => {
    const lots: AllocatableLot[] = [
      {
        id: 'lot_full',
        purchase_date: d(2024, 1, 1),
        units_remaining: 100,
        purchase_price_paise: 5000,
      },
    ];

    const result = allocateFIFORedemption(lots, {
      units_to_sell: 100,
      sale_price_per_unit_paise: 6000,
      sale_date: d(2024, 4, 1),
    });

    expect(result.consumed_lots[0].units_consumed).toBe(100);
    expect(result.updated_lots[0]).toEqual({
      id: 'lot_full',
      units_remaining: 0,
      status: 'CLOSED',
      nextVersion: 2,
    });
  });

  // ── 4. Multiple Sequential Redemptions ────────────────────────────────────
  it('Scenario 4: Sequential redemptions progress chronologically across multiple purchases', () => {
    let currentLots: AllocatableLot[] = [
      { id: 'lot_1', purchase_date: d(2023, 1, 1), units_remaining: 50, purchase_price_paise: 1000 },
      { id: 'lot_2', purchase_date: d(2023, 2, 1), units_remaining: 50, purchase_price_paise: 2000 },
      { id: 'lot_3', purchase_date: d(2023, 3, 1), units_remaining: 50, purchase_price_paise: 3000 },
    ];

    // Redemption 1: Sell 30 units (taken from lot_1)
    const res1 = allocateFIFORedemption(currentLots, {
      units_to_sell: 30,
      sale_price_per_unit_paise: 4000,
      sale_date: d(2023, 4, 1),
    });
    expect(res1.consumed_lots).toHaveLength(1);
    expect(res1.consumed_lots[0].lot_id).toBe('lot_1');
    expect(res1.consumed_lots[0].units_consumed).toBe(30);

    // Apply updates to state
    currentLots = currentLots.map(l => {
      const u = res1.updated_lots.find(x => x.id === l.id);
      return u ? { ...l, units_remaining: u.units_remaining } : l;
    });

    // Redemption 2: Sell 40 units (exhausts lot_1's remaining 20, takes 20 from lot_2)
    const res2 = allocateFIFORedemption(currentLots, {
      units_to_sell: 40,
      sale_price_per_unit_paise: 4500,
      sale_date: d(2023, 5, 1),
    });
    expect(res2.consumed_lots).toHaveLength(2);
    expect(res2.consumed_lots[0]).toMatchObject({ lot_id: 'lot_1', units_consumed: 20 });
    expect(res2.consumed_lots[1]).toMatchObject({ lot_id: 'lot_2', units_consumed: 20 });

    currentLots = currentLots.map(l => {
      const u = res2.updated_lots.find(x => x.id === l.id);
      return u ? { ...l, units_remaining: u.units_remaining } : l;
    });

    // Redemption 3: Sell 50 units (exhausts lot_2's remaining 30, takes 20 from lot_3)
    const res3 = allocateFIFORedemption(currentLots, {
      units_to_sell: 50,
      sale_price_per_unit_paise: 5000,
      sale_date: d(2023, 6, 1),
    });
    expect(res3.consumed_lots).toHaveLength(2);
    expect(res3.consumed_lots[0]).toMatchObject({ lot_id: 'lot_2', units_consumed: 30 });
    expect(res3.consumed_lots[1]).toMatchObject({ lot_id: 'lot_3', units_consumed: 20 });

    const lot3Final = res3.updated_lots.find(x => x.id === 'lot_3');
    expect(lot3Final?.units_remaining).toBe(30);
    expect(lot3Final?.status).toBe('ACTIVE');
  });

  // ── 5. Same-Day Purchases ─────────────────────────────────────────────────
  it('Scenario 5: Multiple purchases on the exact same date are consumed deterministically', () => {
    const sameDay = d(2024, 3, 15);
    const lots: AllocatableLot[] = [
      { id: 'lot_b_same_day', purchase_date: sameDay, units_remaining: 100, purchase_price_paise: 6000 },
      { id: 'lot_a_same_day', purchase_date: sameDay, units_remaining: 100, purchase_price_paise: 5000 },
    ];

    // Sell 120 units
    const result = allocateFIFORedemption(lots, {
      units_to_sell: 120,
      sale_price_per_unit_paise: 8000,
      sale_date: d(2024, 5, 1),
    });

    // Tie-break sorts lot_a_same_day first, then lot_b_same_day
    expect(result.consumed_lots[0].lot_id).toBe('lot_a_same_day');
    expect(result.consumed_lots[0].units_consumed).toBe(100);

    expect(result.consumed_lots[1].lot_id).toBe('lot_b_same_day');
    expect(result.consumed_lots[1].units_consumed).toBe(20);
  });

  // ── 6. Same-Day Purchase + Redemption ─────────────────────────────────────
  it('Scenario 6: Same-day purchase and redemption evaluates to 0 holding months and STCG', () => {
    const tradeDate = d(2024, 7, 10);
    const lots: AllocatableLot[] = [
      {
        id: 'lot_day_trade',
        purchase_date: tradeDate,
        units_remaining: 50,
        purchase_price_paise: 10000,
      },
    ];

    const result = allocateFIFORedemption(lots, {
      units_to_sell: 50,
      sale_price_per_unit_paise: 10500, // profit
      sale_date: tradeDate,
    });

    expect(result.consumed_lots[0].holding_months).toBe(0);
    expect(result.consumed_lots[0].is_long_term).toBe(false);
    expect(result.consumed_lots[0].tax_bucket).toBe('STCG');
    expect(result.consumed_lots[0].gain_paise).toBe(50 * 500); // 25,000 paise
  });

  // ── 7. Fractional Units (SIP Decimals) ────────────────────────────────────
  it('Scenario 7: Handles 3 to 4 decimal precision fractional units without micro-dust drift', () => {
    const lots: AllocatableLot[] = [
      {
        id: 'sip_fraction_1',
        purchase_date: d(2023, 1, 15),
        units_remaining: 1250.432,
        purchase_price_paise: 5200,
      },
      {
        id: 'sip_fraction_2',
        purchase_date: d(2023, 2, 15),
        units_remaining: 749.568,
        purchase_price_paise: 5400,
      },
    ];

    // Total available = 2000.000. Sell 1500.250 units.
    const result = allocateFIFORedemption(lots, {
      units_to_sell: 1500.250,
      sale_price_per_unit_paise: 7500,
      sale_date: d(2024, 6, 15),
    });

    expect(result.consumed_lots[0].units_consumed).toBe(1250.432);
    // 1500.250 - 1250.432 = 249.818
    expect(result.consumed_lots[1].units_consumed).toBe(249.818);

    // Remaining in lot 2: 749.568 - 249.818 = 499.750
    const lot2Update = result.updated_lots.find(x => x.id === 'sip_fraction_2');
    expect(lot2Update?.units_remaining).toBe(499.750);
    expect(lot2Update?.status).toBe('ACTIVE');
  });

  // ── 8. Decimal NAV (Fractional Paise) ──────────────────────────────────────
  it('Scenario 8: Handles decimal NAVs with precise rounding in integer paise', () => {
    const lots: AllocatableLot[] = [
      {
        id: 'lot_decimal_nav',
        purchase_date: d(2024, 1, 1),
        units_remaining: 100,
        purchase_price_paise: 5234.56, // ₹52.3456 NAV
      },
    ];

    const result = allocateFIFORedemption(lots, {
      units_to_sell: 100,
      sale_price_per_unit_paise: 6789.12, // ₹67.8912 NAV
      sale_date: d(2024, 6, 1),
    });

    // 100 * (6789.12 - 5234.56) = 100 * 1554.56 = 155456 paise
    expect(result.consumed_lots[0].gain_paise).toBe(155456);
  });

  // ── 9. Zero Balance (Complete Portfolio Liquidation) ──────────────────────
  it('Scenario 9: Total liquidation closes all lots; subsequent sale triggers Insufficient Units', () => {
    const lots: AllocatableLot[] = [
      { id: 'lot_1', purchase_date: d(2023, 1, 1), units_remaining: 50, purchase_price_paise: 1000 },
      { id: 'lot_2', purchase_date: d(2023, 2, 1), units_remaining: 150, purchase_price_paise: 2000 },
    ];

    const result = allocateFIFORedemption(lots, {
      units_to_sell: 200,
      sale_price_per_unit_paise: 3000,
      sale_date: d(2024, 1, 1),
    });

    expect(result.total_units_consumed).toBe(200);
    expect(result.updated_lots.every(l => l.status === 'CLOSED' && l.units_remaining === 0)).toBe(true);

    // Attempting another sale with 0 balance
    const remainingLots: AllocatableLot[] = result.updated_lots.map(u => ({
      id: u.id,
      purchase_date: 0,
      units_remaining: u.units_remaining,
      purchase_price_paise: 0,
    }));

    expect(() =>
      allocateFIFORedemption(remainingLots, {
        units_to_sell: 1,
        sale_price_per_unit_paise: 3000,
        sale_date: d(2024, 2, 1),
      })
    ).toThrowError(/Insufficient units/);
  });

  // ── 10. Sale Reversal / Rollback ──────────────────────────────────────────
  it('Scenario 10: Rollback restores exact units and re-opens CLOSED lots back to ACTIVE', () => {
    const originalLots: AllocatableLot[] = [
      { id: 'lot_1', purchase_date: d(2023, 1, 1), units_remaining: 50, purchase_price_paise: 1000, version: 1 },
      { id: 'lot_2', purchase_date: d(2023, 2, 1), units_remaining: 50, purchase_price_paise: 2000, version: 1 },
    ];

    // Execute sale of 70 units
    const saleResult = allocateFIFORedemption(originalLots, {
      units_to_sell: 70,
      sale_price_per_unit_paise: 3000,
      sale_date: d(2024, 1, 1),
    });

    // Lot 1 is CLOSED (0 units), Lot 2 is ACTIVE (30 units)
    const postSaleLots: AllocatableLot[] = originalLots.map(l => {
      const u = saleResult.updated_lots.find(x => x.id === l.id)!;
      return { ...l, units_remaining: u.units_remaining, version: u.nextVersion };
    });

    // Rollback the sale
    const rollbackResult = rollbackFIFORedemption(postSaleLots, saleResult.consumed_lots);

    expect(rollbackResult).toEqual([
      { id: 'lot_1', units_remaining: 50, status: 'ACTIVE', nextVersion: 3 },
      { id: 'lot_2', units_remaining: 50, status: 'ACTIVE', nextVersion: 3 },
    ]);
  });

  // ── 11. Multiple Folios / Accounts Isolation ─────────────────────────────
  it('Scenario 11: Multi-folio filter ensures Zerodha Coin and Groww MF lots never cross-contaminate', () => {
    const lots: AllocatableLot[] = [
      { id: 'lot_coin', account_id: 'acc_zerodha_coin', symbol: 'AMFI:122639', purchase_date: d(2023, 1, 1), units_remaining: 100, purchase_price_paise: 5000 },
      { id: 'lot_groww', account_id: 'acc_groww_mf', symbol: 'AMFI:122639', purchase_date: d(2023, 2, 1), units_remaining: 100, purchase_price_paise: 5200 },
    ];

    // Filter only Zerodha Coin lots
    const coinLots = filterLotsByPortfolioAndFund(lots, { account_id: 'acc_zerodha_coin', symbol: 'AMFI:122639' });
    expect(coinLots).toHaveLength(1);
    expect(coinLots[0].id).toBe('lot_coin');

    // Sell 40 units from Zerodha Coin
    const result = allocateFIFORedemption(coinLots, {
      units_to_sell: 40,
      sale_price_per_unit_paise: 8000,
      sale_date: d(2024, 1, 1),
    });

    expect(result.consumed_lots).toHaveLength(1);
    expect(result.consumed_lots[0].lot_id).toBe('lot_coin');
    expect(result.consumed_lots[0].account_id).toBe('acc_zerodha_coin');

    // Groww MF lot remains untouched
    const growwLots = filterLotsByPortfolioAndFund(lots, { account_id: 'acc_groww_mf' });
    expect(growwLots[0].units_remaining).toBe(100);
  });

  // ── 12. Direct vs Regular Plan Isolation ──────────────────────────────────
  it('Scenario 12: Direct Plan and Regular Plan units of the same fund remain strictly isolated', () => {
    const lots: AllocatableLot[] = [
      { id: 'lot_direct', symbol: 'AMFI:122639', mf_plan: 'DIRECT', purchase_date: d(2023, 1, 1), units_remaining: 100, purchase_price_paise: 5000 },
      { id: 'lot_regular', symbol: 'AMFI:122639', mf_plan: 'REGULAR', purchase_date: d(2023, 1, 1), units_remaining: 100, purchase_price_paise: 4800 },
    ];

    const directOnlyLots = filterLotsByPortfolioAndFund(lots, { mf_plan: 'DIRECT' });
    expect(directOnlyLots).toHaveLength(1);
    expect(directOnlyLots[0].id).toBe('lot_direct');

    const result = allocateFIFORedemption(directOnlyLots, {
      units_to_sell: 60,
      sale_price_per_unit_paise: 7000,
      sale_date: d(2024, 1, 1),
    });

    expect(result.consumed_lots[0].lot_id).toBe('lot_direct');
    expect(result.consumed_lots[0].mf_plan).toBe('DIRECT');
  });

  // ── 13. Growth vs IDCW Option Isolation ───────────────────────────────────
  it('Scenario 13: Growth and IDCW (Dividend) options maintain separate lot accounting', () => {
    const lots: AllocatableLot[] = [
      { id: 'lot_growth', symbol: 'AMFI:120716', mf_option: 'GROWTH', purchase_date: d(2023, 1, 1), units_remaining: 100, purchase_price_paise: 10000 },
      { id: 'lot_idcw', symbol: 'AMFI:120716', mf_option: 'IDCW', purchase_date: d(2023, 1, 1), units_remaining: 100, purchase_price_paise: 8000 },
    ];

    const growthOnly = filterLotsByPortfolioAndFund(lots, { mf_option: 'GROWTH' });
    const result = allocateFIFORedemption(growthOnly, {
      units_to_sell: 50,
      sale_price_per_unit_paise: 12000,
      sale_date: d(2024, 1, 1),
    });

    expect(result.consumed_lots[0].lot_id).toBe('lot_growth');
    expect(result.consumed_lots[0].mf_option).toBe('GROWTH');
  });

  // ── 14. Tax Buckets & Complex Combos (LTCG, STCG, STCL, LTCL) ───────────
  describe('Scenario 14: Tax Buckets & Gain/Loss Classification Matrix', () => {
    it('correctly maps single lots to LTCG, STCG, LTCL, STCL based on threshold and gain', () => {
      expect(determineTaxBucket(50000, true)).toBe('LTCG');   // Profit & >=12m
      expect(determineTaxBucket(50000, false)).toBe('STCG');  // Profit & <12m
      expect(determineTaxBucket(-25000, true)).toBe('LTCL');  // Loss & >=12m
      expect(determineTaxBucket(-25000, false)).toBe('STCL'); // Loss & <12m
    });

    it('handles mixed multi-lot redemption with LTCL preceding LTCG, STCL, and STCG in one pass', () => {
      const saleDate = d(2025, 2, 1);
      const salePricePaise = 12000; // ₹120 sale NAV

      const lots: AllocatableLot[] = [
        {
          // Lot 1: Bought 24 months ago @ ₹150 -> Sold at ₹120 => LTCL (-₹30/unit)
          id: 'lot_1_ltcl',
          purchase_date: d(2023, 2, 1),
          units_remaining: 10,
          purchase_price_paise: 15000,
        },
        {
          // Lot 2: Bought 14 months ago @ ₹80 -> Sold at ₹120 => LTCG (+₹40/unit)
          id: 'lot_2_ltcg',
          purchase_date: d(2023, 12, 1),
          units_remaining: 10,
          purchase_price_paise: 8000,
        },
        {
          // Lot 3: Bought 3 months ago @ ₹140 -> Sold at ₹120 => STCL (-₹20/unit)
          id: 'lot_3_stcl',
          purchase_date: d(2024, 11, 1),
          units_remaining: 10,
          purchase_price_paise: 14000,
        },
        {
          // Lot 4: Bought 1 month ago @ ₹100 -> Sold at ₹120 => STCG (+₹20/unit)
          id: 'lot_4_stcg',
          purchase_date: d(2025, 1, 1),
          units_remaining: 10,
          purchase_price_paise: 10000,
        },
      ];

      // Redeem all 40 units across all 4 lots
      const result = allocateFIFORedemption(lots, {
        units_to_sell: 40,
        sale_price_per_unit_paise: salePricePaise,
        sale_date: saleDate,
        holding_period_months_threshold: 12,
      });

      expect(result.consumed_lots).toHaveLength(4);

      // Verify sequence of tax buckets: [LTCL, LTCG, STCL, STCG]
      const [c1, c2, c3, c4] = result.consumed_lots;

      // 1. LTCL
      expect(c1.lot_id).toBe('lot_1_ltcl');
      expect(c1.gain_paise).toBe(10 * (12000 - 15000)); // -30,000 paise (-₹300)
      expect(c1.is_long_term).toBe(true);
      expect(c1.tax_bucket).toBe('LTCL');

      // 2. LTCG
      expect(c2.lot_id).toBe('lot_2_ltcg');
      expect(c2.gain_paise).toBe(10 * (12000 - 8000)); // +40,000 paise (+₹400)
      expect(c2.is_long_term).toBe(true);
      expect(c2.tax_bucket).toBe('LTCG');

      // 3. STCL
      expect(c3.lot_id).toBe('lot_3_stcl');
      expect(c3.gain_paise).toBe(10 * (12000 - 14000)); // -20,000 paise (-₹200)
      expect(c3.is_long_term).toBe(false);
      expect(c3.tax_bucket).toBe('STCL');

      // 4. STCG
      expect(c4.lot_id).toBe('lot_4_stcg');
      expect(c4.gain_paise).toBe(10 * (12000 - 10000)); // +20,000 paise (+₹200)
      expect(c4.is_long_term).toBe(false);
      expect(c4.tax_bucket).toBe('STCG');

      // Net Gain: -300 + 400 - 200 + 200 = +100 (10000 paise)
      expect(result.total_gain_paise).toBe(10000);
    });
  });
});
