import type { Table } from 'dexie';

// ─── System Role ─────────────────────────────────────────────────────────────
export type SystemRole = 'PRIMARY' | 'SECONDARY' | 'DEPENDENT';

// ─── Account Types (Mutual Fund Only) ─────────────────────────────────────────
export type AccountType = 'MF';
export type AccountSubtype = 'ASSET';

export const ACCOUNT_SUBTYPE_MAP: Record<AccountType, AccountSubtype> = {
  MF: 'ASSET',
};

// ─── Mutual Fund Asset Classes ────────────────────────────────────────────────
export type AssetClass =
  | 'EQUITY_MF'
  | 'INDEX_MF'
  | 'DEBT_MF'
  | 'LIQUID_MF'
  | 'GOLD_MF';

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  EQUITY_MF: 'Equity MF',
  INDEX_MF: 'Index Fund',
  DEBT_MF: 'Debt MF',
  LIQUID_MF: 'Liquid MF',
  GOLD_MF: 'Gold MF',
};

export const ASSET_CLASSES = Object.keys(ASSET_CLASS_LABELS) as AssetClass[];

// ─── Tax Modes ────────────────────────────────────────────────────────────────
export type TaxMode = 'FIXED_PERCENTAGE' | 'SLAB_RATE';

// ─── Lot Status ───────────────────────────────────────────────────────────────
export type LotStatus = 'ACTIVE' | 'CLOSED';

// ─── Frequency ───────────────────────────────────────────────────────────────
export type Frequency = 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'WEEKLY';

// ─── Entities ─────────────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  name: string;
  system_role: SystemRole;
  color?: string;    // avatar color
  is_active: number; // 1 | 0
  created_at: number;
  updated_at: number;
  version: number;
  deleted_at: number; // 0 for active, timestamp for deleted
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
  currency: 'INR';
  profile_id?: string;
  institution?: string;
  account_number?: string;
  color?: string; // Custom accent color hex (e.g. #059669)
  emoji?: string; // Legacy custom emoji icon
  icon?: string; // Lucide icon identifier (e.g. Wallet, Briefcase, TrendingUp)
  is_archived?: number; // 1 | 0
  notes?: string;
  created_at: number;
  updated_at: number;
  version: number;
  deleted_at: number; // 0 for active, timestamp for deleted
}

export interface InvestmentLot {
  id: string;
  account_id: string;
  profile_id?: string;
  symbol: string;
  name: string;
  asset_class: AssetClass;
  purchase_date: number;
  units_original: number;
  units_remaining: number;
  /** Stored as float paise (e.g., 12345.67 for ₹123.4567 NAV) */
  purchase_price_paise: number;
  fees_paise: number;
  status: LotStatus;
  created_at: number;
  updated_at: number;
  version: number;
  // ── MF-specific metadata ────────────────────
  /** Folio number e.g. 12345678/90 */
  folio_number?: string;
  /** ISIN code e.g. INF082J01067 */
  isin?: string;
  /** Investment plan: Direct or Regular */
  mf_plan?: 'DIRECT' | 'REGULAR';
  /** Investment option: Growth or IDCW (Dividend) */
  mf_option?: 'GROWTH' | 'IDCW';
  /** Exit load percentage e.g. 1.0 means 1% */
  exit_load_pct?: number;
  /** Exit load window in days e.g. 365 */
  exit_load_days?: number;
  /** Fund expense ratio in basis points e.g. 45 = 0.45% */
  expense_ratio_bps?: number;
  /** Total Expense Ratio in percent e.g. 0.45 */
  ter_pct?: number;
  /** Linked goal tag e.g. Home, Vehicle, Retirement */
  goal_tag?: string;
  /** Investment mode: Systematic Investment Plan (SIP) vs Lumpsum */
  investment_type?: 'SIP' | 'LUMPSUM';
  /** Optional identifier grouping installments of a recurring SIP stream */
  sip_stream_id?: string;
}

export interface LotConsumptionEvent {
  id: string;
  lot_id: string;
  units_consumed: number;
  sale_price_paise: number;
  created_at: number;
}

// ─── Tax Rules ────────────────────────────────────────────────────────────────

export interface TaxRule {
  id: string;
  name: string;
  asset_class: AssetClass;
  holding_period_months: number;
  stcg_mode: TaxMode;
  stcg_rate_bps: number;
  ltcg_mode: TaxMode;
  ltcg_rate_bps: number;
  exemption_cap_paise: number;
  effective_from: number;
  effective_until: number | null;
  created_at: number;
  updated_at: number;
  version: number;
}

// ─── Recurring SIP Template ───────────────────────────────────────────────────

export interface RecurringTemplate {
  id: string;
  name: string;
  frequency: Frequency;
  amount_paise: number;
  to_account_id?: string;
  description?: string;
  next_execution: number;
  is_active: number;
  created_at: number;
  updated_at: number;
  version: number;
  asset_class?: AssetClass;
}

// ─── Market Cache (NAV Data from MFAPI.in) ────────────────────────────────────

export interface MarketCache {
  id: string;
  symbol: string;
  source: 'AMFI' | 'MANUAL';
  nav_paise: number;
  nav_date: number;
  name?: string;
  raw_payload?: string;
  created_at: number;
}

// ─── Notes ────────────────────────────────────────────────────────────────────

export interface Note {
  id: string;
  title: string;
  content: string;
  pinned: number;
  account_id?: string;
  tags?: string;
  created_at: number;
  updated_at: number;
  deleted_at: number;
}

// ─── App Settings ─────────────────────────────────────────────────────────────

export interface AppSetting {
  key: string;
  value: string;
  updated_at: number;
}

// ─── Goals ───────────────────────────────────────────────────────────────────

export interface Goal {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  target_amount_paise: number;
  target_date?: number;
  notes?: string;
  created_at: number;
  updated_at: number;
  deleted_at: number;
}

export interface GoalContribution {
  id: string;
  goal_id: string;
  account_id: string;
  allocation_pct: number;
  created_at: number;
  updated_at: number;
}

export type { Table };
