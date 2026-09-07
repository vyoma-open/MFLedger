import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  TrendingUp, TrendingDown, Download, Search,
  ChevronDown, Package
} from 'lucide-react';
import { db, ASSET_CLASS_LABELS } from '@/db/schema';
import { formatINR } from '@/utils/currency';
import { formatDate, todayStr, currentFY } from '@/utils/fiscalYear';
import { Topbar } from '@/components/Topbar/Topbar';
import { AccountSelector } from '@/components/Topbar/AccountSelector';
import { PeriodSelector, type PeriodPreset, getPeriodMonths } from '@/components/PeriodSelector';
import { useToast } from '@/contexts/ToastContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type TradeKind = 'BUY' | 'SELL';

interface TradeRow {
  id: string;
  kind: TradeKind;
  date: number;
  symbol: string;
  name: string;
  accountName: string;
  accountId: string;
  asset_class: string;
  units: number;
  price_paise: number;
  total_paise: number;
  fees_paise: number;
  status?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAssetBadgeClass(cls: string): string {
  if (cls.includes('STOCK')) return 'badge-blue';
  if (cls.includes('GOLD')) return 'badge-orange';
  if (cls.includes('LIQUID') || cls.includes('DEBT')) return 'badge-grey';
  return 'badge-purple';
}

// ─── Export helpers ───────────────────────────────────────────────────────────

function exportTrades(rows: TradeRow[], periodLabel: string) {
  const headers = ['Type', 'Date', 'Symbol', 'Name', 'Account', 'Asset Class', 'Units', 'Price (INR)', 'Total (INR)'];
  const csvRows = rows.map(r => [
    r.kind,
    formatDate(r.date),
    r.symbol,
    `"${r.name.replace(/"/g, '""')}"`,
    `"${r.accountName.replace(/"/g, '""')}"`,
    (ASSET_CLASS_LABELS as Record<string, string>)[r.asset_class] ?? r.asset_class,
    r.units.toFixed(4),
    (r.price_paise / 100).toFixed(2),
    (r.total_paise / 100).toFixed(2),
  ]);

  const content = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...csvRows.map(r => r.join(','))].join('\n');
  const encoded = encodeURI(content);
  const a = document.createElement('a');
  a.setAttribute('href', encoded);
  a.setAttribute('download', `trade_ledger_${periodLabel}.csv`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TradeLedger({ hideTopbar = false }: { hideTopbar?: boolean }) {
  const { toast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [preset, setPreset] = useState<PeriodPreset>('cfy');
  const [customStart, setCustomStart] = useState(todayStr());
  const [customEnd, setCustomEnd] = useState(todayStr());

  const [search, setSearch] = useState('');
  const [filterKind, setFilterKind] = useState<'BUY' | 'SELL' | ''>('');
  const [filterAssetClass, setFilterAssetClass] = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  // DB queries
  const lots = useLiveQuery(() => db.investment_lots.toArray(), []);
  const events = useLiveQuery(() => db.lot_consumption_events.toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.where('deleted_at').equals(0).toArray(), []);

  const accountMap = useMemo(() => new Map((accounts ?? []).map(a => [a.id, a])), [accounts]);
  const lotMap = useMemo(() => new Map((lots ?? []).map(l => [l.id, l])), [lots]);

  // Build all trades
  const allTrades = useMemo<TradeRow[]>(() => {
    const rows: TradeRow[] = [];

    (lots ?? []).forEach(lot => {
      const acct = accountMap.get(lot.account_id);
      rows.push({
        id: `buy_${lot.id}`,
        kind: 'BUY',
        date: lot.purchase_date,
        symbol: lot.symbol,
        name: lot.name,
        accountName: acct?.name ?? '—',
        accountId: lot.account_id,
        asset_class: lot.asset_class,
        units: lot.units_original,
        price_paise: lot.purchase_price_paise,
        total_paise: Math.round(lot.units_original * lot.purchase_price_paise),
        fees_paise: lot.fees_paise ?? 0,
        status: lot.status,
      });
    });

    (events ?? []).forEach(ev => {
      const lot = lotMap.get(ev.lot_id);
      if (!lot) return;
      const acct = accountMap.get(lot.account_id);
      rows.push({
        id: `sell_${ev.id}`,
        kind: 'SELL',
        date: ev.created_at,
        symbol: lot.symbol,
        name: lot.name,
        accountName: acct?.name ?? '—',
        accountId: lot.account_id,
        asset_class: lot.asset_class,
        units: ev.units_consumed,
        price_paise: ev.sale_price_paise,
        total_paise: Math.round(ev.units_consumed * ev.sale_price_paise),
        fees_paise: 0,
      });
    });

    return rows.sort((a, b) => b.date - a.date);
  }, [lots, events, accountMap, lotMap]);

  // Period filtering
  const periodFiltered = useMemo(() => {
    return allTrades.filter(t => {
      if (preset === 'month') {
        const d = new Date(t.date);
        return d.getFullYear() === year && (d.getMonth() + 1) === month;
      }
      if (preset === '3m') {
        const nowMs = Date.now();
        const threeMonthsAgo = nowMs - (90 * 24 * 60 * 60 * 1000);
        return t.date >= threeMonthsAgo;
      }
      if (preset === 'cfy') {
        const fy = currentFY();
        return t.date >= fy.startMs && t.date <= fy.endMs;
      }
      if (preset === 'lfy') {
        const cfy = currentFY();
        const start = new Date(cfy.startMs);
        start.setFullYear(start.getFullYear() - 1);
        const end = new Date(cfy.endMs);
        end.setFullYear(end.getFullYear() - 1);
        return t.date >= start.getTime() && t.date <= end.getTime();
      }
      if (preset === 'custom' && customStart && customEnd) {
        const s = new Date(customStart); s.setHours(0, 0, 0, 0);
        const e = new Date(customEnd); e.setHours(23, 59, 59, 999);
        return t.date >= s.getTime() && t.date <= e.getTime();
      }
      return true;
    });
  }, [allTrades, preset, year, month, customStart, customEnd]);

  const filtered = useMemo(() => {
    return periodFiltered.filter(t => {
      if (filterKind && t.kind !== filterKind) return false;
      if (filterAssetClass && t.asset_class !== filterAssetClass) return false;
      if (filterAccount && t.accountId !== filterAccount) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchSym = t.symbol.toLowerCase().includes(q);
        const matchName = t.name.toLowerCase().includes(q);
        const matchAcct = t.accountName.toLowerCase().includes(q);
        if (!matchSym && !matchName && !matchAcct) return false;
      }
      return true;
    });
  }, [periodFiltered, filterKind, filterAssetClass, filterAccount, search]);

  const summary = useMemo(() => {
    let buyTotal = 0, sellTotal = 0, buyCount = 0, sellCount = 0;
    periodFiltered.forEach(t => {
      if (t.kind === 'BUY') { buyTotal += t.total_paise; buyCount++; }
      else { sellTotal += t.total_paise; sellCount++; }
    });
    return { buyTotal, sellTotal, buyCount, sellCount };
  }, [periodFiltered]);

  const assetClasses = useMemo(() => {
    const s = new Set<string>();
    periodFiltered.forEach(r => s.add(r.asset_class));
    return [...s].sort();
  }, [periodFiltered]);

  const accountOptions = useMemo(() => {
    const seen = new Map<string, string>();
    periodFiltered.forEach(r => { if (!seen.has(r.accountId)) seen.set(r.accountId, r.accountName); });
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [periodFiltered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilters = !!(filterKind || filterAssetClass || filterAccount || search);

  function handleExport() {
    if (!periodFiltered.length) { toast('No trades found in this period.', 'error'); return; }
    const presetLabel: Record<PeriodPreset, string> = {
      month: `${month}_${year}`,
      '3m': 'last_3m',
      cfy: 'current_fy',
      lfy: 'previous_fy',
      custom: `${customStart}_to_${customEnd}`,
    };
    exportTrades(periodFiltered, presetLabel[preset]);
    toast('Trade Ledger exported.', 'success');
  }

  const pageActions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <PeriodSelector
        year={year}
        month={month}
        preset={preset}
        customStart={customStart}
        customEnd={customEnd}
        onChange={(y, m, p) => { setYear(y); setMonth(m); setPreset(p); setPage(1); }}
        onCustomChange={(start, end) => { setCustomStart(start); setCustomEnd(end); setPreset('custom'); setPage(1); }}
      />
      <AccountSelector />
      <button
        className="btn btn-ghost btn-icon btn-sm"
        onClick={handleExport}
        style={{ color: 'var(--text-secondary)', padding: '6px', height: 28, width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        title="Export Trade Ledger to CSV"
      >
        <Download size={13} />
      </button>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {!hideTopbar && (
        <Topbar title="Trade Ledger" actions={pageActions} />
      )}

      {hideTopbar && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px var(--page-pad-x) 0 var(--page-pad-x)' }}>
          {pageActions}
        </div>
      )}

      <div className="page" style={{ overflowY: 'auto', paddingTop: 'var(--space-4)' }}>

        {/* ── Summary Strip ── */}
        {periodFiltered.length > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10,
            marginBottom: 16, padding: '14px 16px',
            background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)',
          }}>
            {[
              { label: 'Invested', value: summary.buyTotal, color: 'var(--green)', sub: `${summary.buyCount} buys` },
              { label: 'Realised', value: summary.sellTotal, color: 'var(--red)', sub: `${summary.sellCount} sells` },
              { label: 'Total Trades', displayText: String(periodFiltered.length), color: 'var(--text-primary)', sub: '' },
              {
                label: 'Net Deployed',
                value: summary.buyTotal - summary.sellTotal,
                color: summary.buyTotal >= summary.sellTotal ? 'var(--green)' : 'var(--red)',
                prefix: summary.buyTotal >= summary.sellTotal ? '' : '−',
                sub: '',
              },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  {s.label}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>
                  {s.displayText ?? `${s.prefix ?? ''}${formatINR(Math.abs(s.value ?? 0))}`}
                </div>
                {s.sub && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{s.sub}</div>}
              </div>
            ))}
          </div>
        )}

        {/* ── Toolbar ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>
            {filtered.length} Trade{filtered.length !== 1 ? 's' : ''}
          </div>

          <div style={{ position: 'relative', flex: '1 1 160px', minWidth: 120 }}>
            <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
            <input
              className="form-input"
              style={{ paddingLeft: 26, fontSize: 12, height: 30 }}
              placeholder="Search symbol, name…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>

          <div style={{ position: 'relative' }}>
            <select
              className="form-input"
              style={{ fontSize: 12, height: 30, paddingRight: 24, paddingLeft: 8, appearance: 'none', cursor: 'pointer', minWidth: 84 }}
              value={filterKind}
              onChange={e => { setFilterKind(e.target.value as any); setPage(1); }}
            >
              <option value="">All Types</option>
              <option value="BUY">Buy</option>
              <option value="SELL">Sell</option>
            </select>
            <ChevronDown size={11} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-tertiary)' }} />
          </div>

          {assetClasses.length > 1 && (
            <div style={{ position: 'relative' }}>
              <select
                className="form-input"
                style={{ fontSize: 12, height: 30, paddingRight: 24, paddingLeft: 8, appearance: 'none', cursor: 'pointer', minWidth: 110 }}
                value={filterAssetClass}
                onChange={e => { setFilterAssetClass(e.target.value); setPage(1); }}
              >
                <option value="">All Classes</option>
                {assetClasses.map(c => <option key={c} value={c}>{(ASSET_CLASS_LABELS as Record<string, string>)[c] ?? c}</option>)}
              </select>
              <ChevronDown size={11} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-tertiary)' }} />
            </div>
          )}

          {accountOptions.length > 1 && (
            <div style={{ position: 'relative' }}>
              <select
                className="form-input"
                style={{ fontSize: 12, height: 30, paddingRight: 24, paddingLeft: 8, appearance: 'none', cursor: 'pointer', minWidth: 120 }}
                value={filterAccount}
                onChange={e => { setFilterAccount(e.target.value); setPage(1); }}
              >
                <option value="">All Accounts</option>
                {accountOptions.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <ChevronDown size={11} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-tertiary)' }} />
            </div>
          )}

          {hasFilters && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: '0 8px', height: 30 }}
              onClick={() => { setSearch(''); setFilterKind(''); setFilterAssetClass(''); setFilterAccount(''); }}
            >
              Clear
            </button>
          )}
        </div>

        {/* ── Table / Empty ── */}
        {!paginated.length ? (
          <div style={{
            textAlign: 'center', padding: '48px 0',
            border: '1px dashed var(--border-subtle)', borderRadius: 'var(--radius-lg)',
            color: 'var(--text-tertiary)', fontSize: 13,
          }}>
            <Package size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>No trades found</div>
            <div style={{ fontSize: 12 }}>
              {allTrades.length === 0
                ? 'Import market data or log investment transactions to see your trade history.'
                : 'Try a different time period or clear the filters.'}
            </div>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Symbol / Name</th>
                    <th className="hide-mobile">Account</th>
                    <th className="hide-mobile">Asset Class</th>
                    <th className="r">Units</th>
                    <th className="r hide-mobile">Price</th>
                    <th className="r">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(row => (
                    <tr key={row.id}>
                      <td className="td-dim num" style={{ fontSize: 11 }}>{formatDate(row.date)}</td>
                      <td>
                        <span
                          className={`badge ${row.kind === 'BUY' ? 'badge-green' : 'badge-red'}`}
                          style={{ fontSize: 9, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                        >
                          {row.kind === 'BUY' ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                          {row.kind}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                          {row.symbol}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>{row.name}</div>
                        <div className="show-mobile-flex" style={{ gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                          <span className={`badge ${getAssetBadgeClass(row.asset_class)}`} style={{ fontSize: 8 }}>
                            {(ASSET_CLASS_LABELS as Record<string, string>)[row.asset_class] ?? row.asset_class}
                          </span>
                          <span className="badge badge-grey" style={{ fontSize: 8 }}>{row.accountName}</span>
                        </div>
                      </td>
                      <td className="hide-mobile td-dim" style={{ fontSize: 12 }}>{row.accountName}</td>
                      <td className="hide-mobile">
                        <span className={`badge ${getAssetBadgeClass(row.asset_class)}`} style={{ fontSize: 9 }}>
                          {(ASSET_CLASS_LABELS as Record<string, string>)[row.asset_class] ?? row.asset_class}
                        </span>
                      </td>
                      <td className="r">
                        <span style={{ fontSize: 12, fontWeight: 500, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)' }}>
                          {row.units % 1 === 0 ? row.units.toLocaleString('en-IN') : row.units.toFixed(4)}
                        </span>
                      </td>
                      <td className="r hide-mobile">
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                          {formatINR(row.price_paise)}
                        </span>
                      </td>
                      <td className="r">
                        <span
                          className={row.kind === 'BUY' ? 'negative' : 'positive'}
                          style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
                        >
                          {row.kind === 'BUY' ? '−' : '+'}{formatINR(row.total_paise)}
                        </span>
                        {row.fees_paise > 0 && (
                          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 1 }}>
                            +{formatINR(row.fees_paise)} fee
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between" style={{ marginTop: 14 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</button>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Page {page} of {totalPages}</span>
                <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
