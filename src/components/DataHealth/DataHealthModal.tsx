import React, { useState, useMemo } from 'react';
import { X, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { type DataHealthReport, type HealthCheckResult } from '@/domain/health';

interface DataHealthModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: DataHealthReport;
  onRefresh?: () => void;
}

export function DataHealthModal({
  isOpen,
  onClose,
  report,
  onRefresh,
}: DataHealthModalProps) {
  const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null);

  // If any check failed/warned, move it to the top as urgent; otherwise preserve priority order
  const sortedChecks = useMemo(() => {
    return [...report.checks].sort((a, b) => {
      const aBad = a.severity !== 'PASS';
      const bBad = b.severity !== 'PASS';
      if (aBad && !bBad) return -1;
      if (!aBad && bBad) return 1;
      return a.priority - b.priority;
    });
  }, [report.checks]);

  if (!isOpen) return null;

  const toggleExpand = (checkId: string, hasIssues: boolean) => {
    if (!hasIssues) return;
    setExpandedCheckId(prev => (prev === checkId ? null : checkId));
  };

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 1200 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal animate-fade-in"
        style={{
          maxWidth: '520px',
          width: '92%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          padding: 'var(--space-5)',
        }}
      >
        {/* Header with Title and Cancel icon on top-right */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border-subtle)',
            paddingBottom: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              Portfolio Data Health
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {onRefresh && (
              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={onRefresh}
                title="Re-run diagnostics"
                style={{ padding: 4 }}
              >
                <RefreshCw size={14} />
              </button>
            )}
            <button
              id="data-health-close-btn"
              className="btn btn-ghost btn-icon btn-sm"
              onClick={onClose}
              title="Close"
              style={{ padding: 4 }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Overall Status Callout Banner */}
        {report.isAllGood ? (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--green-glow)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <CheckCircle2 size={17} color="var(--green)" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.4 }}>
              <strong>All {report.totalChecks} health checks passed.</strong> Your mutual fund
              ledger, pricing cache, and folio balances are completely healthy and reconciled.
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--red-glow)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <AlertTriangle size={17} color="var(--red)" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.4 }}>
              <strong>
                {report.warnOrFailedChecks} check{report.warnOrFailedChecks > 1 ? 's' : ''} detected issues.
              </strong>{' '}
              Click on any dotted-underlined item below to inspect details.
            </div>
          </div>
        )}

        {/* Free-flowing checklist (no box in box) */}
        <div
          style={{
            maxHeight: '58vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            paddingRight: 4,
          }}
        >
          {sortedChecks.map((check: HealthCheckResult) => {
            const isPassed = check.severity === 'PASS';
            const hasIssues = check.issueCount > 0;
            const isExpanded = expandedCheckId === check.id;

            return (
              <div
                key={check.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Free flowing text line */}
                <div
                  onClick={() => toggleExpand(check.id, hasIssues)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    cursor: hasIssues ? 'pointer' : 'default',
                    userSelect: 'none',
                    padding: '2px 0',
                  }}
                >
                  {/* Status symbol */}
                  <span
                    style={{
                      color: isPassed
                        ? 'var(--green)'
                        : check.severity === 'FAIL'
                        ? 'var(--red)'
                        : 'var(--orange)',
                      fontWeight: 700,
                      fontSize: 15,
                      lineHeight: '20px',
                      flexShrink: 0,
                    }}
                  >
                    {isPassed ? '✓' : '⚠'}
                  </span>

                  {/* Check text with dotted underline if failed */}
                  <span
                    style={{
                      fontSize: 13.5,
                      lineHeight: '20px',
                      color: isPassed
                        ? 'var(--text-primary)'
                        : check.severity === 'FAIL'
                        ? 'var(--red)'
                        : 'var(--orange)',
                      fontWeight: isPassed ? 400 : 600,
                      textDecoration: hasIssues ? 'underline dotted' : 'none',
                      textUnderlineOffset: '4px',
                      textDecorationThickness: '1.5px',
                      cursor: hasIssues ? 'pointer' : 'default',
                    }}
                  >
                    {check.summaryText}
                  </span>
                </div>

                {/* Indented callout scrollable with max 3 row space */}
                {hasIssues && isExpanded && (
                  <div
                    style={{
                      marginLeft: 24,
                      marginTop: 6,
                      marginBottom: 4,
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface-2)',
                      borderLeft: `3px solid ${
                        check.severity === 'FAIL' ? 'var(--red)' : 'var(--orange)'
                      }`,
                      maxHeight: '96px', // Max 3 rows (~32px per row)
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    {check.issues.map(item => (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: 11,
                          lineHeight: 1.35,
                          padding: '2px 0',
                          borderBottom: '1px solid var(--border-subtle)',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                          <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                            {item.title}
                          </span>
                          {item.subtitle && (
                            <span style={{ color: 'var(--text-tertiary)', marginLeft: 6 }}>
                              — {item.subtitle}
                            </span>
                          )}
                        </div>
                        {item.meta && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: check.severity === 'FAIL' ? 'var(--red)' : 'var(--orange)',
                              flexShrink: 0,
                            }}
                          >
                            {item.meta}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
