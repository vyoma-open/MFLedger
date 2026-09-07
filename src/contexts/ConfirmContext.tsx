/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState } from 'react';
import { ConfirmModal } from '../components/ConfirmModal';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

type ConfirmFunction = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFunction | undefined>(undefined);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const confirm = (options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ options, resolve });
    });
  };

  const handleConfirm = () => {
    if (state) {
      state.resolve(true);
      setState(null);
    }
  };

  const handleCancel = () => {
    if (state) {
      state.resolve(false);
      setState(null);
    }
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <ConfirmModal
          title={state.options.title}
          message={state.options.message}
          confirmText={state.options.confirmText}
          cancelText={state.options.cancelText}
          danger={state.options.danger}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (context === undefined) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context;
}
