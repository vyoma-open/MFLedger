import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { refreshAllHoldings } from '../utils/marketService';

interface PullToRefreshProps {
  children: React.ReactNode;
}

export function PullToRefresh({ children }: PullToRefreshProps) {
  const { toast } = useToast();

  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullingActive, setPullingActive] = useState(false);
  const startY = useRef(0);
  const isPulling = useRef(false);

  useEffect(() => {
    function handleTouchStart(e: TouchEvent) {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      if (scrollTop <= 0 && !isRefreshing) {
        startY.current = e.touches[0].pageY;
        isPulling.current = true;
        setPullingActive(true);
      }
    }

    function handleTouchMove(e: TouchEvent) {
      if (!isPulling.current || isRefreshing) return;

      const currentY = e.touches[0].pageY;
      const diffY = currentY - startY.current;

      if (diffY > 0) {
        const dist = Math.min(diffY * 0.4, 80);
        setPullDistance(dist);

        if (dist > 10 && e.cancelable) {
          e.preventDefault();
        }
      } else {
        setPullDistance(0);
        isPulling.current = false;
        setPullingActive(false);
      }
    }

    async function handleTouchEnd() {
      if (!isPulling.current) return;
      isPulling.current = false;
      setPullingActive(false);

      const finalDist = pullDistance;
      setPullDistance(0);

      if (finalDist >= 55 && !isRefreshing) {
        setIsRefreshing(true);
        try {
          // 1. Refresh mutual fund NAVs from AMFI
          await refreshAllHoldings();
          toast('NAVs updated.', 'success');

          // 2. Check for service worker updates
          if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) {
              await reg.update();
              if (reg.waiting) {
                toast('Update available! Reloading…', 'info');
                setTimeout(() => {
                  reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
                  window.location.reload();
                }, 1000);
                return;
              }
            }
          }
        } catch (err: any) {
          toast(err.message || 'Refresh failed.', 'error');
        } finally {
          setIsRefreshing(false);
        }
      }
    }

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [pullDistance, isRefreshing, toast]);

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100%' }}>
      {/* Pull down indicator pill */}
      <div
        style={{
          position: 'absolute',
          top: Math.max(0, pullDistance - 40),
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          pointerEvents: 'none',
          opacity: pullDistance > 10 || isRefreshing ? 1 : 0,
          transition: pullingActive ? 'none' : 'top 0.2s, opacity 0.2s',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'var(--surface-2)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 20,
          padding: '6px 14px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
      >
        <RefreshCw
          size={14}
          color="var(--green)"
          style={{
            transform: `rotate(${pullDistance * 4}deg)`,
            animation: isRefreshing ? 'spin 1s linear infinite' : 'none',
          }}
        />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
          {isRefreshing ? 'Updating NAVs…' : pullDistance >= 55 ? 'Release to refresh' : 'Pull to refresh'}
        </span>
      </div>

      {children}
    </div>
  );
}
