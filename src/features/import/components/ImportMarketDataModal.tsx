import React, { useState, useCallback, useEffect } from 'react';
import { Upload, X, CheckCircle, FileText, Info } from 'lucide-react';
import { db } from '@/db/schema';
import { useToast } from '@/contexts/ToastContext';
import { DatePicker } from '@/components/ui/DatePicker';
import { todayStr, parseDateStr } from '@/utils/fiscalYear';
import { parsePlanAndOption } from '@/utils/marketService';

interface ImportMarketDataModalProps {
  onClose: () => void;
}

interface MarketMapping {
  scheme_code?: string;
  isin?: string;
  nav?: string;
  scheme_name?: string;
  nav_date?: string;
}

const MARKET_PRIORITIES = {
  scheme_code: [/amfi.*code/i, /scheme.*code/i, /^code$/i, /amfi/i, /^scheme$/i],
  isin: [/(?:growth|payout).*isin/i, /isin.*(?:growth|payout)/i, /^isin.*code/i, /^isin$/i, /isin/i],
  nav: [/net.*asset.*value/i, /nav/i, /close/i, /rate/i, /price/i],
  scheme_name: [/scheme.*name/i, /^name$/i, /scrip.*name/i, /description/i],
  nav_date: [/date/i, /nav.*date/i],
};

function parseMarketFile(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Scheme Code') && lines[i].includes('Net Asset Value')) {
      headerIdx = i;
      break;
    }
  }
  
  if (headerIdx === -1) {
    headerIdx = lines.findIndex(l => l.toLowerCase().includes('scheme code'));
  }
  
  if (headerIdx === -1) {
    headerIdx = lines.findIndex(l => l.includes(';'));
  }
  
  if (headerIdx === -1) {
    throw new Error('Could not find semicolon-separated AMFI NAV headers in the file.');
  }
  
  const headers = lines[headerIdx].split(';').map(h => h.trim());
  const rows: Record<string, string>[] = [];
  
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.split(';');
    if (parts.length < 4) continue;
    
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = parts[idx]?.trim() ?? '';
    });
    rows.push(rowObj);
  }
  
  return { headers, rows };
}

function autoDetectMarketMapping(headers: string[]): MarketMapping {
  const mapping: MarketMapping = {};
  const keys: (keyof MarketMapping)[] = ['scheme_code', 'isin', 'nav', 'scheme_name', 'nav_date'];
    
  for (const key of keys) {
    const rxList = MARKET_PRIORITIES[key];
    let match = '';
    for (const rx of rxList) {
      const found = headers.find(h => rx.test(h));
      if (found) {
        match = found;
        break;
      }
    }
    if (match) {
      mapping[key] = match;
    }
  }
  
  return mapping;
}

export function ImportMarketDataModal({ onClose }: ImportMarketDataModalProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<MarketMapping>({});
  const [marketDataDate, setMarketDataDate] = useState<string>(todayStr());
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFileUpload = useCallback(async (selectedFile: File) => {
    try {
      const text = await selectedFile.text();
      const { headers, rows } = parseMarketFile(text);
      if (rows.length === 0) {
        toast('No valid AMFI data rows found in file.', 'error');
        return;
      }
      setFile(selectedFile);
      setCsvHeaders(headers);
      setCsvRows(rows);
      setMapping(autoDetectMarketMapping(headers));
    } catch (err: any) {
      toast(err.message || 'Failed to read AMFI NAV file.', 'error');
    }
  }, [toast]);

  const parsedValidRows = csvRows.map(r => {
    const schemeCode = mapping.scheme_code ? (r[mapping.scheme_code] || '').trim() : '';
    const isin = mapping.isin ? (r[mapping.isin] || '').trim().toUpperCase() : '';
    const name = mapping.scheme_name ? (r[mapping.scheme_name] || '').trim() : '';
    const navStr = mapping.nav ? (r[mapping.nav] || '').replace(/,/g, '').trim() : '';
    const nav = parseFloat(navStr);

    return {
      schemeCode,
      isin,
      name,
      nav: isNaN(nav) ? null : nav,
    };
  }).filter(r => r.schemeCode && r.nav !== null && r.nav > 0);

  const handleSubmit = async () => {
    if (parsedValidRows.length === 0) {
      toast('No valid NAV entries to import.', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      const now = Date.now();
      const dateMs = parseDateStr(marketDataDate);
      const activeLots = await db.investment_lots.where('status').equals('ACTIVE').toArray();

      const cacheEntries: any[] = [];
      let updatedLotsCount = 0;

      for (const row of parsedValidRows) {
        const navPaise = Math.round(row.nav! * 100);
        const { mfPlan, mfOption } = parsePlanAndOption(row.name);

        cacheEntries.push({
          id: `AMFI:${row.schemeCode}`,
          symbol: `AMFI:${row.schemeCode}`,
          source: 'AMFI',
          nav_paise: navPaise,
          nav_date: dateMs,
          name: row.name,
          created_at: now,
        });

        if (row.isin) {
          cacheEntries.push({
            id: row.isin,
            symbol: row.isin,
            source: 'AMFI',
            nav_paise: navPaise,
            nav_date: dateMs,
            name: row.name,
            created_at: now,
          });
        }

        // Match with lots
        const matchingLots = activeLots.filter(l => {
          const sym = l.symbol.toUpperCase();
          return sym === `AMFI:${row.schemeCode}` || sym === row.schemeCode || (row.isin && l.isin === row.isin);
        });

        for (const lot of matchingLots) {
          await db.investment_lots.update(lot.id, {
            symbol: `AMFI:${row.schemeCode}`,
            name: lot.name || row.name,
            isin: lot.isin || row.isin,
            mf_plan: lot.mf_plan || mfPlan,
            mf_option: lot.mf_option || mfOption,
            updated_at: now,
          });
          updatedLotsCount++;
        }
      }

      await db.market_cache.bulkPut(cacheEntries);
      toast(`Imported ${parsedValidRows.length} NAVs into market cache! (${updatedLotsCount} holdings updated)`, 'success');
      onClose();
    } catch (err: any) {
      toast(err.message || 'Failed to import AMFI NAVs.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal slide-up" style={{ maxWidth: 640, width: '90%' }}>
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 className="modal-title" style={{ margin: 0, fontSize: 16 }}>Import AMFI NAV File</h2>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              Bulk update NAV prices using official AMFI NAVAll.txt file
            </span>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!file ? (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
              }}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.txt,.csv';
                input.onchange = e => {
                  const f = (e.target as HTMLInputElement).files?.[0];
                  if (f) handleFileUpload(f);
                };
                input.click();
              }}
              style={{
                border: `2px dashed ${dragOver ? 'var(--green)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--radius-lg)',
                padding: '36px 20px',
                textAlign: 'center',
                background: dragOver ? 'var(--surface-3)' : 'var(--surface-2)',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <Upload size={32} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                Drag & drop AMFI NAVAll.txt here
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Download directly from <a href="https://portal.amfiindia.com/spages/NAVAll.txt" target="_blank" rel="noreferrer" style={{ color: 'var(--blue)', textDecoration: 'underline' }} onClick={e => e.stopPropagation()}>portal.amfiindia.com/spages/NAVAll.txt</a>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 'var(--radius)' }}>
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-green" />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{file.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>({csvRows.length} lines parsed)</span>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setFile(null)}>Change File</button>
              </div>

              {/* NAV Date */}
              <div className="form-group" style={{ maxWidth: 220 }}>
                <label className="form-label">Valuation Date</label>
                <DatePicker value={marketDataDate} onChange={setMarketDataDate} />
              </div>

              {/* Column Mapping */}
              <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>Column Mapping</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                  {[
                    ['scheme_code', 'Scheme Code *'],
                    ['isin', 'ISIN (Growth / Div)'],
                    ['nav', 'Net Asset Value *'],
                    ['scheme_name', 'Scheme Name'],
                  ].map(([key, label]) => (
                    <div key={key}>
                      <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 2 }}>{label}</label>
                      <select
                        className="form-select"
                        value={mapping[key as keyof MarketMapping] || ''}
                        onChange={e => setMapping(prev => ({ ...prev, [key]: e.target.value }))}
                        style={{ height: 30, fontSize: 11, width: '100%' }}
                      >
                        <option value="">-- None --</option>
                        {csvHeaders.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', marginBottom: 6 }}>
                  {parsedValidRows.length} valid mutual fund NAV records ready to import
                </div>
                <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)' }}>
                  <table className="data-table" style={{ width: '100%', fontSize: 11 }}>
                    <thead>
                      <tr>
                        <th>Scheme Code</th>
                        <th>ISIN</th>
                        <th>Name</th>
                        <th className="r">NAV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedValidRows.slice(0, 30).map((r, i) => (
                        <tr key={i}>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{r.schemeCode}</td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{r.isin || '—'}</td>
                          <td className="truncate" style={{ maxWidth: 220 }}>{r.name || '—'}</td>
                          <td className="r" style={{ fontFamily: 'var(--font-mono)' }}>₹{r.nav?.toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12, marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={isProcessing}>Cancel</button>
          {file && (
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={isProcessing || parsedValidRows.length === 0}
            >
              {isProcessing ? 'Importing…' : `Import ${parsedValidRows.length} NAVs`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
