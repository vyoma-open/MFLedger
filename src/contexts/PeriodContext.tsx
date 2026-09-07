import React, { createContext, useContext, useState, useEffect } from 'react';
import type { PeriodPreset } from '@/components/PeriodSelector';
import { todayStr } from '@/utils/fiscalYear';

interface PeriodContextValue {
  year: number;
  month: number;
  preset: PeriodPreset;
  customStart: string;
  customEnd: string;
  setPeriod: (year: number, month: number, preset: PeriodPreset) => void;
  setCustomRange: (start: string, end: string) => void;
}

const PeriodContext = createContext<PeriodContextValue | undefined>(undefined);

export function PeriodProvider({ children }: { children: React.ReactNode }) {
  const now = new Date();
  const [year, setYear] = useState<number>(() => {
    const saved = sessionStorage.getItem('mfledger_period_year');
    return saved ? parseInt(saved, 10) : now.getFullYear();
  });

  const [month, setMonth] = useState<number>(() => {
    const saved = sessionStorage.getItem('mfledger_period_month');
    return saved ? parseInt(saved, 10) : now.getMonth() + 1;
  });

  const [preset, setPreset] = useState<PeriodPreset>(() => {
    const saved = sessionStorage.getItem('mfledger_period_preset');
    return (saved as PeriodPreset) || 'month';
  });

  const [customStart, setCustomStart] = useState<string>(() => {
    return sessionStorage.getItem('mfledger_period_start') || todayStr();
  });

  const [customEnd, setCustomEnd] = useState<string>(() => {
    return sessionStorage.getItem('mfledger_period_end') || todayStr();
  });

  useEffect(() => {
    sessionStorage.setItem('mfledger_period_year', String(year));
    sessionStorage.setItem('mfledger_period_month', String(month));
    sessionStorage.setItem('mfledger_period_preset', preset);
    sessionStorage.setItem('mfledger_period_start', customStart);
    sessionStorage.setItem('mfledger_period_end', customEnd);
  }, [year, month, preset, customStart, customEnd]);

  function setPeriod(newYear: number, newMonth: number, newPreset: PeriodPreset) {
    setYear(newYear);
    setMonth(newMonth);
    setPreset(newPreset);
  }

  function setCustomRange(start: string, end: string) {
    setCustomStart(start);
    setCustomEnd(end);
  }

  return (
    <PeriodContext.Provider
      value={{
        year,
        month,
        preset,
        customStart,
        customEnd,
        setPeriod,
        setCustomRange,
      }}
    >
      {children}
    </PeriodContext.Provider>
  );
}

export function usePeriod() {
  const ctx = useContext(PeriodContext);
  if (!ctx) {
    // Fallback if rendered outside provider
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      preset: 'month' as PeriodPreset,
      customStart: todayStr(),
      customEnd: todayStr(),
      setPeriod: () => {},
      setCustomRange: () => {},
    };
  }
  return ctx;
}
