import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { db } from '@/db/schema';
import { inspectDataHealth, type DataHealthReport } from '@/domain/health';

export function useDataHealth(): DataHealthReport {
  const report = useLiveQuery(async () => {
    const [lots, consumptionEvents, marketCache, accounts] = await Promise.all([
      db.investment_lots.toArray(),
      db.lot_consumption_events.toArray(),
      db.market_cache.toArray(),
      db.accounts.toArray(),
    ]);

    return inspectDataHealth({
      lots,
      consumptionEvents,
      marketCache,
      accounts,
      now: Date.now(),
    });
  }, []);

  return (
    report ?? {
      overallStatus: 'HEALTHY',
      isAllGood: true,
      totalChecks: 8,
      passedChecks: 8,
      warnOrFailedChecks: 0,
      checks: [],
    }
  );
}

interface DataHealthButtonProps {
  onClick: () => void;
  report?: DataHealthReport;
}

export function DataHealthButton({ onClick, report: propReport }: DataHealthButtonProps) {
  const queryReport = useDataHealth();
  const report = propReport ?? queryReport;
  const isGood = report.isAllGood;

  const tooltip = isGood
    ? 'Portfolio Data Health: All checks passed'
    : `Portfolio Data Health: ${report.warnOrFailedChecks} check${report.warnOrFailedChecks > 1 ? 's' : ''} need attention`;

  return (
    <button
      id="topbar-data-health-btn"
      className="btn btn-ghost btn-icon btn-sm"
      onClick={onClick}
      title={tooltip}
      aria-label={tooltip}
      style={{
        position: 'relative',
        color: isGood ? 'var(--green)' : 'var(--red)',
        transition: 'color 0.2s ease, transform 0.15s ease',
      }}
    >
      {isGood ? (
        <ShieldCheck size={17} color="var(--green)" />
      ) : (
        <ShieldAlert size={17} color="var(--red)" />
      )}

      {!isGood && report.warnOrFailedChecks > 0 && (
        <span
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            width: 7,
            height: 7,
            borderRadius: '50%',
            backgroundColor: 'var(--red)',
            boxShadow: '0 0 0 2px var(--surface-1)',
          }}
        />
      )}
    </button>
  );
}
