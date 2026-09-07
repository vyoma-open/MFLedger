import React, { useState } from 'react';
import {
  ArrowRight,
  Trophy,
  TrendingUp,
  Sliders,
  Activity,
  Atom,
  ReceiptText,
  Landmark,
  Tag,
  BarChart3
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function CategoryScreenersSection() {
  const navigate = useNavigate();
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);

  const categories = [
    { name: 'Large Cap Fund', count: 35, horizon: '5+ Yrs', risk: 'Moderate' },
    { name: 'Mid Cap Fund', count: 33, horizon: '7+ Yrs', risk: 'High' },
    { name: 'Small Cap Fund', count: 35, horizon: '7+ Yrs', risk: 'Very High' },
    { name: 'Flexi Cap Fund', count: 40, horizon: '5+ Yrs', risk: 'High' },
    { name: 'ELSS Tax-Saver', count: 37, horizon: '3 Yrs (Locked)', risk: 'High' },
    { name: 'Multi Cap Fund', count: 32, horizon: '5+ Yrs', risk: 'High' },
    { name: 'Aggressive Hybrid', count: 30, horizon: '3+ Yrs', risk: 'Moderate' },
    { name: 'Multi Asset Fund', count: 28, horizon: '3+ Yrs', risk: 'Moderate' },
  ];

  const screeners = [
    { id: 'best-sip', label: 'Best 5Y SIP Funds', icon: Trophy, query: 'Flexi Cap' },
    { id: 'top-performers', label: 'Top 5Y Performers', icon: TrendingUp, query: 'Small Cap' },
    { id: 'best-sharpe', label: 'Best Risk-Adjusted', icon: Sliders, query: 'Large Cap' },
    { id: 'low-volatility', label: 'Low Volatility', icon: Activity, query: 'Hybrid' },
    { id: 'high-alpha', label: 'High Alpha Funds', icon: Atom, query: 'Mid Cap' },
    { id: 'elss-tax', label: 'Tax Saving (80C)', icon: ReceiptText, query: 'ELSS' },
    { id: 'large-aum', label: 'Large AUM (>₹25k Cr)', icon: Landmark, query: 'HDFC' },
    { id: 'lowest-expense', label: 'Lowest Expense Ratio', icon: Tag, query: 'Nifty 50' },
    { id: 'index-passive', label: 'Broad Market Index', icon: BarChart3, query: 'Index' },
  ];

  function handleScreenerClick(query: string) {
    sessionStorage.setItem('mf_screener_query', query);
    navigate('/');
  }

  return (
    <section className="lp-section">
      <div className="lp-section-inner">
        {/* Categories Header */}
        <div className="lp-section-header">
          <p className="lp-section-eyebrow">Browse by Category</p>
          <h2 className="lp-section-heading">All Major Indian Mutual Fund Categories</h2>
          <p className="lp-section-sub">
            Seamlessly track equity, hybrid, solution-oriented, and debt funds categorized by SEBI classification rules.
          </p>
        </div>

        {/* Categories Grid */}
        <div className="lp-categories-grid">
          {categories.map((cat, idx) => (
            <div
              key={idx}
              className="lp-cat-card"
              onClick={() => handleScreenerClick(cat.name)}
            >
              <div>
                <div className="lp-cat-name">{cat.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {cat.horizon} · {cat.risk}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="lp-cat-count">{cat.count} funds</span>
                <ArrowRight size={13} style={{ color: 'var(--text-tertiary)' }} />
              </div>
            </div>
          ))}
        </div>

        {/* Curated Screeners Section */}
        <div style={{ marginTop: 64, textAlign: 'center' }}>
          <p className="lp-section-eyebrow">Curated Screeners</p>
          <h2 className="lp-section-heading">Already know what you want to track?</h2>
          <p className="lp-section-sub" style={{ marginBottom: 28 }}>
            Hand-picked filters tailored for long-term Indian investors — high alpha, low expense ratio, and tax optimization.
          </p>

          <div className="lp-screener-pills">
            {screeners.map((sc) => {
              const Icon = sc.icon;
              return (
                <button
                  key={sc.id}
                  type="button"
                  className="lp-screener-pill"
                  onClick={() => handleScreenerClick(sc.query)}
                >
                  <Icon size={16} style={{ color: 'var(--green)' }} />
                  <span>{sc.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
