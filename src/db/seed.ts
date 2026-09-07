import { db } from './schema';
import { generateDefaultTaxRules } from '@/domain/tax';

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

// ─── Reset / Seed Tax Rules to Budget 2025-26 Defaults ────────────────────────

export async function resetTaxRulesToDefaults(): Promise<void> {
  await db.tax_rules.clear();
  const rules = generateDefaultTaxRules();
  await db.tax_rules.bulkAdd(rules);
  await setSetting('tax_rules_version', 2025);
  await setSetting('db_seeded', true);
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

export async function seedDatabase(): Promise<void> {
  if ((window as any).__seedingDatabase) return;
  (window as any).__seedingDatabase = true;

  try {
    const isSeeded = await getSetting<boolean>('db_seeded');
    const existingRules = await db.tax_rules.count();

    if (isSeeded && existingRules > 0) {
      return;
    }

    // Seed default statutory tax rules (Budget 2025-26 / post-Finance Act 2024 + legacy rules)
    await resetTaxRulesToDefaults();
  } finally {
    (window as any).__seedingDatabase = false;
  }
}

