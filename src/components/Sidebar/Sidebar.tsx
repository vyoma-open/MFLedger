import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  PieChart, ArrowLeftRight, Calculator,
  Settings, Lock, StickyNote, TrendingUp, Sparkles,
  Layers, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import { useBalances } from '../../contexts/BalancesContext';
import { formatINR } from '../../utils/currency';
import { useAuth } from '../../contexts/AuthContext';
import { useAccount } from '../../contexts/AccountContext';

interface SidebarProps {
  forceCollapsed?: boolean;
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
export function Sidebar({ forceCollapsed = false }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { lock } = useAuth();
  const { accounts, selectedAccountId, selectedAccount } = useAccount();

  const isLandingPage = location.pathname === '/landing' || location.pathname === '/about';
  const shouldForceCollapse = forceCollapsed || isLandingPage;

  const [isCollapsedState, setIsCollapsedState] = useState(() => document.body.classList.contains('sidebar-collapsed'));
  const isCollapsed = shouldForceCollapse || isCollapsedState;

  const { balances } = useBalances();

  useEffect(() => {
    if (shouldForceCollapse) {
      document.body.classList.add('sidebar-collapsed');
      return () => {
        const manual = localStorage.getItem('sidebar_collapsed') === 'true';
        if (!manual) {
          document.body.classList.remove('sidebar-collapsed');
        }
      };
    }
  }, [shouldForceCollapse]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsCollapsedState(document.body.classList.contains('sidebar-collapsed'));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (document.body.classList.contains('sidebar-mobile-open')) {
        const sidebarEl = document.querySelector('.sidebar');
        const menuBtnEl = document.querySelector('.mobile-menu-btn');
        if (
          sidebarEl && !sidebarEl.contains(event.target as Node) &&
          menuBtnEl && !menuBtnEl.contains(event.target as Node)
        ) {
          document.body.classList.remove('sidebar-mobile-open');
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isAllAccounts = selectedAccountId === 'ALL';
  const portfolioValuePaise = isAllAccounts
    ? (accounts?.reduce((s, a) => {
      if (a.is_archived === 1) return s;
      const bal = balances.get(a.id) ?? 0;
      return s + bal;
    }, 0) ?? 0)
    : (balances.get(selectedAccountId) ?? 0);

  function handleSidebarDoubleClick() {
    if (!shouldForceCollapse) {
      document.body.classList.toggle('sidebar-collapsed');
    }
  }

  function handleToggleSidebar() {
    document.body.classList.toggle('sidebar-collapsed');
    const collapsed = document.body.classList.contains('sidebar-collapsed');
    localStorage.setItem('sidebar_collapsed', collapsed ? 'true' : 'false');
    setIsCollapsedState(collapsed);
  }

  return (
    <nav className={`sidebar ${isCollapsed ? 'collapsed' : ''}`} aria-label="Main navigation" onDoubleClick={handleSidebarDoubleClick}>
      {/* Brand Header — clicking takes user to Landing Page */}
      {!isCollapsed ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Highlighted Brand Header with Accent Color */}
          <div
            onClick={() => navigate('/landing')}
            title="MF Ledger — Track your Mutual Funds"
            style={{
              margin: '14px 14px 12px 14px',
              padding: '10px 12px',
              borderRadius: 'var(--radius)',
              background: 'rgba(5, 150, 105, 0.08)',
              border: '1px solid rgba(5, 150, 105, 0.22)',
              boxShadow: '0 2px 8px rgba(5, 150, 105, 0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <img
              src="/logo.png"
              alt="MF Ledger Logo"
              style={{ width: 28, height: 28, borderRadius: 7, objectFit: 'contain', flexShrink: 0 }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 16,
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                  lineHeight: 1.2,
                  letterSpacing: '-0.02em',
                }}
              >
                MF Ledger
              </span>
            </div>
            <Sparkles size={14} style={{ color: 'var(--green)', flexShrink: 0 }} />
          </div>

          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '0 14px 4px 14px' }} />
        </div>
      ) : (
        /* Collapsed view: App logo highlighted, clicking takes to Landing Page */
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 0 10px 0' }}>
          <div
            onClick={() => navigate('/landing')}
            title="MFLedger — Landing Page"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'all 0.15s ease',
              padding: 2,
            }}
          >
            <img
              src="/logo.png"
              alt="MFLedger Logo"
              style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'contain' }}
            />
          </div>
        </div>
      )}

      {/* Net Worth / Account Value Pill (Without the word 'VALUE') */}
      {!isCollapsed && (
        <div
          className="sidebar-networth-pill"
          onClick={(e) => { e.stopPropagation(); navigate('/'); }}
          title={isAllAccounts ? 'Consolidated Mutual Fund Portfolio' : `Portfolio: ${selectedAccount?.name ?? 'Selected Portfolio'}`}
        >
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {isAllAccounts ? 'ALL PORTFOLIOS' : (selectedAccount?.name ?? 'PORTFOLIO')}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>
            {formatINR(portfolioValuePaise, { compact: true })}
          </span>
        </div>
      )}

      {/* Main Navigation Links */}
      <div className="sidebar-nav" style={{ marginTop: isCollapsed ? 6 : 4 }}>
        <NavLink id="nav-portfolio" to="/" end className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`} title="Portfolio">
          <PieChart size={15} className="sidebar-nav-icon" /> <span>Portfolio</span>
        </NavLink>

        <NavLink id="nav-trades" to="/trades" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`} title="Trades & Orders">
          <ArrowLeftRight size={15} className="sidebar-nav-icon" /> <span>Trades</span>
        </NavLink>

        <NavLink id="nav-tax" to="/tax" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`} title="Tax & Capital Gains">
          <Calculator size={15} className="sidebar-nav-icon" /> <span>Tax & Gains</span>
        </NavLink>

        <NavLink id="nav-simulator" to="/simulator" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`} title="SIP & Wealth Simulator">
          <TrendingUp size={15} className="sidebar-nav-icon" /> <span>Simulator</span>
        </NavLink>

        <NavLink id="nav-notes" to="/notes" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`} title="Investment Notes">
          <StickyNote size={15} className="sidebar-nav-icon" /> <span>Notes</span>
        </NavLink>
      </div>

      {/* Bottom Footer with Sidebar Toggle (Close/Expand) directly above Settings */}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        {isCollapsed ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '6px 0 12px 0', width: '100%' }}>
            {/* Expand Sidebar Icon directly above Settings */}
            <button
              id="sidebar-expand-btn"
              className="sidebar-nav-item"
              onClick={handleToggleSidebar}
              title="Expand Sidebar"
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--text-tertiary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <PanelLeftOpen size={16} className="sidebar-nav-icon" />
            </button>

            <div style={{ width: '60%', height: 1, background: 'var(--border-subtle)', margin: '2px 0' }} />

            <NavLink
              id="nav-settings-collapsed"
              to="/settings"
              title="Settings"
              className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
            >
              <Settings size={15} className="sidebar-nav-icon" />
            </NavLink>

            <button
              id="nav-lock-collapsed"
              className="sidebar-nav-item"
              onClick={lock}
              title="Lock App"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
            >
              <Lock size={15} className="sidebar-nav-icon" />
            </button>
          </div>
        ) : (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Close Sidebar Icon in expanded view directly above Settings (no bottom line) */}
            <div style={{ padding: '0 8px 4px 8px' }}>
              <button
                id="sidebar-collapse-btn"
                className="sidebar-nav-item"
                onClick={handleToggleSidebar}
                title="Collapse Sidebar"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '6px 10px',
                  color: 'var(--text-tertiary)',
                  fontSize: 12,
                }}
              >
                <PanelLeftClose size={15} className="sidebar-nav-icon" />
                <span>Collapse</span>
              </button>
            </div>

            <div className="sidebar-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', width: '100%' }}>
              <NavLink id="nav-settings" to="/settings" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`} style={{ flex: 1, padding: '4px 0', justifyContent: 'flex-start' }}>
                <Settings size={15} className="sidebar-nav-icon" /> <span>Settings</span>
              </NavLink>
              <button
                id="nav-lock"
                className="btn btn-ghost btn-icon btn-sm sidebar-nav-icon"
                onClick={lock}
                style={{ padding: 4 }}
                title="Lock App"
              >
                <Lock size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
