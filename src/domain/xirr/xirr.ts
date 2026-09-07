/**
 * Pure XIRR (Extended Internal Rate of Return) Calculator.
 * Solves the annualized rate of return: NPV = sum( CF_i / (1 + r)^((d_i - d_0) / 365) ) = 0
 * 
 * Part of src/domain/xirr.
 * Pure TypeScript — zero dependencies, zero DOM, zero network, zero storage.
 */

export interface CashFlow {
  date: Date | string | number;
  amount: number; // Negative for cash invested (purchase/outflow), Positive for cash returned (redemption/current value)
}

export interface InternalCashFlow {
  dayNumber: number;
  date: Date;
  amount: number;
}

export interface XIRROptions {
  guess?: number;
  maxIterations?: number;
  tolerance?: number;
}

/**
 * Converts a Date, ISO date string, or timestamp into an integer UTC calendar day number.
 * Ensures time-of-day or timezone offsets never distort date difference calculations.
 */
export function toDayNumber(d: Date | string | number): number {
  const dateObj = d instanceof Date ? d : new Date(d);
  if (isNaN(dateObj.getTime())) {
    throw new Error(`Invalid date supplied to XIRR: ${d}`);
  }
  return Math.floor(
    Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()) / (24 * 60 * 60 * 1000)
  );
}

/**
 * Consolidates cash flows occurring on the exact same calendar day into a single net cash flow.
 * Also removes negligible flows (|amount| < 0.0001).
 */
export function aggregateSameDayCashFlows(cashFlows: CashFlow[]): InternalCashFlow[] {
  const dayMap = new Map<number, { amount: number; sampleDate: Date }>();

  for (const cf of cashFlows) {
    if (Math.abs(cf.amount) < 0.0001) continue;
    const day = toDayNumber(cf.date);
    const existing = dayMap.get(day);
    const dateObj = cf.date instanceof Date ? cf.date : new Date(cf.date);

    if (existing) {
      existing.amount += cf.amount;
    } else {
      dayMap.set(day, { amount: cf.amount, sampleDate: dateObj });
    }
  }

  const consolidated: InternalCashFlow[] = [];
  for (const [dayNumber, val] of dayMap.entries()) {
    // Retain only non-zero net flows
    if (Math.abs(val.amount) >= 0.0001) {
      consolidated.push({
        dayNumber,
        date: val.sampleDate,
        amount: val.amount,
      });
    }
  }

  // Sort chronologically ascending
  return consolidated.sort((a, b) => a.dayNumber - b.dayNumber);
}

const XIRR_CACHE_MAX = 500;
const xirrCache = new Map<string, number | null>();

/**
 * Calculates the Extended Internal Rate of Return (XIRR).
 * 
 * Uses Newton-Raphson with bounded step size, falling back to adaptive Bisection
 * when encountering steep gradients, multiple roots, or extreme returns.
 * 
 * @param cashFlows Array of cash flows containing date and amount
 * @param options Optional guess, iteration limit, and tolerance
 * @returns Annualized rate (e.g., 0.1425 for 14.25%) or null if unsolvable
 */
export function calculateXIRR(
  cashFlows: CashFlow[],
  options?: XIRROptions
): number | null {
  if (!cashFlows || cashFlows.length < 2) return null;

  const sorted = aggregateSameDayCashFlows(cashFlows);
  if (sorted.length < 2) return null;

  // Must have at least one negative (investment) and one positive (redemption/current valuation)
  const hasNegative = sorted.some(cf => cf.amount < 0);
  const hasPositive = sorted.some(cf => cf.amount > 0);
  if (!hasNegative || !hasPositive) return null;

  // Trivial zero-return check: if all cashflows sum exactly to 0
  const netTotal = sorted.reduce((sum, cf) => sum + cf.amount, 0);
  if (Math.abs(netTotal) < 1e-7) {
    // If it's a simple 2-flow flat return (e.g. -100k and +100k), return exact 0.0
    if (sorted.length === 2) {
      return 0.0;
    }
  }

  // Fast cache fingerprint: dayNumber + rounded integer amount
  const cacheKey = sorted.map(cf => `${cf.dayNumber}:${Math.round(cf.amount * 100)}`).join('|');
  if (xirrCache.has(cacheKey)) {
    return xirrCache.get(cacheKey)!;
  }

  const d0Day = sorted[0].dayNumber;
  const tolerance = options?.tolerance ?? 1e-7;
  const maxIterations = options?.maxIterations ?? 100;

  // Helper NPV and derivative evaluation
  const evaluateNPVAndDerivative = (r: number): { npv: number; dNpv: number } => {
    let npv = 0;
    let dNpv = 0;

    for (const cf of sorted) {
      const t = (cf.dayNumber - d0Day) / 365.0;
      const factor = Math.pow(1 + r, t);

      if (Math.abs(factor) < 1e-18 || !isFinite(factor)) {
        return { npv: NaN, dNpv: NaN };
      }

      npv += cf.amount / factor;
      dNpv -= (t * cf.amount) / (factor * (1 + r));
    }

    return { npv, dNpv };
  };

  const compute = (): number | null => {
    let r = options?.guess ?? 0.1; // Default 10% initial guess

    // 1. Newton-Raphson Solver with adaptive step bounds
    for (let iter = 0; iter < maxIterations; iter++) {
      const { npv, dNpv } = evaluateNPVAndDerivative(r);

      if (!isFinite(npv) || !isFinite(dNpv) || Math.abs(dNpv) < 1e-15) {
        break; // Diverging or stationary point, switch to Bisection
      }

      if (Math.abs(npv) < tolerance) {
        if (r > -0.9999) return r;
      }

      let step = npv / dNpv;

      // Dampen steps to prevent flying into r <= -1.0 or exploding
      if (r - step <= -0.9999) {
        step = (r - (-0.999)) * 0.5;
      } else if (Math.abs(step) > 2.0) {
        step = Math.sign(step) * 2.0;
      }

      const nextR = r - step;

      if (Math.abs(nextR - r) < tolerance) {
        if (nextR > -0.9999 && isFinite(nextR)) {
          return nextR;
        }
      }

      r = nextR;
    }

    // 2. Adaptive Bisection Solver fallback
    return bisectionXIRR(sorted, d0Day, tolerance);
  };

  const result = compute();

  // Cache eviction & write
  if (xirrCache.size >= XIRR_CACHE_MAX) {
    const firstKey = xirrCache.keys().next().value;
    if (firstKey !== undefined) xirrCache.delete(firstKey);
  }
  xirrCache.set(cacheKey, result);

  return result;
}

/**
 * Adaptive Bisection solver covering wide search space: [-99.9999%, 10,000,000%].
 */
function bisectionXIRR(
  sorted: InternalCashFlow[],
  d0Day: number,
  tolerance: number
): number | null {
  const npv = (r: number): number => {
    let sum = 0;
    for (const cf of sorted) {
      const t = (cf.dayNumber - d0Day) / 365.0;
      const factor = Math.pow(1 + r, t);
      if (!isFinite(factor) || Math.abs(factor) < 1e-18) return NaN;
      sum += cf.amount / factor;
    }
    return sum;
  };

  let low = -0.999999;
  let high = 50.0; // 5,000%
  const maxBisectionIter = 120;

  let yLow = npv(low);
  let yHigh = npv(high);

  // If both ends have the same sign, dynamically expand high bound up to 100,000x (10,000,000%)
  if (!isNaN(yLow) && !isNaN(yHigh) && yLow * yHigh > 0) {
    const candidateHighs = [500.0, 5000.0, 50000.0, 1000000.0];
    for (const cand of candidateHighs) {
      const yCand = npv(cand);
      if (!isNaN(yCand) && yLow * yCand <= 0) {
        high = cand;
        yHigh = yCand;
        break;
      }
    }

    // If still same sign, check negative returns near -1.0
    if (yLow * yHigh > 0) {
      const nearTotalLoss = -0.9999999;
      const yNear = npv(nearTotalLoss);
      if (!isNaN(yNear) && yNear * yHigh <= 0) {
        low = nearTotalLoss;
        yLow = yNear;
      } else {
        return null; // Root cannot be bracketed
      }
    }
  }

  for (let i = 0; i < maxBisectionIter; i++) {
    const mid = (low + high) / 2.0;
    const yMid = npv(mid);

    if (isNaN(yMid)) {
      // Contract high if floating overflow occurred
      high = mid;
      continue;
    }

    if (Math.abs(yMid) < 1e-8 || (high - low) / 2.0 < tolerance) {
      return mid;
    }

    if (yMid * yLow < 0) {
      high = mid;
      yHigh = yMid;
    } else {
      low = mid;
      yLow = yMid;
    }
  }

  return (low + high) / 2.0;
}

/**
 * Format annualized rate to localized percentage string (e.g., 0.1425 -> "14.25%").
 */
export function formatXIRR(rate: number | null, decimals: number = 2): string {
  if (rate === null || isNaN(rate)) return 'N/A';
  return `${(rate * 100).toFixed(decimals)}%`;
}
