import { describe, it, expect } from 'vitest';
import { inspectDataHealth, type HealthInspectionContext } from '../dataHealthChecker';

describe('domain/health: Portfolio Data Health Inspection Engine', () => {
  const now = new Date('2025-05-15T12:00:00.000Z').getTime();
  const d = (daysAgo: number) => now - daysAgo * 24 * 60 * 60 * 1000;

  const validContext: HealthInspectionContext = {
    now,
    accounts: [
      { id: 'acc_1', name: 'Zerodha Coin', account_number: '12345678/90' },
      { id: 'acc_2', name: 'Groww MF', account_number: '98765432/10' },
    ],
    lots: [
      {
        id: 'lot_1',
        account_id: 'acc_1',
        symbol: 'AMFI:122639',
        name: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth',
        purchase_date: d(100),
        units_original: 100,
        units_remaining: 80,
        purchase_price_paise: 5000,
        status: 'ACTIVE',
        isin: 'INF879O01019',
        folio_number: '12345678/90',
      },
      {
        id: 'lot_2',
        account_id: 'acc_2',
        symbol: 'AMFI:120716',
        name: 'UTI Nifty 50 Index Fund - Direct Plan - Growth',
        purchase_date: d(60),
        units_original: 50,
        units_remaining: 50,
        purchase_price_paise: 12000,
        status: 'ACTIVE',
        isin: 'INF789FB1X58',
      },
    ],
    consumptionEvents: [
      {
        id: 'ev_1',
        lot_id: 'lot_1',
        units_consumed: 20,
        sale_price_paise: 7500,
        created_at: d(20),
      },
    ],
    marketCache: [
      { symbol: 'AMFI:122639', nav_date: d(1), nav_paise: 8000 },
      { symbol: 'AMFI:120716', nav_date: d(2), nav_paise: 13500 },
    ],
  };

  it('reports 100% HEALTHY when all 8 criteria pass', () => {
    const report = inspectDataHealth(validContext);

    expect(report.overallStatus).toBe('HEALTHY');
    expect(report.isAllGood).toBe(true);
    expect(report.totalChecks).toBe(8);
    expect(report.passedChecks).toBe(8);
    expect(report.warnOrFailedChecks).toBe(0);

    // Verify ordering
    for (let i = 0; i < report.checks.length; i++) {
      expect(report.checks[i].priority).toBe(i + 1);
      expect(report.checks[i].severity).toBe('PASS');
    }
  });

  it('detects Priority 1: FIFO balance discrepancies', () => {
    const context: HealthInspectionContext = {
      ...validContext,
      lots: [
        {
          ...validContext.lots[0],
          units_original: 100,
          units_remaining: 70, // Discrepancy! Consumed was 20, remaining should be 80
        },
      ],
    };

    const report = inspectDataHealth(context);
    const fifoCheck = report.checks.find(c => c.id === 'fifo_reconciliation')!;

    expect(fifoCheck.severity).toBe('FAIL');
    expect(fifoCheck.issueCount).toBe(1);
    expect(fifoCheck.issues[0].meta).toContain('Discrepancy');
    expect(report.isAllGood).toBe(false);
  });

  it('detects Priority 2: Duplicate transactions', () => {
    const context: HealthInspectionContext = {
      ...validContext,
      lots: [
        ...validContext.lots,
        // Exact duplicate of lot_2 with different ID
        {
          ...validContext.lots[1],
          id: 'lot_2_duplicate',
        },
      ],
    };

    const report = inspectDataHealth(context);
    const dupCheck = report.checks.find(c => c.id === 'duplicate_transactions')!;

    expect(dupCheck.severity).toBe('WARN');
    expect(dupCheck.issueCount).toBe(1);
    expect(dupCheck.issues[0].title).toBe(validContext.lots[1].name);
  });

  it('detects Priority 3: Orphaned redemptions', () => {
    const context: HealthInspectionContext = {
      ...validContext,
      consumptionEvents: [
        ...validContext.consumptionEvents,
        {
          id: 'ev_ghost',
          lot_id: 'non_existent_lot_xyz',
          units_consumed: 10,
          sale_price_paise: 5000,
          created_at: d(10),
        },
      ],
    };

    const report = inspectDataHealth(context);
    const orphanCheck = report.checks.find(c => c.id === 'orphaned_redemptions')!;

    expect(orphanCheck.severity).toBe('FAIL');
    expect(orphanCheck.issueCount).toBe(1);
    expect(orphanCheck.issues[0].meta).toContain('Missing Lot ID: non_existent_lot_xyz');
  });

  it('detects Priority 4: Outdated or missing NAVs', () => {
    const context: HealthInspectionContext = {
      ...validContext,
      marketCache: [
        // Lot 1 has very stale NAV (>7 days old)
        { symbol: 'AMFI:122639', nav_date: d(15), nav_paise: 8000 },
        // Lot 2 has no NAV in cache
      ],
    };

    const report = inspectDataHealth(context);
    const navCheck = report.checks.find(c => c.id === 'nav_freshness')!;

    expect(navCheck.severity).toBe('WARN');
    expect(navCheck.issueCount).toBe(2);
  });

  it('detects Priority 5: Missing or invalid AMFI scheme codes', () => {
    const context: HealthInspectionContext = {
      ...validContext,
      lots: [
        {
          ...validContext.lots[0],
          symbol: 'UNKNOWN_TICKER',
        },
      ],
    };

    const report = inspectDataHealth(context);
    const amfiCheck = report.checks.find(c => c.id === 'amfi_code_mapping')!;

    expect(amfiCheck.severity).toBe('WARN');
    expect(amfiCheck.issueCount).toBe(1);
    expect(amfiCheck.issues[0].meta).toBe('Non-AMFI identifier');
  });

  it('detects Priority 7: Schemes missing ISIN codes', () => {
    const context: HealthInspectionContext = {
      ...validContext,
      lots: [
        validContext.lots[0],
        {
          ...validContext.lots[1],
          isin: undefined, // Missing ISIN
        },
      ],
    };

    const report = inspectDataHealth(context);
    const isinCheck = report.checks.find(c => c.id === 'schemes_isin_code')!;

    expect(isinCheck.severity).toBe('WARN');
    expect(isinCheck.issueCount).toBe(1);
    expect(isinCheck.issues[0].title).toBe(validContext.lots[1].name);
  });

  it('detects Priority 8: Transactions missing folio number', () => {
    const context: HealthInspectionContext = {
      ...validContext,
      accounts: [
        { id: 'acc_no_folio', name: 'Direct Demat' }, // No account_number
      ],
      lots: [
        {
          ...validContext.lots[0],
          account_id: 'acc_no_folio',
          folio_number: undefined, // No lot folio number
        },
      ],
    };

    const report = inspectDataHealth(context);
    const folioCheck = report.checks.find(c => c.id === 'transactions_folio')!;

    expect(folioCheck.severity).toBe('WARN');
    expect(folioCheck.issueCount).toBe(1);
  });
});
