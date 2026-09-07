import React, { useState } from 'react';
import { X, Trash2, Check } from 'lucide-react';
import { db } from '@/db/schema';
import type { Account } from '@/db/schema';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { PRESET_ACCENT_COLORS } from './AddAccountModal';
import { PORTFOLIO_ICONS, AccountIcon } from '@/components/AccountIcon';

interface EditAccountModalProps {
  account: Account;
  onClose: () => void;
}

export function EditAccountModal({ account, onClose }: EditAccountModalProps) {
  const { toast } = useToast();
  const confirm = useConfirm();

  const [name, setName] = useState(account.name);
  const [accountNumber, setAccountNumber] = useState(account.account_number || '');
  const [selectedColor, setSelectedColor] = useState(account.color || '#059669');
  const [selectedIcon, setSelectedIcon] = useState(account.icon || 'Wallet');
  const [isArchived, setIsArchived] = useState(account.is_archived === 1);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast('Portfolio name cannot be empty.', 'error');
      return;
    }

    setLoading(true);
    try {
      await db.accounts.update(account.id, {
        name: name.trim().slice(0, 16),
        account_number: accountNumber.trim() || undefined,
        color: selectedColor,
        icon: selectedIcon,
        is_archived: isArchived ? 1 : 0,
        updated_at: Date.now(),
      });

      toast(`Portfolio "${name.trim().slice(0, 16)}" updated.`, 'success');
      onClose();
    } catch (err: any) {
      toast(err.message || 'Failed to update portfolio.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: 'Delete Portfolio',
      message: `Delete portfolio "${account.name}"? Holding lots associated with this account will remain archived.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!ok) return;

    try {
      await db.accounts.update(account.id, {
        deleted_at: Date.now(),
        updated_at: Date.now(),
      });
      toast(`Portfolio "${account.name}" deleted.`, 'info');
      onClose();
    } catch (err: any) {
      toast(err.message || 'Failed to delete portfolio.', 'error');
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-fade-in" style={{ maxWidth: 460, width: '92%' }}>
        <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: `${selectedColor}22`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: selectedColor,
              }}
            >
              <AccountIcon icon={selectedIcon} size={16} color={selectedColor} />
            </div>
            <h2 className="modal-title" style={{ fontSize: 16, fontWeight: 600 }}>Edit Portfolio Account</h2>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label className="form-label" style={{ margin: 0 }}>Portfolio / Account Name *</label>
              <span style={{ fontSize: 11, color: name.length >= 16 ? 'var(--red)' : 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                {name.length}/16
              </span>
            </div>
            <input
              className="form-input"
              value={name}
              maxLength={16}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Folio / Client ID</label>
            <input
              className="form-input"
              placeholder="e.g. 1029384756"
              value={accountNumber}
              onChange={e => setAccountNumber(e.target.value)}
            />
          </div>

          {/* Professional Lucide Icon Selector */}
          <div className="form-group">
            <label className="form-label">Portfolio Icon</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginTop: 4 }}>
              {PORTFOLIO_ICONS.map(item => {
                const isSelected = selectedIcon === item.id;
                const IconComponent = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedIcon(item.id)}
                    title={item.label}
                    style={{
                      height: 38,
                      borderRadius: 10,
                      border: isSelected ? `2px solid ${selectedColor}` : '1px solid var(--border-subtle)',
                      background: isSelected ? `${selectedColor}18` : 'var(--surface-2)',
                      color: isSelected ? selectedColor : 'var(--text-secondary)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      transform: isSelected ? 'scale(1.06)' : 'scale(1)',
                    }}
                  >
                    <IconComponent size={16} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Accent Color Picker */}
          <div className="form-group">
            <label className="form-label">Accent Color</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {PRESET_ACCENT_COLORS.map(c => {
                const isSelected = selectedColor === c.hex;
                return (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => setSelectedColor(c.hex)}
                    title={c.name}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: c.hex,
                      border: isSelected ? '2px solid #fff' : '2px solid transparent',
                      boxShadow: isSelected ? `0 0 0 2px ${c.hex}` : 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s ease',
                      transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                    }}
                  >
                    {isSelected && <Check size={14} color="#fff" strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Preview Card */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-2)',
              border: `1.5px solid ${selectedColor}`,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 4,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: `${selectedColor}22`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: selectedColor,
              }}
            >
              <AccountIcon icon={selectedIcon} size={16} color={selectedColor} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                {name.trim() || 'Portfolio'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                {accountNumber ? `#${accountNumber}` : 'Custom Accent Preview'}
              </div>
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: selectedColor,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Active
            </span>
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={isArchived}
                onChange={e => setIsArchived(e.target.checked)}
              />
              <span>Archive this portfolio (hide from active holdings)</span>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleDelete}
              style={{ color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Trash2 size={14} /> Delete Portfolio
            </button>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading || !name.trim()}>
                {loading ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
