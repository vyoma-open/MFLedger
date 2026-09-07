import React, { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Plus, StickyNote, TrendingUp, RefreshCw, Loader2,
  Sun, Moon, Laptop, ArrowUp
} from 'lucide-react';
import { playCoinSound } from '../utils/whimsy';
import { useToast } from '../contexts/ToastContext';
import { useMarketRefresh } from '@/hooks/useMarketRefresh';

const AddLotModal = React.lazy(() =>
  import('@/features/investments/components/modals/AddLotModal').then(m => ({ default: m.AddLotModal }))
);
const AddNoteModal = React.lazy(() =>
  import('./AddNoteModal').then(m => ({ default: m.AddNoteModal }))
);

type FABAction = {
  label: string;
  icon: React.ReactNode;
  bg: string;
  color: string;
  onClick: () => void;
  disabled?: boolean;
};

export function GlobalFAB() {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showAddLotModal, setShowAddLotModal] = useState(false);

  const {
    isRefreshing,
    refreshProgress,
    canRefresh,
    handleRefresh: runMarketRefresh,
  } = useMarketRefresh();

  // Theme state
  const [theme, setTheme] = useState(() => localStorage.getItem('mfledger_theme') || 'system');

  // Scroll to Top state
  const [showToTop, setShowToTop] = useState(false);
  const scrollContainerRef = useRef<HTMLElement | Window | null>(null);

  // Hide FAB when modal overlay is open
  const [modalOpen, setModalOpen] = useState(false);
  useEffect(() => {
    function checkModal() {
      setModalOpen(document.querySelector('.modal-overlay') !== null);
    }
    checkModal();
    const observer = new MutationObserver(checkModal);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  // Listen to hotkey events
  useEffect(() => {
    function handleOpenAddLot() {
      setShowAddLotModal(true);
    }
    function handleOpenNote() {
      setShowNoteModal(true);
    }

    window.addEventListener('open-add-lot-modal', handleOpenAddLot);
    window.addEventListener('open-note-modal', handleOpenNote);
    return () => {
      window.removeEventListener('open-add-lot-modal', handleOpenAddLot);
      window.removeEventListener('open-note-modal', handleOpenNote);
    };
  }, []);

  useEffect(() => {
    function handleScroll(e: Event) {
      let scrollTop = 0;
      let scrollElement: HTMLElement | Window | null = null;

      if (e.target === document || e.target === document.documentElement || e.target === document.body) {
        scrollTop = window.scrollY || document.documentElement.scrollTop;
        scrollElement = window;
      } else if (e.target instanceof HTMLElement) {
        if (e.target.closest('.sidebar')) return;
        scrollTop = e.target.scrollTop;
        scrollElement = e.target;
      }

      if (scrollTop > 200) {
        setShowToTop(true);
        scrollContainerRef.current = scrollElement;
      } else {
        setShowToTop(false);
      }
    }

    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, []);

  const scrollToTop = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const fabRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (fabRef.current && !fabRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function openMFLot() {
    setShowAddLotModal(true);
    setIsOpen(false);
  }

  const actions: FABAction[] = [
    {
      label: 'Add Mutual Fund Lot',
      icon: <TrendingUp size={14} />,
      bg: 'var(--accent-glow, var(--green-glow))',
      color: 'var(--accent, var(--green))',
      onClick: openMFLot,
    },
    {
      label: 'Create Note',
      icon: <StickyNote size={14} />,
      bg: 'var(--blue-glow)',
      color: 'var(--blue)',
      onClick: () => { setShowNoteModal(true); setIsOpen(false); },
    },
  ];

  const location = useLocation();
  if (modalOpen || location.pathname === '/landing' || location.pathname === '/about') return null;

  return (
    <>
      <div ref={fabRef} style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 900 }}>

        {/* Refresh progress overlay */}
        {isRefreshing && refreshProgress && (
          <div style={{
            position: 'absolute',
            bottom: '100%',
            right: 0,
            marginBottom: 12,
            background: 'var(--surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '10px 14px',
            minWidth: 220,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            animation: 'fadeIn 0.2s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Loader2 size={13} color="var(--green)" style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)' }}>Refreshing NAVs…</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, maxWidth: 200 }}>
              {refreshProgress.message}
            </div>
            {refreshProgress.total > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    background: 'var(--green)',
                    width: `${Math.round((refreshProgress.done / refreshProgress.total) * 100)}%`,
                    transition: 'width 0.3s ease',
                    borderRadius: 2,
                  }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  {refreshProgress.done} / {refreshProgress.total}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Menu Items */}
        {isOpen && !isRefreshing && (
          <div style={{
            position: 'absolute',
            bottom: '100%',
            right: 0,
            marginBottom: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            alignItems: 'flex-end',
          }}>
            {/* Unified Theme Switcher Action Pill */}
            <div
              className="btn btn-secondary shadow-lg animate-fade-in"
              style={{
                width: 140,
                height: 34,
                borderRadius: 17,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 4px',
                background: 'var(--surface)',
                border: '1px solid var(--border-subtle)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                cursor: 'default',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Light */}
              <button
                type="button"
                title="Light Theme"
                onClick={(e) => {
                  e.stopPropagation();
                  localStorage.setItem('mfledger_theme', 'light');
                  document.documentElement.setAttribute('data-theme', 'light');
                  setTheme('light');
                }}
                style={{
                  border: 'none',
                  background: theme === 'light' ? 'var(--orange-glow)' : 'transparent',
                  color: theme === 'light' ? 'var(--orange)' : 'var(--text-tertiary)',
                  width: 40,
                  height: 26,
                  borderRadius: 13,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all var(--t-fast)',
                }}
              >
                <Sun size={14} />
              </button>
              {/* System */}
              <button
                type="button"
                title="System Theme"
                onClick={(e) => {
                  e.stopPropagation();
                  localStorage.setItem('mfledger_theme', 'system');
                  document.documentElement.setAttribute('data-theme', 'system');
                  setTheme('system');
                }}
                style={{
                  border: 'none',
                  background: theme === 'system' ? 'var(--purple-glow)' : 'transparent',
                  color: theme === 'system' ? 'var(--purple)' : 'var(--text-tertiary)',
                  width: 40,
                  height: 26,
                  borderRadius: 13,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all var(--t-fast)',
                }}
              >
                <Laptop size={14} />
              </button>
              {/* Dark */}
              <button
                type="button"
                title="Dark Theme"
                onClick={(e) => {
                  e.stopPropagation();
                  localStorage.setItem('mfledger_theme', 'dark');
                  document.documentElement.setAttribute('data-theme', 'dark');
                  setTheme('dark');
                }}
                style={{
                  border: 'none',
                  background: theme === 'dark' ? 'var(--blue-glow)' : 'transparent',
                  color: theme === 'dark' ? 'var(--blue)' : 'var(--text-tertiary)',
                  width: 40,
                  height: 26,
                  borderRadius: 13,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all var(--t-fast)',
                }}
              >
                <Moon size={14} />
              </button>
            </div>

            {actions.map((act, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                <button
                  className="btn btn-secondary shadow-lg hover-glow animate-fade-in"
                  style={{
                    width: 190,
                    height: 38,
                    borderRadius: 19,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 12px',
                    gap: 10,
                    whiteSpace: 'nowrap',
                    background: act.disabled ? 'var(--surface-2)' : 'var(--surface)',
                    border: '1px solid var(--border-subtle)',
                    justifyContent: 'flex-start',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    transition: 'transform 0.15s ease',
                    opacity: act.disabled ? 0.6 : 1,
                    cursor: act.disabled ? 'default' : 'pointer',
                  }}
                  onClick={act.onClick}
                >
                  <div style={{
                    background: act.bg,
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    color: act.color,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {act.icon}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 500, color: act.disabled ? 'var(--text-tertiary)' : 'inherit' }}>
                    {act.label}
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Core FAB Button */}
        <button
          className="btn btn-primary shadow-lg whimsy-shake whimsy-rubber-band"
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.2s',
            transform: isOpen ? 'rotate(45deg) scale(1.08)' : 'none',
            background: 'linear-gradient(135deg, var(--accent, var(--green)) 0%, var(--accent-dim, var(--green-dim)) 100%)',
            boxShadow: '0 6px 16px var(--shadow-glow-accent, rgba(0, 179, 134, 0.4))',
          }}
          onClick={() => {
            setIsOpen(!isOpen);
            playCoinSound();
          }}
          disabled={isRefreshing}
          title="Quick Actions"
        >
          {isRefreshing
            ? <Loader2 size={22} style={{ color: '#fff', animation: 'spin 1s linear infinite' }} />
            : <Plus size={24} style={{ color: '#fff' }} />
          }
        </button>
      </div>

      {showNoteModal && (
        <Suspense fallback={null}>
          <AddNoteModal onClose={() => setShowNoteModal(false)} />
        </Suspense>
      )}

      {showAddLotModal && (
        <Suspense fallback={null}>
          <AddLotModal
            defaultClass="EQUITY_MF"
            allowedClasses={['EQUITY_MF', 'INDEX_MF', 'DEBT_MF', 'LIQUID_MF', 'GOLD_MF']}
            title="Add Mutual Fund Lot"
            accountTypes={['MF']}
            onClose={() => setShowAddLotModal(false)}
          />
        </Suspense>
      )}

      {showToTop && !document.body.classList.contains('sidebar-mobile-open') && (
        <button
          type="button"
          className="btn btn-primary shadow-lg animate-fade-in whimsy-shake whimsy-rubber-band"
          style={{
            position: 'fixed',
            bottom: 24,
            left: 'calc(var(--sidebar-w-current, var(--sidebar-w)) + 24px)',
            width: 56,
            height: 56,
            borderRadius: 28,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, var(--accent, var(--green)) 0%, var(--accent-dim, var(--green-dim)) 100%)',
            border: 'none',
            color: '#fff',
            zIndex: 900,
            boxShadow: '0 6px 16px var(--shadow-glow-accent, rgba(0, 179, 134, 0.4))',
            transition: 'transform 0.2s, opacity 0.2s',
          }}
          onClick={scrollToTop}
          title="Scroll to Top"
        >
          <ArrowUp size={24} style={{ color: '#fff' }} />
        </button>
      )}
    </>
  );
}
