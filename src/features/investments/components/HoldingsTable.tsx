import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, TrendingUp, Pencil, Trash2, Wallet, Download, Upload, RefreshCw, Loader2, Receipt, ChevronDown } from 'lucide-react';
import { db } from '@/db/schema';
import type { AssetClass, Account, RecurringTemplate } from '@/db/schema';
import { EditAccountModal } from '@/features/assets/components/EditAccountModal';
import { getPortfolioSummary } from '@/engines/fifo';
import { calculateXIRR } from '@/utils/xirr';
import { Amt, formatINR } from '@/utils/currency';
import { formatDate, currentFY, formatRelativeTime } from '@/utils/fiscalYear';
import { useToast } from '@/contexts/ToastContext';
import { Topbar } from '@/components/Topbar/Topbar';
import { AccountSelector } from '@/components/Topbar/AccountSelector';
import { ExportCSVModal } from '@/components/ExportCSVModal';
const ImportCSVModal = React.lazy(() =>
  import('@/features/import/components/ImportCSVModal').then(m => ({ default: m.ImportCSVModal }))
);
import { useAccount } from '@/contexts/AccountContext';
import { useMarketRefresh } from '@/hooks/useMarketRefresh';
import { SortableHeader } from '@/components/ui/SortableHeader';
import { getGoalTagTheme } from '@/utils/goalColors';
import { MF_LABELS, AddLotModal } from './modals/AddLotModal';
import { AssetLotsModal } from './modals/AssetLotsModal';
import { SIPDetailsModal } from './modals/SIPDetailsModal';
import { analyzeSipStreams } from '@/engines/sipDetector';
import { AccountIcon } from '@/components/AccountIcon';

export function HoldingsTable({ assetClasses, title, defaultClass, allowedClasses, addLotTitle, addLotAccountTypes, accountId }: {
  assetClasses: AssetClass[]; title: string; defaultClass: AssetClass; allowedClasses?: AssetClass[];
  addLotTitle?: string; addLotAccountTypes?: string[]; accountId?: string;
}) {
  const { toast } = useToast();
  const { selectedAccountId, selectedAccount } = useAccount();
  const effectiveAccountId = accountId || (selectedAccountId === 'ALL' ? undefined : selectedAccountId);
  const portfolio = useLiveQuery(
    async () => {
      const all = await getPortfolioSummary(effectiveAccountId, undefined);
      return all.filter(p => assetClasses.includes(p.asset_class));
    },
    [effectiveAccountId, assetClasses],
    []
  );
  const [showModal, setShowModal] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [selectedSipId, setSelectedSipId] = useState<string | null>(null);

  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportCSVModal, setShowImportCSVModal] = useState(false);

  const { isRefreshing, lastRefreshTs, formattedUpdatedOn, canRefresh, reason: refreshReason, handleRefresh } = useMarketRefresh();

  const [sortField, setSortField] = useState<'symbol' | 'class' | 'units' | 'avgCost' | 'ltp' | 'value' | 'pnl' | null>('symbol');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>('asc');

  const handleSort = (field: 'symbol' | 'class' | 'units' | 'avgCost' | 'ltp' | 'value' | 'pnl') => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortField(null);
        setSortDirection(null);
      } else {
        setSortDirection('asc');
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };



  // NEW: Tab selection, recurring templates query, and savings accounts lookup
  const [activeTab] = useState<'combined' | 'recurring' | 'holdings'>('combined');
  const recurringTemplates = useLiveQuery(
    async () => {
      if (accountId) {
        return db.recurring_templates
          .filter(t => t.to_account_id === accountId)
          .toArray();
      }

      // If global Mutual Funds page
      if (addLotAccountTypes?.includes('MF')) {
        const mfAccounts = await db.accounts.where('deleted_at').equals(0).filter(a => a.type === 'MF').toArray();
        const mfAccountIds = mfAccounts.map(a => a.id);
        return db.recurring_templates
          .filter(t => t.to_account_id !== undefined && mfAccountIds.includes(t.to_account_id))
          .toArray();
      }

      return [];
    },
    [accountId, addLotAccountTypes]
  );
  const allAccounts = useLiveQuery(() => db.accounts.where('deleted_at').equals(0).toArray(), []);
  const activeAccount = accountId ? (allAccounts?.find(a => a.id === accountId) || null) : selectedAccount;
  const allActiveLots = useLiveQuery(() => db.investment_lots.where('status').equals('ACTIVE').toArray(), []);
  const [showArchived, setShowArchived] = useState(false);

  // Query closed / archived holdings that have 0 active units remaining
  const archivedHoldings = useLiveQuery(
    async () => {
      const validAccounts = await db.accounts.where('deleted_at').equals(0).toArray();
      const targetAccountIds: string[] = effectiveAccountId
        ? [effectiveAccountId]
        : validAccounts
            .filter(a => (addLotAccountTypes ? addLotAccountTypes.includes(a.type) : true))
            .map(a => a.id);

      if (targetAccountIds.length === 0) return [];

      const lots = await db.investment_lots
        .where('account_id')
        .anyOf(targetAccountIds)
        .toArray();

      const lotsBySym = new Map<string, typeof lots>();
      for (const l of lots) {
        if (!assetClasses.includes(l.asset_class)) continue;
        const sym = l.symbol.toUpperCase();
        if (!lotsBySym.has(sym)) lotsBySym.set(sym, []);
        lotsBySym.get(sym)!.push(l);
      }

      const closedList: Array<{
        symbol: string;
        name: string;
        asset_class: AssetClass;
        totalInvestedPaise: number;
        totalUnitsBought: number;
        totalWithdrawnPaise: number;
        realizedPlPaise: number;
        lotsCount: number;
      }> = [];

      const allEvents = await db.lot_consumption_events.toArray();

      for (const [sym, symLots] of lotsBySym) {
        const totalRemaining = symLots.reduce((s, l) => s + l.units_remaining, 0);
        if (totalRemaining > 0) continue; // Still has active units, not closed

        const lotIds = new Set(symLots.map(l => l.id));
        const matchingEvents = allEvents.filter(e => lotIds.has(e.lot_id));

        const totalInvestedPaise = symLots.reduce((s, l) => s + Math.round(l.units_original * l.purchase_price_paise), 0);
        const totalUnitsBought = symLots.reduce((s, l) => s + l.units_original, 0);
        const totalWithdrawnPaise = matchingEvents.reduce((s, e) => s + Math.round(e.units_consumed * e.sale_price_paise), 0);
        const realizedPlPaise = totalWithdrawnPaise - totalInvestedPaise;

        closedList.push({
          symbol: sym,
          name: symLots[0]?.name || sym,
          asset_class: symLots[0]?.asset_class || 'EQUITY_MF',
          totalInvestedPaise,
          totalUnitsBought,
          totalWithdrawnPaise,
          realizedPlPaise,
          lotsCount: symLots.length,
        });
      }

      return closedList.sort((a, b) => a.name.localeCompare(b.name));
    },
    [effectiveAccountId, assetClasses, addLotAccountTypes]
  );

  const activeSipBySymbol = React.useMemo(() => {
    const map = new Map<string, { status: 'ACTIVE' | 'PAUSED' | 'COMPLETED'; monthlyPaise: number; label: string }>();
    if (!allActiveLots) return map;

    const now = Date.now();
    const lotsBySym = new Map<string, typeof allActiveLots>();
    for (const l of allActiveLots) {
      const sym = l.symbol.toUpperCase();
      if (!lotsBySym.has(sym)) lotsBySym.set(sym, []);
      lotsBySym.get(sym)!.push(l);
    }

    for (const [sym, symLots] of lotsBySym) {
      const template = recurringTemplates?.find(t => {
        const tSym = t.name.replace(/ SIP$/i, '').trim().toUpperCase();
        return tSym === sym;
      });

      const analytics = analyzeSipStreams(symLots, symLots[0]?.purchase_price_paise ?? 1000, now, template?.is_active === 1);
      if (analytics.hasSip) {
        const monthlyPaise = template?.amount_paise || analytics.latestSipAmountPaise;
        const status = template
          ? (template.is_active === 1 ? 'ACTIVE' : 'PAUSED')
          : analytics.sipStatus;

        const label = status === 'ACTIVE'
          ? `⚡ Active SIP · ${formatINR(monthlyPaise)}/mo`
          : status === 'PAUSED'
            ? `⏸️ SIP Paused · ${formatINR(monthlyPaise)}/mo`
            : '⏹️ SIP Completed';

        map.set(sym, {
          status,
          monthlyPaise,
          label,
        });
      }
    }
    return map;
  }, [allActiveLots, recurringTemplates]);

  const realizedPlForFy = useLiveQuery(
    async () => {
      const fy = currentFY();
      const events = await db.lot_consumption_events.toArray();
      const fyEvents = events.filter(e => e.created_at >= fy.startMs && e.created_at <= fy.endMs);
      if (fyEvents.length === 0) return 0;

      const lotIds = fyEvents.map(e => e.lot_id);
      const lots = await db.investment_lots.bulkGet(lotIds);
      const lotMap = new Map(lots.filter(Boolean).map(l => [l!.id, l!]));

      let totalGain = 0;
      for (const event of fyEvents) {
        const lot = lotMap.get(event.lot_id);
        if (!lot) continue;

        if (accountId) {
          if (lot.account_id !== accountId) continue;
        } else {
          if (!assetClasses.includes(lot.asset_class)) continue;
        }

        const gain = event.units_consumed * (event.sale_price_paise - lot.purchase_price_paise);
        totalGain += gain;
      }
      return Math.round(totalGain);
    },
    [accountId, assetClasses]
  );

  async function toggleRecurringStatus(id: string, currentStatus: number) {
    try {
      await db.recurring_templates.update(id, {
        is_active: currentStatus === 1 ? 0 : 1,
        updated_at: Date.now()
      });
      toast(`SIP ${currentStatus === 1 ? 'paused' : 'resumed'}.`, 'success');
    } catch {
      toast('Failed to update SIP status.', 'error');
    }
  }

  async function deleteRecurringTemplate(id: string) {
    try {
      await db.recurring_templates.delete(id);
      toast('SIP deleted successfully.', 'success');
    } catch {
      toast('Failed to delete SIP.', 'error');
    }
  }

  const { totalValue, totalInvested, totalGain } = React.useMemo(() => {
    const list = portfolio ?? [];
    const val = list.reduce((s, p) => s + p.current_value_paise, 0);
    const inv = list.reduce((s, p) => s + p.total_invested_paise, 0);
    return {
      totalValue: val,
      totalInvested: inv,
      totalGain: val - inv,
    };
  }, [portfolio]);

  const portfolioXirr = React.useMemo(() => {
    if (!portfolio || portfolio.length === 0 || totalValue <= 0) return null;

    if (portfolio.length === 1 && portfolio[0].xirr !== null && portfolio[0].xirr !== undefined) {
      return portfolio[0].xirr;
    }

    if (allActiveLots && allActiveLots.length > 0) {
      const activeSymbols = new Set(portfolio.map(p => p.symbol.toUpperCase()));
      const matchingLots = allActiveLots.filter(l => {
        if (!activeSymbols.has(l.symbol.toUpperCase())) return false;
        if (effectiveAccountId && l.account_id !== effectiveAccountId) return false;
        return true;
      });

      if (matchingLots.length > 0) {
        const cashFlows = matchingLots.map(l => {
          const propFees = (l.units_original && l.units_original > 0)
            ? Math.round((l.fees_paise ?? 0) * (l.units_remaining / l.units_original))
            : 0;
          return {
            date: new Date(l.purchase_date),
            amount: -(l.units_remaining * l.purchase_price_paise + propFees),
          };
        });

        cashFlows.push({
          date: new Date(),
          amount: totalValue,
        });
        return calculateXIRR(cashFlows);
      }
    }
    return null;
  }, [portfolio, allActiveLots, effectiveAccountId, totalValue]);



  const portfolioWeightedChange = (() => {
    let totalVal = 0;
    let sumWeightChange = 0;
    for (const p of portfolio ?? []) {
      if (!p.raw_payload) continue;
      try {
        const payload = JSON.parse(p.raw_payload);
        const change = payload.regularMarketChangePercent;
        if (change !== undefined && change !== null) {
          sumWeightChange += change * p.current_value_paise;
          totalVal += p.current_value_paise;
        }
      } catch {
        // Ignore JSON parsing errors for malformed or custom raw_payload
      }
    }
    return totalVal > 0 ? sumWeightChange / totalVal : null;
  })();

  // Latest market data timestamp across all holdings — used in the Hero chip
  const latestNavDate: number | null = (portfolio ?? []).reduce<number | null>((best, p) => {
    if (p.nav_date === null || p.nav_date === undefined) return best;
    if (best === null) return p.nav_date;
    return p.nav_date > best ? p.nav_date : best;
  }, null);

  const location = useLocation();
  const navigate = useNavigate();

  // For account sub-pages: build breadcrumb trail
  // e.g. /investments/mutual_funds/acc123  →  Investments > Mutual Funds > <account name>
  const isMF = addLotAccountTypes?.includes('MF') || true;

  // Breadcrumbs suppressed on main MF/portfolio view to avoid text left of selector
  const breadcrumbs = undefined;

  // Sort portfolio
  const sortedPortfolio = React.useMemo(() => {
    return [...portfolio].sort((a, b) => {
      let comp = 0;
      if (sortField === 'symbol') comp = (a.name || a.symbol).localeCompare(b.name || b.symbol);
      else if (sortField === 'class') comp = (a.asset_class || '').localeCompare(b.asset_class || '');
      else if (sortField === 'units') comp = a.total_units - b.total_units;
      else if (sortField === 'avgCost') comp = a.avg_cost_paise - b.avg_cost_paise;
      else if (sortField === 'ltp') comp = a.current_price_paise - b.current_price_paise;
      else if (sortField === 'value') comp = a.current_value_paise - b.current_value_paise;
      else if (sortField === 'pnl') comp = a.unrealized_gain_paise - b.unrealized_gain_paise;
      return sortDirection === 'asc' ? comp : -comp;
    });
  }, [portfolio, sortField, sortDirection]);

  const showReturnsAndGraph = true;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Topbar
        breadcrumbs={breadcrumbs}
        title={title || 'Portfolio'}
        badge={undefined}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="btn btn-secondary btn-sm hide-mobile"
              onClick={() => setShowModal(true)}
              style={{ gap: 6 }}
              title="Add New MF Lot"
            >
              <Plus size={13} style={{ color: 'var(--accent, var(--green))' }} /> {addLotTitle ?? 'Add MF Lot'}
            </button>

            <AccountSelector />

            <button
              className="btn btn-ghost btn-icon btn-sm"
              onClick={() => setShowExportModal(true)}
              style={{ color: 'var(--text-secondary)', padding: '6px', height: 28, width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Export to CSV"
            >
              <Download size={13} />
            </button>
          </div>
        }
      />

      {/* Redesigned Hero matching Net Worth summary with accent color edge */}
      <div
        className="nw-hero"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 24,
          borderLeft: '4px solid var(--accent, var(--green))',
        }}
      >
        <div>
          {(() => {
            const currentAccount = activeAccount || selectedAccount;
            const accountPortfolioLabel = (selectedAccountId !== 'ALL' && currentAccount)
              ? `${currentAccount.name.toUpperCase()}'S PORTFOLIO VALUE`
              : "ALL PORTFOLIOS' PORTFOLIO VALUE";
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                {selectedAccountId !== 'ALL' && currentAccount && (
                  <AccountIcon icon={currentAccount.icon} size={13} color={currentAccount.color || 'var(--green)'} />
                )}
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                  {accountPortfolioLabel}
                </span>
              </div>
            );
          })()}

          <Amt paise={totalValue} size="xl" compact style={{ letterSpacing: -1 }} />

          {/* Prominent NAV update status in Overview */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'var(--surface-2)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 20,
                padding: '4px 10px',
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: isRefreshing
                    ? 'var(--orange)'
                    : formattedUpdatedOn
                    ? 'var(--green)'
                    : 'var(--text-tertiary)',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>
                {isRefreshing
                  ? 'NAV (₹) updating…'
                  : formattedUpdatedOn
                  ? `NAV (₹) updated on ${formattedUpdatedOn}`
                  : 'NAV (₹) pending update'}
              </span>
              {isRefreshing && (
                <Loader2 size={11} style={{ animation: 'spin 1s linear infinite', color: 'var(--green)' }} />
              )}
            </div>
          </div>
        </div>

        {showReturnsAndGraph && (
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              Portfolio Returns
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: totalGain >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>
              {totalGain >= 0 ? '+' : ''}{totalInvested > 0 ? ((totalGain / totalInvested) * 100).toFixed(2) : '0.00'}% <span style={{ fontSize: 14, fontWeight: 600 }}>Abs</span>
            </div>
            {(() => {
              if (portfolioXirr === null || portfolioXirr === undefined) return null;
              const totalXirrPct = (portfolioXirr * 100).toFixed(2);
              if (Math.abs(parseFloat(totalXirrPct)) < 0.01) return null;
              return (
                <div style={{ fontSize: 13, fontWeight: 600, color: parseFloat(totalXirrPct) >= 0 ? 'var(--green)' : 'var(--red)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>{parseFloat(totalXirrPct) >= 0 ? '▲' : '▼'}</span>
                  <span>{totalXirrPct}% XIRR</span>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Redesigned Stats grid matching Net Worth summary */}
      <div
        className="nw-stats-grid"
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          gridTemplateColumns: addLotAccountTypes?.includes('MF') ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)'
        }}
      >
        <div className="nw-stat">
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 8 }}>Total Invested</div>
          <Amt paise={totalInvested} compact size="md" />
        </div>
        <div className="nw-stat">
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 8 }}>Current Value</div>
          <Amt paise={totalValue} compact size="md" />
        </div>
        <div className="nw-stat" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 8 }}>Profit & Loss</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Unrealised</span>
              <Amt paise={totalGain} compact size="md" positive={totalGain >= 0} negative={totalGain < 0} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderTop: '1px dashed var(--border-subtle)', paddingTop: 6 }}>
              <span style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Realised ({currentFY().label.replace('FY ', 'FY: ')})</span>
              <Amt paise={realizedPlForFy ?? 0} compact size="sm" positive={(realizedPlForFy ?? 0) >= 0} negative={(realizedPlForFy ?? 0) < 0} />
            </div>
          </div>
        </div>
        {(addLotAccountTypes?.includes('MF') || activeAccount?.type === 'MF') && (
          <div className="nw-stat">
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 8 }}>Monthly SIP Amount</div>
            {(() => {
              const seenSipSymbols = new Set<string>();
              let totalMonthlyPaise = 0;
              let activeCount = 0;

              // 1. Sum detected active SIPs from holdings in the current portfolio view
              for (const p of portfolio ?? []) {
                const sym = p.symbol.toUpperCase();
                const sipInfo = activeSipBySymbol.get(sym);
                if (sipInfo && sipInfo.status === 'ACTIVE') {
                  seenSipSymbols.add(sym);
                  totalMonthlyPaise += sipInfo.monthlyPaise;
                  activeCount++;
                }
              }

              // 2. Also include any active recurring templates not already matched to an active holding symbol
              for (const t of recurringTemplates ?? []) {
                if (t.is_active === 1) {
                  const tSym = t.name.replace(/ SIP$/i, '').trim().toUpperCase();
                  if (!seenSipSymbols.has(tSym)) {
                    let monthlyAmount = t.amount_paise;
                    if (t.frequency === 'WEEKLY') {
                      monthlyAmount = Math.round(t.amount_paise * 52 / 12);
                    } else if (t.frequency === 'QUARTERLY') {
                      monthlyAmount = Math.round(t.amount_paise / 3);
                    } else if (t.frequency === 'YEARLY') {
                      monthlyAmount = Math.round(t.amount_paise / 12);
                    }
                    totalMonthlyPaise += monthlyAmount;
                    activeCount++;
                  }
                }
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Amt paise={totalMonthlyPaise} compact size="md" />
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 500 }}>
                    {activeCount} active {activeCount === 1 ? 'SIP' : 'SIPs'}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Line bar graph showing MF allocation by class */}
      {showReturnsAndGraph && totalValue > 0 && (
        (() => {
          const groupMap = new Map<string, { label: string; value: number }>();

          (portfolio ?? []).forEach(p => {
            const current = groupMap.get(p.asset_class) ?? { label: MF_LABELS[p.asset_class] || p.asset_class, value: 0 };
            groupMap.set(p.asset_class, {
              label: current.label,
              value: current.value + p.current_value_paise
            });
          });

          const CLASS_COLORS: Record<string, string> = {
            EQUITY_MF: 'var(--blue)',
            INDEX_MF: 'var(--green)',
            DEBT_MF: 'var(--orange)',
            LIQUID_MF: '#00BCD4',
            GOLD_MF: '#FFD700',
          };

          const displaySegments = Array.from(groupMap.entries())
            .map(([key, item]) => ({
              key,
              label: item.label,
              value: item.value,
              pct: totalValue > 0 ? (item.value / totalValue) * 100 : 0,
              color: CLASS_COLORS[key] || 'var(--purple)'
            }))
            .filter(s => s.value > 0)
          if (displaySegments.length === 0) return null;

          return (
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-1)' }}>
              <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
                {displaySegments.map(seg => (
                  <div
                    key={seg.key}
                    title={`${seg.label}: ${seg.pct.toFixed(2)}%`}
                    style={{
                      width: `${seg.pct}%`,
                      background: seg.color,
                      transition: 'width 0.4s ease',
                      minWidth: 2,
                    }}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: 10 }}>
                {displaySegments.map(seg => (
                  <div key={seg.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-tertiary)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: seg.color }} />
                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{seg.label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                      {seg.pct.toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()
      )}

      {/* Category Stats Cards & Pills */}
      {addLotAccountTypes?.includes('MF') && (portfolio ?? []).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Stats Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 12,
            padding: '16px 24px 6px',
          }}>
            {[
              { id: 'EQUITY_MF', name: 'Equity MF' },
              { id: 'INDEX_MF', name: 'Index Fund' },
              { id: 'DEBT_MF', name: 'Debt MF' },
              { id: 'LIQUID_MF', name: 'Liquid MF' },
              { id: 'GOLD_MF', name: 'Gold MF' },
            ].map(cat => {
              const catHoldings = (portfolio ?? []).filter(p => p.asset_class === cat.id);
              if (catHoldings.length === 0) return null;

              const catValue = catHoldings.reduce((sum, p) => sum + p.current_value_paise, 0);
              const catInvested = catHoldings.reduce((sum, p) => sum + p.total_invested_paise, 0);
              const catGain = catValue - catInvested;
              const catGainPct = catInvested > 0 ? (catGain / catInvested) * 100 : 0;

              const validXirrHoldings = catHoldings.filter(p => p.xirr !== null && p.xirr !== undefined);
              const totalValForXirr = validXirrHoldings.reduce((sum, p) => sum + p.current_value_paise, 0);
              const catXirr = totalValForXirr > 0
                ? validXirrHoldings.reduce((sum, p) => sum + (p.xirr ?? 0) * p.current_value_paise, 0) / totalValForXirr
                : null;

              const isSelected = selectedType === cat.id;

              return (
                <div
                  key={cat.id}
                  onClick={() => setSelectedType(isSelected ? 'ALL' : cat.id)}
                  style={{
                    background: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'var(--surface-2)',
                    border: isSelected ? '1px solid var(--blue)' : '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '12px 16px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 0 8px rgba(59, 130, 246, 0.15)' : 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{cat.name}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
                      {formatINR(catValue, { compact: true })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, fontSize: 10 }}>
                    <div style={{ color: catGain >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 650 }}>
                      {catGain >= 0 ? '+' : ''}{catGainPct.toFixed(2)}% Abs
                    </div>
                    {catXirr !== null && (
                      <div style={{ color: catXirr >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <span>{catXirr >= 0 ? '▲' : '▼'}</span>
                        <span>{(catXirr * 100).toFixed(2)}% XIRR</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'flex', gap: 8, padding: '0 24px 12px', overflowX: 'auto', scrollbarWidth: 'none', borderBottom: '1px solid var(--border-subtle)' }}>
            <button
              className={`btn btn-xs ${selectedType === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSelectedType('ALL')}
              style={{ borderRadius: 16, fontSize: 10, padding: '4px 12px' }}
            >
              All Funds
            </button>
            {[
              { id: 'EQUITY_MF', name: 'Equity MF' },
              { id: 'INDEX_MF', name: 'Index Fund' },
              { id: 'DEBT_MF', name: 'Debt MF' },
              { id: 'LIQUID_MF', name: 'Liquid MF' },
              { id: 'GOLD_MF', name: 'Gold MF' },
            ].map(cat => {
               const hasLots = (portfolio ?? []).some(p => p.asset_class === cat.id);
              if (!hasLots) return null;
              return (
                <button
                  key={cat.id}
                  className={`btn btn-xs ${selectedType === cat.id ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSelectedType(cat.id)}
                  style={{ borderRadius: 16, fontSize: 10, padding: '4px 12px' }}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'recurring' && accountId && !addLotAccountTypes?.includes('MF') ? (
        /* SIP Schedules List Section */
        <div className="page" style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {!recurringTemplates || recurringTemplates.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 0' }}>
              <TrendingUp size={40} style={{ opacity: 0.3, color: 'var(--purple)' }} />
              <div className="empty-title">No SIP schedules yet</div>
              <p className="empty-desc">Set up a recurring systematic investment plan (SIP) for this portfolio.</p>
              <div className="flex justify-center mt-4">
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                  <Plus size={14} /> Record new SIP
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {recurringTemplates.map(t => {
                const toName = allAccounts?.find(a => a.id === t.to_account_id)?.name ?? 'MF Portfolio';
                const isActive = t.is_active === 1;
                return (
                  <div
                    key={t.id}
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-lg)',
                      padding: '16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 16
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{t.name}</span>
                        <span className={`badge ${isActive ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: 9, padding: '2px 6px' }}>
                          {isActive ? 'Active' : 'Paused'}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                        Portfolio: <strong style={{ color: 'var(--text-primary)' }}>{toName}</strong>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                        Frequency: {t.frequency} | Next Due: {formatDate(t.next_execution)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>SIP Amount</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                          {formatINR(t.amount_paise)}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 6, borderLeft: '1px solid var(--border-subtle)', paddingLeft: 12 }}>
                        <button
                          className={`btn btn-xs ${isActive ? 'btn-secondary' : 'btn-primary'}`}
                          onClick={() => toggleRecurringStatus(t.id, t.is_active)}
                          style={{ fontSize: 11, padding: '4px 8px' }}
                        >
                          {isActive ? 'Pause' : 'Resume'}
                        </button>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => deleteRecurringTemplate(t.id)}
                          style={{ color: 'var(--red)' }}
                          title="Cancel SIP"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Holdings Table (shows portfolio list and optionally SIP schedules in place) */
        <div className="page" style={{ flex: 1, overflowY: 'auto' }}>
          {!(portfolio ?? []).length && (!recurringTemplates?.length || activeTab === 'holdings') ? (
            <div className="empty-state" style={{ maxWidth: 540, margin: '48px auto', padding: '40px 24px', textAlign: 'center' }}>
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 27,
                  background: 'rgba(5, 150, 105, 0.12)',
                  color: 'var(--green)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px auto',
                }}
              >
                <TrendingUp size={26} />
              </div>
              <div className="empty-title" style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                Import your mutual fund data
              </div>
              <p className="empty-desc" style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 440, margin: '0 auto 24px auto' }}>
                Import your Consolidated Account Statement (CAS from CAMS / KFintech) or record individual lots to start tracking your mutual fund portfolio with zero broker lock-in.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Left: Add MF Lot button */}
                <button
                  id="empty-state-add-mf-lot-btn"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(true)}
                  style={{ gap: 8, padding: '10px 20px', borderRadius: 20, fontWeight: 600 }}
                >
                  <Plus size={15} /> Add MF Lot
                </button>

                {/* Right: Personal data importer button */}
                <button
                  id="empty-state-import-statement-btn"
                  className="btn btn-primary"
                  onClick={() => setShowImportCSVModal(true)}
                  style={{
                    gap: 8,
                    padding: '10px 22px',
                    borderRadius: 20,
                    fontWeight: 700,
                    boxShadow: 'var(--shadow-glow-accent, 0 2px 8px rgba(5, 150, 105, 0.25))',
                  }}
                >
                  <Download size={15} style={{ transform: 'rotate(180deg)' }} /> Import Statement (CAS / CSV / Excel)
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <SortableHeader field="symbol" label={isMF ? 'Fund Name' : 'Symbol / Fund'} currentSortBy={sortField} currentSortOrder={sortDirection} onSort={handleSort} />
                    <SortableHeader field="units" label="Units" align="right" currentSortBy={sortField} currentSortOrder={sortDirection} onSort={handleSort} className="r" />
                    <SortableHeader field="avgCost" label="Avg Cost" align="right" currentSortBy={sortField} currentSortOrder={sortDirection} onSort={handleSort} className="r" />
                    <SortableHeader field="ltp" label={isMF ? 'NAV' : 'LTP'} align="right" currentSortBy={sortField} currentSortOrder={sortDirection} onSort={handleSort} className="r" />
                    <SortableHeader field="value" label="Value" align="right" currentSortBy={sortField} currentSortOrder={sortDirection} onSort={handleSort} className="r" />
                    <SortableHeader field="pnl" label="P&L" align="right" currentSortBy={sortField} currentSortOrder={sortDirection} onSort={handleSort} className="r" />
                  </tr>
                </thead>
                <tbody>
                  {addLotAccountTypes?.includes('MF') ? (
                    (() => {
                      const getSipAssetClass = (t: RecurringTemplate, holdings: any[]) => {
                        if (t.asset_class) return t.asset_class;
                        const sipSymbol = t.name.replace(/ SIP$/i, '').trim().toUpperCase();
                        const match = holdings.find(p => p.symbol.toUpperCase() === sipSymbol);
                        if (match) return match.asset_class;
                        return 'EQUITY_MF';
                      };

                      const filteredPortfolio = sortedPortfolio.filter(p => {
                        if (selectedType === 'ALL') return true;
                        return p.asset_class === selectedType;
                      });

                      const filteredSips = (recurringTemplates ?? []).filter(t => {
                        if (selectedType === 'ALL') return true;
                        return getSipAssetClass(t, portfolio ?? []) === selectedType;
                      });

                      const getSipSymbol = (t: RecurringTemplate) => {
                        return t.name.replace(/ SIP$/i, '').trim().toUpperCase();
                      };

                      const matchedSipIds = new Set<string>();
                      filteredPortfolio.forEach(p => {
                        const symbolUpper = p.symbol.toUpperCase();
                        filteredSips.forEach(t => {
                          if (getSipSymbol(t) === symbolUpper) {
                            matchedSipIds.add(t.id);
                          }
                        });
                      });

                      const standaloneSips = filteredSips.filter(t => !matchedSipIds.has(t.id));

                      return (
                        <>
                          {filteredPortfolio.map(p => {
                            const pct = p.total_invested_paise > 0 ? ((p.unrealized_gain_paise / p.total_invested_paise) * 100).toFixed(2) : '0.00';
                            const symbolUpper = p.symbol.toUpperCase();
                            const matchingSips = filteredSips.filter(t => getSipSymbol(t) === symbolUpper);

                            return (
                              <tr key={`holding-${p.symbol}`} onClick={() => setSelectedSymbol(p.symbol)} style={{ cursor: 'pointer' }} title="Click to view and edit individual purchase lots">
                                 <td>
                                  <div className="truncate" style={{ fontWeight: 500, fontSize: 13, color: 'var(--blue)', maxWidth: 280 }}>{p.name}</div>
                                  <div className="td-dim" style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start', marginTop: 2 }}>
                                    <span style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                      <span>
                                        {(() => {
                                          const isAmfi = p.symbol.toUpperCase().startsWith('AMFI:');
                                          const amfiCode = p.symbol.replace(/^AMFI:/i, '');
                                          const planOpt = [
                                            p.mf_plan ? (p.mf_plan === 'DIRECT' ? 'Direct' : 'Regular') : null,
                                            p.mf_option ? (p.mf_option === 'GROWTH' ? 'Growth' : 'IDCW') : null,
                                          ].filter(Boolean).join(' · ');

                                          if (isAmfi) {
                                            return `AMFI: ${amfiCode}${planOpt ? ` | ${planOpt}` : ''}`;
                                          }
                                          return `${p.symbol}${planOpt ? ` | ${planOpt}` : ''}`;
                                        })()}
                                      </span>
                                      {p.goal_tag && (() => {
                                        const theme = getGoalTagTheme(p.goal_tag);
                                        return (
                                          <span
                                            style={{
                                              fontSize: 9,
                                              fontWeight: 600,
                                              padding: '1px 6px',
                                              borderRadius: 'var(--radius)',
                                              background: theme.bg,
                                              color: theme.color,
                                              border: `1px solid ${theme.border}`,
                                              whiteSpace: 'nowrap',
                                              lineHeight: 1.2,
                                            }}
                                            title={`Target Goal: ${p.goal_tag}`}
                                          >
                                            {p.goal_tag}
                                          </span>
                                        );
                                      })()}
                                    </span>
                                    {matchingSips.map(t => {
                                      const isActive = t.is_active === 1;
                                      const formatSipPillDate = (timestamp: number) => {
                                        const d = new Date(timestamp);
                                        const dd = String(d.getDate()).padStart(2, '0');
                                        const mm = String(d.getMonth() + 1).padStart(2, '0');
                                        const yy = String(d.getFullYear()).slice(-2);
                                        return `${dd}-${mm}-${yy}`;
                                      };
                                      const freqLabel = t.frequency.charAt(0) + t.frequency.slice(1).toLowerCase();
                                      const pillText = `SIP: ${formatINR(t.amount_paise)} · ${freqLabel} · Due: ${formatSipPillDate(t.next_execution)}`;
                                      return (
                                        <span
                                          key={t.id}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedSipId(t.id);
                                          }}
                                          className={`badge ${isActive ? 'badge-purple' : 'badge-orange'}`}
                                          style={{
                                            fontSize: 9,
                                            padding: '2px 6px',
                                            cursor: 'pointer',
                                            opacity: isActive ? 1 : 0.75,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                          }}
                                          title="Click to view details & transactions"
                                        >
                                          {pillText}
                                        </span>
                                      );
                                    })}
                                    {matchingSips.length === 0 && (() => {
                                      const detectedSip = activeSipBySymbol.get(symbolUpper);
                                      if (!detectedSip) return null;
                                      const sipBadgeClass = detectedSip.status === 'ACTIVE'
                                        ? 'badge-purple'
                                        : detectedSip.status === 'PAUSED'
                                        ? 'badge-orange'
                                        : 'badge-gray';

                                      return (
                                        <span
                                          className={`badge ${sipBadgeClass}`}
                                          style={{
                                            fontSize: 9,
                                            padding: '2px 6px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            opacity: detectedSip.status === 'COMPLETED' ? 0.65 : 1,
                                          }}
                                          title={
                                            detectedSip.status === 'ACTIVE'
                                              ? 'Active recurring SIP detected from investment history'
                                              : detectedSip.status === 'PAUSED'
                                              ? 'SIP paused / missed recent installment'
                                              : 'SIP completed'
                                          }
                                        >
                                          <span>{detectedSip.label}</span>
                                        </span>
                                      );
                                    })()}
                                  </div>
                                </td>
                                <td className="r td-num">{p.total_units.toFixed(3)}</td>
                                <td className="r td-num">{formatINR(p.avg_cost_paise, { decimals: isMF ? 3 : 2 })}</td>
                                <td className="r td-num">{formatINR(p.current_price_paise, { decimals: isMF ? 3 : 2 })}</td>
                                <td className="r td-num" style={{ fontWeight: 500 }}>{formatINR(p.current_value_paise, { decimals: 2 })}</td>
                                <td className="r">
                                  <div className={`td-num ${p.unrealized_gain_paise >= 0 ? 'positive' : 'negative'}`} style={{ fontSize: 12 }}>
                                    {p.unrealized_gain_paise >= 0 ? '+' : ''}{formatINR(p.unrealized_gain_paise, { decimals: 2 })}
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, marginTop: 2 }}>
                                    <div className="num" style={{ fontSize: 10, color: parseFloat(pct) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                      {parseFloat(pct) >= 0 ? '+' : ''}{pct}% Abs
                                    </div>
                                    {/* XIRR removed from table rows — visible in fund modal only */}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          {standaloneSips.map(t => {
                            const isActive = t.is_active === 1;
                            const formatSipPillDate = (timestamp: number) => {
                              const d = new Date(timestamp);
                              const dd = String(d.getDate()).padStart(2, '0');
                              const mm = String(d.getMonth() + 1).padStart(2, '0');
                              const yy = String(d.getFullYear()).slice(-2);
                              return `${dd}-${mm}-${yy}`;
                            };
                            const freqLabel = t.frequency.charAt(0) + t.frequency.slice(1).toLowerCase();
                            const pillText = `${freqLabel}, Due: ${formatSipPillDate(t.next_execution)}`;

                            return (
                              <tr
                                key={`sip-${t.id}`}
                                style={{ opacity: isActive ? 1 : 0.65, borderLeft: '3px solid var(--purple)', cursor: 'pointer' }}
                                onClick={() => setSelectedSipId(t.id)}
                                title="Click to view details & transactions"
                              >
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 600, fontSize: 13, color: isActive ? 'var(--purple)' : 'var(--text-tertiary)', textDecoration: isActive ? 'none' : 'line-through' }}>{t.name}</span>
                                    <span className={`badge ${isActive ? 'badge-purple' : 'badge-gray'}`} style={{ fontSize: 9, padding: '2px 6px', opacity: isActive ? 1 : 0.65 }}>{pillText}</span>
                                  </div>
                                  <div className="td-dim truncate" style={{ maxWidth: 220 }}>{t.description || 'Systematic Investment Plan'}</div>
                                </td>
                                <td className="r td-num" style={{ color: 'var(--text-tertiary)' }}>-</td>
                                <td className="r td-num" style={{ color: 'var(--text-tertiary)' }}>-</td>
                                <td className="r td-num" style={{ color: 'var(--text-tertiary)' }}>-</td>
                                <td className="r td-num" style={{ color: 'var(--text-tertiary)' }}>-</td>
                                <td className="r td-num" style={{ color: 'var(--text-tertiary)' }}>-</td>
                              </tr>
                            );
                          })}
                        </>
                      );
                    })()
                  ) : (
                    <>
                      {sortedPortfolio.map(p => {
                        const pct = p.total_invested_paise > 0 ? ((p.unrealized_gain_paise / p.total_invested_paise) * 100).toFixed(2) : '0.00';
                        return (
                          <tr key={p.symbol} onClick={() => setSelectedSymbol(p.symbol)} style={{ cursor: 'pointer' }} title="Click to view and edit individual purchase lots">
                            <td>
                              <div className="truncate" style={{ fontWeight: 500, fontSize: 13, color: 'var(--blue)', maxWidth: 200 }}>{p.name}</div>
                              <div className="td-dim">{p.symbol}</div>
                            </td>
                            <td className="r td-num">{p.total_units.toFixed(3)}</td>
                            <td className="r td-num">{formatINR(p.avg_cost_paise, { decimals: isMF ? 3 : 2 })}</td>
                            <td className="r">
                              <div>{formatINR(p.current_price_paise, { decimals: isMF ? 3 : 2 })}</div>
                              {(() => {
                                try {
                                  const payload = p.raw_payload ? JSON.parse(p.raw_payload) : null;
                                  const change = payload?.regularMarketChangePercent;
                                  if (change === undefined || change === null) return null;
                                  const isPos = change >= 0;
                                  return (
                                    <div style={{ fontSize: 9, color: isPos ? 'var(--green)' : 'var(--red)', fontWeight: 600, marginTop: 2 }}>
                                      {isPos ? '+' : ''}{change.toFixed(2)}%
                                    </div>
                                  );
                                } catch {
                                  return null;
                                }
                              })()}
                            </td>
                            <td className="r td-num" style={{ fontWeight: 500 }}>{formatINR(p.current_value_paise, { decimals: 2 })}</td>
                            <td className="r">
                              <div className={`td-num ${p.unrealized_gain_paise >= 0 ? 'positive' : 'negative'}`} style={{ fontSize: 12 }}>
                                {p.unrealized_gain_paise >= 0 ? '+' : ''}{formatINR(p.unrealized_gain_paise, { decimals: 2 })}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, marginTop: 2 }}>
                                <div className="num" style={{ fontSize: 10, color: parseFloat(pct) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                  {parseFloat(pct) >= 0 ? '+' : ''}{pct}% Abs
                                </div>
                                {/* XIRR removed from table rows — visible in fund modal only */}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  )}
                </tbody>
              </table>
            </div>

            {/* ─── CLOSED / ARCHIVED HOLDINGS SECTION (Right Below Active Table) ──── */}
            {archivedHoldings && archivedHoldings.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowArchived(prev => !prev)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                    }}
                  >
                    <ChevronDown size={13} style={{ transform: showArchived ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                    <span>Closed / Archived Holdings</span>
                    <span className="badge badge-gray" style={{ fontSize: 9, padding: '1px 5px' }}>
                      {archivedHoldings.length}
                    </span>
                  </button>
                </div>

                {showArchived && (
                  <div className="table-wrap" style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', background: 'var(--surface)' }}>
                    <table className="compact-table" style={{ width: '100%' }}>
                      <thead>
                        <tr style={{ background: 'var(--surface-2)' }}>
                          <th>Scheme Name</th>
                          <th className="r">Total Invested</th>
                          <th className="r">Came Out (Withdrawn)</th>
                          <th className="r">Realized P&L</th>
                          <th className="c">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {archivedHoldings.map(h => {
                          const retPct = h.totalInvestedPaise > 0 ? (h.realizedPlPaise / h.totalInvestedPaise) * 100 : 0;
                          return (
                            <tr
                              key={h.symbol}
                              onClick={() => setSelectedSymbol(h.symbol)}
                              style={{ cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)' }}
                              title="Click to view full trade history and stats"
                            >
                              <td>
                                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--blue)' }}>
                                  {h.name}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{h.symbol}</div>
                              </td>
                              <td className="r num td-dim" style={{ fontSize: 12 }}>
                                {formatINR(h.totalInvestedPaise, { decimals: 2 })}
                              </td>
                              <td className="r num" style={{ fontSize: 12, fontWeight: 500 }}>
                                {formatINR(h.totalWithdrawnPaise, { decimals: 2 })}
                              </td>
                              <td className="r num" style={{ fontSize: 12, fontWeight: 600 }}>
                                <span className={h.realizedPlPaise >= 0 ? 'positive' : 'negative'}>
                                  {h.realizedPlPaise >= 0 ? '+' : ''}{formatINR(h.realizedPlPaise, { decimals: 2 })} ({retPct.toFixed(2)}%)
                                </span>
                              </td>
                              <td className="c" style={{ fontSize: 11 }}>
                                <span className="badge badge-gray" style={{ fontSize: 9, padding: '2px 6px', opacity: 0.85 }}>
                                  Closed
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            </>
          )}
        </div>
      )}

      {showModal && <AddLotModal onClose={() => setShowModal(false)} defaultClass={defaultClass} allowedClasses={allowedClasses} title={addLotTitle} accountTypes={addLotAccountTypes} accountId={accountId} />}
      {selectedSymbol && <AssetLotsModal symbol={selectedSymbol} onClose={() => setSelectedSymbol(null)} />}
      {selectedSipId && <SIPDetailsModal sipId={selectedSipId} onClose={() => setSelectedSipId(null)} />}
      {editAccount && <EditAccountModal account={editAccount} onClose={() => setEditAccount(null)} />}
      {showExportModal && <ExportCSVModal onClose={() => setShowExportModal(false)} accountId={accountId} accountName={activeAccount?.name} />}
      {showImportCSVModal && (
        <React.Suspense fallback={null}>
          <ImportCSVModal
            onClose={() => setShowImportCSVModal(false)}
            defaultAccountId={accountId}
          />
        </React.Suspense>
      )}
    </div>
  );
}
