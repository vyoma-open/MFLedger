import { describe, it, expect } from 'vitest';
import { detectSipPattern, analyzeSipStreams, type InvestmentCandidate } from '../sipDetector';
import type { InvestmentLot } from '@/types/db.types';

describe('SIP Pattern Detection Engine', () => {
  it('detects monthly recurring investment pattern as SIP', () => {
    // 5 consecutive monthly investments of ₹5,000 on the 10th of every month
    const baseDate = new Date(2025, 0, 10).getTime();
    const candidates: InvestmentCandidate[] = [
      { id: '1', symbol: 'INF846K01EW2', date: baseDate, amount_paise: 500000, description: 'AXIS BLUECHIP' },
      { id: '2', symbol: 'INF846K01EW2', date: baseDate + 31 * 86400000, amount_paise: 500000, description: 'AXIS BLUECHIP' },
      { id: '3', symbol: 'INF846K01EW2', date: baseDate + 59 * 86400000, amount_paise: 500000, description: 'AXIS BLUECHIP' },
      { id: '4', symbol: 'INF846K01EW2', date: baseDate + 90 * 86400000, amount_paise: 500000, description: 'AXIS BLUECHIP' },
    ];

    const results = detectSipPattern(candidates);
    expect(results.get('1')?.isSip).toBe(true);
    expect(results.get('2')?.isSip).toBe(true);
    expect(results.get('3')?.isSip).toBe(true);
    expect(results.get('4')?.isSip).toBe(true);
    expect(results.get('1')?.cadence).toBe('MONTHLY');
  });

  it('differentiates an ad-hoc lump sum thrown into an SIP fund', () => {
    const baseDate = new Date(2025, 0, 10).getTime();
    const candidates: InvestmentCandidate[] = [
      { id: '1', symbol: 'PPFAS', date: baseDate, amount_paise: 500000, description: 'PPFAS Flexi Cap' },
      { id: '2', symbol: 'PPFAS', date: baseDate + 30 * 86400000, amount_paise: 500000, description: 'PPFAS Flexi Cap' },
      // User threw in ₹50,000 lump sum on day 42
      { id: 'lump', symbol: 'PPFAS', date: baseDate + 42 * 86400000, amount_paise: 5000000, description: 'PPFAS Flexi Cap' },
      { id: '3', symbol: 'PPFAS', date: baseDate + 60 * 86400000, amount_paise: 500000, description: 'PPFAS Flexi Cap' },
    ];

    const results = detectSipPattern(candidates);
    expect(results.get('1')?.isSip).toBe(true);
    expect(results.get('2')?.isSip).toBe(true);
    expect(results.get('3')?.isSip).toBe(true);
    // The ₹50,000 transaction should NOT be marked as SIP
    expect(results.get('lump')?.isSip).toBe(false);
  });

  it('detects keyword in narration even with one installment', () => {
    const candidates: InvestmentCandidate[] = [
      { id: 'k1', symbol: 'NIFTY50', date: Date.now(), amount_paise: 250000, description: 'Purchase - SIP installment 1' },
      { id: 'k2', symbol: 'NIFTY50', date: Date.now() + 86400000, amount_paise: 1000000, description: 'One-time investment' },
    ];

    const results = detectSipPattern(candidates);
    expect(results.get('k1')?.isSip).toBe(true);
    expect(results.get('k1')?.confidence).toBe('KEYWORD');
    expect(results.get('k2')?.isSip).toBe(false);
  });

  it('respects explicit manual override', () => {
    const baseDate = new Date(2025, 0, 10).getTime();
    const candidates: InvestmentCandidate[] = [
      { id: '1', symbol: 'FUND_A', date: baseDate, amount_paise: 500000, explicitType: 'LUMPSUM' },
      { id: '2', symbol: 'FUND_A', date: baseDate + 30 * 86400000, amount_paise: 500000, explicitType: 'LUMPSUM' },
    ];

    const results = detectSipPattern(candidates);
    expect(results.get('1')?.isSip).toBe(false);
    expect(results.get('2')?.isSip).toBe(false);
  });
});

describe('SIP Stream Analytics', () => {
  it('correctly segregates lots, computes start/end dates, returns, and XIRR', () => {
    const d1 = new Date(2024, 0, 1).getTime();
    const d2 = new Date(2024, 1, 1).getTime();
    const d3 = new Date(2024, 5, 1).getTime();

    const lots: InvestmentLot[] = [
      // SIP Lot 1: 100 units @ ₹50 (Cost: ₹5,000)
      {
        id: 'lot-1',
        account_id: 'acc-1',
        profile_id: 'p-1',
        symbol: 'MIRAELARGE',
        name: 'Mirae Asset Large Cap',
        asset_class: 'EQUITY_MF',
        purchase_date: d1,
        units_original: 100,
        units_remaining: 100,
        purchase_price_paise: 5000,
        fees_paise: 0,
        status: 'ACTIVE',
        created_at: d1,
        updated_at: d1,
        version: 1,
        investment_type: 'SIP',
      },
      // SIP Lot 2: 95 units @ ₹52.63 (Cost: ~₹5,000)
      {
        id: 'lot-2',
        account_id: 'acc-1',
        profile_id: 'p-1',
        symbol: 'MIRAELARGE',
        name: 'Mirae Asset Large Cap',
        asset_class: 'EQUITY_MF',
        purchase_date: d2,
        units_original: 95,
        units_remaining: 95,
        purchase_price_paise: 5263,
        fees_paise: 0,
        status: 'ACTIVE',
        created_at: d2,
        updated_at: d2,
        version: 1,
        investment_type: 'SIP',
      },
      // Lump sum lot: 500 units @ ₹60 (Cost: ₹30,000)
      {
        id: 'lot-lump',
        account_id: 'acc-1',
        profile_id: 'p-1',
        symbol: 'MIRAELARGE',
        name: 'Mirae Asset Large Cap',
        asset_class: 'EQUITY_MF',
        purchase_date: d3,
        units_original: 500,
        units_remaining: 500,
        purchase_price_paise: 6000,
        fees_paise: 0,
        status: 'ACTIVE',
        created_at: d3,
        updated_at: d3,
        version: 1,
        investment_type: 'LUMPSUM',
      },
    ];

    const currentNavPaise = 7000; // NAV ₹70
    const now = new Date(2024, 11, 31).getTime();

    const analytics = analyzeSipStreams(lots, currentNavPaise, now, false);

    expect(analytics.hasSip).toBe(true);
    expect(analytics.hasLumpSum).toBe(true);
    expect(analytics.sipInstallmentCount).toBe(2);
    expect(analytics.lumpCount).toBe(1);

    // SIP units: 195. Current value @ 70: 195 * 7000 = 13,65,000 paise (₹13,650)
    expect(analytics.sipUnits).toBe(195);
    expect(analytics.sipCurrentValue).toBe(195 * 7000);
    expect(analytics.sipStartDate).toBe(d1);
    expect(analytics.sipEndDate).toBe(d2); // ended since >45 days ago

    // Lump sum units: 500. Current value @ 70: 35,00,000 paise (₹35,000)
    expect(analytics.lumpUnits).toBe(500);
    expect(analytics.lumpInvested).toBe(3000000);
    expect(analytics.lumpCurrentValue).toBe(3500000);
    expect(analytics.lumpGain).toBe(500000);

    // XIRR must be calculated and positive
    expect(analytics.sipXirr).not.toBeNull();
    expect(analytics.sipXirr!).toBeGreaterThan(0);
    expect(analytics.lumpXirr).not.toBeNull();
    expect(analytics.lumpXirr!).toBeGreaterThan(0);
  });

  it('intelligently segments SIP step-ups into distinct tranches instead of averaging amounts', () => {
    // Phase 1: 3 installments of ₹2,000 (Jan, Feb, Mar 2024)
    // Phase 2: 3 installments of ₹3,000 (Apr, May, Jun 2024)
    const dates = [
      new Date(2024, 0, 5).getTime(),
      new Date(2024, 1, 5).getTime(),
      new Date(2024, 2, 5).getTime(),
      new Date(2024, 3, 5).getTime(),
      new Date(2024, 4, 5).getTime(),
      new Date(2024, 5, 5).getTime(),
    ];

    const lots: InvestmentLot[] = [
      // ₹2,000 installments
      { id: 's1', account_id: 'a', profile_id: 'p', symbol: 'HDFCTOP100', name: 'HDFC Top 100', asset_class: 'EQUITY_MF', purchase_date: dates[0], units_original: 20, units_remaining: 20, purchase_price_paise: 10000, fees_paise: 0, status: 'ACTIVE', created_at: dates[0], updated_at: dates[0], version: 1, investment_type: 'SIP' },
      { id: 's2', account_id: 'a', profile_id: 'p', symbol: 'HDFCTOP100', name: 'HDFC Top 100', asset_class: 'EQUITY_MF', purchase_date: dates[1], units_original: 20, units_remaining: 20, purchase_price_paise: 10000, fees_paise: 0, status: 'ACTIVE', created_at: dates[1], updated_at: dates[1], version: 1, investment_type: 'SIP' },
      { id: 's3', account_id: 'a', profile_id: 'p', symbol: 'HDFCTOP100', name: 'HDFC Top 100', asset_class: 'EQUITY_MF', purchase_date: dates[2], units_original: 20, units_remaining: 20, purchase_price_paise: 10000, fees_paise: 0, status: 'ACTIVE', created_at: dates[2], updated_at: dates[2], version: 1, investment_type: 'SIP' },
      // ₹3,000 step-up installments
      { id: 's4', account_id: 'a', profile_id: 'p', symbol: 'HDFCTOP100', name: 'HDFC Top 100', asset_class: 'EQUITY_MF', purchase_date: dates[3], units_original: 30, units_remaining: 30, purchase_price_paise: 10000, fees_paise: 0, status: 'ACTIVE', created_at: dates[3], updated_at: dates[3], version: 1, investment_type: 'SIP' },
      { id: 's5', account_id: 'a', profile_id: 'p', symbol: 'HDFCTOP100', name: 'HDFC Top 100', asset_class: 'EQUITY_MF', purchase_date: dates[4], units_original: 30, units_remaining: 30, purchase_price_paise: 10000, fees_paise: 0, status: 'ACTIVE', created_at: dates[4], updated_at: dates[4], version: 1, investment_type: 'SIP' },
      { id: 's6', account_id: 'a', profile_id: 'p', symbol: 'HDFCTOP100', name: 'HDFC Top 100', asset_class: 'EQUITY_MF', purchase_date: dates[5], units_original: 30, units_remaining: 30, purchase_price_paise: 10000, fees_paise: 0, status: 'ACTIVE', created_at: dates[5], updated_at: dates[5], version: 1, investment_type: 'SIP' },
    ];

    // Evaluate on June 20, 2024 (15 days after latest installment => ACTIVE)
    const evalNow = new Date(2024, 5, 20).getTime();
    const analytics = analyzeSipStreams(lots, 12000, evalNow, false);

    expect(analytics.tranches.length).toBe(2);

    const tranche1 = analytics.tranches[0];
    expect(tranche1.installmentAmountPaise).toBe(200000); // Exactly ₹2,000
    expect(tranche1.installments).toBe(3);
    expect(tranche1.startDate).toBe(dates[0]);
    expect(tranche1.endDate).toBe(dates[2]);
    expect(tranche1.status).toBe('COMPLETED');
    expect(tranche1.investedPaise).toBe(600000); // ₹6,000
    expect(tranche1.currentValuePaise).toBe(60 * 12000); // 60 units @ 120 = ₹7,200

    const tranche2 = analytics.tranches[1];
    expect(tranche2.installmentAmountPaise).toBe(300000); // Exactly ₹3,000 (NOT an average ₹2,500)
    expect(tranche2.installments).toBe(3);
    expect(tranche2.startDate).toBe(dates[3]);
    expect(tranche2.endDate).toBeNull(); // Active ongoing!
    expect(tranche2.status).toBe('ACTIVE');
    expect(tranche2.investedPaise).toBe(900000); // ₹9,000
    expect(tranche2.currentValuePaise).toBe(90 * 12000); // 90 units @ 120 = ₹10,800

    // Latest SIP amount should be ₹3,000 (300,000 paise)
    expect(analytics.latestSipAmountPaise).toBe(300000);
    expect(analytics.isSipActive).toBe(true);
    expect(analytics.sipStatus).toBe('ACTIVE');
  });
});

