import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderPlus,
  ArrowRight,
  Plus,
  ArrowUpRight
} from 'lucide-react';
import { AddAccountModal } from '@/features/assets/components/AddAccountModal';
import { useAccount } from '@/contexts/AccountContext';

export function LandingPage() {
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [isDisclaimerHighlighted, setIsDisclaimerHighlighted] = useState(false);
  const disclaimerRef = useRef<HTMLDivElement>(null);
  const { accounts, selectedAccount } = useAccount();
  const navigate = useNavigate();

  const hasPortfolios = Boolean(accounts && accounts.length > 0);
  const activePortfolioName = selectedAccount?.name ?? (hasPortfolios ? accounts[0].name : 'Primary');

  const handleDisclaimerClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (disclaimerRef.current) {
      disclaimerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setIsDisclaimerHighlighted(true);
      setTimeout(() => {
        setIsDisclaimerHighlighted(false);
      }, 2600);
    }
  };

  const features = [
    {
      num: '01',
      title: 'True FIFO Capital Gains & Tax Lot Audit',
      description:
        'Every single buy, SIP installment, and redemption is audited under strict first-in, first-out (FIFO) matching. Avoid the average-cost rounding errors common to broker tax statements, accurately compute Section 112A LTCG versus STCG, and pinpoint exact tax-free exemption headroom.',
      actionLabel: 'Audit Tax Lots & Gains',
      actionPath: '/tax',
    },
    {
      num: '02',
      title: '100% In-Browser Privacy & Zero Cloud Storage',
      description:
        'Your financial net worth belongs only to you. Traditional portfolio aggregators scrape your mailbox, store CAS statements on central servers, and monetize user analytics. MF Ledger operates 100% client-side in your browser’s IndexedDB. No accounts, no phone numbers, no tracking cookies, and zero cloud leaks.',
      actionLabel: 'Explore Privacy Architecture',
      actionPath: '/settings',
    },
    {
      num: '03',
      title: 'Universal Multi-Broker Folio Consolidation',
      description:
        'Eliminate platform lock-in. Seamlessly consolidate folios across CAMS, KFintech, Zerodha Coin, Groww, Kuvera, AngelOne, and direct AMC portals into a single master ledger. Organize your holdings under custom family or individual portfolios with unified net worth and performance analytics.',
      actionLabel: 'View Portfolio Holdings',
      actionPath: '/',
    },
    {
      num: '04',
      title: 'Automated SIP Detection & Daily AMFI NAV Sync',
      description:
        'Intelligent transaction clustering automatically groups recurring installment patterns into distinct SIP streams with individual performance tracking and XIRR calculations. Daily official Net Asset Value (NAV) updates synchronize directly from the public AMFI database for all open-ended funds.',
      actionLabel: 'Inspect Trade Ledger',
      actionPath: '/trades',
    },
    {
      num: '05',
      title: 'Real-Time Tax Harvesting & Section 112A Exemption Planner',
      description:
        'Audit unrealized equity long-term capital gains in real-time to identify opportunities for annual tax-free gains harvesting before March 31. Calculate the exact quantity of units to redeem and immediately repurchase to reset your acquisition cost basis without incurring unnecessary tax liability.',
      actionLabel: 'Launch Tax Harvesting Engine',
      actionPath: '/tax',
    },
    {
      num: '06',
      title: 'Multi-Scenario SIP Wealth & Step-Up Compounding Simulator',
      description:
        'Model multi-decade wealth compounding with mathematical precision. Simulate standard fixed SIPs, annual step-up percentage increases, and hybrid lump-sum infusions. Inspect inflation-adjusted purchasing power, total principal invested, and cumulative wealth milestones over 5 to 30 years.',
      actionLabel: 'Try Wealth Simulator',
      actionPath: '/simulator',
    },
    {
      num: '07',
      title: 'Client-Side AES-256 Encryption & Data Portability',
      description:
        'Protect your financial records with client-side AES-256-GCM encryption secured by a master passphrase and PBKDF2 key derivation. Export complete encrypted backup archives or raw CSV spreadsheets at any time, ensuring you are never locked into any proprietary software or platform.',
      actionLabel: 'Vault & Export Settings',
      actionPath: '/settings',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', width: '100%' }}>
      {/* Main Page Area with INDvest-inspired technical grid background */}
      <div
        className="landing-grid-bg"
        style={{
          flex: 1,
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          padding: '48px 24px 80px 24px',
        }}
      >
        <div style={{ maxWidth: 920, width: '100%' }}>

          {/* Left-aligned Title of the page: MF Ledger */}
          <div className="landing-brand-title">
            MF Ledger
          </div>

          {/* Bold Objective — 3 short lines with muted trailing line */}
          <h1 className="landing-hero-headline">
            Data-driven portfolio analytics<br />
            for smarter, private investing<br />
            <span className="landing-headline-muted">in Indian mutual funds.</span>
          </h1>

          {/* Hero Subtitle & Interactive Top Disclaimer Trigger */}
          <p className="landing-hero-subtitle">
            Independent analytics platform. Zero cloud data storage, zero broker lock-in, true FIFO capital gains audit — entirely private, 100% free.{' '}
            <button
              type="button"
              onClick={handleDisclaimerClick}
              className="landing-disclaimer-trigger"
              title="Click to view full statutory disclaimer at bottom of page"
            >
              Disclaimer
            </button>
          </p>

          {/* Centered Portfolio CTA Buttons (No Import Statement button) */}
          <div className="landing-cta-container">
            {!hasPortfolios ? (
              <button
                id="landing-track-portfolio-cta"
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() => setShowAddAccountModal(true)}
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  padding: '14px 32px',
                  borderRadius: 24,
                  boxShadow: '0 4px 18px var(--shadow-glow-green, rgba(0, 179, 134, 0.32))',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                }}
              >
                <FolderPlus size={18} />
                <span>Track your MF Portfolio(s)</span>
                <ArrowRight size={16} />
              </button>
            ) : (
              <>
                <button
                  id="landing-goto-portfolio-cta"
                  type="button"
                  className="btn btn-primary btn-lg"
                  onClick={() => navigate('/')}
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    padding: '14px 28px',
                    borderRadius: 24,
                    boxShadow: '0 4px 18px var(--shadow-glow-green, rgba(0, 179, 134, 0.32))',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                  }}
                >
                  <span>Go to {activePortfolioName} Account</span>
                  <ArrowRight size={16} />
                </button>

                <button
                  id="landing-add-portfolio-cta"
                  type="button"
                  className="btn btn-secondary btn-lg"
                  onClick={() => setShowAddAccountModal(true)}
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    padding: '14px 24px',
                    borderRadius: 24,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={16} />
                  <span>Add new Portfolio</span>
                </button>
              </>
            )}
          </div>

          {/* Features Section — Free-flowing text, no box confinement */}
          <section className="landing-features-section" aria-label="Features">
            <h2 className="landing-features-title">Features</h2>
            <p className="landing-features-desc">
              Institutional-grade ledger and analytical tools engineered specifically for Indian mutual fund investors.
            </p>

            <div>
              {features.map((feat) => (
                <article key={feat.num} className="landing-feature-flow-item">
                  <div className="landing-feature-meta">
                    <span className="landing-feature-num">{feat.num}</span>
                    <h3 className="landing-feature-heading">{feat.title}</h3>
                  </div>
                  <p className="landing-feature-body">{feat.description}</p>
                  <div>
                    <button
                      type="button"
                      className="landing-feature-action"
                      onClick={() => navigate(feat.actionPath)}
                    >
                      <span>{feat.actionLabel}</span>
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* Regulatory & Risk Disclaimer Section at Bottom */}
          <div
            ref={disclaimerRef}
            id="disclaimer-section"
            className={`landing-disclaimer-box ${isDisclaimerHighlighted ? 'highlighted' : ''}`}
            tabIndex={-1}
          >
            <h4>Statutory & Risk Disclaimer</h4>
            <p>
              Data and information on this platform is sourced from sources believed to be reliable, including the Association of Mutual Funds in India (AMFI) public NAV feeds. MF Ledger is an independent, client-side portfolio accounting ledger operating 100% locally on your device. It does not provide investment advisory, financial solicitation, or broking services. Users are advised to independently verify all figures before making financial decisions.
            </p>
            <ul>
              <li>
                Returns for holding periods under 1 year are expressed as absolute (%). Returns for periods over 1 year are compounded annualised growth rates (CAGR %). SIP returns are calculated using precise Newton-Raphson XIRR (%).
              </li>
              <li>
                Capital gains tax calculations reflect statutory rates under Section 112A and Section 111A of the Indian Income Tax Act. For official tax filings, cross-reference your statements with your Chartered Accountant or tax advisor.
              </li>
              <li>
                <strong>Mutual Fund investments are subject to market risks. Read all scheme-related documents carefully before investing.</strong> Past performance is not indicative of future returns. MF Ledger shall not be held liable for any loss arising directly or indirectly from the use of this software.
              </li>
            </ul>
          </div>

          {/* Footer Bottom Bar (No interrupting border lines) */}
          <footer
            style={{
              marginTop: 48,
              paddingTop: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              fontSize: 12,
              color: 'var(--text-tertiary)',
            }}
          >
            <div>© 2026 MF Ledger · 100% In-Browser & Private</div>
            <div>Built for Indian DIY Mutual Fund Investors</div>
          </footer>

        </div>
      </div>

      {showAddAccountModal && (
        <AddAccountModal onClose={() => setShowAddAccountModal(false)} />
      )}
    </div>
  );
}

export default LandingPage;
