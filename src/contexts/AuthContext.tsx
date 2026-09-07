import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getSetting, setSetting, seedDatabase } from '../db/seed';
import { verifyPassword, deriveKeyAndAuthHash, bytesToHex, hexToBytes } from '../utils/crypto';
import { db } from '../db/schema';

interface AuthContextType {
  isUnlocked: boolean;
  hasPassword: boolean;
  isLoading: boolean;
  encryptionKey: CryptoKey | null;
  username: string | null;
  unlock: (password: string) => Promise<boolean>;
  setupPassword: (password: string, hint: string, username?: string) => Promise<void>;
  resetAndCreateAccount: (username: string, password: string, hint?: string) => Promise<void>;
  removePassword: () => Promise<void>;
  lock: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // E2EE In-Memory Key (never persisted to localStorage/sessionStorage)
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const hash = await getSetting<string | null>('password_hash');
        const storedUser = await getSetting<string | null>('username');
        setHasPassword(!!hash);
        setUsername(storedUser);
      } catch {
        // Auth init failed — stay locked
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  const unlock = useCallback(async (password: string): Promise<boolean> => {
    const storedHash = await getSetting<string>('password_hash');
    if (!storedHash) {
      setIsUnlocked(true);
      return true;
    }

    let storedSaltHex = await getSetting<string | null>('salt');
    if (!storedSaltHex) {
      const newSalt = crypto.getRandomValues(new Uint8Array(16));
      storedSaltHex = bytesToHex(newSalt);
      await setSetting('salt', storedSaltHex);
    }

    const { ok, upgraded } = await verifyPassword(password, storedHash, storedSaltHex);

    if (ok) {
      const salt = hexToBytes(storedSaltHex);
      const { encryptionKey: derivedKey, authHash: derivedAuthHash } = await deriveKeyAndAuthHash(password, salt);

      if (upgraded) {
        await setSetting('password_hash', derivedAuthHash);
      }

      const storedUsername = await getSetting<string | null>('username');
      setEncryptionKey(derivedKey);
      setUsername(storedUsername);
      setIsUnlocked(true);
    }
    return ok;
  }, []);

  const setupPassword = useCallback(async (password: string, hint: string, usernameInput?: string): Promise<void> => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltHex = bytesToHex(salt);

    const { encryptionKey: derivedKey, authHash: derivedAuthHash } = await deriveKeyAndAuthHash(password, salt);

    await setSetting('password_hash', derivedAuthHash);
    await setSetting('password_hint', hint);
    await setSetting('salt', saltHex);
    if (usernameInput) {
      await setSetting('username', usernameInput);
    }

    setEncryptionKey(derivedKey);
    if (usernameInput) setUsername(usernameInput);
    setHasPassword(true);
    setIsUnlocked(true);
  }, []);

  const resetAndCreateAccount = useCallback(async (newUsername: string, newPassword: string, hint: string = 'Personal Password'): Promise<void> => {
    const tables = [
      db.profiles,
      db.accounts,
      db.investment_lots,
      db.lot_consumption_events,
      db.recurring_templates,
      db.notes,
      db.tax_rules,
      db.market_cache,
      db.app_settings,
    ];

    await db.transaction('rw', tables, async () => {
      for (const t of tables) {
        await t.clear();
      }
    });

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltHex = bytesToHex(salt);
    const { encryptionKey: derivedKey, authHash: derivedAuthHash } = await deriveKeyAndAuthHash(newPassword, salt);

    await setSetting('password_hash', derivedAuthHash);
    await setSetting('password_hint', hint);
    await setSetting('username', newUsername);
    await setSetting('salt', saltHex);

    await seedDatabase();

    setEncryptionKey(derivedKey);
    setUsername(newUsername);
    setHasPassword(true);
    setIsUnlocked(true);
  }, []);

  const removePassword = useCallback(async (): Promise<void> => {
    await db.app_settings.delete('password_hash');
    await db.app_settings.delete('password_hint');
    await db.app_settings.delete('salt');
    setEncryptionKey(null);
    setHasPassword(false);
    setIsUnlocked(true);
  }, []);

  const lock = useCallback(() => {
    setEncryptionKey(null);
    setIsUnlocked(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isUnlocked: !hasPassword || isUnlocked,
        hasPassword,
        isLoading,
        encryptionKey,
        username,
        unlock,
        setupPassword,
        resetAndCreateAccount,
        removePassword,
        lock,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
