import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, Eye, EyeOff, X, AlertTriangle, RefreshCw, FileText, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/db/schema';
import { importDatabaseSnapshot } from '@/db/serializer';
import { decryptBackupPayload } from '@/utils/crypto';

interface RestoreBackupModalProps {
  isOpen: boolean;
  file: File | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function RestoreBackupModal({ isOpen, file, onClose, onSuccess }: RestoreBackupModalProps) {
  const { toast } = useToast();
  const { hasPassword, setupPassword } = useAuth();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fileMeta, setFileMeta] = useState<{ createdAt?: string; algorithm?: string } | null>(null);

  const handleClose = () => {
    if (submitting) return;
    setPassword('');
    setError('');
    setFileMeta(null);
    onClose();
  };

  useEffect(() => {
    if (!isOpen || !file) return;

    // Attempt to peek into envelope metadata without decrypting
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const parsed = JSON.parse(text);
        if (parsed && (parsed.format === 'MFLEDGER_ENCRYPTED_BACKUP' || parsed.ciphertext)) {
          setFileMeta({
            createdAt: parsed.createdAt,
            algorithm: `${parsed.cipher?.algorithm || 'AES-256-GCM'} • ${parsed.kdf?.algorithm || 'PBKDF2'}`,
          });
        }
      } catch {
        // Not a JSON envelope, might be legacy or binary
      }
    };
    reader.readAsText(file);
  }, [isOpen, file]);

  if (!isOpen || !file) return null;

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function formatBackupDate(isoString?: string): string {
    if (!isoString) return 'Unknown date';
    try {
      return new Date(isoString).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return isoString;
    }
  }

  async function handleRestore(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError('');

    if (!password) {
      setError('Please enter the backup decryption password.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Read file as ArrayBuffer for binary/chunk support
      const buffer = await file.arrayBuffer();

      // 2. Decrypt using password and embedded KDF salt
      const { snapshotJson } = await decryptBackupPayload(buffer, password);

      // 3. Restore database snapshot with schema normalization
      await importDatabaseSnapshot(db, snapshotJson);

      // 4. If current device is in unauthenticated state, set up local authentication with the restored password
      if (!hasPassword) {
        try {
          await setupPassword(password, 'Restored Backup Password');
        } catch {
          // Non-critical local credential sync fallback
        }
      }

      toast('Backup restored successfully. Reloading data…', 'success');
      if (onSuccess) {
        onSuccess();
      }
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err: any) {
      const msg = err?.message?.includes('Incorrect password') || err?.name === 'OperationError'
        ? 'Incorrect password or corrupted backup file. Decryption failed.'
        : (err?.message || 'Restore failed. Please check the backup file and password.');
      setError(msg);
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
      onClick={(e) => e.target === e.currentTarget && !submitting && handleClose()}
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
                background: 'rgba(59, 130, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#3b82f6',
              }}
            >
              <ShieldCheck size={20} strokeWidth={2} />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Restore Encrypted Backup
              </h2>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.04em' }}>
                {fileMeta?.algorithm || 'AES-256-GCM • PBKDF2'}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm"
            onClick={handleClose}
            disabled={submitting}
          >
            <X size={16} />
          </button>
        </div>

        {/* File Details Card */}
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 10,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={16} style={{ color: 'var(--text-secondary)' }} />
            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
              {file.name}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)', marginLeft: 24 }}>
            <span>Size: <strong>{formatFileSize(file.size)}</strong></span>
            {fileMeta?.createdAt && (
              <span>Created: <strong>{formatBackupDate(fileMeta.createdAt)}</strong></span>
            )}
          </div>
        </div>

        {/* Warning Callout */}
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
            <strong>Overwrite Warning:</strong> Restoring will replace your current local database with the data from this backup file. This cannot be undone.
          </span>
        </div>

        {/* Form */}
        <form onSubmit={handleRestore} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Password Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
              Backup Decryption Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Enter the password used when exporting"
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
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              The database will only be overwritten if decryption succeeds.
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
              onClick={handleClose}
              disabled={submitting}
              style={{ padding: '8px 16px', fontSize: 13 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-danger"
              disabled={submitting || !password}
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
                <>
                  <RefreshCw size={15} className="spin" />
                  <span>Decrypting & Restoring…</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={15} /> Decrypt & Restore
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
