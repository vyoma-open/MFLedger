/**
 * Pure Portfolio Data Health Engine.
 * Evaluates comprehensive ledger integrity, pricing freshness, folio linking, and code mappings.
 * Pure TypeScript — zero dependencies, zero DOM, zero database calls.
 */

export type HealthSeverity = 'PASS' | 'WARN' | 'FAIL';

export interface HealthIssueItem {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
}

export interface HealthCheckResult {
  id: string;
  title: string;
  severity: HealthSeverity;
  priority: number;
  issueCount: number;
  issues: HealthIssueItem[];
  summaryText: string;
  helpText: string;
}

export interface DataHealthReport {
  overallStatus: 'HEALTHY' | 'UNHEALTHY';
  isAllGood: boolean;
  totalChecks: number;
  passedChecks: number;
  warnOrFailedChecks: number;
  checks: HealthCheckResult[];
}

export interface HealthInspectionContext {
  lots: Array<{
    id: string;
    account_id: string;
    symbol: string;
    name: string;
    purchase_date: number;
    units_original: number;
    units_remaining: number;
    purchase_price_paise: number;
    status: 'ACTIVE' | 'CLOSED';
    isin?: string;
    folio_number?: string;
  }>;
  consumptionEvents: Array<{
    id: string;
    lot_id: string;
    units_consumed: number;
    sale_price_paise: number;
    created_at: number;
  }>;
  marketCache: Array<{
    symbol: string;
    nav_date: number;
    nav_paise: number;
  }>;
  accounts: Array<{
    id: string;
    name: string;
    account_number?: string;
  }>;
  now?: number;
}

/**
 * Evaluates the 8 core portfolio data health criteria in order of priority.
 */
export function inspectDataHealth(context: HealthInspectionContext): DataHealthReport {
  const {
    lots = [],
    consumptionEvents = [],
    marketCache = [],
    accounts = [],
    now = Date.now(),
  } = context;

  const checks: HealthCheckResult[] = [];
  const accountMap = new Map(accounts.map(a => [a.id, a]));
  const lotMap = new Map(lots.map(l => [l.id, l]));

  // ── Priority 1: FIFO balances reconcile ──────────────────────────────────
  const consumptionByLot = new Map<string, number>();
  for (const ev of consumptionEvents) {
    consumptionByLot.set(
      ev.lot_id,
      (consumptionByLot.get(ev.lot_id) ?? 0) + ev.units_consumed
    );
  }

  const fifoIssues: HealthIssueItem[] = [];
  for (const lot of lots) {
    const consumed = consumptionByLot.get(lot.id) ?? 0;
    const expectedRemaining = lot.units_original - consumed;
    const diff = Math.abs(lot.units_remaining - expectedRemaining);

    if (diff > 0.001 || lot.units_remaining < -0.0001 || lot.units_remaining > lot.units_original + 0.0001) {
      fifoIssues.push({
        id: lot.id,
        title: lot.name || lot.symbol,
        subtitle: `Remaining: ${lot.units_remaining.toFixed(3)} u | Original: ${lot.units_original.toFixed(3)} u | Consumed: ${consumed.toFixed(3)} u`,
        meta: `Discrepancy: ${(lot.units_remaining - expectedRemaining).toFixed(3)} units`,
      });
    } else if (lot.status === 'CLOSED' && lot.units_remaining > 0.001) {
      fifoIssues.push({
        id: lot.id,
        title: lot.name || lot.symbol,
        subtitle: `Lot is marked CLOSED but still has ${lot.units_remaining.toFixed(3)} units remaining`,
        meta: 'Status mismatch',
      });
    }
  }

  checks.push({
    id: 'fifo_reconciliation',
    title: 'FIFO balances reconcile',
    severity: fifoIssues.length === 0 ? 'PASS' : 'FAIL',
    priority: 1,
    issueCount: fifoIssues.length,
    issues: fifoIssues,
    summaryText: fifoIssues.length === 0
      ? 'FIFO balances reconcile'
      : `${fifoIssues.length} lots have FIFO balance discrepancies`,
    helpText: 'Verifies that units remaining on every lot precisely match original purchase units minus all historical redemptions.',
  });

  // ── Priority 2: No duplicate transactions ─────────────────────────────────
  const seenTx = new Map<string, typeof lots[0][]>();
  for (const lot of lots) {
    // Signature: account + symbol + date + original units + purchase price
    const sig = `${lot.account_id}:${lot.symbol}:${lot.purchase_date}:${lot.units_original.toFixed(4)}:${lot.purchase_price_paise}`;
    const group = seenTx.get(sig) ?? [];
    group.push(lot);
    seenTx.set(sig, group);
  }

  const duplicateIssues: HealthIssueItem[] = [];
  for (const [, group] of seenTx.entries()) {
    if (group.length > 1) {
      const sample = group[0];
      const dStr = new Date(sample.purchase_date).toLocaleDateString('en-IN');
      duplicateIssues.push({
        id: sample.id,
        title: sample.name || sample.symbol,
        subtitle: `${group.length} identical records on ${dStr} (${sample.units_original.toFixed(3)} units @ ₹${(sample.purchase_price_paise / 100).toFixed(2)})`,
        meta: `${group.length} duplicate lots`,
      });
    }
  }

  checks.push({
    id: 'duplicate_transactions',
    title: 'No duplicate transactions',
    severity: duplicateIssues.length === 0 ? 'PASS' : 'WARN',
    priority: 2,
    issueCount: duplicateIssues.length,
    issues: duplicateIssues,
    summaryText: duplicateIssues.length === 0
      ? 'No duplicate transactions'
      : `${duplicateIssues.length} potential duplicate transactions detected`,
    helpText: 'Checks for accidental duplicate imports having identical date, symbol, account, units, and price.',
  });

  // ── Priority 3: 0 orphaned redemptions ────────────────────────────────────
  const orphanedIssues: HealthIssueItem[] = [];
  for (const ev of consumptionEvents) {
    if (!lotMap.has(ev.lot_id)) {
      orphanedIssues.push({
        id: ev.id,
        title: `Consumption Event #${ev.id.slice(0, 8)}`,
        subtitle: `Redeemed ${ev.units_consumed.toFixed(3)} units at ₹${(ev.sale_price_paise / 100).toFixed(2)} on ${new Date(ev.created_at).toLocaleDateString('en-IN')}`,
        meta: `Missing Lot ID: ${ev.lot_id}`,
      });
    }
  }

  checks.push({
    id: 'orphaned_redemptions',
    title: '0 orphaned redemptions',
    severity: orphanedIssues.length === 0 ? 'PASS' : 'FAIL',
    priority: 3,
    issueCount: orphanedIssues.length,
    issues: orphanedIssues,
    summaryText: orphanedIssues.length === 0
      ? '0 orphaned redemptions'
      : `${orphanedIssues.length} orphaned redemption events found`,
    helpText: 'Ensures every redemption event links to an existing purchase lot in your ledger.',
  });

  // ── Priority 4: 100% NAVs up to date ──────────────────────────────────────
  // Unique active holdings
  const activeLots = lots.filter(l => l.units_remaining > 0);
  const activeSymbols = Array.from(new Set(activeLots.map(l => l.symbol)));
  
  // Latest NAV per symbol
  const latestNavBySymbol = new Map<string, number>();
  for (const mc of marketCache) {
    const existing = latestNavBySymbol.get(mc.symbol) ?? 0;
    if (mc.nav_date > existing) {
      latestNavBySymbol.set(mc.symbol, mc.nav_date);
    }
  }

  const staleThresholdMs = 7 * 24 * 60 * 60 * 1000; // 7 days (grace for long weekends / holiday clusters)
  const navIssues: HealthIssueItem[] = [];

  for (const sym of activeSymbols) {
    const navDate = latestNavBySymbol.get(sym);
    const sampleLot = activeLots.find(l => l.symbol === sym);
    const schemeName = sampleLot?.name || sym;

    if (!navDate) {
      navIssues.push({
        id: sym,
        title: schemeName,
        subtitle: 'No NAV record found in local market cache',
        meta: 'Missing NAV',
      });
    } else if (now - navDate > staleThresholdMs) {
      const daysOld = Math.floor((now - navDate) / (24 * 60 * 60 * 1000));
      navIssues.push({
        id: sym,
        title: schemeName,
        subtitle: `Last updated on ${new Date(navDate).toLocaleDateString('en-IN')} (${daysOld} days ago)`,
        meta: `${daysOld}d stale`,
      });
    }
  }

  checks.push({
    id: 'nav_freshness',
    title: '100% NAVs up to date',
    severity: navIssues.length === 0 ? 'PASS' : 'WARN',
    priority: 4,
    issueCount: navIssues.length,
    issues: navIssues,
    summaryText: navIssues.length === 0
      ? '100% NAVs up to date'
      : `${navIssues.length} schemes have outdated or missing NAVs`,
    helpText: 'Checks that all currently held mutual funds have fresh NAV pricing cached within the last 7 calendar days.',
  });

  // ── Priority 5: All schemes have AMFI code ────────────────────────────────
  const uniqueSchemes = new Map<string, string>();
  for (const l of lots) {
    if (!uniqueSchemes.has(l.symbol)) {
      uniqueSchemes.set(l.symbol, l.name || l.symbol);
    }
  }

  const amfiIssues: HealthIssueItem[] = [];
  for (const [symbol, name] of uniqueSchemes.entries()) {
    const cleanSym = symbol.trim();
    // AMFI scheme codes are numeric (typically 5 or 6 digits, e.g. AMFI:122639 or 122639)
    const isAmfiFormat =
      cleanSym.startsWith('AMFI:') && /^\d+$/.test(cleanSym.slice(5)) ||
      /^\d{5,7}$/.test(cleanSym);

    if (!isAmfiFormat) {
      amfiIssues.push({
        id: symbol,
        title: name,
        subtitle: `Symbol "${symbol}" does not match standard 6-digit AMFI scheme code format`,
        meta: 'Non-AMFI identifier',
      });
    }
  }

  checks.push({
    id: 'amfi_code_mapping',
    title: 'All schemes have AMFI code',
    severity: amfiIssues.length === 0 ? 'PASS' : 'WARN',
    priority: 5,
    issueCount: amfiIssues.length,
    issues: amfiIssues,
    summaryText: amfiIssues.length === 0
      ? 'All schemes have AMFI code'
      : `${amfiIssues.length} schemes missing AMFI code`,
    helpText: 'Verifies that every fund maps to an official 6-digit AMFI scheme code for automated live NAV fetching.',
  });

  // ── Priority 6: All holdings have scheme codes ────────────────────────────
  const missingSchemeCodeIssues: HealthIssueItem[] = [];
  for (const lot of lots) {
    if (!lot.symbol || lot.symbol.trim() === '' || lot.symbol === 'UNKNOWN') {
      missingSchemeCodeIssues.push({
        id: lot.id,
        title: lot.name || 'Unnamed Holding',
        subtitle: `Purchase date: ${new Date(lot.purchase_date).toLocaleDateString('en-IN')} (${lot.units_original.toFixed(3)} units)`,
        meta: 'Missing symbol',
      });
    }
  }

  checks.push({
    id: 'holdings_scheme_codes',
    title: 'All holdings have scheme codes',
    severity: missingSchemeCodeIssues.length === 0 ? 'PASS' : 'WARN',
    priority: 6,
    issueCount: missingSchemeCodeIssues.length,
    issues: missingSchemeCodeIssues,
    summaryText: missingSchemeCodeIssues.length === 0
      ? 'All holdings have scheme codes'
      : `${missingSchemeCodeIssues.length} holdings missing scheme codes`,
    helpText: 'Checks that every recorded lot contains a non-empty symbol identifier.',
  });

  // ── Priority 7: Schemes missing ISIN code ─────────────────────────────────
  const missingIsinIssues: HealthIssueItem[] = [];
  for (const [symbol, name] of uniqueSchemes.entries()) {
    // Find if any lot of this scheme has an ISIN code
    const matchingLots = lots.filter(l => l.symbol === symbol);
    const hasIsin = matchingLots.some(l => l.isin && l.isin.trim().length >= 10);

    if (!hasIsin) {
      missingIsinIssues.push({
        id: symbol,
        title: name,
        subtitle: `Symbol: ${symbol} — No ISIN registered across lots for this fund`,
        meta: 'Missing ISIN',
      });
    }
  }

  checks.push({
    id: 'schemes_isin_code',
    title: 'All schemes have ISIN code',
    severity: missingIsinIssues.length === 0 ? 'PASS' : 'WARN',
    priority: 7,
    issueCount: missingIsinIssues.length,
    issues: missingIsinIssues,
    summaryText: missingIsinIssues.length === 0
      ? 'All schemes have ISIN code'
      : `${missingIsinIssues.length} schemes missing ISIN code`,
    helpText: 'Checks that mutual fund schemes have their standard 12-character ISIN code (e.g. INF879O01019) for depository tracking.',
  });

  // ── Priority 8: Transactions missing folio ────────────────────────────────
  const missingFolioIssues: HealthIssueItem[] = [];
  for (const lot of lots) {
    const acc = accountMap.get(lot.account_id);
    const hasLotFolio = lot.folio_number && lot.folio_number.trim() !== '';
    const hasAccFolio = acc?.account_number && acc.account_number.trim() !== '';

    if (!hasLotFolio && !hasAccFolio) {
      missingFolioIssues.push({
        id: lot.id,
        title: lot.name || lot.symbol,
        subtitle: `${new Date(lot.purchase_date).toLocaleDateString('en-IN')} in ${acc?.name || 'Unknown Account'} (${lot.units_original.toFixed(3)} units)`,
        meta: 'Missing folio',
      });
    }
  }

  checks.push({
    id: 'transactions_folio',
    title: 'All transactions linked to folio',
    severity: missingFolioIssues.length === 0 ? 'PASS' : 'WARN',
    priority: 8,
    issueCount: missingFolioIssues.length,
    issues: missingFolioIssues,
    summaryText: missingFolioIssues.length === 0
      ? 'All transactions linked to folio'
      : `${missingFolioIssues.length} transactions missing folio`,
    helpText: 'Verifies that every transaction is linked either to a specific folio number or to an account with a recorded folio/demat number.',
  });

  // Sort checks by priority
  checks.sort((a, b) => a.priority - b.priority);

  const passedChecks = checks.filter(c => c.severity === 'PASS').length;
  const warnOrFailedChecks = checks.filter(c => c.severity !== 'PASS').length;
  const isAllGood = warnOrFailedChecks === 0;

  return {
    overallStatus: isAllGood ? 'HEALTHY' : 'UNHEALTHY',
    isAllGood,
    totalChecks: checks.length,
    passedChecks,
    warnOrFailedChecks,
    checks,
  };
}
