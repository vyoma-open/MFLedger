import React from 'react';
import { X, HelpCircle, ChevronRight } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { PAGE_HELP } from '../../utils/helpContent';

interface HelpModalProps { onClose: () => void }

export function HelpModal({ onClose }: HelpModalProps) {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const tab = searchParams.get('tab');

  const pathKey = tab ? `${location.pathname}?tab=${tab}` : location.pathname;

  const help = PAGE_HELP[pathKey]
    ?? PAGE_HELP[location.pathname]
    ?? PAGE_HELP[location.pathname.replace(/\/[^/]+$/, '')]
    ?? PAGE_HELP['/'];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal slide-up" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <HelpCircle size={18} color="var(--green)" />
            <span className="modal-title">{help.title}</span>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {help.sections.map((sec, i) => (
            <div key={i} className="help-section">
              {sec.heading && <div className="help-section-title">{sec.heading}</div>}
              {sec.body && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{sec.body}</p>
              )}
              {sec.items && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: sec.body ? 12 : 0 }}>
                  {sec.items.map((item, j) => (
                    <div key={j} className="help-item">
                      <span className="help-key">{item.label}</span>
                      <span className="help-desc">{item.desc}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Data is stored locally in your browser's IndexedDB. No data leaves your device.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Help button for topbar */
export function HelpButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      id="help-btn"
      className="btn btn-ghost btn-icon"
      onClick={onClick}
      title="Help for this page"
    >
      <HelpCircle size={16} />
    </button>
  );
}
