import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, ChevronDown } from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Area, Line, ReferenceLine
} from 'recharts';
import { formatINR } from '@/utils/currency';
import { calculateSIP } from '@/features/simulator/utils/simulatorMath';
import { useToast } from '@/contexts/ToastContext';

interface SIPTabProps {
  sipMonthly: number;
  setSipMonthly: React.Dispatch<React.SetStateAction<number>>;
  lumpsum: number;
  setLumpsum: React.Dispatch<React.SetStateAction<number>>;
  sipRate: number;
  setSipRate: React.Dispatch<React.SetStateAction<number>>;
  sipTenure: number;
  setSipTenure: React.Dispatch<React.SetStateAction<number>>;
  sipTenureType: 'years' | 'months';
  setSipTenureType: React.Dispatch<React.SetStateAction<'years' | 'months'>>;
  inflationRate: number;
  setInflationRate: React.Dispatch<React.SetStateAction<number>>;
  stepUpSip: number;
  setStepUpSip: React.Dispatch<React.SetStateAction<number>>;
  showFireTarget: boolean;
  setShowFireTarget: React.Dispatch<React.SetStateAction<boolean>>;
  fireTarget: number;
  setFireTarget: React.Dispatch<React.SetStateAction<number>>;
  recurringSipTotal: number;
  activeSips: any[];
}

const compactFormatter = (val: number) => {
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`;
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(0)}k`;
  return `₹${val}`;
};

export function SIPTab({
  sipMonthly,
  setSipMonthly,
  lumpsum,
  setLumpsum,
  sipRate,
  setSipRate,
  sipTenure,
  setSipTenure,
  sipTenureType,
  setSipTenureType,
  inflationRate,
  setInflationRate,
  stepUpSip,
  setStepUpSip,
  showFireTarget,
  setShowFireTarget,
  fireTarget,
  setFireTarget,
  recurringSipTotal,
  activeSips,
}: SIPTabProps) {
  const { toast } = useToast();
  const [sipDropdownOpen, setSipDropdownOpen] = useState(false);
  const [selectedSipName, setSelectedSipName] = useState('');
  const sipDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (sipDropdownRef.current && !sipDropdownRef.current.contains(e.target as Node)) {
        setSipDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const tenureMonths = sipTenureType === 'years' ? sipTenure * 12 : sipTenure;

  const {
    rows: sipInvestmentRows,
    finalWealth: finalSipWealth,
    finalPrincipal: finalSipPrincipal,
    finalReturns: finalSipReturns,
    finalRealWealth,
    fireReachedMonth,
  } = calculateSIP({
    lumpsum,
    monthly: sipMonthly,
    rate: sipRate,
    tenureMonths,
    stepUpPercent: stepUpSip,
    inflationRate,
    showFireTarget,
    fireTarget,
  });

  const realGain = finalRealWealth - finalSipPrincipal;

  return (
    <>
      <div className="sim-layout">
        {/* Left Column: Inputs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              Investment Strategy
            </div>

            {/* Custom Single-Line Down-Toggle for active SIPs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 16 }}>
              <div style={{ position: 'relative', display: 'inline-block' }} ref={sipDropdownRef}>
                <div
                  onClick={() => setSipDropdownOpen(!sipDropdownOpen)}
                  className="custom-select-trigger"
                >
                  <span>🔗 Link to Active SIPs <strong style={{ color: 'var(--text-primary)' }}>{selectedSipName}</strong></span>
                  <ChevronDown size={13} style={{ transform: sipDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--text-tertiary)' }} />
                </div>

                {sipDropdownOpen && (
                  <div className="custom-dropdown-menu">
                    {recurringSipTotal > 0 && (
                      <div
                        onClick={() => {
                          setSipMonthly(recurringSipTotal);
                          setSelectedSipName('All SIPs');
                          setSipDropdownOpen(false);
                          toast(`Linked to all SIPs: ${formatINR(recurringSipTotal * 100)}`, 'success');
                        }}
                        className="custom-dropdown-item"
                        style={{ fontWeight: 700, color: 'var(--green)', background: 'var(--green-glow)' }}
                      >
                        <span>🌟 All Active SIPs</span>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{compactFormatter(recurringSipTotal)}</span>
                      </div>
                    )}

                    {activeSips.length === 0 ? (
                      <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                        No active SIPs found
                      </div>
                    ) : (
                      activeSips.map(t => {
                        const amt = t.monthlyAmount ?? (t.amount_paise ? t.amount_paise / 100 : 0);
                        const xirrPct = t.historicalXirr ? (t.historicalXirr * 100).toFixed(2) : null;
                        return (
                          <div
                            key={t.id}
                            onClick={() => {
                              setSipMonthly(amt);
                              if (t.historicalXirr && t.historicalXirr > 0) {
                                const roundedRate = Math.round(t.historicalXirr * 1000) / 10;
                                setSipRate(roundedRate);
                              }
                              if (t.accumulatedWealth && t.accumulatedWealth > 0) {
                                setLumpsum(Math.round(t.accumulatedWealth));
                              }
                              setSelectedSipName(t.name);
                              setSipDropdownOpen(false);
                              toast(`Linked to SIP "${t.name}" (${compactFormatter(amt)}/mo${xirrPct ? ` · ${xirrPct}% Hist. XIRR` : ''})`, 'success');
                            }}
                            className="custom-dropdown-item"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 12px' }}
                          >
                            <div className="truncate" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontSize: 12, fontWeight: 500 }}>{t.name}</span>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                {xirrPct && (
                                  <span className="badge badge-green" style={{ fontSize: 8, padding: '1px 4px' }}>
                                    {xirrPct}% XIRR
                                  </span>
                                )}
                                {t.accumulatedWealth > 0 && (
                                  <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
                                    {compactFormatter(t.accumulatedWealth)} accumulated
                                  </span>
                                )}
                              </div>
                            </div>
                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12 }}>{compactFormatter(amt)}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <div className="flex justify-between items-center mb-1">
                <label className="form-label" style={{ margin: 0, color: 'var(--text-secondary)' }}>Monthly SIP</label>
                <div className="sim-input-wrap">
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>₹</span>
                  <input type="number" className="sim-input-box" value={sipMonthly === 0 ? 0 : (sipMonthly || '')} onChange={e => setSipMonthly(Number(e.target.value))} />
                </div>
              </div>
              <input type="range" className="minimal-slider" style={{ color: 'var(--green)' }} min="0" max="200000" step="1000" value={sipMonthly} onChange={e => setSipMonthly(parseInt(e.target.value))} />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <div className="flex justify-between items-center mb-1">
                <label className="form-label" style={{ margin: 0, color: 'var(--text-secondary)' }}>Step-up SIP (p.a.)</label>
                <div className="sim-input-wrap">
                  <input type="number" className="sim-input-box" value={stepUpSip === 0 ? 0 : (stepUpSip || '')} onChange={e => setStepUpSip(Number(e.target.value))} />
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>%</span>
                </div>
              </div>
              <input type="range" className="minimal-slider" style={{ color: 'var(--green)' }} min="0" max="50" step="1" value={stepUpSip} onChange={e => setStepUpSip(parseFloat(e.target.value))} />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <div className="flex justify-between items-center mb-1">
                <label className="form-label" style={{ margin: 0, color: 'var(--text-secondary)' }}>Lumpsum (Initial)</label>
                <div className="sim-input-wrap">
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>₹</span>
                  <input type="number" className="sim-input-box" value={lumpsum === 0 ? 0 : (lumpsum || '')} onChange={e => setLumpsum(Number(e.target.value))} />
                </div>
              </div>
              <input type="range" className="minimal-slider" style={{ color: 'var(--green)' }} min="0" max="5000000" step="10000" value={lumpsum} onChange={e => setLumpsum(parseInt(e.target.value))} />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <div className="flex justify-between items-center mb-1">
                <label className="form-label" style={{ margin: 0, color: 'var(--text-secondary)' }}>Expected Return (p.a.)</label>
                <div className="sim-input-wrap">
                  <input type="number" className="sim-input-box" value={sipRate === 0 ? 0 : (sipRate || '')} onChange={e => setSipRate(Number(e.target.value))} />
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>%</span>
                </div>
              </div>
              <input type="range" className="minimal-slider" style={{ color: 'var(--green)' }} min="0" max="30" step="0.5" value={sipRate} onChange={e => setSipRate(parseFloat(e.target.value))} />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <div className="flex justify-between items-center mb-1">
                <label className="form-label" style={{ margin: 0, color: 'var(--text-secondary)' }}>Inflation (p.a.)</label>
                <div className="sim-input-wrap">
                  <input type="number" className="sim-input-box" value={inflationRate === 0 ? 0 : (inflationRate || '')} onChange={e => setInflationRate(Number(e.target.value))} />
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>%</span>
                </div>
              </div>
              <input type="range" className="minimal-slider" style={{ color: 'var(--green)' }} min="0" max="15" step="0.5" value={inflationRate} onChange={e => setInflationRate(parseFloat(e.target.value))} />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <div className="flex justify-between items-center mb-1">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label className="form-label" style={{ margin: 0, color: 'var(--text-secondary)' }}>Time Horizon</label>
                  <div className="flex" style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                    <button type="button" style={{ padding: '2px 8px', fontSize: 11, background: sipTenureType === 'years' ? 'var(--green-glow)' : 'transparent', border: 'none', cursor: 'pointer', color: sipTenureType === 'years' ? 'var(--green)' : 'var(--text-secondary)' }} onClick={() => { setSipTenureType('years'); setSipTenure(Math.ceil(sipTenure / 12) || 1); }}>Y</button>
                    <button type="button" style={{ padding: '2px 8px', fontSize: 11, background: sipTenureType === 'months' ? 'var(--green-glow)' : 'transparent', border: 'none', cursor: 'pointer', color: sipTenureType === 'months' ? 'var(--green)' : 'var(--text-secondary)' }} onClick={() => { setSipTenureType('months'); setSipTenure(sipTenure * 12 || 12); }}>M</button>
                  </div>
                </div>
                <div className="sim-input-wrap">
                  <input type="number" className="sim-input-box" value={sipTenure === 0 ? 0 : (sipTenure || '')} onChange={e => setSipTenure(Number(e.target.value))} />
                </div>
              </div>
              <input type="range" className="minimal-slider" style={{ color: 'var(--green)' }} min="1" max={sipTenureType === 'years' ? 40 : 480} step="1" value={sipTenure} onChange={e => setSipTenure(parseInt(e.target.value))} />
            </div>
          </div>

          {/* FIRE Target Settings block */}
          <div className="card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12, border: '1px dashed var(--border-subtle)', background: 'var(--surface-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={showFireTarget} onChange={e => setShowFireTarget(e.target.checked)} style={{ width: 15, height: 15 }} />
                🔥 Enable FIRE Target
              </label>
              {showFireTarget && (
                <div className="sim-input-wrap">
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>₹</span>
                  <input type="number" className="sim-input-box" style={{ width: 85 }} value={fireTarget === 0 ? 0 : (fireTarget || '')} onChange={e => setFireTarget(Number(e.target.value))} />
                </div>
              )}
            </div>
            {showFireTarget && (
              <div>
                <input type="range" className="minimal-slider" style={{ color: 'var(--green)' }} min="1000000" max="100000000" step="500000" value={fireTarget} onChange={e => setFireTarget(parseInt(e.target.value))} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-tertiary)' }}>
                  <span>₹10L</span>
                  <span>₹5Cr</span>
                  <span>₹10Cr</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Visualizations & Overview Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* FIRE Milestone Success Banner */}
          {showFireTarget && fireReachedMonth !== -1 && (
            <div style={{ background: 'var(--green-glow)', border: '1px solid var(--green)', padding: '12px 16px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24 }}>🎉</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>FIRE Milestone Achieved!</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  You will cross your target of <strong>{formatINR(fireTarget * 100)}</strong> in{' '}
                  <strong>
                    {Math.floor(fireReachedMonth / 12) > 0 ? `${Math.floor(fireReachedMonth / 12)} years ` : ''}
                    {fireReachedMonth % 12 > 0 ? `${fireReachedMonth % 12} months` : ''}
                  </strong>{' '}
                  (at Year {Math.ceil(fireReachedMonth / 12)}).
                </div>
              </div>
            </div>
          )}
          {showFireTarget && fireReachedMonth === -1 && (
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', padding: '12px 16px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24 }}>⏳</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>FIRE Target Out of Reach</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  Your wealth will reach <strong>{formatINR(finalSipWealth * 100)}</strong> at the end of the {sipTenure} year horizon, which is short of your <strong>{formatINR(fireTarget * 100)}</strong> target. Try increasing your SIP or expected returns!
                </div>
              </div>
            </div>
          )}
          {/* Chart Area */}
          <div className="card sim-chart-card">
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20 }}>
              Wealth Projection
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={sipInvestmentRows} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
                <defs>
                  <linearGradient id="colorWealth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--green)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--green)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorPrincipal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--blue)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--blue)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="year"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: 'var(--text-tertiary)', dy: 15 }}
                  tickFormatter={(val) => `Y${val}`}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: 'var(--text-tertiary)' }}
                  tickFormatter={compactFormatter}
                  width={65}
                />
                <CartesianGrid vertical={false} stroke="var(--border-subtle)" strokeDasharray="3 3" />
                <Tooltip
                  contentStyle={{ borderRadius: 'var(--radius)', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  formatter={(value: any, name: any) => [
                    formatINR((value as number) * 100),
                    name === 'wealth' ? 'Total Wealth' : name === 'realWealth' ? 'Inflation Adjusted' : 'Invested'
                  ]}
                  labelStyle={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4 }}
                />
                <Area type="monotone" dataKey="wealth" stroke="var(--green)" strokeWidth={2} fillOpacity={1} fill="url(#colorWealth)" />
                <Line type="monotone" dataKey="realWealth" stroke="#F59E0B" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                <Area type="monotone" dataKey="principal" stroke="var(--blue)" strokeWidth={2} fillOpacity={1} fill="url(#colorPrincipal)" />

                {/* Horizontal Reference Line for FIRE Target */}
                {showFireTarget && (
                  <ReferenceLine
                    y={fireTarget}
                    stroke="var(--red)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    label={{
                      value: `FIRE Target: ${compactFormatter(fireTarget)}`,
                      position: 'top',
                      fill: 'var(--red)',
                      fontSize: 11,
                      fontWeight: 600
                    }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Top Stat Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="sim-stats-row-3">
              <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: realGain < 0 ? '1px solid var(--red)' : '1px solid var(--green)', background: realGain < 0 ? 'var(--red-glow)' : 'var(--green-glow)' }}>
                <div style={{ fontSize: 12, color: realGain < 0 ? 'var(--red)' : 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Real Wealth (Inf. Adj)</div>
                <div className="sim-hero-stat" style={{ fontWeight: 700, color: realGain < 0 ? 'var(--red)' : 'var(--green)', fontFamily: 'var(--font-mono)' }}>
                  {formatINR(finalRealWealth * 100, { compact: true })}
                </div>
              </div>
              <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-2)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Real Gain</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {realGain > 0 ? '+' : realGain < 0 ? '-' : ''}{formatINR(Math.abs(realGain) * 100, { compact: true })}
                </div>
              </div>
              <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-2)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Total Wealth</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {formatINR(finalSipWealth * 100, { compact: true })}
                </div>
              </div>
            </div>
            <div className="sim-stats-row-2">
              <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-2)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Invested</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {formatINR(finalSipPrincipal * 100, { compact: true })}
                </div>
              </div>
              <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-2)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Nominal Gain</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  +{formatINR(finalSipReturns * 100, { compact: true })}
                </div>
              </div>
            </div>


          </div>


        </div>
      </div>

      {/* Breakdown Table */}
      <div style={{ maxWidth: 850, margin: '0 auto', width: '100%' }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              Annual Breakdown
            </span>
          </div>
          <div className="table-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: 'var(--surface-2)', position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Year</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-secondary)' }}>Invested</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-secondary)' }}>Returns Gain</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-secondary)' }}>Total Wealth</th>
                </tr>
              </thead>
              <tbody>
                {sipInvestmentRows.filter((r: any) => r.year > 0).map((row: any) => (
                  <tr key={row.yearLabel} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--text-primary)' }}>{row.yearLabel}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{formatINR(row.principal * 100, { compact: true })}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>+{formatINR(row.returns * 100, { compact: true })}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>{formatINR(row.wealth * 100, { compact: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
