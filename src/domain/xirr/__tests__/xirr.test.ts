import { describe, it, expect } from 'vitest';
import {
  calculateXIRR,
  aggregateSameDayCashFlows,
  toDayNumber,
  formatXIRR,
  type CashFlow,
} from '../xirr';

describe('domain/xirr: XIRR Calculation Engine Test Matrix', () => {
  const d = (year: number, month: number, day: number): Date =>
    new Date(Date.UTC(year, month - 1, day));

  // ── 1. Known Excel Reference Test Cases ───────────────────────────────────
  describe('1. Known Excel Test Cases', () => {
    it('matches Microsoft Excel official XIRR sample scenario (~37.34%)', () => {
      // Standard documented Microsoft Excel XIRR example:
      // - 01-Jan-2020: -10,000
      // - 01-Mar-2020:   2,750
      // - 30-Oct-2020:   4,250
      // - 15-Feb-2021:   3,250
      // - 01-Apr-2021:   2,750
      // Excel returns 0.37336 (37.34%)
      const flows: CashFlow[] = [
        { date: d(2020, 1, 1), amount: -10000 },
        { date: d(2020, 3, 1), amount: 2750 },
        { date: d(2020, 10, 30), amount: 4250 },
        { date: d(2021, 2, 15), amount: 3250 },
        { date: d(2021, 4, 1), amount: 2750 },
      ];

      const rate = calculateXIRR(flows);
      expect(rate).not.toBeNull();
      // Verify within 0.001 (0.1%) of Excel's 0.3734
      expect(rate!).toBeCloseTo(0.3734, 3);
      expect(formatXIRR(rate)).toBe('37.34%');
    });

    it('matches standard 1-year 10% annual return exactly', () => {
      // Exactly 365 days between 2021-01-01 and 2022-01-01
      const flows: CashFlow[] = [
        { date: d(2021, 1, 1), amount: -100000 },
        { date: d(2022, 1, 1), amount: 110000 },
      ];

      const rate = calculateXIRR(flows);
      expect(rate).not.toBeNull();
      expect(rate!).toBeCloseTo(0.1000, 4);
      expect(formatXIRR(rate)).toBe('10.00%');
    });

    it('matches multi-year compounding at 15% CAGR', () => {
      // 3-year investment at 15% compound annual growth: 100,000 * 1.15^3 = 152,087.5
      // 2021-01-01 to 2024-01-01 (1095 days)
      const flows: CashFlow[] = [
        { date: d(2021, 1, 1), amount: -100000 },
        { date: d(2024, 1, 1), amount: 152087.5 },
      ];

      const rate = calculateXIRR(flows);
      expect(rate).not.toBeNull();
      expect(rate!).toBeCloseTo(0.1500, 3);
    });
  });

  // ── 2. Negative Return Cases ──────────────────────────────────────────────
  describe('2. Negative Return Cases', () => {
    it('solves 1-year -20% capital loss correctly', () => {
      const flows: CashFlow[] = [
        { date: d(2022, 1, 1), amount: -100000 },
        { date: d(2023, 1, 1), amount: 80000 }, // -20%
      ];

      const rate = calculateXIRR(flows);
      expect(rate).not.toBeNull();
      expect(rate!).toBeCloseTo(-0.2000, 4);
      expect(formatXIRR(rate)).toBe('-20.00%');
    });

    it('solves severe market crash (-80% loss) without diverging', () => {
      const flows: CashFlow[] = [
        { date: d(2022, 1, 1), amount: -100000 },
        { date: d(2023, 1, 1), amount: 20000 }, // -80%
      ];

      const rate = calculateXIRR(flows);
      expect(rate).not.toBeNull();
      expect(rate!).toBeCloseTo(-0.8000, 3);
    });

    it('handles staggered SIPs in a declining bear market', () => {
      // 4 quarterly SIPs of ₹10,000 in a bear market, ending at portfolio value of ₹28,000 (total invested ₹40,000)
      const flows: CashFlow[] = [
        { date: d(2022, 1, 1), amount: -10000 },
        { date: d(2022, 4, 1), amount: -10000 },
        { date: d(2022, 7, 1), amount: -10000 },
        { date: d(2022, 10, 1), amount: -10000 },
        { date: d(2023, 1, 1), amount: 28000 },
      ];

      const rate = calculateXIRR(flows);
      expect(rate).not.toBeNull();
      expect(rate!).toBeLessThan(0); // Must be strictly negative
      expect(rate!).toBeGreaterThan(-0.8);
    });
  });

  // ── 3. Zero Return Cases ──────────────────────────────────────────────────
  describe('3. Zero Return Cases', () => {
    it('solves exact break-even (0.00% return)', () => {
      const flows: CashFlow[] = [
        { date: d(2022, 1, 1), amount: -100000 },
        { date: d(2023, 1, 1), amount: 100000 }, // 0% gain
      ];

      const rate = calculateXIRR(flows);
      expect(rate).not.toBeNull();
      expect(rate!).toBeCloseTo(0.0000, 5);
      expect(formatXIRR(rate)).toBe('0.00%');
    });

    it('solves multi-tranche zero return where total invested equals terminal value', () => {
      // ₹50,000 at start + ₹50,000 at mid-year, ending with ₹100,000 exactly at mid-year
      const flows: CashFlow[] = [
        { date: d(2022, 1, 1), amount: -50000 },
        { date: d(2022, 7, 1), amount: -50000 },
        { date: d(2022, 7, 1), amount: 100000 },
      ];

      const rate = calculateXIRR(flows);
      expect(rate).not.toBeNull();
      expect(rate!).toBeCloseTo(0.0000, 3);
    });
  });

  // ── 4. Very High Return Cases ─────────────────────────────────────────────
  describe('4. Very High Return Cases', () => {
    it('solves 100% 1-year return (doubling money)', () => {
      const flows: CashFlow[] = [
        { date: d(2023, 1, 1), amount: -100000 },
        { date: d(2024, 1, 1), amount: 200000 },
      ];

      const rate = calculateXIRR(flows);
      expect(rate).not.toBeNull();
      expect(rate!).toBeCloseTo(1.0000, 4); // 100%
      expect(formatXIRR(rate)).toBe('100.00%');
    });

    it('solves 500% 1-year return (6x bagger)', () => {
      const flows: CashFlow[] = [
        { date: d(2023, 1, 1), amount: -100000 },
        { date: d(2024, 1, 1), amount: 600000 },
      ];

      const rate = calculateXIRR(flows);
      expect(rate).not.toBeNull();
      expect(rate!).toBeCloseTo(5.0000, 4); // 500%
    });

    it('solves hyper-growth short horizon (10x in 90 days) without overflow or NaN', () => {
      // 10,000 invested on Jan 1, valued at 100,000 on Apr 1 (90 days)
      // Annualized: (10)^(365/90) - 1 ≈ 11,333 (1,133,300% annualized)
      const flows: CashFlow[] = [
        { date: d(2023, 1, 1), amount: -10000 },
        { date: d(2023, 4, 1), amount: 100000 },
      ];

      const rate = calculateXIRR(flows);
      expect(rate).not.toBeNull();
      expect(isFinite(rate!)).toBe(true);
      expect(rate!).toBeGreaterThan(1000); // Massive annualized rate
    });
  });

  // ── 5. Multiple Cash Flows on Same Day ─────────────────────────────────────
  describe('5. Multiple Cash Flows on Same Day', () => {
    it('consolidates multiple same-day SIPs and dividend credits accurately', () => {
      const sameDay = d(2023, 6, 1);
      const flows: CashFlow[] = [
        { date: sameDay, amount: -10000 }, // SIP 1
        { date: sameDay, amount: -15000 }, // SIP 2
        { date: sameDay, amount: 5000 },   // Dividend payout credit
        // Net investment on sameDay = -20,000
        { date: d(2024, 6, 1), amount: 24000 }, // Value 1 year later (20% gain)
      ];

      const consolidated = aggregateSameDayCashFlows(flows);
      expect(consolidated).toHaveLength(2);
      expect(consolidated[0].amount).toBe(-20000);

      const rate = calculateXIRR(flows);
      expect(rate).not.toBeNull();
      // 2024 is a leap year (366 days), so annualized return is 1.20^(365/366) - 1 ≈ 19.94%
      expect(rate!).toBeCloseTo(0.1994, 3);
      expect(formatXIRR(rate)).toBe('19.94%');
    });

    it('properly drops flows that net to zero on the same day', () => {
      const tradeDate = d(2023, 3, 1);
      const flows: CashFlow[] = [
        { date: tradeDate, amount: -5000 },
        { date: tradeDate, amount: 5000 }, // Offsetting sale/buy cancelling out
        { date: tradeDate, amount: -10000 }, // Actual net investment
        { date: d(2024, 3, 1), amount: 11000 }, // 10% gain
      ];

      const consolidated = aggregateSameDayCashFlows(flows);
      expect(consolidated).toHaveLength(2);
      expect(consolidated[0].amount).toBe(-10000);

      const rate = calculateXIRR(flows);
      expect(rate).toBeCloseTo(0.1000, 3);
    });
  });

  // ── 6. Long Investment Periods (Multi-Decade Compounding) ──────────────────
  describe('6. Long Investment Periods', () => {
    it('solves 10-year compounding at 12% CAGR', () => {
      // 100,000 invested on 2014-01-01 -> 100,000 * (1.12)^10 ≈ 310,584.8
      // Note: spans 2 leap years (2016, 2020), so actual day delta is 3652 days -> annualized ~11.99%
      const flows: CashFlow[] = [
        { date: d(2014, 1, 1), amount: -100000 },
        { date: d(2024, 1, 1), amount: 310585 },
      ];

      const rate = calculateXIRR(flows);
      expect(rate).not.toBeNull();
      expect(rate!).toBeCloseTo(0.1200, 2);
      expect(formatXIRR(rate, 1)).toBe('12.0%');
    });

    it('solves 25-year generational investment horizon without exponent overflow', () => {
      // 100,000 invested on 2000-01-01 -> 100,000 * (1.12)^25 ≈ 1,700,006.4
      const flows: CashFlow[] = [
        { date: d(2000, 1, 1), amount: -100000 },
        { date: d(2025, 1, 1), amount: 1700006 },
      ];

      const rate = calculateXIRR(flows);
      expect(rate).not.toBeNull();
      expect(rate!).toBeCloseTo(0.1200, 3);
    });
  });

  // ── 7. Redemption + Reinvestment (Realistic Passbook Cycles) ───────────────
  describe('7. Redemption + Reinvestment', () => {
    it('solves multi-year portfolio with partial drawdowns and subsequent re-injections', () => {
      // Year 0: Buy ₹5,00,000
      // Year 1: Partial redemption of ₹1,50,000
      // Year 2: Fresh reinvestment of ₹1,00,000
      // Year 3: Final terminal valuation of ₹6,50,000
      const flows: CashFlow[] = [
        { date: d(2020, 1, 1), amount: -500000 },
        { date: d(2021, 1, 1), amount: 150000 },
        { date: d(2022, 1, 1), amount: -100000 },
        { date: d(2023, 1, 1), amount: 650000 },
      ];

      const rate = calculateXIRR(flows);
      expect(rate).not.toBeNull();
      expect(rate!).toBeGreaterThan(0.10);
      expect(rate!).toBeLessThan(0.25);

      // Verify that NPV at this rate is indeed within tolerance of 0
      const d0 = toDayNumber(flows[0].date);
      let npv = 0;
      for (const cf of flows) {
        const t = (toDayNumber(cf.date) - d0) / 365.0;
        npv += cf.amount / Math.pow(1 + rate!, t);
      }
      expect(Math.abs(npv)).toBeLessThan(1.0); // Within ₹1 of zero NPV
    });
  });

  // ── 8. Leap Years & Day Counting ──────────────────────────────────────────
  describe('8. Leap Years & Day Counting', () => {
    it('correctly accounts for leap day (29-Feb-2024)', () => {
      // 2024 is a leap year (366 days). Verify day delta between 2024-01-01 and 2024-03-01 is 60 days
      const dJan1 = toDayNumber(d(2024, 1, 1));
      const dFeb29 = toDayNumber(d(2024, 2, 29));
      const dMar1 = toDayNumber(d(2024, 3, 1));

      expect(dFeb29 - dJan1).toBe(59);
      expect(dMar1 - dJan1).toBe(60);

      // Non-leap year 2023: Jan 1 to Mar 1 is 59 days
      const d2023Jan1 = toDayNumber(d(2023, 1, 1));
      const d2023Mar1 = toDayNumber(d(2023, 3, 1));
      expect(d2023Mar1 - d2023Jan1).toBe(59);
    });

    it('calculates XIRR spanning a leap year accurately', () => {
      const flows: CashFlow[] = [
        { date: d(2024, 1, 1), amount: -100000 },
        { date: d(2024, 2, 29), amount: -50000 }, // Leap day SIP
        { date: d(2024, 12, 31), amount: 168000 },
      ];

      const rate = calculateXIRR(flows);
      expect(rate).not.toBeNull();
      expect(rate!).toBeGreaterThan(0.12);
      expect(rate!).toBeLessThan(0.20);
    });
  });

  // ── 9. Indian FY Boundaries (31-March to 01-April) ────────────────────────
  describe('9. Indian Financial Year Boundaries', () => {
    it('correctly handles transactions crossing 31-March closing and 01-April opening', () => {
      // Last day of FY 2022-23 (31-Mar-2023)
      // First day of FY 2023-24 (01-Apr-2023)
      // Closing day of FY 2023-24 (31-Mar-2024)
      const flows: CashFlow[] = [
        { date: d(2023, 3, 31), amount: -100000 },
        { date: d(2023, 4, 1), amount: -50000 },
        { date: d(2024, 3, 31), amount: 170000 },
      ];

      const rate = calculateXIRR(flows);
      expect(rate).not.toBeNull();
      expect(rate!).toBeGreaterThan(0.13);
      expect(rate!).toBeLessThan(0.20);
    });

    it('handles multiple Indian FY end-of-year tax audits spanning 3 fiscal years', () => {
      const flows: CashFlow[] = [
        { date: d(2022, 3, 31), amount: -100000 }, // FY 21-22 close
        { date: d(2023, 3, 31), amount: 20000 },   // FY 22-23 dividend
        { date: d(2024, 3, 31), amount: 110000 },  // FY 23-24 valuation
      ];

      const rate = calculateXIRR(flows);
      expect(rate).not.toBeNull();
      expect(rate!).toBeGreaterThan(0.10);
      expect(rate!).toBeLessThan(0.20);
    });
  });

  // ── 10. Robustness & Error Boundary Checks ────────────────────────────────
  describe('10. Edge Cases & Robustness', () => {
    it('returns null for less than 2 cash flows', () => {
      expect(calculateXIRR([])).toBeNull();
      expect(calculateXIRR([{ date: d(2023, 1, 1), amount: -1000 }])).toBeNull();
    });

    it('returns null when all flows are negative (only buys, no terminal value)', () => {
      expect(
        calculateXIRR([
          { date: d(2023, 1, 1), amount: -1000 },
          { date: d(2023, 2, 1), amount: -1000 },
        ])
      ).toBeNull();
    });

    it('returns null when all flows are positive (no investment cost)', () => {
      expect(
        calculateXIRR([
          { date: d(2023, 1, 1), amount: 1000 },
          { date: d(2023, 2, 1), amount: 1000 },
        ])
      ).toBeNull();
    });

    it('accepts ISO date strings and millisecond timestamps', () => {
      const flows: CashFlow[] = [
        { date: '2023-01-01', amount: -100000 },
        { date: new Date('2024-01-01').getTime(), amount: 110000 },
      ];

      const rate = calculateXIRR(flows);
      expect(rate).not.toBeNull();
      expect(rate!).toBeCloseTo(0.1000, 3);
    });
  });
});
