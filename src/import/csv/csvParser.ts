/**
 * Pure CSV Statement & CAS Parser Utilities.
 * Pure TypeScript — zero dependencies, zero DOM, zero database calls.
 */
import type { InvestmentLot } from '@/types/db.types';

export interface ColumnMapping {
  scheme_code: string;
  isin: string;
  name: string;
  date: string;
  units: string;
  price: string;
  fees: string;
  asset_class: string;
  transaction_type: string;
}

export const ALIASES: Record<keyof ColumnMapping, RegExp> = {
  scheme_code: /^(amfi.*code|scheme.*code|amfi|code)$/i,
  isin: /^(isin.*code|isin|growth.*isin|payout.*isin)$/i,
  name: /^(scheme.*name|fund.*name|scheme|fund|symbol|tradingsymbol|name|description)$/i,
  date: /^(date|trade.*date|trans.*date|purchase.*date|order.*date)$/i,
  units: /^(units|qty|quantity|balance.*units)$/i,
  price: /^(nav|price|rate|cost|purchase.*price|unit.*price)$/i,
  fees: /^(fee|charges|stt|stamp.*duty|brokerage|total.*charges)$/i,
  asset_class: /^(asset.*class|type|category|sub.*category)$/i,
  transaction_type: /^(type|trans.*type|transaction.*type|action|order.*type)$/i,
};

export function guessFieldMappings(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    scheme_code: '',
    isin: '',
    name: '',
    date: '',
    units: '',
    price: '',
    fees: '',
    asset_class: '',
    transaction_type: '',
  };

  // 1. ISIN detection
  const isinRxList = [/(?:growth|payout).*isin/i, /isin.*(?:growth|payout)/i, /^isin.*code/i, /^isin$/i, /isin/i];
  for (const rx of isinRxList) {
    const match = headers.find(h => rx.test(h));
    if (match) {
      mapping.isin = match;
      break;
    }
  }

  // 2. AMFI / Scheme code detection
  const amfiRxList = [/amfi.*code/i, /scheme.*code/i, /^code$/i, /^amfi$/i, /amfi/i];
  for (const rx of amfiRxList) {
    const match = headers.find(h => rx.test(h));
    if (match && match !== mapping.isin) {
      mapping.scheme_code = match;
      break;
    }
  }

  // 3. Scheme name detection
  const nameRxList = [
    /scheme.*name/i,
    /fund.*name/i,
    /^scheme$/i,
    /^fund$/i,
    /^symbol$/i,
    /tradingsymbol/i,
    /^name$/i,
    /name/i,
    /description/i,
  ];
  for (const rx of nameRxList) {
    const match = headers.find(h => rx.test(h));
    if (match && match !== mapping.isin && match !== mapping.scheme_code) {
      mapping.name = match;
      break;
    }
  }

  const keys: (keyof ColumnMapping)[] = ['scheme_code', 'isin', 'name', 'date', 'units', 'price', 'fees', 'asset_class', 'transaction_type'];

  for (const key of keys) {
    if (mapping[key]) continue;
    const rx = ALIASES[key];
    const match = headers.find(h => rx.test(h));
    if (match) {
      if (key === 'name' && (match === mapping.scheme_code || match === mapping.isin)) continue;
      if (key === 'scheme_code' && (match === mapping.isin || match === mapping.name)) continue;
      if (key === 'isin' && (match === mapping.scheme_code || match === mapping.name)) continue;
      mapping[key] = match;
    }
  }

  return mapping;
}

export function parseCSVDate(dateStr: string): number {
  if (!dateStr) return Date.now();
  const cleaned = dateStr.trim();

  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = cleaned.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), 12, 0, 0).getTime();
  }

  // YYYY-MM-DD
  const ymdMatch = cleaned.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), 12, 0, 0).getTime();
  }

  // DD-MMM-YYYY
  const dmmmYMatch = cleaned.match(/^(\d{1,2})[-/]([a-zA-Z]{3})[-/](\d{2,4})$/);
  if (dmmmYMatch) {
    const [, d, mStr, yStr] = dmmmYMatch;
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    const m = months[mStr.toLowerCase()];
    if (m !== undefined) {
      let y = parseInt(yStr, 10);
      if (yStr.length === 2) {
        y += y < 50 ? 2000 : 1900;
      }
      return new Date(y, m, parseInt(d, 10), 12, 0, 0).getTime();
    }
  }

  const parsed = Date.parse(cleaned);
  return isNaN(parsed) ? Date.now() : parsed;
}

export function parseCSVNumber(numStr?: string): number {
  if (!numStr) return 0;
  const cleaned = numStr.replace(/[^0-9.-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

export function normalizeStr(s?: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export interface CandidateRow {
  isin?: string;
  schemeCode?: string;
  symbol?: string;
  description?: string;
  units?: number;
}

export function isMFLotDuplicate(
  row: CandidateRow,
  lot: InvestmentLot,
  tradeDate: number,
  pricePaise: number
): boolean {
  let identifierMatch = false;

  const rowIsin = row.isin?.trim().toUpperCase();
  const lotIsin = lot.isin?.trim().toUpperCase();
  const lotSymUpper = lot.symbol.trim().toUpperCase();
  const rowSymUpper = (row.symbol || '').trim().toUpperCase();

  const cleanRowSchemeCode = row.schemeCode?.trim().toUpperCase().replace(/^AMFI:/, '');
  const cleanLotSchemeCode = lot.symbol.trim().toUpperCase().startsWith('AMFI:')
    ? lot.symbol.trim().toUpperCase().slice(5)
    : undefined;

  // PRIORITY 1: ISIN match
  if (rowIsin) {
    if (lotIsin && lotIsin === rowIsin) {
      identifierMatch = true;
    } else if (lotSymUpper === rowIsin) {
      identifierMatch = true;
    }
  }

  // PRIORITY 2: AMFI Code match
  if (!identifierMatch && cleanRowSchemeCode) {
    if (cleanLotSchemeCode && cleanLotSchemeCode === cleanRowSchemeCode) {
      identifierMatch = true;
    } else if (lotSymUpper.replace(/^AMFI:/, '') === cleanRowSchemeCode) {
      identifierMatch = true;
    }
  }

  // PRIORITY 3: Scheme Name / Symbol fallback
  if (!identifierMatch && (!rowIsin || !lotIsin) && (!cleanRowSchemeCode || !cleanLotSchemeCode)) {
    const rowNormName = normalizeStr(row.description || row.symbol);
    const lotNormName = normalizeStr(lot.name || lot.symbol);
    if (rowNormName && lotNormName && (rowNormName === lotNormName || rowNormName.includes(lotNormName) || lotNormName.includes(rowNormName))) {
      identifierMatch = true;
    } else if (rowSymUpper && (lotSymUpper === rowSymUpper || lotSymUpper.replace(/^AMFI:/, '') === rowSymUpper.replace(/^AMFI:/, ''))) {
      identifierMatch = true;
    }
  }

  if (!identifierMatch) return false;

  const unitsMatch = Math.abs(lot.units_original - (row.units ?? 0)) < 0.005;
  const dateDiffMs = Math.abs(lot.purchase_date - tradeDate);
  const dateMatch = dateDiffMs <= 86400000 * 2; // within 2 days

  const priceDiffPaise = Math.abs(lot.purchase_price_paise - pricePaise);
  const priceMatch = priceDiffPaise <= 5; // within 5 paise (rounding)

  return unitsMatch && dateMatch && priceMatch;
}
