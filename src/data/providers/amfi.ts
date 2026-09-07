/**
 * AMFI Data Provider
 * Parses official AMFI NAV text/TSV feeds into typed NAV quotes.
 * Pure TypeScript parser — zero database dependencies.
 */

export interface AMFINavRecord {
  symbol: string;
  schemeCode: string;
  name: string;
  nav: number;
  date: number;
}

/**
 * Parses raw text copied from the official AMFI NAV website (portal.amfiindia.com).
 * Expected format per line:
 * Scheme Code;Scheme Name;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Net Asset Value;Date
 * OR tab-separated / semicolon-separated variations.
 */
export function parseAMFIText(text: string): AMFINavRecord[] {
  const lines = text.split('\n');
  const results: AMFINavRecord[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Detect delimiter: semicolon or tab
    const parts = trimmed.includes(';') ? trimmed.split(';') : trimmed.split('\t');
    if (parts.length < 5) continue;

    const schemeCode = parts[0].trim();
    const name = parts[1]?.trim() || '';
    const navStr = parts[4]?.trim();
    const dateStr = parts[5]?.trim() || '';

    const nav = parseFloat(navStr);
    if (isNaN(nav) || !/^\d{5,7}$/.test(schemeCode)) continue;

    let dateTs = Date.now();
    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) dateTs = d.getTime();
    }

    results.push({
      symbol: `AMFI:${schemeCode}`,
      schemeCode,
      name,
      nav,
      date: dateTs,
    });
  }

  return results;
}
