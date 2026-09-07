import React, { useState } from 'react';
import { ArrowRight, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function OverlapSection() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'sample1' | 'sample2'>('sample1');

  const pairs = {
    sample1: {
      fundA: 'Parag Parikh Flexi Cap',
      fundB: 'HDFC Top 100 Fund',
      overlapPct: '36.4%',
      sharedCount: 22,
      topHoldings: [
        { name: 'HDFC Bank Ltd.', weightA: '8.4%', weightB: '9.8%' },
        { name: 'ICICI Bank Ltd.', weightA: '6.9%', weightB: '8.5%' },
        { name: 'ITC Ltd.', weightA: '5.6%', weightB: '4.8%' },
        { name: 'Infosys Ltd.', weightA: '4.7%', weightB: '6.1%' },
        { name: 'Reliance Industries', weightA: '3.9%', weightB: '7.2%' },
      ],
    },
    sample2: {
      fundA: 'Mirae Asset Large Cap',
      fundB: 'Nifty 50 Index Fund',
      overlapPct: '68.2%',
      sharedCount: 44,
      topHoldings: [
        { name: 'HDFC Bank Ltd.', weightA: '9.8%', weightB: '11.2%' },
        { name: 'Reliance Industries', weightA: '8.9%', weightB: '9.4%' },
        { name: 'ICICI Bank Ltd.', weightA: '7.8%', weightB: '7.9%' },
        { name: 'Infosys Ltd.', weightA: '5.9%', weightB: '5.8%' },
        { name: 'Larsen & Toubro', weightA: '4.2%', weightB: '4.4%' },
      ],
    },
  };

  const current = pairs[activeTab];

  return (
    <section className="lp-feat-row">
      <div className="lp-feat-row-inner">
        {/* Left Text */}
        <div className="lp-feat-text">
          <p className="lp-section-eyebrow">Portfolio Exposure Audit</p>
          <h2 className="lp-feat-heading">
            Stop double-counting <br />
            the same stocks
          </h2>
          <p className="lp-feat-body">
            When multiple funds hold Reliance, HDFC Bank, and Infosys at identical weights, your
            "diversified" portfolio is holding the exact same concentration risk — while charging you multiple management fees.
          </p>
          <p className="lp-feat-body">
            MFLedger's portfolio audit identifies overlapping holdings, category concentration, and duplicate equity exposure so you can streamline your folios with institutional confidence.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <span>Audit Your Portfolio</span>
              <ArrowRight size={14} />
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setActiveTab(activeTab === 'sample1' ? 'sample2' : 'sample1')}
              style={{ fontSize: 13 }}
            >
              Toggle Demo Scheme Pair
            </button>
          </div>
        </div>

        {/* Right Visual Card (Emulating MFScope overlap card) */}
        <div className="lp-overlap-card">
          <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Exposure Analyzer
            </span>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(245, 158, 11, 0.12)', color: 'var(--orange)', fontWeight: 600 }}>
              {current.sharedCount} Shared Stocks
            </span>
          </div>

          {/* Venn Diagram */}
          <div className="lp-overlap-diagram">
            <div className="lp-overlap-circle lp-overlap-circle--a">
              <span style={{ textAlign: 'center', padding: '0 12px', fontSize: 11 }}>{current.fundA}</span>
            </div>
            <div className="lp-overlap-circle lp-overlap-circle--b">
              <span style={{ textAlign: 'center', padding: '0 12px', fontSize: 11 }}>{current.fundB}</span>
            </div>
            <div className="lp-overlap-center-badge">
              <span className="lp-overlap-pct">{current.overlapPct}</span>
              <span className="lp-overlap-tag">Overlap</span>
            </div>
          </div>

          {/* Shared Holdings List */}
          <div style={{ width: '100%' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase' }}>
              Top Duplicated Holdings
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {current.topHoldings.map((h, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 10px',
                    borderRadius: 8,
                    background: 'var(--surface-2)',
                    fontSize: 12,
                  }}
                >
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{h.name}</span>
                  <div style={{ display: 'flex', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    <span style={{ color: 'var(--blue)' }}>{h.weightA}</span>
                    <span style={{ color: 'var(--text-tertiary)' }}>·</span>
                    <span style={{ color: 'var(--green)' }}>{h.weightB}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
