/**
 * MFAPI.in Data Provider
 * Fetches free, open-access Mutual Fund NAVs and search results from api.mfapi.in.
 * Pure network fetcher — zero database dependencies.
 */

interface MFAPILatestEntry {
  date: string; // 'DD-MMM-YYYY' or 'DD-MM-YYYY'
  nav: string;
}

interface MFAPIResponse {
  meta: { scheme_name: string };
  data: MFAPILatestEntry[];
  status: string;
}

export interface MFFetchData {
  nav: number;
  date: number;
  name: string;
  rawPayload: string;
}

/**
 * Fetches the latest NAV for a given numeric AMFI scheme code from MFAPI.in.
 */
export async function fetchMFNav(schemeCode: string): Promise<MFFetchData | null> {
  const url = `https://api.mfapi.in/mf/${encodeURIComponent(schemeCode)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: MFAPIResponse = await res.json();
    if (data.status !== 'SUCCESS' || !data.data || data.data.length === 0) return null;

    const latest = data.data[0];
    const nav = parseFloat(latest.nav);
    if (isNaN(nav)) return null;

    // Parse 'DD-MM-YYYY' or 'DD-MMM-YYYY' → ISO timestamp
    const parts = latest.date.split('-');
    let monthStr = parts[1];
    if (isNaN(Number(monthStr))) {
      const months: Record<string, string> = {
        Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
        Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
      };
      monthStr = months[monthStr] ?? '01';
    }
    const isoDate = `${parts[2]}-${monthStr.padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    const dateTs = new Date(`${isoDate}T06:30:00Z`).getTime();

    return {
      nav,
      date: isNaN(dateTs) ? Date.now() : dateTs,
      name: data.meta?.scheme_name || `AMFI ${schemeCode}`,
      rawPayload: JSON.stringify({ meta: data.meta, latest }),
    };
  } catch {
    return null;
  }
}

/**
 * Searches MFAPI.in for a fund by name keyword.
 * Returns the best-matching scheme code or null.
 */
export async function searchMFByName(query: string): Promise<string | null> {
  const clean = query
    .replace(/-?\s*(Direct|Regular)\s*Plan/gi, '')
    .replace(/-?\s*(Growth|IDCW|Dividend)\s*(Option)?/gi, '')
    .trim();

  const words = clean.split(/\s+/).slice(0, 3).join(' ');
  const url = `https://api.mfapi.in/mf/search?q=${encodeURIComponent(words)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const list: Array<{ schemeCode: number; schemeName: string }> = await res.json();
    if (!Array.isArray(list) || list.length === 0) return null;

    const isDirect = /direct/i.test(query);
    const isGrowth = /growth/i.test(query);

    const directGrowth = list.find(item =>
      (!isDirect || /direct/i.test(item.schemeName)) &&
      (!isGrowth || /growth/i.test(item.schemeName))
    );

    return String((directGrowth ?? list[0]).schemeCode);
  } catch {
    return null;
  }
}

/**
 * Resolves an AMFI scheme code from a symbol or fund name.
 */
export async function resolveSchemeCode(symbolOrIsin: string, fundName?: string): Promise<string | null> {
  const amfiMatch = symbolOrIsin.match(/AMFI:(\d+)/i) || symbolOrIsin.match(/^(\d{6})$/);
  if (amfiMatch) return amfiMatch[1];

  if (fundName) {
    return searchMFByName(fundName);
  }

  return null;
}
