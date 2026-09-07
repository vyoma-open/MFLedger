import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Lock, Eye, EyeOff, BookOpen, UserPlus, X, Upload } from 'lucide-react';
import { RestoreBackupModal } from '@/features/settings/components/modals/RestoreBackupModal';

export function LockScreen() {
  const { hasPassword, username: currentUsername, unlock, setupPassword, resetAndCreateAccount, isLoading } = useAuth();
  const [usernameInput, setUsernameInput] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Switch / Create Account Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [modalUsername, setModalUsername] = useState('');
  const [modalPassword, setModalPassword] = useState('');
  const [modalConfirmPassword, setModalConfirmPassword] = useState('');
  const [modalError, setModalError] = useState('');

  // Restore Backup modal state
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!password || submitting) return;
    setError('');
    setSubmitting(true);
    try {
      const ok = await unlock(password);
      if (!ok) {
        setError('Incorrect password. Please try again.');
        setPassword('');
        inputRef.current?.focus();
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    if (!password || submitting) return;
    if (!usernameInput.trim()) {
      setError('Username is required.');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await setupPassword(password, 'MFLedger Personal', usernameInput.trim());
    } catch (err: any) {
      setError(err?.message?.includes('network') || err?.message?.includes('fetch')
        ? 'Note: cloud sync registration failed — app is set up locally only.'
        : (err?.message || 'Setup failed.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleModalCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!modalUsername.trim()) {
      setModalError('Username is required.');
      return;
    }
    if (modalPassword.length < 4) {
      setModalError('Password must be at least 4 characters.');
      return;
    }
    if (modalPassword !== modalConfirmPassword) {
      setModalError('Passwords do not match.');
      return;
    }
    setModalError('');
    setSubmitting(true);
    try {
      await resetAndCreateAccount(modalUsername.trim(), modalPassword);
      setShowCreateModal(false);
    } catch (err: any) {
      setModalError(err?.message || 'Account creation failed.');
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div style={styles.root}>
        <div style={styles.card}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={styles.spinner} />
            <span style={{ color: 'var(--text-tertiary)', fontSize: 12, letterSpacing: '0.05em' }}>
              INITIALIZING
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logoRow}>
          <img
            src="/logo.png"
            alt="MFLedger Logo"
            style={{ width: 36, height: 36, borderRadius: 9, objectFit: 'contain' }}
          />
          <span style={styles.appName}>MFLedger</span>
        </div>

        <div style={styles.lockIconRow}>
          <Lock size={32} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
        </div>

        <h1 style={styles.title}>
          {hasPassword ? `Welcome back${currentUsername ? `, ${currentUsername}` : ''}` : 'Create your account'}
        </h1>
        <p style={styles.subtitle}>
          {hasPassword
            ? 'Enter your password to access your financial data.'
            : 'Set up a username and password to protect your data. You\'ll need this every time you open MFLedger.'}
        </p>

        <form onSubmit={hasPassword ? handleUnlock : handleSetup} style={styles.form}>
          {/* Username field — only on setup */}
          {!hasPassword && (
            <div style={styles.fieldWrap}>
              <label style={styles.label}>Username</label>
              <div style={styles.inputRow}>
                <input
                  type="text"
                  value={usernameInput}
                  onChange={e => { setUsernameInput(e.target.value); setError(''); }}
                  placeholder="Enter your name or username"
                  style={styles.input}
                  disabled={submitting}
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* Password field */}
          <div style={styles.fieldWrap}>
            <label style={styles.label}>Password</label>
            <div style={styles.inputRow}>
              <input
                ref={hasPassword ? inputRef : undefined}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder={hasPassword ? 'Enter your password' : 'Choose a password'}
                style={styles.input}
                autoComplete={hasPassword ? 'current-password' : 'new-password'}
                disabled={submitting}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                style={styles.eyeBtn}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword
                  ? <EyeOff size={15} style={{ color: 'var(--text-tertiary)' }} />
                  : <Eye size={15} style={{ color: 'var(--text-tertiary)' }} />}
              </button>
            </div>
          </div>

          {/* Confirm password — only on setup */}
          {!hasPassword && (
            <div style={styles.fieldWrap}>
              <label style={styles.label}>Confirm Password</label>
              <div style={styles.inputRow}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
                  placeholder="Re-enter your password"
                  style={styles.input}
                  autoComplete="new-password"
                  disabled={submitting}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={styles.error}>{error}</div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || !password || (!hasPassword && (!confirmPassword || !usernameInput.trim()))}
            style={{
              ...styles.submitBtn,
              opacity: submitting || !password ? 0.5 : 1,
              cursor: submitting || !password ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting
              ? (hasPassword ? 'Unlocking…' : 'Creating Account…')
              : (hasPassword ? 'Unlock' : 'Create Account & Open')}
          </button>
        </form>

        {/* Action links */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 16 }}>
          {hasPassword && (
            <button
              type="button"
              onClick={() => {
                setModalUsername('');
                setModalPassword('');
                setModalConfirmPassword('');
                setModalError('');
                setShowCreateModal(true);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--green)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Forgot Password? / Create New Account
            </button>
          )}

          <label
            htmlFor="lockscreen-restore-file"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px',
              borderRadius: 6,
            }}
          >
            <Upload size={13} style={{ color: 'var(--text-tertiary)' }} />
            <span>Restore from Backup (.mfledger)</span>
            <input
              id="lockscreen-restore-file"
              type="file"
              accept=".mfledger,.json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setRestoreFile(f);
                  setShowRestoreModal(true);
                }
                e.target.value = '';
              }}
            />
          </label>
        </div>

        {/* Footer note */}
        <p style={styles.footer}>
          {hasPassword
            ? 'Your data is stored locally on this device.'
            : 'Your data never leaves this device. Password protects local access.'}
        </p>
      </div>

      {/* Restore Backup Modal */}
      <RestoreBackupModal
        isOpen={showRestoreModal}
        file={restoreFile}
        onClose={() => {
          setShowRestoreModal(false);
          setRestoreFile(null);
        }}
      />

      {/* Switch / Create Account Modal */}
      {showCreateModal && (
        <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={e => e.target === e.currentTarget && setShowCreateModal(false)}>
          <div className="modal slide-up" style={{ maxWidth: 380, padding: 24 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>
                <UserPlus size={18} color="var(--green)" /> Create New Account
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowCreateModal(false)}>
                <X size={15} />
              </button>
            </div>

            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
              ⚠️ Setting up a new account will reset local data on this device and set up a fresh workspace for your new username.
            </p>

            <form onSubmit={handleModalCreateAccount} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={styles.fieldWrap}>
                <label style={styles.label}>New Username</label>
                <input
                  type="text"
                  value={modalUsername}
                  onChange={e => { setModalUsername(e.target.value); setModalError(''); }}
                  placeholder="e.g. Investor, Trader, Primary"
                  style={styles.input}
                  autoFocus
                />
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>New Password</label>
                <input
                  type="password"
                  value={modalPassword}
                  onChange={e => { setModalPassword(e.target.value); setModalError(''); }}
                  placeholder="Choose new password"
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>Confirm Password</label>
                <input
                  type="password"
                  value={modalConfirmPassword}
                  onChange={e => { setModalConfirmPassword(e.target.value); setModalError(''); }}
                  placeholder="Confirm new password"
                  style={styles.input}
                />
              </div>

              {modalError && (
                <div style={styles.error}>{modalError}</div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1, height: 38 }}
                  onClick={() => setShowCreateModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1.5, height: 38 }}
                  disabled={submitting || !modalUsername.trim() || !modalPassword}
                >
                  {submitting ? 'Creating…' : 'Create & Open'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes lock-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes lock-fade-in {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg)',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: '40px 36px',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    animation: 'lock-fade-in 0.3s ease both',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 32,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: 'rgba(var(--green-rgb, 34,197,94), 0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: '-0.01em',
    fontFamily: 'var(--font-sans)',
  },
  lockIconRow: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: '0 0 8px',
    textAlign: 'center',
    letterSpacing: '-0.02em',
    fontFamily: 'var(--font-sans)',
  },
  subtitle: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    textAlign: 'center',
    margin: '0 0 28px',
    lineHeight: 1.6,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  fieldWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: 'var(--text-tertiary)',
  },
  inputRow: {
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
  },
  input: {
    width: '100%',
    padding: '10px 40px 10px 12px',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 14,
    fontFamily: 'var(--font-sans)',
    outline: 'none',
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.15s',
  },
  eyeBtn: {
    position: 'absolute' as const,
    right: 10,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 4,
    display: 'flex',
    alignItems: 'center',
  },
  error: {
    fontSize: 12,
    color: 'var(--red, #ef4444)',
    background: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: 6,
    padding: '8px 12px',
    lineHeight: 1.5,
  },
  submitBtn: {
    width: '100%',
    padding: '12px',
    background: 'var(--green)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
    marginTop: 4,
    transition: 'opacity 0.15s',
    letterSpacing: '-0.01em',
  },
  footer: {
    fontSize: 11,
    color: 'var(--text-tertiary)',
    textAlign: 'center' as const,
    marginTop: 20,
    lineHeight: 1.6,
  },
  spinner: {
    width: 24,
    height: 24,
    border: '2px solid var(--border)',
    borderTopColor: 'var(--green)',
    borderRadius: '50%',
    animation: 'lock-spin 0.7s linear infinite',
  },
};

