import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PieChart,
  RefreshCw,
  Calculator,
  Sparkles,
  FileSpreadsheet,
  ShieldCheck,
  ArrowRight
} from 'lucide-react';

interface ToolsGridProps {
  onOpenImportModal?: () => void;
  onOpenAddAccountModal?: () => void;
}

export function ToolsGrid({ onOpenImportModal, onOpenAddAccountModal }: ToolsGridProps) {
  const navigate = useNavigate();

  const tools = [
    {
      id: 'fifo-ledger',
      title: 'FIFO Portfolio Ledger',
      desc: 'Audit purchase lots down to the paise. Track units, acquisition NAVs, realized & unrealized P&L, and clean FIFO redemption lot consumption.',
      icon: PieChart,
      iconBg: 'rgba(0, 179, 134, 0.12)',
      iconColor: 'var(--green)',
      cta: 'Explore Portfolio',
      action: () => navigate('/'),
    },
    {
      id: 'amfi-sync',
      title: 'Live AMFI NAV Feeds',
      desc: 'Direct synchronization with official Association of Mutual Funds in India (AMFI) feeds. Automatically update NAVs and track daily swings.',
      icon: RefreshCw,
      iconBg: 'rgba(245, 158, 11, 0.12)',
      iconColor: '#F59E0B',
      cta: 'Sync Scheme NAVs',
      action: () => navigate('/'),
    },
    {
      id: 'tax-engine',
      title: 'Section 112A Tax Engine',
      desc: 'Fully compliant with FY 2024–25 & 2025–26 rules. Harvest your ₹1.25 Lakh annual tax-free LTCG exemption and track STCG holding periods.',
      icon: Calculator,
      iconBg: 'rgba(56, 126, 209, 0.12)',
      iconColor: 'var(--blue)',
      cta: 'Open Tax Advisor',
      action: () => navigate('/tax'),
    },
    {
      id: 'sip-simulator',
      title: 'SIP Wealth Simulator',
      desc: 'Model compound wealth trajectories combining initial lump sum and monthly SIPs with annual % step-ups and goal milestone timelines.',
      icon: Sparkles,
      iconBg: 'rgba(124, 77, 255, 0.12)',
      iconColor: '#7C4DFF',
      cta: 'Simulate Wealth',
      action: () => navigate('/simulator'),
    },
    {
      id: 'cas-importer',
      title: 'Instant CAS Importer',
      desc: 'Import password-protected CAMS & KFintech PDF statements or Excel CAS exports in seconds. Automatically parses folios, SIP streams, and lots.',
      icon: FileSpreadsheet,
      iconBg: 'rgba(0, 188, 212, 0.12)',
      iconColor: '#00BCD4',
      cta: 'Import Statement',
      action: () => {
        if (onOpenImportModal) {
          onOpenImportModal();
        } else {
          navigate('/');
        }
      },
    },
    {
      id: 'privacy-pwa',
      title: '100% Client-Side Privacy',
      desc: 'Zero telemetry, zero cloud databases, zero servers. Protected by optional AES-256-GCM encryption in your browser IndexedDB with full offline PWA.',
      icon: ShieldCheck,
      iconBg: 'rgba(224, 82, 96, 0.12)',
      iconColor: '#E05260',
      cta: 'Audit Privacy',
      action: () => navigate('/settings'),
    },
  ];

  return (
    <section className="lp-section" id="tools">
      <div className="lp-section-inner">
        <div className="lp-section-header">
          <p className="lp-section-eyebrow">Complete Toolkit</p>
          <h2 className="lp-section-heading">Institutional-Grade Tools for Mutual Funds</h2>
          <p className="lp-section-sub">
            Everything you need to audit holdings, calculate true returns, optimize tax liability, and compound wealth — in one place.
          </p>
        </div>

        <div className="lp-tools-grid">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <div
                key={tool.id}
                className="lp-tool-card"
                onClick={tool.action}
              >
                <div
                  className="lp-tool-icon-wrap"
                  style={{ background: tool.iconBg, color: tool.iconColor }}
                >
                  <Icon size={22} />
                </div>
                <h3 className="lp-tool-title">{tool.title}</h3>
                <p className="lp-tool-desc">{tool.desc}</p>
                <span className="lp-tool-cta">
                  <span>{tool.cta}</span>
                  <ArrowRight size={14} />
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
