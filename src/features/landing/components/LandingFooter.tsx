import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Sun, Moon } from 'lucide-react';

export function LandingFooter() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'system';
    if (currentTheme === 'light') {
      setTheme('light');
    } else {
      setTheme('dark');
    }
  }, []);

  function toggleTheme() {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('mfledger_theme', nextTheme);
  }

  return (
    <footer className="lp-footer">
      <div className="lp-footer-inner">
        {/* Brand column */}
        <div>
          <div className="lp-brand" onClick={() => navigate('/landing')}>
            <div className="lp-brand-logo" style={{ background: 'transparent', boxShadow: 'none' }}>
              <img src="/logo.png" alt="MFLedger Logo" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'contain' }} />
            </div>
            <span className="lp-brand-title">MFLedger</span>
          </div>
          <p className="lp-footer-brand-text">
            India's premier private mutual fund ledger. Audit lot-by-lot FIFO accounting, harvest tax-free capital gains, and track multi-decade wealth compounding offline.
          </p>
          <button
            type="button"
            className="lp-theme-btn"
            onClick={toggleTheme}
            style={{ width: 'auto', padding: '8px 14px', gap: 8, fontSize: 12.5, fontWeight: 600 }}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            <span>{theme === 'dark' ? 'Light Theme' : 'Dark Theme'}</span>
          </button>
        </div>

        {/* Quick Links */}
        <div>
          <div className="lp-footer-col-title">Quick Links</div>
          <ul className="lp-footer-links">
            <li><a className="lp-footer-link" onClick={() => navigate('/')}>Portfolio Dashboard</a></li>
            <li><a className="lp-footer-link" onClick={() => navigate('/trades')}>Trades & FIFO Lots</a></li>
            <li><a className="lp-footer-link" onClick={() => navigate('/tax')}>Tax & Harvesting</a></li>
            <li><a className="lp-footer-link" onClick={() => navigate('/simulator')}>SIP Simulator</a></li>
            <li><a className="lp-footer-link" onClick={() => navigate('/notes')}>Research Notes</a></li>
            <li><a className="lp-footer-link" onClick={() => navigate('/settings')}>Settings & Encryption</a></li>
          </ul>
        </div>

        {/* Top AMCs */}
        <div>
          <div className="lp-footer-col-title">Top AMCs</div>
          <ul className="lp-footer-links">
            <li><a className="lp-footer-link" onClick={() => navigate('/')}>HDFC Mutual Fund</a></li>
            <li><a className="lp-footer-link" onClick={() => navigate('/')}>SBI Mutual Fund</a></li>
            <li><a className="lp-footer-link" onClick={() => navigate('/')}>ICICI Prudential MF</a></li>
            <li><a className="lp-footer-link" onClick={() => navigate('/')}>Nippon India MF</a></li>
            <li><a className="lp-footer-link" onClick={() => navigate('/')}>Parag Parikh (PPFAS)</a></li>
            <li><a className="lp-footer-link" onClick={() => navigate('/')}>Mirae Asset MF</a></li>
            <li><a className="lp-footer-link" onClick={() => navigate('/')}>Quant Mutual Fund</a></li>
          </ul>
        </div>

        {/* Calculators & Tools */}
        <div>
          <div className="lp-footer-col-title">Features & Tools</div>
          <ul className="lp-footer-links">
            <li><a className="lp-footer-link" onClick={() => navigate('/simulator')}>SIP Step-Up Modeler</a></li>
            <li><a className="lp-footer-link" onClick={() => navigate('/tax')}>Section 112A Exemption</a></li>
            <li><a className="lp-footer-link" onClick={() => navigate('/')}>AMFI Live NAV Sync</a></li>
            <li><a className="lp-footer-link" onClick={() => navigate('/')}>CAMS & KFintech Parser</a></li>
            <li><a className="lp-footer-link" onClick={() => navigate('/settings')}>AES-256 Encrypted Backups</a></li>
            <li><a className="lp-footer-link" onClick={() => navigate('/settings')}>Offline PWA Installation</a></li>
          </ul>
        </div>
      </div>

      {/* Statutory Disclaimer Box */}
      <div className="lp-footer-disclaimer">
        <p style={{ margin: '0 0 6px 0' }}>
          <strong>Disclaimer</strong>: MFLedger is a private, client-side portfolio accounting and analytical tool. Data is fetched directly from public AMFI endpoints and cached strictly in your browser's IndexedDB. MFLedger is not a SEBI-registered investment adviser (RIA) or mutual fund distributor (MFD) and does not solicit investments or offer advisory services.
        </p>
        <p style={{ margin: '0 0 6px 0' }}>
          Returns for periods under 1 year are absolute (%). Returns for periods over 1 year are compounded annualised (CAGR %). SIP cashflows are calculated using high-precision Newton-Raphson XIRR (%).
        </p>
        <p style={{ margin: 0 }}>
          <strong>Mutual Fund investments are subject to market risks. Read all scheme-related documents carefully before investing.</strong> Past performance is not indicative of future returns. Consult a certified financial advisor for customized wealth planning.
        </p>
      </div>

      {/* Bottom Bar */}
      <div className="lp-footer-bottom">
        <span>© 2026 MFLedger. 100% Client-Side & Open-Source.</span>
        <span>Built with ❤️ for Indian DIY mutual fund investors</span>
      </div>
    </footer>
  );
}
