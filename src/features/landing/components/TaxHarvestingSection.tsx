import React from 'react';
import { ArrowRight, Calculator, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function TaxHarvestingSection() {
  const navigate = useNavigate();

  return (
    <section className="lp-feat-row">
      <div className="lp-feat-row-inner">
        {/* Left Text */}
        <div className="lp-feat-text">
          <p className="lp-section-eyebrow">Budget 2024-26 Ready</p>
          <h2 className="lp-feat-heading">
            Harvest ₹1,25,000 tax-free <br />
            every single financial year
          </h2>
          <p className="lp-feat-body">
            Under Section 112A of the Income Tax Act, the first <strong>₹1.25 Lakh</strong> of Long-Term Capital Gains from equity mutual funds is completely exempt from tax each financial year.
          </p>
          <p className="lp-feat-body">
            If you don't harvest your gains before March 31, the exemption expires without rolling over. MFLedger's FIFO engine scans all your purchase lots, highlights qualifying long-term gains, and tells you exactly how many units to redeem and reinvest.
          </p>

          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/tax')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <Calculator size={15} />
              <span>Launch Tax Harvesting Advisor</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* Right Visual Card */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 20,
            padding: '28px 24px',
            boxShadow: 'var(--shadow-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              FY 2024–25 & FY 2025–26 Tax Exemption
            </div>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(0, 179, 134, 0.12)', color: 'var(--green)', fontWeight: 700 }}>
              Section 112A
            </span>
          </div>

          {/* Exemption Progress Gauge */}
          <div style={{ padding: '16px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Annual LTCG Tax-Free Cap</span>
              <strong style={{ color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>₹1,25,000 / FY</strong>
            </div>
            <div style={{ width: '100%', height: 10, borderRadius: 5, background: 'var(--surface-3)', overflow: 'hidden' }}>
              <div style={{ width: '74%', height: '100%', borderRadius: 5, background: 'linear-gradient(90deg, #00B386, #387ED1)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
              <span>Harvested: ₹92,400</span>
              <span style={{ color: 'var(--green)', fontWeight: 600 }}>₹32,600 Remaining Exemption</span>
            </div>
          </div>

          {/* Tax Savings Comparison */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ padding: '14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Annual Tax Saved
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                ₹15,625
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                12.5% tax avoided on ₹1.25L
              </div>
            </div>

            <div style={{ padding: '14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                10-Year Compounded
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--blue)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                +₹3.4 Lakhs
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                Reinvested tax savings
              </div>
            </div>
          </div>

          {/* Benefits Checkpoints */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-secondary)' }}>
              <CheckCircle2 size={15} style={{ color: 'var(--green)' }} />
              <span>Automatic FIFO holding period audit (&gt;365 days for Equity MF)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-secondary)' }}>
              <CheckCircle2 size={15} style={{ color: 'var(--green)' }} />
              <span>Section 111A (20% STCG) protection to prevent premature redemptions</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--green)', fontWeight: 600 }}>
              <CheckCircle2 size={15} style={{ color: 'var(--green)' }} />
              <span>Export Schedule CG-compliant tax lot audit sheets</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
