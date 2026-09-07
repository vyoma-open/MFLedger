/**
 * marketService.ts
 *
 * Handles Mutual Fund Market Refresh logic:
 * - Mutual Fund NAV fetching directly via MFAPI.in (public, CORS-friendly)
 * - Automatic MF name / ISIN → scheme code resolution via MFAPI search
 * - Writing results back to the local market_cache IndexedDB table
 */

import { db } from '../db/schema';
import { setSetting } from '../db/seed';

export const SETTING_LAST_REFRESH = 'market_last_refresh_ts';

// ─── Eligibility ──────────────────────────────────────────────────────────────

export interface EligibilityResult {
  allowed: boolean;
  reason: string;
}

/**
 * Checks refresh eligibility. Mutual Fund NAVs update once per business day in the evening.
 */
export function checkRefreshEligibility(lastRefreshedTs: number | null): EligibilityResult {
  if (lastRefreshedTs === null) {
    return { allowed: true, reason: '' };
  }

  // Allow manual refresh anytime user requests
  return { allowed: true, reason: '' };
}

// ─── MF Fetching (MFAPI.in) ──────────────────────────────────────────────────

interface MFAPILatestEntry {
  date: string; // 'DD-MMM-YYYY' or 'DD-MM-YYYY'
  nav:  string;
}

interface MFAPIResponse {
  meta:   { scheme_name: string };
  data:   MFAPILatestEntry[];
  status: string;
}

import {
  fetchMFNav as providerFetchMFNav,
  searchMFByName,
  type MFFetchData,
} from '@/data/providers';

export type { MFFetchData };

export async function fetchMFNav(schemeCode: string): Promise<MFFetchData | null> {
  return providerFetchMFNav(schemeCode);
}

// ─── MF Code Resolution ───────────────────────────────────────────────────────

export async function resolveMFSchemeCode(name: string): Promise<{ schemeCode: string; schemeName: string } | null> {
  const code = await searchMFByName(name);
  if (!code) return null;
  return {
    schemeCode: code,
    schemeName: name,
  };
}

// ─── Extract scheme code from symbol ─────────────────────────────────────────

export function extractSchemeCode(symbol: string): string | null {
  const upper = symbol.trim().toUpperCase();
  if (upper.startsWith('AMFI:')) {
    const code = upper.slice(5);
    if (/^\d+$/.test(code)) return code;
  }
  if (/^\d{5,7}$/.test(upper)) return upper;
  return null;
}

export function parsePlanAndOption(schemeName: string): { mfPlan?: 'DIRECT' | 'REGULAR'; mfOption?: 'GROWTH' | 'IDCW' } {
  const lower = (schemeName || '').toLowerCase();
  let mfPlan: 'DIRECT' | 'REGULAR' | undefined = undefined;
  let mfOption: 'GROWTH' | 'IDCW' | undefined = undefined;

  if (lower.includes('direct')) mfPlan = 'DIRECT';
  else if (lower.includes('regular')) mfPlan = 'REGULAR';

  if (lower.includes('growth') || lower.includes('gr')) mfOption = 'GROWTH';
  else if (lower.includes('idcw') || lower.includes('dividend') || lower.includes('div')) mfOption = 'IDCW';

  return { mfPlan, mfOption };
}

// ─── Main Refresh Orchestrator ────────────────────────────────────────────────

export interface RefreshProgress {
  total:   number;
  done:    number;
  message: string;
}

export interface RefreshResult {
  mfsUpdated: number;
  errors:     string[];
}

export async function refreshAllHoldings(
  onProgress?: (p: RefreshProgress) => void
): Promise<RefreshResult> {
  const now = Date.now();
  const errors: string[] = [];
  let mfsUpdated = 0;

  // Load all active lots
  const activeLots = await db.investment_lots.where('status').equals('ACTIVE').toArray();
  if (activeLots.length === 0) {
    return { mfsUpdated: 0, errors: [] };
  }

  const mfSymbols = [...new Set(activeLots.map(l => l.symbol.trim().toUpperCase()))];
  const total = mfSymbols.length;
  let done = 0;

  // Concurrent batches of 4
  const MF_CONCURRENCY = 4;
  for (let i = 0; i < mfSymbols.length; i += MF_CONCURRENCY) {
    const batch = mfSymbols.slice(i, i + MF_CONCURRENCY);
    await Promise.all(
      batch.map(async (sym) => {
        onProgress?.({ total, done, message: `Fetching NAV for ${sym}…` });

        let schemeCode = extractSchemeCode(sym);
        const lot = activeLots.find(l => l.symbol.trim().toUpperCase() === sym);
        const isinCode = lot?.isin || (/^IN[A-Z0-9]{10}$/i.test(sym) ? sym : undefined);

        if (!schemeCode) {
          const searchQuery = isinCode || lot?.name || sym;
          onProgress?.({ total, done, message: `Resolving scheme code for "${searchQuery}"…` });
          const resolved = await resolveMFSchemeCode(searchQuery);
          if (resolved) {
            schemeCode = resolved.schemeCode;
            const { mfPlan, mfOption } = parsePlanAndOption(resolved.schemeName);

            const matchingLots = activeLots.filter(l => l.symbol.trim().toUpperCase() === sym);
            for (const l of matchingLots) {
              await db.investment_lots.update(l.id, {
                symbol:     `AMFI:${schemeCode}`,
                name:       l.name || resolved.schemeName,
                isin:       isinCode || l.isin,
                mf_plan:    l.mf_plan || mfPlan,
                mf_option:  l.mf_option || mfOption,
                updated_at: now,
              });
            }
          } else {
            errors.push(`Could not resolve scheme code for "${searchQuery}"`);
            done++;
            return;
          }
        }

        const result = await fetchMFNav(schemeCode);
        if (!result) {
          errors.push(`Could not fetch NAV for scheme code ${schemeCode}`);
          done++;
          return;
        }

        const navPaise = result.nav * 100;
        const cacheId  = `AMFI:${schemeCode}`;
        const { mfPlan, mfOption } = parsePlanAndOption(result.name);

        await db.market_cache.put({
          id:          cacheId,
          symbol:      `AMFI:${schemeCode}`,
          source:      'AMFI',
          nav_paise:   navPaise,
          nav_date:    result.date,
          name:        result.name,
          raw_payload: result.rawPayload,
          created_at:  now,
        });

        if (isinCode) {
          await db.market_cache.put({
            id:          isinCode,
            symbol:      isinCode,
            source:      'AMFI',
            nav_paise:   navPaise,
            nav_date:    result.date,
            name:        result.name,
            raw_payload: result.rawPayload,
            created_at:  now,
          });
        }

        const matchingLots = activeLots.filter(l => l.symbol.trim().toUpperCase() === sym || l.symbol === `AMFI:${schemeCode}`);
        for (const l of matchingLots) {
          await db.investment_lots.update(l.id, {
            mf_plan: l.mf_plan || mfPlan,
            mf_option: l.mf_option || mfOption,
            isin: l.isin || isinCode,
          });
        }

        mfsUpdated++;
        done++;
        onProgress?.({ total, done, message: `Updated ${result.name}` });
      })
    );
  }

  // Persist refresh timestamp
  await setSetting(SETTING_LAST_REFRESH, now);

  return { mfsUpdated, errors };
}
