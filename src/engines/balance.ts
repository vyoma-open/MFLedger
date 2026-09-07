import { db } from '../db/schema';

export interface BalanceResult {
  account_id: string;
  balance_paise: number;
}

/**
 * Compute portfolio value for a mutual fund account from active lots and latest NAV.
 * RULE: Balance is NEVER statically stored, always computed.
 */
export async function computeBalance(account_id: string): Promise<number> {
  const account = await db.accounts.get(account_id);
  if (!account) return 0;

  const investmentLots = await db.investment_lots
    .where('[account_id+status]')
    .equals([account_id, 'ACTIVE'])
    .filter(l => l.units_remaining > 0)
    .toArray();

  if (investmentLots.length === 0) return 0;

  const symbols = [...new Set(investmentLots.map(l => l.symbol))];
  const cachedEntries = await db.market_cache.where('symbol').anyOf(symbols).toArray();
  const prices = new Map<string, number>();
  const latestDates = new Map<string, number>();

  for (const entry of cachedEntries) {
    const existingDate = latestDates.get(entry.symbol);
    if (existingDate === undefined || entry.nav_date > existingDate) {
      prices.set(entry.symbol, entry.nav_paise);
      latestDates.set(entry.symbol, entry.nav_date);
    }
  }

  let investmentValue = 0;
  for (const lot of investmentLots) {
    const p = prices.get(lot.symbol) ?? lot.purchase_price_paise;
    investmentValue += Math.round(lot.units_remaining * p);
  }

  return investmentValue;
}

/**
 * Compute balances for multiple mutual fund accounts at once (batched).
 */
export async function computeBalances(account_ids: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (account_ids.length === 0) return result;

  const lots = await db.investment_lots
    .where('account_id')
    .anyOf(account_ids)
    .filter(l => l.status === 'ACTIVE' && l.units_remaining > 0)
    .toArray();

  const symbols = [...new Set(lots.map(l => l.symbol))];
  const cachedEntries = await db.market_cache.where('symbol').anyOf(symbols).toArray();
  const prices = new Map<string, number>();
  const latestDates = new Map<string, number>();

  for (const entry of cachedEntries) {
    const existingDate = latestDates.get(entry.symbol);
    if (existingDate === undefined || entry.nav_date > existingDate) {
      prices.set(entry.symbol, entry.nav_paise);
      latestDates.set(entry.symbol, entry.nav_date);
    }
  }

  // Initialize all accounts with 0
  for (const id of account_ids) {
    result.set(id, 0);
  }

  for (const lot of lots) {
    const p = prices.get(lot.symbol) ?? lot.purchase_price_paise;
    const val = Math.round(lot.units_remaining * p);
    result.set(lot.account_id, (result.get(lot.account_id) ?? 0) + val);
  }

  return result;
}
