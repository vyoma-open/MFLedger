import React from 'react';

/** Format paise to rupee string */
export function formatINR(paise: number, opts: { compact?: boolean; decimals?: number } = {}): string {
  const rupees = Math.abs(paise) / 100;
  const { compact = false, decimals } = opts;

  if (compact) {
    if (rupees >= 1_00_00_000) return `₹${(rupees / 1_00_00_000).toFixed(2)} Cr`;
    if (rupees >= 1_00_000)    return `₹${(rupees / 1_00_000).toFixed(2)} L`;
    if (rupees >= 1000)        return `₹${(rupees / 1000).toFixed(1)} K`;
  }

  const d = decimals ?? (rupees >= 100 ? 0 : 2);
  return '₹' + rupees.toLocaleString('en-IN', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

export function parseINRToPaise(str: string): number {
  const num = parseFloat(str.replace(/[^0-9.]/g, ''));
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

export function formatIndianCommas(value: string): string {
  const cleanValue = value.replace(/[^0-9.]/g, '');
  const parts = cleanValue.split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];
  
  let formattedInteger = '';
  if (integerPart) {
    const temp = integerPart;
    if (temp.length > 3) {
      const last3 = temp.substring(temp.length - 3);
      const remaining = temp.substring(0, temp.length - 3);
      const regex = /\d(?=(\d{2})+$)/g;
      formattedInteger = remaining.replace(regex, '$&,') + ',' + last3;
    } else {
      formattedInteger = temp;
    }
  }
  
  if (parts.length > 1) {
    return formattedInteger + '.' + decimalPart.slice(0, 2);
  }
  return formattedInteger;
}

export function formatINRRaw(paise: number): string {
  const rupees = Math.abs(paise) / 100;
  const decimals = rupees % 1 === 0 ? 0 : 2;
  return rupees.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Two-font amount: ₹ in Hanken Grotesk, number in Roboto Mono */
interface AmtProps {
  paise: number;
  compact?: boolean;
  decimals?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  positive?: boolean; // force green
  negative?: boolean; // force red
  sign?: boolean;     // show +/- sign
  className?: string;
  style?: React.CSSProperties;
}

export function Amt({ paise, compact, decimals, size = 'sm', positive, negative, sign, className, style }: AmtProps) {
  const rupees = Math.abs(paise) / 100;
  const isNeg = paise < 0;
  const isPos = paise > 0;

  const colorClass = positive ? 'positive' : negative ? 'negative' : isNeg ? 'negative' : '';

  let displayNum: string;
  if (compact) {
    if (rupees >= 1_00_00_000) displayNum = `${(rupees / 1_00_00_000).toFixed(2)} Cr`;
    else if (rupees >= 1_00_000) displayNum = `${(rupees / 1_00_000).toFixed(2)} L`;
    else if (rupees >= 1000) displayNum = `${(rupees / 1000).toFixed(1)} K`;
    else {
      const d = decimals ?? (rupees >= 100 ? 0 : 2);
      displayNum = rupees.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
    }
  } else {
    const d = decimals ?? (rupees >= 100 ? 0 : 2);
    displayNum = rupees.toLocaleString('en-IN', {
      minimumFractionDigits: d, maximumFractionDigits: d,
    });
  }

  const sizeMap = { xs: 11, sm: 13, md: 18, lg: 28, xl: 42 };
  const fs = sizeMap[size];

  const prefix = sign ? (isNeg ? '−' : isPos ? '+' : '') : (isNeg ? '−' : '');

  return (
    <span className={`amount ${colorClass} ${className ?? ''}`} style={{ fontSize: fs, ...style }}>
      {prefix}
      <span style={{ fontFamily: 'var(--font-sans)' }}>₹</span>
      <span className="num">{displayNum}</span>
    </span>
  );
}
