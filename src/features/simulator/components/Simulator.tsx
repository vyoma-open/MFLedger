import React, { useState, useEffect } from 'react';
import { Save, Trash2, TrendingUp, Sparkles } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type InvestmentLot } from '@/db/schema';
import { computeBalance } from '@/engines/balance';
import { useAccount } from '@/contexts/AccountContext';
import { getSetting, setSetting } from '@/db/seed';
import { Topbar } from '@/components/Topbar/Topbar';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { calculateSIP } from '@/features/simulator/utils/simulatorMath';
import { PortfolioTab } from './tabs/PortfolioTab';
import { SIPTab } from './tabs/SIPTab';
import { analyzeSipStreams, type EnrichedSipStream } from '@/engines/sipDetector';

interface SavedSimulation {
  id: string;
  name: string;
  type: 'PORTFOLIO' | 'SIP';
  inputs: Record<string, any>;
  created_at: number;
}

const compactFormatter = (val: number) => {
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`;
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(0)}k`;
  return `₹${val}`;
};

export default function Simulator() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { accounts, selectedAccountId } = useAccount();
  const [activeTab, setActiveTab] = useState<'PORTFOLIO' | 'SIP'>('PORTFOLIO');

  // Saved Simulators
  const [savedSims, setSavedSims] = useState<SavedSimulation[]>([]);
  const [simName, setSimName] = useState('');

  // ─── SIP & Portfolio Inputs ──────────────────────────────────────
  const [sipMonthly, setSipMonthly] = useState(10000);
  const [lumpsum, setLumpsum] = useState(100000);
  const [sipRate, setSipRate] = useState(12);
  const [sipTenure, setSipTenure] = useState(10);
  const [sipTenureType, setSipTenureType] = useState<'years' | 'months'>('years');
  const [inflationRate, setInflationRate] = useState(6);
  const [stepUpSip, setStepUpSip] = useState(0);

  // FIRE Target States
  const [showFireTarget, setShowFireTarget] = useState(false);
  const [fireTarget, setFireTarget] = useState(20000000);

  // ─── Live Account-Aware Portfolio Connections ──────────────────────
  const recurring = useLiveQuery(() => db.recurring_templates.where('is_active').equals(1).toArray(), []);

  const activeViewAccounts = accounts?.filter(a => {
    if (a.is_archived === 1) return false;
    if (selectedAccountId !== 'ALL') {
      return a.id === selectedAccountId;
    }
    return true;
  }) || [];

  const investmentAccountIds = activeViewAccounts
    .filter(a => a.type === 'MF')
    .map(a => a.id);

  const allHoldingLots = useLiveQuery(
    () => {
      const q = db.investment_lots.where('status').equals('ACTIVE');
      if (selectedAccountId !== 'ALL') {
        return q.filter(l => l.account_id === selectedAccountId).toArray();
      }
      return q.toArray();
    },
    [selectedAccountId]
  );
  const marketCacheEntries = useLiveQuery(() => db.market_cache.toArray(), []);

  const enrichedActiveSips: EnrichedSipStream[] = React.useMemo(() => {
    const list: EnrichedSipStream[] = [];
    const seenSymbols = new Set<string>();
    const now = Date.now();

    const templateSips = recurring?.filter(t =>
      t.is_active === 1 &&
      t.frequency === 'MONTHLY' &&
      ((t.to_account_id && investmentAccountIds.includes(t.to_account_id)) || t.asset_class)
    ) || [];

    const cacheMap = new Map<string, number>();
    for (const c of marketCacheEntries || []) {
      cacheMap.set(c.symbol.toUpperCase(), c.nav_paise);
    }

    const lotsBySym = new Map<string, InvestmentLot[]>();
    for (const l of allHoldingLots || []) {
      const sym = l.symbol.toUpperCase();
      if (!lotsBySym.has(sym)) lotsBySym.set(sym, []);
      lotsBySym.get(sym)!.push(l);
    }

    for (const t of templateSips) {
      const sym = t.name.replace(/ SIP$/i, '').trim().toUpperCase();
      seenSymbols.add(sym);

      const symLots = lotsBySym.get(sym) || [];
      const currentPrice = cacheMap.get(sym) ?? (symLots[0]?.purchase_price_paise || 1000);
      const analytics = analyzeSipStreams(symLots, currentPrice, now, true);

      list.push({
        id: t.id,
        name: t.name,
        symbol: sym,
        monthlyAmount: t.amount_paise / 100,
        accumulatedWealth: analytics.hasSip ? Math.round(analytics.sipCurrentValue / 100) : 0,
        totalInvested: analytics.hasSip ? Math.round(analytics.sipInvested / 100) : 0,
        historicalXirr: analytics.sipXirr,
        startDate: analytics.sipStartDate,
        installments: analytics.sipInstallmentCount,
        status: 'ACTIVE',
        isActive: true,
        source: 'RECURRING_TEMPLATE',
      });
    }

    for (const [sym, symLots] of lotsBySym) {
      if (seenSymbols.has(sym)) continue;

      const currentPrice = cacheMap.get(sym) ?? (symLots[0]?.purchase_price_paise || 1000);
      const analytics = analyzeSipStreams(symLots, currentPrice, now, false);

      if (analytics.hasSip && analytics.isSipActive) {
        seenSymbols.add(sym);
        const fundName = symLots[0]?.name || sym;
        const monthlyAmount = Math.round(analytics.latestSipAmountPaise / 100);

        list.push({
          id: `stream_${sym}`,
          name: `${fundName} (Active SIP)`,
          symbol: sym,
          monthlyAmount,
          accumulatedWealth: Math.round(analytics.sipCurrentValue / 100),
          totalInvested: Math.round(analytics.sipInvested / 100),
          historicalXirr: analytics.sipXirr,
          startDate: analytics.sipStartDate,
          installments: analytics.sipInstallmentCount,
          status: analytics.sipStatus,
          isActive: true,
          source: 'HOLDING_LOTS',
        });
      }
    }

    return list;
  }, [recurring, investmentAccountIds, allHoldingLots, marketCacheEntries]);

  const recurringSipTotal = enrichedActiveSips.reduce((sum, item) => sum + item.monthlyAmount, 0);

  const currentPortfolioValue = useLiveQuery(async () => {
    if (!accounts) return 0;
    const filteredAccs = accounts.filter(a => {
      if (a.is_archived === 1) return false;
      if (selectedAccountId !== 'ALL') return a.id === selectedAccountId;
      return true;
    });

    const investmentAccounts = filteredAccs.filter(a => a.type === 'MF');
    let total = 0;
    for (const acc of investmentAccounts) {
      const bal = await computeBalance(acc.id);
      total += bal;
    }
    return total / 100;
  }, [accounts, selectedAccountId]) || 0;

  useEffect(() => {
    async function loadSaved() {
      const list = await getSetting<SavedSimulation[]>('simulators');
      if (list && list.length > 0) {
        setSavedSims(list.filter(s => s.type === 'PORTFOLIO' || s.type === 'SIP'));
      } else {
        const initial: SavedSimulation[] = [
          {
            id: 'sim_1',
            name: '🎯 Retirement SIP Multiplier',
            type: 'SIP',
            inputs: { monthly: 25000, lumpsum: 200000, rate: 12.5, tenure: 15, tenureType: 'years', inflation: 6, stepUpSip: 5, showFireTarget: true, fireTarget: 20000000 },
            created_at: Date.now()
          },
          {
            id: 'sim_2',
            name: '🚀 15-15-15 Wealth Rule',
            type: 'SIP',
            inputs: { monthly: 15000, lumpsum: 0, rate: 15, tenure: 15, tenureType: 'years', inflation: 6, stepUpSip: 0, showFireTarget: true, fireTarget: 10000000 },
            created_at: Date.now()
          }
        ];
        await setSetting('simulators', initial);
        setSavedSims(initial);
      }
    }
    loadSaved();
  }, []);

  async function saveSimulation() {
    if (!simName.trim()) {
      toast('Please enter a name for your simulation.', 'error');
      return;
    }
    const inputs = activeTab === 'PORTFOLIO'
      ? { monthly: sipMonthly, lumpsum: currentPortfolioValue, rate: sipRate, tenure: sipTenure, tenureType: sipTenureType, inflation: inflationRate, stepUpSip, showFireTarget, fireTarget }
      : { monthly: sipMonthly, lumpsum, rate: sipRate, tenure: sipTenure, tenureType: sipTenureType, inflation: inflationRate, stepUpSip, showFireTarget, fireTarget };

    const newSim: SavedSimulation = {
      id: 'sim_' + Date.now(),
      name: simName.trim(),
      type: activeTab,
      inputs,
      created_at: Date.now(),
    };

    const updated = [newSim, ...savedSims];
    await setSetting('simulators', updated);
    setSavedSims(updated);
    setSimName('');
    toast('Simulation saved successfully.', 'success');
  }

  async function deleteSimulation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Delete Simulation',
      message: 'Delete this saved simulation?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!ok) return;
    const updated = savedSims.filter(s => s.id !== id);
    await setSetting('simulators', updated);
    setSavedSims(updated);
    toast('Simulation deleted.', 'info');
  }

  function loadSimulation(sim: SavedSimulation) {
    setActiveTab(sim.type);
    setSipMonthly(sim.inputs.monthly || 0);
    setLumpsum(sim.inputs.lumpsum || 0);
    setSipRate(sim.inputs.rate || 12);
    setSipTenure(sim.inputs.tenure || 10);
    setSipTenureType(sim.inputs.tenureType || 'years');
    setInflationRate(sim.inputs.inflation ?? 6);
    setStepUpSip(sim.inputs.stepUpSip ?? 0);
    setShowFireTarget(sim.inputs.showFireTarget ?? false);
    setFireTarget(sim.inputs.fireTarget ?? 20000000);
    toast(`Loaded "${sim.name}"`, 'info');
  }

  function getSimulationSummary(sim: SavedSimulation): string {
    const monthly = sim.inputs.monthly || 0;
    const lumpsumVal = sim.type === 'PORTFOLIO' ? currentPortfolioValue : (sim.inputs.lumpsum || 0);
    const rate = sim.inputs.rate || 12;
    const tenure = sim.inputs.tenure || 10;
    const tenureTypeVal = sim.inputs.tenureType || 'years';
    const stepUp = sim.inputs.stepUpSip ?? 0;
    const inflation = sim.inputs.inflation ?? 6;

    const { finalWealth } = calculateSIP({
      lumpsum: lumpsumVal,
      monthly,
      rate,
      tenureMonths: tenureTypeVal === 'years' ? tenure * 12 : tenure,
      stepUpPercent: stepUp,
      inflationRate: inflation,
      showFireTarget: false,
      fireTarget: 0,
    });

    const label = sim.type === 'PORTFOLIO' ? 'Port' : 'SIP';
    return `${label}: ${compactFormatter(monthly)}/mo · Val: ${compactFormatter(finalWealth)}`;
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Topbar title="SIP & Portfolio Simulator" />

      <div className="page" style={{ overflowY: 'auto', paddingBottom: 80 }}>

        {/* Saved Scenarios Row */}
        {savedSims.length > 0 && (
          <div className="sim-scenarios-row">
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', flexShrink: 0 }}>Saved:</span>
            {savedSims.map(sim => (
              <div
                key={sim.id}
                style={{
                  padding: '8px 14px', cursor: 'pointer', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap', borderRadius: 12,
                  background: 'var(--surface)', boxShadow: 'var(--shadow-sm)', transition: 'all 0.2s', flexShrink: 0
                }}
                onClick={() => loadSimulation(sim)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TrendingUp size={14} color="var(--green)" />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{sim.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      {getSimulationSummary(sim)}
                    </span>
                  </div>
                </div>
                <button className="btn btn-ghost btn-icon" style={{ width: 18, height: 18, minHeight: 18, padding: 0 }} onClick={(e) => deleteSimulation(sim.id, e)}>
                  <Trash2 size={12} color="var(--text-tertiary)" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Single-line Row: Types Tabs (left) & Scenario Name + Save (right) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          margin: '12px 0 20px 0',
          flexWrap: 'nowrap',
          width: '100%',
        }}>
          {/* Tab Toggle - 2 Pills */}
          <div className="simulator-tabs-container" style={{ margin: 0, flex: '1 1 auto', minWidth: 0, maxWidth: 'max-content', display: 'flex' }}>
            <button
              onClick={() => setActiveTab('PORTFOLIO')}
              style={{
                flex: '1 1 auto',
                padding: 'clamp(6px, 0.8vw, 8px) clamp(10px, 1.4vw, 20px)',
                borderRadius: 26,
                cursor: 'pointer',
                border: activeTab === 'PORTFOLIO' ? '1px solid var(--border-subtle)' : '1px solid transparent',
                background: activeTab === 'PORTFOLIO' ? 'var(--surface)' : 'transparent',
                color: activeTab === 'PORTFOLIO' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: activeTab === 'PORTFOLIO' ? 600 : 500,
                boxShadow: activeTab === 'PORTFOLIO' ? '0 2px 6px rgba(0,0,0,0.1)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'all 0.2s',
                fontSize: 'clamp(11px, 1.05vw, 13px)',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              <TrendingUp size={15} color={activeTab === 'PORTFOLIO' ? 'var(--green)' : 'currentColor'} style={{ flexShrink: 0 }} />
              <span className="truncate">Portfolio Projection</span>
            </button>
            <button
              onClick={() => setActiveTab('SIP')}
              style={{
                flex: '1 1 auto',
                padding: 'clamp(6px, 0.8vw, 8px) clamp(10px, 1.4vw, 20px)',
                borderRadius: 26,
                cursor: 'pointer',
                border: activeTab === 'SIP' ? '1px solid var(--border-subtle)' : '1px solid transparent',
                background: activeTab === 'SIP' ? 'var(--surface)' : 'transparent',
                color: activeTab === 'SIP' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: activeTab === 'SIP' ? 600 : 500,
                boxShadow: activeTab === 'SIP' ? '0 2px 6px rgba(0,0,0,0.1)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'all 0.2s',
                fontSize: 'clamp(11px, 1.05vw, 13px)',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              <Sparkles size={15} color={activeTab === 'SIP' ? 'var(--green)' : 'currentColor'} style={{ flexShrink: 0 }} />
              <span className="truncate">Custom SIP & Step-Up</span>
            </button>
          </div>

          {/* Save Area */}
          <div className="sim-save-area" style={{ margin: 0, flex: '1 1 240px', minWidth: 160, maxWidth: 380, display: 'flex', alignItems: 'center' }}>
            <input
              className="form-input"
              placeholder="Save scenario name…"
              style={{ flex: 1, border: 'none', background: 'transparent', padding: '0 8px', fontSize: 'clamp(11px, 1vw, 13px)', boxShadow: 'none', minWidth: 0 }}
              value={simName}
              onChange={e => setSimName(e.target.value)}
            />
            <button className="btn btn-primary btn-sm flex items-center gap-1" style={{ borderRadius: 24, padding: '6px 16px', flexShrink: 0 }} onClick={saveSimulation}>
              <Save size={14} /> Save
            </button>
          </div>
        </div>

        {/* Active Tab View */}
        {activeTab === 'PORTFOLIO' && (
          <PortfolioTab
            currentPortfolioValue={currentPortfolioValue}
            sipMonthly={sipMonthly}
            setSipMonthly={setSipMonthly}
            sipRate={sipRate}
            setSipRate={setSipRate}
            sipTenure={sipTenure}
            setSipTenure={setSipTenure}
            sipTenureType={sipTenureType}
            setSipTenureType={setSipTenureType}
            inflationRate={inflationRate}
            setInflationRate={setInflationRate}
            stepUpSip={stepUpSip}
            setStepUpSip={setStepUpSip}
            showFireTarget={showFireTarget}
            setShowFireTarget={setShowFireTarget}
            fireTarget={fireTarget}
            setFireTarget={setFireTarget}
            recurringSipTotal={recurringSipTotal}
            activeSips={enrichedActiveSips}
          />
        )}

        {activeTab === 'SIP' && (
          <SIPTab
            sipMonthly={sipMonthly}
            setSipMonthly={setSipMonthly}
            lumpsum={lumpsum}
            setLumpsum={setLumpsum}
            sipRate={sipRate}
            setSipRate={setSipRate}
            sipTenure={sipTenure}
            setSipTenure={setSipTenure}
            sipTenureType={sipTenureType}
            setSipTenureType={setSipTenureType}
            inflationRate={inflationRate}
            setInflationRate={setInflationRate}
            stepUpSip={stepUpSip}
            setStepUpSip={setStepUpSip}
            showFireTarget={showFireTarget}
            setShowFireTarget={setShowFireTarget}
            fireTarget={fireTarget}
            setFireTarget={setFireTarget}
            recurringSipTotal={recurringSipTotal}
            activeSips={enrichedActiveSips}
          />
        )}
      </div>
    </div>
  );
}
