import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Download, Upload, Database, Trash2, LogOut, Lock } from 'lucide-react';
import { db } from '@/db/schema';
import { getSetting, setSetting, seedDatabase } from '@/db/seed';
import { hashPassword, verifyPassword, deriveKeyAndAuthHash, hexToBytes } from '@/utils/crypto';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { addDummyData } from '@/utils/dummyData';
import { Topbar } from '@/components/Topbar/Topbar';
import { ImportSection } from '@/features/import/components/ImportData';
import { useAuth } from '@/contexts/AuthContext';
import { loadHotkeys, saveHotkeys, DEFAULT_HOTKEYS } from '@/utils/hotkeys';
import type { HotkeyConfig } from '@/utils/hotkeys';
import { playCoinSound } from '@/utils/whimsy';
import { ExportBackupModal } from './modals/ExportBackupModal';
import { RestoreBackupModal } from './modals/RestoreBackupModal';

// ─── Section Wrapper ──────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-tertiary)', marginBottom: 12 }}>
        {title}
      </div>
      <div className="card card-sm" style={{ padding: 'var(--space-4)' }}>{children}</div>
    </div>
  );
}

// ─── Backup / Restore ─────────────────────────────────────────────────────────
function BackupSection() {
  const [showExportModal, setShowExportModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreFile(file);
    setShowRestoreModal(true);
    e.target.value = '';
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.7 }}>
        Export an encrypted snapshot of your entire MFLedger database. The backup is secured with AES-256-GCM encryption using a password of your choice.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowExportModal(true)}
        >
          <Download size={14} /> Export Backup
        </button>

        <label
          htmlFor="import-file"
          className="btn btn-secondary"
          style={{ cursor: 'pointer' }}
        >
          <Upload size={14} /> Restore Backup
          <input
            id="import-file"
            type="file"
            accept=".mfledger,.json"
            style={{ display: 'none' }}
            onChange={handleFileSelected}
          />
        </label>
      </div>

      <ExportBackupModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
      />

      <RestoreBackupModal
        isOpen={showRestoreModal}
        file={restoreFile}
        onClose={() => {
          setShowRestoreModal(false);
          setRestoreFile(null);
        }}
      />
    </div>
  );
}

// ─── Demo Data ────────────────────────────────────────────────────────────────
function DemoSection() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  async function handleAddDummy() {
    const ok = await confirm({
      title: 'Load Demo Data',
      message: 'This will clear existing lots and reload sample Indian mutual funds (Parag Parikh, UTI Nifty 50, HDFC Midcap, ICICI Bond, Nippon Gold). Continue?',
      confirmText: 'Load Demo',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!ok) return;
    setLoading(true);
    try {
      await db.profiles.clear();
      await db.accounts.clear();
      await db.investment_lots.clear();
      await db.lot_consumption_events.clear();
      await db.market_cache.clear();
      await db.notes.clear();
      await db.goals.clear();
      await db.goal_contributions.clear();
      await setSetting('db_seeded', false);

      const result = await addDummyData();
      toast(result.message, 'success');
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (err: any) {
      toast(err.message ?? 'Failed to load demo data.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleClearAll() {
    const ok1 = await confirm({
      title: 'Delete All Data',
      message: '⚠️ This will permanently DELETE all your mutual fund holdings, lots, and trades. Continue?',
      confirmText: 'Delete Permanently',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!ok1) return;

    const ok2 = await confirm({
      title: 'Final Confirmation',
      message: 'This cannot be undone. Are you sure you want to proceed?',
      confirmText: 'Yes, Delete Everything',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!ok2) return;

    const passwordHash = await getSetting<string | null>('password_hash');
    const passwordHint = await getSetting<string | null>('password_hint');
    const salt = await getSetting<string | null>('salt');
    const username = await getSetting<string | null>('username');

    await db.profiles.clear();
    await db.accounts.clear();
    await db.investment_lots.clear();
    await db.lot_consumption_events.clear();
    await db.tax_rules.clear();
    await db.recurring_templates.clear();
    await db.market_cache.clear();
    await db.notes.clear();
    await db.goals.clear();
    await db.goal_contributions.clear();
    await db.app_settings.clear();

    if (passwordHash) await setSetting('password_hash', passwordHash);
    if (passwordHint) await setSetting('password_hint', passwordHint);
    if (salt) await setSetting('salt', salt);
    if (username) await setSetting('username', username);

    await seedDatabase();

    toast('All data cleared.', 'info');
    navigate('/');
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.7 }}>
        Populate the app with a clean sample Indian mutual fund portfolio with active SIPs, historical purchase lots, and live AMFI NAV tracking.
      </p>
      <div className="flex gap-2">
        <button id="add-demo-btn" className="btn btn-secondary" onClick={handleAddDummy} disabled={loading}>
          <Database size={14} /> {loading ? 'Adding…' : 'Add Sample Portfolio'}
        </button>
        <button className="btn btn-danger" onClick={handleClearAll}><Trash2 size={14} /> Clear All Data</button>
      </div>
    </div>
  );
}

// ─── Security ─────────────────────────────────────────────────────────────────
function SecuritySection() {
  const { toast } = useToast();
  const confirmFn = useConfirm();
  const { hasPassword, setupPassword, removePassword } = useAuth();
  
  const [hintInput, setHintInput] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) { toast('Passwords do not match.', 'error'); return; }
    if (next.length < 4) { toast('Password must be at least 4 characters.', 'error'); return; }
    setLoading(true);
    try {
      await setupPassword(next, hintInput);
      setCurrent(''); setNext(''); setConfirm(''); setHintInput('');
      toast('Master password protection enabled.', 'success');
    } catch (err: any) {
      toast(err.message || 'Failed to enable password.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleChange(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) { toast('Passwords do not match.', 'error'); return; }
    if (next.length < 4) { toast('Min 4 characters.', 'error'); return; }
    setLoading(true);
    try {
      const stored = await getSetting<string>('password_hash');
      if (stored) {
        const saltHex = await getSetting<string | null>('salt') || undefined;
        const { ok } = await verifyPassword(current, stored, saltHex);
        if (!ok) { toast('Current password incorrect.', 'error'); setLoading(false); return; }
      }
      const saltHex = await getSetting<string | null>('salt');
      if (saltHex) {
        const salt = hexToBytes(saltHex);
        const { authHash } = await deriveKeyAndAuthHash(next, salt);
        await setSetting('password_hash', authHash);
      } else {
        const hash = await hashPassword(next);
        await setSetting('password_hash', hash);
      }
      setCurrent(''); setNext(''); setConfirm('');
      toast('Password changed successfully.', 'success');
    } catch (err: any) {
      toast(err.message || 'Failed to change password.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove() {
    if (!current) { toast('Enter current password to remove protection.', 'error'); return; }
    const stored = await getSetting<string>('password_hash');
    if (stored) {
      const saltHex = await getSetting<string | null>('salt') || undefined;
      const { ok } = await verifyPassword(current, stored, saltHex);
      if (!ok) { toast('Current password incorrect.', 'error'); return; }
    }
    const ok = await confirmFn({
      title: 'Remove Password Protection',
      message: 'Remove password lock? Your local database will be unlocked without authentication.',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!ok) return;
    await removePassword();
    setCurrent(''); setNext(''); setConfirm('');
    toast('Password protection removed.', 'info');
  }

  if (!hasPassword) {
    return (
      <form onSubmit={handleSetup}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          MFLedger is currently unlocked. Set a master password or PIN to encrypt and protect your portfolio.
        </p>
        <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div className="form-group">
            <label className="form-label">New Password / PIN</label>
            <input type="password" className="form-input" value={next} onChange={e => setNext(e.target.value)} placeholder="New Password" required />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input type="password" className="form-input" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Confirm Password" required />
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 16 }}>
          <label className="form-label">Password Hint (optional)</label>
          <input
            type="text"
            className="form-input"
            value={hintInput}
            onChange={e => setHintInput(e.target.value)}
            placeholder="e.g. My favorite milestone"
          />
        </div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={loading}><Shield size={13} /> {loading ? 'Enabling…' : 'Enable Password'}</button>
      </form>
    );
  }

  return (
    <form onSubmit={handleChange}>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        Change your master password, or remove password protection.
      </p>
      <div className="form-group" style={{ marginBottom: 12 }}>
        <label className="form-label">Current Password</label>
        <input type="password" className="form-input" value={current} onChange={e => setCurrent(e.target.value)} placeholder="Current password" />
      </div>
      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div className="form-group">
          <label className="form-label">New Password</label>
          <input type="password" className="form-input" value={next} onChange={e => setNext(e.target.value)} placeholder="New password" />
        </div>
        <div className="form-group">
          <label className="form-label">Confirm New Password</label>
          <input type="password" className="form-input" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Confirm new password" />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={loading || !next}>{loading ? 'Updating…' : 'Change Password'}</button>
        <button type="button" className="btn btn-danger btn-sm" onClick={handleRemove}>Remove Password</button>
      </div>
    </form>
  );
}

// ─── Hotkeys ──────────────────────────────────────────────────────────────────
function HotkeysSection() {
  const { toast } = useToast();
  const [config, setConfig] = useState<HotkeyConfig>(loadHotkeys);
  const [rebindingKey, setRebindingKey] = useState<keyof HotkeyConfig | null>(null);
  const [pressedSequence, setPressedSequence] = useState<string[]>([]);

  useEffect(() => {
    if (rebindingKey === null) return;

    function handleKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setRebindingKey(null);
        setPressedSequence([]);
        toast('Rebinding canceled.', 'info');
        return;
      }

      const keyChar = e.key.toLowerCase();
      if (['shift', 'control', 'alt', 'meta'].includes(keyChar)) return;

      const nextSequence = [...pressedSequence, keyChar];
      setPressedSequence(nextSequence);

      if (nextSequence.length >= 2 || rebindingKey === 'createLot' || rebindingKey === 'createNote') {
        const finalShortcut = nextSequence.join(' ');
        const nextConfig = { ...config, [rebindingKey as string]: finalShortcut };
        setConfig(nextConfig);
        saveHotkeys(nextConfig);
        toast('Shortcut updated.', 'success');
        setRebindingKey(null);
        setPressedSequence([]);
      }
    }

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [rebindingKey, pressedSequence, config, toast]);

  function handleReset() {
    setConfig(DEFAULT_HOTKEYS);
    saveHotkeys(DEFAULT_HOTKEYS);
    toast('Shortcuts reset to default.', 'info');
  }

  const shortcutLabels: Record<keyof HotkeyConfig, string> = {
    goToPortfolio: 'Go to Mutual Fund Portfolio',
    goToTrades: 'Go to Trades & Orders',
    goToTax: 'Go to Tax & Capital Gains',
    goToSimulator: 'Go to SIP Simulator',
    goToSettings: 'Go to Settings',
    createLot: 'Add Mutual Fund Lot Modal',
    createNote: 'Create Note Modal',
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.7 }}>
        View and customize keyboard shortcuts. Press single keys or two-key combinations (e.g. <strong>g p</strong>) to quickly navigate or trigger modals.
      </p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 16, marginBottom: 16 }}>
        {(Object.keys(shortcutLabels) as Array<keyof HotkeyConfig>).map(k => {
          const isRebinding = rebindingKey === k;
          return (
            <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{shortcutLabels[k]}</span>
              <button
                type="button"
                className={`btn btn-sm ${isRebinding ? 'btn-primary anim-pulse' : 'btn-secondary'}`}
                style={{ fontFamily: 'var(--font-mono)', minWidth: 90, textAlign: 'center', fontSize: 12 }}
                onClick={() => {
                  setRebindingKey(k);
                  setPressedSequence([]);
                }}
              >
                {isRebinding ? (pressedSequence.join(' ') || 'Press keys…') : (config[k] || 'None')}
              </button>
            </div>
          );
        })}
      </div>

      <button type="button" className="btn btn-secondary btn-sm" onClick={handleReset}>
        Reset to Default Hotkeys
      </button>
    </div>
  );
}

// ─── Whimsy & Sound ───────────────────────────────────────────────────────────
function WhimsySection() {
  const { toast } = useToast();
  const [sound, setSound] = useState(() => localStorage.getItem('mfledger_sound') !== 'false');
  const [animations, setAnimations] = useState(() => localStorage.getItem('mfledger_animations') !== 'false');

  function handleToggleSound() {
    const next = !sound;
    setSound(next);
    localStorage.setItem('mfledger_sound', String(next));
    if (next) playCoinSound();
    toast(next ? 'Sound effects enabled 🔊' : 'Sound effects muted 🔇', 'info');
  }

  function handleToggleAnimations() {
    const next = !animations;
    setAnimations(next);
    localStorage.setItem('mfledger_animations', String(next));
    if (next) {
      document.documentElement.removeAttribute('data-no-animations');
    } else {
      document.documentElement.setAttribute('data-no-animations', 'true');
    }
    toast(next ? 'Animations enabled ✨' : 'Animations disabled', 'info');
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.7 }}>
        Configure sound effects and micro-animations to suit your style.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, userSelect: 'none' }}>
          <input type="checkbox" checked={sound} onChange={handleToggleSound} />
          <span>Enable Sound Effects (ASMR chime on trade confirmations)</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, userSelect: 'none' }}>
          <input type="checkbox" checked={animations} onChange={handleToggleAnimations} />
          <span>Enable Micro-Animations (Smooth transitions, card ripples)</span>
        </label>
      </div>
    </div>
  );
}

function AccountStatusHeader() {
  const { hasPassword, lock, removePassword } = useAuth();
  const { toast } = useToast();
  const confirm = useConfirm();

  async function handleLogout() {
    const ok = await confirm({
      title: 'Remove Password Lock',
      message: 'Are you sure you want to remove password lock from this device?',
      confirmText: 'Remove Lock',
      cancelText: 'Cancel',
      danger: true,
    });
    if (ok) {
      await removePassword();
      toast('Lock removed.', 'info');
    }
  }

  return (
    <div 
      className="card card-sm" 
      style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        padding: '16px 20px', 
        marginBottom: 24, 
        borderLeft: hasPassword ? '4px solid var(--green)' : '4px solid var(--orange)',
        background: 'var(--surface)',
        gap: 16,
        flexWrap: 'wrap'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: '1 1 auto', minWidth: 260 }}>
        <div 
          style={{ 
            width: 40, 
            height: 40, 
            borderRadius: '50%', 
            background: hasPassword ? 'var(--green-glow)' : 'var(--orange-glow)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            color: hasPassword ? 'var(--green)' : 'var(--orange)',
            flexShrink: 0
          }}
        >
          <Shield size={20} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            {hasPassword ? 'Local Encrypted Database (PBKDF2 / AES-256)' : 'Local Storage Mode (Unencrypted)'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>
            {hasPassword 
              ? 'Your mutual fund holdings are stored locally in IndexedDB with master password protection.' 
              : 'Set a password to lock your mutual fund portfolio and protect your data.'}
          </div>
        </div>
      </div>
      
      <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
        {hasPassword ? (
          <>
            <button 
              className="btn btn-secondary btn-sm flex items-center gap-1" 
              onClick={lock}
            >
              <Lock size={13} /> Lock Device
            </button>
            <button 
              className="btn btn-secondary btn-sm flex items-center gap-1" 
              onClick={handleLogout}
              style={{ color: 'var(--red)', borderColor: 'rgba(224, 82, 96, 0.2)' }}
            >
              <LogOut size={13} /> Remove Lock
            </button>
          </>
        ) : (
          <button 
            className="btn btn-primary btn-sm flex items-center gap-1" 
            onClick={lock}
          >
            <Shield size={13} /> Setup Password Lock
          </button>
        )}
      </div>
    </div>
  );
}

export default function Settings() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Topbar title="Settings" />
      <div className="page" style={{ overflowY: 'auto', padding: 'var(--page-pad-y) var(--page-pad-x) calc(var(--page-pad-y) + 72px) var(--page-pad-x)' }}>
        <AccountStatusHeader />
        <Section title="Import CAS & Statements"><ImportSection /></Section>
        <Section title="Backup & Restore"><BackupSection /></Section>
        <Section title="Sample Portfolio & Data Management"><DemoSection /></Section>
        <Section title="Security & Authentication"><SecuritySection /></Section>
        <Section title="Keyboard Shortcuts"><HotkeysSection /></Section>
        <Section title="Interaction & Audio"><WhimsySection /></Section>
      </div>
    </div>
  );
}
