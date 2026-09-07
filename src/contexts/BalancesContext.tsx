/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { computeBalances } from '../engines/balance';

interface BalancesContextType {
  balances: Map<string, number>;
  isLoading: boolean;
}

const BalancesContext = createContext<BalancesContextType | undefined>(undefined);

export function BalancesProvider({ children }: { children: React.ReactNode }) {
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  const allAccounts = useLiveQuery(() => db.accounts.where('deleted_at').equals(0).toArray(), []);
  const lotsCount = useLiveQuery(() => db.investment_lots.count(), []);
  const marketCacheCount = useLiveQuery(() => db.market_cache.count(), []);

  useEffect(() => {
    if (!allAccounts) return;
    const accountIds = allAccounts.map(a => a.id);
    computeBalances(accountIds).then(res => {
      setBalances(res);
      setIsLoading(false);
    });
  }, [allAccounts, lotsCount, marketCacheCount]);

  return (
    <BalancesContext.Provider value={{ balances, isLoading }}>
      {children}
    </BalancesContext.Provider>
  );
}

export function useBalances() {
  const context = useContext(BalancesContext);
  if (context === undefined) {
    throw new Error('useBalances must be used within a BalancesProvider');
  }
  return context;
}
