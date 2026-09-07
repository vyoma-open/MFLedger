import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Receipt, Info, Check, X, ShieldAlert, Award, TrendingDown, ArrowUpRight, Download, Calendar, Users, Calculator, ChevronDown, Loader2 } from 'lucide-react';
import { db, ASSET_CLASS_LABELS, type AssetClass } from '@/db/schema';
import { getApplicableTaxRule, getDefaultHoldingMonths, getHoldingThresholdMonths } from '@/engines/tax';
import { Amt, formatINR } from '@/utils/currency';
import { currentFY, holdingMonths, formatDate } from '@/utils/fiscalYear';
import { Topbar } from '@/components/Topbar/Topbar';
import { AccountSelector } from '@/components/Topbar/AccountSelector';
import { useAccount } from '@/contexts/AccountContext';
import { useToast } from '@/contexts/ToastContext';
import { AssetLotsModal } from '@/features/investments/components/modals/AssetLotsModal';
import { TaxRulesModal } from './TaxRulesModal';
import { sellFIFO, buyLot } from '@/engines/fifo';
import { calculateXIRR } from '@/utils/xirr';

import { computeProfileTaxReport } from '@/features/tax/utils/computeProfileTaxReport';
import {
  classifyLotTag,
  getAutoTagForClassification,
  calculateAutoTagUnits,
  getAutoTagsSummary,
  simulateFifoRedemption,
  type LotWithTaxStatus,
  type AutoTagType,
} from '@/features/tax/utils/fifoSimulation';

export default function Tax({ hideTopbar = false }: { hideTopbar?: boolean }) {
  const fy = currentFY();
  const { accounts, selectedAccountId: contextAccountId } = useAccount();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlAccountId = searchParams.get('account');
  const selectedAccountId = urlAccountId !== null ? urlAccountId : (contextAccountId === 'ALL' ? '' : contextAccountId);

  const userAccounts = accounts;
  
  // Filter accounts based on selected account
  const targetAccounts = React.useMemo(() => {
    if (selectedAccountId) {
      return accounts.filter(a => a.id === selectedAccountId);
    }
    return accounts.filter(a => a.is_archived !== 1);
  }, [accounts, selectedAccountId]);

  // Harvesting and report states per account (declarative live query)
  const profileTaxData = useLiveQuery(
    async () => {
      if (targetAccounts.length === 0) return {};

      // Get realized events and mapping
      const events = await db.lot_consumption_events.toArray();
      const lotIds = events.map(e => e.lot_id);
      const lots = await db.investment_lots.bulkGet(lotIds);
      const lotMap = new Map(lots.filter(Boolean).map(l => [l!.id, l!]));

      // Get active lots
      const activeLotsAll = await db.investment_lots
        .filter(l => l.status === 'ACTIVE' && l.units_remaining > 0 && (!selectedAccountId || l.account_id === selectedAccountId))
        .toArray();

      const rules = await db.tax_rules.toArray();
      const getRuleInMem = (asset_class: AssetClass, at_date: number) => {
        const filtered = rules.filter(r => 
          r.asset_class === asset_class &&
          r.effective_from <= at_date &&
          (r.effective_until === null || r.effective_until >= at_date)
        );
        if (filtered.length === 0) return null;
        return filtered.sort((a, b) => b.effective_from - a.effective_from)[0];
      };

      const mktNow = Date.now();
      const newProfileData: Record<string, {
        realizedLtcg: number;
        realizedStcg: number;
        harvestableGains: any[];
        harvestableLosses: any[];
        harvestableDebtGains: any[];
        harvestableDebtLosses: any[];
        remainingExemptionRoom: number;
        totalUnrealizedLtcg: number;
        actualHarvestableLtcg: number;
        totalUnrealizedLoss: number;
        realizedReport: {
          by_symbol: any[];
          total_stcg_paise: number;
          total_ltcg_paise: number;
          total_tax_paise: number;
        };
        allMfSchemes: Array<{
          symbol: string;
          name: string;
          lot: any;
          units: number;
          totalInvestedPaise: number;
          avgCostPaise: number;
          ltcg: number;
          stcg: number;
          ltcl: number;
          stcl: number;
        }>;
      }> = {};

      const isMfLot = (lot: any) => {
        return ['EQUITY_MF', 'INDEX_MF', 'DEBT_MF', 'LIQUID_MF', 'GOLD_MF'].includes(lot.asset_class);
      };

      for (const acc of targetAccounts) {
        // Calculate realized report
        const realizedReport = await computeProfileTaxReport(acc.id, fy, events, lotMap, selectedAccountId);

        let pRealizedLtcg = 0;
        let pRealizedStcg = 0;
        for (const item of realizedReport.by_symbol) {
          if (['EQUITY_MF', 'INDEX_MF'].includes(item.asset_class)) {
            pRealizedLtcg += item.ltcg_paise;
            pRealizedStcg += item.stcg_paise;
          }
        }

        // Calculate unrealized candidates and MF scheme rows
        const activeLots = activeLotsAll.filter(l => l.account_id === acc.id);
        const gainsList: any[] = [];
        const lossesList: any[] = [];
        const debtGainsList: any[] = [];
        const debtLossesList: any[] = [];
        const mfSchemesMap = new Map<string, {
          symbol: string;
          name: string;
          lot: any;
          units: number;
          totalInvestedPaise: number;
          ltcg: number;
          stcg: number;
          ltcl: number;
          stcl: number;
        }>();

        for (const lot of activeLots) {
          const cached = await db.market_cache.where('symbol').equals(lot.symbol).toArray();
          cached.sort((a, b) => b.nav_date - a.nav_date);
          const ltp = cached[0]?.nav_paise ?? lot.purchase_price_paise;
          const unrealizedGain = lot.units_remaining * (ltp - lot.purchase_price_paise);
          const months = holdingMonths(lot.purchase_date, mktNow);
          const rule = getRuleInMem(lot.asset_class, mktNow);
          const threshold = rule?.holding_period_months ?? getDefaultHoldingMonths(lot.asset_class);
          const isLT = months >= threshold;

          const isEquity = ['EQUITY_STOCK', 'EQUITY_MF', 'INDEX_MF'].includes(lot.asset_class);
          const isDebt = ['DEBT_MF', 'LIQUID_MF', 'GOLD_MF'].includes(lot.asset_class);

          if (unrealizedGain > 0) {
            if (isEquity && isLT) {
              gainsList.push({ lot, unrealizedGain, ltp, months, isLT });
            } else if (isDebt) {
              debtGainsList.push({ lot, unrealizedGain, ltp, months, isLT });
            }
          } else if (unrealizedGain < 0) {
            const unrealizedLoss = Math.abs(unrealizedGain);
            if (isEquity) {
              lossesList.push({ lot, unrealizedLoss, ltp, months, isLT });
            } else if (isDebt) {
              debtLossesList.push({ lot, unrealizedLoss, ltp, months, isLT });
            }
          }

          // Aggregate ALL Mutual Fund holdings (including zero gains, STCG, LTCG, Gold MFs, etc.)
          if (isMfLot(lot)) {
            const sym = lot.symbol;
            if (!mfSchemesMap.has(sym)) {
              mfSchemesMap.set(sym, {
                symbol: sym,
                name: lot.name || sym,
                lot: lot,
                units: 0,
                totalInvestedPaise: 0,
                ltcg: 0,
                stcg: 0,
                ltcl: 0,
                stcl: 0,
              });
            }
            const rec = mfSchemesMap.get(sym)!;
            rec.units += lot.units_remaining;
            rec.totalInvestedPaise += lot.units_remaining * lot.purchase_price_paise;

            if (unrealizedGain > 0) {
              if (isLT) {
                rec.ltcg += unrealizedGain;
              } else {
                rec.stcg += unrealizedGain;
              }
            } else if (unrealizedGain < 0) {
              const unrealizedLoss = Math.abs(unrealizedGain);
              if (isLT) {
                rec.ltcl += unrealizedLoss;
              } else {
                rec.stcl += unrealizedLoss;
              }
            }
          }
        }

        const allMfSchemes = Array.from(mfSchemesMap.values()).map(r => ({
          ...r,
          avgCostPaise: r.units > 0 ? r.totalInvestedPaise / r.units : 0,
        }));

        const ltcgExemptionCap = 12500000; // ₹1.25L in paise
        const remainingExemptionRoom = Math.max(0, ltcgExemptionCap - pRealizedLtcg);
        const totalUnrealizedLtcg = gainsList.reduce((s, h) => s + h.unrealizedGain, 0);
        const actualHarvestableLtcg = Math.min(remainingExemptionRoom, totalUnrealizedLtcg);
        const totalUnrealizedLoss = lossesList.reduce((s, l) => s + l.unrealizedLoss, 0);

        newProfileData[acc.id] = {
          realizedLtcg: pRealizedLtcg,
          realizedStcg: pRealizedStcg,
          harvestableGains: gainsList.sort((a, b) => b.unrealizedGain - a.unrealizedGain),
          harvestableLosses: lossesList.sort((a, b) => b.unrealizedLoss - a.unrealizedLoss),
          harvestableDebtGains: debtGainsList.sort((a, b) => b.unrealizedGain - a.unrealizedGain),
          harvestableDebtLosses: debtLossesList.sort((a, b) => b.unrealizedLoss - a.unrealizedLoss),
          remainingExemptionRoom,
          totalUnrealizedLtcg,
          actualHarvestableLtcg,
          totalUnrealizedLoss,
          realizedReport,
          allMfSchemes,
        };
      }

      return newProfileData;
    },
    [targetAccounts, fy, selectedAccountId]
  );

  const profileTaxDataFallback = profileTaxData || {};
  const loading = profileTaxData === undefined;

  const [selectedAdvisorProfileId, setSelectedAdvisorProfileId] = useState<string | null>(null);
  const effectiveAdvisorProfileId = (selectedAdvisorProfileId && targetAccounts.some(a => a.id === selectedAdvisorProfileId))
    ? selectedAdvisorProfileId
    : (selectedAccountId || targetAccounts[0]?.id || '');
  const [simulatingLot, setSimulatingLot] = useState<any | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const accountDropdownRef = useRef<HTMLDivElement>(null);

  // Close account dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target as Node)) {
        setAccountDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);



  // Combine reports based on targetAccounts
  const filteredReport = React.useMemo(() => {
    const defaultReport = { by_symbol: [] as any[], total_stcg_paise: 0, total_ltcg_paise: 0, total_tax_paise: 0 };
    if (Object.keys(profileTaxDataFallback).length === 0) return defaultReport;

    const reportsToCombine = targetAccounts
      .map(a => profileTaxDataFallback[a.id]?.realizedReport)
      .filter(Boolean);

    if (reportsToCombine.length === 0) return defaultReport;

    const symbolMap = new Map<string, any>();
    let total_stcg_paise = 0;
    let total_ltcg_paise = 0;
    let total_tax_paise = 0;

    for (const r of reportsToCombine) {
      total_stcg_paise += r.total_stcg_paise;
      total_ltcg_paise += r.total_ltcg_paise;
      total_tax_paise += r.total_tax_paise;

      for (const item of r.by_symbol) {
        if (!symbolMap.has(item.symbol)) {
          symbolMap.set(item.symbol, { ...item });
        } else {
          const existing = symbolMap.get(item.symbol);
          existing.stcg_paise += item.stcg_paise;
          existing.ltcg_paise += item.ltcg_paise;
          existing.tax_stcg_paise += item.tax_stcg_paise;
          existing.tax_ltcg_paise += item.tax_ltcg_paise;
        }
      }
    }

    return {
      by_symbol: Array.from(symbolMap.values()),
      total_stcg_paise,
      total_ltcg_paise,
      total_tax_paise,
    };
  }, [profileTaxDataFallback, targetAccounts]);

  // Fetch active advisor data
  const activeData = profileTaxDataFallback[effectiveAdvisorProfileId] || {
    realizedLtcg: 0,
    realizedStcg: 0,
    harvestableGains: [] as any[],
    harvestableLosses: [] as any[],
    harvestableDebtGains: [] as any[],
    harvestableDebtLosses: [] as any[],
    remainingExemptionRoom: 12500000,
    totalUnrealizedLtcg: 0,
    actualHarvestableLtcg: 0,
    totalUnrealizedLoss: 0,
    realizedReport: { by_symbol: [] as any[], total_stcg_paise: 0, total_ltcg_paise: 0, total_tax_paise: 0 },
    allMfSchemes: [] as any[],
  };

  // Build unified MF scheme rows for active advisor profile
  const mfSchemeRows = React.useMemo(() => {
    return activeData.allMfSchemes || [];
  }, [activeData.allMfSchemes]);

  // Timeline deadline calculations
  const daysLeftInFY = React.useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const endYear = now.getMonth() >= 3 ? currentYear + 1 : currentYear;
    const endOfFY = new Date(endYear, 2, 31, 23, 59, 59, 999);
    const msLeft = endOfFY.getTime() - now.getTime();
    return Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
  }, []);

  const fyProgressPercent = React.useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const startYear = now.getMonth() >= 3 ? currentYear : currentYear - 1;
    const startOfFY = new Date(startYear, 3, 1, 0, 0, 0, 0);
    const endOfFY = new Date(startYear + 1, 2, 31, 23, 59, 59, 999);
    const totalMs = endOfFY.getTime() - startOfFY.getTime();
    const elapsedMs = now.getTime() - startOfFY.getTime();
    return Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));
  }, []);

  function handleExportTaxReport() {
    if (!filteredReport || filteredReport.by_symbol.length === 0) {
      toast('No tax report to export.', 'error');
      return;
    }
    const headers = ['Symbol', 'Asset Name', 'Class', 'STCG (INR)', 'LTCG (INR)', 'STCG Tax (INR)', 'LTCG Tax (INR)'];
    const rows = filteredReport.by_symbol.map(r => [
      r.symbol,
      `"${r.name.replace(/"/g, '""')}"`,
      ASSET_CLASS_LABELS[r.asset_class as AssetClass],
      (r.stcg_paise / 100).toFixed(2),
      (r.ltcg_paise / 100).toFixed(2),
      r.is_slab_rate_stcg ? 'Slab Rate' : (r.tax_stcg_paise / 100).toFixed(2),
      r.is_slab_rate_ltcg ? 'Slab Rate' : (r.tax_ltcg_paise / 100).toFixed(2),
    ]);
    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `tax_report_${fy.label.replace(/ /g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast('Tax report CSV downloaded.', 'success');
  }

  function handleExportHarvesting() {
    if (
      activeData.harvestableGains.length === 0 && 
      activeData.harvestableLosses.length === 0 &&
      activeData.harvestableDebtGains.length === 0 &&
      activeData.harvestableDebtLosses.length === 0
    ) {
      toast('No harvesting opportunities to export.', 'error');
      return;
    }
    const headers = ['Type', 'Symbol', 'Asset Name', 'Asset Class', 'Holding Period', 'Harvestable Amount (INR)'];
    const rows = [
      ...activeData.harvestableGains.map(g => [
        'LTCG Step-Up Gain',
        g.lot.symbol,
        `"${g.lot.name.replace(/"/g, '""')}"`,
        ASSET_CLASS_LABELS[g.lot.asset_class as AssetClass],
        `${g.months} months`,
        (g.unrealizedGain / 100).toFixed(2),
      ]),
      ...activeData.harvestableLosses.map(l => [
        'Tax Loss',
        l.lot.symbol,
        `"${l.lot.name.replace(/"/g, '""')}"`,
        ASSET_CLASS_LABELS[l.lot.asset_class as AssetClass],
        `${l.months} months`,
        (l.unrealizedLoss / 100).toFixed(2),
      ]),
      ...activeData.harvestableDebtGains.map(g => [
        'Debt Gain',
        g.lot.symbol,
        `"${g.lot.name.replace(/"/g, '""')}"`,
        ASSET_CLASS_LABELS[g.lot.asset_class as AssetClass],
        `${g.months} months`,
        (g.unrealizedGain / 100).toFixed(2),
      ]),
      ...activeData.harvestableDebtLosses.map(l => [
        'Debt Loss',
        l.lot.symbol,
        `"${l.lot.name.replace(/"/g, '""')}"`,
        ASSET_CLASS_LABELS[l.lot.asset_class as AssetClass],
        `${l.months} months`,
        (l.unrealizedLoss / 100).toFixed(2),
      ])
    ];
    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `tax_harvesting_opportunities.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast('Harvesting CSV downloaded.', 'success');
  }

  // Calculate sum of realized gains across all target accounts
  const sumRealizedStcg = targetAccounts.reduce((sum, a) => sum + (profileTaxDataFallback[a.id]?.realizedStcg ?? 0), 0);
  const sumRealizedLtcg = targetAccounts.reduce((sum, a) => sum + (profileTaxDataFallback[a.id]?.realizedLtcg ?? 0), 0);

  const selectedAccountLabel = selectedAccountId
    ? (() => { const a = userAccounts?.find(a => a.id === selectedAccountId); return a ? `${a.name} (${a.type?.replace(/_/g, ' ')})` : 'All Accounts'; })()
    : 'All Accounts';

  const pageActions = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button className="btn btn-secondary btn-sm" onClick={() => setShowRulesModal(true)} title="Configure Tax Rules" style={{ gap: 6 }}>
        <Receipt size={13} /> Tax Rules
      </button>

      <AccountSelector />

      <button className="btn btn-ghost btn-icon btn-sm" onClick={handleExportTaxReport} title="Export Tax Report to CSV" style={{ color: 'var(--text-secondary)', padding: '6px', height: 28, width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Download size={13} />
      </button>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {!hideTopbar && (
        <Topbar title="Tax & Capital Gains" actions={pageActions} />
      )}

      {hideTopbar && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px var(--page-pad-x) 0 var(--page-pad-x)' }}>
          {pageActions}
        </div>
      )}

      <div className="page" style={{ overflowY: 'auto' }}>

        {/* ─── FISCAL YEAR TIMELINE DEADLINE INDICATOR ──────────────────────────── */}
        <div className="card" style={{ 
          background: 'var(--surface-2)', 
          border: '1px solid var(--border-subtle)', 
          padding: '14px 18px', 
          borderRadius: 'var(--radius-lg)', 
          marginBottom: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={15} color="var(--purple)" />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                Fiscal Year Deadline Tracker
              </span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: daysLeftInFY <= 45 ? 'var(--red)' : 'var(--text-secondary)', background: 'var(--surface-3)', padding: '2px 8px', borderRadius: 12 }}>
              ⏳ {daysLeftInFY} Days Left in {fy.label}
            </span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ width: '100%', height: 6, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ 
                width: `${fyProgressPercent}%`, 
                height: '100%', 
                background: daysLeftInFY <= 45 ? 'var(--red)' : daysLeftInFY <= 90 ? 'var(--orange)' : 'var(--green)',
                borderRadius: 3,
                transition: 'width 0.5s ease-in-out'
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-tertiary)' }}>
              <span>Apr 1, {fy.startYear}</span>
              <span>FY Progress: {fyProgressPercent.toFixed(1)}%</span>
              <span>Mar 31, {fy.startYear + 1}</span>
            </div>
          </div>
          
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
            Tax harvesting is time-sensitive. Actions must be completed and settled on or before <strong>March 31, {fy.startYear + 1}</strong> to affect this year's liability.
          </p>
        </div>

        {/* Realized Capital Gains Summary */}
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
          Realized capital gains (FY {fy.label}) — {selectedAccountId ? (targetAccounts.find(a => a.id === selectedAccountId)?.name || 'Portfolio') : 'All Portfolios (Consolidated)'}
        </div>
        <div className="grid-3 mb-6" style={{ marginBottom: 24 }}>
          <div className="card card-sm">
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>REALIZED STCG</div>
            <Amt paise={sumRealizedStcg} compact size="md" />
            <div className="td-dim" style={{ fontSize: 11, marginTop: 4 }}>Short-term gains (Taxable)</div>
          </div>
          <div className="card card-sm">
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>REALIZED LTCG</div>
            <Amt paise={sumRealizedLtcg} compact size="md" />
            <div className="td-dim" style={{ fontSize: 11, marginTop: 4 }}>Long-term gains</div>
          </div>
          <div className="card card-sm">
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>ESTIMATED GAINS TAX</div>
            <Amt paise={filteredReport?.total_tax_paise ?? 0} compact size="md" negative />
            <div className="td-dim" style={{ fontSize: 11, marginTop: 4 }}>Excluding slab-rate assets</div>
          </div>
        </div>

        {/* ─── ALL PORTFOLIOS BREAKDOWN TABLE ────────────────────────────────────────── */}
        {!selectedAccountId && targetAccounts.length > 1 && (
          <div className="card" style={{ background: 'var(--surface)', padding: '12px 14px', border: '1px solid var(--border-subtle)', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Users size={16} color="var(--green)" />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Portfolio Accounts Exemption & Tax Summary</span>
            </div>
            <div className="table-wrap" style={{ margin: '0 -4px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '4px 6px', fontSize: 10, textAlign: 'left', lineHeight: 1.2 }}>Portfolio Account</th>
                    <th className="r" style={{ padding: '4px 6px', fontSize: 10, lineHeight: 1.2 }}>Realized<br/>STCG</th>
                    <th className="r" style={{ padding: '4px 6px', fontSize: 10, lineHeight: 1.2 }}>Realized<br/>LTCG</th>
                    <th className="r" style={{ padding: '4px 6px', fontSize: 10, lineHeight: 1.2 }}>Exemption<br/>Room Left</th>
                    <th className="r" style={{ padding: '4px 6px', fontSize: 10, lineHeight: 1.2 }}>Harvestable<br/>LTCG</th>
                    <th className="r" style={{ padding: '4px 6px', fontSize: 10, lineHeight: 1.2, color: 'var(--green)' }}>Net Free<br/>Opportunity</th>
                    <th className="r" style={{ padding: '4px 6px', fontSize: 10, lineHeight: 1.2, color: 'var(--red)' }}>Unrealized<br/>Losses</th>
                  </tr>
                </thead>
                <tbody>
                  {targetAccounts.map(a => {
                    const data = profileTaxDataFallback[a.id] || {
                      realizedStcg: 0,
                      realizedLtcg: 0,
                      remainingExemptionRoom: 12500000,
                      totalUnrealizedLtcg: 0,
                      actualHarvestableLtcg: 0,
                      totalUnrealizedLoss: 0,
                    };
                    const isSelected = effectiveAdvisorProfileId === a.id;
                    return (
                      <tr 
                        key={a.id} 
                        style={{ 
                          cursor: 'pointer',
                          background: isSelected ? 'var(--surface-2)' : 'transparent',
                          fontWeight: isSelected ? 600 : 'normal'
                        }}
                        onClick={() => setSelectedAdvisorProfileId(a.id)}
                      >
                        <td style={{ padding: '8px 6px', fontSize: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {isSelected && (
                              <span style={{ color: 'var(--green)', fontWeight: 'bold', fontSize: 14 }}>•</span>
                            )}
                            <span style={{ color: 'var(--text-primary)', fontWeight: isSelected ? 700 : 500 }}>
                              {a.name} {a.account_number ? `(${a.account_number})` : ''}
                            </span>
                          </div>
                        </td>
                        <td className="r num td-dim" style={{ padding: '8px 6px', fontSize: 12 }}>{formatINR(data.realizedStcg)}</td>
                        <td className="r num td-dim" style={{ padding: '8px 6px', fontSize: 12 }}>{formatINR(data.realizedLtcg)}</td>
                        <td className="r num positive" style={{ padding: '8px 6px', fontSize: 12, fontWeight: 500 }}>{formatINR(data.remainingExemptionRoom)}</td>
                        <td className="r num" style={{ padding: '8px 6px', fontSize: 12 }}>{formatINR(data.totalUnrealizedLtcg)}</td>
                        <td className="r num positive" style={{ padding: '8px 6px', fontSize: 12, fontWeight: 600 }}>{formatINR(data.actualHarvestableLtcg)}</td>
                        <td className="r num negative" style={{ padding: '8px 6px', fontSize: 12 }}>{formatINR(data.totalUnrealizedLoss)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8, textAlign: 'right' }}>
              💡 Click on a portfolio account's row to view its detailed harvesting advisor candidates below.
            </div>
          </div>
        )}

        {/* ─── TAX HARVESTING DASHBOARD ────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Tax harvesting advisor — {targetAccounts.find(a => a.id === effectiveAdvisorProfileId)?.name || 'Selected Portfolio'}
            </span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleExportHarvesting} style={{ gap: 6, color: 'var(--text-secondary)' }}>
            <Download size={12} /> Export Harvesting
          </button>
        </div>

        {!selectedAccountId && targetAccounts.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, background: 'var(--surface-2)', padding: '6px 12px', borderRadius: 'var(--radius)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Detailed Advisor for Portfolio:
            </span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {targetAccounts.map(a => (
                <button
                  key={a.id}
                  className={`btn btn-xs ${effectiveAdvisorProfileId === a.id ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSelectedAdvisorProfileId(a.id)}
                  style={{ borderRadius: 16, padding: '2px 10px', fontSize: 11, height: 22 }}
                >
                  {a.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ─── CAPITAL LOSS SET-OFF & TAX OFFSET OPPORTUNITY CARD ────────────────── */}
        <div className="card mb-6" style={{ background: 'var(--surface)', padding: '16px 20px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingDown size={18} color="var(--red)" />
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                Capital Loss Set-Off & Tax Offset Opportunity
              </span>
            </div>
            <span className="badge badge-amber" style={{ fontSize: 10, padding: '2px 8px' }}>
              Loss Set-Off Available
            </span>
          </div>

          <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 14 }}>
            Set off taxable capital gains against realized or harvestable capital losses to reduce your net tax liability to <strong>₹0</strong>. Short-term capital losses (STCL) offset both STCG & LTCG; Long-term losses (LTCL) offset LTCG only.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>STCL AVAILABLE (SHORT TERM)</div>
              <Amt paise={activeData.harvestableLosses.filter((l: any) => !l.isLT).reduce((s: number, l: any) => s + l.unrealizedLoss, 0)} size="sm" negative />
              <div style={{ fontSize: 10, color: 'var(--amber)', marginTop: 2 }}>Offsets STCG & LTCG</div>
            </div>
            <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>LTCL AVAILABLE (LONG TERM)</div>
              <Amt paise={activeData.harvestableLosses.filter((l: any) => l.isLT).reduce((s: number, l: any) => s + l.unrealizedLoss, 0)} size="sm" negative />
              <div style={{ fontSize: 10, color: 'var(--green)', marginTop: 2 }}>Offsets LTCG only</div>
            </div>
            <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>REALIZED STCG TAXABLE</div>
              <Amt paise={activeData.realizedStcg} size="sm" />
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>Subject to 20% tax</div>
            </div>
            <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>NET TAX SAVINGS POTENTIAL</div>
              <Amt paise={Math.round(Math.min(activeData.totalUnrealizedLoss, activeData.realizedStcg) * 0.20)} size="sm" positive />
              <div style={{ fontSize: 10, color: 'var(--green)', marginTop: 2 }}>Tax saved by set-off</div>
            </div>
          </div>
        </div>

        {/* ─── UNIFIED MF TAX HOLDINGS TABLE ───────────────────────────────────── */}
        <div className="card" style={{ background: 'var(--surface)', padding: '16px 20px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Award size={18} color="var(--purple)" />
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                Mutual Fund Schemes & Tax Harvesting Options
              </span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              {mfSchemeRows.length} Active {mfSchemeRows.length === 1 ? 'Scheme' : 'Schemes'}
            </span>
          </div>

          {mfSchemeRows.length > 0 ? (
            <div className="table-wrap" style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)' }}>
              <table className="compact-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)' }}>
                    <th rowSpan={2} style={{ verticalAlign: 'middle', borderBottom: '1px solid var(--border-subtle)' }}>Scheme Name</th>
                    <th rowSpan={2} className="r" style={{ verticalAlign: 'middle', borderBottom: '1px solid var(--border-subtle)' }}>Units</th>
                    <th rowSpan={2} className="r" style={{ verticalAlign: 'middle', borderBottom: '1px solid var(--border-subtle)' }}>Avg Cost</th>
                    <th rowSpan={2} className="c" style={{ verticalAlign: 'middle', textAlign: 'center', borderBottom: '1px solid var(--border-subtle)' }}>Total Gain/Loss</th>
                    <th colSpan={2} className="c" style={{ textAlign: 'center', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(16, 185, 129, 0.1)', color: '#10B981', padding: '4px 8px' }}>
                      Unrealized Gains (₹)
                    </th>
                    <th colSpan={2} className="c" style={{ textAlign: 'center', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', padding: '4px 8px' }}>
                      Unrealized Losses (₹)
                    </th>
                  </tr>
                  <tr style={{ background: 'var(--surface-2)' }}>
                    <th className="c" style={{ textAlign: 'center', fontSize: 10, color: '#10B981', borderBottom: '1px solid var(--border-subtle)' }}>LTCG</th>
                    <th className="c" style={{ textAlign: 'center', fontSize: 10, color: '#F59E0B', borderBottom: '1px solid var(--border-subtle)' }}>STCG</th>
                    <th className="c" style={{ textAlign: 'center', fontSize: 10, color: '#10B981', borderBottom: '1px solid var(--border-subtle)' }}>LTCL</th>
                    <th className="c" style={{ textAlign: 'center', fontSize: 10, color: '#EF4444', borderBottom: '1px solid var(--border-subtle)' }}>STCL</th>
                  </tr>
                </thead>
                <tbody>
                  {mfSchemeRows.map((s) => {
                    const totalNet = (s.ltcg + s.stcg) - (s.ltcl + s.stcl);
                    return (
                      <tr key={s.symbol} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <div>
                              <div 
                                onClick={() => setSelectedSymbol(s.symbol)}
                                style={{ fontWeight: 600, fontSize: 12, color: 'var(--blue)', cursor: 'pointer', textDecoration: 'underline' }}
                              >
                                {s.name}
                              </div>
                            </div>
                            <button
                              className="btn btn-ghost btn-xs text-purple"
                              onClick={() => setSimulatingLot(s.lot)}
                              style={{ fontSize: 10, padding: '2px 8px', gap: 4, height: 22, border: '1px solid rgba(139, 92, 246, 0.3)', background: 'rgba(139, 92, 246, 0.08)', borderRadius: 'var(--radius)' }}
                            >
                              <Calculator size={11} /> Simulate
                            </button>
                          </div>
                        </td>
                        <td className="r num" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                          {s.units.toFixed(3)}
                        </td>
                        <td className="r num td-dim" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                          {formatINR(s.avgCostPaise, { decimals: 3 })}
                        </td>
                        <td className="c num" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, textAlign: 'center' }}>
                          {totalNet > 0 ? (
                            <span className="positive">+{formatINR(totalNet)}</span>
                          ) : totalNet < 0 ? (
                            <span className="negative">−{formatINR(Math.abs(totalNet))}</span>
                          ) : (
                            <span style={{ color: 'var(--text-tertiary)' }}>-</span>
                          )}
                        </td>
                        <td className="c num positive" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, textAlign: 'center' }}>
                          {s.ltcg > 0 ? `+${formatINR(s.ltcg)}` : <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>-</span>}
                        </td>
                        <td className="c num" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, textAlign: 'center', color: s.stcg > 0 ? '#F59E0B' : 'var(--text-tertiary)' }}>
                          {s.stcg > 0 ? `+${formatINR(s.stcg)}` : <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>-</span>}
                        </td>
                        <td className="c num positive" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, textAlign: 'center' }}>
                          {s.ltcl > 0 ? `−${formatINR(s.ltcl)}` : <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>-</span>}
                        </td>
                        <td className="c num negative" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, textAlign: 'center' }}>
                          {s.stcl > 0 ? `−${formatINR(s.stcl)}` : <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>-</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: 20 }}>
              <Receipt size={32} style={{ opacity: 0.3 }} />
              <div className="empty-title">No Active Mutual Fund Holdings</div>
              <p className="empty-desc">Import or add holdings to view scheme tax harvesting options.</p>
            </div>
          )}
        </div>

        {/* Per-symbol breakdown */}
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
          Symbol Breakdown (Realized Capital Gains) — {selectedAccountId ? (targetAccounts.find(a => a.id === selectedAccountId)?.name || 'Portfolio') : 'All Portfolios'}
        </div>
        
        {filteredReport && filteredReport.by_symbol.length > 0 ? (
          <div className="table-wrap mb-6" style={{ 
            marginBottom: 24,
            maxHeight: 320,
            overflowY: 'auto',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)'
          }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-2)' }}>
                <tr>
                  <th style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border-subtle)', borderTopLeftRadius: 'var(--radius-lg)' }}>Symbol</th>
                  <th style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border-subtle)' }}>Asset Class</th>
                  <th className="r" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border-subtle)' }}>STCG</th>
                  <th className="r" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border-subtle)' }}>LTCG</th>
                  <th className="r" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border-subtle)' }}>Tax STCG</th>
                  <th className="r" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border-subtle)', borderTopRightRadius: 'var(--radius-lg)' }}>Tax LTCG</th>
                </tr>
              </thead>
              <tbody>
                {filteredReport.by_symbol.map(r => (
                  <tr key={r.symbol}>
                    <td>
                      <div 
                        onClick={() => setSelectedSymbol(r.symbol)}
                        style={{ fontWeight: 600, fontSize: 13, color: 'var(--blue)', cursor: 'pointer', textDecoration: 'underline', display: 'inline-block' }}
                      >
                        {r.symbol}
                      </div>
                      <div className="td-dim" style={{ fontSize: 11 }}>{r.name}</div>
                    </td>
                    <td><span className="badge badge-purple" style={{ fontSize: 9 }}>{ASSET_CLASS_LABELS[r.asset_class as AssetClass]}</span></td>
                    <td className="r td-num" style={{ fontFamily: 'var(--font-mono)' }}>{formatINR(r.stcg_paise)}</td>
                    <td className="r td-num" style={{ fontFamily: 'var(--font-mono)' }}>{formatINR(r.ltcg_paise)}</td>
                    <td className="r">{r.is_slab_rate_stcg ? <span className="badge badge-orange">Slab</span> : <span className="td-num" style={{ fontFamily: 'var(--font-mono)' }}>{formatINR(r.tax_stcg_paise)}</span>}</td>
                    <td className="r">{r.is_slab_rate_ltcg ? <span className="badge badge-orange">Slab</span> : <span className="td-num" style={{ fontFamily: 'var(--font-mono)' }}>{formatINR(r.tax_ltcg_paise)}</span>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 10, background: 'var(--surface-3)', fontWeight: 600 }}>
                <tr>
                  <td style={{ background: 'var(--surface-3)', borderTop: '2px solid var(--border)', borderBottomLeftRadius: 'var(--radius-lg)' }}>Total</td>
                  <td style={{ background: 'var(--surface-3)', borderTop: '2px solid var(--border)' }}>—</td>
                  <td className="r num" style={{ background: 'var(--surface-3)', borderTop: '2px solid var(--border)', fontFamily: 'var(--font-mono)' }}>{formatINR(filteredReport.total_stcg_paise)}</td>
                  <td className="r num" style={{ background: 'var(--surface-3)', borderTop: '2px solid var(--border)', fontFamily: 'var(--font-mono)' }}>{formatINR(filteredReport.total_ltcg_paise)}</td>
                  <td className="r num" style={{ background: 'var(--surface-3)', borderTop: '2px solid var(--border)', fontFamily: 'var(--font-mono)' }}>
                    {formatINR(filteredReport.by_symbol.reduce((s, r) => s + r.tax_stcg_paise, 0))}
                  </td>
                  <td className="r num" style={{ background: 'var(--surface-3)', borderTop: '2px solid var(--border)', fontFamily: 'var(--font-mono)', borderBottomRightRadius: 'var(--radius-lg)' }}>
                    {formatINR(filteredReport.by_symbol.reduce((s, r) => s + r.tax_ltcg_paise, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          !loading && (
            <div className="empty-state" style={{ marginBottom: 32 }}>
              <Receipt size={36} style={{ opacity: 0.3 }} />
              <div className="empty-title">No sales logged this FY</div>
              <p className="empty-desc">Realized gains and tax figures will calculate automatically when assets are sold.</p>
            </div>
          )
        )}
      </div>

      <TaxRulesModal isOpen={showRulesModal} onClose={() => setShowRulesModal(false)} />

      {selectedSymbol && (
        <AssetLotsModal
          symbol={selectedSymbol}
          onClose={() => setSelectedSymbol(null)}
        />
      )}

      {simulatingLot && (
        <HarvestSimulationModal
          lot={simulatingLot}
          onClose={() => setSimulatingLot(null)}
          onSuccess={() => {
            // Refresh occurs via live query
          }}
        />
      )}
    </div>
  );
}

interface HarvestSimulationModalProps {
  lot: any;
  onClose: () => void;
  onSuccess?: () => void;
}

function HarvestSimulationModal({ lot, onClose, onSuccess }: HarvestSimulationModalProps) {
  const { toast } = useToast();
  const [symbolLots, setSymbolLots] = useState<LotWithTaxStatus[]>([]);
  const [units, setUnits] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [redeemMode, setRedeemMode] = useState<'Units' | 'Rupees' | '%'>('Units');
  const [selectedAutoTags, setSelectedAutoTags] = useState<Set<AutoTagType>>(new Set());
  const [showOnlySimulated, setShowOnlySimulated] = useState(true);
  const [ltp, setLtp] = useState(0);
  const [loadingLtp, setLoadingLtp] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [exemptionRoom, setExemptionRoom] = useState(12500000); // default ₹1.25L in paise
  const [xirr, setXirr] = useState<number | null>(null);
  const [realizedGainPaise, setRealizedGainPaise] = useState(0);

  // Load LTP, all active lots for this symbol, Profile's exemption room, XIRR, and Realized P&L
  useEffect(() => {
    async function loadSimulationData() {
      setLoadingLtp(true);
      
      // 1. Get LTP
      const cached = await db.market_cache.where('symbol').equals(lot.symbol).toArray();
      cached.sort((a, b) => b.nav_date - a.nav_date);
      const resolvedLtp = cached[0]?.nav_paise ?? lot.purchase_price_paise;
      setLtp(resolvedLtp);

      // 2. Get all active lots for this symbol in this account/profile, sorted FIFO (purchase_date ASC)
      const allActive = await db.investment_lots
        .where('symbol').equals(lot.symbol)
        .filter(l => l.status === 'ACTIVE' && l.units_remaining > 0 && l.account_id === lot.account_id)
        .toArray();
      allActive.sort((a, b) => a.purchase_date - b.purchase_date);

      const mktNow = Date.now();
      const processedLots: LotWithTaxStatus[] = [];

      for (const l of allActive) {
        const months = holdingMonths(l.purchase_date, mktNow);
        const threshold = await getHoldingThresholdMonths(l.asset_class, mktNow);
        const isLT = months >= threshold;
        const fullLotGain = l.units_remaining * (resolvedLtp - l.purchase_price_paise);
        const tag = classifyLotTag(isLT, fullLotGain);
        const autoTag = getAutoTagForClassification(tag);

        processedLots.push({
          ...l,
          months,
          threshold,
          isLT,
          tag,
          autoTag,
        });
      }

      setSymbolLots(processedLots);

      // 3. Get profile realized LTCG this FY for exemption room
      const fy = currentFY();
      const npsAccounts = await db.accounts.where('type').equals('NPS').toArray();
      const npsAccountIds = new Set(npsAccounts.map(a => a.id));
      const events = await db.lot_consumption_events.toArray();
      const lotIds = events.map(e => e.lot_id);
      const lots = await db.investment_lots.bulkGet(lotIds);
      const lotMap = new Map(lots.filter(Boolean).map(l => [l!.id, l!]));
      
      let pRealizedLtcg = 0;
      for (const event of events) {
        const eventLot = lotMap.get(event.lot_id);
        if (!eventLot || eventLot.account_id !== lot.account_id || npsAccountIds.has(eventLot.account_id)) continue;
        if (event.created_at < fy.startMs || event.created_at > fy.endMs) continue;

        const months = holdingMonths(eventLot.purchase_date, event.created_at);
        const threshold = await getHoldingThresholdMonths(eventLot.asset_class, event.created_at);
        const isLT = months >= threshold;
        const gain = event.units_consumed * (event.sale_price_paise - eventLot.purchase_price_paise);

        if (isLT && ['EQUITY_STOCK', 'EQUITY_MF', 'INDEX_MF'].includes(eventLot.asset_class)) {
          pRealizedLtcg += Math.max(0, gain);
        }
      }

      setExemptionRoom(Math.max(0, 12500000 - pRealizedLtcg));

      // 4. Calculate Realized Return & XIRR for this symbol in this account
      const symbolLotList = await db.investment_lots
        .where('symbol')
        .equals(lot.symbol)
        .filter(l => l.account_id === lot.account_id)
        .toArray();
      const symbolLotIds = symbolLotList.map(l => l.id);
      const symbolEvents = symbolLotIds.length > 0
        ? await db.lot_consumption_events.where('lot_id').anyOf(symbolLotIds).toArray()
        : [];
      const symLotMap = new Map(symbolLotList.map(l => [l.id, l]));

      let symRealized = 0;
      const cashFlows: { date: Date; amount: number }[] = [];
      for (const l of symbolLotList) {
        cashFlows.push({ date: new Date(l.purchase_date), amount: -((l.units_original * l.purchase_price_paise) / 100) });
      }
      for (const evt of symbolEvents) {
        const pLot = symLotMap.get(evt.lot_id);
        if (!pLot) continue;
        const gain = evt.units_consumed * (evt.sale_price_paise - pLot.purchase_price_paise);
        symRealized += gain;
        cashFlows.push({ date: new Date(evt.created_at), amount: (evt.units_consumed * evt.sale_price_paise) / 100 });
      }
      const curActiveUnits = symbolLotList.filter(l => l.status === 'ACTIVE').reduce((s, l) => s + l.units_remaining, 0);
      if (curActiveUnits > 0 && resolvedLtp > 0) {
        cashFlows.push({ date: new Date(), amount: (curActiveUnits * resolvedLtp) / 100 });
      }
      setRealizedGainPaise(symRealized);
      setXirr(calculateXIRR(cashFlows));

      setLoadingLtp(false);
    }
    loadSimulationData();
  }, [lot]);

  const totalAvailUnits = symbolLots.reduce((s, l) => s + l.units_remaining, 0);
  const totalInvestedVal = symbolLots.reduce((s, l) => s + (l.units_remaining * l.purchase_price_paise), 0);
  const averageCost = totalAvailUnits > 0 ? Math.round(totalInvestedVal / totalAvailUnits) : 0;
  const currentVal = totalAvailUnits * ltp;
  const totalUnrealizedGain = currentVal - totalInvestedVal;
  const totalReturnPct = totalInvestedVal > 0 ? (totalUnrealizedGain / totalInvestedVal) * 100 : 0;

  // Auto-tag available quantities & FIFO required units
  const autoTagsSummary = React.useMemo(() => getAutoTagsSummary(symbolLots), [symbolLots]);

  // Active selection information for FIFO order precedence notification
  const activeSelectionInfo = React.useMemo(() => {
    if (selectedAutoTags.size === 0) return null;
    return calculateAutoTagUnits(symbolLots, selectedAutoTags);
  }, [symbolLots, selectedAutoTags]);

  const handleToggleAutoTag = (tag: AutoTagType) => {
    const next = new Set(selectedAutoTags);
    if (next.has(tag)) {
      next.delete(tag);
    } else {
      next.add(tag);
    }
    setSelectedAutoTags(next);

    // Calculate required units with strict FIFO precedence (including all prior orders)
    const selectionResult = calculateAutoTagUnits(symbolLots, next);
    const targetUnits = selectionResult.targetUnits;

    setUnits(targetUnits);
    if (targetUnits <= 0) {
      setInputValue('');
    } else if (redeemMode === 'Units') {
      setInputValue(targetUnits.toFixed(3));
    } else if (redeemMode === 'Rupees') {
      setInputValue(Math.round((targetUnits * ltp) / 100).toString());
    } else if (redeemMode === '%') {
      setInputValue(totalAvailUnits > 0 ? ((targetUnits / totalAvailUnits) * 100).toFixed(1) : '');
    }
  };

  const handleInputChange = (valStr: string) => {
    setInputValue(valStr);
    setSelectedAutoTags(new Set());
    if (!valStr.trim()) {
      setUnits(0);
      return;
    }
    const num = parseFloat(valStr);
    if (isNaN(num) || num <= 0) {
      setUnits(0);
      return;
    }

    if (redeemMode === 'Units') {
      setUnits(Math.min(totalAvailUnits, num));
    } else if (redeemMode === 'Rupees') {
      if (ltp > 0) {
        const u = (num * 100) / ltp;
        setUnits(Math.min(totalAvailUnits, u));
      }
    } else if (redeemMode === '%') {
      const u = (totalAvailUnits * Math.min(100, num)) / 100;
      setUnits(Math.min(totalAvailUnits, u));
    }
  };

  const handleModeChange = (newMode: 'Units' | 'Rupees' | '%') => {
    setRedeemMode(newMode);
    if (units > 0) {
      if (newMode === 'Units') {
        setInputValue(units.toFixed(3));
      } else if (newMode === 'Rupees') {
        setInputValue(Math.round((units * ltp) / 100).toString());
      } else if (newMode === '%') {
        setInputValue(totalAvailUnits > 0 ? ((units / totalAvailUnits) * 100).toFixed(1) : '');
      }
    }
  };

  // Multi-lot FIFO simulation
  const simulation = React.useMemo(() => {
    return simulateFifoRedemption({
      lots: symbolLots,
      unitsToSell: units,
      ltp,
      assetClass: lot.asset_class,
      exemptionRoom,
      showOnlySimulated,
    });
  }, [symbolLots, units, ltp, lot.asset_class, exemptionRoom, showOnlySimulated]);

  // Action 1: Tax Harvest (Sell FIFO + Buyback at current NAV)
  async function handleExecuteHarvest() {
    setExecuting(true);
    try {
      const threshold = await getHoldingThresholdMonths(lot.asset_class, Date.now());
      await sellFIFO({
        account_id: lot.account_id,
        symbol: lot.symbol,
        units_to_sell: units,
        sale_price_per_unit_paise: ltp,
        sale_date: Date.now(),
        holding_period_months_threshold: threshold,
      });

      await buyLot({
        account_id: lot.account_id,
        profile_id: lot.profile_id,
        symbol: lot.symbol,
        name: lot.name,
        asset_class: lot.asset_class,
        purchase_date: Date.now(),
        units: units,
        price_per_unit_paise: ltp,
        fees_paise: 0,
        mf_plan: lot.mf_plan,
        mf_option: lot.mf_option,
        isin: lot.isin,
      });

      toast(`Successfully harvested ${units.toFixed(3)} units of ${lot.name || lot.symbol}!`, 'success');
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast(err.message || 'Failed to execute tax harvest.', 'error');
    } finally {
      setExecuting(false);
    }
  }

  // Action 2: Record Sell (Direct FIFO redemption without rebuying)
  async function handleRecordSell() {
    setExecuting(true);
    try {
      const threshold = await getHoldingThresholdMonths(lot.asset_class, Date.now());
      await sellFIFO({
        account_id: lot.account_id,
        symbol: lot.symbol,
        units_to_sell: units,
        sale_price_per_unit_paise: ltp,
        sale_date: Date.now(),
        holding_period_months_threshold: threshold,
      });

      toast(`Successfully recorded sale of ${units.toFixed(3)} units of ${lot.name || lot.symbol}!`, 'success');
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast(err.message || 'Failed to record sale.', 'error');
    } finally {
      setExecuting(false);
    }
  }

  if (loadingLtp) {
    return (
      <div className="modal-overlay" style={{ zIndex: 1100 }}>
        <div className="modal" style={{ maxWidth: 450, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, margin: 'auto' }}>
          <Loader2 size={24} style={{ color: 'var(--green)', animation: 'spin 1s linear infinite' }} />
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="anim-pulse">Loading FIFO Lots…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal slide-up" style={{ maxWidth: 880, width: '95%', padding: 'var(--space-5)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12, marginBottom: 16 }}>
          <div>
            <h2 className="modal-title" style={{ fontSize: 16 }}>Simulate: {lot.name || lot.symbol}</h2>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              {lot.symbol} {lot.isin ? `| ISIN: ${lot.isin}` : ''}
            </span>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          
          {/* Full Holdings Overview Card matching AssetLotsModal */}
          <div
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <div>
                <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Units Held</div>
                <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                  {totalAvailUnits.toFixed(3)}
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
                  {formatINR(ltp, { decimals: 3 })}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Return</div>
                <div style={{
                  fontSize: 12,
                  fontWeight: 650,
                  color: totalUnrealizedGain >= 0 ? 'var(--green)' : 'var(--red)',
                  fontFamily: 'var(--font-mono)',
                  marginTop: 4,
                }}>
                  {totalUnrealizedGain >= 0 ? '+' : ''}{formatINR(totalUnrealizedGain)} ({totalReturnPct.toFixed(2)}%)
                </div>
                {xirr !== null && xirr !== undefined && (
                  <div style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: xirr >= 0 ? 'var(--green)' : 'var(--red)',
                    marginTop: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                  }}>
                    <span>{xirr >= 0 ? '▲' : '▼'}</span>
                    <span>{(xirr * 100).toFixed(2)}% XIRR</span>
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: Invested Value, Realized Return, Current Value */}
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
                  {formatINR(totalInvestedVal)}
                </span>
              </div>
              <div style={{ textAlign: 'center', fontSize: 11 }}>
                <span style={{ color: 'var(--text-tertiary)', marginRight: 6 }}>Realized Return:</span>
                <span style={{ fontWeight: 600, color: realizedGainPaise >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font-mono)' }}>
                  {realizedGainPaise >= 0 ? '+' : ''}{formatINR(realizedGainPaise)}
                </span>
              </div>
              <div style={{ textAlign: 'right', fontSize: 11 }}>
                <span style={{ color: 'var(--text-tertiary)', marginRight: 6 }}>Current Value:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {formatINR(currentVal)}
                </span>
              </div>
            </div>
          </div>

          {/* Two-Column Simulation Control Block */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {/* Column 1: Manual Input with Units / Rupees / % Selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="form-label" style={{ margin: 0, fontWeight: 600, fontSize: 11 }}>
                Simulate Amount / Quantity
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  className="form-input"
                  value={inputValue}
                  onChange={e => handleInputChange(e.target.value)}
                  placeholder={redeemMode === 'Units' ? 'Enter units (e.g. 10.500)...' : redeemMode === 'Rupees' ? 'Enter ₹ amount...' : 'Enter % (e.g. 50)...'}
                  style={{ flex: 1, fontFamily: 'var(--font-mono)', height: 36, fontSize: 13 }}
                />
                <select
                  className="form-select"
                  value={redeemMode}
                  onChange={e => handleModeChange(e.target.value as any)}
                  style={{ width: 104, height: 36, fontSize: 12, fontWeight: 600, padding: '4px 8px' }}
                >
                  <option value="Units">Units</option>
                  <option value="Rupees">Rupees (₹)</option>
                  <option value="%">% Pct</option>
                </select>
              </div>
              {units > 0 && redeemMode !== 'Units' && (
                <div style={{ fontSize: 11, color: 'var(--purple)', fontFamily: 'var(--font-mono)' }}>
                  = {units.toFixed(3)} units ({formatINR(units * ltp)})
                </div>
              )}
            </div>

            {/* Column 2: 2x2 Multiselect Auto Tags */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="form-label" style={{ margin: 0, fontWeight: 600, fontSize: 11, color: 'var(--text-secondary)' }}>
                Auto Tags (2x2 Multi-select)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => handleToggleAutoTag('ALL_LTCG')}
                  style={{
                    fontSize: 11,
                    padding: '6px 8px',
                    borderRadius: 'var(--radius)',
                    fontWeight: selectedAutoTags.has('ALL_LTCG') ? 700 : 500,
                    background: selectedAutoTags.has('ALL_LTCG') ? 'rgba(16, 185, 129, 0.18)' : 'var(--surface-3)',
                    color: selectedAutoTags.has('ALL_LTCG') ? '#10B981' : 'var(--text-secondary)',
                    border: selectedAutoTags.has('ALL_LTCG') ? '1px solid #10B981' : '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1,
                  }}
                >
                  <span>All LTCG ({autoTagsSummary.ALL_LTCG.directUnits.toFixed(3)} u)</span>
                  {autoTagsSummary.ALL_LTCG.priorUnits > 0 && (
                    <span style={{ fontSize: 9, opacity: 0.85, fontWeight: 400 }}>
                      {autoTagsSummary.ALL_LTCG.fifoRequiredUnits.toFixed(3)} u FIFO
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => handleToggleAutoTag('ALL_STCG')}
                  style={{
                    fontSize: 11,
                    padding: '6px 8px',
                    borderRadius: 'var(--radius)',
                    fontWeight: selectedAutoTags.has('ALL_STCG') ? 700 : 500,
                    background: selectedAutoTags.has('ALL_STCG') ? 'rgba(245, 158, 11, 0.18)' : 'var(--surface-3)',
                    color: selectedAutoTags.has('ALL_STCG') ? '#F59E0B' : 'var(--text-secondary)',
                    border: selectedAutoTags.has('ALL_STCG') ? '1px solid #F59E0B' : '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1,
                  }}
                >
                  <span>All STCG ({autoTagsSummary.ALL_STCG.directUnits.toFixed(3)} u)</span>
                  {autoTagsSummary.ALL_STCG.priorUnits > 0 && (
                    <span style={{ fontSize: 9, opacity: 0.85, fontWeight: 400 }}>
                      {autoTagsSummary.ALL_STCG.fifoRequiredUnits.toFixed(3)} u FIFO
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => handleToggleAutoTag('ALL_LTCL')}
                  style={{
                    fontSize: 11,
                    padding: '6px 8px',
                    borderRadius: 'var(--radius)',
                    fontWeight: selectedAutoTags.has('ALL_LTCL') ? 700 : 500,
                    background: selectedAutoTags.has('ALL_LTCL') ? 'rgba(20, 184, 166, 0.18)' : 'var(--surface-3)',
                    color: selectedAutoTags.has('ALL_LTCL') ? '#14B8A6' : 'var(--text-secondary)',
                    border: selectedAutoTags.has('ALL_LTCL') ? '1px solid #14B8A6' : '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1,
                  }}
                >
                  <span>All LTCL ({autoTagsSummary.ALL_LTCL.directUnits.toFixed(3)} u)</span>
                  {autoTagsSummary.ALL_LTCL.priorUnits > 0 && (
                    <span style={{ fontSize: 9, opacity: 0.85, fontWeight: 400 }}>
                      {autoTagsSummary.ALL_LTCL.fifoRequiredUnits.toFixed(3)} u FIFO
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => handleToggleAutoTag('ALL_STCL')}
                  style={{
                    fontSize: 11,
                    padding: '6px 8px',
                    borderRadius: 'var(--radius)',
                    fontWeight: selectedAutoTags.has('ALL_STCL') ? 700 : 500,
                    background: selectedAutoTags.has('ALL_STCL') ? 'rgba(239, 68, 68, 0.18)' : 'var(--surface-3)',
                    color: selectedAutoTags.has('ALL_STCL') ? '#EF4444' : 'var(--text-secondary)',
                    border: selectedAutoTags.has('ALL_STCL') ? '1px solid #EF4444' : '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1,
                  }}
                >
                  <span>All STCL ({autoTagsSummary.ALL_STCL.directUnits.toFixed(3)} u)</span>
                  {autoTagsSummary.ALL_STCL.priorUnits > 0 && (
                    <span style={{ fontSize: 9, opacity: 0.85, fontWeight: 400 }}>
                      {autoTagsSummary.ALL_STCL.fifoRequiredUnits.toFixed(3)} u FIFO
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* FIFO Precedence Callout Banner when earlier orders are required */}
          {activeSelectionInfo && activeSelectionInfo.priorUnits > 0 && (
            <div
              style={{
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: 'var(--radius)',
                padding: '10px 14px',
                fontSize: 11,
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
              }}
            >
              <Info size={16} style={{ color: 'var(--blue)', flexShrink: 0, marginTop: 1 }} />
              <div style={{ lineHeight: 1.45 }}>
                <strong style={{ color: 'var(--text-primary)' }}>FIFO Order Precedence: </strong>
                To sell all selected ({activeSelectionInfo.directTagUnits.toFixed(3)} u), FIFO mandates that{' '}
                <strong>{activeSelectionInfo.priorUnits.toFixed(3)} units</strong> from earlier orders (
                {activeSelectionInfo.priorBreakdown.map((b, i) => (
                  <span key={b.tag}>
                    {i > 0 ? ', ' : ''}
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{b.units.toFixed(3)} u {b.tag}</span>
                  </span>
                ))}
                ) must also be redeemed first. Total redemption: <strong>{activeSelectionInfo.targetUnits.toFixed(3)} units</strong>.
              </div>
            </div>
          )}

          {/* FIFO Lot Breakdown Table (Fixed Height, No Page Restructuring) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                FIFO Lot Breakdown ({simulation.displayedLots.length} {simulation.displayedLots.length === 1 ? 'Lot' : 'Lots'} {units > 0 ? (showOnlySimulated ? 'Simulated' : 'Showing All') : 'Available'}):
              </div>
              {units > 0 && (
                <button
                  type="button"
                  onClick={() => setShowOnlySimulated(!showOnlySimulated)}
                  className="btn btn-ghost btn-xs"
                  style={{ fontSize: 10, color: 'var(--purple)', fontWeight: 600, padding: '2px 6px', height: 20 }}
                >
                  {showOnlySimulated ? 'Show all lots' : 'Show only simulated'}
                </button>
              )}
            </div>
            <div className="table-wrap" style={{ height: 180, maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)' }}>
              <table className="compact-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="r">Hold</th>
                    <th className="c">Tag</th>
                    <th className="r">Units</th>
                    <th className="r">Simulated</th>
                    <th className="r">NAV</th>
                    <th className="r">Gain / Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {simulation.displayedLots.map((lb, idx) => {
                    const isSelected = lb.consumedUnits > 0;
                    const tagBadge = lb.isLT
                      ? (lb.fullLotGain >= 0 ? 'badge-green' : 'badge-teal')
                      : (lb.fullLotGain >= 0 ? 'badge-amber' : 'badge-red');

                    return (
                      <tr key={idx} style={{ background: isSelected ? 'rgba(139, 92, 246, 0.08)' : 'transparent' }}>
                        <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{formatDate(lb.purchase_date)}</td>
                        <td className="r num td-dim" style={{ fontSize: 11 }}>{lb.months}mo</td>
                        <td className="c">
                          <span className={`badge ${tagBadge}`} style={{ fontSize: 9, padding: '1px 5px' }}>
                            {lb.tag}
                          </span>
                        </td>
                        <td className="r num" style={{ fontSize: 11 }}>{lb.units_remaining.toFixed(3)}</td>
                        <td className="r num" style={{ fontSize: 11, fontWeight: isSelected ? 700 : 400, color: isSelected ? 'var(--purple)' : 'var(--text-tertiary)' }}>
                          {units > 0 ? lb.consumedUnits.toFixed(3) : '—'}
                        </td>
                        <td className="r num td-dim" style={{ fontSize: 11 }}>{formatINR(lb.purchase_price_paise, { decimals: 3 })}</td>
                        <td className="r num" style={{ fontSize: 11, fontWeight: 600 }}>
                          <span className={lb.lotGain >= 0 ? 'positive' : 'negative'}>
                            {lb.lotGain >= 0 ? '+' : ''}{formatINR(lb.lotGain)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Dynamic REDEEMED PORTION SUMMARY */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', display: 'block', marginBottom: 10 }}>
              REDEEMED PORTION SUMMARY ({units.toFixed(3)} Units)
            </span>

            {units <= 0 ? (
              <div style={{ padding: '14px', textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)', background: 'var(--surface-2)', borderRadius: 'var(--radius)' }}>
                Select an auto-tag or enter units / amount above to simulate redemption.
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, background: 'var(--surface-2)', padding: 12, borderRadius: 'var(--radius)', marginBottom: 12 }}>
                  {simulation.ltcgGainPaise > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>LTCG Harvested</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', marginTop: 2 }}>
                        {simulation.ltcgUnitsConsumed.toFixed(3)} units (+{formatINR(simulation.ltcgGainPaise)})
                      </div>
                    </div>
                  )}
                  {simulation.stcgGainPaise > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>STCG Harvested</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', marginTop: 2 }}>
                        {simulation.stcgUnitsConsumed.toFixed(3)} units (+{formatINR(simulation.stcgGainPaise)})
                      </div>
                    </div>
                  )}
                  {simulation.ltclPaise > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>LTCL Booked</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#14B8A6', marginTop: 2 }}>
                        {simulation.ltclUnitsConsumed.toFixed(3)} units (−{formatINR(simulation.ltclPaise)})
                      </div>
                    </div>
                  )}
                  {simulation.stclPaise > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>STCL Booked</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#EF4444', marginTop: 2 }}>
                        {simulation.stclUnitsConsumed.toFixed(3)} units (−{formatINR(simulation.stclPaise)})
                      </div>
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Total Invested Amount</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                      {formatINR(simulation.totalInvestedPaise)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Total Current Value</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                      {formatINR(simulation.totalCurrentPaise)}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Pre-tax Total Gain/Loss:</span>
                    <span style={{ fontWeight: 600 }} className={simulation.totalGainPaise >= 0 ? 'positive' : 'negative'}>
                      {simulation.totalGainPaise >= 0 ? '+' : ''}{formatINR(simulation.totalGainPaise)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Estimated Tax Liability:</span>
                    <span style={{ fontWeight: 600 }} className={simulation.estimatedTax > 0 ? 'negative' : ''}>
                      {simulation.estimatedTax > 0 ? '−' : ''}{formatINR(simulation.estimatedTax)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 6 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Net Post-tax Value:</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {formatINR(simulation.netPostTaxGain)}
                    </span>
                  </div>
                </div>

                {simulation.taxExplanation && (
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.4, background: 'var(--surface-3)', padding: 8, borderRadius: 'var(--radius)', borderLeft: '3px solid var(--purple)' }}>
                    💡 <strong>Tax rules applied</strong>: {simulation.taxExplanation}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Three Action Buttons: Cancel, Tax Harvest, Record Sell */}
        <div className="modal-footer" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12, marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={executing}>
            Cancel
          </button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleExecuteHarvest}
              disabled={executing || units <= 0}
              style={{ borderColor: 'var(--purple)', color: 'var(--purple)', fontWeight: 600 }}
              title="Harvest tax gains/losses by selling FIFO and immediately rebuying at current NAV"
            >
              Tax Harvest
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleRecordSell}
              disabled={executing || units <= 0}
              style={{ background: 'var(--red)', borderColor: 'var(--red)', color: '#fff', fontWeight: 600 }}
              title="Record an actual redemption sale of these units"
            >
              {executing ? 'Processing...' : 'Record Sell'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
