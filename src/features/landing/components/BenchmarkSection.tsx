import React, { useState } from 'react';
import { ArrowRight, TrendingUp, Percent, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function BenchmarkSection() {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState<'3Y' | '5Y'>('5Y');

  const data = selectedPeriod === '5Y'
    ? { fundCAGR: '+28.4%', benchCAGR: '+19.2%', alpha: '+9.2%', savings15y: '₹18.4 Lakhs' }
    : { fundCAGR: '+26.1%', benchCAGR: '+18.8%', alpha: '+7.3%', savings15y: '₹9.8 Lakhs' };

  return (
    <section className="lp-feat-row lp-feat-row--alt">
      <div className="lp-feat-row-inner">
        {/* Left Visual Card (Benchmark comparison card emulating MFScope) */}
        <div className="lp-bench-card">
          <div className="lp-bench-header">
            <div>
              <div className="lp-bench-title">Parag Parikh Flexi Cap</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Direct Plan · Growth</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                onClick={() => setSelectedPeriod('3Y')}
                style={{
                  padding: '3px 8px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  border: '1px solid var(--border)',
                  background: selectedPeriod === '3Y' ? 'var(--green)' : 'transparent',
                  color: selectedPeriod === '3Y' ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                3Y
              </button>
              <button
                type="button"
                onClick={() => setSelectedPeriod('5Y')}
                style={{
                  padding: '3px 8px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  border: '1px solid var(--border)',
                  background: selectedPeriod === '5Y' ? 'var(--green)' : 'transparent',
                  color: selectedPeriod === '5Y' ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                5Y
              </button>
              <span className="lp-bench-badge">vs Nifty 500 TRI</span>
            </div>
          </div>

          {/* SVG Benchmark Chart */}
          <svg viewBox="0 0 340 130" className="lp-bench-svg">
            <defs>
              <linearGradient id="fundGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--green)" stopOpacity="0.25" />
                <stop offset="100%" stopColor="var(--green)" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Gridlines */}
            <line x1="0" y1="30" x2="340" y2="30" stroke="var(--border-subtle)" strokeDasharray="3 3" />
            <line x1="0" y1="70" x2="340" y2="70" stroke="var(--border-subtle)" strokeDasharray="3 3" />
            <line x1="0" y1="110" x2="340" y2="110" stroke="var(--border-subtle)" strokeDasharray="3 3" />

            {/* Benchmark line (dashed) */}
            <polyline
              points="0,110 50,102 110,88 170,78 240,65 300,56 340,50"
              stroke="var(--text-tertiary)"
              strokeWidth="2"
              fill="none"
              strokeDasharray="4 3"
            />

            {/* Fund area fill */}
            <polygon
              points="0,110 50,92 110,72 170,55 240,36 300,24 340,16 340,125 0,125"
              fill="url(#fundGrad)"
            />

            {/* Fund line (solid emerald) */}
            <polyline
              points="0,110 50,92 110,72 170,55 240,36 300,24 340,16"
              stroke="var(--green)"
              strokeWidth="2.5"
              fill="none"
            />

            {/* Current point */}
            <circle cx="340" cy="16" r="4.5" fill="var(--green)" stroke="var(--surface)" strokeWidth="2" />
          </svg>

          {/* Footer Stats */}
          <div className="lp-bench-footer">
            <span className="lp-bench-leg">
              <span className="lp-bench-dot" style={{ background: 'var(--green)' }}></span>
              <strong style={{ color: 'var(--green)' }}>Fund: {data.fundCAGR} CAGR</strong>
            </span>
            <span className="lp-bench-leg">
              <span className="lp-bench-dot" style={{ background: 'var(--text-tertiary)' }}></span>
              <span style={{ color: 'var(--text-secondary)' }}>Index: {data.benchCAGR} CAGR</span>
            </span>
            <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(0, 179, 134, 0.12)', color: 'var(--green)', fontWeight: 700, fontSize: 11 }}>
              Alpha: {data.alpha}
            </span>
          </div>

          {/* Direct vs Regular Savings Note */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              background: 'var(--surface-2)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 12,
            }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>
              Direct Plan vs Regular Plan (0.9% fee drag):
            </span>
            <strong style={{ color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>
              +{data.savings15y} saved
            </strong>
          </div>
        </div>

        {/* Right Text */}
        <div className="lp-feat-text">
          <p className="lp-section-eyebrow">Alpha & Expense Drag</p>
          <h2 className="lp-feat-heading">
            Is your fund earning <br />
            its expense ratio?
          </h2>
          <p className="lp-feat-body">
            Over 65% of active mutual funds fail to beat their benchmark over 5-year cycles. When fund managers charge 1.5% to 2% while generating negative alpha, compounding works against you.
          </p>
          <p className="lp-feat-body">
            MFLedger monitors your schemes against declared TRI benchmarks, computes true XIRR across irregular cashflows, and audits distributor commission drag down to the rupee.
          </p>

          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <span>Explore Benchmark Analytics</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
