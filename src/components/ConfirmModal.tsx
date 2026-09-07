import React from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmModal({
  title,
  message,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  danger = true,
}: ConfirmModalProps) {
  return createPortal(
    <div
      className="modal-overlay"
      style={{ zIndex: 1400, position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onCancel()}
    >
      <div
        className="modal slide-up"
        style={{
          maxWidth: 420,
          width: '90%',
          padding: '20px 24px',
          margin: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            {danger && (
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'var(--red-glow)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={16} color="var(--red)" />
              </div>
            )}
            <span
              className="modal-title"
              style={{ fontSize: 15, fontWeight: 600, wordBreak: 'break-word', lineHeight: 1.3 }}
            >
              {title}
            </span>
          </div>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={onCancel}
            style={{
              padding: 0,
              width: 24,
              height: 24,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              flexShrink: 0,
            }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0, wordBreak: 'break-word' }}>
          {message}
        </p>

        <div
          className="modal-footer"
          style={{ borderTop: 'none', padding: 0, marginTop: 4, display: 'flex', gap: 8, justifyContent: 'flex-end' }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '6px 14px', fontSize: 12 }}
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className="btn"
            style={{
              padding: '6px 16px',
              fontSize: 12,
              background: danger ? 'var(--red)' : 'var(--blue)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
            }}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
