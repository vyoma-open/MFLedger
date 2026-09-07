/**
 * XIRR (Extended Internal Rate of Return) Calculator
 * Solves the equation: NPV = sum( CF_i / (1 + r)^((d_i - d_0) / 365) ) = 0
 */

export interface CashFlow {
  date: Date;
  amount: number; // Negative for cash out (buy), positive for cash in (value/sell)
}

function toDayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / (24 * 60 * 60 * 1000));
}

const XIRR_CACHE_MAX = 500;
const xirrCache = new Map<string, number | null>();

export function calculateXIRR(cashFlows: CashFlow[]): number | null {
  if (cashFlows.length < 2) return null;

  // Filter out zero amount transactions
  const filtered = cashFlows.filter(cf => Math.abs(cf.amount) > 0.0001);
  if (filtered.length < 2) return null;

  // Ensure there is at least one negative and one positive cash flow
  const hasNegative = filtered.some(cf => cf.amount < 0);
  const hasPositive = filtered.some(cf => cf.amount > 0);
  if (!hasNegative || !hasPositive) return null;

  // Sort cash flows by calendar date ascending
  const sorted = [...filtered].sort((a, b) => a.date.getTime() - b.date.getTime());
  
  // Fast cache fingerprint: length + elements
  const cacheKey = sorted.map(cf => `${cf.date.getTime()}:${Math.round(cf.amount)}`).join('|');
  if (xirrCache.has(cacheKey)) {
    return xirrCache.get(cacheKey)!;
  }

  const d0Day = toDayNumber(sorted[0].date);

  const compute = (): number | null => {
    // Newton-Raphson solver
    let r = 0.1; // 10% initial guess
    const maxIterations = 100;
    const tolerance = 1e-7;

    for (let iter = 0; iter < maxIterations; iter++) {
      let npv = 0;
      let dNpv = 0;

      for (const cf of sorted) {
        const days = toDayNumber(cf.date) - d0Day;
        const t = days / 365;
        const discount = Math.pow(1 + r, t);
        
        if (Math.abs(discount) < 1e-15) continue;
        
        npv += cf.amount / discount;
        dNpv -= (t * cf.amount) / (discount * (1 + r));
      }

      if (Math.abs(dNpv) < 1e-15) {
        break; // Derivative too small, abort NR and try Bisection
      }

      const nextR = r - npv / dNpv;
      if (Math.abs(nextR - r) < tolerance) {
        // Validate result sanity
        if (nextR > -0.999 && nextR < 100.0) {
          return nextR;
        }
      }
      r = nextR;
    }

    // Fallback to Bisection method if Newton-Raphson fails to converge or is out of bounds
    return bisectionXIRR(sorted, d0Day);
  };

  const result = compute();

  if (xirrCache.size >= XIRR_CACHE_MAX) {
    const firstKey = xirrCache.keys().next().value;
    if (firstKey !== undefined) xirrCache.delete(firstKey);
  }
  xirrCache.set(cacheKey, result);

  return result;
}

function bisectionXIRR(sorted: CashFlow[], d0Day: number): number | null {
  let low = -0.999;
  let high = 50.0; // up to 5000%
  const tolerance = 1e-7;
  const maxIter = 150;

  function npv(r: number): number {
    let sum = 0;
    for (const cf of sorted) {
      const days = toDayNumber(cf.date) - d0Day;
      const t = days / 365;
      sum += cf.amount / Math.pow(1 + r, t);
    }
    return sum;
  }

  let yLow = npv(low);
  let yHigh = npv(high);

  if (yLow * yHigh > 0) {
    // If sign doesn't change, there's no root in [low, high].
    // Try even wider upper bound
    high = 500.0; // 50,000%
    yHigh = npv(high);
    if (yLow * yHigh > 0) {
      return null;
    }
  }

  for (let i = 0; i < maxIter; i++) {
    const mid = (low + high) / 2;
    const yMid = npv(mid);

    if (Math.abs(yMid) < 1e-8 || (high - low) / 2 < tolerance) {
      return mid;
    }

    if (yMid * yLow < 0) {
      high = mid;
    } else {
      low = mid;
      yLow = yMid;
    }
  }

  return (low + high) / 2;
}
