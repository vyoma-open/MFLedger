import React, { useState, useRef, useEffect } from 'react';
import { Layers, ChevronDown, Check, Plus, Pencil } from 'lucide-react';
import { useAccount } from '@/contexts/AccountContext';
import { AccountIcon } from '@/components/AccountIcon';
import { AddAccountModal } from '@/features/assets/components/AddAccountModal';
import { EditAccountModal } from '@/features/assets/components/EditAccountModal';
import type { Account } from '@/db/schema';

export function AccountSelector() {
  const { accounts, selectedAccountId, setSelectedAccountId, selectedAccount } = useAccount();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeColor = selectedAccountId === 'ALL'
    ? 'var(--accent, #00B386)'
    : (selectedAccount?.color || 'var(--accent, #00B386)');

  return (
    <>
      <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
        {/* Selector Button with Fixed Consistent Width */}
        <button
          type="button"
          id="account-selector-btn"
          onClick={() => setIsDropdownOpen(o => !o)}
          className="btn btn-sm"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
            height: 30,
            width: 154,
            padding: '0 10px',
            borderRadius: 'var(--radius)',
            background: activeColor,
            color: '#ffffff',
            border: 'none',
            fontWeight: 600,
            fontSize: 12,
            cursor: 'pointer',
            boxShadow: `0 2px 8px ${activeColor.startsWith('#') ? `${activeColor}40` : 'var(--shadow-glow-accent, rgba(0, 179, 134, 0.3))'}`,
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
          title={selectedAccountId === 'ALL' ? 'All Portfolios' : (selectedAccount?.name ?? 'Selected Portfolio')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1, overflow: 'hidden' }}>
            {selectedAccountId === 'ALL' ? (
              <Layers size={13} style={{ color: '#ffffff', flexShrink: 0 }} />
            ) : (
              <AccountIcon icon={selectedAccount?.icon} size={13} color="#ffffff" />
            )}

            <span
              style={{
                letterSpacing: '-0.01em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textAlign: 'left',
              }}
            >
              {selectedAccountId === 'ALL'
                ? 'All Portfolios'
                : (selectedAccount?.name ?? 'Selected Portfolio')}
            </span>
          </div>

          <ChevronDown
            size={13}
            style={{
              color: 'rgba(255, 255, 255, 0.85)',
              marginLeft: 3,
              flexShrink: 0,
              transition: 'transform 0.2s',
              transform: isDropdownOpen ? 'rotate(180deg)' : 'none',
            }}
          />
        </button>

        {/* Dropdown Menu */}
        {isDropdownOpen && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              zIndex: 1200,
              minWidth: 260,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg), 0 8px 24px rgba(0, 0, 0, 0.14)',
              padding: '6px 0',
              overflow: 'hidden',
              animation: 'fadeIn 0.15s ease',
            }}
          >
            <div
              style={{
                padding: '6px 14px 4px 14px',
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-tertiary)',
              }}
            >
              Portfolio Accounts
            </div>

            {/* All Portfolios Item */}
            <button
              type="button"
              onClick={() => {
                setSelectedAccountId('ALL');
                setIsDropdownOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '8px 14px',
                background: selectedAccountId === 'ALL' ? 'rgba(5, 150, 105, 0.08)' : 'transparent',
                border: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: 12.5,
                fontWeight: selectedAccountId === 'ALL' ? 700 : 500,
                color: selectedAccountId === 'ALL' ? 'var(--green)' : 'var(--text-primary)',
              }}
            >
              <Layers size={14} style={{ color: selectedAccountId === 'ALL' ? 'var(--green)' : 'var(--text-tertiary)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ lineHeight: 1.2 }}>All Portfolios</div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Unified multi-portfolio view</div>
              </div>
              {selectedAccountId === 'ALL' && <Check size={14} style={{ color: 'var(--green)', flexShrink: 0 }} />}
            </button>

            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />

            {/* List of Individual Accounts with Edit Pencil on Right */}
            {accounts.map(acc => {
              const isSelected = selectedAccountId === acc.id;
              const itemColor = acc.color || 'var(--green)';
              return (
                <div
                  key={acc.id}
                  onClick={() => {
                    setSelectedAccountId(acc.id);
                    setIsDropdownOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '8px 14px',
                    background: isSelected ? 'rgba(5, 150, 105, 0.08)' : 'transparent',
                    borderLeft: isSelected ? `3px solid ${itemColor}` : '3px solid transparent',
                    cursor: 'pointer',
                    fontSize: 12.5,
                    fontWeight: isSelected ? 700 : 500,
                    color: isSelected ? itemColor : 'var(--text-primary)',
                    transition: 'background 0.1s ease',
                  }}
                >
                  <div style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <AccountIcon icon={acc.icon} size={14} color={isSelected ? itemColor : 'var(--text-secondary)'} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.name}</div>
                    {acc.account_number && (
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>#{acc.account_number}</div>
                    )}
                  </div>

                  {/* Edit Icon to the right of Account Name */}
                  <button
                    type="button"
                    title={`Edit ${acc.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingAccount(acc);
                      setIsDropdownOpen(false);
                    }}
                    className="btn btn-ghost btn-icon btn-xs"
                    style={{
                      width: 22,
                      height: 22,
                      padding: 0,
                      color: 'var(--text-tertiary)',
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = itemColor)}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)')}
                  >
                    <Pencil size={12} />
                  </button>

                  {isSelected && <Check size={14} style={{ color: itemColor, flexShrink: 0 }} />}
                </div>
              );
            })}

            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />

            {/* Add New Portfolio Action */}
            <button
              type="button"
              id="topbar-menu-add-portfolio-btn"
              onClick={() => {
                setIsDropdownOpen(false);
                setShowAddModal(true);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '8px 14px',
                background: 'transparent',
                border: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: 12.5,
                fontWeight: 600,
                color: 'var(--green)',
              }}
            >
              <Plus size={14} style={{ color: 'var(--green)', flexShrink: 0 }} />
              <span>Add Portfolio Account…</span>
            </button>
          </div>
        )}
      </div>

      {showAddModal && (
        <AddAccountModal onClose={() => setShowAddModal(false)} />
      )}

      {editingAccount && (
        <EditAccountModal account={editingAccount} onClose={() => setEditingAccount(null)} />
      )}
    </>
  );
}
