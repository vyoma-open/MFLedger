import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Check } from 'lucide-react';
import { db } from '../../../db/schema';
import { generateId } from '../../../utils/ids';
import { useToast } from '../../../contexts/ToastContext';
import { useAccount } from '../../../contexts/AccountContext';
import { PORTFOLIO_ICONS, AccountIcon } from '../../../components/AccountIcon';

interface AddAccountModalProps {
  onClose: () => void;
}

export const PRESET_ACCENT_COLORS = [
  { hex: '#059669', name: 'Emerald' },
  { hex: '#0D9488', name: 'Teal' },
  { hex: '#2563EB', name: 'Cobalt' },
  { hex: '#4F46E5', name: 'Indigo' },
  { hex: '#7C3AED', name: 'Amethyst' },
  { hex: '#D97706', name: 'Amber' },
  { hex: '#DC2626', name: 'Crimson' },
  { hex: '#DB2777', name: 'Rose' },
  { hex: '#475569', name: 'Slate' },
  { hex: '#78350F', name: 'Bronze' },
];

export function AddAccountModal({ onClose }: AddAccountModalProps) {
  const { toast } = useToast();
  const { setSelectedAccountId } = useAccount();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [selectedColor, setSelectedColor] = useState('#059669');
  const [selectedIcon, setSelectedIcon] = useState('Wallet');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast('Please enter a portfolio account name.', 'error');
      return;
    }

    setLoading(true);
    try {
      const now = Date.now();
      const newAccId = generateId('acc');
      await db.accounts.add({
        id: newAccId,
        name: name.trim().slice(0, 16),
        type: 'MF',
        subtype: 'ASSET',
        account_number: accountNumber.trim() || undefined,
        color: selectedColor,
        icon: selectedIcon,
        currency: 'INR',
        is_archived: 0,
        version: 1,
        created_at: now,
        updated_at: now,
        deleted_at: 0,
      });

      // Automatically switch user to the newly created portfolio and navigate
      setSelectedAccountId(newAccId);
      navigate('/');

      toast(`Portfolio "${name.trim().slice(0, 16)}" created.`, 'success');
      onClose();
    } catch (err: any) {
      toast(err.message || 'Failed to create portfolio.', 'error');
    } finally {
      setLoading(false);
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
            <h2 className="modal-title" style={{ fontSize: 16, fontWeight: 600 }}>Add Portfolio Account</h2>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
          {/* Portfolio Name */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label className="form-label" style={{ margin: 0 }}>Portfolio / Account Name *</label>
              <span style={{ fontSize: 11, color: name.length >= 16 ? 'var(--red)' : 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                {name.length}/16
              </span>
            </div>
            <input
              className="form-input"
              placeholder="e.g. Zerodha Coin, Groww, CAMS Direct"
              value={name}
              maxLength={16}
              onChange={e => setName(e.target.value)}
              autoFocus
              required
            />
          </div>

          {/* Account/Folio Number */}
          <div className="form-group">
            <label className="form-label">Folio / Client ID (Optional)</label>
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
                {name.trim() || 'Preview Portfolio'}
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading || !name.trim()}>
              {loading ? 'Creating…' : 'Create Portfolio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
