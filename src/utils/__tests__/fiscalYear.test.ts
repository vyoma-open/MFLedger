import { describe, it, expect } from 'vitest';
import { holdingMonths, getFiscalYear, isCurrentFY, formatDate, formatMonthYear } from '../fiscalYear';

describe('holdingMonths', () => {
  it('returns 0 for same day', () => {
    const ts = new Date('2024-01-15').getTime();
    expect(holdingMonths(ts, ts)).toBe(0);
  });

  it('returns 12 for exactly one year', () => {
    const purchase = new Date('2023-01-01').getTime();
    const sale     = new Date('2024-01-01').getTime();
    expect(holdingMonths(purchase, sale)).toBe(12);
  });

  it('returns 11 for 11 months (not yet LTCG threshold)', () => {
    const purchase = new Date('2023-01-15').getTime();
    const sale     = new Date('2023-12-15').getTime();
    expect(holdingMonths(purchase, sale)).toBe(11);
  });

  it('returns 24 for 2 years', () => {
    const purchase = new Date('2022-06-01').getTime();
    const sale     = new Date('2024-06-01').getTime();
    expect(holdingMonths(purchase, sale)).toBe(24);
  });

  it('classifies as LTCG when >= 12 months', () => {
    const purchase = new Date('2023-01-01').getTime();
    const sale     = new Date('2024-01-01').getTime();
    const months   = holdingMonths(purchase, sale);
    expect(months >= 12).toBe(true); // qualifies for LTCG
  });

  it('classifies as STCG when < 12 months', () => {
    const purchase = new Date('2023-06-01').getTime();
    const sale     = new Date('2024-01-01').getTime();
    const months   = holdingMonths(purchase, sale);
    expect(months >= 12).toBe(false); // STCG
  });
});

describe('getFiscalYear', () => {
  it('correctly identifies April 1 as start of FY', () => {
    const date = new Date('2024-04-01');
    const fy   = getFiscalYear(date);
    expect(fy.label).toBe('FY 2024-25');
    expect(fy.startYear).toBe(2024);
  });

  it('correctly identifies March 31 as end of FY', () => {
    const date = new Date('2025-03-31');
    const fy   = getFiscalYear(date);
    expect(fy.label).toBe('FY 2024-25');
  });

  it('March goes to previous FY', () => {
    const date = new Date('2024-03-15');
    const fy   = getFiscalYear(date);
    expect(fy.label).toBe('FY 2023-24');
  });

  it('FY start is April 1 00:00:00', () => {
    const fy = getFiscalYear(new Date('2024-07-15'));
    const start = new Date(fy.startMs);
    expect(start.getMonth()).toBe(3); // April = 3
    expect(start.getDate()).toBe(1);
  });
});

describe('isCurrentFY', () => {
  it('returns true for a timestamp in the current fiscal year', () => {
    // Today should be in current FY
    expect(isCurrentFY(Date.now())).toBe(true);
  });

  it('returns false for a very old timestamp', () => {
    const oldTs = new Date('2010-01-01').getTime();
    expect(isCurrentFY(oldTs)).toBe(false);
  });
});

describe('formatDate', () => {
  it('formats a known date correctly', () => {
    const ts = new Date('2024-08-15').getTime();
    // Should include "15", "Aug", "2024" regardless of locale separator
    const formatted = formatDate(ts);
    expect(formatted).toContain('2024');
    expect(formatted).toContain('Aug');
  });
});

describe('formatMonthYear', () => {
  it('formats month and year only', () => {
    const ts = new Date('2024-12-01').getTime();
    const formatted = formatMonthYear(ts);
    expect(formatted).toContain('Dec');
    expect(formatted).toContain('2024');
  });
});
