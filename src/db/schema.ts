import Dexie, { type Table } from 'dexie';
import type {
  Profile,
  Account,
  InvestmentLot,
  LotConsumptionEvent,
  TaxRule,
  RecurringTemplate,
  MarketCache,
  Note,
  AppSetting,
  Goal,
  GoalContribution,
  SystemRole,
  AccountType,
  AccountSubtype,
  AssetClass,
  TaxMode,
  LotStatus,
  Frequency,
} from '@/types/db.types';
import { ACCOUNT_SUBTYPE_MAP, ASSET_CLASS_LABELS, ASSET_CLASSES } from '@/types/db.types';

export {
  type Profile,
  type Account,
  type InvestmentLot,
  type LotConsumptionEvent,
  type TaxRule,
  type RecurringTemplate,
  type MarketCache,
  type Note,
  type AppSetting,
  type Goal,
  type GoalContribution,
  type SystemRole,
  ACCOUNT_SUBTYPE_MAP,
  ASSET_CLASS_LABELS,
  ASSET_CLASSES,
  type AccountType,
  type AccountSubtype,
  type AssetClass,
  type TaxMode,
  type LotStatus,
  type Frequency,
};

// ─── Dexie DB Class ───────────────────────────────────────────────────────────

export class MFLedgerDB extends Dexie {
  profiles!: Table<Profile>;
  accounts!: Table<Account>;
  investment_lots!: Table<InvestmentLot>;
  lot_consumption_events!: Table<LotConsumptionEvent>;
  tax_rules!: Table<TaxRule>;
  recurring_templates!: Table<RecurringTemplate>;
  market_cache!: Table<MarketCache>;
  notes!: Table<Note>;
  app_settings!: Table<AppSetting>;
  goals!: Table<Goal>;
  goal_contributions!: Table<GoalContribution>;

  constructor() {
    super('MFLedgerDB');

    this.version(1).stores({
      profiles:               'id, name, system_role, is_active, deleted_at, [is_active+deleted_at]',
      accounts:               'id, name, type, subtype, currency, profile_id, is_archived, deleted_at, [profile_id+deleted_at], [is_archived+deleted_at]',
      investment_lots:        'id, account_id, profile_id, symbol, isin, asset_class, status, purchase_date, [account_id+status], [profile_id+status], [symbol+status]',
      lot_consumption_events: 'id, lot_id',
      tax_rules:              'id, asset_class, effective_from',
      recurring_templates:    'id, frequency, next_execution, is_active',
      market_cache:           'id, symbol, name, nav_date, source, [symbol+nav_date]',
      notes:                  'id, pinned, created_at, deleted_at, [pinned+deleted_at]',
      app_settings:           'key',
      goals:                  'id, name, target_date, deleted_at',
      goal_contributions:     'id, goal_id, account_id',
    });
  }
}

export const db = new MFLedgerDB();
