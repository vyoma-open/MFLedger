import React, { useState } from 'react';
import { X, Pencil, Trash2, Repeat } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import type { InvestmentLot } from '@/db/schema';
import { useToast } from '@/contexts/ToastContext';
import { formatINR } from '@/utils/currency';
import { calculateXIRR } from '@/utils/xirr';
import { formatDate } from '@/utils/fiscalYear';
import { holdingMonths, formatRelativeTime } from '@/utils/fiscalYear';
import { getDefaultHoldingMonths } from '@/engines/tax';
import { ConfirmModal } from '@/components/ConfirmModal';
import { getGoalTagTheme } from '@/utils/goalColors';
import { SortableHeader } from '@/components/ui/SortableHeader';
import { EditLotModal } from './EditLotModal';
import { EditAssetModal } from './EditAssetModal';
import { deleteSale, updateLotInvestmentType } from '@/engines/fifo';
import { analyzeSipStreams, detectSipPattern } from '@/engines/sipDetector';

interface AssetLotsModalProps {
  symbol: string;
  onClose: () => void;
}

export function AssetLotsModal({ symbol, onClose }: AssetLotsModalProps) {
  const { toast } = useToast();
  const now = React.useMemo(() => Date.now(), []);
  const [selectedLot, setSelectedLot] = useState<InvestmentLot | null>(null);
  const [deleteLotId, setDeleteLotId] = useState<string | null>(null);
  const [deleteSaleEventIds, setDeleteSaleEventIds] = useState<string[] | null>(null);
  const [showEditAsset, setShowEditAsset] = useState(false);
  const [showDeleteAssetWarning, setShowDeleteAssetWarning] = useState(false);
  const [showSipBreakdown, setShowSipBreakdown] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'mode' | null>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>('desc');

  const data = useLiveQuery(async () => {
    const allLots = await db.investment_lots.where('symbol').equals(symbol).toArray();
    const activeLots = allLots.filter(l => l.status === 'ACTIVE' && l.units_remaining > 0);
    const lotIds = allLots.map(l => l.id);
    
    const consumptionEvents = lotIds.length > 0
      ? await db.lot_consumption_events.where('lot_id').anyOf(lotIds).toArray()
      : [];

    const cached = await db.market_cache.where('symbol').equals(symbol).toArray();
    cached.sort((a, b) => b.nav_date - a.nav_date);
    const currentPrice = cached[0]?.nav_paise ?? null;
    const navDate = cached[0]?.nav_date ?? null;
    const cacheCreatedAt = cached[0]?.created_at ?? null;
    
    // Resolve full name correctly: prioritize active lots descriptive name
    let name = allLots[0]?.name || symbol;
    if (name === symbol && cached[0]?.name && cached[0].name !== symbol) {
      name = cached[0].name;
    }
    const rawPayload = cached[0]?.raw_payload ?? null;
    
    return { allLots, activeLots, consumptionEvents, currentPrice, navDate, cacheCreatedAt, name, rawPayload };
  }, [symbol]);

  const allLots = data?.allLots ?? [];
  const lots = data?.activeLots ?? [];
  const consumptionEvents = data?.consumptionEvents ?? [];
  const currentPrice = data?.currentPrice;
  const displayName = data?.name ?? symbol;

  const history = React.useMemo(() => {
    if (!data) return [];
    
    const buyTrades = allLots.map(l => ({
      id: l.id,
      type: 'BUY' as const,
      date: l.purchase_date,
      units: l.units_original,
      price_paise: l.purchase_price_paise,
      fees_paise: l.fees_paise,
      total_paise: Math.round(l.units_original * l.purchase_price_paise) + l.fees_paise,
      units_remaining: l.units_remaining,
      lot_status: l.status,
      asset_class: l.asset_class,
      lot: l,
    }));

    const sellGroups = new Map<string, {
      date: number;
      price_paise: number;
      units: number;
      eventIds: string[];
    }>();

    for (const ev of consumptionEvents) {
      const key = `${ev.created_at}_${ev.sale_price_paise}`;
      const existing = sellGroups.get(key);
      if (existing) {
        existing.units += ev.units_consumed;
        existing.eventIds.push(ev.id);
      } else {
        sellGroups.set(key, {
          date: ev.created_at,
          price_paise: ev.sale_price_paise,
          units: ev.units_consumed,
          eventIds: [ev.id],
        });
      }
    }

    const sellTrades = Array.from(sellGroups.entries()).map(([key, g]) => ({
      id: key,
      type: 'SELL' as const,
      date: g.date,
      units: g.units,
      price_paise: g.price_paise,
      fees_paise: 0,
      total_paise: Math.round(g.units * g.price_paise),
      eventIds: g.eventIds,
    }));

    return [...buyTrades, ...sellTrades].sort((a, b) => b.date - a.date);
  }, [data, allLots, consumptionEvents]);



  const realizedGain = React.useMemo(() => {
    if (!data) return 0;
    return consumptionEvents.reduce((sum, ev) => {
      const lot = allLots.find(l => l.id === ev.lot_id);
      if (!lot) return sum;
      return sum + ev.units_consumed * (ev.sale_price_paise - lot.purchase_price_paise);
    }, 0);
  }, [data, allLots, consumptionEvents]);

  const taxRules = useLiveQuery(() => db.tax_rules.toArray(), []);

  async function handleDeleteConfirm() {
    if (!deleteLotId) return;
    try {
      await db.investment_lots.delete(deleteLotId);
      toast('Lot deleted successfully.', 'success');
    } catch (err) {
      toast('Failed to delete lot.', 'error');
    }
    setDeleteLotId(null);
  }

  async function handleDeleteSaleConfirm() {
    if (!deleteSaleEventIds) return;
    try {
      await deleteSale(deleteSaleEventIds);
      toast('Sale transaction deleted successfully.', 'success');
    } catch (err) {
      toast('Failed to delete sale transaction.', 'error');
    }
    setDeleteSaleEventIds(null);
  }

  async function handleDeleteAssetAllData() {
    try {
      const allMatchingLots = await db.investment_lots.where('symbol').equals(symbol).toArray();
      const lotIds = allMatchingLots.map(l => l.id);
      
      await db.transaction('rw', [db.investment_lots, db.lot_consumption_events, db.market_cache], async () => {
        if (lotIds.length > 0) {
          await db.investment_lots.bulkDelete(lotIds);
          
          // Delete related consumption events
          const relatedEvents = await db.lot_consumption_events.where('lot_id').anyOf(lotIds).toArray();
          const eventIds = relatedEvents.map(e => e.id);
          if (eventIds.length > 0) {
            await db.lot_consumption_events.bulkDelete(eventIds);
          }
        }
        
        // Also delete from market cache
        await db.market_cache.where('symbol').equals(symbol).delete();
      });
      
      toast('Asset and all associated data deleted successfully.', 'success');
      setShowDeleteAssetWarning(false);
      onClose();
    } catch (err) {
      toast('Failed to delete asset data.', 'error');
    }
  }

  // Summary computations
  const unitsRemaining = lots.reduce((sum, l) => sum + l.units_remaining, 0);
  const totalInvestedValue = lots.reduce((sum, l) => sum + (l.units_remaining * l.purchase_price_paise), 0);
  const averageCost = unitsRemaining > 0 ? totalInvestedValue / unitsRemaining : 0;
  const resolvedCurrentPrice = currentPrice ?? averageCost;
  const currentValue = unitsRemaining * resolvedCurrentPrice;
  const totalGain = currentValue - totalInvestedValue;
  const totalGainPercent = totalInvestedValue > 0 ? (totalGain / totalInvestedValue) * 100 : 0;

  // Closed / Archived Holding calculations
  const isClosedAsset = unitsRemaining <= 0 && allLots.length > 0;
  const closedTotalInvested = allLots.reduce((s, l) => s + Math.round(l.units_original * l.purchase_price_paise), 0);
  const closedTotalWithdrawn = consumptionEvents.reduce((s, ev) => s + Math.round(ev.units_consumed * ev.sale_price_paise), 0);
  const closedRealizedGain = closedTotalWithdrawn - closedTotalInvested;
  const closedGainPercent = closedTotalInvested > 0 ? (closedRealizedGain / closedTotalInvested) * 100 : 0;

  // Parse 52-week High/Low
  let lowPrice: number | null = null;
  let highPrice: number | null = null;
  if (data?.rawPayload) {
    try {
      const payload = JSON.parse(data.rawPayload);
      if (payload.fiftyTwoWeekLow !== undefined && payload.fiftyTwoWeekLow !== null) {
        lowPrice = Math.round(payload.fiftyTwoWeekLow * 100);
      }
      if (payload.fiftyTwoWeekHigh !== undefined && payload.fiftyTwoWeekHigh !== null) {
        highPrice = Math.round(payload.fiftyTwoWeekHigh * 100);
      }
    } catch {
      // Ignore parsing errors
    }
  }

  const xirr = (() => {
    if (lots.length === 0 || unitsRemaining <= 0) return null;
    const cashFlows = lots.map(l => {
      const propFees = l.units_original > 0
        ? Math.round((l.fees_paise ?? 0) * (l.units_remaining / l.units_original))
        : 0;
      return {
        date: new Date(l.purchase_date),
        amount: -(l.units_remaining * l.purchase_price_paise + propFees),
      };
    });
    cashFlows.push({
      date: new Date(),
      amount: unitsRemaining * resolvedCurrentPrice,
    });
    return calculateXIRR(cashFlows);
  })();

  const earliestLotDate = lots.reduce((min, l) => Math.min(min, l.purchase_date), Infinity);
  const holdingDays = isFinite(earliestLotDate)
    ? Math.max(0, Math.floor((Date.now() - earliestLotDate) / (24 * 60 * 60 * 1000)))
    : 0;
  const isHeldLessThanOneYear = holdingDays < 365;

  const recurringTemplates = useLiveQuery(
    () => db.recurring_templates.where('is_active').equals(1).toArray(),
    []
  );

  const matchingSip = recurringTemplates?.find(t => {
    const tName = t.name.toUpperCase();
    const sym = symbol.toUpperCase();
    const disp = (lots[0]?.name || '').toUpperCase();
    return (
      tName === sym ||
      tName === disp ||
      t.name.toUpperCase().includes(sym) ||
      (disp.length > 3 && t.name.toUpperCase().includes(disp)) ||
      (lots[0]?.account_id && t.to_account_id === lots[0].account_id)
    );
  });

  // Deep segregation of lots into SIP Stream vs BULK using pattern detection & lot tags
  const sipAnalytics = React.useMemo(() => {
    return analyzeSipStreams(allLots, resolvedCurrentPrice, now, matchingSip?.is_active === 1);
  }, [allLots, resolvedCurrentPrice, now, matchingSip]);

  const {
    hasSip,
    hasLumpSum,
  } = sipAnalytics;

  const detectedSipLotIds = React.useMemo(() => {
    return new Set(sipAnalytics.sipLots.map(l => l.id));
  }, [sipAnalytics.sipLots]);

  const orderedTranches = React.useMemo(() => {
    return [...sipAnalytics.tranches].sort((a, b) => (b.endDate || b.startDate) - (a.endDate || a.startDate));
  }, [sipAnalytics.tranches]);

  const isLotSip = React.useCallback((l?: InvestmentLot) => {
    if (!l) return false;
    if (l.investment_type === 'SIP') return true;
    if (l.investment_type === 'LUMPSUM') return false;
    return detectedSipLotIds.has(l.id);
  }, [detectedSipLotIds]);

  const handleSort = (field: 'date' | 'mode') => {
    if (sortBy === field) {
      if (sortOrder === 'asc') {
        setSortOrder('desc');
      } else if (sortOrder === 'desc') {
        setSortBy(null);
        setSortOrder(null);
      } else {
        setSortOrder('asc');
      }
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const sortedHistory = React.useMemo(() => {
    const list = [...history];
    if (!sortBy || !sortOrder) {
      list.sort((a, b) => b.date - a.date);
      return list;
    }
    if (sortBy === 'mode') {
      list.sort((a, b) => {
        const modeA = a.type === 'BUY' ? (isLotSip(a.lot) ? 'SIP' : 'BULK') : 'SELL';
        const modeB = b.type === 'BUY' ? (isLotSip(b.lot) ? 'SIP' : 'BULK') : 'SELL';
        const cmp = modeA.localeCompare(modeB);
        return sortOrder === 'asc' ? cmp : -cmp;
      });
    } else {
      list.sort((a, b) => (sortOrder === 'asc' ? a.date - b.date : b.date - a.date));
    }
    return list;
  }, [history, sortBy, sortOrder, isLotSip]);

  const displayHistory = React.useMemo(() => {
    if (!showSipBreakdown) return sortedHistory;
    return sortedHistory.filter(trade => trade.type === 'BUY' && isLotSip(trade.lot));
  }, [sortedHistory, showSipBreakdown, isLotSip]);

  async function handleAutoTagSips() {
    try {
      const candidates = allLots.map(l => ({
        id: l.id,
        date: l.purchase_date,
        amount_paise: Math.round(l.units_original * l.purchase_price_paise),
        symbol: l.symbol,
        description: l.name,
        transactionType: 'BUY' as const,
      }));
      const patternMap = detectSipPattern(candidates);
      let taggedCount = 0;
      for (const lot of allLots) {
        const detected = patternMap.get(lot.id);
        const newType: 'SIP' | 'LUMPSUM' = detected?.isSip ? 'SIP' : 'LUMPSUM';
        if (lot.investment_type !== newType) {
          await updateLotInvestmentType(lot.id, newType);
          taggedCount++;
        }
      }
      toast(`Auto-tagged ${taggedCount} purchase lots based on investment pattern.`, 'success');
    } catch {
      toast('Failed to auto-tag lots.', 'error');
    }
  }

  async function handleToggleLotType(lot: InvestmentLot) {
    const currentlySip = isLotSip(lot);
    const nextType: 'SIP' | 'LUMPSUM' = currentlySip ? 'LUMPSUM' : 'SIP';
    try {
      await updateLotInvestmentType(lot.id, nextType);
      toast(`Marked lot as ${nextType === 'SIP' ? '⚡️SIP installment' : '💰BULK purchase'}.`, 'success');
    } catch {
      toast('Failed to update lot type.', 'error');
    }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1000 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal slide-up" style={{ maxWidth: 880, width: '95%' }}>
        <div className="modal-header" style={{ marginBottom: 16 }}>
          <div>
            <h2 className="modal-title" style={{ fontSize: 16 }}>{displayName}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{symbol}</span>
              {(lots[0] || allLots[0]) && (
                <span className="badge badge-purple" style={{ fontSize: 9, padding: '2px 6px', lineHeight: 1 }}>
                  {(lots[0] || allLots[0]).asset_class.replace('_', ' ')}
                </span>
              )}
              {isClosedAsset && (
                <span className="badge badge-gray" style={{ fontSize: 9, padding: '2px 6px', lineHeight: 1, opacity: 0.85 }}>
                  Archived / Closed
                </span>
              )}
              {(() => {
                const gTag = allLots.find(l => l.goal_tag)?.goal_tag;
                if (!gTag) return null;
                const theme = getGoalTagTheme(gTag);
                return (
                  <span style={{
                    fontSize: 9,
                    fontWeight: 650,
                    padding: '2px 6px',
                    borderRadius: 'var(--radius)',
                    background: theme.bg,
                    color: theme.color,
                    border: `1px solid ${theme.border}`,
                    lineHeight: 1,
                  }}>
                    {gTag}
                  </span>
                );
              })()}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {lots.length > 0 && (
              <>
                <button
                  type="button"
                  className={`btn btn-ghost btn-sm ${showSipBreakdown ? 'active' : ''}`}
                  onClick={() => setShowSipBreakdown(prev => !prev)}
                  style={{
                    border: showSipBreakdown ? '1px solid var(--purple)' : '1px solid var(--border-subtle)',
                    background: showSipBreakdown ? 'rgba(168, 85, 247, 0.15)' : 'var(--surface-2)',
                    color: showSipBreakdown ? 'var(--purple)' : 'var(--text-secondary)',
                    boxShadow: showSipBreakdown ? '0 0 8px rgba(168, 85, 247, 0.25)' : 'none',
                    padding: '4px 8px',
                    borderRadius: '8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  title="Toggle SIP Breakdown Table"
                >
                  <Repeat size={13} />
                  <span>SIP Breakdown</span>
                </button>

                <button
                  className="btn btn-ghost btn-icon"
                  onClick={() => setShowEditAsset(true)}
                  style={{
                    border: '1px solid var(--blue)',
                    background: 'rgba(59, 130, 246, 0.1)',
                    color: 'var(--blue)',
                    boxShadow: '0 0 8px rgba(59, 130, 246, 0.3)',
                    padding: '4px',
                    borderRadius: '8px'
                  }}
                  title="Edit Asset Details"
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="btn btn-ghost btn-icon"
                  onClick={() => setShowDeleteAssetWarning(true)}
                  style={{
                    border: '1px solid var(--red)',
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: 'var(--red)',
                    boxShadow: '0 0 8px rgba(239, 68, 68, 0.3)',
                    padding: '4px',
                    borderRadius: '8px'
                  }}
                  title="Delete Asset and All Associated Data"
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
            <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        {/* MF metadata card */}
        {!showSipBreakdown && lots.length > 0 && data?.rawPayload && (() => {
          let fundHouse = '';
          let category = '';
          try {
            const meta = JSON.parse(data.rawPayload);
            fundHouse = meta.fund_house || '';
            category = meta.scheme_category || '';
          } catch (_err) {
            // Ignore invalid JSON payload
          }
          if (!fundHouse && !category) return null;

          return (
            <div style={{
              background: 'var(--surface-3)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '10px 14px',
              marginBottom: '16px',
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              color: 'var(--text-secondary)'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {fundHouse && <div><span style={{ color: 'var(--text-tertiary)', marginRight: 4 }}>Fund House:</span> <strong>{fundHouse}</strong></div>}
                {category && <div><span style={{ color: 'var(--text-tertiary)', marginRight: 4 }}>Category:</span> <strong>{category}</strong></div>}
              </div>
            </div>
          );
        })()}

        {/* Fund Holdings Summary Card (Active or Closed) */}
        {!showSipBreakdown && (lots.length > 0 || isClosedAsset) && (
          <div
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px 16px',
              marginBottom: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}
          >
            {isClosedAsset ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Units Held</div>
                  <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                    0.000 (Closed)
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Invested</div>
                  <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                    {formatINR(closedTotalInvested, { decimals: 2 })}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Came Out (Withdrawn)</div>
                  <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                    {formatINR(closedTotalWithdrawn, { decimals: 2 })}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Realized P&L</div>
                  <div style={{
                    fontSize: 12,
                    fontWeight: 650,
                    color: closedRealizedGain >= 0 ? 'var(--green)' : 'var(--red)',
                    fontFamily: 'var(--font-mono)',
                    marginTop: 4
                  }}>
                    {closedRealizedGain >= 0 ? '+' : ''}{formatINR(closedRealizedGain, { decimals: 2 })} ({closedGainPercent.toFixed(2)}%)
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Units Held</div>
                  <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                    {unitsRemaining.toFixed(3)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Buy Price</div>
                  <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                    {formatINR(averageCost, { decimals: 3 })}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current LTP</div>
                  <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                    {formatINR(resolvedCurrentPrice, { decimals: 3 })}
                  </div>
                  {data?.navDate && (
                    <div style={{ fontSize: 8, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {new Date(data.navDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {data.cacheCreatedAt && ` · refreshed ${formatRelativeTime(data.cacheCreatedAt, now)}`}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Return</div>
                  <div style={{
                    fontSize: 12,
                    fontWeight: 650,
                    color: totalGain >= 0 ? 'var(--green)' : 'var(--red)',
                    fontFamily: 'var(--font-mono)',
                    marginTop: 4
                  }}>
                    {totalGain >= 0 ? '+' : ''}{formatINR(totalGain, { decimals: 2 })} ({totalGainPercent.toFixed(2)}%)
                  </div>
                  {xirr !== null && xirr !== undefined && (
                    isHeldLessThanOneYear ? (
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 500,
                          color: 'var(--text-tertiary)',
                          marginTop: 2,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                          cursor: 'help'
                        }}
                        title={`Zerodha Coin shows 0% because XIRR is an annualised return metric and this fund has been held for < 1 year (${holdingDays} days). True annualised XIRR: ${(xirr * 100).toFixed(2)}%`}
                      >
                        <span>0% XIRR</span>
                        <span style={{ fontSize: 9, background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                          &lt; 1 yr
                        </span>
                      </div>
                    ) : (
                      <div style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: xirr >= 0 ? 'var(--green)' : 'var(--red)',
                        marginTop: 2,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2
                      }}>
                        <span>{xirr >= 0 ? '▲' : '▼'}</span>
                        <span>{(xirr * 100).toFixed(2)}% XIRR</span>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12,
              borderTop: '1px solid var(--border-subtle)',
              paddingTop: 10,
              alignItems: 'center'
            }}>
              <div style={{ fontSize: 11 }}>
                <span style={{ color: 'var(--text-tertiary)', marginRight: 6 }}>Invested Value:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {formatINR(isClosedAsset ? closedTotalInvested : totalInvestedValue, { decimals: 2 })}
                </span>
              </div>
              <div style={{ textAlign: 'center', fontSize: 11 }}>
                <span style={{ color: 'var(--text-tertiary)', marginRight: 6 }}>Realized Return:</span>
                <span style={{ fontWeight: 600, color: (isClosedAsset ? closedRealizedGain : realizedGain) >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font-mono)' }}>
                  {(isClosedAsset ? closedRealizedGain : realizedGain) >= 0 ? '+' : ''}{formatINR(isClosedAsset ? closedRealizedGain : realizedGain, { decimals: 2 })}
                </span>
              </div>
              <div style={{ textAlign: 'right', fontSize: 11 }}>
                <span style={{ color: 'var(--text-tertiary)', marginRight: 6 }}>{isClosedAsset ? 'Came Out:' : 'Current Value:'}</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {formatINR(isClosedAsset ? closedTotalWithdrawn : currentValue, { decimals: 2 })}
                </span>
              </div>
            </div>

            {lowPrice && highPrice && (() => {
              const range = highPrice - lowPrice;
              const pct = range > 0 ? ((resolvedCurrentPrice - lowPrice) / range) * 100 : 50;
              const clampedPct = Math.max(0, Math.min(100, pct));
              return (
                <div style={{
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-tertiary)' }}>
                    <span>52W Low: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{formatINR(lowPrice)}</span></span>
                    <span>52W High: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{formatINR(highPrice)}</span></span>
                  </div>
                  <div style={{
                    position: 'relative',
                    height: 6,
                    background: 'var(--bg-tertiary, #1f2937)',
                    borderRadius: 3,
                    marginTop: 2,
                    display: 'flex',
                    alignItems: 'center'
                  }}>
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      height: '100%',
                      background: 'linear-gradient(to right, var(--red, #ef4444), var(--orange, #f97316), var(--green, #22c55e))',
                      borderRadius: 3,
                      opacity: 0.2
                    }} />
                    <div style={{
                      position: 'absolute',
                      left: `${clampedPct}%`,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--text-primary, #ffffff)',
                      border: '2px solid var(--surface-2, #111827)',
                      boxShadow: '0 0 4px var(--text-primary, #ffffff)',
                      transform: 'translateX(-50%)'
                    }} />
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ─── SIP BREAKDOWN TABLE (TOGGLED BESIDE EDIT ASSET ICON) ─────────────────────── */}
        {showSipBreakdown && lots.length > 0 && (
          <div
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px 16px',
              marginBottom: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>SIP Breakdown</span>
                {sipAnalytics.hasSip && (
                  <span
                    className={`badge ${
                      sipAnalytics.sipStatus === 'ACTIVE'
                        ? 'badge-green'
                        : sipAnalytics.sipStatus === 'PAUSED'
                        ? 'badge-orange'
                        : 'badge-gray'
                    }`}
                    style={{ fontSize: 9, opacity: sipAnalytics.sipStatus === 'COMPLETED' ? 0.75 : 1 }}
                  >
                    {sipAnalytics.sipStatus === 'ACTIVE'
                      ? '⚡ Active'
                      : sipAnalytics.sipStatus === 'PAUSED'
                      ? '⏸️ Paused'
                      : '⏹️ Ended'}
                  </span>
                )}
              </div>

              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleAutoTagSips}
                style={{ fontSize: 10, padding: '2px 8px', color: 'var(--text-secondary)' }}
                title="Automatically analyze pattern and tag lots as ⚡️SIP or 💰BULK"
              >
                ✨ Auto-detect SIPs
              </button>
            </div>

            {sipAnalytics.tranches.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 11, color: 'var(--text-tertiary)' }}>
                No SIP tranches detected. Use the ⚡️/💰 icon on trades to mark lots as SIP or click{' '}
                <button
                  type="button"
                  onClick={handleAutoTagSips}
                  style={{ color: 'var(--blue)', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                >
                  Auto-detect SIPs
                </button>.
              </div>
            ) : (
              <div className="table-wrap" style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)' }}>
                <table className="compact-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      <th style={{ textAlign: 'left', fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Start</th>
                      <th style={{ textAlign: 'left', fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>End</th>
                      <th className="r" style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount</th>
                      <th className="r" style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current</th>
                      <th className="r" style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Invested</th>
                      <th className="r" style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Returns</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderedTranches.map(tranche => (
                      <tr key={tranche.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td className="num td-dim" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                          {formatDate(tranche.startDate)}
                        </td>
                        <td className="num td-dim" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                          {tranche.status === 'ACTIVE' ? (
                            <span className="badge badge-purple" style={{ fontSize: 9, padding: '2px 6px', textTransform: 'none' }}>
                              ⚡ Active
                            </span>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                                {tranche.endDate ? formatDate(tranche.endDate) : '—'}
                              </span>
                              {tranche.status === 'PAUSED' && (
                                <span className="badge badge-orange" style={{ fontSize: 9, padding: '1px 5px', textTransform: 'none' }}>
                                  Paused
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="r num" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {formatINR(tranche.installmentAmountPaise, { decimals: 2 })}
                          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 400 }}> /mo</span>
                        </td>
                        <td className="r num" style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
                          {formatINR(tranche.currentValuePaise, { decimals: 2 })}
                        </td>
                        <td className="r num td-dim" style={{ fontSize: 12, fontWeight: 500 }}>
                          {formatINR(tranche.investedPaise, { decimals: 2 })}
                        </td>
                        <td className="r" style={{ fontSize: 12 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                            <span style={{ fontWeight: 600, color: tranche.absoluteGainPaise >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font-mono)' }}>
                              {tranche.absoluteGainPaise >= 0 ? '+' : ''}{formatINR(tranche.absoluteGainPaise, { decimals: 2 })} ({tranche.returnPct.toFixed(2)}%)
                            </span>
                            {tranche.xirr !== null && (
                              <span style={{ fontSize: 10, color: tranche.xirr >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>
                                {tranche.xirr >= 0 ? '▲' : '▼'} {(tranche.xirr * 100).toFixed(2)}% XIRR
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!displayHistory?.length ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-tertiary)' }}>
            No {showSipBreakdown ? 'SIP trades' : 'trades'} recorded for this symbol.
          </div>
        ) : (
          <div className="table-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
            <table className="compact-table">
              <thead>
                <tr>
                  <SortableHeader
                    label="Mode"
                    field="mode"
                    currentSortBy={sortBy}
                    currentSortOrder={sortOrder}
                    onSort={handleSort}
                  />
                  <th style={{ paddingLeft: 4 }}>Date</th>
                  <th>Type</th>
                  <th className="r">Units</th>
                  <th className="r">Price/NAV</th>
                  {history.some(h => h.fees_paise > 0) && <th className="r">Fees</th>}
                  <th className="r">Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {displayHistory.map(trade => {
                  const showFeesCol = history.some(h => h.fees_paise > 0);
                  const isBuy = trade.type === 'BUY';
                  const isSip = isBuy && isLotSip(trade.lot);
                  const isLumpSum = isBuy && !isSip;

                  // Compute LTCG/STCG tag for BUY trade
                  let taxTag = null;
                  if (isBuy) {
                    // Pick the most recently effective rule for this asset class at today's date
                    const applicableRule = taxRules
                      ?.filter(r =>
                        r.asset_class === trade.asset_class &&
                        r.effective_from <= now &&
                        (r.effective_until === null || r.effective_until >= now)
                      )
                      .sort((a, b) => b.effective_from - a.effective_from)[0] ?? null;

                    // Use calendar-month arithmetic (correct) instead of 30.4375-day approximation
                    const monthsHeld = holdingMonths(trade.date, now);
                    const threshold = applicableRule
                      ? applicableRule.holding_period_months
                      : getDefaultHoldingMonths(trade.asset_class);
                    const isLTCG = monthsHeld >= threshold;
                    taxTag = (
                      <span className={`badge ${isLTCG ? 'badge-green' : 'badge-orange'}`} style={{ fontSize: 9, padding: '2px 5px' }}>
                        {isLTCG ? 'LTCG' : 'STCG'}
                      </span>
                    );
                  }

                  return (
                    <tr
                      key={`${trade.type}-${trade.id}`}
                      style={{
                        background: isLumpSum ? 'rgba(34, 197, 94, 0.08)' : undefined,
                      }}
                    >
                      <td style={{ textAlign: 'center', width: 34, padding: '6px 2px' }}>
                        {isBuy ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleLotType(trade.lot);
                            }}
                            title={`Currently ${isSip ? '⚡️SIP' : '💰BULK'}. Click to toggle.`}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: 13,
                              lineHeight: 1,
                              padding: '2px',
                              borderRadius: '4px',
                              userSelect: 'none',
                            }}
                          >
                            {isSip ? '⚡️' : '💰'}
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>—</span>
                        )}
                      </td>
                      <td className="num td-dim" style={{ whiteSpace: 'nowrap', paddingLeft: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap' }}>
                          <span style={{ whiteSpace: 'nowrap' }}>{formatDate(trade.date)}</span>
                          {taxTag}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${trade.type === 'SELL' ? 'badge-red' : 'badge-green'}`} style={{ fontSize: 9, padding: '2px 6px' }}>
                          {trade.type}
                        </span>
                      </td>
                      <td className="r num">
                        {isBuy ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                            <span>{trade.units.toFixed(3)}</span>
                            {trade.units_remaining < trade.units && (
                              <span className="hide-mobile" style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
                                ({trade.units_remaining.toFixed(3)} remaining)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span>{trade.units.toFixed(3)}</span>
                        )}
                      </td>
                      <td className="r num">{formatINR(trade.price_paise, { decimals: 2 })}</td>
                      {showFeesCol && <td className="r num">{trade.fees_paise > 0 ? formatINR(trade.fees_paise, { decimals: 2 }) : '—'}</td>}
                      <td className="r num" style={{ fontWeight: 500 }}>
                        {isBuy ? '-' : '+'}{formatINR(trade.total_paise, { decimals: 2 })}
                      </td>
                      <td>
                        <div className="flex gap-1" style={{ justifyContent: 'flex-end' }}>
                          {isBuy ? (
                            <>
                              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSelectedLot(trade.lot)}>
                                <Pencil size={11} />
                              </button>
                              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setDeleteLotId(trade.id)}>
                                <Trash2 size={11} color="var(--red)" />
                              </button>
                            </>
                          ) : (
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setDeleteSaleEventIds(trade.eventIds)}>
                              <Trash2 size={11} color="var(--red)" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {selectedLot && (
          <EditLotModal
            lot={selectedLot}
            onClose={() => setSelectedLot(null)}
            onUpdate={() => { }}
          />
        )}

        {deleteLotId && (
          <ConfirmModal
            title="Delete Purchase Lot"
            message="Are you sure you want to delete this purchase lot? This cannot be undone."
            onConfirm={handleDeleteConfirm}
            onCancel={() => setDeleteLotId(null)}
          />
        )}

        {deleteSaleEventIds && (
          <ConfirmModal
            title="Delete Sale Transaction"
            message="Are you sure you want to delete this sale transaction? The sold units will be restored back to your purchase lots. This cannot be undone."
            onConfirm={handleDeleteSaleConfirm}
            onCancel={() => setDeleteSaleEventIds(null)}
          />
        )}

        {showDeleteAssetWarning && (
          <ConfirmModal
            title="Delete Asset & All Associated Data"
            message={`Are you sure you want to delete "${displayName}" and all its purchase lots, transactions, and cached price data? This action is permanent and cannot be undone.`}
            onConfirm={handleDeleteAssetAllData}
            onCancel={() => setShowDeleteAssetWarning(false)}
          />
        )}

        {showEditAsset && (
          <EditAssetModal
            symbol={symbol}
            accountId={lots[0]?.account_id || ''}
            onClose={() => setShowEditAsset(false)}
          />
        )}
      </div>
    </div>
  );
}
