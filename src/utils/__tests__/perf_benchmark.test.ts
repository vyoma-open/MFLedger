import { describe, it, expect } from 'vitest';
import { calculateXIRR } from '@/utils/xirr';

describe('Performance Benchmarks', () => {
  it('XIRR Memoization Speed Benchmark', () => {
    // Generate realistic SIP cash flow with 48 monthly installments
    const cashFlows = [];
    const baseDate = new Date('2022-01-01');
    for (let i = 0; i < 48; i++) {
      const d = new Date(baseDate);
      d.setMonth(d.getMonth() + i);
      cashFlows.push({ date: d, amount: -10000 });
    }
    // Valuation today
    cashFlows.push({ date: new Date('2026-01-01'), amount: 680000 });

    // Cold run (unmemoized)
    const t0 = performance.now();
    const r1 = calculateXIRR(cashFlows);
    const coldDuration = performance.now() - t0;

    // Warm run (memoized cache hit)
    const t1 = performance.now();
    const r2 = calculateXIRR(cashFlows);
    const warmDuration = performance.now() - t1;

    console.log(`[BENCHMARK] XIRR Cold Duration: ${coldDuration.toFixed(4)}ms | Warm (Memoized): ${warmDuration.toFixed(4)}ms | Speedup: ${(coldDuration / Math.max(0.0001, warmDuration)).toFixed(1)}x`);
    expect(r1).toBeCloseTo(0.16, 1);
    expect(r1).toEqual(r2);
  });
});
