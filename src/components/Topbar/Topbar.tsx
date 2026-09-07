import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { HelpButton, HelpModal } from '../Help/HelpModal';
import { AccountSelector } from './AccountSelector';

export interface BreadcrumbItem {
  label: string;
  path?: string; // if omitted, this item is the current (non-clickable) page
}

interface TopbarProps {
  title?: string;
  badge?: string;
  actions?: React.ReactNode;
  /** Optional breadcrumb trail. When provided, replaces the plain title. */
  breadcrumbs?: BreadcrumbItem[];
  /** When true, renders the AccountSelector on the right side */
  showAccountSelector?: boolean;
}

export function Topbar({ title, badge, actions, breadcrumbs, showAccountSelector = false }: TopbarProps) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <>
      <header className="topbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>

          {/* Breadcrumbs or Page Title */}
          {breadcrumbs && breadcrumbs.length > 0 ? (
            <nav className="topbar-breadcrumbs" aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <React.Fragment key={idx}>
                    {isLast ? (
                      <span
                        aria-current="page"
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          fontFamily: 'var(--font-sans)',
                          letterSpacing: '-0.01em',
                        }}
                      >
                        {crumb.label}
                      </span>
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)' }}>
                        {crumb.label}
                      </span>
                    )}
                    {!isLast && (
                      <ChevronRight size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0, margin: '0 1px' }} />
                    )}
                  </React.Fragment>
                );
              })}
            </nav>
          ) : title ? (
            <span
              className="topbar-title"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 15,
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.01em',
              }}
            >
              {title}
            </span>
          ) : null}

          {badge && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                background: 'var(--surface-3)',
                color: 'var(--text-secondary)',
                padding: '2px 8px',
                borderRadius: 12,
              }}
            >
              {badge}
            </span>
          )}
        </div>

        {/* Right Actions */}
        <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {actions}
          {showAccountSelector && <AccountSelector />}
          <HelpButton onClick={() => setShowHelp(true)} />
        </div>
      </header>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </>
  );
}

export { AccountSelector };
export default Topbar;
