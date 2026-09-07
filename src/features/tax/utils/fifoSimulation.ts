export type AutoTagType = 'ALL_LTCG' | 'ALL_STCG' | 'ALL_LTCL' | 'ALL_STCL';

export interface LotWithTaxStatus {
  id: string;
  purchase_date: number;
  units_remaining: number;
  purchase_price_paise: number;
  asset_class: string;
  months: number;
  threshold: number;
  isLT: boolean;
  tag: 'LTCG' | 'STCG' | 'LTCL' | 'STCL';
  autoTag: AutoTagType;
  [key: string]: any;
}

export interface PriorOrderGroup {
  tag: 'LTCG' | 'STCG' | 'LTCL' | 'STCL';
  units: number;
}

export interface AutoTagSelectionResult {
  targetUnits: number;
  directTagUnits: number;
  priorUnits: number;
  priorBreakdown: PriorOrderGroup[];
  lastMatchingIndex: number;
}

export interface SimulatedLotRow extends LotWithTaxStatus {
  consumedUnits: number;
  lotInvested: number;
  lotCurrent: number;
  lotGain: number;
  fullLotGain: number;
}

export interface FifoSimulationResult {
  unitsToSell: number;
  lots: SimulatedLotRow[];
  displayedLots: SimulatedLotRow[];
  totalInvestedPaise: number;
  totalCurrentPaise: number;
  totalGainPaise: number;
  ltcgUnitsConsumed: number;
  stcgUnitsConsumed: number;
  ltclUnitsConsumed: number;
  stclUnitsConsumed: number;
  ltcgGainPaise: number;
  stcgGainPaise: number;
  ltclPaise: number;
  stclPaise: number;
  estimatedTax: number;
  taxExplanation: string;
  netPostTaxGain: number;
}

/**
 * Classify a lot into LTCG, STCG, LTCL, or STCL based on holding period and gain.
 */
export function classifyLotTag(isLT: boolean, gainPaise: number): 'LTCG' | 'STCG' | 'LTCL' | 'STCL' {
  if (isLT) {
    return gainPaise >= 0 ? 'LTCG' : 'LTCL';
  }
  return gainPaise >= 0 ? 'STCG' : 'STCL';
}

/**
 * Map lot classification to its corresponding AutoTagType.
 */
export function getAutoTagForClassification(tag: 'LTCG' | 'STCG' | 'LTCL' | 'STCL'): AutoTagType {
  switch (tag) {
    case 'LTCG': return 'ALL_LTCG';
    case 'STCG': return 'ALL_STCG';
    case 'LTCL': return 'ALL_LTCL';
    case 'STCL': return 'ALL_STCL';
  }
}

/**
 * Given chronological lots (sorted purchase_date ASC) and a set of selected auto-tags,
 * calculates the required redemption units under strict FIFO precedence rules.
 * 
 * Under FIFO:
 * To sell any lot at index M, all lots from index 0 to M must also be sold first.
 * If the user selects "ALL_STCG", any prior orders (LTCG, LTCL, STCL) before the last STCG
 * must also be redeemed.
 */
export function calculateAutoTagUnits(
  lots: LotWithTaxStatus[],
  selectedTags: Set<AutoTagType>
): AutoTagSelectionResult {
  if (!selectedTags || selectedTags.size === 0 || lots.length === 0) {
    return {
      targetUnits: 0,
      directTagUnits: 0,
      priorUnits: 0,
      priorBreakdown: [],
      lastMatchingIndex: -1,
    };
  }

  // Find the highest index among all lots that match ANY of the selected tags
  let lastMatchingIndex = -1;
  for (let i = lots.length - 1; i >= 0; i--) {
    if (selectedTags.has(lots[i].autoTag)) {
      lastMatchingIndex = i;
      break;
    }
  }

  if (lastMatchingIndex === -1) {
    return {
      targetUnits: 0,
      directTagUnits: 0,
      priorUnits: 0,
      priorBreakdown: [],
      lastMatchingIndex: -1,
    };
  }

  // All lots from index 0 to lastMatchingIndex must be redeemed under FIFO
  const relevantLots = lots.slice(0, lastMatchingIndex + 1);
  const targetUnits = relevantLots.reduce((s, l) => s + l.units_remaining, 0);

  let directTagUnits = 0;
  const priorTagMap: Record<'LTCG' | 'STCG' | 'LTCL' | 'STCL', number> = {
    LTCG: 0,
    STCG: 0,
    LTCL: 0,
    STCL: 0,
  };

  for (const l of relevantLots) {
    if (selectedTags.has(l.autoTag)) {
      directTagUnits += l.units_remaining;
    } else {
      priorTagMap[l.tag] = (priorTagMap[l.tag] || 0) + l.units_remaining;
    }
  }

  const priorUnits = Math.max(0, targetUnits - directTagUnits);
  const priorBreakdown: PriorOrderGroup[] = (['LTCG', 'LTCL', 'STCG', 'STCL'] as const)
    .filter(t => priorTagMap[t] > 0)
    .map(t => ({ tag: t, units: priorTagMap[t] }));

  return {
    targetUnits,
    directTagUnits,
    priorUnits,
    priorBreakdown,
    lastMatchingIndex,
  };
}

/**
 * Calculates available summary info for each of the 4 individual auto tags.
 */
export function getAutoTagsSummary(lots: LotWithTaxStatus[]) {
  const tags: AutoTagType[] = ['ALL_LTCG', 'ALL_STCG', 'ALL_LTCL', 'ALL_STCL'];
  const summary: Record<AutoTagType, {
    directUnits: number;
    fifoRequiredUnits: number;
    priorUnits: number;
    priorBreakdown: PriorOrderGroup[];
  }> = {
    ALL_LTCG: { directUnits: 0, fifoRequiredUnits: 0, priorUnits: 0, priorBreakdown: [] },
    ALL_STCG: { directUnits: 0, fifoRequiredUnits: 0, priorUnits: 0, priorBreakdown: [] },
    ALL_LTCL: { directUnits: 0, fifoRequiredUnits: 0, priorUnits: 0, priorBreakdown: [] },
    ALL_STCL: { directUnits: 0, fifoRequiredUnits: 0, priorUnits: 0, priorBreakdown: [] },
  };

  for (const tag of tags) {
    const directUnits = lots.filter(l => l.autoTag === tag).reduce((s, l) => s + l.units_remaining, 0);
    const result = calculateAutoTagUnits(lots, new Set([tag]));
    summary[tag] = {
      directUnits,
      fifoRequiredUnits: result.targetUnits,
      priorUnits: result.priorUnits,
      priorBreakdown: result.priorBreakdown,
    };
  }

  return summary;
}

/**
 * Run FIFO simulation over lots for a given number of units to sell.
 */
export function simulateFifoRedemption(params: {
  lots: LotWithTaxStatus[];
  unitsToSell: number;
  ltp: number;
  assetClass: string;
  exemptionRoom: number;
  showOnlySimulated?: boolean;
}): FifoSimulationResult {
  const { lots, unitsToSell, ltp, assetClass, exemptionRoom, showOnlySimulated = true } = params;

  let remainingHarvest = unitsToSell;
  let totalInvestedPaise = 0;
  let totalCurrentPaise = 0;
  let ltcgUnitsConsumed = 0;
  let stcgUnitsConsumed = 0;
  let ltclUnitsConsumed = 0;
  let stclUnitsConsumed = 0;
  let ltcgGainPaise = 0;
  let stcgGainPaise = 0;
  let ltclPaise = 0;
  let stclPaise = 0;

  const simulatedLots: SimulatedLotRow[] = lots.map(l => {
    const consumed = Math.min(l.units_remaining, Math.max(0, remainingHarvest));
    remainingHarvest -= consumed;

    const fullLotGain = l.units_remaining * (ltp - l.purchase_price_paise);
    const lotInvested = consumed * l.purchase_price_paise;
    const lotCurrent = consumed * ltp;
    const lotGain = lotCurrent - lotInvested;

    totalInvestedPaise += lotInvested;
    totalCurrentPaise += lotCurrent;

    if (consumed > 0) {
      if (l.isLT) {
        if (lotGain >= 0) {
          ltcgUnitsConsumed += consumed;
          ltcgGainPaise += lotGain;
        } else {
          ltclUnitsConsumed += consumed;
          ltclPaise += Math.abs(lotGain);
        }
      } else {
        if (lotGain >= 0) {
          stcgUnitsConsumed += consumed;
          stcgGainPaise += lotGain;
        } else {
          stclUnitsConsumed += consumed;
          stclPaise += Math.abs(lotGain);
        }
      }
    }

    return {
      ...l,
      consumedUnits: consumed,
      lotInvested,
      lotCurrent,
      lotGain: consumed > 0 ? lotGain : fullLotGain,
      fullLotGain,
    };
  });

  const displayedLots = (unitsToSell > 0 && showOnlySimulated)
    ? simulatedLots.filter(lb => lb.consumedUnits > 0)
    : simulatedLots;

  const totalGainPaise = totalCurrentPaise - totalInvestedPaise;
  const isEquity = ['EQUITY_STOCK', 'EQUITY_MF', 'INDEX_MF'].includes(assetClass);

  let estimatedTax = 0;
  let taxExplanation = '';

  if (unitsToSell > 0) {
    if (totalGainPaise > 0) {
      if (isEquity) {
        const stcgTax = Math.round(Math.max(0, stcgGainPaise) * 0.20);
        const ltcgTaxable = Math.max(0, Math.max(0, ltcgGainPaise) - exemptionRoom);
        const ltcgTax = Math.round(ltcgTaxable * 0.125);
        estimatedTax = stcgTax + ltcgTax;
        taxExplanation = `LTCG (${ltcgUnitsConsumed.toFixed(3)} units) taxed @ 12.5% after ₹1.25L exemption cap. STCG (${stcgUnitsConsumed.toFixed(3)} units) taxed @ 20%.`;
      } else if (assetClass === 'GOLD_MF') {
        const stcgTax = Math.round(Math.max(0, stcgGainPaise) * 0.20);
        const ltcgTax = Math.round(Math.max(0, ltcgGainPaise) * 0.125);
        estimatedTax = stcgTax + ltcgTax;
        taxExplanation = `Gold MF: STCG (<24mo) taxed at 20%, LTCG (≥24mo) @ 12.5%.`;
      } else {
        estimatedTax = 0;
        taxExplanation = `Debt/Liquid MF: Taxed at applicable income tax slab rates.`;
      }
    } else {
      taxExplanation = `Capital loss booked. Can offset taxable capital gains.`;
    }
  }

  const netPostTaxGain = totalGainPaise - estimatedTax;

  return {
    unitsToSell,
    lots: simulatedLots,
    displayedLots,
    totalInvestedPaise,
    totalCurrentPaise,
    totalGainPaise,
    ltcgUnitsConsumed,
    stcgUnitsConsumed,
    ltclUnitsConsumed,
    stclUnitsConsumed,
    ltcgGainPaise,
    stcgGainPaise,
    ltclPaise,
    stclPaise,
    estimatedTax,
    taxExplanation,
    netPostTaxGain,
  };
}
