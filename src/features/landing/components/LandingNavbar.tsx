import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PieChart,
  ArrowLeftRight,
  Calculator,
  Sparkles,
  Sun,
  Moon,
  ArrowRight,
  Menu,
  X,
  Shield,
  FileSpreadsheet
} from 'lucide-react';

interface LandingNavbarProps {
  onOpenImportModal?: () => void;
  onOpenAddAccountModal?: () => void;
}

export function LandingNavbar({ onOpenImportModal, onOpenAddAccountModal }: LandingNavbarProps) {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    <nav className="lp-navbar" aria-label="Landing Page Navigation">
      <div className="lp-navbar-inner">
        {/* Brand */}
        <div className="lp-brand" onClick={() => navigate('/landing')}>
          <div className="lp-brand-logo" style={{ background: 'transparent', boxShadow: 'none' }}>
            <img src="/logo.png" alt="MFLedger Logo" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'contain' }} />
          </div>
          <span className="lp-brand-title">MFLedger</span>
          <span className="lp-brand-badge">Private</span>
        </div>

        {/* Desktop Navigation Links */}
        <ul className="lp-nav-links">
          <li className="lp-nav-item">
            <button
              type="button"
              className="lp-nav-link"
              onClick={() => navigate('/')}
            >
              <PieChart size={15} />
              <span>Portfolio</span>
            </button>
          </li>
          <li className="lp-nav-item">
            <button
              type="button"
              className="lp-nav-link"
              onClick={() => navigate('/trades')}
            >
              <ArrowLeftRight size={15} />
              <span>Trades & Lots</span>
            </button>
          </li>
          <li className="lp-nav-item">
            <button
              type="button"
              className="lp-nav-link"
              onClick={() => navigate('/tax')}
            >
              <Calculator size={15} />
              <span>Tax & Gains</span>
            </button>
          </li>
          <li className="lp-nav-item">
            <button
              type="button"
              className="lp-nav-link"
              onClick={() => navigate('/simulator')}
            >
              <Sparkles size={15} />
              <span>SIP Simulator</span>
            </button>
          </li>
          {onOpenImportModal && (
            <li className="lp-nav-item">
              <button
                type="button"
                className="lp-nav-link"
                onClick={onOpenImportModal}
              >
                <FileSpreadsheet size={15} />
                <span>Import CAS</span>
              </button>
            </li>
          )}
        </ul>

        {/* Right Actions */}
        <div className="lp-nav-right">
          <button
            type="button"
            className="lp-theme-btn"
            onClick={toggleTheme}
            aria-label="Toggle Theme"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          <button
            type="button"
            className="lp-cta-btn"
            onClick={() => {
              if (onOpenAddAccountModal) {
                onOpenAddAccountModal();
              } else {
                navigate('/');
              }
            }}
          >
            <span>Track Portfolio</span>
            <ArrowRight size={14} />
          </button>

          {/* Mobile hamburger */}
          <button
            type="button"
            className="lp-mobile-menu-btn"
            onClick={() => setMobileMenuOpen(prev => !prev)}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div
          style={{
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            padding: '16px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <button
            type="button"
            className="lp-nav-link"
            style={{ width: '100%', justifyContent: 'flex-start' }}
            onClick={() => {
              setMobileMenuOpen(false);
              navigate('/');
            }}
          >
            <PieChart size={16} />
            <span>Portfolio Dashboard</span>
          </button>
          <button
            type="button"
            className="lp-nav-link"
            style={{ width: '100%', justifyContent: 'flex-start' }}
            onClick={() => {
              setMobileMenuOpen(false);
              navigate('/trades');
            }}
          >
            <ArrowLeftRight size={16} />
            <span>Trades & Order Ledger</span>
          </button>
          <button
            type="button"
            className="lp-nav-link"
            style={{ width: '100%', justifyContent: 'flex-start' }}
            onClick={() => {
              setMobileMenuOpen(false);
              navigate('/tax');
            }}
          >
            <Calculator size={16} />
            <span>Tax & Capital Gains (FY 2024-26)</span>
          </button>
          <button
            type="button"
            className="lp-nav-link"
            style={{ width: '100%', justifyContent: 'flex-start' }}
            onClick={() => {
              setMobileMenuOpen(false);
              navigate('/simulator');
            }}
          >
            <Sparkles size={16} />
            <span>SIP Wealth Simulator</span>
          </button>
          {onOpenImportModal && (
            <button
              type="button"
              className="lp-nav-link"
              style={{ width: '100%', justifyContent: 'flex-start' }}
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenImportModal();
              }}
            >
              <FileSpreadsheet size={16} />
              <span>Import CAMS / KFintech CAS</span>
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
