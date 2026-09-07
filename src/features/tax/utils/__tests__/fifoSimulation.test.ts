import { describe, it, expect } from 'vitest';
import {
  classifyLotTag,
  calculateAutoTagUnits,
  getAutoTagsSummary,
  simulateFifoRedemption,
  type LotWithTaxStatus,
} from '../fifoSimulation';

describe('fifoSimulation', () => {
  describe('classifyLotTag', () => {
    it('classifies long-term gain as LTCG', () => {
      expect(classifyLotTag(true, 1000)).toBe('LTCG');
      expect(classifyLotTag(true, 0)).toBe('LTCG');
    });

    it('classifies long-term loss as LTCL', () => {
      expect(classifyLotTag(true, -1000)).toBe('LTCL');
    });

    it('classifies short-term gain as STCG', () => {
      expect(classifyLotTag(false, 500)).toBe('STCG');
      expect(classifyLotTag(false, 0)).toBe('STCG');
    });

    it('classifies short-term loss as STCL', () => {
      expect(classifyLotTag(false, -500)).toBe('STCL');
    });
  });

  describe('calculateAutoTagUnits with FIFO Precedence', () => {
    it('handles empty lots or empty selection', () => {
      expect(calculateAutoTagUnits([], new Set(['ALL_STCG']))).toEqual({
        targetUnits: 0,
        directTagUnits: 0,
        priorUnits: 0,
        priorBreakdown: [],
        lastMatchingIndex: -1,
      });

      const sampleLot: LotWithTaxStatus = {
        id: '1',
        purchase_date: 1000,
        units_remaining: 10,
        purchase_price_paise: 10000,
        asset_class: 'EQUITY_MF',
        months: 6,
        threshold: 12,
        isLT: false,
        tag: 'STCG',
        autoTag: 'ALL_STCG',
      };

      expect(calculateAutoTagUnits([sampleLot], new Set())).toEqual({
        targetUnits: 0,
        directTagUnits: 0,
        priorUnits: 0,
        priorBreakdown: [],
        lastMatchingIndex: -1,
      });
    });

    it('correctly calculates units when only STCG lots exist (no prior orders)', () => {
      const lots: LotWithTaxStatus[] = [
        {
          id: '1',
          purchase_date: 1000,
          units_remaining: 10,
          purchase_price_paise: 10000,
          asset_class: 'EQUITY_MF',
          months: 3,
          threshold: 12,
          isLT: false,
          tag: 'STCG',
          autoTag: 'ALL_STCG',
        },
        {
          id: '2',
          purchase_date: 2000,
          units_remaining: 15,
          purchase_price_paise: 11000,
          asset_class: 'EQUITY_MF',
          months: 2,
          threshold: 12,
          isLT: false,
          tag: 'STCG',
          autoTag: 'ALL_STCG',
        },
      ];

      const res = calculateAutoTagUnits(lots, new Set(['ALL_STCG']));
      expect(res.targetUnits).toBe(25);
      expect(res.directTagUnits).toBe(25);
      expect(res.priorUnits).toBe(0);
      expect(res.priorBreakdown).toEqual([]);
      expect(res.lastMatchingIndex).toBe(1);
    });

    it('enforces FIFO rule: sells preceding LTCG and LTCL orders when clicking All STCG', () => {
      const lots: LotWithTaxStatus[] = [
        {
          id: 'lot-ltcg',
          purchase_date: 1000,
          units_remaining: 10,
          purchase_price_paise: 8000,
          asset_class: 'EQUITY_MF',
          months: 18,
          threshold: 12,
          isLT: true,
          tag: 'LTCG',
          autoTag: 'ALL_LTCG',
        },
        {
          id: 'lot-ltcl',
          purchase_date: 2000,
          units_remaining: 5,
          purchase_price_paise: 15000,
          asset_class: 'EQUITY_MF',
          months: 14,
          threshold: 12,
          isLT: true,
          tag: 'LTCL',
          autoTag: 'ALL_LTCL',
        },
        {
          id: 'lot-stcg',
          purchase_date: 3000,
          units_remaining: 8,
          purchase_price_paise: 9000,
          asset_class: 'EQUITY_MF',
          months: 4,
          threshold: 12,
          isLT: false,
          tag: 'STCG',
          autoTag: 'ALL_STCG',
        },
      ];

      const res = calculateAutoTagUnits(lots, new Set(['ALL_STCG']));

      // Total units to sell must be 10 + 5 + 8 = 23 units
      expect(res.targetUnits).toBe(23);
      expect(res.directTagUnits).toBe(8);
      expect(res.priorUnits).toBe(15);
      expect(res.lastMatchingIndex).toBe(2);
      expect(res.priorBreakdown).toEqual([
        { tag: 'LTCG', units: 10 },
        { tag: 'LTCL', units: 5 },
      ]);
    });

    it('handles mixed sequence with multiple STCG and leaves trailing orders intact', () => {
      const lots: LotWithTaxStatus[] = [
        { id: '1', purchase_date: 100, units_remaining: 10, purchase_price_paise: 8000, asset_class: 'EQUITY_MF', months: 24, threshold: 12, isLT: true, tag: 'LTCG', autoTag: 'ALL_LTCG' },
        { id: '2', purchase_date: 200, units_remaining: 5, purchase_price_paise: 12000, asset_class: 'EQUITY_MF', months: 18, threshold: 12, isLT: true, tag: 'LTCL', autoTag: 'ALL_LTCL' },
        { id: '3', purchase_date: 300, units_remaining: 8, purchase_price_paise: 9000, asset_class: 'EQUITY_MF', months: 8, threshold: 12, isLT: false, tag: 'STCG', autoTag: 'ALL_STCG' },
        { id: '4', purchase_date: 400, units_remaining: 4, purchase_price_paise: 11000, asset_class: 'EQUITY_MF', months: 6, threshold: 12, isLT: false, tag: 'STCL', autoTag: 'ALL_STCL' },
        { id: '5', purchase_date: 500, units_remaining: 6, purchase_price_paise: 9500, asset_class: 'EQUITY_MF', months: 4, threshold: 12, isLT: false, tag: 'STCG', autoTag: 'ALL_STCG' },
        { id: '6', purchase_date: 600, units_remaining: 7, purchase_price_paise: 13000, asset_class: 'EQUITY_MF', months: 1, threshold: 12, isLT: false, tag: 'STCL', autoTag: 'ALL_STCL' },
      ];

      const res = calculateAutoTagUnits(lots, new Set(['ALL_STCG']));

      // Last STCG is at index 4 (lot 5, 6 units).
      // Lots 0..4 must be redeemed: 10 + 5 + 8 + 4 + 6 = 33 units.
      // Lot 6 (7 units STCL) at index 5 is after the last STCG, so it must NOT be redeemed.
      expect(res.targetUnits).toBe(33);
      expect(res.directTagUnits).toBe(14); // 8 + 6
      expect(res.priorUnits).toBe(19); // 10 (LTCG) + 5 (LTCL) + 4 (STCL)
      expect(res.lastMatchingIndex).toBe(4);
      expect(res.priorBreakdown).toEqual([
        { tag: 'LTCG', units: 10 },
        { tag: 'LTCL', units: 5 },
        { tag: 'STCL', units: 4 },
      ]);
    });

    it('correctly provides summary for all 4 tags in getAutoTagsSummary', () => {
      const lots: LotWithTaxStatus[] = [
        { id: '1', purchase_date: 100, units_remaining: 10, purchase_price_paise: 8000, asset_class: 'EQUITY_MF', months: 24, threshold: 12, isLT: true, tag: 'LTCG', autoTag: 'ALL_LTCG' },
        { id: '2', purchase_date: 200, units_remaining: 5, purchase_price_paise: 12000, asset_class: 'EQUITY_MF', months: 18, threshold: 12, isLT: true, tag: 'LTCL', autoTag: 'ALL_LTCL' },
        { id: '3', purchase_date: 300, units_remaining: 8, purchase_price_paise: 9000, asset_class: 'EQUITY_MF', months: 8, threshold: 12, isLT: false, tag: 'STCG', autoTag: 'ALL_STCG' },
      ];

      const summary = getAutoTagsSummary(lots);

      // ALL_LTCG is at index 0: direct 10, fifo 10, prior 0
      expect(summary.ALL_LTCG.directUnits).toBe(10);
      expect(summary.ALL_LTCG.fifoRequiredUnits).toBe(10);
      expect(summary.ALL_LTCG.priorUnits).toBe(0);

      // ALL_LTCL is at index 1: direct 5, fifo 15 (needs 10 LTCG), prior 10
      expect(summary.ALL_LTCL.directUnits).toBe(5);
      expect(summary.ALL_LTCL.fifoRequiredUnits).toBe(15);
      expect(summary.ALL_LTCL.priorUnits).toBe(10);

      // ALL_STCG is at index 2: direct 8, fifo 23 (needs 10 LTCG + 5 LTCL), prior 15
      expect(summary.ALL_STCG.directUnits).toBe(8);
      expect(summary.ALL_STCG.fifoRequiredUnits).toBe(23);
      expect(summary.ALL_STCG.priorUnits).toBe(15);

      // ALL_STCL does not exist in portfolio
      expect(summary.ALL_STCL.directUnits).toBe(0);
      expect(summary.ALL_STCL.fifoRequiredUnits).toBe(0);
      expect(summary.ALL_STCL.priorUnits).toBe(0);
    });
  });

  describe('simulateFifoRedemption', () => {
    it('simulates redemption correctly when selling all STCG with prior orders', () => {
      const ltp = 10000; // ₹100 per unit
      const lots: LotWithTaxStatus[] = [
        { id: '1', purchase_date: 100, units_remaining: 10, purchase_price_paise: 8000, asset_class: 'EQUITY_MF', months: 24, threshold: 12, isLT: true, tag: 'LTCG', autoTag: 'ALL_LTCG' },
        { id: '2', purchase_date: 200, units_remaining: 5, purchase_price_paise: 12000, asset_class: 'EQUITY_MF', months: 18, threshold: 12, isLT: true, tag: 'LTCL', autoTag: 'ALL_LTCL' },
        { id: '3', purchase_date: 300, units_remaining: 8, purchase_price_paise: 9000, asset_class: 'EQUITY_MF', months: 8, threshold: 12, isLT: false, tag: 'STCG', autoTag: 'ALL_STCG' },
        { id: '4', purchase_date: 400, units_remaining: 4, purchase_price_paise: 11000, asset_class: 'EQUITY_MF', months: 6, threshold: 12, isLT: false, tag: 'STCL', autoTag: 'ALL_STCL' },
        { id: '5', purchase_date: 500, units_remaining: 6, purchase_price_paise: 9500, asset_class: 'EQUITY_MF', months: 4, threshold: 12, isLT: false, tag: 'STCG', autoTag: 'ALL_STCG' },
        { id: '6', purchase_date: 600, units_remaining: 7, purchase_price_paise: 13000, asset_class: 'EQUITY_MF', months: 1, threshold: 12, isLT: false, tag: 'STCL', autoTag: 'ALL_STCL' },
      ];

      // Sells 33 units (all orders up to lot 5)
      const sim = simulateFifoRedemption({
        lots,
        unitsToSell: 33,
        ltp,
        assetClass: 'EQUITY_MF',
        exemptionRoom: 12500000,
        showOnlySimulated: true,
      });

      // Verification of displayed and consumed lots:
      expect(sim.displayedLots).toHaveLength(5);
      expect(sim.displayedLots.map(l => l.id)).toEqual(['1', '2', '3', '4', '5']);
      expect(sim.lots[5].consumedUnits).toBe(0); // trailing lot 6 has 0 consumed

      // Every simulated lot 1..5 is 100% consumed
      expect(sim.lots[0].consumedUnits).toBe(10);
      expect(sim.lots[1].consumedUnits).toBe(5);
      expect(sim.lots[2].consumedUnits).toBe(8);
      expect(sim.lots[3].consumedUnits).toBe(4);
      expect(sim.lots[4].consumedUnits).toBe(6);

      // Gains and units aggregated correctly:
      // Lot 1: 10 * (100 - 80) = +₹200 = 20,000 paise LTCG
      expect(sim.ltcgUnitsConsumed).toBe(10);
      expect(sim.ltcgGainPaise).toBe(20000);

      // Lot 2: 5 * (100 - 120) = -₹100 = 10,000 paise LTCL
      expect(sim.ltclUnitsConsumed).toBe(5);
      expect(sim.ltclPaise).toBe(10000);

      // Lot 3: 8 * (100 - 90) = +₹80 = 8,000 paise STCG
      // Lot 5: 6 * (100 - 95) = +₹30 = 3,000 paise STCG
      // Total STCG = 14 units, 11,000 paise gain
      expect(sim.stcgUnitsConsumed).toBe(14);
      expect(sim.stcgGainPaise).toBe(11000);

      // Lot 4: 4 * (100 - 110) = -₹40 = 4,000 paise STCL
      expect(sim.stclUnitsConsumed).toBe(4);
      expect(sim.stclPaise).toBe(4000);

      // Tax calculation: STCG taxed @ 20% on 11,000 paise = 2,200 paise.
      // LTCG of 20,000 paise is within 12500000 exemption cap, so 0 LTCG tax.
      expect(sim.estimatedTax).toBe(2200);
      expect(sim.netPostTaxGain).toBe(sim.totalGainPaise - 2200);
    });

    it('supports toggle showOnlySimulated = false to display all lots', () => {
      const lots: LotWithTaxStatus[] = [
        { id: '1', purchase_date: 100, units_remaining: 10, purchase_price_paise: 8000, asset_class: 'EQUITY_MF', months: 18, threshold: 12, isLT: true, tag: 'LTCG', autoTag: 'ALL_LTCG' },
        { id: '2', purchase_date: 200, units_remaining: 5, purchase_price_paise: 9000, asset_class: 'EQUITY_MF', months: 6, threshold: 12, isLT: false, tag: 'STCG', autoTag: 'ALL_STCG' },
      ];

      const simAll = simulateFifoRedemption({
        lots,
        unitsToSell: 5,
        ltp: 10000,
        assetClass: 'EQUITY_MF',
        exemptionRoom: 12500000,
        showOnlySimulated: false,
      });

      expect(simAll.displayedLots).toHaveLength(2);
      expect(simAll.displayedLots[0].consumedUnits).toBe(5);
      expect(simAll.displayedLots[1].consumedUnits).toBe(0);
    });
  });
});
