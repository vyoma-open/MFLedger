import React, { useState } from 'react';
import { X, Download, Calendar } from 'lucide-react';
import { db } from '../db/schema';
import { formatDate, todayStr, parseDateStr } from '../utils/fiscalYear';
import { useToast } from '../contexts/ToastContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { DatePicker } from '@/components/ui/DatePicker';

interface ExportCSVModalProps {
  onClose: () => void;
  accountId?: string;
  accountName?: string;
}

type ExportPeriod = 'current_month' | 'last_3m' | 'current_fy' | 'previous_fy' | 'all' | 'custom';

export function ExportCSVModal({ onClose, accountId, accountName }: ExportCSVModalProps) {
  const { toast } = useToast();
  const [period, setPeriod] = useState<ExportPeriod>('all');
  const [customStart, setCustomStart] = useState(todayStr());
  const [customEnd, setCustomEnd] = useState(todayStr());
  const [exporting, setExporting] = useState(false);

  const accountsList = useLiveQuery(() => db.accounts.toArray(), []);
  const accountMap = new Map(accountsList?.map(a => [a.id, a]) ?? []);

  function getRange(): { startMs: number; endMs: number; label: string } {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let start: Date;
    let end: Date;
    let label: string;

    if (period === 'current_month') {
      start = new Date(currentYear, currentMonth, 1, 0, 0, 0);
      end = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
      label = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    } else if (period === 'last_3m') {
      start = new Date(currentYear, currentMonth - 2, 1, 0, 0, 0);
      end = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
      label = 'Last 3 Months';
    } else if (period === 'current_fy') {
      if (currentMonth >= 3) {
        start = new Date(currentYear, 3, 1, 0, 0, 0);
        end = new Date(currentYear + 1, 2, 31, 23, 59, 59);
      } else {
        start = new Date(currentYear - 1, 3, 1, 0, 0, 0);
        end = new Date(currentYear, 2, 31, 23, 59, 59);
      }
      label = `FY ${start.getFullYear()}-${(start.getFullYear() + 1).toString().slice(2)}`;
    } else if (period === 'previous_fy') {
      if (currentMonth >= 3) {
        start = new Date(currentYear - 1, 3, 1, 0, 0, 0);
        end = new Date(currentYear, 2, 31, 23, 59, 59);
      } else {
        start = new Date(currentYear - 2, 3, 1, 0, 0, 0);
        end = new Date(currentYear - 1, 2, 31, 23, 59, 59);
      }
      label = `Previous FY ${start.getFullYear()}-${(start.getFullYear() + 1).toString().slice(2)}`;
    } else if (period === 'all') {
      start = new Date(2000, 0, 1, 0, 0, 0);
      end = new Date(2099, 11, 31, 23, 59, 59);
      label = 'All Time';
    } else {
      const sDate = parseDateStr(customStart);
      const eDate = parseDateStr(customEnd);
      start = new Date(sDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(eDate);
      end.setHours(23, 59, 59, 999);
      label = `${customStart} to ${customEnd}`;
    }

    return { startMs: start.getTime(), endMs: end.getTime(), label };
  }

  async function handleExport() {
    setExporting(true);
    try {
      const { startMs, endMs, label } = getRange();

      const lotsQuery = accountId
        ? db.investment_lots.where('account_id').equals(accountId)
        : db.investment_lots;
      const lots = await lotsQuery.toArray();
      const lotMap = new Map(lots.map(l => [l.id, l]));

      const buyRows = lots
        .filter(l => l.purchase_date >= startMs && l.purchase_date <= endMs)
        .map(l => {
          const acc = accountMap.get(l.account_id);
          return {
            dateMs: l.purchase_date,
            date: formatDate(l.purchase_date),
            symbol: l.symbol,
            name: l.name || l.symbol,
            type: l.investment_type === 'SIP' ? 'SIP BUY' : 'BUY',
            units: l.units_original.toFixed(3),
            price: (l.purchase_price_paise / 100).toFixed(3),
            total: ((l.units_original * l.purchase_price_paise) / 100).toFixed(2),
            assetClass: l.asset_class,
            planOption: [l.mf_plan, l.mf_option].filter(Boolean).join(' ') || '—',
            isin: l.isin || '—',
            folio: acc?.name || '—',
            notes: '',
          };
        });

      const allEvents = await db.lot_consumption_events.toArray();
      const sellRows = allEvents
        .filter(e => {
          const l = lotMap.get(e.lot_id);
          if (!l) return false;
          if (accountId && l.account_id !== accountId) return false;
          return e.created_at >= startMs && e.created_at <= endMs;
        })
        .map(e => {
          const l = lotMap.get(e.lot_id)!;
          const acc = accountMap.get(l.account_id);
          const gainPaise = e.units_consumed * (e.sale_price_paise - l.purchase_price_paise);
          return {
            dateMs: e.created_at,
            date: formatDate(e.created_at),
            symbol: l.symbol,
            name: l.name || l.symbol,
            type: 'SELL',
            units: e.units_consumed.toFixed(3),
            price: (e.sale_price_paise / 100).toFixed(3),
            total: ((e.units_consumed * e.sale_price_paise) / 100).toFixed(2),
            assetClass: l.asset_class,
            planOption: [l.mf_plan, l.mf_option].filter(Boolean).join(' ') || '—',
            isin: l.isin || '—',
            folio: acc?.name || '—',
            notes: `Realized Gain: ₹${(gainPaise / 100).toFixed(2)}`,
          };
        });

      const combined = [...buyRows, ...sellRows].sort((a, b) => b.dateMs - a.dateMs);

      if (combined.length === 0) {
        toast('No mutual fund transactions found for the selected period.', 'error');
        setExporting(false);
        return;
      }

      const headers = ['Date', 'Type', 'Scheme Symbol', 'Scheme Name', 'Units', 'NAV / Price (INR)', 'Total Amount (INR)', 'Asset Category', 'Plan / Option', 'ISIN', 'Portfolio Account', 'Notes'];
      const rows = combined.map(r => [
        r.date,
        r.type,
        `"${r.symbol.replace(/"/g, '""')}"`,
        `"${r.name.replace(/"/g, '""')}"`,
        r.units,
        r.price,
        r.total,
        r.assetClass,
        `"${r.planOption.replace(/"/g, '""')}"`,
        r.isin,
        `"${r.folio.replace(/"/g, '""')}"`,
        `"${r.notes.replace(/"/g, '""')}"`,
      ]);

      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      const fileName = `mfledger_export_${accountName ? accountName.toLowerCase().replace(/\s+/g, '_') + '_' : ''}${label.toLowerCase().replace(/\s+/g, '_')}.csv`;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast('Mutual Fund CSV export downloaded successfully.', 'success');
      onClose();
    } catch (err: any) {
      toast(err.message || 'Export failed.', 'error');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-fade-in" style={{ maxWidth: 440, width: '90%' }}>
        <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12 }}>
          <div className="flex items-center gap-2">
            <Download size={18} className="text-green" />
            <h2 className="modal-title" style={{ fontSize: 16, fontWeight: 600 }}>Export Portfolio to CSV</h2>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
          {accountName && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Exporting transactions for: <strong style={{ color: 'var(--text-primary)' }}>{accountName}</strong>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Select Date Range</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                ['all', 'All Time'],
                ['current_fy', 'Current FY'],
                ['previous_fy', 'Previous FY'],
                ['last_3m', 'Last 3 Months'],
                ['current_month', 'Current Month'],
                ['custom', 'Custom Range'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`btn btn-sm ${period === key ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: 12, padding: '8px 10px' }}
                  onClick={() => setPeriod(key as ExportPeriod)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {period === 'custom' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: 11 }}>Start Date</label>
                <DatePicker value={customStart} onChange={setCustomStart} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: 11 }}>End Date</label>
                <DatePicker value={customEnd} onChange={setCustomEnd} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={exporting}>Cancel</button>
            <button type="button" className="btn btn-primary flex items-center gap-2" onClick={handleExport} disabled={exporting}>
              <Download size={14} />
              {exporting ? 'Generating…' : 'Download CSV'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
