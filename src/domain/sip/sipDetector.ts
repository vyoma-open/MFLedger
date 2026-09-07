/**
 * Pure Systematic Investment Plan (SIP) cadence detection & stream analyzer.
 * Pure TypeScript — zero dependencies, zero DOM, zero network, zero storage.
 */
import type { InvestmentLot, Frequency } from '@/types/db.types';
import { calculateXIRR, type CashFlow } from '@/domain/xirr';

export interface InvestmentCandidate {
  id: string;
  date: number; // timestamp in ms
  amount_paise: number; // positive total transaction cost
  symbol: string;
  description?: string;
  transactionType?: 'BUY' | 'SELL';
  explicitType?: 'SIP' | 'LUMPSUM';
}

export interface DetectionResult {
  isSip: boolean;
  confidence: 'EXPLICIT' | 'KEYWORD' | 'CADENCE' | 'MANUAL' | 'NONE';
  reason?: string;
  streamId?: string;
  cadence?: Frequency;
}

const SIP_KEYWORD_REGEX = /\b(sip|xsip|isip|msip|m-sip|systematic|sys\.?\s*inv|auto\s*debit|nach|ach|ecs)\b/i;

/**
 * Checks whether the days between two dates match common SIP frequencies.
 */
function matchCadence(daysDiff: number): Frequency | null {
  if (daysDiff >= 5 && daysDiff <= 9) return 'WEEKLY';
  if (daysDiff >= 24 && daysDiff <= 35) return 'MONTHLY';
  if (daysDiff >= 75 && daysDiff <= 105) return 'QUARTERLY';
  return null;
}

/**
 * Compare two investment amounts for equality or annual step-up compatibility.
 * Allows ±2% tolerance for minor NAV fluctuation if fixed units, or checks step-up (e.g., +5%, +10%).
 */
function amountsMatchOrStepUp(a: number, b: number): boolean {
  if (a <= 0 || b <= 0) return false;
  const ratio = b / a;
  // Exact or near-identical amount (within 2%)
  if (Math.abs(a - b) / Math.max(a, b) <= 0.02) return true;
  // Common step-up increments (e.g., 5%, 10%, 15%, 20% step-up)
  if (ratio >= 1.04 && ratio <= 1.25) return true;
  return false;
}

/**
 * Analyzes an array of investment transactions/candidates for a given symbol
 * and identifies which ones belong to an SIP stream vs one-off lump sums.
 */
export function detectSipPattern(candidates: InvestmentCandidate[]): Map<string, DetectionResult> {
  const results = new Map<string, DetectionResult>();

  // Only BUY transactions can be SIP installments
  const buys = candidates
    .filter(c => (c.transactionType ?? 'BUY') === 'BUY')
    .sort((a, b) => a.date - b.date);

  // Initialize all with default/explicit
  for (const c of candidates) {
    if ((c.transactionType ?? 'BUY') === 'SELL') {
      results.set(c.id, { isSip: false, confidence: 'NONE', reason: 'Sell / Redemption' });
      continue;
    }
    if (c.explicitType === 'SIP') {
      results.set(c.id, { isSip: true, confidence: 'EXPLICIT', reason: 'Marked as ⚡️SIP' });
    } else if (c.explicitType === 'LUMPSUM') {
      results.set(c.id, { isSip: false, confidence: 'EXPLICIT', reason: 'Marked as 💰BULK' });
    } else if (c.description && SIP_KEYWORD_REGEX.test(c.description)) {
      results.set(c.id, { isSip: true, confidence: 'KEYWORD', reason: 'Matched SIP keyword in narration' });
    } else {
      results.set(c.id, { isSip: false, confidence: 'NONE', reason: 'Default 💰BULK' });
    }
  }

  // Next, group BUYs by symbol to detect cadence patterns
  const bySymbol = new Map<string, InvestmentCandidate[]>();
  for (const b of buys) {
    const sym = b.symbol.toUpperCase();
    if (!bySymbol.has(sym)) bySymbol.set(sym, []);
    bySymbol.get(sym)!.push(b);
  }

  for (const [, symBuys] of bySymbol) {
    if (symBuys.length < 2) continue;

    // Look for clusters of recurring amounts with regular cadence
    const visited = new Set<number>();

    for (let i = 0; i < symBuys.length; i++) {
      if (visited.has(i)) continue;

      const chain: number[] = [i];
      let currentIdx = i;
      let detectedCadence: Frequency = 'MONTHLY';

      for (let j = i + 1; j < symBuys.length; j++) {
        const prev = symBuys[currentIdx];
        const next = symBuys[j];

        const daysDiff = Math.round((next.date - prev.date) / (1000 * 60 * 60 * 24));
        const cadence = matchCadence(daysDiff);

        // If amount matches (or step-up) and cadence matches, or multiple months skipped with exact multiple
        const amountMatch = amountsMatchOrStepUp(prev.amount_paise, next.amount_paise);

        if (amountMatch && cadence) {
          chain.push(j);
          currentIdx = j;
          detectedCadence = cadence;
        } else if (amountMatch && daysDiff >= 50 && daysDiff <= 70) {
          // Missed 1 month in a monthly SIP
          chain.push(j);
          currentIdx = j;
          detectedCadence = 'MONTHLY';
        }
      }

      // If chain has 2 or more installments matching cadence:
      if (chain.length >= 2) {
        const streamId = `sip_stream_${symBuys[chain[0]].id}`;
        for (const idx of chain) {
          visited.add(idx);
          const candidate = symBuys[idx];
          // Do not override user explicit manual tag
          if (candidate.explicitType === 'LUMPSUM') continue;

          results.set(candidate.id, {
            isSip: true,
            confidence: candidate.explicitType === 'SIP' ? 'EXPLICIT' : 'CADENCE',
            reason: `Recurring ${detectedCadence.toLowerCase()} investment pattern`,
            streamId,
            cadence: detectedCadence,
          });
        }
      }
    }
  }

  return results;
}

export interface SipTranche {
  id: string;
  installmentAmountPaise: number;
  startDate: number;
  endDate: number | null;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  installments: number;
  lots: InvestmentLot[];
  investedPaise: number;
  units: number;
  currentValuePaise: number;
  absoluteGainPaise: number;
  returnPct: number;
  xirr: number | null;
}

export interface SipStreamAnalytics {
  hasSip: boolean;
  hasLumpSum: boolean;
  sipLots: InvestmentLot[];
  lumpLots: InvestmentLot[];
  tranches: SipTranche[];
  sipInvested: number;
  sipUnits: number;
  sipCurrentValue: number;
  sipGain: number;
  sipReturnPct: number;
  sipXirr: number | null;
  sipStartDate: number | null;
  sipEndDate: number | null;
  sipStatus: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  isSipActive: boolean;
  sipInstallmentCount: number;
  latestSipAmountPaise: number;
  detectedCadence: Frequency;
  lumpInvested: number;
  lumpUnits: number;
  lumpCurrentValue: number;
  lumpGain: number;
  lumpReturnPct: number;
  lumpXirr: number | null;
  lumpCount: number;
}

function toNominalPaise(amountPaise: number): number {
  const rupees = amountPaise / 100;
  const roundRupees = Math.round(rupees);
  if (Math.abs(rupees - roundRupees) < 0.25) {
    return roundRupees * 100;
  }
  return Math.round(amountPaise);
}

function isSameNominalTier(aPaise: number, bPaise: number): boolean {
  const diff = Math.abs(aPaise - bPaise);
  if (diff <= 200) return true; // within ₹2
  if (diff / Math.max(aPaise, bPaise) <= 0.015) return true; // within 1.5%
  return false;
}

export function analyzeSipStreams(
  allLots: InvestmentLot[],
  currentPricePaise: number,
  now = Date.now(),
  hasActiveRecurringTemplate = false
): SipStreamAnalytics {
  if (allLots.length === 0) {
    return {
      hasSip: false,
      hasLumpSum: false,
      sipLots: [],
      lumpLots: [],
      tranches: [],
      sipInvested: 0,
      sipUnits: 0,
      sipCurrentValue: 0,
      sipGain: 0,
      sipReturnPct: 0,
      sipXirr: null,
      sipStartDate: null,
      sipEndDate: null,
      sipStatus: 'COMPLETED',
      isSipActive: false,
      sipInstallmentCount: 0,
      latestSipAmountPaise: 0,
      detectedCadence: 'MONTHLY',
      lumpInvested: 0,
      lumpUnits: 0,
      lumpCurrentValue: 0,
      lumpGain: 0,
      lumpReturnPct: 0,
      lumpXirr: null,
      lumpCount: 0,
    };
  }

  const candidates: InvestmentCandidate[] = allLots.map(l => ({
    id: l.id,
    date: l.purchase_date,
    amount_paise: Math.round(l.units_original * l.purchase_price_paise),
    symbol: l.symbol,
    description: l.name,
    transactionType: 'BUY',
    explicitType: l.investment_type,
  }));

  const detectionMap = detectSipPattern(candidates);

  const sipLots: InvestmentLot[] = [];
  const lumpLots: InvestmentLot[] = [];

  for (const lot of allLots) {
    if (lot.investment_type === 'SIP') {
      sipLots.push(lot);
    } else if (lot.investment_type === 'LUMPSUM') {
      lumpLots.push(lot);
    } else {
      const detected = detectionMap.get(lot.id);
      if (detected?.isSip) {
        sipLots.push(lot);
      } else {
        lumpLots.push(lot);
      }
    }
  }

  sipLots.sort((a, b) => a.purchase_date - b.purchase_date);
  lumpLots.sort((a, b) => a.purchase_date - b.purchase_date);

  const rawTranches: InvestmentLot[][] = [];
  let currentGroup: InvestmentLot[] = [];

  for (let i = 0; i < sipLots.length; i++) {
    const lot = sipLots[i];
    const lotAmount = Math.round(lot.units_original * lot.purchase_price_paise);

    if (currentGroup.length === 0) {
      currentGroup.push(lot);
      continue;
    }

    const prevLot = currentGroup[currentGroup.length - 1];
    const prevAmount = Math.round(prevLot.units_original * prevLot.purchase_price_paise);
    const daysDiff = (lot.purchase_date - prevLot.purchase_date) / (1000 * 60 * 60 * 24);

    const sameAmount = isSameNominalTier(lotAmount, prevAmount);
    const longGap = daysDiff > 95;

    if (sameAmount && !longGap) {
      currentGroup.push(lot);
    } else {
      rawTranches.push(currentGroup);
      currentGroup = [lot];
    }
  }
  if (currentGroup.length > 0) {
    rawTranches.push(currentGroup);
  }

  const tranches: SipTranche[] = rawTranches.map((tLots, idx) => {
    const isLatest = idx === rawTranches.length - 1;
    const firstDate = tLots[0].purchase_date;
    const lastDate = tLots[tLots.length - 1].purchase_date;
    const nominalAmount = toNominalPaise(
      Math.round(tLots[0].units_original * tLots[0].purchase_price_paise)
    );

    const daysSinceLast = (now - lastDate) / (1000 * 60 * 60 * 24);
    let status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' = 'COMPLETED';
    let endDate: number | null = lastDate;

    if (isLatest) {
      if (hasActiveRecurringTemplate || daysSinceLast <= 60) {
        status = 'ACTIVE';
        endDate = null;
      } else if (daysSinceLast <= 120) {
        status = 'PAUSED';
        endDate = lastDate;
      } else {
        status = 'COMPLETED';
        endDate = lastDate;
      }
    }

    const units = tLots.reduce((sum, l) => sum + l.units_remaining, 0);
    const investedPaise = tLots.reduce((sum, l) => sum + (l.units_remaining * l.purchase_price_paise), 0);
    const currentValuePaise = units * currentPricePaise;
    const absoluteGainPaise = currentValuePaise - investedPaise;
    const returnPct = investedPaise > 0 ? (absoluteGainPaise / investedPaise) * 100 : 0;

    const trancheXirr = (() => {
      if (tLots.length === 0 || units <= 0) return null;
      const flows: CashFlow[] = tLots.map(l => {
        const propFees = l.units_original > 0
          ? Math.round((l.fees_paise ?? 0) * (l.units_remaining / l.units_original))
          : 0;
        return {
          date: new Date(l.purchase_date),
          amount: -(l.units_remaining * l.purchase_price_paise + propFees),
        };
      });
      flows.push({
        date: new Date(now),
        amount: currentValuePaise,
      });
      return calculateXIRR(flows);
    })();

    return {
      id: `tranche_${tLots[0].id}`,
      installmentAmountPaise: nominalAmount,
      startDate: firstDate,
      endDate,
      status,
      installments: tLots.length,
      lots: tLots,
      investedPaise,
      units,
      currentValuePaise,
      absoluteGainPaise,
      returnPct,
      xirr: trancheXirr,
    };
  });

  const sipUnits = sipLots.reduce((sum, l) => sum + l.units_remaining, 0);
  const sipInvested = sipLots.reduce((sum, l) => sum + (l.units_remaining * l.purchase_price_paise), 0);
  const sipCurrentValue = sipUnits * currentPricePaise;
  const sipGain = sipCurrentValue - sipInvested;
  const sipReturnPct = sipInvested > 0 ? (sipGain / sipInvested) * 100 : 0;

  const sipStartDate = sipLots.length > 0 ? sipLots[0].purchase_date : null;
  const sipLastDate = sipLots.length > 0 ? sipLots[sipLots.length - 1].purchase_date : null;

  const latestTranche = tranches.length > 0 ? tranches[tranches.length - 1] : null;
  const sipStatus = latestTranche ? latestTranche.status : 'COMPLETED';
  const isSipActive = sipStatus === 'ACTIVE';
  const sipEndDate = isSipActive ? null : sipLastDate;
  const latestSipAmountPaise = latestTranche ? latestTranche.installmentAmountPaise : 0;

  const sipXirr = (() => {
    if (sipLots.length === 0 || sipUnits <= 0) return null;
    const flows: CashFlow[] = sipLots.map(l => {
      const propFees = l.units_original > 0
        ? Math.round((l.fees_paise ?? 0) * (l.units_remaining / l.units_original))
        : 0;
      return {
        date: new Date(l.purchase_date),
        amount: -(l.units_remaining * l.purchase_price_paise + propFees),
      };
    });
    flows.push({
      date: new Date(now),
      amount: sipCurrentValue,
    });
    return calculateXIRR(flows);
  })();

  const lumpUnits = lumpLots.reduce((sum, l) => sum + l.units_remaining, 0);
  const lumpInvested = lumpLots.reduce((sum, l) => sum + (l.units_remaining * l.purchase_price_paise), 0);
  const lumpCurrentValue = lumpUnits * currentPricePaise;
  const lumpGain = lumpCurrentValue - lumpInvested;
  const lumpReturnPct = lumpInvested > 0 ? (lumpGain / lumpInvested) * 100 : 0;

  const lumpXirr = (() => {
    if (lumpLots.length === 0 || lumpUnits <= 0) return null;
    const flows: CashFlow[] = lumpLots.map(l => {
      const propFees = l.units_original > 0
        ? Math.round((l.fees_paise ?? 0) * (l.units_remaining / l.units_original))
        : 0;
      return {
        date: new Date(l.purchase_date),
        amount: -(l.units_remaining * l.purchase_price_paise + propFees),
      };
    });
    flows.push({
      date: new Date(now),
      amount: lumpCurrentValue,
    });
    return calculateXIRR(flows);
  })();

  return {
    hasSip: sipLots.length > 0,
    hasLumpSum: lumpLots.length > 0,
    sipLots,
    lumpLots,
    tranches,
    sipInvested,
    sipUnits,
    sipCurrentValue,
    sipGain,
    sipReturnPct,
    sipXirr,
    sipStartDate,
    sipEndDate,
    sipStatus,
    isSipActive,
    sipInstallmentCount: sipLots.length,
    latestSipAmountPaise,
    detectedCadence: 'MONTHLY',
    lumpInvested,
    lumpUnits,
    lumpCurrentValue,
    lumpGain,
    lumpReturnPct,
    lumpXirr,
    lumpCount: lumpLots.length,
  };
}

export interface EnrichedSipStream {
  id: string;
  name: string;
  symbol: string;
  monthlyAmount: number;
  accumulatedWealth: number;
  totalInvested: number;
  historicalXirr: number | null;
  startDate: number | null;
  installments: number;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  isActive: boolean;
  source: 'RECURRING_TEMPLATE' | 'HOLDING_LOTS';
}
