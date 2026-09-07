import { MFLedgerDB } from './schema';

export interface DatabaseSnapshot {
  version: number;
  timestamp: number;
  tables: {
    profiles: any[];
    accounts: any[];
    investment_lots: any[];
    lot_consumption_events: any[];
    tax_rules: any[];
    recurring_templates: any[];
    notes: any[];
    app_settings: any[];
    market_cache: any[];
    goals?: any[];
    goal_contributions?: any[];
  };
}

const TABLES_TO_SYNC = [
  'profiles',
  'accounts',
  'investment_lots',
  'lot_consumption_events',
  'tax_rules',
  'recurring_templates',
  'notes',
  'app_settings',
  'market_cache',
  'goals',
  'goal_contributions',
];

const SENSITIVE_SETTING_KEYS = new Set([
  'password_hash',
  'password_hint',
  'salt',
  'last_sync_timestamp',
]);

/**
 * Exports specified Dexie database tables into a single JSON snapshot string.
 */
export async function exportDatabaseSnapshot(db: MFLedgerDB): Promise<string> {
  const snapshotData: Record<string, any[]> = {};
  const actualDbTableNames = new Set(db.tables.map(t => t.name));

  for (const tableName of TABLES_TO_SYNC) {
    if (!actualDbTableNames.has(tableName)) continue;
    const table = db.table(tableName);
    const records = await table.toArray();

    if (tableName === 'app_settings') {
      const sanitized = (records as Array<{ key: string; value: string }>).filter(
        r => !SENSITIVE_SETTING_KEYS.has(r.key)
      );
      snapshotData[tableName] = sanitized;
      continue;
    }

    snapshotData[tableName] = records;
  }

  const snapshot: DatabaseSnapshot = {
    version: 1,
    timestamp: Date.now(),
    tables: snapshotData as DatabaseSnapshot['tables'],
  };

  return JSON.stringify(snapshot, null, 2);
}

/**
 * Imports a JSON database snapshot into Dexie using an atomic transaction.
 */
export async function importDatabaseSnapshot(
  db: MFLedgerDB,
  jsonString: string,
  mode: 'REPLACE' | 'MERGE' = 'REPLACE'
): Promise<{ success: boolean; error?: string }> {
  try {
    const snapshot: DatabaseSnapshot = JSON.parse(jsonString);

    if (!snapshot || typeof snapshot !== 'object' || !snapshot.tables) {
      return { success: false, error: 'Invalid snapshot format: missing tables property' };
    }

    const availableTables = TABLES_TO_SYNC.filter(t => db.tables.map(tab => tab.name).includes(t));
    const dexieTables = availableTables.map(t => db.table(t));

    await db.transaction('rw', dexieTables, async () => {
      if (mode === 'REPLACE') {
        for (const tableName of availableTables) {
          await db.table(tableName).clear();
        }
      }

      for (const tableName of availableTables) {
        const records = (snapshot.tables as any)[tableName];
        if (!Array.isArray(records) || records.length === 0) continue;

        const table = db.table(tableName);

        if (mode === 'REPLACE') {
          await table.bulkPut(records);
        } else {
          for (const record of records) {
            const key = record.id ?? record.key;
            if (!key) continue;
            const existing = await table.get(key);
            if (!existing) {
              await table.put(record);
            } else {
              const incomingUpdated = record.updated_at ?? 0;
              const existingUpdated = existing.updated_at ?? 0;
              if (incomingUpdated >= existingUpdated) {
                await table.put(record);
              }
            }
          }
        }
      }
    });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to import snapshot',
    };
  }
}
