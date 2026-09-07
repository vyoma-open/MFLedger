import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Upload, X, CheckCircle, AlertCircle, AlertTriangle, HelpCircle, FileText, Info, Layers } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { db } from '@/db/schema';
import type { AssetClass, Account, InvestmentLot, Profile } from '@/db/schema';
import { buyLot, sellFIFO } from '@/engines/fifo';
import { detectSipPattern, type InvestmentCandidate } from '@/engines/sipDetector';
import { useToast } from '@/contexts/ToastContext';
import { useAccount } from '@/contexts/AccountContext';
import { AddAccountModal } from '@/features/assets/components/AddAccountModal';
import { generateId } from '@/utils/ids';
import { refreshAllHoldings } from '@/utils/marketService';
import { parseCSVDate, parseCSVNumber, normalizeStr, isMFLotDuplicate } from '@/import';

// Set worker Src using locally bundled worker URL (100% offline)
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface ImportCSVModalProps {
  onClose: () => void;
  defaultAccountId?: string;
  onImportSuccess?: () => void;
}

interface ColumnMapping {
  date: string;
  description: string;
  scheme_code: string;
  isin: string;
  name: string;
  units: string;
  price: string;
  fees: string;
  asset_class: string;
  transaction_type: string;
}

interface ParsedRow {
  date: string;
  description: string;
  symbol?: string;
  isin?: string;
  schemeCode?: string;
  units?: number;
  price?: number;
  fees?: number;
  assetClass?: AssetClass;
  transactionType?: 'BUY' | 'SELL';
  raw: Record<string, string>;
  isDuplicate?: boolean;
  duplicateReason?: string;
  originalIdx?: number;
}

export interface ComparisonRow {
  id: string;
  status: 'NEW' | 'DUPLICATE';
  date: string;
  description: string;
  symbol?: string;
  amountOrUnits: string;
  matchedDetails: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MF_CLASSES: AssetClass[] = ['EQUITY_MF', 'INDEX_MF', 'DEBT_MF', 'LIQUID_MF', 'GOLD_MF'];

const MF_LABELS: Record<string, string> = {
  EQUITY_MF: 'Equity MF',
  INDEX_MF: 'Index Fund',
  DEBT_MF: 'Debt MF',
  LIQUID_MF: 'Liquid MF',
  GOLD_MF: 'Gold MF',
};

export function detectAssetClassFromName(name: string): AssetClass {
  const lower = (name || '').toLowerCase();
  if (/liquid|overnight|cash|money\s*market|floating|arbitrage/i.test(lower)) {
    return 'LIQUID_MF';
  }
  if (/gold|silver|commodity|metal/i.test(lower)) {
    return 'GOLD_MF';
  }
  if (/debt|gilt|bond|duration|corporate|credit|income|treasury|fixed|dynamic\s*bond/i.test(lower)) {
    return 'DEBT_MF';
  }
  if (/index|nifty|sensex|etf|bse|nse|foetf|passive/i.test(lower)) {
    return 'INDEX_MF';
  }
  return 'EQUITY_MF';
}

const ALIASES: Record<keyof ColumnMapping, RegExp> = {
  date: /date|dt|time|day|transaction.*date|booking.*date|value.*date|trade.*date/i,
  description: /desc|narration|particulars|payee|merchant|remarks/i,
  scheme_code: /amfi.*code|scheme.*code|^code$|^amfi$/i,
  isin: /(?:growth|payout).*isin|isin.*(?:growth|payout)|^isin.*code|^isin$/i,
  name: /name|scheme|description|mutual.*fund.*name|fund.*name/i,
  units: /unit|qty|quantity|vol|volume|no.*of.*units/i,
  price: /price|nav|rate|cost.*unit|avg.*price|buy.*price|purchase.*price|market.*price/i,
  fees: /fee|brokerage|charges|tax|duty|stamp|expenses|stt/i,
  asset_class: /class|asset|category|type/i,
  transaction_type: /type|action|side|buy.*sell|transaction.*type|trade.*type|operation|activity/i,
};

// ─── Excel and PDF Parsing Helpers ──────────────────────────────────────────
async function parseExcel(f: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const data = await f.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
  if (json.length === 0) {
    throw new Error("Excel sheet is empty.");
  }
  
  const headers = Object.keys(json[0]);
  const stringRows = json.map(row => {
    const newRow: Record<string, string> = {};
    for (const key of headers) {
      newRow[key] = String(row[key] ?? '').trim();
    }
    return newRow;
  });
  
  return { headers, rows: stringRows };
}

async function parsePDF(f: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const arrayBuffer = await f.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  
  const textRows: string[] = [];
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items as any[];
    
    // Group items by y-coordinate (vertical position) with 6 units of tolerance
    const linesMap: Record<number, any[]> = {};
    for (const item of items) {
      if (!item.str || item.str.trim() === '') continue;
      const y = Math.round(item.transform[5] / 6) * 6;
      if (!linesMap[y]) linesMap[y] = [];
      linesMap[y].push(item);
    }
    
    // Sort lines from top of page to bottom
    const sortedY = Object.keys(linesMap).map(Number).sort((a, b) => b - a);
    
    for (const y of sortedY) {
      const lineItems = linesMap[y].sort((a, b) => a.transform[4] - b.transform[4]);
      const lineStr = lineItems.map(item => item.str).join('; ');
      textRows.push(lineStr);
    }
  }
  
  const csvText = textRows.join('\n');
  const results = Papa.parse<string[]>(csvText, {
    delimiter: ';',
    header: false,
    skipEmptyLines: true,
  });
  
  const data = results.data;
  if (data.length === 0) {
    throw new Error("No readable text found in PDF statement.");
  }
  
  let headerIndex = -1;
  const headerRegex = /date|desc|narration|particulars|units|qty|quantity|price|nav|folio/i;
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const matches = row.filter((cell: string) => headerRegex.test(cell));
    if (matches.length >= 2) {
      headerIndex = i;
      break;
    }
  }
  
  let headers: string[] = [];
  const rows: Record<string, string>[] = [];
  
  if (headerIndex !== -1) {
    headers = data[headerIndex].map((h: string, idx: number) => h.trim() || `Column ${idx + 1}`);
    for (let i = headerIndex + 1; i < data.length; i++) {
      const row = data[i];
      const rowObj: Record<string, string> = {};
      headers.forEach((header, idx) => {
        rowObj[header] = String(row[idx] ?? '').trim();
      });
      rows.push(rowObj);
    }
  } else {
    const maxCols = Math.max(...data.map(row => row.length));
    headers = Array.from({ length: maxCols }, (_, idx) => `Column ${idx + 1}`);
    data.forEach(row => {
      const rowObj: Record<string, string> = {};
      headers.forEach((header, idx) => {
        rowObj[header] = String(row[idx] ?? '').trim();
      });
      rows.push(rowObj);
    });
  }
  
  return { headers, rows };
}

function autoDetectMapping(headers: string[]): Partial<ColumnMapping> {
  const mapping: Partial<ColumnMapping> = {};

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

// ─── Modal Component ─────────────────────────────────────────────────────────

export function ImportCSVModal({ onClose, defaultAccountId = '', onImportSuccess }: ImportCSVModalProps) {
  const { toast } = useToast();
  const { accounts, selectedAccountId: contextAccountId } = useAccount();

  // Determine initial account: prop > active context account (if not 'ALL') > first account in db
  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => {
    if (defaultAccountId) return defaultAccountId;
    if (contextAccountId && contextAccountId !== 'ALL') return contextAccountId;
    if (accounts.length > 0) return accounts[0].id;
    return '';
  });

  const [showAddAccountModal, setShowAddAccountModal] = useState(false);

  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [tempFile, setTempFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>({});
  
  // Per-scheme category overrides: key is scheme name / symbol, value is AssetClass
  const [schemeCategories, setSchemeCategories] = useState<Record<string, AssetClass>>({});

  const [isProcessing, setIsProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'new' | 'duplicate' | 'invalid'>('all');
  const [manualInvestmentTypes, setManualInvestmentTypes] = useState<Record<number, 'SIP' | 'LUMPSUM'>>({});
  const [importResult, setImportResult] = useState<{
    importedCount: number;
    skippedCount: number;
    comparisonRows: ComparisonRow[];
  } | null>(null);
  const [comparisonFilter, setComparisonFilter] = useState<'ALL' | 'NEW' | 'DUPLICATE'>('ALL');

  // Sync selectedAccountId if empty and accounts load
  useEffect(() => {
    if (!selectedAccountId && accounts.length > 0) {
      if (contextAccountId && contextAccountId !== 'ALL') {
        setSelectedAccountId(contextAccountId);
      } else {
        setSelectedAccountId(accounts[0].id);
      }
    }
  }, [accounts, contextAccountId, selectedAccountId]);

  // Live queries for real-time duplicate checking in selected account
  const existingLots = useLiveQuery(
    () => (selectedAccountId ? db.investment_lots.where('account_id').equals(selectedAccountId).toArray() : []),
    [selectedAccountId]
  );
  const allConsumptionEvents = useLiveQuery(
    () => db.lot_consumption_events.toArray(),
    []
  );

  const handleFileUpload = useCallback(async (selectedFile: File) => {
    const nameLower = selectedFile.name.toLowerCase();
    const isPDF = nameLower.endsWith('.pdf');
    const isExcel = nameLower.endsWith('.xlsx') || nameLower.endsWith('.xls');

    if (!isPDF && !isExcel && !nameLower.endsWith('.csv') && !nameLower.endsWith('.tsv') && !nameLower.endsWith('.txt')) {
      toast('Please upload a .csv, .xlsx, .xls, or .pdf statement.', 'error');
      return;
    }

    try {
      if (isPDF) {
        const { headers, rows } = await parsePDF(selectedFile);
        setFile(selectedFile);
        setCsvHeaders(headers);
        setCsvRows(rows);
        const autoMap = autoDetectMapping(headers);
        setMapping(autoMap);
      } else if (isExcel) {
        const { headers, rows } = await parseExcel(selectedFile);
        setFile(selectedFile);
        setCsvHeaders(headers);
        setCsvRows(rows);
        const autoMap = autoDetectMapping(headers);
        setMapping(autoMap);
      } else {
        Papa.parse<Record<string, string>>(selectedFile, {
          header: true,
          skipEmptyLines: 'greedy',
          complete: (results) => {
            const headers = results.meta.fields || [];
            if (headers.length === 0) {
              toast('No column headers detected in statement.', 'error');
              return;
            }
            setFile(selectedFile);
            setCsvHeaders(headers);
            setCsvRows(results.data);
            const autoMap = autoDetectMapping(headers);
            setMapping(autoMap);
          },
          error: (err) => {
            toast(`Failed to parse file: ${err.message}`, 'error');
          }
        });
      }
    } catch (err: any) {
      toast(err.message || 'Failed to read statement file.', 'error');
    }
  }, [toast]);

  // Parsing individual rows
  const parsedData = useMemo<ParsedRow[]>(() => {
    if (!csvRows.length) return [];

    return csvRows.map(row => {
      const dateVal = mapping.date ? row[mapping.date] : '';
      const descVal = mapping.name ? row[mapping.name] : (mapping.description ? row[mapping.description] : '');
      const unitsVal = mapping.units ? parseCSVNumber(row[mapping.units]) : 0;
      const priceVal = mapping.price ? parseCSVNumber(row[mapping.price]) : 0;
      const feesVal = mapping.fees ? parseCSVNumber(row[mapping.fees]) : 0;
      
      const rawType = mapping.transaction_type ? (row[mapping.transaction_type] || '').toUpperCase() : '';
      let txnType: 'BUY' | 'SELL' = 'BUY';
      if (/SELL|REDEEM|REDEMPTION|SWITCH.*OUT|TRANSFER.*OUT|PURCHASE.*CANCEL/i.test(rawType) || unitsVal < 0) {
        txnType = 'SELL';
      }

      const schemeCodeRaw = mapping.scheme_code ? (row[mapping.scheme_code] || '').trim() : '';
      const isinRaw = mapping.isin ? (row[mapping.isin] || '').trim().toUpperCase() : '';
      const nameRaw = (mapping.name ? (row[mapping.name] || '').trim() : '') || descVal;

      // Clean scheme name: prioritize human readable fund name over raw codes
      const cleanSchemeName = nameRaw && !/^[A-Z0-9]{10,12}$/i.test(nameRaw)
        ? nameRaw
        : (descVal && !/^[A-Z0-9]{10,12}$/i.test(descVal) ? descVal : (isinRaw || schemeCodeRaw ? `AMFI:${schemeCodeRaw || isinRaw}` : 'Mutual Fund'));

      const resolvedSymbol = schemeCodeRaw ? `AMFI:${schemeCodeRaw}` : (isinRaw || cleanSchemeName);
      const schemeKey = cleanSchemeName || resolvedSymbol;
      const detectedClass = schemeCategories[schemeKey] || schemeCategories[resolvedSymbol] || detectAssetClassFromName(cleanSchemeName);

      return {
        date: dateVal,
        description: cleanSchemeName,
        symbol: resolvedSymbol,
        isin: isinRaw || undefined,
        schemeCode: schemeCodeRaw || undefined,
        units: Math.abs(unitsVal),
        price: Math.abs(priceVal),
        fees: Math.abs(feesVal),
        assetClass: detectedClass,
        transactionType: txnType,
        raw: row,
      };
    });
  }, [csvRows, mapping, schemeCategories]);

  const validData = useMemo(() => {
    return parsedData.filter(r => r.units && r.units > 0 && r.price && r.price > 0);
  }, [parsedData]);

  // Enhanced SIP Detection: Inspects scheme names, narrations, raw transaction rows, and regular calendar cadence
  const sipDetectionMap = useMemo(() => {
    const candidates: InvestmentCandidate[] = validData
      .filter(r => r.transactionType === 'BUY')
      .map((r, idx) => {
        // Collect all text from raw CSV row for deep narration/keyword matching (e.g. NACH, ECS, Auto-Debit, SIP)
        const rawNarration = Object.values(r.raw || {}).join(' ');
        const combinedDesc = `${r.description} ${rawNarration}`.trim();

        return {
          id: `row_${idx}`,
          date: parseCSVDate(r.date),
          amount_paise: Math.round((r.units ?? 0) * (r.price ?? 0) * 100),
          // Group by clean readable fund name for robust cadence detection
          symbol: r.description.toUpperCase(),
          description: combinedDesc,
        };
      });

    return detectSipPattern(candidates);
  }, [validData]);

  const isRowSip = useCallback((row: ParsedRow): boolean => {
    const idx = validData.indexOf(row);
    if (idx !== -1 && manualInvestmentTypes[idx] !== undefined) {
      return manualInvestmentTypes[idx] === 'SIP';
    }
    const detected = sipDetectionMap.get(`row_${idx}`);
    if (detected !== undefined) return detected.isSip;

    const rawNarration = Object.values(row.raw || {}).join(' ');
    return /\b(sip|xsip|isip|msip|m-sip|systematic|sys\.?\s*inv|auto\s*debit|nach|ach|ecs)\b/i.test(`${row.description} ${rawNarration}`);
  }, [validData, sipDetectionMap, manualInvestmentTypes]);

  // Duplicate Check
  const rowsWithDuplicateStatus = useMemo<ParsedRow[]>(() => {
    if (!validData.length) return [];

    const remainingLots = [...(existingLots || [])];
    const existingLotIds = new Set((existingLots || []).map(l => l.id));
    const lotMap = new Map((existingLots || []).map(l => [l.id, l]));
    const accountEvts = (allConsumptionEvents || []).filter(e => existingLotIds.has(e.lot_id));
    const eventsBySale = new Map<string, typeof accountEvts>();
    
    for (const evt of accountEvts) {
      const key = `evt_${Math.floor(evt.created_at / 86400000)}_${evt.sale_price_paise}`;
      const list = eventsBySale.get(key) || [];
      list.push(evt);
      eventsBySale.set(key, list);
    }
    
    const existingSales: { symbol: string; isin?: string; date: number; units: number }[] = [];
    for (const [, evts] of eventsBySale) {
      const firstLot = lotMap.get(evts[0].lot_id);
      if (firstLot) {
        const totalUnits = evts.reduce((sum, e) => sum + e.units_consumed, 0);
        existingSales.push({
          symbol: firstLot.symbol.toUpperCase(),
          isin: firstLot.isin?.toUpperCase(),
          date: evts[0].created_at,
          units: totalUnits,
        });
      }
    }
    const remainingSales = [...existingSales];

    const sortedWithIndex = validData.map((row, idx) => ({ row, idx }))
      .sort((a, b) => parseCSVDate(a.row.date) - parseCSVDate(b.row.date));

    const statusMap = new Map<number, { isDuplicate: boolean; duplicateReason?: string }>();

    for (const { row, idx } of sortedWithIndex) {
      const tradeDate = parseCSVDate(row.date);
      const pricePaise = row.price ? (row.price * 100) : 0;
      const symUpper = (row.symbol || '').toUpperCase();
      const lotIsin = row.isin || (/^IN[A-Z0-9]{10}$/i.test(symUpper) ? symUpper : undefined);

      if (row.transactionType === 'SELL') {
        const matchSaleIdx = remainingSales.findIndex(s => {
          const symMatch = s.symbol === symUpper ||
            s.symbol.replace(/^AMFI:/, '') === symUpper.replace(/^AMFI:/, '');
          const isinMatch = Boolean(s.isin && lotIsin && s.isin.toUpperCase() === lotIsin.toUpperCase());
          const unitsMatch = Math.abs(s.units - (row.units ?? 0)) < 0.005;
          const dateMatch = Math.abs(s.date - tradeDate) <= 108000000 ||
            new Date(s.date).toDateString() === new Date(tradeDate).toDateString();
          return (symMatch || isinMatch) && unitsMatch && dateMatch;
        });

        if (matchSaleIdx !== -1) {
          remainingSales.splice(matchSaleIdx, 1);
          statusMap.set(idx, {
            isDuplicate: true,
            duplicateReason: `Matching redemption on ${row.date} already recorded in this folio`,
          });
        } else {
          statusMap.set(idx, { isDuplicate: false });
        }
      } else {
        const matchLotIdx = remainingLots.findIndex(lot => isMFLotDuplicate(row, lot, tradeDate, pricePaise));
        if (matchLotIdx !== -1) {
          const matchedLot = remainingLots[matchLotIdx];
          remainingLots.splice(matchLotIdx, 1);
          statusMap.set(idx, {
            isDuplicate: true,
            duplicateReason: `Lot already exists in folio: ${matchedLot.units_original.toFixed(3)} units @ ₹${(matchedLot.purchase_price_paise / 100).toFixed(2)} on ${new Date(matchedLot.purchase_date).toLocaleDateString('en-IN')}`,
          });
        } else {
          statusMap.set(idx, { isDuplicate: false });
        }
      }
    }

    return validData.map((r, i) => ({
      ...r,
      originalIdx: i,
      ...(statusMap.get(i) || { isDuplicate: false }),
    }));
  }, [validData, selectedAccountId, existingLots, allConsumptionEvents]);

  const duplicateCount = rowsWithDuplicateStatus.filter(r => r.isDuplicate).length;
  const newCount = rowsWithDuplicateStatus.filter(r => !r.isDuplicate).length;

  const handleSubmit = async () => {
    if (!selectedAccountId) {
      toast('Please select or create a folio account first.', 'error');
      return;
    }

    if ((!mapping.scheme_code && !mapping.isin && !mapping.name) || !mapping.date || !mapping.units || !mapping.price) {
      toast('Please map Scheme Code/ISIN/Name, Date, Units, and NAV/Price.', 'error');
      return;
    }

    const rowsToImport = rowsWithDuplicateStatus.filter(r => !r.isDuplicate);
    const duplicateRowsList = rowsWithDuplicateStatus.filter(r => r.isDuplicate);

    if (rowsToImport.length === 0 && duplicateRowsList.length > 0) {
      toast(`All ${duplicateRowsList.length} rows already exist in this folio as duplicates.`, 'info');
      return;
    }

    setIsProcessing(true);
    try {
      const targetAccountId = selectedAccountId;
      let count = 0;
      let skippedCount = 0;
      const comparisonRows: ComparisonRow[] = [];

      // Sort chronologically (oldest first)
      const sortedRows = [...rowsWithDuplicateStatus].sort((a, b) => parseCSVDate(a.date) - parseCSVDate(b.date));

      for (const row of sortedRows) {
        const tradeDate = parseCSVDate(row.date);
        const pricePaise = Math.round((row.price ?? 0) * 100);
        const feesPaise = Math.round((row.fees ?? 0) * 100);
        const symUpper = (row.symbol || '').toUpperCase();
        const lotIsin = row.isin || (/^IN[A-Z0-9]{10}$/i.test(symUpper) ? symUpper : undefined);

        if (row.isDuplicate) {
          skippedCount++;
          comparisonRows.push({
            id: `${row.transactionType === 'SELL' ? 'sell' : 'buy'}_dup_${tradeDate}_${count + skippedCount}`,
            status: 'DUPLICATE',
            date: row.date,
            description: row.description || symUpper,
            symbol: symUpper,
            amountOrUnits: `${row.units?.toFixed(3)} units (${row.transactionType || 'BUY'} @ ₹${row.price?.toFixed(2)})`,
            matchedDetails: row.duplicateReason || `Existing lot found in DB — skipped`,
          });
          continue;
        }

        if (row.transactionType === 'SELL') {
          await sellFIFO({
            account_id: targetAccountId,
            symbol: symUpper,
            units_to_sell: row.units!,
            sale_price_per_unit_paise: pricePaise,
            sale_date: tradeDate,
          });
          count++;
          comparisonRows.push({
            id: `sell_new_${tradeDate}_${count + skippedCount}`,
            status: 'NEW',
            date: row.date,
            description: row.description || symUpper,
            symbol: symUpper,
            amountOrUnits: `${row.units?.toFixed(3)} units (SELL @ ₹${row.price?.toFixed(2)})`,
            matchedDetails: `Redemption sale recorded via FIFO`,
          });
        } else {
          const cleanName = row.description.trim() || symUpper;

          let mfPlan: 'DIRECT' | 'REGULAR' | undefined = undefined;
          let mfOption: 'GROWTH' | 'IDCW' | undefined = undefined;
          const descLower = (row.description || '').toLowerCase();
          if (descLower.includes('direct')) mfPlan = 'DIRECT';
          else if (descLower.includes('regular')) mfPlan = 'REGULAR';

          if (descLower.includes('growth') || descLower.includes('gr')) mfOption = 'GROWTH';
          else if (descLower.includes('idcw') || descLower.includes('dividend')) mfOption = 'IDCW';

          const isSip = isRowSip(row);
          const resolvedInvestmentType: 'SIP' | 'LUMPSUM' = isSip ? 'SIP' : 'LUMPSUM';

          const schemeKey = cleanName || symUpper;
          const finalAssetClass = schemeCategories[schemeKey] || schemeCategories[symUpper] || row.assetClass || detectAssetClassFromName(cleanName);

          await buyLot({
            account_id: targetAccountId,
            symbol: symUpper,
            name: cleanName,
            asset_class: finalAssetClass,
            purchase_date: tradeDate,
            units: row.units!,
            price_per_unit_paise: pricePaise,
            fees_paise: feesPaise,
            mf_plan: mfPlan,
            mf_option: mfOption,
            isin: lotIsin,
            investment_type: resolvedInvestmentType,
          });
          count++;
          comparisonRows.push({
            id: `buy_new_${tradeDate}_${count + skippedCount}`,
            status: 'NEW',
            date: row.date,
            description: cleanName,
            symbol: symUpper,
            amountOrUnits: `${row.units?.toFixed(3)} units (BUY @ ₹${row.price?.toFixed(2)})`,
            matchedDetails: `New ${isSip ? '⚡️SIP' : '💰BULK'} lot added to portfolio`,
          });
        }
      }

      setImportResult({
        importedCount: count,
        skippedCount,
        comparisonRows,
      });

      toast(`Imported ${count} transaction${count === 1 ? '' : 's'}. Updating latest NAV prices in background…`, 'success');
      onImportSuccess?.();

      // Automatically fetch latest NAV prices for portfolio schemes in background
      refreshAllHoldings().catch(e => console.warn('Post-import NAV update notice:', e));
    } catch (err: any) {
      toast(`Import failed: ${err.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-fade-in" style={{ maxWidth: 880, width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        
        {/* Header */}
        <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12 }}>
          <div className="flex items-center gap-2">
            <Upload size={18} className="text-green" />
            <h2 className="modal-title" style={{ fontSize: 16, fontWeight: 600 }}>Import Mutual Fund Statement / CAS</h2>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0' }}>
          {importResult ? (
            <div className="flex flex-col gap-4">
              <div style={{ background: 'var(--surface-2)', padding: 16, borderRadius: 'var(--radius)', border: '1px solid var(--border-subtle)' }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Import Summary</h3>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ color: 'var(--green)', fontSize: 13, fontWeight: 600 }}>✓ {importResult.importedCount} Imported</div>
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>• {importResult.skippedCount} Duplicates Skipped</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                {(['ALL', 'NEW', 'DUPLICATE'] as const).map(f => (
                  <button
                    key={f}
                    className={`btn btn-sm ${comparisonFilter === f ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setComparisonFilter(f)}
                    style={{ fontSize: 11, padding: '4px 10px' }}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <div style={{ maxHeight: 350, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)' }}>
                <table className="data-table" style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Date</th>
                      <th>Scheme</th>
                      <th>Units / Price</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.comparisonRows
                      .filter(r => comparisonFilter === 'ALL' || r.status === comparisonFilter)
                      .map(r => (
                        <tr key={r.id}>
                          <td>
                            <span className={`badge ${r.status === 'NEW' ? 'badge-green' : 'badge-neutral'}`} style={{ fontSize: 10 }}>
                              {r.status}
                            </span>
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>{r.date}</td>
                          <td>{r.description}</td>
                          <td style={{ whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>{r.amountOrUnits}</td>
                          <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{r.matchedDetails}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : !file ? (
            <div className="flex flex-col gap-4">
              {/* Account Selection */}
              <div className="form-group">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Target Portfolio Account *</label>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm text-green"
                    style={{ fontSize: 11, padding: '2px 6px', height: 'auto' }}
                    onClick={() => setShowAddAccountModal(true)}
                  >
                    + New Portfolio Account
                  </button>
                </div>
                {accounts.length === 0 ? (
                  <div style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius)',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      No mutual fund portfolio account found.
                    </span>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setShowAddAccountModal(true)}
                    >
                      Create Portfolio
                    </button>
                  </div>
                ) : (
                  <select
                    className="form-select"
                    value={selectedAccountId}
                    onChange={e => setSelectedAccountId(e.target.value)}
                    style={{ height: 36, fontSize: 13 }}
                  >
                    <option value="">Select Target Portfolio Account…</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.emoji ? `${a.emoji} ` : ''}{a.name} {a.account_number ? `(${a.account_number})` : ''}
                      </option>
                    ))}
                  </select>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  Transactions and holding lots will be recorded under this mutual fund portfolio account.
                </div>
              </div>

              {/* Upload Dropzone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
                }}
                style={{
                  border: `2px dashed ${dragOver ? 'var(--green)' : 'var(--border-subtle)'}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: '36px 20px',
                  textAlign: 'center',
                  background: dragOver ? 'var(--surface-3)' : 'var(--surface-2)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.csv,.xlsx,.xls,.pdf';
                  input.onchange = e => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (f) handleFileUpload(f);
                  };
                  input.click();
                }}
              >
                <Upload size={32} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                  Drag and drop statement file here
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Supports CAMS / KFintech CAS (PDF/Excel), Zerodha Coin, Groww, Kuvera, MF Central, and CSV files
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 'var(--radius)' }}>
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-green" />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{file.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>({csvRows.length} rows)</span>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setFile(null)}>Change File</button>
              </div>

              {/* Column Mapping Section */}
              <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>Column Mapping</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                  {[
                    ['date', 'Date *'],
                    ['name', 'Scheme Name *'],
                    ['units', 'Units *'],
                    ['price', 'NAV / Price *'],
                    ['scheme_code', 'AMFI Code'],
                    ['isin', 'ISIN'],
                    ['fees', 'Stamp Duty / Charges'],
                    ['transaction_type', 'Txn Type (Buy/Sell)'],
                  ].map(([key, label]) => (
                    <div key={key}>
                      <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 2 }}>{label}</label>
                      <select
                        className="form-select"
                        value={mapping[key as keyof ColumnMapping] || ''}
                        onChange={e => setMapping(prev => ({ ...prev, [key]: e.target.value }))}
                        style={{ height: 30, fontSize: 11, width: '100%' }}
                      >
                        <option value="">-- None --</option>
                        {csvHeaders.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fund Category Auto-Classification & Overrides */}
              {(() => {
                const uniqueSchemes = Array.from(
                  new Set(validData.map(r => r.description).filter(Boolean))
                );
                if (uniqueSchemes.length === 0) return null;

                return (
                  <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div className="flex items-center gap-1.5">
                        <Layers size={14} className="text-green" />
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                          Mutual Fund Category Classification ({uniqueSchemes.length} Funds)
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        Auto-detected from fund names. Change if needed:
                      </span>
                    </div>

                    <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                      <table className="data-table" style={{ width: '100%', fontSize: 11 }}>
                        <thead>
                          <tr>
                            <th>Mutual Fund Scheme</th>
                            <th style={{ width: 160 }}>Category</th>
                          </tr>
                        </thead>
                        <tbody>
                          {uniqueSchemes.map(scheme => {
                            const currentCat = schemeCategories[scheme] || detectAssetClassFromName(scheme);
                            return (
                              <tr key={scheme}>
                                <td className="truncate" style={{ maxWidth: 280 }} title={scheme}>
                                  {scheme}
                                </td>
                                <td>
                                  <select
                                    className="form-select"
                                    value={currentCat}
                                    onChange={e => {
                                      const val = e.target.value as AssetClass;
                                      setSchemeCategories(prev => ({ ...prev, [scheme]: val }));
                                    }}
                                    style={{ height: 26, fontSize: 11, padding: '2px 8px' }}
                                  >
                                    {MF_CLASSES.map(c => (
                                      <option key={c} value={c}>{MF_LABELS[c]}</option>
                                    ))}
                                  </select>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* Duplicate & Valid Preview */}
              <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                <span style={{ color: 'var(--green)', fontWeight: 600 }}>{newCount} New to Import</span>
                {duplicateCount > 0 && (
                  <span style={{ color: 'var(--orange)' }}>{duplicateCount} Duplicates (will be skipped)</span>
                )}
              </div>

              {/* Preview Table */}
              <div style={{ maxHeight: 250, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)' }}>
                <table className="data-table" style={{ width: '100%', fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Date</th>
                      <th>Scheme</th>
                      <th style={{ textAlign: 'right' }}>Units</th>
                      <th style={{ textAlign: 'right' }}>NAV</th>
                      <th style={{ textAlign: 'right' }}>Total (₹)</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsWithDuplicateStatus.slice(0, 50).map((r, i) => {
                      const totalAmount = ((r.units ?? 0) * (r.price ?? 0));
                      const isSip = isRowSip(r);
                      const originalIdx = r.originalIdx ?? i;

                      return (
                        <tr key={i} style={{ opacity: r.isDuplicate ? 0.5 : 1 }}>
                          <td>
                            <span className={`badge ${r.isDuplicate ? 'badge-neutral' : 'badge-green'}`} style={{ fontSize: 9 }}>
                              {r.isDuplicate ? 'DUP' : 'NEW'}
                            </span>
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>{r.date}</td>
                          <td style={{ maxWidth: 220 }} className="truncate" title={r.description}>
                            {r.description}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
                            {r.units?.toFixed(3)}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
                            ₹{r.price?.toFixed(2)}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', fontWeight: 600 }}>
                            ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td>
                            {r.transactionType === 'SELL' ? (
                              <span className="badge badge-neutral" style={{ fontSize: 9 }}>SELL</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setManualInvestmentTypes(prev => ({
                                    ...prev,
                                    [originalIdx]: isSip ? 'LUMPSUM' : 'SIP',
                                  }));
                                }}
                                title="Click to toggle between SIP and Bulk"
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  padding: 0,
                                }}
                              >
                                <span className={`badge ${isSip ? 'badge-purple' : 'badge-neutral'}`} style={{ fontSize: 9, cursor: 'pointer' }}>
                                  {isSip ? '⚡️SIP' : '💰BULK'}
                                </span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {importResult ? (
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={onClose} disabled={isProcessing}>Cancel</button>
              {file && (
                <button
                  className="btn btn-primary"
                  onClick={handleSubmit}
                  disabled={isProcessing || newCount === 0}
                >
                  {isProcessing ? 'Importing…' : `Import ${newCount} Lots`}
                </button>
              )}
            </>
          )}
        </div>

      </div>

      {showAddAccountModal && (
        <AddAccountModal
          onClose={() => setShowAddAccountModal(false)}
        />
      )}
    </div>
  );
}
