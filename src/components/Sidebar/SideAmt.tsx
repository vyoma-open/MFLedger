import { formatINR } from '../../utils/currency';

// ─── Amount in sidebar (compact mono) ─────────────────────────────────────────
export function SideAmt({ paise, negative }: { paise: number; negative?: boolean }) {
  const formatted = formatINR(paise, { compact: true });
  return (
    <span
      className="sidebar-account-balance"
      style={{ color: negative ? 'var(--red)' : 'var(--text-tertiary)' }}
    >
      {negative && paise > 0 ? '-' : ''}{formatted}
    </span>
  );
}
