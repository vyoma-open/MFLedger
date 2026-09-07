import React, { createContext, useContext, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import type { Account } from '../db/schema';
import { generateId } from '../utils/ids';
import { applyAccountAccentColor } from '../utils/accentColor';

interface AccountCtx {
  accounts: Account[];
  selectedAccountId: string; // 'ALL' or specific account id
  setSelectedAccountId: (id: string) => void;
  selectedAccount: Account | null;
  isLoading: boolean;
}

const AccountContext = createContext<AccountCtx>({
  accounts: [],
  selectedAccountId: 'ALL',
  setSelectedAccountId: () => {},
  selectedAccount: null,
  isLoading: true,
});

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const accounts = useLiveQuery(
    () => db.accounts.where('deleted_at').equals(0).filter(a => a.type === 'MF' && a.is_archived !== 1).toArray(),
    []
  );

  const [selectedAccountId, setSelectedAccountIdState] = useState<string>(() => {
    return localStorage.getItem('mfledger_selected_account_id') || 'ALL';
  });

  const isLoading = accounts === undefined;

  function setSelectedAccountId(id: string) {
    setSelectedAccountIdState(id);
    localStorage.setItem('mfledger_selected_account_id', id);
  }

  // Portfolio selection logic:
  // - If 0 accounts: 'ALL'
  // - If 1 account: auto-select that single account
  // - If > 1 accounts: default to 'ALL' (combined view) unless user picked a valid account
  useEffect(() => {
    if (isLoading || !accounts) return;

    if (accounts.length === 0) {
      if (selectedAccountId !== 'ALL') {
        setSelectedAccountId('ALL');
      }
    } else if (accounts.length === 1) {
      const singleId = accounts[0].id;
      if (selectedAccountId !== singleId) {
        setSelectedAccountId(singleId);
      }
    } else {
      // Multiple accounts
      const exists = accounts.some(a => a.id === selectedAccountId);
      if (selectedAccountId !== 'ALL' && !exists) {
        setSelectedAccountId('ALL');
      }
    }
  }, [accounts, isLoading, selectedAccountId]);

  const selectedAccount = selectedAccountId === 'ALL'
    ? null
    : (accounts?.find(a => a.id === selectedAccountId) ?? null);

  // Dynamically synchronize the global CSS accent colors with the selected account
  useEffect(() => {
    const activeColor = selectedAccountId === 'ALL'
      ? '#00B386'
      : (selectedAccount?.color || '#00B386');

    applyAccountAccentColor(activeColor);
  }, [selectedAccountId, selectedAccount?.color]);

  return (
    <AccountContext.Provider
      value={{
        accounts: accounts || [],
        selectedAccountId,
        setSelectedAccountId,
        selectedAccount,
        isLoading,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  return useContext(AccountContext);
}
