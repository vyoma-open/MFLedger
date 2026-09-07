import React from 'react';
import { Check, X, Shield, Lock } from 'lucide-react';

export function ComparisonMatrix() {
  const rows = [
    {
      feature: 'Data Privacy & Sovereignty',
      mfledger: '100% Local IndexedDB (Zero Cloud)',
      brokers: 'Stored on cloud / KYC tied',
      cloudApps: 'Uploaded to cloud / Data scraped',
      mfledgerGood: true,
    },
    {
      feature: 'FIFO Lot-by-Lot Tax Accounting',
      mfledger: 'Exact lot purchase date & NAV',
      brokers: 'Average NAV or black-box math',
      cloudApps: 'Approximate holding averages',
      mfledgerGood: true,
    },
    {
      feature: 'Budget 2024-26 Tax Harvesting',
      mfledger: 'Built-in ₹1.25L Sec 112A optimizer',
      brokers: 'No harvesting advisor',
      cloudApps: 'Locked behind paid tiers',
      mfledgerGood: true,
    },
    {
      feature: 'Multi-Broker Consolidation',
      mfledger: 'CAMS + KFintech + Demat in 1 place',
      brokers: 'Only shows their platform trades',
      cloudApps: 'Requires giving email access',
      mfledgerGood: true,
    },
    {
      feature: 'Offline PWA Support',
      mfledger: 'Works 100% offline on mobile & desktop',
      brokers: 'Fails without active internet',
      cloudApps: 'Server-dependent web apps',
      mfledgerGood: true,
    },
    {
      feature: 'Zero Spam & Zero Upsells',
      mfledger: 'No ads, no phone calls, no ULIPs',
      brokers: 'Nudges to trade F&O / credit',
      cloudApps: 'Constant upsells of loans & credit cards',
      mfledgerGood: true,
    },
  ];

  return (
    <section className="lp-section" style={{ background: 'var(--surface-glow)', borderTop: '1px solid var(--border-subtle)' }}>
      <div className="lp-section-inner">
        <div className="lp-section-header">
          <p className="lp-section-eyebrow">The Sovereign Advantage</p>
          <h2 className="lp-section-heading">Why Discerning Investors Choose MFLedger</h2>
          <p className="lp-section-sub">
            Built for privacy, computational accuracy, and freedom from broker ecosystems.
          </p>
        </div>

        <div className="lp-matrix-card">
          <table className="lp-matrix-table">
            <thead>
              <tr>
                <th style={{ width: '32%' }}>Feature</th>
                <th style={{ width: '28%', color: 'var(--green)', background: 'rgba(0, 179, 134, 0.08)' }}>
                  MFLedger
                </th>
                <th style={{ width: '20%' }}>Broker Apps (Groww/Zerodha)</th>
                <th style={{ width: '20%' }}>Cloud Trackers (INDmoney, etc.)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.feature}</td>
                  <td style={{ background: 'rgba(0, 179, 134, 0.04)', color: 'var(--green)', fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Check size={16} strokeWidth={2.5} style={{ color: 'var(--green)' }} />
                      <span>{r.mfledger}</span>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{r.brokers}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{r.cloudApps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
