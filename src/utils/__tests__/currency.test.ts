import { describe, it, expect } from 'vitest';
import { formatINR, parseINRToPaise, rupeesToPaise, formatINRRaw } from '../currency';

describe('formatINR', () => {
  it('formats whole rupees with no decimal', () => {
    // ₹1,000 (>=100 rupees → 0 decimals by default)
    const result = formatINR(100000); // 1000 rupees = 100000 paise
    expect(result).toContain('₹');
    expect(result).toContain('1,000');
  });

  it('formats small amounts with 2 decimal places', () => {
    const result = formatINR(150); // ₹1.50
    expect(result).toBe('₹1.50');
  });

  it('formats zero correctly', () => {
    const result = formatINR(0);
    expect(result).toContain('₹');
    expect(result).toContain('0');
  });

  it('uses absolute value for negative amounts', () => {
    // formatINR strips sign — callers use context for +/-
    const result = formatINR(-50000);
    expect(result).toContain('500');
    expect(result).not.toContain('-');
  });

  describe('compact mode', () => {
    it('formats Lakhs correctly', () => {
      const result = formatINR(10_000_000, { compact: true }); // ₹1,00,000 = 1 Lakh
      expect(result).toContain('L');
    });

    it('formats Crores correctly', () => {
      const result = formatINR(100_000_000_00, { compact: true }); // 1 Crore
      expect(result).toContain('Cr');
    });

    it('formats thousands with K', () => {
      const result = formatINR(500_000, { compact: true }); // ₹5000
      expect(result).toContain('K');
    });
  });

  describe('decimals option', () => {
    it('respects explicit decimals=2 override', () => {
      const result = formatINR(100000, { decimals: 2 }); // ₹1000.00
      expect(result).toContain('.00');
    });

    it('respects explicit decimals=0 override', () => {
      const result = formatINR(150, { decimals: 0 }); // ₹2 (rounded)
      expect(result).not.toContain('.');
    });
  });
});

describe('parseINRToPaise', () => {
  it('parses integer rupee string', () => {
    expect(parseINRToPaise('1000')).toBe(100000);
  });

  it('parses decimal rupee string', () => {
    expect(parseINRToPaise('1.50')).toBe(150);
  });

  it('strips rupee symbol', () => {
    expect(parseINRToPaise('₹500')).toBe(50000);
  });

  it('strips commas', () => {
    expect(parseINRToPaise('1,00,000')).toBe(10000000);
  });

  it('returns 0 for empty string', () => {
    expect(parseINRToPaise('')).toBe(0);
  });

  it('returns 0 for non-numeric string', () => {
    expect(parseINRToPaise('abc')).toBe(0);
  });

  it('round-trips correctly', () => {
    // 1234.56 rupees → 123456 paise → parse back
    expect(parseINRToPaise('1234.56')).toBe(123456);
  });
});

describe('rupeesToPaise', () => {
  it('converts rupees to paise correctly', () => {
    expect(rupeesToPaise(100)).toBe(10000);
    expect(rupeesToPaise(1.5)).toBe(150);
    expect(rupeesToPaise(0)).toBe(0);
  });

  it('rounds fractional paise', () => {
    expect(rupeesToPaise(1.999)).toBe(200);
  });
});

describe('formatINRRaw', () => {
  it('formats without rupee symbol, with en-IN commas', () => {
    const result = formatINRRaw(100000); // 1000 rupees
    expect(result).toContain('1,000');
    expect(result).not.toContain('₹');
  });
});
