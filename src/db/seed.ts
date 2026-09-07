import { db } from './schema';
import type { TaxRule } from './schema';
import { generateId } from '../utils/ids';

/** Read a typed setting */
export async function getSetting<T>(key: string): Promise<T | null> {
  const row = await db.app_settings.get(key);
  if (!row) return null;
  try { return JSON.parse(row.value) as T; } catch { return null; }
}

/** Write a typed setting */
export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.app_settings.put({ key, value: JSON.stringify(value), updated_at: Date.now() });
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

export async function seedDatabase(): Promise<void> {
  if ((window as any).__seedingDatabase) return;
  (window as any).__seedingDatabase = true;

  try {
    const isSeeded = await getSetting<boolean>('db_seeded');
    if (isSeeded) return;

    const existingRules = await db.tax_rules.count();
    if (existingRules > 0) {
      await setSetting('db_seeded', true);
      return;
    }

    // Clear existing tax rules to prevent duplication
    await db.tax_rules.clear();

    const now = Date.now();

    // ── Default tax rules (FY2024-25, post-Budget 2024) ───────────────────────
    const taxRules: Omit<TaxRule, 'id'>[] = [
      {
        name: 'Equity MF (Sec 112A/111A)',
        asset_class: 'EQUITY_MF',
        holding_period_months: 12,
        stcg_mode: 'FIXED_PERCENTAGE',
        stcg_rate_bps: 2000,
        ltcg_mode: 'FIXED_PERCENTAGE',
        ltcg_rate_bps: 1250,
        exemption_cap_paise: 12500000, // ₹1.25L exemption
        effective_from: new Date('2024-07-23').getTime(),
        effective_until: null,
        created_at: now,
        updated_at: now,
        version: 1,
      },
      {
        name: 'Index MF (Sec 112A/111A)',
        asset_class: 'INDEX_MF',
        holding_period_months: 12,
        stcg_mode: 'FIXED_PERCENTAGE',
        stcg_rate_bps: 2000,
        ltcg_mode: 'FIXED_PERCENTAGE',
        ltcg_rate_bps: 1250,
        exemption_cap_paise: 12500000,
        effective_from: new Date('2024-07-23').getTime(),
        effective_until: null,
        created_at: now,
        updated_at: now,
        version: 1,
      },
      {
        name: 'Debt MF (Slab Rate)',
        asset_class: 'DEBT_MF',
        holding_period_months: 36,
        stcg_mode: 'SLAB_RATE',
        stcg_rate_bps: 0,
        ltcg_mode: 'SLAB_RATE',
        ltcg_rate_bps: 0,
        exemption_cap_paise: 0,
        effective_from: new Date('2023-04-01').getTime(),
        effective_until: null,
        created_at: now,
        updated_at: now,
        version: 1,
      },
      {
        name: 'Liquid MF (Slab Rate)',
        asset_class: 'LIQUID_MF',
        holding_period_months: 36,
        stcg_mode: 'SLAB_RATE',
        stcg_rate_bps: 0,
        ltcg_mode: 'SLAB_RATE',
        ltcg_rate_bps: 0,
        exemption_cap_paise: 0,
        effective_from: new Date('2023-04-01').getTime(),
        effective_until: null,
        created_at: now,
        updated_at: now,
        version: 1,
      },
      {
        name: 'Gold MF (Sec 112A)',
        asset_class: 'GOLD_MF',
        holding_period_months: 24,
        stcg_mode: 'SLAB_RATE',
        stcg_rate_bps: 0,
        ltcg_mode: 'FIXED_PERCENTAGE',
        ltcg_rate_bps: 1250,
        exemption_cap_paise: 0,
        effective_from: new Date('2024-07-23').getTime(),
        effective_until: null,
        created_at: now,
        updated_at: now,
        version: 1,
      },
    ];

    await db.tax_rules.bulkAdd(
      taxRules.map(rule => ({ id: generateId('tax'), ...rule }))
    );

    await setSetting('db_seeded', true);
  } finally {
    (window as any).__seedingDatabase = false;
  }
}
