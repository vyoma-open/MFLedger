/// <reference types="vite-plugin-pwa/react" />
import React, { useEffect, useState, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { AccountProvider } from '@/contexts/AccountContext';
import { BalancesProvider } from '@/contexts/BalancesContext';
import { ConfirmProvider } from '@/contexts/ConfirmContext';
import { PeriodProvider } from '@/contexts/PeriodContext';
import { Sidebar } from '@/components/Sidebar/Sidebar';
import { GlobalFAB } from '@/components/GlobalFAB';
import { PullToRefresh } from '@/components/PullToRefresh';
import { seedDatabase } from '@/db/seed';
import { loadHotkeys } from '@/utils/hotkeys';
import { Loader2 } from 'lucide-react';

import { LockScreen } from '@/features/lock';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Lazy-loaded pages
const MutualFunds = React.lazy(() => import('@/features/investments').then(m => ({ default: m.MutualFunds })));
const TradeLedger = React.lazy(() => import('@/features/investments').then(m => ({ default: m.TradeLedger })));
const Tax        = React.lazy(() => import('@/features/tax').then(m => ({ default: m.Tax })));
const Simulator  = React.lazy(() => import('@/features/simulator').then(m => ({ default: m.Simulator })));
const Notes      = React.lazy(() => import('@/features/notes').then(m => ({ default: m.Notes })));
const Settings   = React.lazy(() => import('@/features/settings').then(m => ({ default: m.Settings })));
const LandingPage = React.lazy(() => import('@/features/landing').then(m => ({ default: m.LandingPage })));

function PageLoader() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 12 }}>
      <Loader2 size={24} style={{ color: 'var(--green)', animation: 'spin 1s linear infinite' }} />
      <div style={{ color: 'var(--text-tertiary)', fontSize: 11, fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="anim-pulse">Loading…</div>
    </div>
  );
}

function PWABanner() {
  useEffect(() => {
    if (import.meta.env.DEV && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        let reloaded = false;
        for (const registration of registrations) {
          registration.unregister().then(success => {
            if (success && !reloaded) {
              reloaded = true;
              console.log('Unregistered active service worker in development mode to prevent stale caching.');
              window.location.reload();
            }
          });
        }
      });
    }
  }, []);

  useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (import.meta.env.DEV) return;
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    },
  });

  useEffect(() => {
    if (import.meta.env.DEV) return;
    if (!('serviceWorker' in navigator)) return;
    const handleControllerChange = () => {
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    async function handleKey(e: KeyboardEvent) {
      if (e.key === 'F5' || (e.ctrlKey && e.key === 'r') || (e.metaKey && e.key === 'r')) {
        e.preventDefault();
        try {
          const reg = await navigator.serviceWorker?.getRegistration();
          if (reg) {
            await reg.update();
          }
        } catch (err) {
          console.error('SW manual update check failed:', err);
        } finally {
          window.location.reload();
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return null;
}

function HotkeyListener() {
  const navigate = useNavigate();

  useEffect(() => {
    let keyHistory = '';
    let lastKeyTime = 0;
    let config = loadHotkeys();

    function handleUpdate() {
      config = loadHotkeys();
    }
    window.addEventListener('hotkeys-updated', handleUpdate);

    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;

      const now = Date.now();
      if (now - lastKeyTime > 1000) {
        keyHistory = '';
      }
      lastKeyTime = now;

      const keyChar = e.key.toLowerCase();
      keyHistory = keyHistory ? `${keyHistory} ${keyChar}` : keyChar;

      if (e.key === 'Escape') {
        const overlays = document.querySelectorAll('.modal-overlay');
        overlays.forEach(overlay => {
          const closeBtn = overlay.querySelector('button[aria-label="Close"]');
          if (closeBtn instanceof HTMLElement) {
            closeBtn.click();
          } else {
            if (overlay instanceof HTMLElement) overlay.click();
          }
        });
        keyHistory = '';
        return;
      }

      if (keyHistory === config.goToPortfolio) {
        navigate('/');
        keyHistory = '';
      } else if (keyHistory === config.goToTrades) {
        navigate('/trades');
        keyHistory = '';
      } else if (keyHistory === config.goToTax) {
        navigate('/tax');
        keyHistory = '';
      } else if (keyHistory === config.goToSimulator) {
        navigate('/simulator');
        keyHistory = '';
      } else if (keyHistory === config.goToSettings) {
        navigate('/settings');
        keyHistory = '';
      } else if (keyHistory === config.createLot) {
        window.dispatchEvent(new Event('open-add-lot-modal'));
        keyHistory = '';
      } else if (keyHistory === config.createNote) {
        window.dispatchEvent(new Event('open-note-modal'));
        keyHistory = '';
      }

      const parts = keyHistory.split(' ');
      if (parts.length > 2) {
        keyHistory = parts.slice(-2).join(' ');
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('hotkeys-updated', handleUpdate);
    };
  }, [navigate]);

  return null;
}

function AppShell() {
  const { isUnlocked, isLoading } = useAuth();
  const location = useLocation();
  const isLanding = location.pathname === '/landing' || location.pathname === '/about';

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)', gap: 16, width: '100%' }}>
        <Loader2 size={32} style={{ color: 'var(--green)', animation: 'spin 1s linear infinite' }} />
        <div style={{ color: 'var(--text-tertiary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }} className="anim-pulse">Initializing MFLedger</div>
      </div>
    );
  }

  if (isLanding) {
    return (
      <AccountProvider>
        <BalancesProvider>
          <div className="app-layout">
            <Sidebar forceCollapsed={true} />
            <main className="main-content" role="main" style={{ padding: 0, overflowY: 'auto' }}>
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <LandingPage />
                </Suspense>
              </ErrorBoundary>
            </main>
          </div>
        </BalancesProvider>
      </AccountProvider>
    );
  }

  if (!isUnlocked) {
    return <LockScreen />;
  }

  return (
    <AccountProvider>
      <BalancesProvider>
        <HotkeyListener />
        <div className="app-layout">
          <Sidebar />
          <PullToRefresh>
            <main className="main-content" role="main">
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    {/* Primary MF Routes */}
                    <Route path="/"                  element={<MutualFunds />} />
                    <Route path="/portfolio"         element={<Navigate to="/" replace />} />
                    <Route path="/trades"            element={<TradeLedger />} />
                    <Route path="/orders"            element={<Navigate to="/trades" replace />} />
                    <Route path="/trade-ledger"      element={<Navigate to="/trades" replace />} />

                    {/* Folio specific filter */}
                    <Route path="/portfolio/:accountId" element={<MutualFunds />} />

                    {/* Tax & Harvesting */}
                    <Route path="/tax"               element={<Tax />} />
                    <Route path="/tax-rules"         element={<Navigate to="/tax" replace />} />

                    {/* SIP Simulator */}
                    <Route path="/simulator"         element={<Simulator />} />

                    {/* Notes & Settings */}
                    <Route path="/notes"             element={<Notes />} />
                    <Route path="/settings"          element={<Settings />} />

                    {/* Landing Page */}
                    <Route path="/landing"          element={<LandingPage />} />
                    <Route path="/about"            element={<Navigate to="/landing" replace />} />

                    {/* Catch-all redirects */}
                    <Route path="*"                  element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </ErrorBoundary>
            <GlobalFAB />
            <PWABanner />
          </main>
          </PullToRefresh>
        </div>
      </BalancesProvider>
    </AccountProvider>
  );
}

function App() {
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('mfledger_theme') || 'system';
    document.documentElement.setAttribute('data-theme', savedTheme);

    const savedAnim = localStorage.getItem('mfledger_animations');
    if (savedAnim === 'false') {
      document.documentElement.setAttribute('data-no-animations', 'true');
    }

    seedDatabase()
      .catch(err => {
        console.error('Database seeding failed:', err);
      })
      .finally(() => {
        setSeeded(true);
      });
  }, []);

  if (!seeded) return null;

  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <ConfirmProvider>
            <PeriodProvider>
              <AppShell />
            </PeriodProvider>
          </ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
