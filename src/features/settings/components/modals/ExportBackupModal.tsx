import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Shield, Eye, EyeOff, X, Download, AlertTriangle } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { db } from '@/db/schema';
import { exportDatabaseSnapshot } from '@/db/serializer';
import { encryptBackupPayload } from '@/utils/crypto';

interface ExportBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ExportBackupModal({ isOpen, onClose }: ExportBackupModalProps) {
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  async function handleExport(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!password) {
      setError('Please enter a password to encrypt your backup.');
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

    setSubmitting(true);
    try {
      // 1. Export database snapshot
      const snapshotJson = await exportDatabaseSnapshot(db);

      // 2. Encrypt using industry-standard PBKDF2 + AES-256-GCM
      const encryptedEnvelopeJson = await encryptBackupPayload(snapshotJson, password, db.verno);

      // 3. Download .mfledger file
      const blob = new Blob([encryptedEnvelopeJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const today = new Date().toISOString().split('T')[0];
      a.download = `mfledger_backup_${today}.mfledger`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast('Encrypted backup exported successfully.', 'success');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Export failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div
      className="modal-overlay"
      style={{
        zIndex: 1400,
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => e.target === e.currentTarget && !submitting && onClose()}
    >
      <div
        className="modal slide-up"
        style={{
          maxWidth: 460,
          width: '92%',
          padding: '24px',
          margin: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          boxShadow: '0 24px 38px 3px rgba(0,0,0,0.5), 0 9px 46px 8px rgba(0,0,0,0.3)',
          borderRadius: 16,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'var(--green-glow, rgba(16, 185, 129, 0.15))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--green)',
              }}
            >
              <Shield size={20} strokeWidth={2} />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Export Encrypted Backup
              </h2>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.04em' }}>
                AES-256-GCM • PBKDF2 (100,000 ROUNDS)
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm"
            onClick={onClose}
            disabled={submitting}
          >
            <X size={16} />
          </button>
        </div>

        {/* Info Explainer */}
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 8,
            background: 'var(--bg-secondary)',
            fontSize: 12,
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
          }}
        >
          Your backup contains all accounts, transactions, investments, and settings. Set a password to encrypt the file. <strong>You will need this exact password to decrypt and restore it.</strong>
        </div>

        {/* Form */}
        <form onSubmit={handleExport} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Password Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
              Backup Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Choose a strong backup password"
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 40px 10px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-tertiary)',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Confirm Password Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
              Confirm Password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (error) setError('');
              }}
              placeholder="Re-enter backup password"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--border-default)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: 14,
                outline: 'none',
              }}
            />
          </div>

          {/* Warning Banner */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              fontSize: 12,
              color: 'var(--red, #ef4444)',
              lineHeight: 1.5,
            }}
          >
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              <strong>Zero-Knowledge Notice:</strong> MFLedger cannot reset or recover this password. If lost, this backup file cannot be decrypted.
            </span>
          </div>

          {/* Error Message */}
          {error && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                background: 'var(--red-glow, rgba(239,68,68,0.1))',
                color: 'var(--red, #ef4444)',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={submitting}
              style={{ padding: '8px 16px', fontSize: 13 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || !password || !confirmPassword}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 18px',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {submitting ? (
                <span>Encrypting…</span>
              ) : (
                <>
                  <Download size={15} /> Encrypt & Export Backup
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
