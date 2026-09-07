import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/contexts/ToastContext';
import {
  checkRefreshEligibility,
  refreshAllHoldings,
  SETTING_LAST_REFRESH,
  type RefreshProgress,
} from '@/utils/marketService';
import { getSetting } from '@/db/seed';

export function useMarketRefresh() {
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<RefreshProgress | null>(null);
  const [lastRefreshTs, setLastRefreshTs] = useState<number | null>(null);

  // Background auto-refresh if stale (> 12 hours or null)
  useEffect(() => {
    let isCancelled = false;

    getSetting<number>(SETTING_LAST_REFRESH).then(async (ts) => {
      if (isCancelled) return;
      setLastRefreshTs(ts ?? null);

      const now = Date.now();
      const isStale = !ts || (now - ts > 12 * 60 * 60 * 1000);

      if (isStale) {
        setIsRefreshing(true);
        try {
          const result = await refreshAllHoldings();
          if (!isCancelled) {
            const newTs = Date.now();
            setLastRefreshTs(newTs);
          }
        } catch (e) {
          // Quietly log error in background auto-refresh
          console.warn('Auto NAV refresh warning:', e);
        } finally {
          if (!isCancelled) {
            setIsRefreshing(false);
          }
        }
      }
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  const eligibility = checkRefreshEligibility(lastRefreshTs);

  const handleRefresh = useCallback(async () => {
    const check = checkRefreshEligibility(lastRefreshTs);
    if (!check.allowed) {
      toast(check.reason, 'info');
      return;
    }

    setIsRefreshing(true);
    setRefreshProgress({ total: 0, done: 0, message: 'Starting NAV refresh…' });

    try {
      const result = await refreshAllHoldings(
        progress => setRefreshProgress(progress)
      );

      if (result.mfsUpdated > 0) {
        toast(`NAVs refreshed: ${result.mfsUpdated} mutual fund${result.mfsUpdated > 1 ? 's' : ''} updated.`, 'success');
      } else {
        toast('Mutual fund NAVs are up to date.', 'info');
      }

      if (result.errors.length > 0) {
        result.errors.forEach(err => toast(err, 'error'));
      }

      const now = Date.now();
      setLastRefreshTs(now);
    } catch (err: any) {
      toast(err.message ?? 'NAV refresh failed.', 'error');
    } finally {
      setIsRefreshing(false);
      setRefreshProgress(null);
    }
  }, [lastRefreshTs, toast]);

  const formattedUpdatedOn = lastRefreshTs
    ? new Date(lastRefreshTs).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return {
    isRefreshing,
    refreshProgress,
    lastRefreshTs,
    formattedUpdatedOn,
    canRefresh: eligibility.allowed && !isRefreshing,
    reason: eligibility.reason,
    handleRefresh,
  };
}
